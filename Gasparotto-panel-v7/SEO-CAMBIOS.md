# Mejoras SEO — resumen y pendientes

## Problemas que había y ya están corregidos
1. **Sin `sitemap.xml` ni `robots.txt`** → ahora se generan solos (incluyen blog y paquetes del panel).
2. **Enlaces internos rotos**: ~35 enlaces `/?p=ID` (home, blog, paseos, tangos, reservas) devolvían 404 → ahora van a `/blog/` o al post nuevo (ID viejo).
3. **Páginas del panel sin SEO**: las entradas y paquetes nuevos perdían canonical, Open Graph y heredaban el JSON-LD de `/blog/` → ahora cada una tiene el suyo.
4. **JSON-LD con datos de otra marca**: `sameAs` apuntaba al Facebook/Instagram de "aguiar" y el logo a un `/wp-content/` inexistente → ahora Instagram propio, logo real, `TravelAgency` con teléfono/mail, sin buscador inexistente.
5. **Home sin `<h1>` real** (los 3 `<h1>` eran títulos del blog) → "Bienvenido a Gasparotto" es el único `<h1>`.
6. **Títulos pobres** ("Blog", "Reservas", "Tangos") y uno en otro idioma ("Términos y condiciones" en página pt-BR) → títulos descriptivos ≤ 65 caracteres.
7. `og:image` relativas (no funcionan al compartir) → absolutas; `og:locale` coherente con `lang`; nombre de marca unificado.
8. Duplicado entre `mvp-4xl.pages.dev` y el dominio propio → `noindex` fuera del dominio de `SITE_URL`.
9. Cambiar un slug rompía la URL vieja → redirección 301 automática.

## Pendiente de tu lado
- **Texto alternativo**: 136 imágenes sin alt → `seo-report/imagenes-sin-alt.csv`.
- **Idioma de la home**: está en español (`lang="es"`) y el resto del sitio en portugués de Brasil; decidí cuál es el público principal.
- **Dirección y horarios** del negocio: no figuran en el sitio; sumarlos al JSON-LD (y a Google Business Profile) mejora el SEO local.
- **Revisar visualmente la home**: el título principal pasó de `h2` a `h1` y los títulos de las 3 tarjetas del blog de `h1` a `h3`.
- **Contenido duplicado**: `build_cloudflare.py` descarga imágenes de `aguiarbuenosaires.com`; si ese sitio sigue publicado con los mismos textos, Google puede ver duplicados.
- Tras el deploy: entrá al panel una vez (migra la base) y enviá `sitemap.xml` en Google Search Console.
