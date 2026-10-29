// Utilidades HTML compartidas. Sin dependencias.

export const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const slugify = (s = "") =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

// Categorías de paquetes -> página de listado existente donde se inyectan las tarjetas.
export const CATEGORIES = {
  tangos: { label: "Tangos", listing: "/ofertas-de-tangos-em-buenos-aires/" },
  passeios: { label: "Paseos", listing: "/oferta-de-passeios-em-buenos-aires/" },
  ofertas: { label: "Ofertas de viaje", listing: "/ofertas-viagens-a-buenos-aires/" },
};

// Dado el índice del "<div" de apertura, devuelve el índice justo después de su "</div>" de cierre.
export function balancedEnd(html, start) {
  const re = /<(\/?)div\b/gi;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.indexOf(">", m.index) + 1;
  }
  return -1;
}

const mainRange = (html) => {
  const s = html.indexOf("<main"), e = html.indexOf("</main>");
  return s < 0 || e < 0 ? null : [s, e];
};

// Widgets de texto dentro de <main> que contienen precios o descuentos.
export const TOKEN_RE = /R\$\s?[\d.,]+|Desconto\s\d+%/g;
export function findPriceWidgets(html) {
  const r = mainRange(html);
  if (!r) return [];
  const out = [];
  const re = /<div class="elementor-element[^"]*"\s+data-id="(\w+)"[^>]*data-widget_type="text-editor\.default"[^>]*>\s*<div class="elementor-widget-container">/g;
  re.lastIndex = r[0];
  let m;
  while ((m = re.exec(html)) && m.index < r[1]) {
    const innerStart = m.index + m[0].length;
    const cStart = m.index + m[0].lastIndexOf('<div class="elementor-widget-container">');
    const cEnd = balancedEnd(html, cStart);
    const inner = html.slice(innerStart, cEnd - "</div>".length);
    const tokens = inner.match(TOKEN_RE);
    if (tokens && /R\$/.test(inner)) out.push({ id: m[1], inner, tokens });
  }
  return out;
}

export function applyTokens(inner, values) {
  let i = 0;
  return inner.replace(TOKEN_RE, (t) => (values[i] !== undefined ? values[i++] : (i++, t)));
}

// Clona un bloque existente del sitio (para conservar 100% la estética).
export function firstCard(html, kind) {
  const r = mainRange(html);
  if (!r) return null;
  if (kind === "post") {
    const start = html.indexOf('<div data-elementor-type="loop-item"', r[0]);
    if (start < 0 || start > r[1]) return null;
    const end = balancedEnd(html, start);
    const card = html.slice(start, end);
    return /<img\b/.test(card) && /<h3[^>]*>\s*<a/.test(card) ? { start, end, html: card } : null;
  }
  // Paquete: el contenedor más cercano alrededor del primer precio que tenga imagen y título
  const p = html.indexOf("R$", r[0]);
  if (p < 0 || p > r[1]) return null;
  const starts = [];
  const re = /<div class="elementor-element[^"]*\be-con\b[^"]*"/g;
  let m;
  while ((m = re.exec(html)) && m.index < p) starts.push(m.index);
  for (let k = starts.length - 1; k >= 0; k--) {
    const end = balancedEnd(html, starts[k]);
    if (end <= p) continue;
    const card = html.slice(starts[k], end);
    if (card.length > 20000) return null;
    if (/<img\b/.test(card) && /<h[23]/.test(card)) return { start: starts[k], end, html: card };
  }
  return null;
}

let uid = 0;
const unique = (h) => h.replace(/data-id="\w+"/g, () => `data-id="dyn${Date.now().toString(36)}${uid++}"`);

const widgetInner = (card, cls, fn) =>
  card.replace(new RegExp(`(${cls}[^>]*>\\s*<div class="elementor-widget-container">)([\\s\\S]*?)(</div>)`), (_, a, b, c) => a + fn(b) + c);

