'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const multer = require('multer');
const st = require('./store');
const mdio = require('./md');

const app = express();
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// ---------- helpers ----------
const ok = (res, data) => res.json({ ok: true, ...data });
const fail = (res, msg, status = 400) => res.status(status).json({ ok: false, error: msg });

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => {
    console.error(e);
    fail(res, e.message || '服务器错误', 500);
  });
}

function withTags(arr) {
  return arr.map((r) => ({ ...r, tags: st.getResourceTags(r.id) }));
}
function pickPrimary(tagIds, raw) {
  const n = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
  if (Number.isInteger(n) && tagIds.includes(n)) return n;
  return tagIds.length ? tagIds[0] : null;
}

// ---------- static ----------
const PUBLIC = path.join(__dirname, '..', 'public');
app.use('/vendor', express.static(path.join(__dirname, '..', 'node_modules'), { index: false, maxAge: '1d' }));
app.use(express.static(PUBLIC));

// ---------- upload temp ----------
const TMP = path.join(os.tmpdir(), 'wzscms-upload');
fs.mkdirSync(TMP, { recursive: true });
const upload = multer({ dest: TMP, limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

// ---------- range file stream ----------
function sendFileRange(req, res, abs, mime, fileName) {
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch (e) {
    return fail(res, '文件不存在', 404);
  }
  const etag = `"${stat.size}-${Math.round(stat.mtimeMs)}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }
  const total = stat.size;
  const range = req.headers.range;
  let start = 0;
  let end = total - 1;
  let status = 200;
  let headers = {};
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      if (m[1] === '' && m[2] === '') {
        // ignore invalid
      } else if (m[1] === '') {
        const suffix = parseInt(m[2], 10);
        start = Math.max(total - suffix, 0);
        end = total - 1;
        status = 206;
      } else {
        start = parseInt(m[1], 10);
        end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
        if (start > end || start >= total) {
          res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
          return;
        }
        status = 206;
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
    }
  }
  headers['Content-Type'] = mime;
  headers['Accept-Ranges'] = 'bytes';
  headers['Content-Length'] = end - start + 1;
  if (fileName) headers['Content-Disposition'] = `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  res.writeHead(status, headers);
  fs.createReadStream(abs, { start, end }).pipe(res);
}

// ================= Resources =================
app.get('/api/bootstrap', wrap(async (req, res) => {
  const cfg = st.loadConfig();
  const resources = withTags(st.listResources()).map((r) => {
    const { description_md, ...rest } = r;
    return rest;
  });
  const tags = st.listTags().map((t) => {
    const tt = { ...t };
    tt.parents = st.edgeParents(t.id).map((p) => ({
      id: p.id, name: p.name, name_zh: p.name_zh, name_en: p.name_en, name_native: p.name_native,
      color: p.color, edge_id: p.edge_id, is_primary: !!p.is_primary,
    }));
    tt.children = st.edgeChildren(t.id).map((c) => ({
      id: c.id, name: c.name, name_zh: c.name_zh, name_en: c.name_en, name_native: c.name_native,
      color: c.color, edge_id: c.edge_id,
    }));
    return tt;
  });
  ok(res, {
    config: { folders: cfg.folders, home: cfg.home, site: cfg.site },
    resources,
    tags,
    stats: {
      resources: resources.length,
      tags: tags.length,
      featured: resources.filter((r) => r.featured).length,
      images: resources.filter((r) => r.type === 'image').length,
      audios: resources.filter((r) => r.type === 'audio').length,
      videos: resources.filter((r) => r.type === 'video').length,
    },
  });
}));

// resource list w/ filters
app.get('/api/resources', wrap(async (req, res) => {
  let rows = st.listResources();
  const { type, tag, q, featured } = req.query;
  if (type) rows = rows.filter((r) => r.type === type);
  if (featured) rows = rows.filter((r) => r.featured);
  if (tag) {
    const ids = new Set(st.resourceIdsOfTag(Number(tag), req.query.desc === '1'));
    rows = rows.filter((r) => ids.has(r.id));
  }
  if (q) {
    const kw = String(q).toLowerCase();
    rows = rows.filter(
      (r) => r.title.toLowerCase().includes(kw) || (r.description_md || '').toLowerCase().includes(kw) || (r.media_name || '').toLowerCase().includes(kw)
    );
  }
  ok(res, { resources: withTags(rows).map((r) => { const { description_md, ...rest } = r; return rest; }) });
}));

app.get('/api/resource/:id', wrap(async (req, res) => {
  const r = st.getResource(Number(req.params.id));
  if (!r) return fail(res, '资源不存在', 404);
  ok(res, { resource: r });
}));

// create resource (multipart, file optional)
app.post('/api/resource', upload.single('file'), wrap(async (req, res) => {
  const { title, type, tags } = req.body;
  const tagIds = (() => {
    try {
      return JSON.parse(tags || '[]');
    } catch (e) {
      return [];
    }
  })();
  const body = {
    title: title || '',
    type: type || 'image',
    description_md: req.body.description_md || '',
    tags: tagIds,
    primary_tag: pickPrimary(tagIds, req.body.primary_tag),
    featured: req.body.featured === '1' || req.body.featured === 'true',
  };
  if (req.file) {
    const cp = mdio.copyIntoMedia(req.file.path, req.file.originalname);
    body.media_path = cp.rel;
    body.media_name = req.file.originalname || cp.name;
    body.media_size = cp.size;
    fs.unlink(req.file.path, () => {});
  } else if (req.body.media_path) {
    body.media_path = req.body.media_path;
    body.media_name = req.body.media_name || '';
  }
  const r = st.insertResource(body);
  mdio.writeResourceMd(r.id);
  ok(res, { resource: r });
}));

// update resource
app.put('/api/resource/:id', upload.single('file'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const cur = st.getResource(id);
  if (!cur) return fail(res, '资源不存在', 404);
  const tagIds = (() => {
    try {
      return JSON.parse(req.body.tags || '[]');
    } catch (e) {
      return [];
    }
  })();
  const body = {
    title: req.body.title !== undefined ? req.body.title : cur.title,
    type: req.body.type || cur.type,
    description_md: req.body.description_md !== undefined ? req.body.description_md : cur.description_md,
    tags: req.body.tags !== undefined ? tagIds : undefined,
    primary_tag: req.body.tags !== undefined ? pickPrimary(tagIds, req.body.primary_tag) : undefined,
    featured: req.body.featured !== undefined ? req.body.featured === '1' || req.body.featured === 'true' : cur.featured,
  };
  if (req.file) {
    const cp = mdio.copyIntoMedia(req.file.path, req.file.originalname);
    body.media_path = cp.rel;
    body.media_name = req.file.originalname || cp.name;
    body.media_size = cp.size;
    fs.unlink(req.file.path, () => {});
    // remove old media file
    if (cur.media_path) {
      try {
        fs.unlinkSync(st.resolveMediaPath(cur.media_path));
      } catch (e) {}
    }
  }
  const r = st.updateResource(id, body);
  mdio.writeResourceMd(id);
  ok(res, { resource: r });
}));

app.delete('/api/resource/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const cur = st.getResource(id);
  if (!cur) return fail(res, '资源不存在', 404);
  st.deleteResource(id);
  if (req.query.file === '1' && cur.media_path) {
    try {
      fs.unlinkSync(st.resolveMediaPath(cur.media_path));
    } catch (e) {}
  }
  try {
    fs.unlinkSync(mdio.resourceMdPath(id));
  } catch (e) {}
  ok(res, { id });
}));

