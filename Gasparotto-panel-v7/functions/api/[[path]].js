import { CATEGORIES, slugify, esc, findPriceWidgets, applyTokens } from "../lib/html.js";

// Acepta la clave ("tangos"), la etiqueta ("Tangos") o variantes con mayúsculas/acentos. Devuelve la clave o null.
const normCategory = (v) => {
  const s = slugify(String(v || ""));
  if (CATEGORIES[s]) return s;
  return Object.keys(CATEGORIES).find((k) => slugify(CATEGORIES[k].label) === s) || null;
};
import { sanitizeHtml, stripTags, siteUrl } from "../lib/seo.js";
import { ensureSchema } from "../lib/schema.js";

const json = (d, s = 200, h = {}) =>
  new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store", ...h } });

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sign(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}
const safeEq = (a, b) => a.length === b.length && [...a].reduce((x, c, i) => x | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

// Sesión firmada con vencimiento (30 días): "exp.firma"
const SESSION_SECS = 60 * 60 * 24 * 30;
async function makeSession(secret) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECS;
  return `${exp}.${await sign(secret, "gv-session." + exp)}`;
}
async function validSession(secret, cookie) {
  const [exp, sig = ""] = cookie.split(".");
  if (!/^\d+$/.test(exp || "") || Number(exp) < Date.now() / 1000) return false;
  return safeEq(sig, await sign(secret, "gv-session." + exp));
}

// Freno básico a fuerza bruta (por isolate; Cloudflare Access es la defensa real)
const attempts = new Map();
const tooMany = (ip) => { const a = (attempts.get(ip) || []).filter((t) => Date.now() - t < 600000); attempts.set(ip, a); return a.length >= 8; };

const TABLES = {
  posts: ["slug", "title", "excerpt", "content", "image", "image_alt", "category", "seo_title", "seo_description", "legacy_id", "published", "featured", "publish_date", "related_ids"],
  packages: ["slug", "title", "category", "price_old", "price", "excerpt", "content", "details", "image", "image_alt", "seo_title", "seo_description", "published", "featured"],
};
const MAX = { title: 200, slug: 80, excerpt: 600, content: 200000, image: 500, image_alt: 200, seo_title: 120, seo_description: 320, category: 60, price_old: 40, price: 40, legacy_id: 20 };
const URL_PREFIX = { posts: "/blog/", packages: "/paquetes/" };
const IMG_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
const MAX_UPLOAD = 8 * 1024 * 1024;

