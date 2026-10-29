# Panel de administración (sin WordPress)

El front (`dist/`) conserva su estética. El panel vive en `/admin/` y usa
Cloudflare Pages Functions + D1 (base de datos) + R2 (imágenes).
Las tablas se crean y migran solas la primera vez que entrás al panel (hacelo una vez después de cada deploy).

## Probar en local (opcional)
```sh
npm install
cp .dev.vars.example .dev.vars     # clave del panel en local
npm run dev                        # http://localhost:8788/admin/
```

## Subir a Cloudflare (una sola vez)
IMPORTANTE: con Functions hay que desplegar con Wrangler o Git; arrastrar la carpeta en el dashboard NO sube las Functions.
```sh
npm install
npx wrangler login
npm run db:create        # copiá el database_id en wrangler.jsonc
npm run r2:create
npm run project:create
npm run secret           # escribí la clave del panel
npm run deploy
```
Entrá a `https://mvp-4xl.pages.dev/admin/`. El número de WhatsApp está en `wrangler.jsonc` (`WHATSAPP_NUMBER`).

### SITE_URL (importante para SEO)
`SITE_URL` en `wrangler.jsonc` es el dominio donde el sitio vive de verdad (hoy `https://gasparottoviajes.com`).
Se usa en canonical, Open Graph, JSON-LD, `sitemap.xml` y `robots.txt`.
En cualquier otro dominio (por ejemplo `mvp-4xl.pages.dev`) el sitio responde `X-Robots-Tag: noindex` y
`robots.txt` con `Disallow: /`, para no competir con el dominio principal.
**Si todavía no conectaste el dominio propio y querés indexar desde `pages.dev`, poné esa URL en `SITE_URL`.**

## Qué hace
- **Blog**: crea/edita/duplica/borra -> `/blog/<slug>/` y aparece en `/blog/`.
- **Paquetes**: crea/edita/duplica/borra -> `/paquetes/<slug>/` y aparece como tarjeta en la página de su categoría.
- **Precios**: edita cada R$/descuento de las páginas existentes (con el texto de contexto) y permite restaurar el original.
- **SEO**: pestaña con el estado de cada entrada (título, descripción, imagen y alt, largo del contenido) y, dentro
  de cada formulario, vista previa de cómo se ve en Google con contadores de caracteres.
- Si la base falla, el sitio se sirve estático como siempre.

## SEO automático en cada entrada publicada
- `<title>`, meta descripción, canonical, Open Graph y Twitter propios (no heredados de `/blog/`).
- JSON-LD: `BlogPosting` (blog) o `Product` + `Offer` en BRL (paquetes), con migas de pan.
- Entra al `sitemap.xml` con fecha de modificación; los borradores no.
- Si cambiás la dirección web (slug), la anterior redirige con 301 a la nueva.
- `/blog/slug` sin barra final redirige a `/blog/slug/` (una sola URL por contenido).
- Las imágenes se achican a 1600 px y se convierten a WebP en el navegador antes de subirlas.
- El HTML del contenido se limpia (sin scripts, estilos ni eventos) al guardar y al mostrar.

## Enlaces viejos de WordPress (`/?p=123`)
Las tarjetas del sitio original enlazaban a `/?p=ID`, que devuelve 404. Ahora esos enlaces van a `/blog/`.
Si recreás un post viejo en el panel, cargá su número en **Avanzado → ID viejo de WordPress** y las tarjetas
viejas pasarán a apuntar a la entrada nueva.

## Seguridad
- Sesión firmada que vence a los 30 días, cookie HttpOnly/Secure/SameSite, freno de intentos y chequeo de origen.
- Subida solo de JPG/PNG/WEBP/GIF/AVIF hasta 8 MB.
- Recomendado: Cloudflare Access sobre `/admin*` y `/api/*` (Zero Trust > Access > Applications > Self-hosted > Allow por email).

## Para escalar
- Categorías: `CATEGORIES` en `functions/lib/html.js`.
- Campos nuevos: `functions/lib/schema.js` (migración) + `schema.sql` + lista de columnas en `functions/api/[[path]].js` + input en `dist/admin/index.html`.