app.post('/api/resource/batch-delete', wrap(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  let removed = 0;
  for (const id of ids) {
    const cur = st.getResource(Number(id));
    if (!cur) continue;
    st.deleteResource(Number(id));
    if (req.body.deleteFile && cur.media_path) {
      try {
        fs.unlinkSync(st.resolveMediaPath(cur.media_path));
      } catch (e) {}
    }
    try {
      fs.unlinkSync(mdio.resourceMdPath(Number(id)));
    } catch (e) {}
    removed++;
  }
  ok(res, { removed });
}));

// stream media file with range
app.get('/api/resource/:id/file', wrap(async (req, res) => {
  const r = st.getResource(Number(req.params.id));
  if (!r || !r.media_path) return fail(res, '资源无媒体文件', 404);
  const abs = st.resolveMediaPath(r.media_path);
  sendFileRange(req, res, abs, st.mimeOf(r.media_path), r.media_name || r.media_path);
}));

// raw md
app.get('/api/resource/:id/raw', wrap(async (req, res) => {
  const r = st.getResource(Number(req.params.id));
  if (!r) return fail(res, '资源不存在', 404);
  const primTag = r.primary_tag ? st.getTag(r.primary_tag) : null;
  res.type('text/markdown; charset=utf-8').send(mdio.dumpFront({
    id: r.id, type: r.type, title: r.title,
    featured: r.featured ? 'true' : 'false',
    tags: (r.tags || []).map((x) => (st.getTag(x) || {}).name),
    primary: primTag ? primTag.name : '',
    media: r.media_path || '', media_name: r.media_name || '',
    created: r.created_at, updated: r.updated_at,
  }, r.description_md));
}));