export async function onRequest({ request, env, params }) {
  const url = new URL(request.url);
  const [res, id] = params.path || [];
  const method = request.method;
  if (!env.ADMIN_PASSWORD) return json({ error: "Falta el secret ADMIN_PASSWORD" }, 500);
  // Un secret guardado con salto de línea o espacios al final nunca coincidía con lo tipeado: se normaliza.
  const PW = String(env.ADMIN_PASSWORD).trim();
  const secure = url.protocol === "https:" ? " Secure;" : "";

  // Anti-CSRF: en métodos que modifican, el Origin debe ser este mismo sitio
  if (method !== "GET" && method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== url.host) return json({ error: "Origen no permitido" }, 403);
  }

  if (res === "login" && method === "POST") {
    const ip = request.headers.get("cf-connecting-ip") || "x";
    if (tooMany(ip)) return json({ error: "Demasiados intentos. Probá en 10 minutos." }, 429);
    const body = await request.json().catch(() => ({}));
    const password = String(body.password ?? "").trim();
    const ok = safeEq(await sign(PW, "pw" + password), await sign(PW, "pw" + PW));
    if (!ok) { attempts.get(ip).push(Date.now()); return json({ error: "Clave incorrecta" }, 401); }
    attempts.delete(ip);
    return json({ ok: true }, 200, { "set-cookie": `gv_admin=${await makeSession(PW)}; Path=/; HttpOnly;${secure} SameSite=Strict; Max-Age=${SESSION_SECS}` });
  }
  const cookie = (request.headers.get("cookie") || "").match(/gv_admin=([\w.]+)/)?.[1] || "";
  if (!(await validSession(PW, cookie))) return json({ error: "No autorizado" }, 401);
  if (res === "logout") return json({ ok: true }, 200, { "set-cookie": `gv_admin=; Path=/; HttpOnly;${secure} SameSite=Strict; Max-Age=0` });
  if (res === "me") return json({ ok: true, categories: CATEGORIES, db: !!env.DB, r2: !!env.IMAGES, whatsapp: !!env.WHATSAPP_NUMBER, site: siteUrl(env) });
  if (!env.DB) return json({ error: "D1 no está conectada (binding DB)" }, 500);
  try { await ensureSchema(env.DB); } catch (e) { return json({ error: "No se pudo preparar la base: " + e.message }, 500); }

  // CRUD genérico: posts y packages
  if (TABLES[res]) {
    const cols = TABLES[res];
    const rid = id && /^\d+$/.test(id) ? Number(id) : null;
    if (method === "GET") return json((await env.DB.prepare(`SELECT * FROM ${res} ORDER BY created_at DESC, id DESC`).all()).results);
    if (method === "DELETE" && rid) { await env.DB.prepare(`DELETE FROM ${res} WHERE id=?`).bind(rid).run(); return json({ ok: true }); }
    if (method === "POST" || (method === "PUT" && rid)) {
      const d = await request.json().catch(() => null);
      if (!d) return json({ error: "JSON inválido" }, 400);
      d.title = String(d.title || "").trim();
      d.slug = slugify(d.slug || d.title);
      if (!d.title || !d.slug) return json({ error: "Falta el título" }, 400);
      if (res === "packages") {
        const cat = normCategory(d.category);
        if (!cat) return json({ error: "Categoría inválida. Elegí una de la lista." }, 400);
        d.category = cat;
      }
      d.published = d.published === 0 || d.published === false || d.published === "0" ? 0 : 1;
      d.featured = d.featured === 1 || d.featured === true || d.featured === "1" ? 1 : 0;
      if (res === "posts") {
        d.publish_date = /^\d{4}-\d{2}-\d{2}$/.test(d.publish_date || "") ? d.publish_date : "";
        d.related_ids = String(d.related_ids || "").split(",").map((x) => x.trim()).filter((x) => /^\d+$/.test(x) && x !== String(rid)).slice(0, 3).join(",");
      }
      if (res === "packages") d.details = String(d.details || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 30).join("\n");
      for (const c of cols) if (typeof d[c] === "string" && d[c].length > (MAX[c] || 1000)) return json({ error: `El campo "${c}" es demasiado largo` }, 400);
      d.content = sanitizeHtml(d.content || "");
      for (const c of ["excerpt", "seo_title", "seo_description", "image_alt"]) if (d[c]) d[c] = stripTags(d[c]);
      if (d.legacy_id) d.legacy_id = String(d.legacy_id).replace(/\D/g, "");
      d.image = String(d.image || "").trim();
      if (d.image && !/^(https:\/\/|\/media\/|\/assets\/)/i.test(d.image)) return json({ error: "La imagen debe ser una URL https o una imagen subida desde el panel." }, 400);
      const vals = cols.map((c) => (d[c] == null ? "" : typeof d[c] === "number" ? d[c] : String(d[c])));
      let newId = rid;
      try {
        if (method === "POST") newId = (await env.DB.prepare(`INSERT INTO ${res} (${cols}) VALUES (${cols.map(() => "?")})`).bind(...vals).run()).meta?.last_row_id;
        else {
          const old = await env.DB.prepare(`SELECT slug FROM ${res} WHERE id=?`).bind(rid).first();
          if (!old) return json({ error: "No existe" }, 404);
          await env.DB.prepare(`UPDATE ${res} SET ${cols.map((c) => c + "=?")}, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...vals, rid).run();
          // Si cambió el slug, la URL vieja redirige (301) a la nueva: no se pierde el posicionamiento ni los enlaces.
          if (old.slug !== d.slug) {
            const oldPath = URL_PREFIX[res] + old.slug + "/", newPath = URL_PREFIX[res] + d.slug + "/";
            await env.DB.batch([
              env.DB.prepare("DELETE FROM redirects WHERE from_path=?").bind(newPath),
              env.DB.prepare("UPDATE redirects SET to_path=? WHERE to_path=?").bind(newPath, oldPath),
              env.DB.prepare("INSERT OR REPLACE INTO redirects (from_path, to_path) VALUES (?, ?)").bind(oldPath, newPath),
            ]);
          }
        }
      } catch (e) {
        if (/UNIQUE/i.test(e.message)) return json({ error: "Ya existe una entrada con ese slug. Cambiá el título o el slug." }, 409);
        return json({ error: "Error de base de datos: " + e.message }, 500);
      }
      return json({ ok: true, id: newId, slug: d.slug, url: URL_PREFIX[res] + d.slug + "/" });
    }
  }

  // Precios de páginas existentes
  if (res === "prices") {
    const getRaw = async (page) => {
      if (!/^\/[\w\-\/]*$/.test(page)) return null;
      const r = await env.ASSETS.fetch(new URL(page.endsWith("/") ? page : page + "/", url));
      return r.ok ? r.text() : null;
    };
    if (method === "GET") {
      const page = url.searchParams.get("page") || "/";
      const raw = await getRaw(page);
      if (raw == null) return json({ error: "Página no encontrada" }, 404);
      const ov = (await env.DB.prepare("SELECT widget_id FROM price_overrides WHERE page=?").bind(page).all()).results.map((r) => r.widget_id);
      return json(findPriceWidgets(raw).map((w) => ({ id: w.id, tokens: w.tokens, edited: ov.includes(w.id), preview: stripTags(w.inner).slice(0, 140) })));
    }
    if (method === "DELETE") {
      const page = url.searchParams.get("page") || "", widget = url.searchParams.get("widget_id") || "";
      await env.DB.prepare("DELETE FROM price_overrides WHERE page=? AND widget_id=?").bind(page, widget).run();
      return json({ ok: true });
    }
    if (method === "PUT") {
      const { page, widget_id, values } = await request.json().catch(() => ({}));
      const raw = await getRaw(page || "");
      const w = raw && findPriceWidgets(raw).find((x) => x.id === widget_id);
      if (!w || !Array.isArray(values)) return json({ error: "Widget no encontrado" }, 404);
      const html = applyTokens(w.inner, values.map((v) => esc(String(v).trim())));
      if (html === w.inner) await env.DB.prepare("DELETE FROM price_overrides WHERE page=? AND widget_id=?").bind(page, widget_id).run();
      else await env.DB.prepare("INSERT OR REPLACE INTO price_overrides (page, widget_id, html) VALUES (?,?,?)").bind(page, widget_id, html).run();
      return json({ ok: true });
    }
  }

  // Subida de imágenes a R2 (solo formatos seguros; sin SVG)
  if (res === "upload" && method === "POST") {
    if (!env.IMAGES) return json({ error: "R2 no está conectado (binding IMAGES). Pegá una URL de imagen." }, 500);
    const type = (request.headers.get("content-type") || "").split(";")[0].trim();
    const ext = IMG_TYPES[type];
    if (!ext) return json({ error: "Formato no permitido. Usá JPG, PNG, WEBP, GIF o AVIF." }, 415);
    const len = Number(request.headers.get("content-length") || 0);
    if (!len || len > MAX_UPLOAD) return json({ error: "La imagen debe pesar menos de 8 MB." }, 413);
    const key = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    await env.IMAGES.put(key, request.body, { httpMetadata: { contentType: type } });
    return json({ url: `/media/${key}` });
  }
  return json({ error: "Not found" }, 404);
}
