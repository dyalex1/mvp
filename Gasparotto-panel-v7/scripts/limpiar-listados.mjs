// Limpieza one-time de los listados de paquetes: quita las tarjetas estáticas de prueba (de otra fuente)
// y deja un marcador <!--PANEL:PAQUETES--> donde el panel inserta los paquetes administrados.
// Uso: node scripts/limpiar-listados.mjs   (idempotente: si ya está el marcador, no hace nada)
import fs from "fs";
import { balancedEnd } from "../functions/lib/html.js";

const PAGES = [
  "dist/ofertas-de-tangos-em-buenos-aires/index.html",
  "dist/oferta-de-passeios-em-buenos-aires/index.html",
  "dist/ofertas-viagens-a-buenos-aires/index.html",
];
const MARK = "<!--PANEL:PAQUETES-->";

// Corta en el nivel de hermanos: recorre <div> desde el inicio de la fila de tarjetas y se detiene
// cuando el bloque que contiene el último precio queda cerrado. Así el HTML resultante sigue balanceado.
function cleanPage(html) {
  if (html.includes(MARK)) return { html, changed: false };
  const ms = html.indexOf("<main"), me = html.indexOf("</main>");
  if (ms < 0 || me < 0) return { html, changed: false };
  let first = -1, last = -1, m;
  const priceRe = /R\$/g;
  priceRe.lastIndex = ms;
  while ((m = priceRe.exec(html)) && m.index < me) {
    if (first < 0) first = m.index;
    last = m.index;
  }
  if (first < 0) return { html, changed: false };
  // Inicio: el contenedor de primer nivel de la fila que contiene el primer precio
  let a = html.lastIndexOf('<div class="elementor-element', first);
  const row = html.lastIndexOf("e-con-boxed", first);
  if (row > ms) a = html.lastIndexOf('<div class="elementor-element', row);
  if (a < ms) return { html, changed: false };
  // Fin: recorrer hermanos consecutivos hasta cerrar el bloque que contiene el último precio
  const tok = /<(\/?)div\b/g;
  tok.lastIndex = a;
  let depth = 0, b = -1, t;
  while ((t = tok.exec(html)) && t.index < me) {
    if (t[1]) {
      depth--;
      if (depth < 0) break;
      if (depth === 0) {
        const end = html.indexOf(">", t.index) + 1;
        if (end > last) { b = end; break; }
      }
    } else depth++;
  }
  if (b < 0) return { html, changed: false };
  return { html: html.slice(0, a) + MARK + html.slice(b), changed: true, removed: b - a };
}

for (const f of PAGES) {
  const src = fs.readFileSync(f, "utf8");
  const { html, changed, removed } = cleanPage(src);
  if (changed) {
    fs.writeFileSync(f, html, "utf8");
    console.log(`${f}: quitados ${removed} caracteres de tarjetas estáticas`);
  } else console.log(`${f}: sin cambios`);
}
