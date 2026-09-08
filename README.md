# 文史哲知识库 · WszCMS

> 纯本地运行的「文学 · 历史 · 哲学」个人知识管理系统。围绕 **资源（媒体 + Markdown）+ 多层级标签** 组织内容，数据全部落在本机（SQLite + 媒体文件 + Markdown 镜像），无需注册、无需外网依赖。

## 功能特性

**资源管理**
- 支持图片 / 音频 / 视频 / 纯文本 Markdown 四类资源，单文件上传上限 2GB
- 上传弹窗支持**快捷键创建标签**：输入新标签名回车即可创建并选中，无需离开弹窗；选好标签后可指定「主标签」
- 资源详情页在内容介绍下方展示主标签的介绍文本（点标签可跳转维护）
- 上传弹窗支持**剪贴板粘贴**：复制 / 截图后 `Ctrl / ⌘ + V` 直接粘贴为图片资源（编辑资源时粘贴可替换媒体）
- 资源库列表：类型筛选、按标签查看（可含子标签）、关键字搜索、推荐排序
- 批量勾选删除（可选同时删除本地媒体与 Markdown）
- 图片详情支持**点击放大**：滚轮缩放（0.2–8×）、拖拽平移、双击还原、90° 旋转、一键下载
- 音视频内嵌播放，支持 Range 断点续传 / 拖动进度

**标签系统**
- 标签支持**多父级层级**（如 `哲学 → 西方哲学`），自动防环
- 每个有父级的标签维护一个「主父级」用于归位展示；查看父标签可默认聚合子标签资源
- 标签名同时维护**中文名 / 英文名 / 本土语言名**（如 `哲学|Philosophy|Φιλοσοφία`），创建时按文字自动归入对应语种，全站统一按该格式显示
- 一个资源可挂多个标签，并指定其中一者为**主标签**（默认取所选第一个）；详情页会把主标签的介绍显示在资源介绍下方
- 标签着色、排序、描述，标签总览卡片 + 首页轮播

**首页可定制**
- 顶部菜单、站点名称与副标题可在「设置 → 站点」修改
- 首页模块（精选推荐 / 最新收录 / 标签轮播等）可开关、排序、改名，实时预览保存

**Markdown 双向同步**
- 每条资源、每个标签都会在本地 Markdown 目录镜像为 `r{id}.md` / `t{id}.md`，可用任意文本编辑器直接维护，再一键导入
- 支持从本机任意媒体文件夹扫描出未入库的图片 / 音视频文件，一键批量导入；front-matter 中出现的未知标签名会自动创建

**纯本地技术栈**
- 服务端：Node.js（内置 `node:sqlite`，无需额外数据库进程）+ Express + Multer
- 前端：Vue 3 + Element Plus + marked + dayjs，第三方库由 `/vendor` 本地路径提供，**无 CDN、无构建步骤**

## 快速开始

环境要求：Node.js ≥ 22.5（使用 `node:sqlite` 内置模块）。

```bash
npm install
npm start        # 前台启动；或 npm run dev（文件变更自动重启）
```

启动后访问 <http://localhost:4780>（可通过环境变量 `PORT` 修改端口，例如 `PORT=9000 npm start`）。

首次启动会自动创建 `data/` 目录、数据库与默认媒体 / Markdown 文件夹。仓库内已附带一份文史哲示例内容，便于快速体验。

## 目录结构

```
├── public/                  # 前端静态资源（Vue3 无构建，浏览器直接加载）
│   ├── index.html
│   ├── css/app.css
│   └── js/
│       ├── app.js           # 入口：路由与布局
│       ├── api.js           # REST 封装
│       ├── store.js         # 客户端数据 store（缓存 / 导航）
│       ├── components.js    # 通用组件（Markdown 渲染、资源表单等）
│       ├── util.js          # 格式化 / Markdown 等工具
│       └── views/           # 页面视图
│           ├── home.js      # 首页（精选 / 最新 / 标签轮播）
│           ├── library.js   # 资源库（筛选 / 搜索 / 批量）
│           ├── detail.js    # 资源详情（媒体 + lightbox + 关联标签）
│           ├── tag.js       # 标签总览 / 分类详情
│           ├── tag-manage.js# 标签层级管理
│           └── settings.js  # 设置（目录 / 站点 / 首页 / Markdown 同步）
├── server/
│   ├── index.js             # Express 应用与全部 REST API
│   ├── store.js             # 业务逻辑与 config.json
│   ├── md.js                # Markdown 双向同步实现
│   └── db.js                # SQLite 连接与建表
├── data/                    # 运行时数据（已被 .gitignore 忽略）
│   ├── library.db           # SQLite：resource / tag / resource_tag / tag_edge
│   ├── config.json          # 目录配置、站点信息、首页配置
│   ├── media/               # 媒体原件（images / audios / videos，按年月归档）
│   └── markdown/            # Markdown 镜像
│       ├── resources/r1.md  # 资源正文（内容介绍）
│       └── tags/t1.md       # 标签描述
└── package.json
```

