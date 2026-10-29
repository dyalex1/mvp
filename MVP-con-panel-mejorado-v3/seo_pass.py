#!/usr/bin/env python3
"""Pasada SEO sobre dist/ (idempotente: se puede correr después de cada build).

Qué hace:
  - Títulos más descriptivos (<title>, og:title, twitter:title) y alineados con el idioma de cada página.
  - og:image / twitter:image absolutas (las redes no resuelven rutas relativas).
  - og:locale coherente con <html lang>; og:site_name = "Gasparotto Viajes".
  - JSON-LD: logo real (el original apuntaba a /wp-content/ inexistente), redes propias
    (antes apuntaban al Facebook/Instagram de otra marca), TravelAgency con contacto,
    sin SearchAction (el sitio no tiene buscador) y sin typos.
  - Home: el título principal pasa a ser el único <h1> (antes los 3 <h1> eran posts del blog).
  - alt="" explícito en <img> sin atributo alt + reporte CSV de imágenes sin texto alternativo.
  - Genera functions/lib/static-pages.js (lista de URLs + lastmod para /sitemap.xml).

Uso:  python seo_pass.py            (SITE_URL=https://gasparottoviajes.com por defecto)
"""
from __future__ import annotations

import csv
import json
import os
import re
import struct
from pathlib import Path

ROOT = Path(__file__).parent
DIST = ROOT / "dist"
SITE = os.environ.get("SITE_URL", "https://gasparottoviajes.com").rstrip("/")
BRAND = "Gasparotto Viajes"
LOGO_PATH = "/assets/gasparotto-logo-v1.png"
INSTAGRAM = "https://www.instagram.com/gasparottoviajes/"
WHATSAPP = "+5491164199083"
EMAIL = "info@gasparottoviajes.com"

TITLES = {
    "/": "Gasparotto Viajes | Paseos y shows de tango en Buenos Aires",
    "/blog/": "Blog de viagem a Buenos Aires: dicas e roteiros | Gasparotto",
    "/tango-porteno-vip/": "Tango Porteño VIP: show com jantar e open bar | Gasparotto",
    "/madero-tango-black/": "Madero Tango Black: show em Puerto Madero | Gasparotto",
    "/oferta-de-passeios-em-buenos-aires/": "Passeios em Buenos Aires em português | Gasparotto Viajes",
    "/ofertas-de-tangos-em-buenos-aires/": "Ofertas de tango em Buenos Aires: shows com jantar | Gasparotto",
    "/ofertas-viagens-a-buenos-aires/": "Pacotes e ofertas de viagem a Buenos Aires | Gasparotto Viajes",
    "/quem-somos-nossa-agencia/": "Quem somos: agência de turismo em Buenos Aires | Gasparotto",
    "/reservas/": "Como reservar seus passeios em Buenos Aires | Gasparotto",
    "/sunset-navegacao-com-open-bar-pelo-rio-de-la-plata/": "Navegação Sunset com open bar no Río de la Plata | Gasparotto",
    "/transfer-aeroporto-eze-aep/": "Transfer Ezeiza e Aeroparque em Buenos Aires | Gasparotto Viajes",
    "/termos-e-condicoes/": "Termos e condições | Gasparotto Viajes",
}

WEBSITE_DESC = "Passeios, shows de tango e traslados em Buenos Aires para brasileiros"


def png_size(path: Path):
    with path.open("rb") as f:
        head = f.read(24)
    return struct.unpack(">II", head[16:24])


def page_path(file: Path) -> str:
    rel = file.relative_to(DIST).as_posix()
    return "/" if rel == "index.html" else "/" + rel[: -len("index.html")]


def absolutize(url: str) -> str:
    return SITE + url if url.startswith("/") and not url.startswith("//") else url


def fix_jsonld(block: str, lang: str) -> tuple[str, str | None]:
    """Devuelve (json nuevo, dateModified de la WebPage)."""
    data = json.loads(block)
    logo_w, logo_h = png_size(DIST / LOGO_PATH.lstrip("/"))
    modified = None
    nodes = data.get("@graph", [data]) if isinstance(data, dict) else data
    for n in nodes:
        if not isinstance(n, dict):
            continue
        t = n.get("@type")
        types = t if isinstance(t, list) else [t]
        if "WebPage" in types and n.get("dateModified"):
            modified = n["dateModified"]
        if "WebSite" in types:
            n.pop("potentialAction", None)  # no hay buscador en el sitio estático
            n["name"] = BRAND
            n["description"] = WEBSITE_DESC
        if "Organization" in types:
            n["@type"] = ["Organization", "TravelAgency"]
            n["name"] = BRAND
            n["logo"] = {
                "@type": "ImageObject",
                "@id": f"{SITE}/#/schema/logo/image/",
                "url": SITE + LOGO_PATH,
                "contentUrl": SITE + LOGO_PATH,
                "width": logo_w,
                "height": logo_h,
                "caption": BRAND,
            }
            n["image"] = {"@id": f"{SITE}/#/schema/logo/image/"}
            n["sameAs"] = [INSTAGRAM]
            n["telephone"] = WHATSAPP
            n["email"] = EMAIL
            n["areaServed"] = {"@type": "City", "name": "Buenos Aires"}
    out = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return out, modified


