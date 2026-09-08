'use strict';
const path = require('path');
const fs = require('fs');
const { db, DATA_DIR, APP_ROOT, classifyName } = require('./db');

// ---------- file helpers ----------
function safeName(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\.+$/g, '')
    .slice(0, 120);
}
function isAbsoluteOrDrive(p) {
  return path.isAbsolute(p) || /^[a-zA-Z]:[\\/]/.test(p);
}
function normalizeFolder(p, fallback) {
  if (p && typeof p === 'string' && p.trim()) {
    const t = p.trim();
    if (isAbsoluteOrDrive(t)) return t;
    return path.resolve(APP_ROOT, t);
  }
  return fallback;
}
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}
const now = () => new Date().toISOString();
const ts = () => Date.now();

// ---------- config.json (folders + home + site) ----------
const CFG_FILE = path.join(DATA_DIR, 'config.json');
const DEFAULT_FOLDERS = () => ({
  media: path.join(DATA_DIR, 'media'),
  markdown: path.join(DATA_DIR, 'markdown'),
});
const DEFAULT_HOME = {
  menu: [
    { label: '首页', type: 'route', value: '/' },
    { label: '资源库', type: 'route', value: '/library' },
    { label: '标签总览', type: 'route', value: '/tags' },
  ],
  modules: [
    { id: 'm_featured', type: 'featured', title: '精选推荐', enabled: true },
    { id: 'm_random', type: 'random', title: '随机推荐', enabled: true },
    { id: 'm_latest', type: 'latest', title: '最新收录', enabled: true },
  ],
};

let configCache = null;
function loadConfig() {
  if (configCache) return configCache;
  let raw = {};
  try {
    if (fs.existsSync(CFG_FILE)) raw = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8'));
  } catch (e) {
    /* ignore broken config */
  }
  const cfg = {
    folders: {
      media: normalizeFolder(raw.folders && raw.folders.media, DEFAULT_FOLDERS().media),
      markdown: normalizeFolder(raw.folders && raw.folders.markdown, DEFAULT_FOLDERS().markdown),
    },
    home: Object.assign({}, DEFAULT_HOME, raw.home || {}),
    site: Object.assign({ title: '文史哲知识库', subtitle: '文学 · 历史 · 哲学' }, raw.site || {}),
  };
  ensureDir(cfg.folders.media);
  ensureDir(cfg.folders.markdown);
  ensureDir(path.join(cfg.folders.media, 'images'));
  ensureDir(path.join(cfg.folders.media, 'audios'));
  ensureDir(path.join(cfg.folders.media, 'videos'));
  ensureDir(path.join(cfg.folders.markdown, 'resources'));
  ensureDir(path.join(cfg.folders.markdown, 'tags'));
  configCache = cfg;
  return cfg;
}
function saveConfig() {
  if (!configCache) return;
  fs.writeFileSync(CFG_FILE, JSON.stringify(configCache, null, 2), 'utf8');
}
function updateConfig(patch) {
  loadConfig();
  if (patch.folders) {
    configCache.folders = Object.assign(configCache.folders, patch.folders);
  }
  if (patch.home) configCache.home = patch.home;
  if (patch.site) configCache.site = Object.assign(configCache.site, patch.site);
  saveConfig();
  return configCache;
}
function resolveMediaPath(rel) {
  if (!rel) return null;
  if (isAbsoluteOrDrive(rel)) return rel;
  return path.join(loadConfig().folders.media, rel);
}

// ---------- type detection ----------
const EXT_TYPE = {
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif', '.tiff', '.tif', '.ico', '.jfif'],
  audio: ['.mp3', '.wav', '.ogg', '.oga', '.m4a', '.flac', '.aac', '.wma', '.opus'],
  video: ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv', '.flv', '.wmv', '.mpg', '.mpeg', '.ts', '.3gp'],
};
const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', ico: 'image/x-icon',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac', opus: 'audio/opus',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', avi: 'video/x-msvideo', m4v: 'video/mp4', ogv: 'video/ogg',
};
function typeOfFile(file) {
  const ext = path.extname(file).toLowerCase();
  for (const t of Object.keys(EXT_TYPE)) if (EXT_TYPE[t].includes(ext)) return t;
  return null;
}
function mimeOf(name) {
  const ext = path.extname(name).toLowerCase().replace('.', '');
  return MIME[ext] || 'application/octet-stream';
}

