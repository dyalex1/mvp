-- Esquema completo para una base nueva (wrangler d1 execute gasparotto-db --file=schema.sql).
-- Si ya tenés datos, no hace falta correrlo: el panel migra solo al primer ingreso.
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT DEFAULT '',
  content TEXT DEFAULT '',
  image TEXT DEFAULT '',
  image_alt TEXT DEFAULT '',
  category TEXT DEFAULT 'Blog',
  seo_title TEXT DEFAULT '',
  seo_description TEXT DEFAULT '',
  legacy_id TEXT DEFAULT '',
  published INTEGER DEFAULT 1,
  featured INTEGER DEFAULT 0,
  publish_date TEXT DEFAULT '',
  related_ids TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'tangos',
  price_old TEXT DEFAULT '',
  price TEXT DEFAULT '',
  excerpt TEXT DEFAULT '',
  content TEXT DEFAULT '',
  image TEXT DEFAULT '',
  image_alt TEXT DEFAULT '',
  seo_title TEXT DEFAULT '',
  seo_description TEXT DEFAULT '',
  published INTEGER DEFAULT 1,
  featured INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS price_overrides (
  page TEXT NOT NULL,
  widget_id TEXT NOT NULL,
  html TEXT NOT NULL,
  PRIMARY KEY (page, widget_id)
);
CREATE TABLE IF NOT EXISTS redirects (
  from_path TEXT PRIMARY KEY,
  to_path TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