def main() -> None:
    files = [p for p in sorted(DIST.rglob("index.html")) if "admin" not in p.relative_to(DIST).parts]
    static_pages: list[tuple[str, str]] = []
    alt_rows: list[tuple[str, str, str]] = []
    report: list[str] = []

    for f in files:
        path = page_path(f)
        h = f.read_text(encoding="utf-8")
        lang = (re.search(r'<html lang="([^"]+)"', h) or [None, "pt-BR"])[1]

        # 1) título
        new_title = TITLES.get(path)
        if new_title:
            h = re.sub(r"<title>.*?</title>", f"<title>{new_title}</title>", h, count=1, flags=re.S)
            h = re.sub(r'(<meta property="og:title" content=")[^"]*(")', rf"\g<1>{new_title}\2", h)
            h = re.sub(r'(<meta name="twitter:title" content=")[^"]*(")', rf"\g<1>{new_title}\2", h)
            if len(new_title) > 65:
                report.append(f"  ! título largo ({len(new_title)}): {path}")

        # 2) og:image / twitter:image absolutas
        h = re.sub(
            r'(<meta (?:property="og:image"|name="twitter:image") content=")(/[^"]*)(")',
            lambda m: m.group(1) + absolutize(m.group(2)) + m.group(3),
            h,
        )
        # 3) locale + site name
        locale = "es_AR" if lang.lower().startswith("es") else "pt_BR"
        h = re.sub(r'(<meta property="og:locale" content=")[^"]*(")', rf"\g<1>{locale}\2", h)
        h = re.sub(r'(<meta property="og:site_name" content=")[^"]*(")', rf"\g<1>{BRAND}\2", h)

        # 4) JSON-LD
        modified = None

        def _ld(m: re.Match) -> str:
            nonlocal modified
            new, mod = fix_jsonld(m.group(2), lang)
            modified = modified or mod
            return m.group(1) + new + m.group(3)

        h = re.sub(r'(<script type="application/ld\+json" class="yoast-schema-graph">)(.*?)(</script>)', _ld, h, flags=re.S)

        # 5) home: un único <h1>
        if path == "/":
            h = h.replace(
                '<h2 class="elementor-heading-title elementor-size-default">Bienvenido a Gasparotto, </h2>',
                '<h1 class="elementor-heading-title elementor-size-default">Bienvenido a Gasparotto, </h1>',
            )
            h = re.sub(
                r'<h1( class="elementor-heading-title[^"]*">)(<a href="/\?p=\d+">.*?</a>)</h1>',
                r"<h3\1\2</h3>",
                h,
            )

        # 6) alt
        h = re.sub(r"<img\b(?![^>]*\balt=)([^>]*)>", r'<img alt=""\1>', h)
        main = re.search(r"<main.*?</main>", h, re.S)
        for im in re.finditer(r"<img\b[^>]*>", main.group(0) if main else ""):
            tag = im.group(0)
            if re.search(r'\balt=""', tag):
                src = (re.search(r'\bsrc="([^"]*)"', tag) or [None, ""])[1]
                if src and not src.startswith("data:"):
                    alt_rows.append((path, src, ""))

        h1s = len(re.findall(r"<h1\b", h))
        if h1s != 1:
            report.append(f"  ! {path}: {h1s} <h1>")

        f.write_text(h, encoding="utf-8")
        static_pages.append((path, (modified or "")[:10]))

    # sitemap de páginas estáticas (lo consume functions/_middleware.js)
    js = "// Generado por seo_pass.py — no editar a mano.\nexport const STATIC_PAGES = [\n"
    js += "".join(f'  ["{p}", "{d}"],\n' for p, d in static_pages)
    js += "];\n"
    (ROOT / "functions" / "lib" / "static-pages.js").write_text(js, encoding="utf-8")

    out = ROOT / "seo-report"
    out.mkdir(exist_ok=True)
    seen = set()
    with (out / "imagenes-sin-alt.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["pagina", "imagen", "alt_sugerido (completar)"])
        for row in alt_rows:
            if row[:2] not in seen:
                seen.add(row[:2])
                w.writerow(row)

    print(f"{len(files)} páginas procesadas · {len(seen)} imágenes sin alt (seo-report/imagenes-sin-alt.csv)")
    print("\n".join(report) or "sin avisos")


if __name__ == "__main__":
    main()