// ---------- resource DAO ----------
function rowResource(r) {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    description_md: r.description_md,
    media_path: r.media_path,
    media_name: r.media_name,
    media_size: r.media_size,
    featured: !!r.featured,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
function getResourceTags(resourceId) {
  return db
    .prepare(`SELECT t.id, t.name, t.color FROM tag t JOIN resource_tag rt ON rt.tag_id=t.id WHERE rt.resource_id=?`)
    .all(resourceId)
    .map((x) => x.id);
}
function getPrimaryTagId(resourceId) {
  const r = db
    .prepare(`SELECT tag_id FROM resource_tag WHERE resource_id=? ORDER BY is_primary DESC, tag_id ASC LIMIT 1`)
    .get(resourceId);
  return r ? r.tag_id : null;
}
function getResource(id) {
  const r = db.prepare('SELECT * FROM resource WHERE id=?').get(id);
  if (!r) return null;
  const row = rowResource(r);
  row.tags = getResourceTags(id);
  row.primary_tag = getPrimaryTagId(id);
  return row;
}
function listResources() {
  const rows = db.prepare('SELECT * FROM resource ORDER BY updated_at DESC, id DESC').all();
  return rows.map((r) => {
    const row = rowResource(r);
    row.primary_tag = getPrimaryTagId(row.id);
    return row;
  });
}
function insertResource(data) {
  const st = db.prepare(
    `INSERT INTO resource (type,title,description_md,media_path,media_name,media_size,featured,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  const r = st.run(
    data.type || 'image',
    data.title || '',
    data.description_md || '',
    data.media_path || null,
    data.media_name || null,
    data.media_size || 0,
    data.featured ? 1 : 0,
    data.created_at || now(),
    data.updated_at || now()
  );
  const id = Number(r.lastInsertRowid);
  if (data.tags) setResourceTags(id, data.tags, data.primary_tag);
  return getResource(id);
}
function updateResource(id, data) {
  const cur = db.prepare('SELECT * FROM resource WHERE id=?').get(id);
  if (!cur) return null;
  const merged = Object.assign({}, cur, data);
  db.prepare(
    `UPDATE resource SET type=?,title=?,description_md=?,media_path=?,media_name=?,media_size=?,featured=?,updated_at=? WHERE id=?`
  ).run(
    merged.type || 'image',
    merged.title || '',
    merged.description_md || '',
    merged.media_path || null,
    merged.media_name || null,
    merged.media_size || 0,
    merged.featured ? 1 : 0,
    now(),
    id
  );
  if (data.tags !== undefined) setResourceTags(id, data.tags, data.primary_tag);
  return getResource(id);
}
function deleteResource(id) {
  db.prepare('DELETE FROM resource_tag WHERE resource_id=?').run(id);
  db.prepare('DELETE FROM resource WHERE id=?').run(id);
}
// exactly one primary tag per resource: explicit primaryTagId wins, otherwise the first tag
function setResourceTags(id, tagIds, primaryTagId) {
  db.prepare('DELETE FROM resource_tag WHERE resource_id=?').run(id);
  const list = (tagIds || []).filter((x) => Number.isInteger(Number(x)));
  if (!list.length) return;
  let eff = list.includes(Number(primaryTagId)) ? Number(primaryTagId) : list[0];
  const st = db.prepare('INSERT OR IGNORE INTO resource_tag (resource_id,tag_id,is_primary) VALUES (?,?,?)');
  for (const t of list) st.run(id, Number(t), Number(t) === eff ? 1 : 0);
}

// ---------- tag DAO ----------
function rowTag(t) {
  return {
    id: t.id,
    name: t.name,
    name_zh: t.name_zh || '',
    name_en: t.name_en || '',
    name_native: t.name_native || '',
    color: t.color,
    description_md: t.description_md,
    sort_order: t.sort_order,
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}
function getTag(id) {
  const t = db.prepare('SELECT * FROM tag WHERE id=?').get(id);
  return t ? rowTag(t) : null;
}
function getTagByName(name) {
  const t = db.prepare('SELECT * FROM tag WHERE name=?').get(String(name || '').trim());
  return t ? rowTag(t) : null;
}
// exact match against any of the four names (unique main name or any language slot)
function findTagLike(q) {
  const s = String(q || '').trim();
  if (!s) return null;
  const t = db.prepare('SELECT * FROM tag WHERE name=? OR name_zh=? OR name_en=? OR name_native=?').get(s, s, s, s);
  return t ? rowTag(t) : null;
}
function listTags() {
  return db.prepare('SELECT * FROM tag ORDER BY sort_order ASC, id ASC').all().map(rowTag);
}
// auto language slot: single raw name is classified into 中文/英文/本土 original script
function langSlotsOf(name) {
  const c = classifyName(name);
  return { zh: c.zh, en: c.en, native: c.native, lang: c.lang };
}
function insertTag(data) {
  let zh = data.name_zh !== undefined ? String(data.name_zh || '') : '';
  let en = data.name_en !== undefined ? String(data.name_en || '') : '';
  let nat = data.name_native !== undefined ? String(data.name_native || '') : '';
  if (!zh && !en && !nat) {
    const c = langSlotsOf(data.name || '');
    zh = c.zh; en = c.en; nat = c.native;
  }
  const st = db.prepare(
    'INSERT INTO tag (name,name_zh,name_en,name_native,color,description_md,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
  );
  const r = st.run(
    (data.name || '').trim(),
    zh,
    en,
    nat,
    data.color || '',
    data.description_md || '',
    data.sort_order || 0,
    now(),
    now()
  );
  return getTag(Number(r.lastInsertRowid));
}
function updateTag(id, data) {
  const cur = db.prepare('SELECT * FROM tag WHERE id=?').get(id);
  if (!cur) return null;
  const merged = Object.assign({}, cur, data);
  const name = String(merged.name || '').trim();
  let zh = merged.name_zh !== undefined ? String(merged.name_zh || '') : '';
  let en = merged.name_en !== undefined ? String(merged.name_en || '') : '';
  let nat = merged.name_native !== undefined ? String(merged.name_native || '') : '';
  // keep the main key visible even if user cleared every language slot
  if (!zh && !en && !nat && name) {
    const c = langSlotsOf(name);
    zh = c.zh; en = c.en; nat = c.native;
  }
  db.prepare(
    'UPDATE tag SET name=?,name_zh=?,name_en=?,name_native=?,color=?,description_md=?,sort_order=?,updated_at=? WHERE id=?'
  ).run(
    name,
    zh,
    en,
    nat,
    merged.color || '',
    merged.description_md || '',
    merged.sort_order || 0,
    now(),
    id
  );
  return getTag(id);
}
function deleteTag(id) {
  db.prepare('DELETE FROM resource_tag WHERE tag_id=?').run(id);
  db.prepare('DELETE FROM tag_edge WHERE parent_id=? OR child_id=?').run(id, id);
  db.prepare('DELETE FROM tag WHERE id=?').run(id);
  repairPrimary();
}
function resourceIdsOfTag(tagId, includeDesc = false) {
  let ids = [];
  const own = db.prepare('SELECT resource_id FROM resource_tag WHERE tag_id=?').all(tagId).map((x) => x.resource_id);
  ids = ids.concat(own);
  if (includeDesc) {
    const children = db.prepare('SELECT child_id FROM tag_edge WHERE parent_id=?').all(tagId).map((x) => x.child_id);
    for (const c of children) ids = ids.concat(resourceIdsOfTag(c, true));
  }
  return ids;
}

// ---------- tag edges (multi-parent) ----------
function edgeParents(childId) {
  return db
    .prepare(
      `SELECT e.id AS edge_id, e.is_primary, t.id, t.name, t.name_zh, t.name_en, t.name_native, t.color FROM tag_edge e
       JOIN tag t ON t.id=e.parent_id WHERE e.child_id=? ORDER BY e.is_primary DESC, e.id ASC`
    )
    .all(childId);
}
function edgeChildren(parentId) {
  return db
    .prepare(
      `SELECT e.id AS edge_id, e.is_primary, t.id, t.name, t.name_zh, t.name_en, t.name_native, t.color, t.sort_order FROM tag_edge e
       JOIN tag t ON t.id=e.child_id WHERE e.parent_id=? ORDER BY t.sort_order ASC, t.id ASC`
    )
    .all(parentId);
}
function addEdge(parentId, childId, primary) {
  if (parentId === childId) return { error: '不能将标签设为自己的父级' };
  const cnt = db.prepare('SELECT COUNT(*) c FROM tag_edge WHERE parent_id=? AND child_id=?').get(parentId, childId);
  if (cnt.c > 0) return { error: '该父子关系已存在' };
  // cycle detection: is childId an ancestor of parentId?
  const visited = new Set();
  const stack = [childId];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === parentId) return { error: '不能形成循环层级' };
    if (visited.has(cur)) continue;
    visited.add(cur);
    const kids = db.prepare('SELECT child_id FROM tag_edge WHERE parent_id=?').all(cur);
    for (const k of kids) if (!visited.has(k.child_id)) stack.push(k.child_id);
  }
  const r = db.prepare('INSERT INTO tag_edge (parent_id,child_id,is_primary) VALUES (?,?,?)').run(parentId, childId, primary ? 1 : 0);
  if (primary) {
    db.prepare('UPDATE tag_edge SET is_primary=0 WHERE child_id=? AND parent_id<>?').run(childId, parentId);
  }
  repairPrimary();
  return { ok: true, edge_id: Number(r.lastInsertRowid) };
}
// ensure every tag with parents has exactly one primary parent (first by id)
function repairPrimary() {
  const edges = listEdges();
  const byChild = {};
  for (const e of edges) {
    (byChild[e.child_id] = byChild[e.child_id] || []).push(e);
  }
  for (const childId of Object.keys(byChild)) {
    const es = byChild[childId].sort((a, b) => a.id - b.id);
    const hasPrimary = es.some((e) => e.is_primary);
    if (!hasPrimary) {
      db.prepare('UPDATE tag_edge SET is_primary=1 WHERE id=?').run(es[0].id);
    }
  }
}
function removeEdgeById(edgeId) {
  db.prepare('DELETE FROM tag_edge WHERE id=?').run(edgeId);
  repairPrimary();
}
function setPrimaryEdge(edgeId, childId) {
  db.prepare('UPDATE tag_edge SET is_primary=0 WHERE child_id=?').run(childId);
  db.prepare('UPDATE tag_edge SET is_primary=1 WHERE id=?').run(edgeId);
}
function listEdges() {
  return db.prepare('SELECT id, parent_id, child_id, is_primary FROM tag_edge ORDER BY id ASC').all();
}

module.exports = {
  now,
  ts,
  safeName,
  normalizeFolder,
  ensureDir,
  loadConfig,
  saveConfig,
  updateConfig,
  resolveMediaPath,
  typeOfFile,
  mimeOf,
  EXT_TYPE,
  // resources
  getResource,
  listResources,
  insertResource,
  updateResource,
  deleteResource,
  getResourceTags,
  setResourceTags,
  resourceIdsOfTag,
  // tags
  getTag,
  getTagByName,
  findTagLike,
  listTags,
  insertTag,
  updateTag,
  deleteTag,
  classifyName,
  langSlotsOf,
  // edges
  edgeParents,
  edgeChildren,
  addEdge,
  removeEdgeById,
  setPrimaryEdge,
  listEdges,
  DATA_DIR,
  APP_ROOT,
  db,
};
