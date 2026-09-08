'use strict';
(function () {
  const Views = window.AppViews = window.AppViews || {};

  // ---- recursive tag tree node ----
  const TreeNode = {
    name: 'WzTreeNode',
    props: { tag: Object, activeId: [Number, null], depth: { type: Number, default: 0 } },
    data() {
      return { open: true };
    },
    computed: {
      children() {
        return $$.primaryChildren(DB.tags, this.tag.id);
      },
      cnt() {
        return DB.resourcesOfTag(this.tag.id, true).length;
      },
    },
    methods: {
      toggle() { this.open = !this.open; },
      select() { this.$emit('select', this.tag.id); },
      hasChildren() { return this.children.length > 0; },
    },
    template: `
<div>
  <div class="tree-row" :class="{active:activeId===tag.id}" :style="'padding-left:'+(8+depth*18)+'px'">
    <span v-if="hasChildren()" class="tree-caret" :class="{open}" @click.stop="toggle">{{ hasChildren() ? '▶' : '' }}</span>
    <span v-else style="width:14px"></span>
    <span class="tree-dot" :style="tag.color?('background:'+tag.color):''"></span>
    <span style="cursor:pointer;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" @click="select">{{ $$.tName(tag) }}</span>
    <el-tag size="small" type="info" style="margin-right:4px">{{ cnt }}</el-tag>
    <el-button text size="small" @click.stop="select" title="管理">✎</el-button>
  </div>
  <div v-if="open && hasChildren()" style="margin-left:10px">
    <WzTreeNode v-for="c in children" :key="c.id" :tag="c" :active-id="activeId" :depth="depth+1" @select="$emit('select',$event)" />
  </div>
</div>`,
  };

  Views['tag-manage'] = {
    components: { WzTreeNode: TreeNode },
    data() {
      return {
        selId: null,
        form: { name: '', name_zh: '', name_en: '', name_native: '', color: '', description_md: '', sort_order: 0 },
        newParentId: null,
      };
    },
    computed: {
      rootTags() {
        return $$.treeOf(DB.tags);
      },
      sel() {
        return this.selId ? DB.tagById(this.selId) : null;
      },
      otherTagOptions() {
        if (!this.sel) return [];
        const exclude = new Set($$.subtreeOf(DB.tags, this.sel.id, true));
        return DB.tagOptions.filter((t) => !exclude.has(t.id));
      },
    },
    watch: {
      selId(v) {
        this.loadForm(v);
      },
    },
    methods: {
      loadForm(id) {
        const t = id ? DB.tagById(id) : null;
        this.form = t
          ? {
              name: t.name,
              name_zh: t.name_zh || '',
              name_en: t.name_en || '',
              name_native: t.name_native || '',
              color: t.color || '',
              description_md: t.description_md || '',
              sort_order: t.sort_order || 0,
            }
          : { name: '', name_zh: '', name_en: '', name_native: '', color: '', description_md: '', sort_order: 0 };
      },
      select(id) {
        this.selId = id;
        this.loadForm(id);
      },
      async addRoot() {
        try {
          const { value } = await ElementPlus.ElMessageBox.prompt('新建顶级（根）标签名称：', '新建标签', {
            inputPattern: /\S+/,
          });
          const j = await API.post('/api/tag', { name: value });
          await DB.refresh();
          this.select(j.tag.id);
          ElementPlus.ElMessage.success('已创建');
        } catch (e) {
          if (e !== 'cancel' && e !== 'close') ElementPlus.ElMessage.error(e.message || '创建失败');
        }
      },
      async addChild() {
        if (!this.sel) return;
        try {
          const { value } = await ElementPlus.ElMessageBox.prompt('新子标签名称：', '在「' + $$.tName(this.sel) + '」下新建子标签（自动识别中文/英文/本土语言名）', {
            inputPattern: /\S+/,
          });
          const j = await API.post('/api/tag', { name: value, parentId: this.sel.id });
          await DB.refresh();
          this.select(j.tag.id);
        } catch (e) {
          if (e !== 'cancel' && e !== 'close') ElementPlus.ElMessage.error(e.message || '创建失败');
        }
      },
      async saveMeta() {
        if (!this.sel) return;
        if (!this.form.name_zh.trim() && !this.form.name_en.trim() && !this.form.name_native.trim()) {
          return ElementPlus.ElMessage.warning('中文名 / 英文名 / 本土语言名至少填一个');
        }
        try {
          await API.put('/api/tag/' + this.sel.id, this.form);
          ElementPlus.ElMessage.success('已保存');
          await DB.refresh();
        } catch (e) {
          ElementPlus.ElMessage.error(e.message || '保存失败');
        }
      },
      async delTag() {
        if (!this.sel) return;
        try {
          await ElementPlus.ElMessageBox.confirm(
            `删除标签「${$$.tName(this.sel)}」后：其子标签将成为独立标签，资源不再带有该标签。此操作不可恢复，确定？`,
            '删除标签', { type: 'warning' });
          await API.del('/api/tag/' + this.sel.id);
          this.selId = null;
          await DB.refresh();
          ElementPlus.ElMessage.success('已删除');
        } catch (e) {
          if (e !== 'cancel' && e !== 'close') ElementPlus.ElMessage.error(e.message || '删除失败');
        }
      },
      async addParent() {
        if (!this.sel || !this.newParentId) return;
        try {
          // 作为「非主父级」添加（多父级），不影响现有树形位置
          await API.post('/api/tag/' + this.sel.id + '/parent', { parentId: this.newParentId, primary: false });
          this.newParentId = null;
          await DB.refresh();
          ElementPlus.ElMessage.success('已添加父标签');
        } catch (e) {
          ElementPlus.ElMessage.error(e.message || '操作失败');
        }
      },
      async removeParentEdge(edge) {
        try {
          await ElementPlus.ElMessageBox.confirm('移除「' + $$.tName(this.sel) + '」与父级「' + $$.tName(edge) + '」的关系？', '移除父级', { type: 'warning' });
          await API.del('/api/tag-edge/' + edge.edge_id);
          await DB.refresh();
          ElementPlus.ElMessage.success('已移除');
        } catch (e) {
          if (e !== 'cancel' && e !== 'close') ElementPlus.ElMessage.error(e.message || '操作失败');
        }
      },
      async makePrimary(edge) {
        try {
          await API.post('/api/tag-edge/' + edge.edge_id + '/primary', {});
          await DB.refresh();
          ElementPlus.ElMessage.success('已设为主父级，树形显示将以此为准');
        } catch (e) {
          ElementPlus.ElMessage.error(e.message || '操作失败');
        }
      },
      goTag() {
        DB.navigate('/tag/' + this.sel.id);
      },
    },
    template: `
<div style="display:flex;gap:16px;align-items:flex-start">
  <div class="card" style="width:360px;min-width:300px;padding:10px">
    <div style="display:flex;align-items:center;margin-bottom:8px">
      <h2 style="font-size:17px;margin:0">标签结构</h2>
      <span style="flex:1"></span>
      <el-button size="small" type="primary" plain @click="addRoot">+ 顶级标签</el-button>
    </div>
    <div class="text-muted" style="font-size:12px;margin-bottom:6px">树形按「主父级」展示；多父级可在右侧添加。点击 ✎ 选择标签编辑。</div>
    <div v-if="!rootTags.length" class="empty-hint" style="padding:30px 0">暂无标签</div>
    <div v-else>
      <div v-for="rt in rootTags" :key="rt.id" style="margin-bottom:2px">
        <WzTreeNode :tag="rt" :active-id="selId" :depth="0" @select="select" />
      </div>
    </div>
  </div>

  <div style="flex:1;min-width:0">
    <div v-if="!sel" class="card empty-hint">← 在左侧选择一个标签进行管理，或新建顶级标签</div>
    <template v-else>
      <div class="card" style="margin-bottom:14px">
        <div style="display:flex;align-items:center;margin-bottom:10px">
          <h2 style="margin:0;font-size:20px">
            <span class="tree-dot" :style="sel.color?('background:'+sel.color):''" style="display:inline-block;width:14px;height:14px;margin-right:8px"></span>
            {{ $$.tName(sel) }}
          </h2>
          <span style="flex:1"></span>
          <el-button size="small" @click="goTag">打开标签页 →</el-button>
          <el-button size="small" type="danger" plain @click="delTag">删除标签</el-button>
        </div>
        <el-form label-width="70px" style="max-width:700px">
          <el-form-item label="名称">
            <div style="width:100%">
              <div class="text-muted" style="font-size:11px;margin-bottom:6px">多语言展示格式：<b>中文名 | 英文名 | 本土语言名</b>（空段自动省略）。内部主名 <code>{{ sel.name }}</code> 作为唯一标识与 Markdown 文件名，不可修改。</div>
              <el-input v-model="form.name_zh" placeholder="中文名（创建时中文输入自动归入）" clearable style="margin-bottom:4px" />
              <el-input v-model="form.name_en" placeholder="英文名（Latin 输入自动归入）" clearable style="margin-bottom:4px" />
              <el-input v-model="form.name_native" placeholder="本土语言原名（梵文/希腊文/藏文等文字自动归入）" clearable />
            </div>
          </el-form-item>
          <el-form-item label="颜色">
            <el-color-picker v-model="form.color"></el-color-picker>
            <el-button text size="small" @click="form.color=''">清除</el-button>
          </el-form-item>
          <el-form-item label="排序"><el-input-number v-model="form.sort_order" :min="0"></el-input-number><span class="text-muted" style="margin-left:10px;font-size:12px">同层排序参考</span></el-form-item>
          <el-form-item label="介绍"><MdEditor v-model="form.description_md" min-height="140px" /></el-form-item>
          <el-form-item><el-button type="primary" @click="saveMeta">保存修改</el-button></el-form-item>
        </el-form>
      </div>

      <div class="card" style="margin-bottom:14px">
        <div class="h">父标签管理（支持多父级；主父级用于树形展示）</div>
        <div v-if="!(sel.parents||[]).length" class="text-muted" style="font-size:12px;margin-bottom:8px">当前为根标签，暂无父标签。</div>
        <div v-else style="margin-bottom:10px">
          <div v-for="p in sel.parents" :key="p.edge_id" style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span class="tag-chip"><i class="dot" :style="'background:'+(p.color||'#c9a268')"></i>{{ $$.tName(p) }}</span>
            <el-tag v-if="p.is_primary" size="small" type="success">主父级</el-tag>
            <span style="flex:1"></span>
            <el-button v-if="!p.is_primary" size="small" text type="primary" @click="makePrimary(p)">设为主父级</el-button>
            <el-button size="small" text type="danger" @click="removeParentEdge(p)">移除</el-button>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <el-select v-model="newParentId" filterable placeholder="选择要挂到哪个父标签下…" style="width:240px" size="small">
            <el-option v-for="t in otherTagOptions" :key="t.id" :value="t.id" :label="t.path"></el-option>
          </el-select>
          <el-button type="primary" size="small" plain :disabled="!newParentId" @click="addParent">添加父标签</el-button>
          <el-button size="small" @click="addChild">+ 添加子标签</el-button>
        </div>
      </div>

      <div class="card">
        <div class="h">子标签（{{ (sel.children||[]).length }}）与资源统计</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <el-tag v-for="c in sel.children" :key="c.id" style="cursor:pointer" :color="DB.tagById(c.id)&&DB.tagById(c.id).color||'#8a5a34'"
            @click="select(c.id)">{{ $$.tName(DB.tagById(c.id)||c) }}</el-tag>
        </div>
      </div>
    </template>
  </div>
</div>`,
  };
  window.AppViews = Views;
})();