// import existing files by absolute path list (from arbitrary folders / scanned folder)
app.post('/api/import/files', wrap(async (req, res) => {
  const files = Array.isArray(req.body.files) ? req.body.files : [];
  const created = [];
  for (const f of files) {
    const abs = String(f);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    const type = st.typeOfFile(abs);
    if (!type) continue;
    const cp = mdio.copyIntoMedia(abs);
    const r = st.insertResource({
      type,
      title: path.basename(abs).replace(/\.[^.]+$/, ''),
      description_md: `> 源文件：${abs}\n`,
      media_path: cp.rel,
      media_name: path.basename(abs),
      media_size: cp.size,
      tags: [],
    });
    mdio.writeResourceMd(r.id);
    created.push(r);
  }
  ok(res, { created: created.length });
}));

// ================= Tags =================
app.get('/api/tag/:id/resources', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const ids = new Set(st.resourceIdsOfTag(id, req.query.desc === '1'));
  const rows = st.listResources().filter((r) => ids.has(r.id));
  ok(res, { resources: withTags(rows).map((r) => { const { description_md, ...rest } = r; return rest; }) });
}));

app.post('/api/tag', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return fail(res, '标签名称不能为空');
  if (st.findTagLike(name)) return fail(res, '该名称（或对应语言名）的标签已存在');
  const ins = {
    name,
    color: req.body.color || '',
    description_md: req.body.description_md || '',
    sort_order: req.body.sort_order || 0,
  };
  for (const k of ['name_zh', 'name_en', 'name_native']) if (req.body[k] !== undefined) ins[k] = String(req.body[k]);
  const t = st.insertTag(ins);
  if (req.body.parentId) {
    const e = st.addEdge(Number(req.body.parentId), t.id, true);
    if (e.error) return fail(res, e.error);
  }
  mdio.writeTagMd(t.id);
  ok(res, { tag: t });
}));

