'use strict';
(function () {
  const u = {};

  u.fmtTime = function (iso) {
    if (!iso) return '';
    return dayjs(iso).format('YYYY-MM-DD HH:mm');
  };
  u.fmtDate = function (iso) {
    if (!iso) return '';
    return dayjs(iso).format('YYYY-MM-DD');
  };
  u.relTime = function (iso) {
    if (!iso) return '';
    const d = dayjs(iso);
    const diff = dayjs().diff(d, 'minute');
    if (diff < 1) return '刚刚';
    if (diff < 60) return diff + ' 分钟前';
    if (diff < 1440) return Math.floor(diff / 60) + ' 小时前';
    if (diff < 10080) return Math.floor(diff / 1440) + ' 天前';
    return d.format('YYYY-MM-DD');
  };
  u.sizeFmt = function (n) {
    if (n == null || n === 0) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = Number(n);
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return (i === 0 ? v : v.toFixed(1)) + ' ' + units[i];
  };
  u.typeLabel = function (t) {
    return { image: '图片', audio: '音频', video: '视频' }[t] || t;
  };
  u.typeIcon = function (t) {
    return { image: '🖼️', audio: '🎵', video: '🎬' }[t] || '📄';
  };
  u.colorOf = function (t) {
    return { image: '#7a9e6e', audio: '#b4783f', video: '#8a6db3' }[t] || '#aaa';
  };
  // color utility
  u.autoColor = function (seed) {
    const palette = ['#8a5a34', '#4f6d7a', '#7a6e8f', '#5c7f6a', '#a0503c', '#8f7b3a', '#3f7d86', '#9c6a9d', '#557a52', '#b0654f'];
    let h = 0;
    const s = String(seed);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  };
  u.md = function (text) {
    try {
      const mk = marked.parse(String(text || ''), { gfm: true, breaks: true });
      return mk;
    } catch (e) {
      return String(text || '');
    }
  };
  u.stripMd = function (text) {
    return String(text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_`~|-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };
  u.summary = function (mdText, len) {
    const t = u.stripMd(mdText).replace(/\n/g, ' ');
    return t.length > (len || 60) ? t.slice(0, len || 60) + '…' : t;
  };
  u.esc = function (s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };
  // safe localStorage
  u.getStore = function (key, def) {
    try {
      const raw = window.localStorage.getItem('wzscms.' + key);
      return raw == null ? def : raw === 'false' ? false : raw === 'true' ? true : raw;
    } catch (e) {
      return def;
    }
  };
  u.setStore = function (key, val) {
    try {
      window.localStorage.setItem('wzscms.' + key, String(val));
    } catch (e) {
      /* ignore */
    }
  };
  u.uid = function () {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };
  u.qs = function (key) {
    const m = new URLSearchParams(window.location.hash.split('?')[1] || '');
    return m.get(key);
  };
  u.mediaUrl = function (r) {
    return '/api/resource/' + r.id + '/file';
  };
  u.pickFile = function (accept) {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      if (accept) inp.accept = accept;
      inp.onchange = () => resolve(inp.files && inp.files[0] ? inp.files[0] : null);
      inp.click();
    });
  };
  u.b64 = function (file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  };
  // simple dom helper for download
  u.downloadUrl = function (url, name) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name || '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  // tag tree helpers
  u.rootTags = function (tags) {
    return tags.filter((t) => !t.parents || t.parents.length === 0);
  };
  // 以「主父级」构建唯一树：childrenPrimaryOf(id) 返回以该 tag 为主父级的直接子标签
  u.primaryParentOf = function (t) {
    return t && t.parents && t.parents.length ? t.parents[0] : null;
  };
  u.primaryChildren = function (tags, id) {
    return tags.filter((t) => {
      const p = u.primaryParentOf(t);
      return p && p.id === id;
    });
  };
  // 多语言名显示：中文名 | 英文名 | 本土语言名（空槽省略；全空回退到主名 name）
  u.langLabel = { zh: '中文名', en: '英文名', native: '本土语言名' };
  u.tName = function (t) {
    if (!t) return '';
    const zh = String(t.name_zh || '').trim();
    const en = String(t.name_en || '').trim();
    const nat = String(t.name_native || '').trim();
    const parts = [];
    if (zh) parts.push(zh);
    if (en) parts.push(en);
    if (nat) parts.push(nat);
    if (!parts.length) return String(t.name || '').trim() || (t.id != null ? '#' + t.id : '');
    return parts.join('|');
  };
  // 判断一段文字应归入哪个语言槽（与服务端 classifyName 规则一致）
  u.detectLang = function (s) {
    const str = String(s || '').trim();
    if (!str) return 'other';
    if (/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3007]/.test(str)) return 'zh';
    if (/[\u0370-\u03FF\u0400-\u04FF\u0530-\u058F\u0590-\u05FF\u0600-\u06FF\u0900-\u0DFF\u0E00-\u0E7F\u0E80-\u0EFF\u0F00-\u0FFF\u10A0-\u10FF\u1200-\u139F\u2D80-\u2DDF\u3040-\u30FF\u31F0-\u31FF\uAC00-\uD7AF]/.test(str)) return 'native';
    if (/^[\sA-Za-z\u00C0-\u024F\u1E00-\u1EFF'’`'.,·:0-9()\-/&+]+$/.test(str)) return 'en';
    return 'native';
  };
  u.subtreeOf = function (tags, rootId, includeSelf) {
    const out = [];
    const seen = new Set();
    const walk = (id) => {
      if (seen.has(id)) return;
      seen.add(id);
      if (id !== rootId || includeSelf) out.push(id);
      for (const c of u.primaryChildren(tags, id)) walk(c.id);
    };
    walk(rootId);
    return out;
  };
  u.treeOf = function (tags) {
    return u.rootTags(tags).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  };
  u.sortTags = function (arr) {
    return arr.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  };
  u.allDescIds = function (tags, rootId, includeSelf) {
    const out = [];
    const seen = new Set();
    const walk = (id) => {
      if (seen.has(id)) return;
      seen.add(id);
      if (id !== rootId || includeSelf) out.push(id);
      const t = tags.find((x) => x.id === id);
      if (t) for (const c of t.children || []) walk(c.id);
    };
    walk(rootId);
    return out;
  };
  u.breadcrumb = function (tags, tag) {
    const chain = [];
    const seen = new Set();
    let cur = tag;
    while (cur && cur.parents && cur.parents.length && !seen.has(cur.id)) {
      seen.add(cur.id);
      const pid = cur.parents[0] ? cur.parents[0].id : null;
      if (!pid) break;
      const p = tags.find((x) => x.id === pid);
      if (!p) break;
      chain.unshift(p);
      cur = p;
    }
    return chain;
  };
  // 当天日期键（yyyy-mm-dd，本地时区），用于每日更换类的可复现随机
  u.dayKey = function () {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
  // 由种子字符串生成可复现的伪随机函数（mulberry32）
  u.seedRand = function (seedStr) {
    let a = 1779033703;
    const s = String(seedStr || '');
    for (let i = 0; i < s.length; i++) a = Math.imul(a ^ s.charCodeAt(i), 3432918353) >>> 0;
    a = Math.imul(a ^ (a >>> 13), 2246822507) >>> 0;
    return function () {
      a = Math.imul(a ^ (a >>> 15), 4022730753) >>> 0;
      a = (a ^ (a >>> 14)) >>> 0;
      return a / 4294967296;
    };
  };
  window.$$ = u;
})();
