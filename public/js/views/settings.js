'use strict';
(function () {
  const Views = window.AppViews = window.AppViews || {};

  Views.settings = {
    data() {
      return {
        tab: 'general',
        siteForm: {},
        mediaDir: '',
        mdDir: '',
        importDir: '',
        scanFiles: [],
        scanning: false,
        chosenFiles: {},
        busy: false,
        log: '',
        // folder browser dialog
        fsDlg: false,
        fsTarget: 'media',
        fsPath: '',
        fsParent: null,
        fsEntries: [],
        fsStarts: [],
        fsError: '',
        fsBusy: false,
      };
    },
    computed: {
      markedResources() {
        return DB.resources.filter((r) => r.featured).length;
      },
    },
    created() {
      this.siteForm = { title: DB.config.site.title, subtitle: DB.config.site.subtitle };
      this.mediaDir = DB.config.folders.media;
      this.mdDir = DB.config.folders.markdown;
    },
    methods: {
      async saveSite() {
        this.busy = true;
        try {
          await API.put('/api/config', { site: this.siteForm });
          await DB.refresh();
          ElementPlus.ElMessage.success('站点设置已保存');
        } catch (e) {
          ElementPlus.ElMessage.error(e.message || '保存失败');
        } finally {
          this.busy = false;
        }
      },
      async applyFolders(move) {
        if (!this.mediaDir || !this.mdDir) return ElementPlus.ElMessage.warning('请输入完整目录');
        if (move) {
          try {
            await ElementPlus.ElMessageBox.confirm(
              '将把现有媒体文件与 Markdown 文件移动到新目录（同名文件会保留新目录中的版本）。请确认目标目录不是已有文件的系统目录。',
              '移动数据目录', { type: 'warning' });
          } catch (e) {
            return;
          }
        }
        this.busy = true;
        try {
          if (move) {
            await API.post('/api/config/move', { media: this.mediaDir, markdown: this.mdDir });
          } else {
            await API.put('/api/config', { folders: { media: this.mediaDir, markdown: this.mdDir } });
          }
          await DB.refresh();
          ElementPlus.ElMessage.success(move ? '已移动文件并更新目录' : '目录设置已更新');
        } catch (e) {
          ElementPlus.ElMessage.error(e.message || '操作失败');
        } finally {
          this.busy = false;
        }
      },
      // ---- local folder browser ----
      openFs(target) {
        this.fsTarget = target;
        this.fsDlg = true;
        this.fsPath = target === 'media' ? this.mediaDir : this.mdDir;
        this.fsRefresh();
      },
      async fsRefresh() {
        this.fsBusy = true;
        this.fsError = '';
        try {
          const j = await API.get('/api/fs/browse?dir=' + encodeURIComponent(this.fsPath || ''));
          this.fsPath = j.dir; // null on root view
          this.fsParent = j.parent;
          this.fsEntries = j.entries || [];
          this.fsStarts = j.starts || [];
          this.fsError = j.error || '';
        } catch (e) {
          this.fsError = e.message || '加载失败';
        } finally {
          this.fsBusy = false;
        }
      },
      fsJump() {
        this.fsPath = String(this.fsPath || '').trim();
        this.fsRefresh();
      },
      fsNav(p) {
        this.fsPath = p;
        this.fsRefresh();
      },
      fsUp() {
        if (this.fsParent) this.fsNav(this.fsParent);
      },
      fsChoose(p) {
        const targetKey = this.fsTarget === 'media' ? 'mediaDir' : 'mdDir';
        this[targetKey] = p || '';
        this.fsDlg = false;
        ElementPlus.ElMessage.success('已选择目录，点击下方「保存目录指向」生效');
      },
      async fsNewFolder() {
        const base = String(this.fsPath || '').trim();
        if (!base) return ElementPlus.ElMessage.warning('请先进入一个目录再新建子文件夹');
        try {
          const { value } = await ElementPlus.ElMessageBox.prompt('将在「' + base + '」下创建：', '新建文件夹', {
            confirmButtonText: '创建并选用',
            cancelButtonText: '取消',
            inputPattern: /^[^\\/:*?"<>|]+$/,
            inputErrorMessage: '文件夹名不合法',
          });
          const name = String(value || '').trim();
          if (!name) return;
          const joined = base.replace(/[\\/]+$/, '') + '/' + name;
          const j = await API.post('/api/fs/mkdir', { dir: joined });
          this.fsChoose(j.dir);
        } catch (e) {
          if (e !== 'cancel' && e !== 'close') ElementPlus.ElMessage.error(e.message || '创建失败');
        }
      },
      async exportMd() {
        this.busy = true;
        try {
          const j = await API.post('/api/md/export-all', {});
          ElementPlus.ElMessage.success('已导出 资源 ' + j.resources + ' 个、标签 ' + j.tags + ' 个 的 Markdown 文件');
        } catch (e) {
          ElementPlus.ElMessage.error(e.message || '导出失败');
        } finally {
          this.busy = false;
        }
      },
      async importMd() {
        this.busy = true;
        try {
          await ElementPlus.ElMessageBox.confirm(
            '将从 Markdown 目录扫描 r*.md / t*.md，把内容（标题、介绍、标签）同步回资源库。若 md 中引用的媒体文件存在于媒体目录将自动挂载。是否继续？',
            '扫描导入 Markdown', { type: 'warning' });
          const j = await API.post('/api/md/import', {});
          const c = j.resources.filter((x) => x.action === 'create').length;
          const u = j.resources.filter((x) => x.action === 'update').length;
          ElementPlus.ElMessage.success('导入完成：新增 ' + c + '，更新 ' + u + '（含 ' + j.tags.length + ' 个标签文件）' + (j.errors.length ? '，错误 ' + j.errors.length : ''));
          if (j.errors.length) console.warn(j.errors);
          await DB.refresh();
        } catch (e) {
          if (e !== 'cancel' && e !== 'close') ElementPlus.ElMessage.error(e.message || '导入失败');
        } finally {
          this.busy = false;
        }
      },
      async scanFolder() {
        if (!this.importDir) return ElementPlus.ElMessage.warning('请输入要扫描的文件夹');
        this.scanning = true;
        this.scanFiles = [];
        try {
          const j = await API.post('/api/folders/scan', { folder: this.importDir });
          this.scanFiles = j.files || [];
          ElementPlus.ElMessage.success('发现 ' + this.scanFiles.length + ' 个媒体文件');
        } catch (e) {
          ElementPlus.ElMessage.error(e.message || '扫描失败');
        } finally {
          this.scanning = false;
        }
      },
      toggleAll() {
        const all = Object.keys(this.chosenFiles).length === this.scanFiles.length;
        this.chosenFiles = {};
        if (!all) for (const f of this.scanFiles) this.chosenFiles[f.abs] = true;
      },
      async importScanned() {
        const files = this.scanFiles.filter((f) => this.chosenFiles[f.abs]).map((f) => f.abs);
        if (!files.length) return ElementPlus.ElMessage.warning('请勾选要导入的文件');
        this.busy = true;
        try {
          const j = await API.post('/api/import/files', { files });
          ElementPlus.ElMessage.success('已导入 ' + j.created + ' 个资源');
          this.chosenFiles = {};
          await DB.refresh();
        } catch (e) {
          ElementPlus.ElMessage.error(e.message || '导入失败');
        } finally {
          this.busy = false;
        }
      },
    },
    template: `
<div>
  <h1 style="font-size:24px;margin:0 0 4px">设置</h1>
  <div class="text-muted" style="margin-bottom:14px">数据存储、站点与 Markdown 同步管理</div>
  <el-tabs v-model="tab">
    <el-tab-pane label="站点信息" name="general">
      <div class="card" style="max-width:620px">
        <el-form label-width="90px">
          <el-form-item label="站点名称"><el-input v-model="siteForm.title" /></el-form-item>
          <el-form-item label="副标题"><el-input v-model="siteForm.subtitle" /></el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="busy" @click="saveSite">保存站点信息</el-button>
          </el-form-item>
        </el-form>
        <div class="text-muted" style="font-size:12px">站点名显示在左侧导航与首页标题处。</div>
      </div>
      <div class="card" style="max-width:620px;margin-top:14px">
        <h3 style="margin:0 0 8px">数据规模</h3>
        <div class="stats-row" style="margin-bottom:0">
          <div class="stat-chip"><b>{{ DB.stats.resources||0 }}</b>资源</div>
          <div class="stat-chip"><b>{{ DB.stats.tags||0 }}</b>标签</div>
          <div class="stat-chip"><b>{{ markedResources }}</b>推荐</div>
        </div>
      </div>
    </el-tab-pane>

    <el-tab-pane label="存储目录" name="folders">
      <div class="card" style="max-width:760px">
        <div class="text-muted" style="margin-bottom:8px;line-height:1.9">
          图片/音频/视频文件保存在「媒体目录」下的 images / audios / videos 子目录；每条资源与标签对应的 <code class="path">.md</code> 文件保存在 Markdown 目录。
          支持把两个目录指向本地硬盘任意文件夹（绝对路径），方便将素材库整体迁移、备份或用其他编辑器修改 Markdown。
        </div>
        <el-form label-width="110px">
          <el-form-item label="媒体目录">
            <div style="display:flex;gap:8px;width:100%">
              <el-input v-model="mediaDir" placeholder="/绝对/路径/媒体库" />
              <el-button @click="openFs('media')">浏览…</el-button>
              <el-button @click="mediaDir=DB.config.folders.media">还原</el-button>
            </div>
          </el-form-item>
          <el-form-item label="Markdown目录">
            <div style="display:flex;gap:8px;width:100%">
              <el-input v-model="mdDir" placeholder="/绝对/路径/知识库md" />
              <el-button @click="openFs('markdown')">浏览…</el-button>
              <el-button @click="mdDir=DB.config.folders.markdown">还原</el-button>
            </div>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="busy" @click="applyFolders(false)">保存目录指向（不移动文件）</el-button>
            <el-button type="warning" plain :loading="busy" @click="applyFolders(true)">迁移：移动现有文件到新目录</el-button>
          </el-form-item>
        </el-form>
        <div style="background:#fbf4e6;border-radius:8px;padding:10px;font-size:12px;color:#8a5a34">
          💡 建议：新目录指向新建/空目录后再点「迁移」，避免与已有文件混淆。
        </div>
      </div>
    </el-tab-pane>

    <el-tab-pane label="Markdown 同步" name="md">
      <div class="card" style="max-width:760px">
        <div style="line-height:1.9;font-size:13px;color:#5a4c3a;margin-bottom:12px">
          每个资源生成 <code class="path">resources/r{id}.md</code>（含标题/标签/媒体引用 front-matter + 正文），每个标签生成 <code class="path">tags/t{id}.md</code>。
          你可以用任意 Markdown 编辑器（VS Code、Typora 等）直接修改这些文件，再点击「导入」把内容同步回来。完全离线、易于版本管理。
        </div>
        <div style="margin-bottom:12px">
          <span class="text-muted" style="font-size:12px">Markdown 目录：</span><code class="path">{{ DB.config.folders.markdown }}</code>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <el-button type="primary" :loading="busy" @click="exportMd">导出全部 Markdown</el-button>
          <el-button type="success" :loading="busy" @click="importMd">扫描并导入 Markdown</el-button>
        </div>
        <div class="text-muted" style="font-size:12px;margin-top:10px">新建资源的介绍建议直接在上传对话框中用 Markdown 编写；数据在保存时会同时写一份 md 文件。</div>
      </div>
    </el-tab-pane>

    <el-tab-pane label="从文件夹导入媒体" name="import">
      <div class="card" style="max-width:760px">
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <el-input v-model="importDir" placeholder="输入本地硬盘中要扫描的文件夹路径，如 /Users/me/Pictures/古籍扫描" />
          <el-button type="primary" :loading="scanning" @click="scanFolder">扫描</el-button>
        </div>
        <div v-if="scanFiles.length" class="text-muted" style="font-size:12px">共 {{ scanFiles.length }} 个媒体文件（已自动跳过媒体库中已有文件）。勾选后导入将复制到媒体库目录。</div>
        <div v-if="scanFiles.length" style="margin:10px 0">
          <el-button size="small" @click="toggleAll">全选 / 全不选</el-button>
          <el-button size="small" type="primary" :loading="busy" @click="importScanned">导入勾选（{{ Object.keys(chosenFiles).length }}）</el-button>
        </div>
        <div v-if="scanFiles.length" class="card" style="padding:8px;max-height:420px;overflow:auto">
          <el-checkbox-group :model-value="scanFiles.filter(f=>chosenFiles[f.abs]).map(f=>f.abs)" @update:model-value="v=>{chosenFiles={};v.forEach(x=>chosenFiles[x]=true)}">
            <div v-for="f in scanFiles" :key="f.abs" style="padding:3px 2px;border-bottom:1px dashed #eee">
              <el-checkbox :value="f.abs" :label="f.abs">{{ $$.typeIcon(f.type) }} {{ f.name }} <span class="text-muted" style="font-size:11px">· {{ $$.typeLabel(f.type) }} · {{ $$.sizeFmt(f.size) }}</span></el-checkbox>
            </div>
          </el-checkbox-group>
        </div>
      </div>
    </el-tab-pane>
  </el-tabs>

  <el-dialog :model-value="fsDlg" @update:model-value="fsDlg=$event" title="选择本地文件夹" width="700px" append-to-body>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <el-input v-model="fsPath" placeholder="输入完整路径后回车跳转，或从下方目录逐级进入" @keyup.enter="fsJump" clearable />
      <el-button @click="fsJump">跳转</el-button>
      <el-button @click="fsUp" :disabled="!fsParent">上一级</el-button>
    </div>
    <div v-if="fsStarts.length" style="margin-bottom:10px">
      <span class="text-muted" style="font-size:12px;margin-right:8px">快速进入</span>
      <el-button size="small" v-for="s in fsStarts" :key="s.label" @click="fsNav(s.path)">📁 {{ s.label }}</el-button>
    </div>
    <div v-if="fsError" style="color:#c0392b;font-size:12px;margin-bottom:8px;background:#fbeaea;padding:6px 10px;border-radius:6px">{{ fsError }}</div>
    <div v-if="fsPath && !fsBusy && !fsEntries.length" class="text-muted" style="font-size:12px;padding:6px 0">（无子文件夹；可直接新建或输入路径跳转）</div>
    <div v-loading="fsBusy" class="fs-list">
      <div class="fs-row" v-for="en in fsEntries" :key="en.path" @click="fsNav(en.path)">
        <span>📁</span>
        <span class="fs-name">{{ en.name }}</span>
        <span class="fs-path">{{ en.path }}</span>
      </div>
    </div>
    <div v-if="fsPath" class="text-muted" style="font-size:12px;margin-top:8px">当前将选用：<code class="path">{{ fsPath }}</code></div>
    <template #footer>
      <el-button @click="fsDlg=false">取消</el-button>
      <el-button @click="fsNewFolder">新建文件夹…</el-button>
      <el-button type="primary" :disabled="!fsPath" @click="fsChoose(fsPath)">选用当前目录</el-button>
    </template>
  </el-dialog>
</div>`,
  };
  window.AppViews = Views;
})();
