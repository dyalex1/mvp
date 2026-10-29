#!/usr/bin/env python3
"""Download NitroPack-hosted assets into a static Cloudflare Pages build."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import html
import re
import urllib.request
from pathlib import Path
from urllib.parse import urljoin, urlparse


CDN_HOST = "cdn-ileapbh.nitrocdn.com"
ORIGIN_HOST = "aguiarbuenosaires.com"
URL_RE = re.compile(r"""https?://[^\s"'<>\\)]+""")
CSS_URL_RE = re.compile(r"""url\(\s*(['"]?)(.*?)\1\s*\)""", re.IGNORECASE)
TRAILING_PUNCTUATION = ".,;:!?)]}"


def local_asset_path(url: str) -> str:
    parsed = urlparse(url)
    suffix = Path(parsed.path).suffix.lower()
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
    asset_group = "origin" if parsed.hostname == ORIGIN_HOST else "nitro"
    return f"/assets/{asset_group}/{digest}{suffix}"


def is_downloadable_asset(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.hostname == CDN_HOST or (
        parsed.hostname == ORIGIN_HOST and parsed.path.startswith("/wp-content/uploads/")
    )


def fetch_asset(url: str) -> tuple[str, bytes]:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "CloudflarePagesStaticBuilder/1.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError(f"Unexpected HTTP {response.status} for {url}")
        return url, response.read()


def clean_url(raw_url: str) -> tuple[str, str]:
    decoded = html.unescape(raw_url)
    stripped = decoded.rstrip(TRAILING_PUNCTUATION)
    return stripped, decoded[len(stripped) :]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true", help="download and localize NitroPack assets")
    parser.add_argument("--directory", type=Path, default=Path("dist"), help="Cloudflare Pages output directory")
    args = parser.parse_args()
    if not args.download:
        parser.error("--download is required")

    output_dir = args.directory.resolve()
    html_files = sorted(output_dir.rglob("*.html"))
    if not html_files:
        raise SystemExit(f"No HTML files found in {output_dir}")

    asset_urls: set[str] = set()
    for path in html_files:
        for match in URL_RE.finditer(path.read_text(encoding="utf-8", errors="replace")):
            url, _ = clean_url(match.group(0))
            if is_downloadable_asset(url):
                asset_urls.add(url)

    downloaded: dict[str, bytes] = {}
    while asset_urls:
        batch = sorted(asset_urls - downloaded.keys())
        asset_urls.clear()
        if not batch:
            break
        failures: list[tuple[str, Exception]] = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
            futures = {executor.submit(fetch_asset, url): url for url in batch}
            for future in concurrent.futures.as_completed(futures):
                url = futures[future]
                try:
                    downloaded[url] = future.result()[1]
                except Exception as error:
                    failures.append((url, error))
        if failures:
            details = "\n".join(f"  {url}: {error}" for url, error in failures)
            raise SystemExit(f"Failed to download {len(failures)} remote asset(s):\n{details}")

        for url, content in downloaded.items():
            if urlparse(url).path.lower().endswith(".css"):
                css = content.decode("utf-8", errors="replace")
                for match in URL_RE.finditer(css):
                    linked_url, _ = clean_url(match.group(0))
                    if not urlparse(linked_url).scheme:
                        linked_url = urljoin(url, linked_url)
                    if is_downloadable_asset(linked_url) and linked_url not in downloaded:
                        asset_urls.add(linked_url)
                for match in CSS_URL_RE.finditer(css):
                    linked_url = html.unescape(match.group(2).strip())
                    if not linked_url or linked_url.startswith(("data:", "#")):
                        continue
                    linked_url = urljoin(url, linked_url)
                    if is_downloadable_asset(linked_url) and linked_url not in downloaded:
                        asset_urls.add(linked_url)

    def replace_url(raw_url: str) -> str:
        url, suffix = clean_url(raw_url)
        if is_downloadable_asset(url):
            return local_asset_path(url) + suffix
        return raw_url

    assets_dir = output_dir / "assets" / "nitro"
    assets_dir.mkdir(parents=True, exist_ok=True)
    for url, content in downloaded.items():
        target = output_dir / local_asset_path(url).lstrip("/")
        target.parent.mkdir(parents=True, exist_ok=True)
        if urlparse(url).path.lower().endswith(".css"):
            css = content.decode("utf-8", errors="replace")
            css = URL_RE.sub(lambda match: replace_url(match.group(0)), css)

            def replace_css_url(match: re.Match[str]) -> str:
                quote, value = match.groups()
                decoded_value = html.unescape(value.strip())
                if not decoded_value or decoded_value.startswith(("data:", "#")):
                    return match.group(0)
                absolute_url = urljoin(url, decoded_value)
                if not is_downloadable_asset(absolute_url):
                    return match.group(0)
                return f"url({quote}{local_asset_path(absolute_url)}{quote})"

            css = CSS_URL_RE.sub(replace_css_url, css)
            content = css.encode("utf-8")
        target.write_bytes(content)

    for path in html_files:
        original = path.read_text(encoding="utf-8", errors="replace")
        localized = URL_RE.sub(lambda match: replace_url(match.group(0)), original)
        if localized != original:
            path.write_text(localized, encoding="utf-8")

    missing_local_assets: set[str] = set()
    for path in html_files:
        page = path.read_text(encoding="utf-8", errors="replace")
        for attribute in re.findall(
            r"""(?:src|href|srcset|poster)=["']([^"']+)["']""",
            page,
            flags=re.IGNORECASE,
        ):
            for value in re.findall(r"/assets/[^\s,]+", attribute):
                if not (output_dir / value.lstrip("/")).is_file():
                    missing_local_assets.add(value)
    for path in output_dir.rglob("*.css"):
        css = path.read_text(encoding="utf-8", errors="replace")
        for match in CSS_URL_RE.finditer(css):
            value = match.group(2).strip()
            if value.startswith("/assets/") and not (output_dir / value.lstrip("/")).is_file():
                missing_local_assets.add(value)
    if missing_local_assets:
        missing_list = "\n".join(f"  {asset}" for asset in sorted(missing_local_assets))
        raise SystemExit(f"CSS references missing local assets:\n{missing_list}")

    print(f"Downloaded {len(downloaded)} remote assets into {output_dir / 'assets'}")
    print(f"Localized {len(html_files)} HTML pages in {output_dir}")


if __name__ == "__main__":
    main()