## Cambios de esta versión (login + panel)
- **Login profesional** (tarjeta blanca con logo, campo de clave con botón Ver/Ocultar, errores en línea) con registro de arranque estilo terminal arriba: arranca en ~2 s mostrando cada paso real (`/api/me`, cookie `gv_admin`, D1/R2) y, al enviar la clave, `POST /api/login`, verificación HMAC, sesión firmada y carga de datos. Usa el logo de `/assets/gasparotto-logo-v1.png`.
- **Fix "clave incorrecta"**: el secret `ADMIN_PASSWORD` y la clave tipeada se comparan sin espacios/saltos de línea al borde (un `echo clave | wrangler secret put` guardaba un `\n` y nunca coincidía). La cookie solo lleva `Secure` en https, así que también funciona en `http://localhost`.
- **Si la sesión no se guarda** (cookies bloqueadas) el login lo dice en vez de quedar en blanco.
- **Panel**: menú lateral con logo, pantalla **Inicio** (resumen, accesos rápidos, últimas modificaciones, estado de D1/R2/WhatsApp), listados con miniatura, filtro por categoría, orden (recientes / A-Z / con observaciones SEO) y contador.
- Después de desplegar, si el login sigue rechazando la clave, volvé a cargarla: `npm run secret` y `npm run deploy`.

## Cambios (versión 4): panel más profesional + precios
- **Precios de paquetes**: en la pestaña **Precios** hay una tabla con todos los paquetes creados desde el panel (precio anterior + precio, guardar por fila). En el listado de Paquetes cada tarjeta tiene el botón **💲 Precio** (ventana rápida). También se puede cambiar dentro de Editar.
- Ventanas propias del panel (confirmar borrado, enlaces, texto alternativo de imágenes) en vez de los avisos del navegador.
- Avisos verdes/rojos, indicador "● Sin guardar", tarjeta de guardado fija al editar, cargas con esqueleto, atajo `/` para buscar, aviso de paquetes sin precio en Inicio.

## Cambios (versión 5): destacados, categorías y listados limpios
- **Etiqueta/categoría de paquetes**: el servidor acepta la clave (`tangos`) o la etiqueta (`Tangos`) y normaliza
  antes de guardar. Antes, un valor guardado con otro formato hacía que el paquete no se pudiera editar.
- **Destacados**: casilla "★ Destacado en el inicio" en paquetes y entradas del blog.
  - Paquetes destacados → aparecen en la página de inicio (bloque antes de la sección del blog).
  - Entradas destacadas → reemplazan las tarjetas del blog en el inicio.
  - Si no hay nada destacado, el inicio no muestra ese bloque.
- **Listados limpios**: en las páginas de Tangos, Paseos y Ofertas se quitaron las tarjetas estáticas de prueba
  (Madero Tango Last Minute, Madero Tango Black, Tango Porteño Plateia, etc.). Ahora solo se muestran los paquetes
  creados en el panel, en el lugar marcado por `<!--PANEL:PAQUETES-->`.
  Para repetir la limpieza en un HTML nuevo: `node scripts/limpiar-listados.mjs`.
- **Migración**: la columna `featured` se agrega sola la primera vez que se entra al panel. Para una base nueva usar `schema.sql`.

### Pendiente
- Precios de las páginas estáticas de origen (Tango Porteño VIP, Madero Tango Black, Sunset, Transfer): cargarlos desde Precios.

## Cambios (versión 6): detalles en paquetes y mejoras del blog
- **Paquetes → Qué incluye / detalles**: botones para agregar ítems frecuentes (traslado, desayuno, almuerzo, open bar, guía en portugués…)
  con un toque; tocar otra vez lo quita. Se muestran con ✓ en la página del paquete. Podés escribir ítems propios, una línea cada uno.
- **Blog**: fecha de publicación editable (ordena el listado y se muestra en la entrada), sugerencias de categorías ya usadas,
  botón "Generar resumen desde el contenido" y contador de tiempo de lectura y palabras.
- Migración: las columnas nuevas (`details`, `publish_date`) se agregan solas la primera vez que se entra al panel.

## Cambios (versión 7): programación y entradas relacionadas
- **Programar**: en Blog, una fecha de publicación futura deja la entrada oculta (web, blog, inicio y sitemap) hasta ese día.
  El listado del panel la marca como "programada". La fecha se aplica desde las 00:00 de Buenos Aires.
- **Entradas relacionadas**: al pie de cada entrada se muestran hasta 3 tarjetas. Podés elegirlas en el formulario;
  si no elegís ninguna, se usan las de la misma categoría y, si no hay, las más recientes.
- Migración: la columna `related_ids` se agrega sola al entrar al panel.
- Limitación: la programación es por día, no por hora.
