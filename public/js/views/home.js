'use strict';
(function () {
  const Views = window.AppViews = window.AppViews || {};

  // ---- module renderers are pure functions returning vnodes via components ----
  const ModuleCarousel = {
    props: { module: Object },
    computed: {
      items() {
        const tagId = this.module.tagId;
        if (!tagId) return [];
        let list = DB.resourcesOfTag(tagId, true).filter((r) => r.type === 'image' || r.type === 'video');
        list = list.slice(0, 10);
        return list;
      },
      tag() {
        return this.module.tagId ? DB.tagById(this.module.tagId) : null;
      },
    },
    methods: {
      open(r) {
        DB.navigate('/resource/' + r.id);
      },
    },
    template: `
<div class="home-mod">
  <div class="home-mod-head">
    <h2>{{ module.title || (tag ? $$.tName(tag) + ' · 轮播' : '轮播') }}</h2>
    <div class="sub" v-if="tag">{{ $$.tName(tag) }}标签下的媒体自动轮播</div>
    <span class="more">
      <el-link v-if="tag" type="primary" @click="DB.navigate('/tag/'+tag.id)">进入标签 →</el-link>
    </span>
  </div>
  <div v-if="items.length" class="carousel-home">
    <el-carousel height="360px" :interval="4500" indicator-position="outside">
      <el-carousel-item v-for="r in items" :key="r.id">
        <div class="carousel-item-media" @click="open(r)">
          <img v-if="r.type==='image'" :src="'/api/resource/'+r.id+'/file'" />
          <video v-else :src="'/api/resource/'+r.id+'/file'" muted loop controls preload="metadata"></video>
          <div class="carousel-item-cap">🖼 {{ r.title }}</div>
        </div>
      </el-carousel-item>
    </el-carousel>
  </div>
  <el-empty v-else description="该标签暂无图片/视频，请先在首页设置中绑定标签" :image-size="70"></el-empty>
</div>`,
  };

  const ModuleMarkdown = {
    props: { module: Object },
    template: `
<div class="home-mod">
  <div class="home-mod-head"><h2>{{ module.title || '介绍' }}</h2></div>
  <div class="card"><MdView :content="module.content || ''" /></div>
</div>`,
  };

  const ModuleResourceGrid = {
    props: { module: Object },
    computed: {
      list() {
        let list;
        if (this.module.type === 'featured') list = DB.resources.filter((r) => r.featured);
        else if (this.module.type === 'latest') list = DB.resources.slice();
        else if (this.module.tagId) list = DB.resourcesOfTag(this.module.tagId, true);
        else list = DB.resources.slice();
        if (this.module.type !== 'featured') list = list.slice().sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
        return list.slice(0, this.module.limit || 12);
      },
      showMore() {
        return this.module.tagId || this.module.type === 'latest';
      },
      total() {
        if (this.module.type === 'featured') return DB.stats.featured || 0;
        if (this.module.tagId) return DB.resourcesOfTag(this.module.tagId, true).length;
        return DB.resources.length;
      },
    },
    template: `
<div class="home-mod">
  <div class="home-mod-head">
    <h2>{{ module.title }}</h2>
    <div class="sub" v-if="module.type==='featured'">被标记为「推荐」的资源</div>
    <div class="sub" v-else-if="module.type==='latest'">最近收录的{{ total }}个资源</div>
    <span class="more"><el-link v-if="module.tagId" type="primary" @click="DB.navigate('/library?tag='+module.tagId)">查看全部 →</el-link></span>
  </div>
  <el-empty v-if="!list.length" description="暂无资源" :image-size="70"></el-empty>
  <div v-else class="grid res-grid">
    <ResourceCard v-for="r in list" :key="r.id" :resource="r" show-tag />
  </div>
</div>`,
  };

  const ViewModule = {
    props: { module: Object },
    components: { ModuleCarousel, ModuleMarkdown, ModuleResourceGrid },
    computed: {
      isGrid() { return ['featured', 'latest', 'tagGrid'].includes(this.module.type); },
      isCarousel() { return this.module.type === 'tagCarousel'; },
    },
    template: `
<div>
  <ModuleCarousel v-if="module.type==='tagCarousel'" :module="module" />
  <ModuleMarkdown v-else-if="module.type==='markdown'" :module="module" />
  <ModuleResourceGrid v-else-if="module.enabled !== false" :module="module" />
  <div v-else style="display:none"></div>
</div>`,
  };

  // ---- home editor dialog ----
  const HomeEditor = {
    props: { visible: Boolean },
    emits: ['update:visible'],
    data() {
      return { tab: 'modules', menu: [], modules: [], saving: false };
    },
    watch: {
      visible(v) {
        if (v) {
          this.menu = JSON.parse(JSON.stringify(DB.config.home.menu || []));
          this.modules = JSON.parse(JSON.stringify(DB.config.home.modules || []));
          this.tab = 'modules';
        }
      },
    },
    methods: {
      close() { this.$emit('update:visible', false); },
      addMenu() {
        this.menu.push({ label: '新菜单', type: 'route', value: '/library', icon: '' });
      },
      autoModuleTitle(m) {
        const t = this.moduleTypes().find((x) => x.value === m.type);
        if (!t) return;
        const defaults = { featured: '精选推荐', latest: '最新内容', tagGrid: '标签资源', tagCarousel: '标签轮播', markdown: '文本卡片' };
        m.title = defaults[m.type] || m.title;
      },
      removeMenu(i) { this.menu.splice(i, 1); },
      move(arr, i, d) {
        const j = i + d;
        if (j < 0 || j >= arr.length) return;
        const t = arr[i];
        arr.splice(i, 1);
        arr.splice(j, 0, t);
      },
      menuTypes() {
        return [
          { value: 'route', label: '内部页面', examples: '/home /library /tags /settings' },
          { value: 'libraryType', label: '资源分类', examples: 'image audio video 或留空=全部' },
          { value: 'url', label: '外部链接', examples: 'https://...' },
        ];
      },
      moduleTypes() {
        return [
          { value: 'featured', label: '精选推荐（推荐内容）' },
          { value: 'latest', label: '最新内容' },
          { value: 'tagGrid', label: '标签资源墙（网格）' },
          { value: 'tagCarousel', label: '标签媒体轮播（图片/视频）' },
          { value: 'markdown', label: '文本卡片（Markdown）' },
        ];
      },
      addModule() {
        this.modules.push({ id: $$.uid(), type: 'latest', title: '最新内容', enabled: true, tagId: null, limit: 12, content: '' });
      },
      removeModule(i) { this.modules.splice(i, 1); },
      openMenuGo(menu) {
        // helper: quick navigation target presets for label
        let target = '';
        if (menu.type === 'route') target = menu.value || '/home';
        else if (menu.type === 'libraryType') target = '/library' + (menu.value ? '?type=' + menu.value : '');
        else if (menu.type === 'url') target = menu.value;
        if (target) window.open(target.startsWith('http') ? target : '#' + target, target.startsWith('http') ? '_blank' : '_self');
      },
      async save() {
        // clean data
        const home = {
          menu: this.menu.filter((m) => m.label),
          modules: this.modules.filter((m) => m.title && m.type).map((m) => ({
            id: m.id, type: m.type, title: m.title, enabled: m.enabled !== false,
            tagId: m.tagId || null, limit: m.limit || 12, content: m.content || '',
          })),
        };
        this.saving = true;
        try {
          await API.put('/api/config', { home });
          await DB.refresh();
          ElementPlus.ElMessage.success('首页已更新');
          this.close();
        } catch (e) {
          ElementPlus.ElMessage.error(e.message || '保存失败');
        } finally {
          this.saving = false;
        }
      },
    },
    template: `
<el-dialog :model-value="visible" @update:model-value="$emit('update:visible',$event)" title="自定义首页" width="860px" :close-on-click-modal="false">
  <el-tabs v-model="tab">
    <el-tab-pane label="模块管理" name="modules">
      <div class="text-muted" style="margin-bottom:8px">模块自上而下按顺序显示。内置推荐 / 最新 / 标签资源等模块，可增删排序并配置。类型为图片时，<b>推荐资源</b>在资源编辑中标记。</div>
      <div v-for="(m,i) in modules" :key="m.id" class="card" style="margin-bottom:10px;padding:12px 16px;display:flex;gap:12px;align-items:flex-start">
        <div style="display:flex;flex-direction:column;gap:2px;padding-top:6px">
          <el-button text size="small" @click="move(modules,i,-1)">▲</el-button>
          <el-button text size="small" @click="move(modules,i,1)">▼</el-button>
          <el-button text size="small" type="danger" @click="removeModule(i)">✕</el-button>
        </div>
        <div style="flex:1;display:grid;grid-template-columns:220px 1fr auto;gap:10px;align-items:center">
          <el-select v-model="m.type" size="small" style="width:100%" @change="autoModuleTitle(m,i)">
            <el-option v-for="t in moduleTypes()" :key="t.value" :value="t.value" :label="t.label"></el-option>
          </el-select>
          <el-input v-model="m.title" size="small" placeholder="模块标题"></el-input>
          <el-switch v-model="m.enabled" active-text="显示"></el-switch>
        </div>
        <div style="flex:2">
          <div v-if="m.type==='tagGrid' || m.type==='tagCarousel'" style="margin:6px 0">
            <span class="text-muted" style="font-size:12px">选择标签：</span>
            <el-select v-model="m.tagId" filterable size="small" style="width:200px">
              <el-option v-for="t in DB.tagOptions" :key="t.id" :value="t.id" :label="t.path"></el-option>
            </el-select>
          </div>
          <div v-if="m.type==='latest'" style="margin:6px 0">
            <span class="text-muted" style="font-size:12px">显示数量：</span>
            <el-input-number v-model="m.limit" :min="1" :max="60" size="small"></el-input-number>
          </div>
          <div v-if="m.type==='markdown'" style="margin:6px 0">
            <MdEditor v-model="m.content" min-height="120px" placeholder="模块内容（Markdown），可写站点介绍、导航说明等" />
          </div>
          <div v-if="m.type==='featured' || m.type==='tagGrid' || m.type==='tagCarousel'" class="text-muted" style="font-size:12px">
            {{ m.type==='featured' ? '自动展示标记为推荐的最新资源' : '' }}{{ m.type==='tagGrid' ? '展示该标签（含子标签）资源网格' : '' }}{{ m.type==='tagCarousel' ? '图片与视频自动轮播' : '' }}
          </div>
        </div>
      </div>
      <el-button type="primary" plain @click="addModule">+ 添加模块</el-button>
    </el-tab-pane>

    <el-tab-pane label="菜单栏" name="menu">
      <div class="text-muted" style="margin-bottom:8px">首页顶部菜单栏，可指向内部页面、资源分类或外部链接。</div>
      <div v-for="(m,i) in menu" :key="i" class="card" style="margin-bottom:8px;padding:10px 14px;display:flex;gap:8px;align-items:center">
        <el-input v-model="m.label" placeholder="菜单文字" style="width:140px"></el-input>
        <el-select v-model="m.type" style="width:130px">
          <el-option v-for="t in menuTypes()" :key="t.value" :value="t.value" :label="t.label"></el-option>
        </el-select>
        <el-input v-model="m.value" placeholder="目标：/library?type=image、/tag/2、网址等" style="flex:1"></el-input>
        <el-button text @click="move(menu,i,-1)">▲</el-button>
        <el-button text @click="move(menu,i,1)">▼</el-button>
        <el-button text type="danger" @click="removeMenu(i)">✕</el-button>
      </div>
      <el-button type="primary" plain @click="addMenu">+ 添加菜单项</el-button>
      <div class="text-muted" style="font-size:12px;margin-top:6px">
        提示：类型「内部页面」填 /home、/library、/tags、/settings、/tag-manage 等；「资源分类」填 image/audio/video 或留空（全部）。
      </div>
    </el-tab-pane>
  </el-tabs>
  <template #footer>
    <el-button @click="close">取消</el-button>
    <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
  </template>
</el-dialog>`,
  };

  const menuGo = function (m) {
    let target = '';
    if (m.type === 'route') target = m.value || '/home';
    else if (m.type === 'libraryType') target = '/library' + (m.value ? '?type=' + m.value : '');
    else if (m.type === 'url') target = m.value;
    if (!target) return;
    if (target.startsWith('http')) window.open(target, '_blank');
    else DB.navigate(target);
  };

  // ---- Home page view ----
  Views.home = {
    components: { ViewModule, HomeEditor },
    data() {
      return { editorVisible: false, showForm: false };
    },
    computed: {
      menu() {
        return DB.config.home.menu || [];
      },
      modules() {
        return (DB.config.home.modules || []).filter((m) => m.enabled !== false);
      },
      latest3() {
        return DB.resources.slice(0, 4);
      },
    },
    methods: {
      menuGo,
    },
    template: `
<div>
  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px">
    <h1 style="font-size:26px;margin:6px 0">{{ DB.config.site.title || '文史哲知识库' }}</h1>
    <div class="text-muted" style="font-family:serif">{{ DB.config.site.subtitle || '' }}</div>
    <span style="flex:1"></span>
    <el-button type="primary" @click="editorVisible=true"><b>✎</b> 自定义首页</el-button>
    <el-button type="success" plain @click="showForm=true"><b>+</b> 上传资源</el-button>
  </div>

  <!-- stats -->
  <div class="stats-row">
    <div class="stat-chip"><b>{{ DB.stats.resources || 0 }}</b>资源总数</div>
    <div class="stat-chip"><b>{{ DB.stats.images || 0 }}</b>图片</div>
    <div class="stat-chip"><b>{{ DB.stats.audios || 0 }}</b>音频</div>
    <div class="stat-chip"><b>{{ DB.stats.videos || 0 }}</b>视频</div>
    <div class="stat-chip"><b>{{ DB.stats.tags || 0 }}</b>标签</div>
    <div class="stat-chip"><b>{{ DB.stats.featured || 0 }}</b>推荐</div>
  </div>

  <!-- custom menu bar -->
  <div v-if="menu.length" class="card" style="padding:8px 10px;margin-bottom:20px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
    <span class="text-muted" style="font-size:12px;margin-right:4px">☰ 导航：</span>
    <el-button v-for="(m,i) in menu" :key="i" size="small" plain @click="menuGo(m)">{{ m.label }}</el-button>
  </div>

  <!-- modules -->
  <div v-for="m in modules" :key="m.id || m.type">
    <ViewModule :module="m" />
  </div>
  <div v-if="!modules.length" class="card empty-hint">首页暂无内容模块，点击右上角「自定义首页」添加（如推荐、最新、标签轮播）。</div>

  <ResourceFormDialog :visible="showForm" @update:visible="showForm=$event" />
  <HomeEditor :visible="editorVisible" @update:visible="editorVisible=$event" />
</div>`,
  };
})();
