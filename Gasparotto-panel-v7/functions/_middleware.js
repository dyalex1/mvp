import { CATEGORIES, esc, firstCard, cardRanges, replaceCards, postCard, packageCard, renderPage, waLink, labels } from "./lib/html.js";
import { siteUrl, isProdHost, absUrl, clip, pageTitle, sanitizeHtml, ldScript, postLd, packageLd, buildSitemap, buildRobots, ymd } from "./lib/seo.js";
import { STATIC_PAGES } from "./lib/static-pages.js";

const NO_CACHE = "no-cache, must-revalidate";
// Entradas programadas: visibles desde su fecha (hora de Buenos Aires).
const LIVE = "(publish_date='' OR publish_date<=date('now','-3 hours'))";

// Entradas relacionadas: las elegidas en el panel; si no hay, las de la misma categoría; si no, las más recientes.
async function relatedFor(env, p) {
  const all = (await env.DB.prepare(`SELECT id,slug,title,image,image_alt,category FROM posts WHERE published=1 AND id != ? AND ${LIVE} ORDER BY COALESCE(NULLIF(publish_date,''),created_at) DESC`).bind(p.id).all().catch(() => ({ results: [] }))).results;
  const ids = String(p.related_ids || "").split(",").map(Number).filter(Boolean);
  if (ids.length) return ids.map((i) => all.find((x) => x.id === i)).filter(Boolean).slice(0, 3);
  const same = all.filter((x) => p.category && x.category === p.category);
  return (same.length ? same : all).slice(0, 3);
}
const PANEL_MARK = "<!--PANEL:PAQUETES-->";
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

