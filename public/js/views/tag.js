'use strict';
(function () {
  const Views = window.AppViews = window.AppViews || {};

  Views.tag = {
    data() {
      return {
        tab: 'resources',
        descEdit: false,
        descForm: { name: '', name_zh: '', name_en: '', name_native: '', color: '', description_md: '', sort_order: 0 },
        showForm: false,
        includeDesc: false,
        formTagId: null,
        zoomItem: null,
      };
    },
    computed: {
      tid() {
        return Number(DB.route.params[0]);
      },
      tag() {
        return DB.tagById(this.tid);
      },
      crumb() {
        return this.tag ? $$.breadcrumb(DB.tags, this.tag) : [];
      },
      subIds() {
        // descendant subtree ids (for stat)
        return this.tag ? $$.subtreeOf(DB.tags, this.tag.id, true) : [];
      },
      resources() {
        if (!this.tag) return [];
        return DB.resourcesOfTag(this.tag.id, this.includeDesc);
      },
      resImages() { return this.resources.filter((r) => r.type === 'image'); },
      resAudios() { return this.resources.filter((r) => r.type === 'audio'); },
      resVideos() { return this.resources.filter((r) => r.type === 'video'); },
      mediaAll() {
        return this.resources.filter((r) => r.type === 'image' || r.type === 'video');
      },
      childTags() {
        return this.tag ? $$.sortTags(this.tag.children.map((c) => DB.tagById(c.id)).filter(Boolean)) : [];
      },
      allParents() {
        return this.tag ? (this.tag.parents || []).slice() : [];
      },
      count() {
        return this.tag ? DB.resourcesOfTag(this.tag.id, true).length : 0;
      },
    },
    watch: {
      tid() {
        this.tab = 'resources';
        this.includeDesc = false;
      },
    },
    methods: {
      openTag(t) { DB.navigate('/tag/' + t.id); },
      countOf(id) {
        return DB.resourcesOfTag(id, true).length;
      },
      uploadHere() {
        this.formTagId = this.tag.id;
        this.showForm = true;
      },
      playMedia(r) {
        this.zoomItem = r;
      },
      closeZoom() {
        this.zoomItem = null;
      },
      editMeta() {
        this.descForm = {
          name: this.tag.name,
          name_zh: this.tag.name_zh || '',
          name_en: this.tag.name_en || '',
          name_native: this.tag.name_native || '',
          color: this.tag.color || '',
          description_md: this.tag.description_md || '',
          sort_order: this.tag.sort_order || 0,
        };
        this.descEdit = true;
      },
      async saveMeta() {
        if (!this.descForm.name_zh.trim() && !this.descForm.name_en.trim() && !this.descForm.name_native.trim()) {
          return ElementPlus.ElMessage.warning('中文名 / 英文名 / 本土语言名至少填一个');
        }
        try {
          await API.put('/api/tag/' + this.tag.id, this.descForm);
          ElementPlus.ElMessage.success('已保存');
          this.descEdit = false;
          await DB.refresh();
        } catch (e) {
          ElementPlus.ElMessage.error(e.message || '保存失败');
        }
      },
      addChild() {
        this.$prompt('输入新子标签名称（将创建为「' + $$.tName(this.tag) + '」的子标签，自动识别中文/英文/本土语言名）', '添加子标签', {
          confirmButtonText: '创建', cancelButtonText: '取消', inputPattern: /\S+/,
        }).then(async ({ value }) => {
          try {
            await API.post('/api/tag', { name: value, parentId: this.tag.id });
            ElementPlus.ElMessage.success('已创建');
            await DB.refresh();
          } catch (e) {
            ElementPlus.ElMessage.error(e.message || '创建失败');
          }
        }).catch(() => {});
      },
      mediaType(r) {
        return r.type;
      },
    },
    template: `
<div>
  <template v-if="tag">
    <div class="breadcrumb-line">
      <span v-for="(c,i) in crumb" :key="c.id">
        <a v-if="i" style="margin:0 4px">/</a>
        <a style="cursor:pointer;color:var(--el-color-primary)" @click="openTag(c)">{{ $$.tName(c) }}</a>
      </span>
    </div>
    <div style="display:flex;align-items:center;gap:14px;margin:10px 0 6px;flex-wrap:wrap">
      <div :style="{width:'54px',height:'54px',borderRadius:'14px',background:(tag.color||'#8a5a34')+'22',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'26px'}">🏷</div>
      <div>
        <h1 style="margin:0;font-size:28px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          {{ $$.tName(tag) }}
          <el-tag size="small" type="info">{{ count }} 资源</el-tag>
        </h1>
        <div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span class="text-muted" style="font-size:12px">父级：</span>
          <span v-if="!allParents.length" class="text-muted" style="font-size:12px">（根标签）</span>
          <span v-else>
            <span class="tag-chip" v-for="p in allParents" :key="p.id" @click="openTag(p)"><i class="dot" :style="'background:'+(p.color||'#c9a268')"></i>{{ $$.tName(p) }}{{ p.is_primary ? '（主）' : '' }}</span>
          </span>
        </div>
      </div>
      <span style="flex:1"></span>
      <el-button plain @click="editMeta">✎ 编辑资料</el-button>
      <el-button type="primary" @click="uploadHere">+ 上传资源</el-button>
    </div>

    <el-tabs v-model="tab" style="margin-top:6px">
      <el-tab-pane label="资源" name="resources">
        <div class="filter-bar">
          <el-radio-group v-model="includeDesc" @change="tab='resources'">
            <el-radio-button :value="false">仅本标签</el-radio-button>
            <el-radio-button :value="true">含全部子标签</el-radio-button>
          </el-radio-group>
          <span style="flex:1"></span>
          <el-text size="small" style="color:var(--muted)">图片 {{ resImages.length }} · 音频 {{ resAudios.length }} · 视频 {{ resVideos.length }}</el-text>
        </div>
        <div v-if="!resources.length" class="card empty-hint">暂无资源，点击「+ 上传资源」为「{{ $$.tName(tag) }}」添加内容，或在上传/编辑对话框中选择该标签。</div>
        <div v-else class="grid res-grid">
          <ResourceCard v-for="r in resources" :key="r.id" :resource="r" show-tag />
        </div>
      </el-tab-pane>

      <el-tab-pane label="图片视频轮播" name="carousel">
        <div style="margin-bottom:8px" class="text-muted">同一标签下的图片与视频自动轮播展示（点「含全部子标签」会合并子标签内容）</div>
        <el-radio-group v-model="includeDesc" style="margin-bottom:12px" @change="tab='carousel'">
          <el-radio-button :value="false">仅本标签</el-radio-button>
          <el-radio-button :value="true">含全部子标签</el-radio-button>
        </el-radio-group>
        <div v-if="!mediaAll.length" class="card empty-hint">该标签暂无图片或视频资源</div>
        <div v-else>
          <div class="text-muted" style="font-size:12px;margin-bottom:8px">点击任意画面可浮层放大查看（不再跳转详情页）</div>
          <div class="carousel-home">
            <el-carousel :interval="3800" trigger="click">
              <el-carousel-item v-for="r in mediaAll" :key="r.id">
                <div class="carousel-item-media" @click="playMedia(r)" :title="'点击放大：'+r.title">
                  <img v-if="r.type==='image'" :src="'/api/resource/'+r.id+'/file'" :alt="r.title" />
                  <video v-else :src="'/api/resource/'+r.id+'/file'" preload="metadata" muted loop></video>
                  <div class="carousel-item-cap">{{ r.type==='video' ? '🎬' : '🖼' }} {{ r.title }}</div>
                </div>
              </el-carousel-item>
            </el-carousel>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="子标签" name="children">
        <div style="display:flex;align-items:center;margin-bottom:12px">
          <h3 style="margin:0">子标签（{{ childTags.length }}）</h3>
          <span style="flex:1"></span>
          <el-button size="small" type="primary" plain @click="addChild">+ 添加子标签</el-button>
        </div>
        <div v-if="!childTags.length" class="card empty-hint">暂无子标签，点右上角添加。</div>
        <div v-else class="grid tags-grid">
          <div v-for="c in childTags" :key="c.id" class="card" style="cursor:pointer;padding:14px;display:flex;align-items:center;gap:10px" @click="openTag(c)">
            <i class="dot" :style="'width:12px;height:12px;background:'+(c.color||'#8a5a34')"></i>
            <div>
              <div style="font-weight:600;font-size:15px;font-family:var(--serif)">{{ $$.tName(c) }}</div>
              <div class="text-muted" style="font-size:12px">{{ $$.summary(c.description_md, 28) || countOf(c.id) + ' 资源' }}</div>
            </div>
            <span style="flex:1"></span>
            <el-tag size="small" type="info">{{ countOf(c.id) }}</el-tag>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="标签介绍" name="desc">
        <div v-if="tag.description_md" class="card"><MdView :content="tag.description_md" /></div>
        <div v-else class="card empty-hint">暂无介绍，点击「✎ 编辑资料」撰写（支持 Markdown）。</div>
      </el-tab-pane>
    </el-tabs>

    <!-- 轮播点击放大：图片用缩放查看器，视频用浮层播放 -->
    <ZoomViewer v-if="zoomItem && zoomItem.type==='image'" :src="'/api/resource/'+zoomItem.id+'/file'" :title="zoomItem.title" @close="closeZoom" />
    <el-dialog v-else-if="zoomItem" :model-value="!!zoomItem" @update:model-value="closeZoom" :title="zoomItem.title" width="min(840px,92vw)" top="5vh" destroy-on-close>
      <video :src="'/api/resource/'+zoomItem.id+'/file'" controls autoplay style="width:100%;max-height:76vh;background:#000" />
    </el-dialog>

    <!-- 上传后停留在标签详情页，不跳转资源详情 -->
    <ResourceFormDialog :visible="showForm" :initial-tags="formTagId ? [formTagId] : []" stay @update:visible="showForm=$event" />

    <!-- tag meta edit -->
    <el-dialog :model-value="descEdit" @update:model-value="descEdit=$event" title="编辑标签" width="640px">
      <el-form label-width="80px">
        <el-form-item label="名称">
          <div style="width:100%">
            <div class="text-muted" style="font-size:11px;margin-bottom:6px">显示格式：<b>中文名 | 英文名 | 本土语言名</b>（空段自动省略）。内部主名 <code>{{ descForm.name }}</code> 不可改。</div>
            <el-input v-model="descForm.name_zh" placeholder="中文名" clearable style="margin-bottom:4px" />
            <el-input v-model="descForm.name_en" placeholder="英文名" clearable style="margin-bottom:4px" />
            <el-input v-model="descForm.name_native" placeholder="本土语言原名（如梵文/希腊文原文）" clearable />
          </div>
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="descForm.color"></el-color-picker>
          <el-button size="small" text @click="descForm.color=''">清除</el-button>
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="descForm.sort_order" :min="0"></el-input-number></el-form-item>
        <el-form-item label="介绍"><MdEditor v-model="descForm.description_md" min-height="200px" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="descEdit=false">取消</el-button>
        <el-button type="primary" @click="saveMeta">保存</el-button>
      </template>
    </el-dialog>
  </template>
  <el-empty v-else description="标签不存在或已删除" />
</div>`,
  };

  // ------- 标签总览：树形一览 -------
  Views.tags = {
    data() {
      return { keyword: '' };
    },
    computed: {
      rootTags() {
        return $$.treeOf(DB.tags).filter((t) => {
          if (!this.keyword) return true;
          const kw = this.keyword.toLowerCase();
          return (
            (t.name || '').toLowerCase().includes(kw) ||
            (t.name_zh || '').toLowerCase().includes(kw) ||
            (t.name_en || '').toLowerCase().includes(kw) ||
            (t.name_native || '').toLowerCase().includes(kw) ||
            $$.tName(t).toLowerCase().includes(kw)
          );
        });
      },
      stats() {
        const s = DB.stats || {};
        return s;
      },
    },
    methods: {
      openTag(t) {
        DB.navigate('/tag/' + t.id);
      },
      manage() {
        DB.navigate('/tag-manage');
      },
      countOf(id) {
        return DB.resourcesOfTag(id, true).length;
      },
      childrenOf(t) {
        return $$.primaryChildren(DB.tags, t.id).slice(0, 8);
      },
    },
    template: `
<div>
  <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px">
    <h1 style="font-size:24px;margin:0">标签总览</h1>
    <el-tag size="small" type="info">共 {{ DB.tags.length }} 个标签 · {{ stats.resources }} 个资源</el-tag>
    <span style="flex:1"></span>
    <el-input v-model="keyword" placeholder="过滤标签" style="width:180px" clearable />
    <el-button type="primary" @click="manage">进入标签管理（树形/多父级）</el-button>
  </div>

  <div v-if="!rootTags.length" class="card empty-hint">暂无顶层标签。可到「标签管理」新建顶级标签并挂载子标签，或在上传资源时输入标签自动创建。</div>

  <div v-for="rt in rootTags" :key="rt.id" class="card" style="margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:10px;cursor:pointer" @click="openTag(rt)">
      <i class="dot" :style="'width:16px;height:16px;background:'+(rt.color||'#8a5a34')"></i>
      <h2 style="margin:0;font-size:19px">{{ $$.tName(rt) }}</h2>
      <el-tag size="small" type="info">{{ countOf(rt.id) }} 资源</el-tag>
      <span class="text-muted" style="font-size:12px;flex:1">{{ $$.summary(rt.description_md, 60) }}</span>
      <el-button size="small" text type="primary" @click="openTag(rt)">查看 →</el-button>
    </div>
    <div v-if="childrenOf(rt).length" style="margin-top:12px;border-top:1px dashed #eee;padding-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
      <span class="text-muted" style="font-size:12px">子标签：</span>
      <el-tag v-for="c in childrenOf(rt)" :key="c.id" style="cursor:pointer" :style="c.color?('background:'+c.color+'18;color:'+c.color+';border-color:'+c.color+'44'):''" @click="openTag(c)">{{ $$.tName(c) }}<span style="opacity:.7">（{{ countOf(c.id) }}）</span></el-tag>
    </div>
  </div>
</div>`,
  };
  window.AppViews = Views;
})();
