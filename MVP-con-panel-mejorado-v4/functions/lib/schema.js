// Esquema embebido: el panel crea y migra las tablas la primera vez que se usa (idempotente).
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
    excerpt TEXT DEFAULT '', content TEXT DEFAULT '', image TEXT DEFAULT '', category TEXT DEFAULT 'Blog',
    published INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'tangos', price_old TEXT DEFAULT '', price TEXT DEFAULT '',
    excerpt TEXT DEFAULT '', content TEXT DEFAULT '', image TEXT DEFAULT '',
    published INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS price_overrides (
    page TEXT NOT NULL, widget_id TEXT NOT NULL, html TEXT NOT NULL, PRIMARY KEY (page, widget_id))`,
  // Redirecciones 301 automáticas cuando se cambia el slug de una entrada ya publicada.
  `CREATE TABLE IF NOT EXISTS redirects (
    from_path TEXT PRIMARY KEY, to_path TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
];

// Columnas agregadas después de la primera versión (SQLite no tiene ADD COLUMN IF NOT EXISTS).
const MIGRATIONS = {
  posts: { image_alt: "TEXT DEFAULT ''", seo_title: "TEXT DEFAULT ''", seo_description: "TEXT DEFAULT ''", legacy_id: "TEXT DEFAULT ''", updated_at: "TEXT DEFAULT ''" },
  packages: { image_alt: "TEXT DEFAULT ''", seo_title: "TEXT DEFAULT ''", seo_description: "TEXT DEFAULT ''", updated_at: "TEXT DEFAULT ''" },
};

let done = false;
export async function ensureSchema(db) {
  if (done) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  for (const [table, cols] of Object.entries(MIGRATIONS)) {
    const have = new Set((await db.prepare(`PRAGMA table_info(${table})`).all()).results.map((c) => c.name));
    for (const [name, def] of Object.entries(cols))
      if (!have.has(name)) await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`).run();
  }
  done = true;
}
