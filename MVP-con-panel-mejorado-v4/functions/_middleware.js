import { CATEGORIES, esc, firstCard, postCard, packageCard, renderPage, waLink, labels } from "./lib/html.js";
import { siteUrl, isProdHost, absUrl, clip, pageTitle, sanitizeHtml, ldScript, postLd, packageLd, buildSitemap, buildRobots, ymd } from "./lib/seo.js";
import { STATIC_PAGES } from "./lib/static-pages.js";

const NO_CACHE = "no-cache, must-revalidate";
const page = (body, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": NO_CACHE } });

const shell = async (env, url) => (await env.ASSETS.fetch(new URL("/blog/", url))).text();
const withSlash = (p) => (p.endsWith("/") ? p : p + "/");

// En cualquier host que no sea el del sitio (p. ej. *.pages.dev) se pide no indexar: evita contenido duplicado.
export async function onRequest(ctx) {
  const res = await handle(ctx);
  if (isProdHost(ctx.env, new URL(ctx.request.url))) return res;
  const out = new Response(res.body, res);
  out.headers.set("x-robots-tag", "noindex, nofollow");
  return out;
}

// Los enlaces viejos de WordPress (/?p=ID) ya no existen: apuntan al post nuevo si se cargó su "ID viejo" en el panel,
// o al listado del blog. Así no quedan enlaces internos rotos.
function rewriteLegacy(rw, legacy) {
  return rw.on('a[href^="/?p="]', {
    element(e) {
      const id = (e.getAttribute("href") || "").match(/p=(\d+)/)?.[1];
      const slug = id && legacy.get(id);
      e.setAttribute("href", slug ? `/blog/${slug}/` : "/blog/");
    },
  });
}

function postPage(env, shellHtml, p) {
  const L = labels(shellHtml);
  const canonical = `${siteUrl(env)}/blog/${p.slug}/`;
  const desc = p.seo_description || clip(p.excerpt || p.content);
  const image = absUrl(env, p.image);
  const date = ymd(p.created_at);
  const body = `<nav class="dyn-bc" aria-label="breadcrumb"><a href="/">${L.home}</a> › <a href="/blog/">${L.blog}</a> › ${esc(p.title)}</nav>
<h1>${esc(p.title)}</h1><p class="dyn-meta"><time datetime="${esc(date)}">${esc(date.split("-").reverse().join("/"))}</time></p>
${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.image_alt || p.title)}" fetchpriority="high">` : ""}
<div class="dyn-body">${sanitizeHtml(p.content)}</div><p><a href="/blog/">${L.back}</a></p>`;
  return renderPage(shellHtml, {
    title: pageTitle(p.seo_title || p.title),
    desc,
    body,
    canonical,
    image,
    ogType: "article",
    ld: ldScript(postLd(env, { ...p, lang: L.lang }, { url: canonical, desc, image })),
  });
}

function packagePage(env, shellHtml, p) {
  const L = labels(shellHtml);
  const cat = CATEGORIES[p.category];
  const canonical = `${siteUrl(env)}/paquetes/${p.slug}/`;
  const desc = p.seo_description || clip(p.excerpt || p.content);
  const image = absUrl(env, p.image);
  const wa = waLink(env, p.title);
  const body = `<nav class="dyn-bc" aria-label="breadcrumb"><a href="/">${L.home}</a> › ${cat ? `<a href="${esc(cat.listing)}">${esc(cat.label)}</a> › ` : ""}${esc(p.title)}</nav>
<h1>${esc(p.title)}</h1>
${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.image_alt || p.title)}" fetchpriority="high">` : ""}
<div class="dyn-price">${p.price_old ? `<s style="color:#9e9a96">${esc(p.price_old)}</s> ` : ""}<strong style="color:#ee964b">${esc(p.price)}</strong></div>
<div class="dyn-body">${p.content ? sanitizeHtml(p.content) : esc(p.excerpt)}</div>
<p><a class="elementor-button elementor-button-link elementor-size-sm" href="${esc(wa)}" target="_blank" rel="noopener"><span class="elementor-button-content-wrapper"><span class="elementor-button-text">${L.book.replace(">", "&gt;")}</span></span></a></p>`;
  return renderPage(shellHtml, {
    title: pageTitle(p.seo_title || p.title),
    desc,
    body,
    canonical,
    image,
    ogType: "website",
    ld: ldScript(packageLd(env, p, { url: canonical, desc, image, listing: cat })),
  });
}

async function sitemap(env) {
  const lastmod = new Map(STATIC_PAGES);
  const bump = (path, d) => {
    d = ymd(d);
    if (d && (!lastmod.get(path) || d > lastmod.get(path))) lastmod.set(path, d);
  };
  const dynamic = [];
  if (env.DB) {
    const read = async (table, cols) => {
      try { return (await env.DB.prepare(`SELECT ${cols} FROM ${table} WHERE published=1`).all()).results; }
      catch { return (await env.DB.prepare(`SELECT ${cols.replace(", updated_at", "")} FROM ${table} WHERE published=1`).all()).results; }
    };
    try {
      for (const r of await read("posts", "slug, created_at, updated_at")) {
        const d = r.updated_at || r.created_at;
        dynamic.push({ path: `/blog/${r.slug}/`, lastmod: ymd(d) });
        bump("/blog/", d);
      }
      for (const r of await read("packages", "slug, category, created_at, updated_at")) {
        const d = r.updated_at || r.created_at;
        dynamic.push({ path: `/paquetes/${r.slug}/`, lastmod: ymd(d) });
        if (CATEGORIES[r.category]) bump(CATEGORIES[r.category].listing, d);
      }
    } catch { /* base aún sin crear: solo páginas estáticas */ }
  }
  const entries = [...lastmod].map(([path, d]) => ({ path, lastmod: d })).sort((a, b) => (a.path === "/" ? -1 : b.path === "/" ? 1 : 0));
  return new Response(buildSitemap(env, [...entries, ...dynamic]), {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}

async function handle({ request, env, next }) {
  const url = new URL(request.url);
  const path = url.pathname;

  // URLs viejas de WordPress (/?p=ID) -> 404
  if (path === "/" && url.searchParams.has("p")) {
    const r = await env.ASSETS.fetch(new URL("/404.html", url));
    return new Response(r.body, { status: 404, headers: r.headers });
  }
  if (path === "/robots.txt")
    return new Response(buildRobots(env, isProdHost(env, url)), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
  if (path === "/sitemap.xml") return sitemap(env);
  if (path.startsWith("/api/") || path.startsWith("/admin")) return next();

  // Imágenes subidas desde el panel (R2)
  if (path.startsWith("/media/")) {
    if (!env.IMAGES) return new Response("Not found", { status: 404 });
    const obj = await env.IMAGES.get(decodeURIComponent(path.slice(7)));
    if (!obj) return new Response("Not found", { status: 404 });
    return new Response(obj.body, {
      headers: { "content-type": obj.httpMetadata?.contentType || "application/octet-stream", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
    });
  }

  // /blog/slug -> /blog/slug/ (una sola URL por contenido)
  if (/^\/(blog|paquetes)\/[^/.]+$/.test(path)) return Response.redirect(url.origin + path + "/" + url.search, 301);

  const last = path.split("/").pop();
  const maybeHtml = path.endsWith("/") || !last.includes(".") || last.endsWith(".html");
  if (!maybeHtml) return next();

  let res;
  const noDb = async () => {
    res = await next();
    const isHtml = res.status === 200 && (res.headers.get("content-type") || "").includes("text/html");
    return isHtml ? rewriteLegacy(new HTMLRewriter(), new Map()).transform(res) : res;
  };
  if (!env.DB) return noDb();

  try {
    // Páginas dinámicas: /blog/<slug>/ y /paquetes/<slug>/
    for (const [re, table, render] of [
      [/^\/blog\/([^/]+)\/$/, "posts", postPage],
      [/^\/paquetes\/([^/]+)\/$/, "packages", packagePage],
    ]) {
      const m = path.match(re);
      if (!m) continue;
      const p = await env.DB.prepare(`SELECT * FROM ${table} WHERE slug=? AND published=1`).bind(m[1]).first();
      if (p) return page(render(env, await shell(env, url), p));
      // Slug cambiado desde el panel -> 301 al nuevo
      const rd = await env.DB.prepare("SELECT to_path FROM redirects WHERE from_path=?").bind(path).first();
      if (rd) return Response.redirect(url.origin + rd.to_path, 301);
    }

    // Páginas estáticas: evitar 304 (el HTML cambia según la base) y consultar cambios
    const h = new Headers(request.headers);
    h.delete("if-none-match"); h.delete("if-modified-since");
    res = await next(new Request(request, { headers: h }));
    if (res.status !== 200 || !(res.headers.get("content-type") || "").includes("text/html")) return res;

    const pg = withSlash(path);
    const listing = Object.entries(CATEGORIES).find(([, c]) => c.listing === pg);
    const isBlog = pg === "/blog/";
    const stmts = [env.DB.prepare("SELECT widget_id, html FROM price_overrides WHERE page=?").bind(pg)];
    if (isBlog) stmts.push(env.DB.prepare("SELECT * FROM posts WHERE published=1 ORDER BY created_at DESC, id DESC"));
    else if (listing) stmts.push(env.DB.prepare("SELECT * FROM packages WHERE published=1 AND category=? ORDER BY created_at DESC, id DESC").bind(listing[0]));
    const [[ov, it], lg] = await Promise.all([
      env.DB.batch(stmts),
      // columna nueva: si la base aún no se migró, se ignora sin romper la página
      env.DB.prepare("SELECT legacy_id, slug FROM posts WHERE legacy_id != '' AND published=1").all().catch(() => ({ results: [] })),
    ]);
    const overrides = ov.results, items = it ? it.results : [];
    const legacy = new Map(lg.results.map((r) => [String(r.legacy_id).trim(), r.slug]));

    let text = await res.text();
    if (items.length) {
      const card = firstCard(text, isBlog ? "post" : "package");
      if (card) {
        const make = isBlog ? (i) => postCard(card.html, i) : (i) => packageCard(card.html, i, waLink(env, i.title));
        text = text.slice(0, card.start) + items.map(make).join("") + text.slice(card.start);
      }
    }
    const headers = new Headers(res.headers);
    ["content-length", "content-encoding", "etag", "last-modified"].forEach((k) => headers.delete(k));
    headers.set("cache-control", NO_CACHE);
    let rw = rewriteLegacy(new HTMLRewriter(), legacy);
    for (const o of overrides)
      if (/^\w+$/.test(o.widget_id))
        rw = rw.on(`div[data-id="${o.widget_id}"] > .elementor-widget-container`, { element: (e) => e.setInnerContent(o.html, { html: true }) });
    return rw.transform(new Response(text, { status: 200, headers }));
  } catch (e) {
    // Cualquier fallo (tablas aún sin crear, D1 caída): se sirve el sitio estático tal cual
    return res && res.bodyUsed === false ? res : next();
  }
}