## 数据与目录约定

- 应用数据根目录默认 `./data`，可用环境变量 `WZS_DATA` 指向其他位置（例如外置 U 盘 / NAS 同步盘）。
- 媒体文件夹 / Markdown 文件夹可在设置页改到任意本机绝对路径，路径后提供「浏览…」**目录选择器**（逐级进入、快速入口、可直接新建子文件夹），用于将素材库与知识库镜像放到喜欢的位置；修改后可执行「移动数据」把既有文件搬过去。
- 界面偏好：顶栏按钮可一键**隐藏 / 显示左侧边栏**，选择会记忆（localStorage）。

### Markdown 镜像格式

`data/markdown/resources/r1.md` 示例：

```markdown
---
id: "1"
type: "image"
title: "柏拉图《理想国》"
featured: "true"
tags: ["西方哲学"]
primary: "西方哲学"
media: "images/2026/09/xxxx.png"
media_name: "test1.png"
created: "2026-09-08T02:20:12.878Z"
updated: "2026-09-08T02:21:13.250Z"
---
这里是资源的内容介绍（Markdown 正文）。
```

标签镜像 `data/markdown/tags/t1.md` 与之类似，字段为 `name / name_zh / name_en / name_native / color / parents[]`，其中 `name` 为内部唯一主名（自动归类后同时落在对应语种字段）；资源镜像的 `primary` 字段记录主标签名。

### 同步机制

- **自动回写**：通过界面新建 / 编辑资源或标签时，对应 md 文件即时更新。
- **导出全部**：设置页一键把所有资源与标签重写为 md（适合迁移或备份为纯文本）。
- **本地直接编辑**：可离线用编辑器修改 md 的正文或 front-matter（如把 `tags` 换成新标签名、`featured` 改 `"false"`），再到「设置 → Markdown 同步」导入。
- **导入规则**：资源 / 标签以 front-matter 的 `id` 为主键（存在则覆盖更新，不存在则新建）；正文按类型解析为「内容介绍」或标签描述；`media` 字段关联媒体文件，未知标签名自动创建。
- 直接向 `resources/`、`tags/` 目录放入新的 Markdown 文件（带 front-matter）后点「导入」，即可整批入库。

## 主要 API

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/bootstrap` | 一次拉取配置、资源、标签树与统计 |
| `GET /api/resources` | 资源列表（`type / tag / q / featured` 过滤） |
| `POST /api/resource` | multipart 新建资源（可带 `file`、`tags` JSON、`primary_tag`、`description_md`） |
| `PUT /api/resource/:id` | 更新资源（可替换媒体文件，带 `primary_tag` 指定主标签） |
| `DELETE /api/resource/:id` | 删除（`?file=1` 连带删除本地媒体与 md） |
| `POST /api/resource/batch-delete` | 批量删除 |
| `GET /api/resource/:id/file` | 流式媒体下载（支持 Range） |
| `GET /api/resource/:id/raw` | 读取资源 md 源文件 |
| `GET/POST/PUT /api/tag…` `POST /api/tag-edge…` | 标签与多父级关系维护（建标签自动归类语种，可提交 `name_zh/name_en/name_native`） |
| `POST /api/md/export-all` `POST /api/md/import` | Markdown 全量导出 / 导入 |
| `GET/PUT /api/config` `POST /api/config/move` | 站点 / 目录配置 |
| `GET /api/fs/browse` `POST /api/fs/mkdir` | 目录选择器：浏览本机文件夹 / 新建文件夹 |
| `POST /api/folders/scan` | 扫描本机文件夹中未入库的媒体文件 |

## 说明

- 本项目面向个人本地使用：**无账号鉴权**，请勿直接暴露到公网；如需共享请置于可信内网。
- 数据即文件：`data/` 整体备份即可完成迁移，无需导出数据库。
