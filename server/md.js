'use strict';
const path = require('path');
const fs = require('fs');
const st = require('./store');

// ---------- front-matter ----------
function splitFront(text) {
  const s = String(text || '').replace(/^\uFEFF/, '');
  const m = s.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: s };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (/^\[/.test(val)) {
      try {
        val = JSON.parse(val);
      } catch (e) {
        val = String(val).replace(/^\[|\]$/g, '').split(',').map((x) => x.trim()).filter(Boolean);
      }
    } else if (/^["']/.test(val)) {
      try {
        val = JSON.parse(val);
      } catch (e) {
        val = String(val).replace(/^["']|["']$/g, '');
      }
    }
    data[key] = val;
  }
  return { data, body: m[2] };
}
function dumpFront(data, body) {
  const lines = ['---'];
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (Array.isArray(v)) lines.push(`${k}: ${JSON.stringify(v)}`);
    else lines.push(`${k}: ${JSON.stringify(String(v))}`);
  }
  lines.push('---', '');
  return lines.join('\n') + String(body || '');
}

// ---------- paths ----------
function tagMdPath(id) {
  return path.join(st.loadConfig().folders.markdown, 'tags', `t${id}.md`);
}
function resourceMdPath(id) {
  return path.join(st.loadConfig().folders.markdown, 'resources', `r${id}.md`);
}
function relForDisplay(p) {
  return p ? String(p).replace(/\\/g, '/') : '';
}

// ---------- write ----------
function writeResourceMd(id) {
  const cfg = st.loadConfig();
  const res = st.getResource(id);
  if (!res) return null;
  const tagNames = (res.tags || []).map((tid) => {
    const t = st.getTag(tid);
    return t ? t.name : '';
  }).filter(Boolean);
  let primary = '';
  if (res.primary_tag) {
    const pt = st.getTag(res.primary_tag);
    if (pt) primary = pt.name;
  }
  const data = {
    id: res.id,
    type: res.type,
    title: res.title,
    featured: res.featured ? 'true' : 'false',
    tags: tagNames,
    primary: primary,
    media: res.media_path || '',
    media_name: res.media_name || '',
    created: res.created_at,
    updated: res.updated_at,
  };
  const file = resourceMdPath(id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, dumpFront(data, res.description_md), 'utf8');
  return file;
}
function writeTagMd(id) {
  const cfg = st.loadConfig();
  const tag = st.getTag(id);
  if (!tag) return null;
  const parents = st.edgeParents(id).map((p) => p.name);
  const data = {
    id: tag.id,
    name: tag.name,
    name_zh: tag.name_zh,
    name_en: tag.name_en,
    name_native: tag.name_native,
    color: tag.color,
    parents,
    created: tag.created_at,
    updated: tag.updated_at,
  };
  const file = tagMdPath(id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, dumpFront(data, tag.description_md), 'utf8');
  return file;
}

function writeAllMd() {
  const out = { resources: 0, tags: 0, errors: [] };
  for (const r of st.listResources()) {
    try {
      writeResourceMd(r.id);
      out.resources++;
    } catch (e) {
      out.errors.push('资源#' + r.id + ':' + e.message);
    }
  }
  for (const t of st.listTags()) {
    try {
      writeTagMd(t.id);
      out.tags++;
    } catch (e) {
      out.errors.push('标签#' + t.id + ':' + e.message);
    }
  }
  return out;
}

// ---------- import ----------
// Walk folder recursively collecting md files.
function walkMd(folder) {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const en of entries) {
      if (en.name.startsWith('.')) continue;
      const full = path.join(dir, en.name);
      if (en.isDirectory()) walk(full);
      else if (en.isFile() && en.name.toLowerCase().endsWith('.md')) out.push(full);
    }
  };
  walk(folder);
  return out;
}
function importResourceMd(file, createdNewTags) {
  const raw = fs.readFileSync(file, 'utf8');
  const { data, body } = splitFront(raw);
  const found = data.id ? st.getResource(Number(data.id)) : null;
  const title = String(data.title || path.basename(file).replace(/\.md$/i, ''));
  const tagNames = Array.isArray(data.tags) ? data.tags : [];
  const tagIds = [];
  for (const nm of tagNames) {
    let t = st.getTagByName(nm);
    if (!t) {
      t = st.insertTag({ name: String(nm), color: '' });
      if (createdNewTags) createdNewTags.push(t.id);
    }
    if (t) tagIds.push(t.id);
  }
  let primaryTagId = null;
  if (data.primary) {
    const pt = st.getTagByName(String(data.primary));
    if (pt && tagIds.includes(pt.id)) primaryTagId = pt.id;
  }
  if (!primaryTagId && tagIds.length) primaryTagId = tagIds[0];
  let type = st.typeOfFile(data.media) || st.typeOfFile(data.media_name) || 'image';
  if (data.type && ['image', 'audio', 'video'].includes(data.type)) type = data.type;
  let mediaPath = data.media ? String(data.media) : null;
  let mediaName = data.media_name ? String(data.media_name) : null;
  if (mediaPath) {
    // media stored relative to media root; ensure it exists
    const abs = st.resolveMediaPath(mediaPath);
    if (!fs.existsSync(abs)) {
      // try resolve within resources dir of the md file (a sibling media folder)
      const cand = path.join(path.dirname(file), mediaPath);
      if (fs.existsSync(cand)) {
        const destRel = copyIntoMedia(cand);
        mediaPath = destRel.rel;
        mediaName = mediaName || destRel.name;
      } else {
        mediaPath = null;
      }
    }
  }
  let featured = data.featured === true || data.featured === 'true';
  if (found) {
    const upd = {
      type,
      title: String(title),
      description_md: body,
      featured,
      tags: tagIds,
      primary_tag: primaryTagId,
    };
    if (mediaPath && !found.media_path) {
      upd.media_path = mediaPath;
      upd.media_name = mediaName;
      try {
        upd.media_size = fs.statSync(st.resolveMediaPath(mediaPath)).size;
      } catch (e) {}
    }
    return { action: 'update', id: st.updateResource(found.id, upd).id };
  }
  let size = 0;
  if (mediaPath) {
    try {
      size = fs.statSync(st.resolveMediaPath(mediaPath)).size;
    } catch (e) {}
  }
  return {
    action: 'create',
    id: st
      .insertResource({
        type,
        title: String(title),
        description_md: body,
        media_path: mediaPath,
        media_name: mediaName,
        media_size: size,
        featured,
        tags: tagIds,
        primary_tag: primaryTagId,
      })
      .id,
  };
}
function importTagMd(file, createdNewTags) {
  const raw = fs.readFileSync(file, 'utf8');
  const { data, body } = splitFront(raw);
  const name = String(data.name || path.basename(file).replace(/\.md$/i, ''));
  let tag = data.id ? st.getTag(Number(data.id)) : null;
  if (!tag) tag = st.getTagByName(name);
  const parents = Array.isArray(data.parents) ? data.parents.map(String) : [];
  const langKeys = ['name_zh', 'name_en', 'name_native'];
  if (!tag) {
    const ins = { name, color: data.color || '' };
    for (const k of langKeys) if (data[k] !== undefined) ins[k] = String(data[k]);
    tag = st.insertTag(ins);
    if (createdNewTags) createdNewTags.push(tag.id);
  }
  const upd = { color: data.color || tag.color, description_md: body };
  for (const k of langKeys) if (data[k] !== undefined) upd[k] = String(data[k]);
  st.updateTag(tag.id, upd);
  // parents: create if missing, then add edges
  for (const pn of parents) {
    let p = st.getTagByName(pn);
    if (!p) {
      p = st.insertTag({ name: pn, color: '' });
      if (createdNewTags) createdNewTags.push(p.id);
    }
    const exist = st.edgeParents(tag.id).some((e) => e.id === p.id);
    if (!exist) st.addEdge(p.id, tag.id, true);
  }
  return { action: tag.updated ? 'update' : 'create', id: tag.id };
}

function copyIntoMedia(srcFile, nameHint) {
  const cfg = st.loadConfig();
  const ext = path.extname(nameHint || srcFile).toLowerCase();
  const type = st.typeOfFile(nameHint || srcFile) || 'image';
  const sub = type === 'audio' ? 'audios' : type === 'video' ? 'videos' : 'images';
  const d = new Date();
  const ymd = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const destDir = path.join(cfg.folders.media, sub, ymd);
  fs.mkdirSync(destDir, { recursive: true });
  const uuid = Math.random().toString(36).slice(2, 10);
  const name = `${Date.now().toString(36)}_${uuid}${ext.toLowerCase()}`;
  const dest = path.join(destDir, name);
  fs.copyFileSync(srcFile, dest);
  return { rel: path.posix.join(sub, ymd, name), abs: dest, name: path.basename(srcFile), size: fs.statSync(dest).size };
}

module.exports = {
  splitFront,
  dumpFront,
  writeResourceMd,
  writeTagMd,
  writeAllMd,
  importResourceMd,
  importTagMd,
  walkMd,
  copyIntoMedia,
  resourceMdPath,
  tagMdPath,
  relForDisplay,
};
