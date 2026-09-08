'use strict';
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const APP_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.WZS_DATA || path.join(APP_ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'library.db');

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS resource (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'image',
  title TEXT NOT NULL DEFAULT '',
  description_md TEXT NOT NULL DEFAULT '',
  media_path TEXT,
  media_name TEXT,
  media_size INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tag (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  name_zh TEXT NOT NULL DEFAULT '',
  name_en TEXT NOT NULL DEFAULT '',
  name_native TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  description_md TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS resource_tag (
  resource_id INTEGER NOT NULL REFERENCES resource(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (resource_id, tag_id)
);
CREATE TABLE IF NOT EXISTS tag_edge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  child_id INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 1,
  UNIQUE (parent_id, child_id)
);
CREATE INDEX IF NOT EXISTS idx_rt_res ON resource_tag(resource_id);
CREATE INDEX IF NOT EXISTS idx_rt_tag ON resource_tag(tag_id);
CREATE INDEX IF NOT EXISTS idx_edge_child ON tag_edge(child_id);
CREATE INDEX IF NOT EXISTS idx_edge_parent ON tag_edge(parent_id);
`);

// ---------- lightweight migration for existing databases ----------
function ensureCol(table, col, decl) {
  const names = db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map((r) => r.name);
  if (!names.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
}
ensureCol('tag', 'name_zh', "TEXT NOT NULL DEFAULT ''");
ensureCol('tag', 'name_en', "TEXT NOT NULL DEFAULT ''");
ensureCol('tag', 'name_native', "TEXT NOT NULL DEFAULT ''");
ensureCol('resource_tag', 'is_primary', 'INTEGER NOT NULL DEFAULT 0');

// every resource with tags must own exactly one primary tag (the smallest tag_id wins for pre-existing data)
db.exec(`
UPDATE resource_tag SET is_primary = 1
WHERE (resource_id, tag_id) IN (
  SELECT resource_id, MIN(tag_id) FROM resource_tag GROUP BY resource_id
)`);

// backfill language slots from the legacy single name
function backfillTagLangs() {
  const rows = db.prepare('SELECT id, name FROM tag WHERE name_zh = \'\' AND name_en = \'\' AND name_native = \'\'').all();
  for (const r of rows) {
    const c = classifyName(r.name);
    db.prepare('UPDATE tag SET name_zh=?, name_en=?, name_native=? WHERE id=?').run(c.zh, c.en, c.native, r.id);
  }
}

// ---------- name classification (中文名 / 英文名 / 本土语言名) ----------
// auto place a single raw name into the right language slot by its script
function classifyName(raw) {
  const s = String(raw || '').trim();
  if (!s) return { zh: '', en: '', native: '', lang: 'other' };
  // 汉字（含扩展区）→ 中文名
  if (/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3007]/.test(s)) {
    return { zh: s, en: '', native: '', lang: 'zh' };
  }
  // 传统本土文字：希腊 / 希伯来 / 阿拉伯 / 天城文等印度系 / 泰 / 藏 / 亚美尼亚 / 格鲁吉亚 / 西里尔 / 假名 / 韩文 等
  const NATIVE_SCRIPTS =
    /[\u0370-\u03FF\u0400-\u04FF\u0530-\u058F\u0590-\u05FF\u0600-\u06FF\u0900-\u0DFF\u0E00-\u0E7F\u0E80-\u0EFF\u0F00-\u0FFF\u10A0-\u10FF\u1200-\u139F\u2D80-\u2DDF\u3040-\u30FF\u31F0-\u31FF\uAC00-\uD7AF]/;
  if (NATIVE_SCRIPTS.test(s)) {
    return { zh: '', en: '', native: s, lang: 'native' };
  }
  // 拉丁字母（含扩展拉丁字母音译）→ 英文名
  if (/^[\sA-Za-z\u00C0-\u024F\u1E00-\u1EFF'’`'.,·:0-9()\-/&+]+$/.test(s)) {
    return { zh: '', en: s, native: '', lang: 'en' };
  }
  // 其它文字一律视为本土原名
  return { zh: '', en: '', native: s, lang: 'native' };
}

backfillTagLangs();

module.exports = { db, DATA_DIR, APP_ROOT, DB_FILE, classifyName };