export function postCard(tpl, p) {
  const href = `/blog/${p.slug}/`;
  const date = (p.created_at || "").slice(0, 10).split("-").reverse().join(".");
  let c = tpl.replace(/href="\/\?p=\d+"/g, `href="${href}"`);
  c = c.replace(/<img\b[^>]*>/, `<img loading="lazy" alt="${esc(p.title)}" src="${esc(p.image)}" style="width:100%;height:auto;aspect-ratio:2/1;object-fit:cover" />`);
  c = c.replace(/<time>[^<]*<\/time>/, `<time>${esc(date)}</time>`);
  c = c.replace(/(<h3[^>]*><a[^>]*>)[\s\S]*?(<\/a>)/, `$1${esc(p.title)}$2`);
  c = widgetInner(c, "post-loop-excerpt-text", () => " " + esc(p.excerpt) + " ");
  c = c.replace(/(elementor-post-info__terms-list">)[\s\S]*?(<\/span>)/, `$1<a href="/blog/">${esc(p.category || "Blog")}</a>$2`);
  return unique(c);
}

export function waLink(env, title) {
  return env.WHATSAPP_NUMBER ? `https://wa.me/${env.WHATSAPP_NUMBER}?text=${encodeURIComponent("Hola, me interesa " + title)}` : "/reservas";
}

// Edita el interior de cada widget de texto de una tarjeta, respetando divs anidados.
function editTextWidgets(card, fn) {
  const re = /<div class="elementor-element[^"]*"\s+data-id="\w+"[^>]*data-widget_type="text-editor\.default"[^>]*>\s*<div class="elementor-widget-container">/g;
  const hits = [];
  let m;
  while ((m = re.exec(card))) {
    const innerStart = m.index + m[0].length;
    const cStart = m.index + m[0].lastIndexOf('<div class="elementor-widget-container">');
    hits.push([innerStart, balancedEnd(card, cStart) - "</div>".length]);
  }
  for (const [a, b] of hits.reverse()) card = card.slice(0, a) + fn(card.slice(a, b)) + card.slice(b);
  return card;
}

export function packageCard(tpl, p, wa = "/reservas") {
  const href = `/paquetes/${p.slug}/`;
  let c = tpl.replace(/(<a\b[^>]*?)href="(?!https?:)[^"]*"/g, `$1href="${href}"`);
  c = c.replace(/href="https:\/\/wa\.me[^"]*"/g, `href="${esc(wa)}"`);
  const linked = /<a\b[^>]*>\s*<img\b/.test(c);
  const img = `<img loading="lazy" alt="${esc(p.title)}" src="${esc(p.image)}" style="width:100%;height:auto;aspect-ratio:3/2;object-fit:cover" />`;
  c = c.replace(/<img\b[^>]*>/, linked ? img : `<a href="${href}">${img}</a>`);
  let n = 0;
  c = c.replace(/(<h[23][^>]*>)([\s\S]*?)(<\/h[23]>)/g, (_, a, inner, z) =>
    a + (n++ > 0 ? "" : /<a\b/.test(inner) ? inner.replace(/(<a[^>]*>)[\s\S]*?(<\/a>)/, `$1${esc(p.title)}$2`) : `<a href="${href}" style="color:inherit">${esc(p.title)}</a>`) + z);
  c = editTextWidgets(c, (inner) => {
    if (/R\$/.test(inner))
      return (p.price_old ? `<span style="color:#9e9a96;text-decoration:line-through">${esc(p.price_old)}</span> ` : "") + `<span style="color:#ee964b">${esc(p.price)}</span>`;
    return inner.replace(/<[^>]*>/g, "").trim().length > 60 ? esc(p.excerpt) : "";
  });
  return unique(c);
}

// Páginas nuevas: se reutiliza <head>+header+footer de una página real y solo se cambia <main>.
// Del <head> original se descartan título, canonical, meta de descripción/OG/Twitter/robots y el JSON-LD
// (describen la página /blog/, no la nueva) y se reemplazan por los de la página nueva.
export function renderPage(shellHtml, { title, desc = "", body, canonical = "", image = "", ogType = "website", ld = "" }) {
  const r = mainRange(shellHtml);
  let head = shellHtml.slice(0, r[0]), tail = shellHtml.slice(r[1] + 7);
  const lang = (head.match(/<html[^>]*\blang="([^"]+)"/) || [])[1] || "pt-BR";
  const locale = /^es/i.test(lang) ? "es_AR" : lang.replace("-", "_");
  head = head
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<link rel=["'](?:canonical|alternate|shortlink|prev|next)["'][^>]*>/gi, "")
    .replace(/<meta (?:name|property)=["'](?:description|robots|og:[^"']*|twitter:[^"']*)["'][^>]*>/gi, "")
    .replace(/<script type="application\/ld\+json"[\s\S]*?<\/script>/gi, "");
  const t = esc(title), d = esc(desc);
  const tags = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">`,
    canonical && `<link rel="canonical" href="${esc(canonical)}">`,
    `<meta property="og:locale" content="${locale}">`,
    `<meta property="og:type" content="${ogType}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    canonical && `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:site_name" content="Gasparotto Viajes">`,
    image && `<meta property="og:image" content="${esc(image)}">`,
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    image && `<meta name="twitter:image" content="${esc(image)}">`,
    ld,
  ].filter(Boolean).join("\n");
  head = head.replace(/<\/head>/i, tags + "\n</head>");
  const css = `<style>.dyn{max-width:860px;margin:0 auto;padding:40px 20px 60px}.dyn img{max-width:100%;height:auto;border-radius:8px}.dyn h1{margin:.4em 0}.dyn h2{margin:1.4em 0 .4em}.dyn .dyn-price{font-size:1.6em;margin:.4em 0 1em}.dyn .dyn-body{line-height:1.7}.dyn .dyn-bc{font-size:.85em;color:#6b7280;margin-bottom:12px}.dyn .dyn-bc a{color:inherit}.dyn .dyn-meta{color:#6b7280;font-size:.9em}</style>`;
  return `${head}<main id="content" class="site-main"><div class="page-content">${css}<div class="dyn">${body}</div></div></main>${tail}`;
}

// Etiquetas según el idioma de la página base (<html lang>).
export function labels(shellHtml) {
  const es = /<html[^>]*\blang="es/i.test(shellHtml);
  return es
    ? { home: "Inicio", blog: "Blog", back: "← Volver al blog", book: "Reservar ahora >", lang: "es" }
    : { home: "Início", blog: "Blog", back: "← Voltar ao blog", book: "Reservar agora >", lang: "pt-BR" };
}
