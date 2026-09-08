'use strict';
(function () {
  const Views = window.AppViews = window.AppViews || {};

  Views.library = {
    components: { ResourceFormDialog: window.AppComponents.ResourceFormDialog },
    data() {
      return {
        type: 'all',
        q: '',
        tagId: null,
        featuredOnly: false,
        sortBy: 'updated',
        viewMode: 'grid',
        showForm: false,
        formResourceId: null,
        tableSel: [],
        tagPicked: '',
        remoteIds: null, // when set -> results from server-side full-text search
        searching: false,
      };
    },
    created() {
      const rq = (DB.route && DB.route.query) || new URLSearchParams();
      this.applyQuery(Object.fromEntries(rq));
    },
    computed: {
      tagOptions() {
        return DB.tagOptions;
      },
      filtered() {
        let list = DB.resources.slice();
        if (this.type !== 'all') list = list.filter((r) => r.type === this.type);
        if (this.featuredOnly) list = list.filter((r) => r.featured);
        if (this.tagId) {
          const ids = new Set($$.allDescIds(DB.tags, this.tagId, true));
          list = list.filter((r) => (r.tags || []).some((t) => ids.has(t)));
        }
        const kw = this.q.trim().toLowerCase();
        if (kw) {
          if (!this.remoteIds) return [];
          list = list.filter((r) => this.remoteIds.has(r.id));
        } else if (this.remoteIds) {
          this.remoteIds = null;
        }
        list = list.slice().sort((a, b) => {
          if (this.sortBy === 'title') return (a.title || '').localeCompare(b.title || '', 'zh-CN');
          if (this.sortBy === 'created') return (a.created_at || '').localeCompare(b.created_at || '') * -1;
          return (a.updated_at || '').localeCompare(b.updated_at || '') * -1;
        });
        return list;
      },
      totalShown() {
        return this.filtered.length;
      },
    },
    watch: {
      // no-op; library reads route query on created
    },
    methods: {
      applyQuery(q) {
        if (q) {
          this.type = q.type || 'all';
          if (q.tag) this.tagId = Number(q.tag);
          if (q.q !== undefined) {
            this.q = q.q;
            this.doSearch();
          }
        }
      },
      setType(t) {
        this.type = t;
        this.syncHash();
      },
      async doSearch() {
        const kw = this.q.trim();
        if (!kw) { this.remoteIds = null; this.syncHash(); return; }
        this.searching = true;
        this.remoteIds = [];
        try {
          const params = new URLSearchParams({ q: kw });
          if (this.type !== 'all') params.set('type', this.type);
          if (this.tagId) params.set('tag', this.tagId);
          const j = await API.get('/api/resources?' + params.toString());
          this.remoteIds = new Set(j.resources.map((r) => r.id));
          this.syncHash();
        } catch (e) {
          ElementPlus.ElMessage.error(e.message || '搜索失败');
        } finally {
          this.searching = false;
        }
      },
      syncHash() {
        const p = [];
        if (this.type !== 'all') p.push('type=' + this.type);
        if (this.tagId) p.push('tag=' + this.tagId);
        if (this.q) p.push('q=' + encodeURIComponent(this.q));
        const suffix = p.length ? '?' + p.join('&') : '';
        if (DB.route.path.indexOf('/library') !== 0) DB.navigate('/library' + suffix);
        else {
          const base = '/library';
          const h = '#' + base + suffix;
          if (window.location.hash !== h) history.replaceState(null, '', h);
        }
      },
      clearTag() { this.tagId = null; this.syncHash(); },
      doSearch() { this.syncHash(); },
      open(r) { DB.navigate('/resource/' + r.id); },
      rowTags(r) {
        return (r.tags || []).map((id) => DB.tagById(id)).filter(Boolean);
      },
      async toggleFeatured(r) {
        try {
          const fd = new FormData();
          fd.append('featured', r.featured ? '0' : '1');
          await API.sendForm('/api/resource/' + r.id, fd, 'PUT');
          await DB.refresh();
          ElementPlus.ElMessage.success(r.featured ? '已取消推荐' : '已设为推荐');
        } catch (e) { ElementPlus.ElMessage.error(e.message || '操作失败'); }
      },
      async deleteRow(r) {
        try {
          await ElementPlus.ElMessageBox.confirm('确认删除资源「' + r.title + '」？若勾选删除文件将同时删除本地媒体文件。', '删除确认', {
            confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
          });
          await API.del('/api/resource/' + r.id + '?file=1');
          await DB.refresh();
          ElementPlus.ElMessage.success('已删除');
        } catch (e) {
          if (e !== 'cancel' && e && e !== 'close') ElementPlus.ElMessage.error(e.message || '删除失败');
        }
      },
      async batchDelete() {
        if (!this.tableSel.length) return;
        try {
          await ElementPlus.ElMessageBox.confirm('确认删除选中的 ' + this.tableSel.length + ' 个资源（含本地媒体文件）？', '批量删除', { type: 'warning' });
          const j = await API.post('/api/resource/batch-delete', { ids: this.tableSel, deleteFile: true });
          this.tableSel = [];
          await DB.refresh();
          ElementPlus.ElMessage.success('已删除 ' + j.removed + ' 个');
        } catch (e) {
          if (e !== 'cancel' && e !== 'close') ElementPlus.ElMessage.error(e.message || '删除失败');
        }
      },
      editRow(r) {
        this.showForm = true;
        this.formResourceId = r.id;
      },
    },
    template: `
<div>
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    <h1 style="font-size:24px;margin:0">资源库</h1>
    <el-tag v-if="tagId && DB.tagById(tagId)" closable @close="clearTag" :color="DB.tagById(tagId).color||'#8a5a34'" style="border:none;color:#fff">{{ $$.tName(DB.tagById(tagId)) }}</el-tag>
    <span style="flex:1"></span>
    <el-input v-model="q" placeholder="搜索名称 / 介绍 / 文件名" style="width:240px" clearable @keyup.enter="doSearch" @clear="doSearch">
      <template #append><el-button @click="doSearch">搜索</el-button></template>
    </el-input>
    <el-button type="primary" @click="showForm=true;formResourceId=null">+ 上传资源</el-button>
  </div>

  <div class="filter-bar" style="margin-top:16px">
    <el-radio-group v-model="type" @change="setType">
      <el-radio-button value="all">全部 {{ DB.stats.resources || 0 }}</el-radio-button>
      <el-radio-button value="image">图片 {{ DB.stats.images || 0 }}</el-radio-button>
      <el-radio-button value="audio">音频 {{ DB.stats.audios || 0 }}</el-radio-button>
      <el-radio-button value="video">视频 {{ DB.stats.videos || 0 }}</el-radio-button>
    </el-radio-group>
    <span style="flex:1"></span>
    <el-select v-model="tagId" placeholder="按标签筛选" clearable filterable style="width:200px" @change="syncHash">
      <el-option v-for="t in tagOptions" :key="t.id" :value="t.id" :label="t.path"></el-option>
    </el-select>
    <el-switch v-model="featuredOnly" active-text="仅推荐" @change="syncHash"></el-switch>
    <el-select v-model="sortBy" style="width:120px" @change="syncHash">
      <el-option value="updated" label="最近更新"></el-option>
      <el-option value="created" label="最近创建"></el-option>
      <el-option value="title" label="名称排序"></el-option>
    </el-select>
    <el-radio-group v-model="viewMode">
      <el-radio-button value="grid">宫格</el-radio-button>
      <el-radio-button value="list">列表</el-radio-button>
    </el-radio-group>
  </div>

  <div style="margin:10px 0 14px" class="text-muted">共 {{ totalShown }} 条</div>

  <!-- grid mode -->
  <div v-if="viewMode==='grid'">
    <div v-if="!filtered.length" class="card empty-hint">没有找到匹配的资源，试试其他筛选条件，或点击「+ 上传资源」。</div>
    <div v-else class="grid res-grid">
      <ResourceCard v-for="r in filtered" :key="r.id" :resource="r" show-tag />
    </div>
  </div>

  <!-- list mode -->
  <div v-else>
    <div class="card" style="padding:8px 4px">
      <div v-if="tableSel.length" style="padding:6px 12px">
        <el-button type="danger" size="small" @click="batchDelete">删除选中 {{ tableSel.length }}</el-button>
      </div>
      <el-table :data="filtered" style="width:100%" @selection-change="tableSel=$event.map(x=>x.id)" max-height="calc(100vh - 300px)">
        <el-table-column type="selection" width="40"></el-table-column>
        <el-table-column label="媒体" width="110">
          <template #default="{row}">
            <div style="width:80px;height:54px;border-radius:6px;overflow:hidden;background:#efe6d6;display:flex;align-items:center;justify-content:center;cursor:pointer" @click="open(row)">
              <img v-if="row.type==='image'" :src="'/api/resource/'+row.id+'/file'" style="width:100%;height:100%;object-fit:cover" />
              <span v-else style="font-size:24px">{{ $$.typeIcon(row.type) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="名称" min-width="220">
          <template #default="{row}">
            <a style="color:var(--el-color-primary);font-weight:600;cursor:pointer" @click="open(row)">{{ row.title || '(未命名)' }}</a>
            <div class="text-muted" style="font-size:12px">{{ row.media_name || '' }} {{ row.featured?'⭐':'' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="80">
          <template #default="{row}"><span class="type-badge" :class="'type-'+row.type">{{ $$.typeLabel(row.type) }}</span></template>
        </el-table-column>
        <el-table-column label="标签" min-width="180">
          <template #default="{row}">
            <el-tag v-for="tg in rowTags(row)" :key="tg.id" size="small" style="margin:2px" :style="tg.color?'background:'+tg.color+'10;color:'+tg.color+'!important;border-color:'+tg.color+'55':' '" @click.stop="DB.navigate('/tag/'+tg.id)">{{ $$.tName(tg) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="100">
          <template #default="{row}">{{ $$.fmtDate(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{row}">
            <el-button text type="primary" size="small" @click="open(row)">查看</el-button>
            <el-button text type="warning" size="small" @click="editRow(row)">编辑</el-button>
            <el-button text type="danger" size="small" @click="deleteRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>

  <ResourceFormDialog :visible="showForm" :resource-id="formResourceId" @update:visible="showForm=$event" />
</div>`,
  };

  window.AppViews = Views;
})();