app.put('/api/tag/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const t = st.getTag(id);
  if (!t) return fail(res, '标签不存在', 404);
  const name = req.body.name !== undefined ? String(req.body.name).trim() : t.name;
  if (!name) return fail(res, '标签名称不能为空');
  const dupe = st.findTagLike(name);
  if (dupe && dupe.id !== id) return fail(res, '该名称（或对应语言名）的标签已存在');
  const updData = {
    name,
    color: req.body.color !== undefined ? req.body.color : t.color,
    description_md: req.body.description_md !== undefined ? req.body.description_md : t.description_md,
    sort_order: req.body.sort_order !== undefined ? req.body.sort_order : t.sort_order,
  };
  for (const k of ['name_zh', 'name_en', 'name_native']) if (req.body[k] !== undefined) updData[k] = String(req.body[k]);
  const upd = st.updateTag(id, updData);
  mdio.writeTagMd(id);
  ok(res, { tag: upd });
}));

app.delete('/api/tag/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!st.getTag(id)) return fail(res, '标签不存在', 404);
  st.deleteTag(id);
  try {
    fs.unlinkSync(mdio.tagMdPath(id));
  } catch (e) {}
  ok(res, { id });
}));

// add parent edge  { parentId, primary }
app.post('/api/tag/:id/parent', wrap(async (req, res) => {
  const childId = Number(req.params.id);
  const parentId = Number(req.body.parentId);
  if (!parentId) return fail(res, '缺少父级标签');
  const e = st.addEdge(parentId, childId, req.body.primary !== false);
  if (e.error) return fail(res, e.error);
  mdio.writeTagMd(childId);
  ok(res, { edge_id: e.edge_id, ok: true });
}));

app.delete('/api/tag-edge/:edgeId', wrap(async (req, res) => {
  st.removeEdgeById(Number(req.params.edgeId));
  ok(res, { ok: true });
}));

app.post('/api/tag-edge/:edgeId/primary', wrap(async (req, res) => {
  const e = st.listEdges().find((x) => x.id === Number(req.params.edgeId));
  if (!e) return fail(res, '关系不存在', 404);
  st.setPrimaryEdge(Number(req.params.edgeId), e.child_id);
  ok(res, { ok: true });
}));

// ================= markdown sync =================
app.post('/api/md/export-all', wrap(async (req, res) => {
  const out = mdio.writeAllMd();
  ok(res, out);
}));

app.post('/api/md/import', wrap(async (req, res) => {
  const cfg = st.loadConfig();
  const createdNewTags = [];
  const result = { resources: [], tags: [], errors: [] };
  const resDir = path.join(cfg.folders.markdown, 'resources');
  if (fs.existsSync(resDir)) {
    for (const file of mdio.walkMd(resDir)) {
      try {
        result.resources.push(mdio.importResourceMd(file, createdNewTags));
      } catch (e) {
        result.errors.push(file + ':' + e.message);
      }
    }
  }
  const tagDir = path.join(cfg.folders.markdown, 'tags');
  if (fs.existsSync(tagDir)) {
    for (const file of mdio.walkMd(tagDir)) {
      try {
        result.tags.push(mdio.importTagMd(file, createdNewTags));
      } catch (e) {
        result.errors.push(file + ':' + e.message);
      }
    }
  }
  ok(res, result);
}));

// ================= config =================
app.get('/api/config', wrap(async (req, res) => {
  const cfg = st.loadConfig();
  ok(res, { config: cfg });
}));

// scan an arbitrary local folder to list importable media files
app.post('/api/folders/scan', wrap(async (req, res) => {
  const folder = String(req.body.folder || '');
  if (!folder || !fs.existsSync(folder)) return fail(res, '文件夹不存在');
  const out = [];
  const seen = new Set(st.listResources().map((r) => r.media_path).filter(Boolean));
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const en of entries) {
      if (en.name.startsWith('.') || en.name === 'node_modules') continue;
      const full = path.join(dir, en.name);
      if (en.isDirectory()) walk(full, depth + 1);
      else if (en.isFile()) {
        const type = st.typeOfFile(en.name);
        if (!type) continue;
        const rel = path.relative(st.loadConfig().folders.media, full).split(path.sep).join('/');
        if (seen.has(rel) || rel.startsWith('..')) continue;
        out.push({ abs: full, name: en.name, type, size: fs.statSync(full).size });
      }
    }
  };
  walk(folder, 0);
  ok(res, { files: out });
}));

