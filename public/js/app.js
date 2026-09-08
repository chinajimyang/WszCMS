'use strict';
(function () {
  const { createApp, h } = Vue;
  const EP = window.ElementPlus;
  const Icons = window.ElementPlusIconsVue || {};

  // ---------- root app ----------
  const SidebarTreeNode = {
    name: 'WzSidebarNode',
    props: { tag: Object, active: { type: Boolean, default: false } },
    data() {
      return { open: false };
    },
    computed: {
      children() {
        return $$.primaryChildren(DB.tags, this.tag.id).slice(0, 60);
      },
      cnt() {
        return DB.resourcesOfTag(this.tag.id, true).length;
      },
    },
    methods: {
      toggle() {
        this.open = !this.open;
      },
    },
    template: `
<div>
  <div class="tree-row" :class="{active}">
    <span v-if="children.length" class="tree-caret" :class="{open}" @click.stop="toggle">▶</span>
    <span v-else style="width:14px"></span>
    <span style="cursor:pointer;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" @click="DB.navigate('/tag/'+tag.id)">{{ $$.tName(tag) }}</span>
    <span v-if="cnt" style="font-size:11px;color:#9d8e78">{{ cnt>99?'99+':cnt }}</span>
  </div>
  <div v-if="open && children.length">
    <WzSidebarNode v-for="c in children" :key="c.id" :tag="c" />
  </div>
</div>`,
  };

  const AppRoot = {
    components: { WzSidebarNode: SidebarTreeNode },
    data() {
      return { globalUpload: false, quick: '', sidebarOpen: $$.getStore('sidebarOpen', true) };
    },
    computed: {
      viewName() {
        return DB.route ? DB.route.name : 'home';
      },
      currentView() {
        return AppViews[this.viewName] || AppViews.home;
      },
      navItems() {
        return [
          { k: 'home', label: '首页', icon: '🏠' },
          { k: 'library', label: '资源库', icon: '🗂' },
          { k: 'tags', label: '标签总览', icon: '🏷' },
          { k: 'tag-manage', label: '标签管理', icon: '🌳' },
          { k: 'settings', label: '设置', icon: '⚙' },
        ];
      },
      rootTags() {
        return $$.treeOf(DB.tags);
      },
      crumbs() {
        const map = { home: '首页', library: '资源库', tags: '标签总览', 'tag-manage': '标签管理', settings: '设置', resource: '资源详情', tag: '标签详情' };
        return map[this.viewName] || '';
      },
    },
    methods: {
      toggleSidebar() {
        this.sidebarOpen = !this.sidebarOpen;
        $$.setStore('sidebarOpen', this.sidebarOpen ? 'true' : 'false');
      },
      go(k) {
        if (k === 'home') DB.navigate('/home');
        else if (k === 'library') DB.navigate('/library');
        else if (k === 'tags') DB.navigate('/tags');
        else if (k === 'tag-manage') DB.navigate('/tag-manage');
        else if (k === 'settings') DB.navigate('/settings');
      },
      quickGo() {
        const kw = this.quick.trim();
        this.quick = '';
        DB.navigate('/library?q=' + encodeURIComponent(kw));
      },
      upload() {
        this.globalUpload = true;
      },
      logoutHint() {},
    },
    template: `
<div class="app-shell">
  <aside class="sidebar" v-show="sidebarOpen">
    <div class="brand">
      <div class="brand-logo">📚</div>
      <div style="min-width:0">
        <div class="brand-title">{{ DB.config.site.title || '文史哲知识库' }}</div>
        <div class="brand-sub">{{ DB.config.site.subtitle || '文学 · 历史 · 哲学' }}</div>
      </div>
    </div>
    <div class="side-nav">
      <div v-for="it in navItems" :key="it.k" class="nav-item" :class="{active:viewName===it.k}" @click="go(it.k)">
        <span class="ico">{{ it.icon }}</span><span>{{ it.label }}</span>
      </div>
      <div v-if="rootTags.length" class="nav-group">标签导航（点击展开）</div>
      <div class="tag-tree" v-if="rootTags.length">
        <div v-for="rt in rootTags" :key="rt.id">
          <WzSidebarNode :tag="rt" />
        </div>
      </div>
    </div>
    <div class="side-foot">文史哲知识库 v1.0 · 本地运行</div>
  </aside>

  <div class="main">
    <header class="topbar">
      <div class="crumb">
        <el-button text :title="sidebarOpen ? '隐藏左侧边栏' : '显示左侧边栏'" @click="toggleSidebar" style="padding:3px;font-size:16px;color:var(--muted);cursor:pointer">{{ sidebarOpen ? '◱' : '☰' }}</el-button>
        <span>▣ {{ crumbs }}</span>
      </div>
      <div class="topbar-spacer"></div>
      <el-input v-model="quick" placeholder="全文搜索（名称/介绍）" style="width:240px" clearable @keyup.enter="quickGo" @clear="quickGo">
        <template #append><el-button @click="quickGo">搜索</el-button></template>
      </el-input>
      <el-button type="primary" @click="upload">+ 上传资源</el-button>
    </header>
    <main class="content">
      <component :is="currentView" :key="DB.route.path" v-if="DB.loaded" />
      <div v-else class="empty-hint">正在加载资源库……</div>
    </main>
  </div>
  <ResourceFormDialog :visible="globalUpload" @update:visible="globalUpload=$event" />
</div>`,
  };

  async function main() {
    const app = createApp(AppRoot);
    app.use(EP, { size: 'small' });
    // register all icons
    for (const name of Object.keys(Icons)) app.component(name, Icons[name]);
    // register common components
    const CS = window.AppComponents || {};
    for (const name of Object.keys(CS)) app.component(name, CS[name]);
    app.config.globalProperties.DB = DB;
    app.config.globalProperties.$$ = $$;
    app.config.globalProperties.API = API;
    app.config.globalProperties.ElementPlus = EP;
    app.mount('#app');

    window.addEventListener('hashchange', () => DB.parseHash());
    DB.parseHash();
    try {
      await DB.refresh();
    } catch (e) {
      alert('加载数据失败：' + (e.message || e));
    }
  }
  main();
})();
