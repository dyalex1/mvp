// Utilidades SEO y de seguridad de contenido. Sin dependencias.

export const BRAND = "Gasparotto Viajes";
export const LOGO = "/assets/gasparotto-logo-v1.png";

const escAttr = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const siteUrl = (env) => String(env.SITE_URL || "https://gasparottoviajes.com").replace(/\/+$/, "");
export const isProdHost = (env, url) => new URL(siteUrl(env)).host === url.host;
export const absUrl = (env, u) => (!u ? "" : /^https?:\/\//i.test(u) ? u : siteUrl(env) + (u.startsWith("/") ? u : "/" + u));

export const stripTags = (h = "") =>
  String(h).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// Recorta en límite de palabra, para descripciones de ~155 caracteres.
export function clip(s, n = 155) {
  s = stripTags(s);
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > 80 ? cut.slice(0, sp) : cut).replace(/[,.;:\s]+$/, "") + "…";
}

export const pageTitle = (t) => {
  t = String(t || "").trim();
  return /gasparotto/i.test(t) ? t : `${t} | ${BRAND}`;
};

// "R$ 1.234,50" -> "1234.50" · "R$ 445" -> "445" · "R$ 1.234" -> "1234"
export function parsePrice(s) {
  const m = String(s || "").match(/\d[\d.,]*/);
  if (!m) return null;
  let n = m[0];
  if (/,\d{1,2}$/.test(n)) n = n.replace(/\./g, "").replace(",", ".");
  else if (!/^\d+\.\d{1,2}$/.test(n)) n = n.replace(/[.,]/g, "");
  return Number.isFinite(Number(n)) ? n : null;
}

// SQLite guarda "YYYY-MM-DD HH:MM:SS" en UTC.
export const isoDate = (d) => (d ? String(d).replace(" ", "T").replace(/Z?$/, "Z") : undefined);
export const ymd = (d) => String(d || "").slice(0, 10);

// ---------- Sanitizador HTML (allowlist) ----------
const ALLOWED = new Set("p br strong b em i u s h2 h3 h4 ul ol li a img blockquote figure figcaption hr span div table thead tbody tr th td".split(" "));
const VOID = new Set(["br", "img", "hr"]);
const ATTRS = { a: ["href", "title", "target", "rel"], img: ["src", "alt", "title", "width", "height", "loading"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] };

const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16) || 32))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d) || 32))
    .replace(/&colon;/gi, ":")
    .replace(/&(tab|newline);/gi, "")
    .replace(/&amp;/gi, "&");

const safeUrl = (u) => /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(decodeEntities(String(u)).replace(/[\u0000-\u0020]+/g, ""));

export function sanitizeHtml(html = "") {
  const s = String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi, "");
  return s.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_m, close, tag, rest) => {
    tag = tag.toLowerCase();
    if (!ALLOWED.has(tag)) return "";
    if (close) return VOID.has(tag) ? "" : `</${tag}>`;
    const keep = ATTRS[tag] || [];
    let out = "";
    const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let a;
    while ((a = re.exec(rest))) {
      const name = a[1].toLowerCase();
      const val = a[2] ?? a[3] ?? a[4] ?? "";
      if (!keep.includes(name)) continue;
      if ((name === "href" || name === "src") && !safeUrl(val)) continue;
      out += ` ${name}="${val.replace(/"/g, "&quot;")}"`;
    }
    if (tag === "a" && / target="_blank"/.test(out)) out = out.replace(/ rel="[^"]*"/, "") + ' rel="noopener noreferrer"';
    if (tag === "img") {
      if (!/ src="/.test(out)) return ""; // sin src válido no hay imagen
      if (!/ loading=/.test(out)) out += ' loading="lazy"';
    }
    return `<${tag}${out}>`;
  });
}

// ---------- JSON-LD ----------
export const ldScript = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;

export function breadcrumbLd(env, items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absUrl(env, it.path) })),
  };
}

const orgRef = (env) => ({ "@id": `${siteUrl(env)}/#organization` });

export function postLd(env, p, { url, desc, image }) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": url + "#article",
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        headline: String(p.title).slice(0, 110),
        description: desc,
        ...(image ? { image: [image] } : {}),
        datePublished: isoDate(p.created_at),
        dateModified: isoDate(p.updated_at || p.created_at),
        author: orgRef(env),
        publisher: { ...orgRef(env), "@type": "Organization", name: BRAND, logo: { "@type": "ImageObject", url: absUrl(env, LOGO) } },
        inLanguage: p.lang || "pt-BR",
      },
      breadcrumbLd(env, [{ name: "Início", path: "/" }, { name: "Blog", path: "/blog/" }, { name: p.title, path: new URL(url).pathname }]),
    ],
  };
}

export function packageLd(env, p, { url, desc, image, listing }) {
  const price = parsePrice(p.price);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": url + "#product",
        name: p.title,
        description: desc,
        ...(image ? { image: [image] } : {}),
        brand: { "@type": "Brand", name: BRAND },
        url,
        ...(price
          ? { offers: { "@type": "Offer", url, priceCurrency: "BRL", price, availability: "https://schema.org/InStock", seller: orgRef(env) } }
          : {}),
      },
      breadcrumbLd(env, [
        { name: "Início", path: "/" },
        ...(listing ? [{ name: listing.label, path: listing.listing }] : []),
        { name: p.title, path: new URL(url).pathname },
      ]),
    ],
  };
}

// ---------- sitemap.xml / robots.txt ----------
export function buildSitemap(env, entries) {
  const base = siteUrl(env);
  const rows = entries
    .map(({ path, lastmod }) => `  <url><loc>${escAttr(base + path)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`;
}

export function buildRobots(env, prod) {
  if (!prod) return "User-agent: *\nDisallow: /\n";
  return `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /?p=\n\nSitemap: ${siteUrl(env)}/sitemap.xml\n`;
}