function postPage(env, shellHtml, p, related = []) {
  const L = labels(shellHtml);
  const canonical = `${siteUrl(env)}/blog/${p.slug}/`;
  const desc = p.seo_description || clip(p.excerpt || p.content);
  const image = absUrl(env, p.image);
  const date = ymd(p.publish_date || p.created_at);
  const body = `<nav class="dyn-bc" aria-label="breadcrumb"><a href="/">${L.home}</a> › <a href="/blog/">${L.blog}</a> › ${esc(p.title)}</nav>
<h1>${esc(p.title)}</h1><p class="dyn-meta"><time datetime="${esc(date)}">${esc(date.split("-").reverse().join("/"))}</time></p>
${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.image_alt || p.title)}" fetchpriority="high">` : ""}
<div class="dyn-body">${sanitizeHtml(p.content)}</div>${related.length ? `<section class="dyn-related" style="margin:48px 0 0;border-top:1px solid #eee;padding-top:24px"><h2 style="font-size:1.4em">${L.lang === "es" ? "Entradas relacionadas" : "Artigos relacionados"}</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;margin-top:16px">${related.map((x) => `<a href="/blog/${esc(x.slug)}/" style="text-decoration:none;color:inherit">${x.image ? `<img src="${esc(x.image)}" alt="${esc(x.image_alt || x.title)}" loading="lazy" style="width:100%;aspect-ratio:2/1;object-fit:cover;border-radius:8px">` : ""}<strong style="display:block;margin-top:8px">${esc(x.title)}</strong></a>`).join("")}</div></section>` : ""}<p><a href="/blog/">${L.back}</a></p>`;
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
${(p.details || "").trim() ? `<ul class="dyn-details" style="list-style:none;padding:0;margin:0 0 20px">${p.details.split("\n").filter(Boolean).map((x) => `<li style="margin:6px 0">✓ ${esc(x)}</li>`).join("")}</ul>` : ""}
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
    const read = async (table, cols, extra = "") => {
      try { return (await env.DB.prepare(`SELECT ${cols} FROM ${table} WHERE published=1${extra}`).all()).results; }
      catch { return (await env.DB.prepare(`SELECT ${cols.replace(", updated_at", "")} FROM ${table} WHERE published=1`).all()).results; }
    };
    try {
      for (const r of await read("posts", "slug, created_at, updated_at", " AND " + LIVE)) {
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
      const live = table === "posts" ? " AND " + LIVE : "";
      const p = await env.DB.prepare(`SELECT * FROM ${table} WHERE slug=? AND published=1${live}`).bind(m[1]).first();
      if (p) return page(render(env, await shell(env, url), p, table === "posts" ? await relatedFor(env, p) : []));
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
    const isHome = pg === "/";
    // Solo se muestra lo que se administra desde el panel: las tarjetas estáticas de prueba se reemplazan.
    const stmts = [env.DB.prepare("SELECT widget_id, html FROM price_overrides WHERE page=?").bind(pg)];
    if (isBlog) stmts.push(env.DB.prepare(`SELECT * FROM posts WHERE published=1 AND ${LIVE} ORDER BY COALESCE(NULLIF(publish_date,''),created_at) DESC, id DESC`));
    else if (isHome) stmts.push(
      env.DB.prepare(`SELECT * FROM posts WHERE published=1 AND featured=1 AND ${LIVE} ORDER BY COALESCE(NULLIF(publish_date,''),created_at) DESC, id DESC`),
      env.DB.prepare("SELECT * FROM packages WHERE published=1 AND featured=1 ORDER BY created_at DESC, id DESC"),
    );
    else if (listing) stmts.push(env.DB.prepare("SELECT * FROM packages WHERE published=1 AND category=? ORDER BY created_at DESC, id DESC").bind(listing[0]));
    const results = await env.DB.batch(stmts);
    const overrides = results[0].results;
    const lg = await env.DB.prepare("SELECT legacy_id, slug FROM posts WHERE legacy_id != '' AND published=1").all().catch(() => ({ results: [] }));
    const legacy = new Map(lg.results.map((r) => [String(r.legacy_id).trim(), r.slug]));

    let text = await res.text();
    if (isBlog) {
      const tpl = firstCard(text, "post");
      const out = tpl && replaceCards(text, cardRanges(text, "post"), results[1].results.map((i) => postCard(tpl.html, i)).join(""));
      if (out) text = out;
    } else if (listing) {
      // Las listas estáticas de prueba se reemplazaron por el marcador: acá va lo que se carga en el panel.
      const tpl = firstCard(text, "package");
      const html = results[1].results.map((i) => packageCard(tpl ? tpl.html : "", i, waLink(env, i.title))).join("");
      if (text.includes(PANEL_MARK)) text = text.replace(PANEL_MARK, html);
      else {
        const out = tpl && replaceCards(text, cardRanges(text, "package"), html);
        if (out) text = out;
      }
    } else if (isHome) {
      // Home: posts destacados reemplazan las tarjetas del blog; paquetes destacados se insertan antes de esa sección.
      const posts = results[1].results, pkgs = results[2].results;
      const ptpl = firstCard(text, "post");
      const out = ptpl && replaceCards(text, cardRanges(text, "post"), posts.map((i) => postCard(ptpl.html, i)).join(""));
      if (out) text = out;
      if (pkgs.length) {
        const ref = await env.ASSETS.fetch(new URL("/ofertas-de-tangos-em-buenos-aires/", url)).then((r) => (r.ok ? r.text() : ""));
        const tpl = firstCard(ref, "package");
        if (tpl) {
          const block = `<div class="dyn-featured" style="display:flex;flex-wrap:wrap;gap:20px;justify-content:center;max-width:1200px;margin:40px auto;padding:0 20px">${pkgs.map((i) => packageCard(tpl.html, i, waLink(env, i.title))).join("")}</div>`;
          const marker = text.indexOf('data-widget_type="loop-grid.post"');
          const sec = marker < 0 ? -1 : text.lastIndexOf("<section", marker);
          if (sec > 0) text = text.slice(0, sec) + block + text.slice(sec);
        }
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