app.put('/api/config', wrap(async (req, res) => {
  const cfg = st.updateConfig({
    folders: req.body.folders,
    home: req.body.home,
    site: req.body.site,
  });
  ok(res, { config: cfg });
}));

// move data dirs
app.post('/api/config/move', wrap(async (req, res) => {
  const oldCfg = st.loadConfig();
  const target = {
    media: st.normalizeFolder(req.body.media, oldCfg.folders.media),
    markdown: st.normalizeFolder(req.body.markdown, oldCfg.folders.markdown),
  };
  const moveDir = (from, to, label) => {
    if (path.resolve(from) === path.resolve(to)) return;
    if (!fs.existsSync(from)) return;
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (entry.name === '.DS_Store') continue;
      const src = path.join(from, entry.name);
      const dst = path.join(to, entry.name);
      if (fs.existsSync(dst)) {
        if (fs.lstatSync(dst).isDirectory() && fs.lstatSync(src).isDirectory()) {
          moveDir(src, dst, label);
          continue;
        }
        continue; // keep existing target file
      }
      fs.renameSync(src, dst);
    }
  };
  moveDir(oldCfg.folders.media, target.media, '媒体');
  moveDir(oldCfg.folders.markdown, target.markdown, 'Markdown');
  const cfg = st.updateConfig({ folders: target });
  ok(res, { config: cfg });
}));

// ================= local folder browser (single machine) =================
// GET /api/fs/browse?dir=  —— empty dir returns common starting points
app.get('/api/fs/browse', wrap(async (req, res) => {
  const dir = String(req.query.dir || '').trim();
  if (!dir) {
    return ok(res, {
      dir: null,
      exists: false,
      parent: null,
      entries: [],
      starts: [
        { label: '用户主目录', path: os.homedir() },
        { label: '桌面', path: path.join(os.homedir(), 'Desktop') },
        { label: '应用数据目录', path: st.DATA_DIR },
        { label: '系统根目录', path: path.parse(os.homedir()).root },
      ],
    });
  }
  let stat;
  try {
    stat = fs.statSync(dir);
  } catch (e) {
    return ok(res, { dir, exists: false, parent: path.dirname(dir), entries: [], error: '目录不存在' });
  }
  if (!stat.isDirectory()) {
    return ok(res, { dir, exists: true, parent: path.dirname(dir), entries: [], error: '该路径不是文件夹' });
  }
  let names = [];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return ok(res, { dir, exists: true, parent: path.dirname(dir), entries: [], error: '无权限读取该目录' });
  }
  const entries = names
    .filter((en) => en.isDirectory() && !en.name.startsWith('.'))
    .map((en) => ({ name: en.name, path: path.join(dir, en.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const root = path.parse(dir).root;
  ok(res, { dir, exists: true, parent: dir === root ? null : path.dirname(dir), entries, error: '' });
}));

// POST /api/fs/mkdir { dir }  —— create (nested) folder, absolute path required
app.post('/api/fs/mkdir', wrap(async (req, res) => {
  const dir = String(req.body.dir || '').trim();
  if (!path.isAbsolute(dir)) return fail(res, '请输入绝对路径');
  fs.mkdirSync(dir, { recursive: true });
  ok(res, { dir });
}));

// ================= fallback =================
app.use('/api', (req, res) => fail(res, '接口不存在', 404));
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

const PORT = Number(process.env.PORT || 4780);
app.listen(PORT, () => {
  const cfg = st.loadConfig();
  console.log('文史哲知识库已启动');
  console.log(`  http://localhost:${PORT}`);
  console.log(`  媒体目录  : ${cfg.folders.media}`);
  console.log(`  Markdown  : ${cfg.folders.markdown}`);
  console.log(`  数据库文件: ${st.DB_FILE}`);
});
