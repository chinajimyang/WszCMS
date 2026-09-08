'use strict';
(function () {
  const DB = Vue.reactive({
    loaded: false,
    config: { folders: {}, home: { menu: [], modules: [] }, site: {} },
    resources: [],
    tags: [],
    stats: {},
    route: { path: '/', params: {} },
  });

  // mapping helpers
  DB.tagById = function (id) {
    return DB.tags.find((t) => t.id === id);
  };
  // 匹配主名或任一语言名或完整显示名（用于快速创建时识别已有标签）
  DB.tagByName = function (name) {
    const s = String(name || '').trim();
    if (!s) return undefined;
    return DB.tags.find(
      (t) => t.name === s || (t.name_zh || '') === s || (t.name_en || '') === s || (t.name_native || '') === s || $$.tName(t) === s
    );
  };
  DB.resourceById = function (id) {
    return DB.resources.find((r) => r.id === Number(id));
  };
  DB.resourcesOfTag = function (tagId, includeDesc) {
    const ids = includeDesc ? new Set($$.allDescIds(DB.tags, tagId, true)) : new Set([tagId]);
    return DB.resources.filter((r) => (r.tags || []).some((t) => ids.has(t)));
  };
  DB.latestOfTag = function (tagId, excludeId, n) {
    return DB.resourcesOfTag(tagId, false)
      .filter((r) => r.id !== excludeId)
      .slice(0, n || 5);
  };
  DB.resourceTypeCount = function (type) {
    return type ? DB.resources.filter((r) => r.type === type).length : DB.resources.length;
  };

  let refreshing = false;
  DB.refresh = async function () {
    if (refreshing) return;
    refreshing = true;
    try {
      const j = await API.get('/api/bootstrap');
      DB.config = j.config;
      DB.resources = j.resources || [];
      DB.tags = j.tags || [];
      DB.stats = j.stats || {};
      DB.loaded = true;
      // flattened tag options with path prefix
      const flat = [];
      const seen = new Set();
      const walk = (id, prefix) => {
        const t = DB.tagById(id);
        if (!t || seen.has(t.id)) return;
        seen.add(t.id);
        const disp = $$.tName(t);
        flat.push({ id: t.id, name: disp, path: prefix + disp, disp });
        for (const c of t.children || []) walk(c.id, prefix + disp + ' / ');
      };
      for (const rt of $$.rootTags(DB.tags)) walk(rt.id, '');
      DB.tagOptions = flat.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
    } finally {
      refreshing = false;
    }
  };

  // ---- routing helpers (hash) ----
  DB.navigate = function (path) {
    window.location.hash = '#' + path;
  };
  DB.parseHash = function () {
    let h = window.location.hash.replace(/^#/, '');
    if (!h || h === '/') h = '/home';
    const seg = h.split('?')[0].split('/').filter(Boolean);
    const q = new URLSearchParams((h.split('?')[1] || ''));
    const state = { path: h, name: seg[0] || 'home', params: seg.slice(1), query: q };
    DB.route = state;
    return state;
  };

  window.DB = DB;
  window.reloadAll = DB.refresh;
})();
