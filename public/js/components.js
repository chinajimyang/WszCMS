'use strict';
(function () {
  const Comp = {};

  // ============ Markdown body viewer ============
  Comp.MdView = {
    props: { content: { type: String, default: '' } },
    template: '<div class="md-body" v-html="html"></div>',
    computed: {
      html() {
        return $$.md(this.content);
      },
    },
  };

  // ============ Markdown editor ============
  Comp.MdEditor = {
    props: { modelValue: { type: String, default: '' }, placeholder: { type: String, default: '' }, minHeight: { type: String, default: '260px' } },
    emits: ['update:modelValue'],
    data() {
      return { mode: 'edit', selStart: 0, selEnd: 0 };
    },
    computed: {
      html() {
        return $$.md(this.modelValue);
      },
      isEmpty() {
        return !this.modelValue;
      },
    },
    methods: {
      insert(before, after, sample) {
        const ta = this.$refs.ta;
        if (!ta) return;
        const s = ta.selectionStart || 0;
        const e = ta.selectionEnd || 0;
        const v = this.modelValue;
        const selected = v.slice(s, e) || sample || '';
        const nv = v.slice(0, s) + before + selected + (after || '') + v.slice(e);
        this.$emit('update:modelValue', nv);
        this.$nextTick(() => {
          ta.focus();
          const pos = s + before.length + selected.length + (after || '').length;
          ta.setSelectionRange(s + before.length, pos);
        });
      },
      h1() { this.insert('\n# ', '\n', '标题'); },
      bold() { this.insert('**', '**', '加粗文字'); },
      italic() { this.insert('*', '*', '斜体文字'); },
      link() { this.insert('[', '](http://)', '链接文字'); },
      img() { this.insert('![', '](图片地址)', '图片描述'); },
      quote() { this.insert('\n> ', '\n', '引用内容'); },
      code() { this.insert('\n```\n', '\n```\n', 'code'); },
      ul() { this.insert('\n- ', '\n', '列表项'); },
      hr() { this.insert('\n\n---\n\n', '', ''); },
    },
    template: `
<div>
  <div class="md-toolbar">
    <button type="button" @click="h1">H1</button>
    <button type="button" @click="bold"><b>B</b></button>
    <button type="button" @click="italic"><i>I</i></button>
    <button type="button" @click="link">链接</button>
    <button type="button" @click="img">图片</button>
    <button type="button" @click="quote">引用</button>
    <button type="button" @click="code">代码</button>
    <button type="button" @click="ul">列表</button>
    <button type="button" @click="hr">分隔线</button>
    <span style="flex:1"></span>
    <el-radio-group v-model="mode" size="small">
      <el-radio-button value="edit">编辑</el-radio-button>
      <el-radio-button value="prev">预览</el-radio-button>
      <el-radio-button value="split">分栏</el-radio-button>
    </el-radio-group>
  </div>
  <div v-if="mode==='edit'" class="md-editor-single">
    <textarea ref="ta" :placeholder="placeholder" :value="modelValue" @input="$emit('update:modelValue',$event.target.value)" :style="{minHeight}"></textarea>
  </div>
  <div v-else-if="mode==='prev'" class="md-preview" v-html="html"></div>
  <div v-else class="md-editor">
    <textarea ref="ta" :placeholder="placeholder" :value="modelValue" @input="$emit('update:modelValue',$event.target.value)" :style="{minHeight}"></textarea>
    <div class="md-preview" v-html="html"></div>
  </div>
</div>`,
  };

  // ============ Tag multi picker (flattened paths, searchable) ============
  Comp.TagPicker = {
    props: { modelValue: { type: Array, default: () => [] }, placeholder: { type: String, default: '搜索或输入新名称回车创建标签' } },
    emits: ['update:modelValue'],
    data() {
      return { expanded: false };
    },
    computed: {
      flat() {
        // flatten tag tree with path prefix, dedupe by first path
        const seen = new Set();
        const out = [];
        const walk = (tid, prefix) => {
          const t = DB.tagById(tid);
          if (!t) return;
          if (!seen.has(t.id)) {
            const disp = $$.tName(t);
            out.push({ id: t.id, name: disp, color: t.color, path: prefix + disp });
          }
          const disp2 = $$.tName(t);
          for (const c of t.children || []) walk(c.id, prefix + disp2 + ' / ');
        };
        for (const rt of $$.rootTags(DB.tags)) walk(rt.id, '');
        return out;
      },
    },
    methods: {
      labelOf(id) {
        const f = this.flat.find((x) => x.id === id);
        return f ? f.path : '#' + id;
      },
      // el-select allow-create 会把新输入的字符串作为值提交，此处统一转成已存在或新建的 tag id
      async onUpdate(list) {
        const ids = [];
        const names = [];
        for (const v of list) {
          if (typeof v === 'number') {
            ids.push(v);
            continue;
          }
          const s = String(v || '').trim();
          if (!s) continue;
          const ex = DB.tagByName(s);
          if (ex) {
            ids.push(ex.id);
            continue;
          }
          names.push(s);
        }
        for (const n of names) {
          try {
            const j = await API.post('/api/tag', { name: n, color: $$.autoColor(n) });
            ids.push(j.tag.id);
          } catch (e) {
            const dup = DB.tagByName(n);
            if (dup) ids.push(dup.id);
            else ElementPlus.ElMessage.error('创建标签「' + n + '」失败：' + (e.message || ''));
          }
        }
        if (names.length) {
          await DB.refresh();
          ElementPlus.ElMessage.success(names.length === 1 ? '已创建标签「' + names[0] + '」' : '已创建 ' + names.length + ' 个新标签');
        }
        this.$emit('update:modelValue', ids);
      },
    },
    template: `
<div>
  <el-select multiple filterable allow-create collapse-tags default-first-option :reserve-keyword="false" :model-value="modelValue" @update:model-value="onUpdate" :placeholder="placeholder" style="width:100%">
    <el-option v-for="f in flat" :key="f.id" :value="f.id" :label="f.path">
      <span><i :style="'display:inline-block;width:9px;height:9px;border-radius:50%;background:'+f.color+';margin-right:6px'"></i>{{ f.path }}</span>
    </el-option>
  </el-select>
</div>`,
  };

  // ============ Resource card ============
  Comp.ResourceCard = {
    props: { resource: { type: Object, required: true }, showTag: { type: Boolean, default: false } },
    data() {
      return { $$ };
    },
    computed: {
      typeIcon() { return $$.typeIcon(this.resource.type); },
      ts() { return $$.relTime(this.resource.updated_at); },
      tags() {
        return (this.resource.tags || []).slice(0, 3).map((id) => DB.tagById(id)).filter(Boolean);
      },
    },
    methods: {
      open() {
        DB.navigate('/resource/' + this.resource.id);
      },
      onErr(e) {
        e.target.style.display = 'none';
      },
    },
    template: `
<div class="res-card" @click="open">
  <div class="thumb">
    <img v-if="resource.type==='image'" :src="'/api/resource/'+resource.id+'/file'" loading="lazy" @error="onErr" />
    <div v-else class="thumb-place">{{ typeIcon }}</div>
    <span class="fav" v-if="resource.featured" title="推荐">⭐</span>
    <el-tag v-if="resource.media_size===0 && !resource.media_path" type="warning" size="small" style="position:absolute;top:6px;left:6px">无媒体</el-tag>
  </div>
  <div class="meta">
    <div class="t">{{ resource.title || '(未命名)' }}</div>
    <div class="ts"><span class="type-badge" :class="'type-'+resource.type">{{ $$.typeLabel(resource.type) }}</span>{{ ts }}</div>
    <div v-if="showTag && tags.length" style="margin-top:5px">
      <span class="tag-chip" v-for="tg in tags" :key="tg.id"><i class="dot" :style="'background:'+(tg.color||'#c9a268')"></i>{{ $$.tName(tg) }}</span>
    </div>
  </div>
</div>`,
  };

  // ============ Resource create / edit dialog ============
  Comp.ResourceFormDialog = {
    props: {
      visible: { type: Boolean, default: false },
      resourceId: { type: [Number, String], default: null },
      initialTags: { type: Array, default: null },
      // 创建成功后是否停留在当前页面（不跳转资源详情页）
      stay: { type: Boolean, default: false },
    },
    emits: ['update:visible', 'saved'],
    data() {
      return {
        saving: false,
        progress: -1,
        editing: null, // full record from server
        isNew: true,
        form: { title: '', type: 'image', tags: [], primaryTag: null, featured: false, description_md: '' },
        file: null,
        filePreview: '',
      };
    },
    watch: {
      visible(v) {
        if (v) this.open();
        else window.removeEventListener('paste', this.onClipPaste);
      },
      'form.tags'(list) {
        // keep primary within selected tags
        if (!(list || []).includes(this.form.primaryTag)) this.form.primaryTag = list && list.length ? list[0] : null;
      },
      'form.primaryTag'(id) {
        // 资源名称未指定时，以主标签名称自动作为资源名称
        if (!String(this.form.title || '').trim() && id) {
          const tg = DB.tagById(id);
          const nm = tg ? String(tg.name_zh || tg.name_en || tg.name_native || tg.name || '').trim() : '';
          if (nm) this.form.title = nm;
        }
      },
    },
    beforeUnmount() {
      window.removeEventListener('paste', this.onClipPaste);
    },
    computed: {
      typeOptions() {
        return [
          { value: 'image', label: '图片', ext: 'png,jpg,jpeg,gif,webp,bmp,svg' },
          { value: 'audio', label: '音频', ext: 'mp3,wav,m4a,flac,ogg,aac' },
          { value: 'video', label: '视频', ext: 'mp4,webm,mov,mkv,avi,m4v' },
        ];
      },
      acceptStr() {
        const t = this.form.type;
        const o = this.typeOptions.find((x) => x.value === t);
        return o ? '.' + o.ext.replace(/,/g, ',.') : '';
      },
      // tags resolved to full records for the primary selector
      pickedTags() {
        return (this.form.tags || [])
          .map((id) => DB.tagById(id))
          .filter(Boolean);
      },
    },
    methods: {
      onClipPaste(e) {
        const dt = e.clipboardData;
        if (!dt) return;
        const items = Array.prototype.slice.call(dt.items || []);
        const img = items.find((x) => x.kind === 'file' && x.type && x.type.indexOf('image/') === 0);
        if (!img) return; // 纯文本粘贴不拦截，正常放行
        e.preventDefault();
        const blob = img.getAsFile();
        if (!blob) return;
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        const ts = '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
        const f = new File([blob], '粘贴图片_' + ts + '.png', { type: blob.type || 'image/png' });
        this.file = f;
        this.form.type = 'image';
        if (!this.form.title && this.isNew) {
          this.form.title = '剪贴板图片 ' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
        }
        if (this.filePreview) URL.revokeObjectURL(this.filePreview);
        this.filePreview = URL.createObjectURL(f);
        ElementPlus.ElMessage.success('已从剪贴板粘贴图片，可直接创建');
      },
      async open() {
        window.addEventListener('paste', this.onClipPaste);
        this.file = null;
        this.filePreview = '';
        this.saving = false;
        this.form = { title: '', type: 'image', tags: [], featured: false, description_md: '' };
        if (this.resourceId) {
          this.isNew = false;
          const j = await API.get('/api/resource/' + this.resourceId);
          this.editing = j.resource;
          const r = j.resource;
          const tags = (r.tags || []).slice();
          this.form = {
            title: r.title,
            type: r.type,
            tags,
            primaryTag: r.primary_tag && tags.includes(r.primary_tag) ? r.primary_tag : tags.length ? tags[0] : null,
            featured: r.featured,
            description_md: r.description_md || '',
          };
        } else {
          this.isNew = true;
          this.editing = null;
          if (this.initialTags && this.initialTags.length) {
            this.form.tags = this.initialTags.map(Number).slice();
            this.form.primaryTag = this.form.tags[0];
          }
        }
      },
      close() {
        window.removeEventListener('paste', this.onClipPaste);
        this.$emit('update:visible', false);
      },
      triggerFile() {
        this.$refs.fileInput.click();
      },
      onFile(e) {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        this.file = f;
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        const map = { png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image',
          mp3: 'audio', wav: 'audio', m4a: 'audio', flac: 'audio', ogg: 'audio', aac: 'audio',
          mp4: 'video', webm: 'video', mov: 'video', mkv: 'video', avi: 'video', m4v: 'video' };
        if (map[ext]) this.form.type = map[ext];
        if (!this.form.title) this.form.title = f.name.replace(/\.[^.]+$/, '');
        this.filePreview = URL.createObjectURL(f);
        e.target.value = '';
      },
      existingMediaSrc() {
        return this.editing && this.editing.media_path ? '/api/resource/' + this.editing.id + '/file' : '';
      },
      previewSrc() {
        if (this.file && this.form.type === 'image') return this.filePreview;
        return this.existingMediaSrc();
      },
      showPreview() {
        return (this.file && this.form.type === 'image') || (!this.file && this.editing && this.editing.media_path && this.editing.type === 'image');
      },
      async save() {
        if (this.isNew && !this.file) {
          ElementPlus.ElMessage.warning('请先选择媒体文件');
          return;
        }
        if (!this.form.title) {
          ElementPlus.ElMessage.warning('请输入资源名称');
          return;
        }
        this.saving = true;
        try {
          const fd = new FormData();
          fd.append('title', this.form.title);
          fd.append('type', this.form.type);
          fd.append('featured', this.form.featured ? '1' : '0');
          fd.append('tags', JSON.stringify(this.form.tags));
          fd.append('primary_tag', this.form.primaryTag ? String(this.form.primaryTag) : '');
          fd.append('description_md', this.form.description_md || '');
          if (this.file) fd.append('file', this.file);
          let res;
          if (this.isNew) {
            res = await API.sendForm('/api/resource', fd, 'POST', (p) => (this.progress = p));
          } else {
            res = await API.sendForm('/api/resource/' + this.editing.id, fd, 'PUT', (p) => (this.progress = p));
          }
          ElementPlus.ElMessage.success(this.isNew ? '已创建资源' : '已保存修改');
          await DB.refresh();
          this.$emit('saved', { id: res.resource.id, isNew: this.isNew });
          if (this.isNew && !this.stay) DB.navigate('/resource/' + res.resource.id);
          this.close();
        } catch (err) {
          ElementPlus.ElMessage.error(err.message || '保存失败');
        } finally {
          this.saving = false;
          this.progress = -1;
        }
      },
    },
    template: `
<el-dialog :model-value="visible" @update:model-value="$emit('update:visible',$event)" :title="isNew?'上传新资源':'编辑资源'" width="720px" :close-on-click-modal="false" destroy-on-close>
  <el-form label-width="86px" label-position="right">
    <el-form-item label="媒体文件">
      <div style="display:flex;gap:14px;align-items:center;width:100%">
        <div v-if="showPreview()" style="width:110px;height:80px;border-radius:8px;overflow:hidden;border:1px solid #e6dccb">
          <img :src="previewSrc()" style="width:100%;height:100%;object-fit:cover" />
        </div>
        <div v-else style="width:110px;height:80px;border-radius:8px;background:#f0e8d8;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:26px;color:#a38d6d">
          {{ isNew ? '无文件' : $$.typeIcon(form.type) }}
          <span v-if="!isNew" style="font-size:11px">{{ editing && editing.media_name }}</span>
        </div>
        <div style="flex:1">
          <el-button type="primary" plain @click="triggerFile">{{ isNew ? '选择文件上传' : '更换文件（可选）' }}</el-button>
          <div v-if="file" class="text-muted" style="margin-top:6px">已选择：{{ file.name }}（{{ $$.sizeFmt(file.size) }}）</div>
          <div v-if="isNew" class="text-muted" style="font-size:12px;margin-top:4px">支持图片 / 音频 / 视频文件；截图可直接 <b>Ctrl / ⌘ + V</b> 粘贴（编辑资源时粘贴可替换媒体）</div>
        </div>
        <input ref="fileInput" type="file" :accept="acceptStr" style="display:none" @change="onFile" />
      </div>
    </el-form-item>
    <el-form-item label="资源名称">
      <el-input v-model="form.title" placeholder="输入资源名称（中英文均可）" maxlength="200" show-word-limit />
    </el-form-item>
    <el-form-item label="资源类型">
      <el-radio-group v-model="form.type">
        <el-radio-button v-for="o in typeOptions" :value="o.value" :key="o.value">{{ o.label }}</el-radio-button>
      </el-radio-group>
    </el-form-item>
    <el-form-item label="所属标签">
      <div style="width:100%">
        <TagPicker v-model="form.tags" />
        <div class="text-muted" style="font-size:12px;margin-top:4px">可搜索已有标签；直接输入新标签名后回车即可创建并选中</div>
      </div>
    </el-form-item>
    <el-form-item label="主标签">
      <div style="width:100%">
        <el-select v-model="form.primaryTag" :disabled="!form.tags.length" placeholder="从所选标签中指定主标签" style="width:100%">
          <el-option v-for="tg in pickedTags" :key="tg.id" :value="tg.id" :label="$$.tName(tg)">
            <span><i :style="'display:inline-block;width:9px;height:9px;border-radius:50%;background:'+(tg.color||'#c9a268')+';margin-right:6px'"></i>{{ $$.tName(tg) }}</span>
          </el-option>
        </el-select>
        <div class="text-muted" style="font-size:12px;margin-top:4px">主标签的介绍将显示在资源介绍下方；不指定时默认取所选第一个标签</div>
      </div>
    </el-form-item>
    <el-form-item label="设为推荐">
      <el-switch v-model="form.featured" />
      <span class="text-muted" style="margin-left:10px">推荐内容将展示在首页「精选推荐」模块</span>
    </el-form-item>
    <el-form-item label="内容介绍">
      <div style="width:100%">
        <MdEditor v-model="form.description_md" placeholder="支持 Markdown：介绍资源内容、背景、出处、相关思考……" min-height="240px" />
      </div>
    </el-form-item>
  </el-form>
  <template #footer>
    <el-button @click="close">取消</el-button>
    <el-button type="primary" :loading="saving" @click="save">{{ isNew ? '创建资源' : '保存修改' }}</el-button>
  </template>
</el-dialog>`,
  };

  window.AppComponents = Comp;
})();
