# Cloudflare Pages

The static site is in `dist/`. NitroPack assets are downloaded and rewritten to
local paths so the deployed site does not depend on the NitroPack CDN.

For Cloudflare Pages, use the repository root as the project root and `dist` as
the build output directory. Set the build command to:

```sh
python build_cloudflare.py --download && python seo_pass.py
```

`seo_pass.py` aplica las mejoras SEO estáticas (títulos, og:image absolutas, JSON-LD, único h1 en la home,
lista de URLs para el sitemap). Es idempotente: se puede correr todas las veces que haga falta.

The root-level `functions/` directory handles legacy `/?p=ID` URLs with a 404
response. `dist/404.html` is the custom not-found page for other missing routes.

## Deploy with Wrangler

`wrangler.jsonc` configures the Pages project name, output directory, and
compatibility date. The root-level `functions/` directory is uploaded with the
static site.

For the first deployment, authenticate with Cloudflare's browser-based OAuth
flow. The Pages project slug is `mvp-4xl`, matching the production URL
`mvp-4xl.pages.dev`. Create the project only if it does not already exist:

```sh
npx --yes wrangler@4 login
npx --yes wrangler@4 pages project create mvp-4xl --production-branch main
```

Build and deploy subsequent updates with:

```sh
python build_cloudflare.py --download && python seo_pass.py
npx --yes wrangler@4 pages deploy dist
```

If the Pages project already exists, skip the create command and deploy to it.