'use strict';
(function () {
  const Views = window.AppViews = window.AppViews || {};

  // ================== zoomable image lightbox ==================
  const ZoomViewer = {
    props: { src: String, title: { type: String, default: '' } },
    emits: ['close'],
    data() {
      return { scale: 1, rotate: 0, tx: 0, ty: 0, dragging: false, sx: 0, sy: 0 };
    },
    computed: {
      styleObj() {
        return {
          transform: `translate(${this.tx}px, ${this.ty}px) scale(${this.scale}) rotate(${this.rotate}deg)`,
        };
      },
    },
    methods: {
      zoom(d) {
        this.scale = Math.min(8, Math.max(0.2, +(this.scale * (d > 0 ? 1.25 : 0.8)).toFixed(3)));
      },
      wheel(e) {
        e.preventDefault();
        this.zoom(e.deltaY < 0 ? 1 : -1);
      },
      reset() {
        this.scale = 1;
        this.rotate = 0;
        this.tx = 0;
        this.ty = 0;
      },
      rotate90() {
        this.rotate = (this.rotate + 90) % 360;
      },
      onDown(e) {
        this.dragging = true;
        this.sx = e.clientX - this.tx;
        this.sy = e.clientY - this.ty;
      },
      onMove(e) {
        if (!this.dragging) return;
        this.tx = e.clientX - this.sx;
        this.ty = e.clientY - this.sy;
      },
      onUp() {
        this.dragging = false;
      },
      esc(e) {
        if (e.key === 'Escape') this.$emit('close');
      },
      download() {
        $$.downloadUrl(this.src, this.title || 'image');
      },
    },
    mounted() {
      window.addEventListener('keydown', this.esc);
    },
    beforeUnmount() {
      window.removeEventListener('keydown', this.esc);
    },
    template: `
<div>
  <div class="zoom-overlay" :class="{grabbing:dragging}" @wheel.prevent="wheel" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointerleave="onUp">
    <img :src="src" :style="styleObj" draggable="false" @dblclick="reset" />
  </div>
  <div class="zoom-bar">
    <button title="缩小" @click="zoom(-1)">➖</button>
    <button title="放大" @click="zoom(1)">➕</button>
    <button title="适应" @click="reset">⛶</button>
    <button title="旋转" @click="rotate90">↻</button>
    <button title="下载" @click="download">⬇</button>
    <button title="关闭(Esc)" @click="$emit('close')">✕</button>
  </div>
</div>`,
  };
  // 暴露为全局组件，供标签页轮播等其它视图做图片放大查看
  window.AppComponents = window.AppComponents || {};
  window.AppComponents.ZoomViewer = ZoomViewer;

  // ================== detail page ==================
  Views.resource = {
    components: { ZoomViewer, ResourceFormDialog: window.AppComponents.ResourceFormDialog },
    data() {
      return {
        resource: null,
        loading: true,
        zoom: false,
        showForm: false,
        rawDialog: false,
        rawText: '',
      };
    },
    computed: {
      rid() {
        return Number(DB.route.params[0]);
      },
      relatedCount() {
        return this.resource ? (this.resource.tags || []).length : 0;
      },
      // 每个关联标签沿「主父级」链上溯，合并出一棵只含「上级标签 → 关联标签」的层级树
      relatedTree() {
        const res = this.resource;
        if (!res || !DB.tags.length) return [];
        const taggedIds = new Set((res.tags || []).map(Number));
        const byId = new Map();
        const roots = [];
        const nodeOf = (tid) => {
          let n = byId.get(tid);
          if (!n) {
            const tag = DB.tagById(tid);
            if (!tag) return null;
            n = { id: tid, tag, tagged: taggedIds.has(tid), children: [] };
            byId.set(tid, n);
          }
          return n;
        };
        for (const tid of taggedIds) {
          const chain = [];
          let cur = DB.tagById(tid);
          const seen = new Set();
          let guard = 0;
          while (cur && !seen.has(cur.id) && guard++ < 80) {
            seen.add(cur.id);
            chain.unshift(cur.id);
            // parents 已按主父级优先排序，取第一个即主父级
            const pp = (cur.parents || [])[0];
            cur = pp ? DB.tagById(pp.id) : null;
          }
          let holder = roots;
          for (const cid of chain) {
            const n = nodeOf(cid);
            if (!n) break;
            if (!holder.includes(n)) holder.push(n);
            holder = n.children;
          }
        }
        const sorter = (a, b) => (a.tag.sort_order || 0) - (b.tag.sort_order || 0) || a.tag.id - b.tag.id;
        const sortDeep = (arr) => {
          arr.sort(sorter);
          arr.forEach((x) => sortDeep(x.children));
        };
        sortDeep(roots);
        return roots;
      },
      primaryTag() {
        if (!this.resource || !this.resource.primary_tag) return null;
        return DB.tagById(this.resource.primary_tag) || null;
      },
      descHtml() {
        return $$.md(this.resource ? this.resource.description_md : '');
      },
      absTitle() {
        return this.resource ? this.resource.title : '';
      },
    },
    watch: {
      rid() {
        this.load();
      },
    },
    async created() {
      await this.load();
    },
    methods: {
      async load() {
        this.loading = true;
        try {
          const j = await API.get('/api/resource/' + this.rid);
          this.resource = j.resource;
        } catch (e) {
          this.resource = null;
          ElementPlus.ElMessage.error(e.message || '加载失败');
        } finally {
          this.loading = false;
        }
      },
      goBack() {
        if (history.length > 1) history.back();
        else DB.navigate('/library');
      },
      tagsOf(r) {
        return (r.tags || []).map((id) => DB.tagById(id)).filter(Boolean);
      },
      mediaUrl() {
        return this.resource ? '/api/resource/' + this.resource.id + '/file' : '';
      },
      openTag(tag) {
        DB.navigate('/tag/' + tag.id);
      },
      async toggleFeatured() {
        const r = this.resource;
        try {
          const fd = new FormData();
          fd.append('featured', r.featured ? '0' : '1');
          await API.sendForm('/api/resource/' + r.id, fd, 'PUT');
          r.featured = !r.featured;
          await DB.refresh();
          ElementPlus.ElMessage.success(r.featured ? '已设为推荐' : '已取消推荐');
        } catch (e) { ElementPlus.ElMessage.error(e.message || '操作失败'); }
      },
      async del() {
        try {
          await ElementPlus.ElMessageBox.confirm('确定删除该资源吗？勾选删除将同时删除本地媒体文件与生成的 Markdown。', '删除确认', { type: 'warning' });
          await API.del('/api/resource/' + this.resource.id + '?file=1');
          ElementPlus.ElMessage.success('已删除');
          this.goBack();
        } catch (e) {
          if (e !== 'cancel' && e !== 'close') ElementPlus.ElMessage.error(e.message || '删除失败');
        }
      },
      download() {
        $$.downloadUrl('/api/resource/' + this.resource.id + '/file', this.resource.media_name || '');
      },
      open(r) {
        DB.navigate('/resource/' + r.id);
      },
      async viewRaw() {
        try {
          const resp = await fetch('/api/resource/' + this.resource.id + '/raw');
          this.rawText = await resp.text();
          this.rawDialog = true;
        } catch (e) {
          ElementPlus.ElMessage.error('获取失败');
        }
      },
      async copyRaw() {
        try {
          await navigator.clipboard.writeText(this.rawText);
          ElementPlus.ElMessage.success('已复制');
        } catch (e) {
          ElementPlus.ElMessage.error('复制失败');
        }
      },
    },
    template: `
<div v-loading="loading">
  <template v-if="resource">
    <div class="breadcrumb-line" style="margin-bottom:4px">
      <a style="cursor:pointer;color:var(--muted)" @click="goBack">‹ 返回</a>
      <span>·</span><span>资源详情</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
      <h1 class="detail-title" style="margin-bottom:0">{{ resource.title || '(未命名)' }}</h1>
      <el-tag v-if="resource.featured" type="warning" size="small" effect="dark">⭐ 推荐</el-tag>
      <span style="flex:1"></span>
      <el-button @click="showForm=true">✎ 编辑</el-button>
      <el-button @click="download" plain>下载原文件</el-button>
      <el-dropdown>
        <el-button>⋯</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="toggleFeatured">{{ resource.featured?'取消推荐':'设为推荐' }}</el-dropdown-item>
            <el-dropdown-item @click="viewRaw">查看 Markdown</el-dropdown-item>
            <el-dropdown-item divided style="color:#c0392b" @click="del">删除资源</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
      <span class="type-badge" :class="'type-'+resource.type">{{ $$.typeLabel(resource.type) }}</span>
      <span class="tag-chip" v-for="tg in tagsOf(resource)" :key="tg.id" @click="openTag(tg)" :title="(tg.id===resource.primary_tag?'主标签·':'')+$$.tName(tg)">
        <i class="dot" :style="'background:'+(tg.color||'#c9a268')"></i>
        <b v-if="tg.id===resource.primary_tag" style="color:#c07a1e;margin-right:2px">★</b>{{ $$.tName(tg) }}
      </span>
      <span style="flex:1"></span>
      <span class="text-muted" style="font-size:12px">添加于 {{ $$.fmtTime(resource.created_at) }} · 更新于 {{ $$.fmtTime(resource.updated_at) }} · {{ $$.sizeFmt(resource.media_size) }}</span>
    </div>

    <div class="detail-layout">
      <div style="min-width:0">
        <!-- media stage -->
        <div class="media-stage" v-if="resource.media_path">
          <img v-if="resource.type==='image'" class="img-main" :src="mediaUrl()" @click="zoom=true" alt="" />
          <div v-else-if="resource.type==='video'">
            <video class="video-player" :src="mediaUrl()" controls playsinline preload="metadata" style="max-width:100%"></video>
          </div>
          <div v-else class="audio-player" style="padding:20px">
            <div style="font-size:34px">🎵</div>
            <div style="font-family:serif;font-size:17px;margin-bottom:10px">{{ resource.media_name }}</div>
            <audio controls :src="mediaUrl()" style="width:min(560px,90%)"></audio>
          </div>
        </div>
        <div v-else class="card empty-hint" style="margin-bottom:16px">该资源无媒体文件（纯文本 Markdown）</div>

        <div v-if="resource.type==='image'" class="text-muted" style="font-size:12px;margin:8px 2px">点击图片可放大/缩放/旋转（或鼠标滚轮缩放、拖拽平移）</div>

        <!-- description -->
        <div class="card" style="margin-top:16px">
          <div style="display:flex;align-items:center;margin-bottom:6px">
            <h2 style="font-size:17px;margin:0">内容介绍</h2>
            <span class="text-muted" style="font-size:12px;margin-left:10px">（Markdown，可通过「编辑」或本地 md 文件维护）</span>
            <span style="flex:1"></span>
          </div>
          <div v-if="resource.description_md"><MdView :content="resource.description_md" /></div>
          <div v-else class="text-muted" style="padding:20px 0;text-align:center">暂无介绍内容</div>
        </div>

        <!-- primary tag intro (below the resource description) -->
        <div v-if="primaryTag" class="card tag-intro-card" style="margin-top:12px">
          <div style="display:flex;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px">
            <h2 style="font-size:16px;margin:0;flex:none">主标签介绍 ·</h2>
            <span class="tag-chip" @click="openTag(primaryTag)" style="cursor:pointer"><i class="dot" :style="'background:'+(primaryTag.color||'#c9a268')"></i>{{ $$.tName(primaryTag) }}</span>
            <span style="flex:1"></span>
            <span class="text-muted" style="font-size:11px">可在「标签管理」或本地 t{{ primaryTag.id }}.md 维护</span>
          </div>
          <div v-if="primaryTag.description_md"><MdView :content="primaryTag.description_md" /></div>
          <div v-else class="text-muted" style="padding:12px 0;font-size:13px">该主标签暂无介绍文本</div>
        </div>
      </div>

      <!-- sidebar -->
      <div style="position:sticky;top:80px">
        <div class="card aside-panel">
          <div class="h">📌 关联标签（{{ relatedCount }}）</div>
          <div v-if="!relatedCount" class="text-muted" style="font-size:12px">尚未添加标签，编辑资源可添加多个标签。</div>
          <div v-else>
            <div class="text-muted" style="font-size:11px;margin-bottom:6px;line-height:1.7">每个标签的层级：<b class="path">上级标签 → 本标签</b>；<b style="color:#c07a1e">★</b> 为本资源关联的标签，点击任意层级可查看该分类。</div>
            <el-tree :data="relatedTree" node-key="id" default-expand-all :expand-on-click-node="false" :indent="12" class="rel-tree">
              <template #default="{ data }">
                <div class="rel-node" :class="{ tagged: data.tagged }" :title="$$.tName(data.tag)" @click.stop="openTag(data.tag)">
                  <i class="dot" :style="'background:'+(data.tag.color||'#c9a268')"></i>
                  <b v-if="data.tagged" style="color:#c07a1e;margin-right:2px">★</b>
                  <span class="rel-name">{{ $$.tName(data.tag) }}</span>
                </div>
              </template>
            </el-tree>
          </div>
        </div>
        <div class="card aside-panel">
          <div class="h">💡 操作提示</div>
          <div class="text-muted" style="font-size:12px;line-height:1.8">
            每条资源都会在 Markdown 目录下生成 <code class="path">r{{ resource.id }}.md</code>，可直接用本地编辑器修改内容介绍与标签，再在「设置 → Markdown 同步」导入。
          </div>
        </div>
      </div>
    </div>

    <ZoomViewer v-if="zoom" :src="mediaUrl()" :title="resource.title" @close="zoom=false" />

    <ResourceFormDialog :visible="showForm" :resource-id="resource.id" @update:visible="showForm=$event" @saved="load" />

    <el-dialog :model-value="rawDialog" @update:model-value="rawDialog=$event" title="资源的 Markdown 源文件" width="720px" top="4vh">
      <div v-if="rawText" style="font-size:13px;line-height:1.7">
        <pre style="background:#2d251b;color:#efe3c8;padding:14px;border-radius:8px;overflow:auto;max-height:60vh;white-space:pre-wrap;font-family:Menlo,monospace">{{ rawText }}</pre>
      </div>
      <template #footer>
        <el-button @click="copyRaw">复制</el-button>
        <el-button type="primary" @click="rawDialog=false">关闭</el-button>
      </template>
    </el-dialog>
  </template>
  <el-empty v-else-if="!loading" description="资源不存在或已删除" />
</div>`,
  };
  window.AppViews = Views;
})();
