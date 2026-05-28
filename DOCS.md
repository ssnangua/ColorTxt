## 开发

### 安装依赖

```bash
npm install
```

### 运行开发环境

```bash
npm run dev
```

### 类型检查（可选）

```bash
npm run typecheck
```

### 预览构建结果（可选）

```bash
npm run preview
```

### 构建与打包

```bash
npm run build
```

打包产物默认输出到 `release` 目录，目标平台配置如下：

- macOS：`dmg`
- Windows：`nsis`、`portable`
- Linux：`AppImage`

自 2.3 起内置本地向量模型后安装包变大；`npm run build` / `npm run release` 的流程为：`electron-vite build` → **`scripts/prune-pack-deps.mjs`**（裁剪将打入 **`app.asar` / `app.asar.unpacked`** 的 `node_modules`）→ `electron-builder`。**裁剪项清单**见 **项目结构 → `scripts/` →「打包前 node_modules 裁剪」**。

相较于 2.2，`app.asar` 内 `node_modules` 仍会增大约 15～17MB（主要为当前平台的 `onnxruntime-node` JS + `@huggingface`；原生 `bin` 在 `app.asar.unpacked`，约 15MB）。`asarUnpack` 仅解包 `better-sqlite3`、`sqlite-vec*`、`onnxruntime-node/bin` 等原生路径。

打包后本地开发异常可执行 **`npm ci`** 恢复依赖。

### 发布

GitHub 用户 Settings -> Developer settings -> Personal access tokens，生成一个 Token 并勾选 `repo` 权限。

设置 GitHub Token 环境变量：

```bash
# PowerShell
$env:GH_TOKEN = '你的TOKEN'
# 验证
echo $env:GH_TOKEN

# Windows CMD
set "GH_TOKEN=你的TOKEN"
# 验证
echo %GH_TOKEN%

# Bash / Zsh
export GH_TOKEN='你的TOKEN'
# 验证
echo $GH_TOKEN
```

```bash
# 创建一个新 tag
git tag v1.0.0
# 推送至远端
git push origin v1.0.0
# 构建打包并发布到 GitHub Releases
npm run release
```

### 撤销发布

发布后，如果想撤销发布，需要先在 [网页端](https://github.com/ssnangua/ColorTxt/releases) 删除相应的 Release 记录，然后再执行下面的命令删除 tag：

```bash
# 删除 tag
git tag -d v1.0.0
# 推送至远端删除
git push origin :refs/tags/v1.0.0
```

### 发布新版本

```bash
# 将改动提交到本地仓库
git commit -a -m "修改了xxx"

# 更新版本号
npm version patch|minor|major

# 将本地仓库的改动推送到远程仓库
git push
```

后面走发布流程。

### 项目结构

仓库根目录常用目录与文件：

| 目录 / 文件               | 说明 |
| ------------------------- | ---- |
| `src/`                    | 应用源码（主进程、预加载、渲染进程、共享常量） |
| `scripts/`                | 构建与开发辅助脚本；**`prune-pack-deps.mjs`** 由 `npm run build` / `release` 在 `electron-builder` 前调用（见 **「打包前 node_modules 裁剪」**），其余为本地调试/探测用 |
| `resources/`              | 打包资源（应用图标、macOS entitlements 等） |
| `dist/`                   | `electron-vite build` 编译输出，供 `electron-builder` 打入安装包 |
| `release/`                | `electron-builder` 最终产物输出目录 |
| `images/`                 | 文档用截图等（不参与应用打包逻辑） |
| `package.json`            | npm 脚本与依赖；`electron-builder` 打包/发布相关配置也在此 |
| `vite.config.ts`          | 供编辑器 / 工具链用的 Vite 占位配置；实际构建以 electron-vite 为准 |
| `electron.vite.config.ts` | electron-vite 主构建配置（三入口、`define` 注入、Monaco worker 输出、`index.html` 占位替换）；细节见下节 |

##### `electron.vite.config.ts` 要点

- 主进程、preload、渲染进程三端入口与构建管线由 electron-vite 统一调度。
- `define` 注入 `__APP_DISPLAY_NAME__` 与 `__GITHUB_REPO_URL__`：显示名优先取 `package.json` 的 `build.productName`，否则 `name`，再兜底 `ColorTxt`；仓库 URL 取 `homepage` 并去掉尾部 `/`。
- 渲染进程配合 `vite-plugin-monaco-editor`：`publicPath` 为 `monacoeditorwork`；`customDistPath` 仅基于 `outDir` 拼接 worker 输出目录，规避 Windows 下将 `root` 与 `outDir` 的绝对路径拼进 `path.join` 时的异常。
- `transformIndexHtml`：把 `index.html` 里的 `%APP_DISPLAY_NAME%` 替换为上述显示名。
- 主进程另打包 **`embedding/embeddingWorker`** 入口（`@huggingface/transformers` 在 Worker 线程跑内置嵌入，见 **「内置向量模型与缓存目录」**）。

##### `scripts/` 要点

| 文件 | 说明 |
| ---- | ---- |
| `prune-pack-deps.mjs` | **打包管线**：`electron-vite build` 之后、`electron-builder` 之前执行；支持 `--platform` / `--arch`。裁剪清单见下节 |
| `sharp-pack-stub/` | 打包用 **`sharp` 占位包**（供 `@huggingface/transformers` 加载，非完整 native sharp） |
| `probe-chm.mjs` / `probe-chm.ts` | 命令行探测 CHM 解析（开发用，不参与打包） |
| `llm-extract-top-characters.mjs` | 本地大模型角色提取可行性测试（开发用，不参与打包） |

##### 打包前 node_modules 裁剪

由 **`scripts/prune-pack-deps.mjs`** 在打包前修改项目根目录的 `node_modules`（同时影响 **`app.asar`** 与 **`app.asar.unpacked`** 中的依赖树）。交叉编译时可传 `--platform win32|darwin|linux`、`--arch x64|arm64`（默认取当前机器）。裁剪后若需恢复完整依赖：**`npm ci`**。

**整包移除（`node_modules` 顶层）**

| 包 / 模式 | 说明 |
| --------- | ---- |
| `onnxruntime-web` | Web/WASM 推理，内置向量不用 |
| `sharp`（完整包）、`@img/*` | 本应用不做图像推理；根目录 **`package.json` 依赖 `file:scripts/sharp-pack-stub`**，打包时覆盖完整 sharp，保证 asar 内可 `import "sharp"` |
| `protobufjs`、`@protobufjs/*`、`flatbuffers`、`long`、`platform`、`guid-typescript` | 删 `onnxruntime-web` 后的孤儿依赖 |
| `prebuild-install`、`napi-build-utils`、`node-abi`、`expand-template`、`mkdirp-classic`、`deep-extend`、`fs-constants`、`github-from-package`、`ini`、`rc`、`simple-concat`、`simple-get`、`tunnel-agent`、`strip-json-comments`、`tar-fs`、`tar-stream` | 仅 install / node-gyp 阶段使用 |
| `sqlite-vec-*-*`（非当前平台/架构） | 仅保留与 `--platform` / `--arch` 匹配的一个平台包 |

**按包裁剪的路径或文件**

| 包 | 移除内容 | 保留（运行时） |
| --- | -------- | -------------- |
| `@huggingface/transformers` | `dist/*` 除 `transformers.node.mjs`；`src/`、`types/`、README；`package.json` 中的 `onnxruntime-web`、`sharp` 依赖声明 | Node 入口 `transformers.node.mjs` |
| `@huggingface/jinja` | `src/`、`tsconfig.json`、README、`dist/*.d.ts.map` | `dist` 下编译产物 |
| `onnxruntime-node` | 非目标平台的 `bin/napi-v3/*`；`lib/`、`script/`、README；`dist/*.map`；Windows 下 **`DirectML.dll`**（内置向量固定 CPU） | 当前平台 `bin/napi-v3/{plat}/{arch}` 与 `dist/*.js` |
| `onnxruntime-common` | `lib/`（TS 源码）、README、`dist/**/*.map`、`dist/**/*.d.ts` | `dist` 下 JS |
| `better-sqlite3` | **`deps/`**（含 **`sqlite3.c`**）、`src/`、`binding.gyp`、README；`package.json` 中的 **`prebuild-install`** 依赖声明 | `lib/`、`build/Release/*.node`、`bindings` |
| `font-list` | 非当前平台的 `libs/{darwin,linux,win32}`；`demo.js`、测试脚本、类型定义、README | `index.js`、`index.mjs`（ESM 入口）、`libs/core.js`、当前平台 `libs/` |
| `sqlite-vec` | README、`index.d.ts` | `index.cjs` / `index.mjs` |
| `sqlite-vec-{platform}-{arch}` | README | 原生扩展（如 Windows 的 `vec0.dll`） |

**全 `node_modules` 树**

- 所有 **`*.map`**（source map）
- 各包下的 **`README.md`**、**`CHANGELOG.md`**

#### `src/` 总览

```text
src/
├── main/
│   ├── index.ts              # 主进程入口：协议、窗口、IPC、单实例
│   ├── ipcHandlers.ts        # 业务 IPC（对话框、目录、流式读、字体、主题等）
│   ├── detectTextEncoding.ts # 文本文件编码探测（BOM / jschardet / 中文 ANSI 启发式）
│   ├── registerAiIpc.ts      # `ai:*` IPC 集中注册
│   ├── launchTxtHandlers.ts  # 单实例与 `.txt` 启动/关联打开
│   ├── colortxtLocalProtocol.ts # `colortxt-local://` 本地资源短 URL
│   ├── windowFactory.ts      # 创建 BrowserWindow、加载页、DevTools、边界钩子
│   ├── windowBounds.ts       # 窗口几何持久化与屏幕校验
│   ├── globalShortcuts.ts    # 系统级全局快捷键注册/注销
│   ├── updater.ts            # 自动更新与相关 IPC
│   ├── updaterMessages.ts    # 更新错误中文映射
│   ├── dialogInvoke.ts       # 打开/保存对话框参数解析
│   ├── messageBoxInvoke.ts   # `showMessageBox` 参数解析
│   ├── aiPaths.ts            # AI 数据/模型缓存根路径解析（`aiDataCacheDir` 等）
│   ├── aiDataFs.ts           # 数据缓存与模型缓存目录迁移、旧版布局升级
│   ├── aiConfig.ts           # `config.json` 读写（路径由 `aiPaths` 决定）
│   ├── aiVectorDb.ts         # SQLite + sqlite-vec 向量库（路径随数据缓存根）
│   ├── aiEmbedding.ts        # 远程 API 与内置嵌入分支、维度探测
│   ├── aiChat.ts             # OpenAI 兼容流式对话
│   ├── aiAgentChat.ts        # Agent 工具循环与 `ai:agent:event`（含 token 预估/汇总）
│   ├── aiChatThinking.ts     # 深度思考：按服务商注入请求参数、解析流式推理 delta
│   ├── aiChapterPlainTextBridge.ts # ragContext：向渲染进程索取章节原文
│   ├── embedding/            # 内置嵌入 Worker 与本地后端（`localEmbeddingBackend.ts` 等）
│   ├── aiRagChapterDigest.ts # 超长章分段压缩为全章提要
│   ├── aiAgentTools.ts       # Agent 工具实现
│   ├── aiCharacterPortrait.ts # 角色抽取、画风与文生图编排
│   ├── aiTxt2Img.ts          # 文生图路由（A1111 / Comfy / 云端）
│   ├── aiTxt2ImgPromptAdapt.ts # 画风+形象 → SD tag 或自然语言 prompt
│   ├── aiTxt2ImgTestConnection.ts # 文生图轻量连通性探测（不出图）
│   ├── aiTxt2ImgDashScope.ts / aiTxt2ImgOpenAI.ts / aiTxt2ImgStability.ts …
│   ├── aiBookHash.ts         # 书籍内容哈希（与渲染侧一致）
│   ├── characterPortraitFs.ts # 立绘缓存目录与文件迁移
│   └── resolveSqliteVecPath.ts # sqlite-vec 原生扩展路径解析
├── preload/
│   └── index.ts              # `contextBridge` 暴露 `window.colorTxt`
├── renderer/
│   ├── index.html            # 渲染进程 HTML 壳
│   └── src/
│       ├── main.ts           # 挂载 Vue 应用
│       ├── App.vue           # 根组件：布局、阅读器参数、侧栏与设置总线
│       ├── appShell.css      # `App.vue` 作用域布局样式
│       ├── injectionKeys.ts  # `provide` / `inject` 的 `InjectionKey`
│       ├── style.css         # 全局样式与主题变量
│       ├── env.d.ts          # 全局与 `window.colorTxt` 类型声明
│       ├── chapter.ts        # 章节检测、行首缩进与物理/展示列映射
│       ├── icons.ts          # 内联 SVG 图标汇总
│       ├── assets/           # 字体与静态图标
│       ├── public/
│       │   └── card-textures/    # 角色卡全息贴图（grain、glitter、cosmos 分层、foil 等）
│       ├── styles/
│       │   ├── characterCardHolo.css         # 全息基础层、off/soft、透视与 popover 旋转
│       │   └── characterCardHoloEffects.css  # 各 `data-char-texture` 效果样式
│       ├── components/       # Vue 组件（见下文组件表）
│       ├── composables/      # 根级组合式职责拆分（见补充说明）
│       │   ├── useConnectionTest.ts       # 设置页「测试连接」按钮状态（pending/ok/fail）
│       │   ├── useAppBookmarkPins.ts      # 书钉与书签（行号锚点、章节名、弹窗预览、Teleport 菜单等，见 DOCS「书签」）
│       │   ├── useAppChapterListSync.ts   # 列表「滚到当前」同步一拍
│       │   ├── useAppChapterNavigation.ts # 章节跳转与规则联动
│       │   ├── useAppFileSession.ts       # 打开/目录/会话与流管道
│       │   ├── useAppFullscreenReaderLayout.ts # 全屏正文宽度与空白区交互
│       │   ├── useAppPersistence.ts       # 设置、会话、列表、meta 持久化
│       │   ├── useAppReaderChrome.ts      # 全屏顶/底/侧栏悬停与宽度
│       │   ├── useAppReaderUiPrefs.ts     # 阅读偏好与 Monaco 同步
│       │   ├── useAppReadingProgress.ts   # 阅读进度展示模型
│       │   ├── useAppSyncCurrentFileWatch.ts # 外部变更自动重载
│       │   ├── useAppShellThemeWatch.ts   # 主题与原生主题 IPC
│       │   ├── useAppWindowBindings.ts    # 快捷键、拖放、流结束与卸载落盘
│       │   ├── useReaderSidebarLists.ts   # 侧栏虚拟列表与筛选排序
│       │   ├── useReaderInlineSearch.ts   # 阅读区内联搜索
│       │   ├── useFileListCategorySort.ts # 分类下拉与排序文案
│       │   ├── useFileListSelection.ts    # 文件列表编辑模式多选
│       │   ├── useFileListMenus.ts        # 右键与分类浮层
│       │   ├── useTxtStreamPipeline.ts    # 大文件流式解析与映射
│       │   ├── useAiChapterPlainTextBridge.ts # 响应 `ai:chapter-plain-request` 回传章文
│       │   ├── useAiFoldContentSelectAll.ts # 助手折叠区全选
│       │   ├── useSecretStorageHint.ts      # 设置页 API 密钥落盘说明文案
│       │   ├── useCharacterCardTilt.ts      # 角色卡指针倾斜 + 光泽 CSS 变量（弹簧跟手/回正）
│       │   └── useCharacterCardPopoverZoom.ts # 角色卡原位放大（Teleport、平移/缩放/Y 旋转）
│       ├── constants/
│       │   ├── appUi.ts          # UI 常量、存储 key、侧栏与字号边界
│       │   ├── readerPalette.ts  # 阅读器表面色默认值与合并
│       │   ├── highlightColors.ts # 自定义高亮色默认与解析
│       │   ├── fileCategories.ts # 文件分类与排序常量
│       │   └── readerSidebarTab.ts # 侧栏 tab id 常量
│       ├── monaco/           # Monaco 阅读器扩展
│       │   ├── chapterStickyScroll.ts    # 黏性章节大纲
│       │   ├── readerEditorOptions.ts    # 编辑器选项构建
│       │   ├── readerInlineDecorations.ts # 章节行内装饰与 Monarch
│       │   ├── readerImageViewZones.ts   # 插图 ViewZone
│       │   ├── readerKeyScroll.ts        # 键盘滚动
│       │   ├── txtrHighlightMonarch.ts   # 自定义高亮词 Monarch 规则
│       │   └── txtrTextMonarch.ts        # `txtr-text` Monarch 语言
│       ├── reader/
│       │   ├── readerDisplayPipeline.ts # 物理行 → 展示正文（压缩/缩进/章节留白）
│       │   ├── readerTextFormat.ts      # 编辑态格式化（压缩空行、行首缩进）封装
│       │   ├── initialSidebarTab.ts     # 首屏侧栏 tab（是否将加载文件）
│       │   ├── chapterIndex.ts         # 视口章节下标（二分）
│       │   ├── lineMapping.ts          # 物理行与显示行映射
│       │   ├── readerViewportAnchor.ts # 视口锚点（物理行 + 折行视觉行，切换排版/编辑用）
│       │   ├── ebookAnchorLookup.ts    # 电子书内链行映射
│       │   ├── readerEbookPointer.ts   # 内链点击命中辅助
│       │   └── readerHighlightGeometry.ts # 高亮词浮动层几何
│       ├── markdown/             # Markdown 章节与图片展开
│       │   ├── markdownChapter.ts      # ATX 标题、章节表
│       │   ├── markdownBlockContext.ts # 围栏/缩进代码块（# 误识别防护）
│       │   └── markdownImages.ts       # `![…](…)` → `<<IMG:…>>`
│       ├── ebook/                # 电子书转 ColorTxt
│       │   ├── convertEbookToColorTxt.ts   # 调度、缓存与写出
│       │   ├── ebookFormat.ts    # 路径判定与输出基名
│       │   ├── ebookTypes.ts     # 转换产物类型
│       │   ├── pathUtils.ts      # 路径片段规范化
│       │   ├── yieldToUi.ts      # 长任务让出主线程
│       │   ├── ebookInternalLinkMarkers.ts # 内链标记与转义
│       │   ├── parseEpub.ts      # EPUB 解析
│       │   ├── parseMobi.ts      # MOBI / AZW3
│       │   ├── parsePdf.ts       # PDF 文本层
│       │   ├── parseFb2.ts       # FB2 / FBZ
│       │   ├── parseChm.ts       # CHM 解析入口
│       │   ├── chm/
│       │   │   ├── chmArchive.ts # CHM 归档读取
│       │   │   └── lzxDecode.ts  # LZX 解压
│       │   └── mobi/
│       │       ├── foliateMobi.js    # Foliate MOBI 引擎
│       │       └── foliateMobi.d.ts  # 类型声明
│       ├── ai/                   # 建索引与内置嵌入就绪校验
│       │   ├── buildBookVectorIndex.ts # 按章节切块并写入向量库
│       │   └── embeddingReady.ts       # 建索引前检查内置模型是否已下载
│       ├── aiAssistant/          # AI 助手数据与导出
│       │   ├── aiAssistantTypes.ts      # UI 消息等类型
│       │   ├── aiAssistantSegments.ts   # 消息分段
│       │   ├── aiAssistantPlainText.ts  # 可复制纯文本
│       │   ├── aiAssistantDbMessages.ts # DB 行与 UI 互转
│       │   ├── aiAssistantHistoryFormat.ts # 历史快照格式
│       │   └── aiAssistantExport.ts     # 对话导出
│       ├── directives/
│       │   └── aiStickScroll.ts  # 助手折叠区粘底
│       ├── services/
│       │   ├── appDialog.ts            # 应用内对话框队列
│       │   ├── appToast.ts             # Toast 服务
│       │   ├── fileListService.ts      # 目录与文件列表合并
│       │   ├── fileOpenService.ts      # 打开前校验与恢复行号
│       │   ├── physicalLineStream.ts   # 流式按行切分
│       │   ├── shortcutRegistry.ts     # 快捷键动作注册表
│       │   ├── shortcutUtils.ts        # 快捷键规范化与冲突
│       │   └── shortcutService.ts      # 窗口级快捷键监听
│       ├── stores/
│       │   ├── cacheStore.ts           # localStorage 设置解析
│       │   ├── fileMetaStore.ts        # 单文件 meta
│       │   └── recentHistoryStore.ts   # 最近打开 MRU
│       ├── utils/
│       │   ├── color.ts                  # 颜色换算
│       │   ├── format.ts                 # 字数与大小格式化
│       │   ├── fontFamilyCss.ts          # `font-family` 片段
│       │   ├── presetFontDefinitions.ts  # 预设字体映射
│       │   ├── dragDropFsPaths.ts        # 拖放路径解析
│       │   ├── fileListPanelDisplay.ts   # 文件行展示逻辑
│       │   ├── modalStack.ts             # 弹窗层叠与 ESC
│       │   ├── defaultCacheDirs.ts       # 默认缓存目录解析
│       │   ├── fullscreenHeaderFloat.ts  # 全屏顶栏浮层命中
│       │   ├── fullscreenSidebarFloat.ts # 全屏侧栏浮层命中
│       │   ├── aiBookHash.ts             # 书籍哈希（渲染侧）
│       │   ├── aiChunkBook.ts            # 按 token 切块
│       │   ├── currentChapterPlainText.ts   # 按章索引从阅读器切片（与侧栏字数一致）
│       │   ├── readerSurroundingPlainText.ts # 视口附近节选
│       │   ├── aiMarkdownMarkedSetup.ts  # marked + KaTeX 配置
│       │   ├── aiMarkdownMarkedPrep.ts   # Markdown 预处理
│       │   ├── aiMarkdownChapterRef.ts    # 章节引用 token 链接化
│       │   ├── aiToolFoldBody.ts         # 工具折叠区 DOM 辅助
│       │   ├── characterCardSpring.ts    # 角色卡倾斜弹簧参数（跟手 / 回正）
│       │   ├── appShellMenuPosition.ts   # 侧栏浮动子菜单定位（含卡片效果 flyout）
│       │   └── defaultCacheDirs.ts       # 默认 AI 数据/模型/立绘缓存目录（与 preload 对齐）
└── shared/
    ├── packageDerived.ts           # 从 package 派生的共享元数据
    ├── ebookExtensions.ts          # 电子书扩展名常量
    ├── ebookConvertPaths.ts        # 默认转换输出子目录名
    ├── aiTypes.ts                  # AI 共享类型与默认配置（含 `embedding.provider`、`aiDataCacheDir`）
    ├── aiDataPaths.ts              # 默认 `userData/ai/data`、`userData/ai/model-cache` 路径拼接
    ├── builtinEmbeddingModels.ts   # 内置嵌入模型目录（BGE / E5）、HF 镜像默认值
    ├── builtinEmbeddingIpc.ts      # 内置嵌入 IPC 载荷（模型 id + 配置快照）
    ├── apiEndpointPresets.ts       # 对话服务商预设与官方 OpenAI 兼容 Base URL
    ├── aiTokenUsage.ts             # usage 解析、缓存命中、花费估算与展示文案
    ├── aiTxt2ImgIpc.ts             # 文生图 IPC 载荷类型
    ├── txt2ImgBackend.ts           # 文生图 backend、prompt 族、尺寸解析
    ├── txt2ImgCloudSizePresets.ts  # 云端固定尺寸档与默认对齐（512×768 参考）
    ├── txt2ImgCloudModelPresets.ts # 各云端模型建议列表与万相 API 版本判定
    ├── txt2ImgOpenAiQuality.ts     # OpenAI 图像画质选项
    ├── aiSkills.ts                 # 技能元数据与合并工具
    ├── aiAgentSkillToolNames.ts    # Agent 技能名常量
    ├── aiChapterRefPrompt.ts       # 章节引用提示词约定
    ├── characterTypes.ts           # 角色侧栏类型
    ├── characterPortraitPaths.ts   # 立绘路径与文件名约定
    ├── chapterMatchBuiltinPatterns.ts # 内置章节正则
    ├── colorTxtOpenSaveDialog.ts   # 打开/保存对话框类型
    └── colorTxtShowMessageBox.ts   # MessageBox 类型
```

#### `src/` 目录树各文件补充说明

下文对应「`src/` 总览」目录树中各 `#` 注释的展开；与后文 **`src/main/`**、**`ipcHandlers`**、**`preload`** 等专节交叉时，以专节中的流程与边界说明为准。**AI、向量、文生图、角色侧栏** 等模块的宏观说明、Vue 组件表与 `userData` 路径另见 **「AI 阅读助手与相关能力」**。

##### `src/main/`（与专节交叉索引）

**`index.ts`**、**`ipcHandlers.ts`**、**`detectTextEncoding.ts`**、**`globalShortcuts.ts`**、**`launchTxtHandlers.ts`**、**`windowFactory.ts`**、**`windowBounds.ts`**、**`updater.ts`**、**`updaterMessages.ts`**：生命周期、IPC 清单、流式读与 Monaco 写入、单实例与窗口行为等，见下文 **`src/main/`** 各小节。

##### `src/main/`（其余模块）

- **`registerAiIpc.ts`**：AI / RAG / Agent / 文生图 / 角色立绘 / 导出等 `ai:*` IPC 集中注册（依赖 `aiVectorDb` / `aiChat` / `aiAgentChat` 等）。
- **`colortxtLocalProtocol.ts`**：`colortxt-local://resource/{uuid}` 短 URL 本地协议；磁盘路径注册后供 `<img>` / 阅读器插图安全访问。
- **`detectTextEncoding.ts`**：文本文件编码探测，供 `ipcHandlers` 的 `file:stream` 与 `file:readWholeTextFile` 共用；详见下文 **`detectTextEncoding.ts`** 专节。
- **`dialogInvoke.ts`**：`dialog:showOpenDialog` / `showSaveDialog` 参数解析（与 `@shared/colorTxtOpenSaveDialog` 对齐）。
- **`messageBoxInvoke.ts`**：`dialog:showMessageBox` 参数解析（与 `@shared/colorTxtShowMessageBox` 对齐）。
- **`aiPaths.ts`**：**`resolveAiDataCacheRoot`** / **`aiConfigFilePath`** / **`vectorDbFilePath`**（随 **`AIConfig.aiDataCacheDir`**）；**`resolveBuiltinModelCacheRoot`**、**`transformersCacheDirForModelRoot`**（内置模型 HF 缓存）。
- **`aiDataFs.ts`**：**`upgradeLegacyAiDataLayoutIfNeeded`**（旧版 `userData/ai/config.json` + `vector.sqlite*` → **`userData/ai/data/`**）；**`migrateAiDataCacheRoot`** / **`migrateBuiltinModelCacheRoot`**；**`data-cache-root.json`** 引导文件。
- **`aiConfig.ts`**：在数据缓存根下读写 **`config.json`** 与默认值合并；合并 **`aiDataCacheDir`**、**`embedding.provider`** / **`builtinModel`** 等；API 密钥经 **`secretStorage`** 与磁盘配置分离。
- **`aiVectorDb.ts`**：SQLite + sqlite-vec：分块、向量、`threads` / `messages` 表及迁移；库文件路径由 **`aiPaths.vectorDbFilePath`** 决定。
- **`aiEmbedding.ts`**：`provider === "builtin"` 时走 **`embedding/localEmbeddingBackend`**（Transformers.js Worker）；否则 OpenAI 兼容 **`/embeddings`**；**`probeEmbeddingDimension`** 支持远程与内置。
- **`embedding/localEmbeddingBackend.ts`**、**`embedding/embeddingWorker.ts`**：内置模型下载、加载、批嵌入与进度；缓存目录 **`{builtinModelCacheDir}/transformers-cache`**。
- **`aiChat.ts`**：OpenAI 兼容流式对话（非 Agent 直聊路径）。
- **`aiAgentChat.ts`**：带工具调用的 Agent 对话循环；向渲染进程推送 `ai:agent:event`（含 `reasoning_delta`、`token_usage_estimate` / `token_usage_final`、`tool_progress` 等）；`ragContext` 优先经 **`aiChapterPlainTextBridge`** 向阅读器取章文，超长章由 **`aiRagChapterDigest`** 分段压缩；多轮与压缩调用的 usage 汇总后写入助手消息 `payload`；开启「深度思考」时经 **`aiChatThinking.resolveAgentDeepThinkingParams`** 注入各厂商思考开关。用户消息为「生成章节匹配规则」类且已启用对应技能时，**`@shared/chapterMatchAgentTurn`** 判定为专轮：**系统提示禁止 `ragContext`**、工具列表移除 `ragContext`，可直接按用户标题样例输出 fenced 单行（可选 `ragSearch` 抽标题行）。
- **`aiChatThinking.ts`**：按对话 **`baseUrl`** 识别服务商并设置深度思考请求体（如 DeepSeek / 智谱 `thinking`、通义 / Moonshot `enable_thinking`、本机 `think`、OpenRouter `reasoning.effort`、Gemini 兼容 `reasoning_effort`）；**`extractReasoningFromStreamDelta`** 统一解析 `reasoning_content` / `reasoning` / `thinking` / `thought`；工具轮历史是否回传 **`reasoning_content`** 由 **`shouldAttachReasoningContentOnToolCalls`** 判定。
- **`aiChapterPlainTextBridge.ts`**：主进程 `fetchChapterPlainTextFromRenderer`：经 `ai:chapter-plain-request` / 一次性 `replyChannel` 向渲染层索取与阅读器一致的章节纯文本（超时 20s）。
- **`aiRagChapterDigest.ts`**：`RAG_CHAPTER_NO_COMPRESS_CHARS`（1 万）内不压缩；超长章按每 1 万字段压缩，合并后 `mergedMarkdown` 上限约 1 万；`chapterDigestProgressUi` 供工具折叠区展示「读取章节原文（M/N）」进度。
- **`aiAgentTools.ts`**：Agent 可调工具实现（检索章节、向量检索等，与 `@shared/aiAgentSkillToolNames` 等配合）。
- **`aiCharacterPortrait.ts`**：角色检索抽取、全书风格推断、中英 SD 提示词、文生图落盘编排；检索与画风推断等 LLM 调用的 usage 汇总为 **`tokenUsage`** / **`tokenUsageAvailable`** 供侧栏展示。
- **`aiTxt2Img.ts`**：与 A1111 / Comfy / 云端图像 API 交互（采样器列表、实际出图等）。
- **`aiTxt2ImgTestConnection.ts`**：按 **`backend`** 轻量探测连通性（如 OpenAI `/models`、万相 models、Stability 账户等），**不**调用出图接口。
- **`aiBookHash.ts`**：主进程侧书籍内容哈希（与渲染进程 `utils/aiBookHash.ts` 算法一致）。
- **`characterPortraitFs.ts`**：立绘缓存根目录迁移、图片复制到目标绝对路径。
- **`resolveSqliteVecPath.ts`**：按平台解析 `sqlite-vec` 原生扩展路径供 `better-sqlite3` 加载。

##### `src/preload/index.ts`

预加载通过 `contextBridge` 向渲染进程暴露受控 API 的完整清单与语义，见下文 **`src/preload/index.ts`（预加载）**。

##### `src/renderer/src/`

###### `App.vue`

根组件：负责**布局与全局状态串联**；书钉/书签、全屏阅读区布局、阅读进度等拆到各 composables。

- **阅读器入参**：向 `ReaderMain` 传入阅读偏好与当前主题的 **`highlightColorsLight` / `highlightColorsDark`**（合并默认后）、**`monacoCustomHighlight`**、**`txtrDelimitedMatchCrossLine`**（与内容上色配合的成对符号跨行匹配）、以及当前文件的 **`highlightWordsByIndex`**。
- **快捷键与配色**：维护 `shortcutBindings` 并传给 `AppHeader`；**`openColorScheme`** 打开配色弹窗。
- **侧栏文件列表**：**分类筛选**、**排序模式**、**分类目录**（`fileCategory` / `fileSort` / `fileCategoryCatalog`）与 `FileListPanel`、`useAppPersistence` 联动。
- **AI 与立绘**：**AI 技能**（`aiSkillsEnabled` / `aiSkillOverrides` / `aiCustomSkills`）、侧栏 **「深度思考」** / **「防剧透」**（`aiAssistantDeepThinking` / `aiAssistantSpoilerSafe`，经 `ReaderSidebar` 绑定 `AiAssistantPanel` 与角色检索抽屉）、**角色立绘缓存目录**（`characterPortraitCacheDir`）等与设置/迁移联动；**`useAiChapterPlainTextBridge`**（`App.vue` 注册）响应主进程 `ragContext` 的章节原文索取。
- **设置弹窗**：由 **`SettingsPanel.vue`** 组织 **`SettingsTabBar`** 与子面板 **`SettingsGeneralPanel`** / **`SettingsReadingPanel`** / **`SettingsEditPanel`** / **`SettingsAIPanel`** / **`SettingsVectorModelPanel`** / **`SettingsTxt2ImgPanel`**（页签文案「角色卡」，文生图与角色卡出图配置）/ **`SettingsSkillsPanel`**；技能编辑用 **`SettingsSkillEditModal.vue`**（见下文组件表）。
- **全屏与浮层**：全屏时 **`fullscreenFileListPopoversOpen` / `fullscreenAiAssistantPopoversOpen`** 交给 `useAppReaderChrome`，避免 Teleport 浮层打开时误收起全屏侧栏。
- **根级挂载**：`AppOverlays`、`AppDialogHost`、`AppToastHost` 等。

###### 其它入口与样式

- **`appShell.css`**：根组件专用样式（由 `App.vue` 以 scoped 方式引入）：全屏顶/底/侧栏布局、正文区等。
- **`injectionKeys.ts`**：`provide` / `inject` 用的 `InjectionKey`（如书签备注输入框 `ref`，供 `useAppBookmarkPins` 与 `AppOverlays` 对齐）。
- **`chapter.ts`**：章节标题检测、章节匹配规则（正则）的存取与校验；**`physicalOffsetToDisplayOffset` / `physicalRangeToDisplayColumns`**（行首全角缩进下的物理列→Monaco 展示列，供侧栏搜索跳转）；内置三条 pattern 与 `@shared/chapterMatchBuiltinPatterns` 同源。
- **`icons.ts`**：各功能图标的 SVG 字符串汇总，供组件内联使用。

###### `composables/`

- **`useAppBookmarkPins.ts`**：书钉与书签：列表项、视口内活动书签、添加/移除/跳转及书签弹窗交互；**`readerEditMode`** 下书签跳转与视口判定按物理行 = Monaco 行（不经滤空映射）。**章节名**（侧栏列表与添加/编辑弹窗预览）用当前 **`chapters`** 与 **`reader/chapterIndex`** 的 `pickActiveChapterIdx` 推断；**持久化行号**、**锚点行**、**弹窗预览**、**右键菜单 Teleport** 等见下文 **「书签（行号语义、侧栏与弹窗）」**。
- **`useAppChapterListSync.ts`**：侧栏章节/文件列表「滚到当前」的一拍状态（与 VirtualList 配合）。
- **`useAppChapterNavigation.ts`**：章节跳转、章节规则与最近文件、侧栏标签等联动；只读展示正文变更后由 **`buildChaptersFromReaderDisplayText`**（`reader/readerDisplayPipeline.ts`）重算章节；应用章节规则后重载当前文件时以视口末行恢复阅读位置（与 `useAppReaderUiPrefs` 切换排版一致）。
- **`useAppFileSession.ts`**：打开文件/选目录、会话快照恢复、与流管道和持久化衔接；`resetSession` 置 `readingProgressSynced` 为 `false`；导入目录合并列表时若当前分类筛选为具体分类名，会把新项写上对应 `category`（「全部 / 未分类」筛选下不写）。
- **`useAppFullscreenReaderLayout.ts`**：全屏时正文区域宽度样式；layout 上点击左右空白聚焦编辑器；两侧空白区 `wheel` 转交 `ReaderMain.delegateEditorWheelFromBrowserEvent`（见下文「全屏正文宽度与两侧空白滚轮」）；事件来自侧栏子树时不劫持（含 Shadow DOM 向上判定）。
- **`useAppPersistence.ts`**：界面设置、会话快照、最近打开列表、文件元数据（书签等）的加载与保存；`persistFileMeta` 受 `readingProgressSynced` 门控；`persistWindowUnloadState` 在「清除缓存」后的刷新流程中可被 `skipUnloadPersistenceSessionKey` 跳过（见「清除缓存（设置面板）」）。
- **`useAppReaderChrome.ts`**：全屏阅读时顶栏/底栏/侧栏悬停显隐与侧栏宽度拖拽。
    - `fullscreenSidebarPopoversSuppressCollapse`：文件列表 / AI 助手 Teleport 菜单打开时抑制侧栏误收起。
    - 内部用 `utils/fullscreenHeaderFloat` / `fullscreenSidebarFloat` 判断指针是否在全屏顶栏或侧栏浮层子树内。
- **`useAppReaderUiPrefs.ts`**：字号/行高/字体、高级换行与内容着色等阅读偏好与 Monaco、持久化同步。
    - **只读**下切换压缩空行/行首缩进：不再整文件 `openFilePath` 重载，而是 **`stream.applyReaderDisplayFromPhysicalLines`** 基于内存中的物理行重算展示正文并恢复视口（`syncChaptersAfterViewportSettled`）；失败则回滚开关。
    - 字号增大时按字号上限夹行高倍数。
- **`useAppReadingProgress.ts`**：阅读进度展示模型：以视觉滚动进度为主（到底=100%），并输出 `(当前行/总行)` 文案；供底栏/侧栏/最近打开统一使用。底栏**总字数**来自 **`totalCharCount`**（展示正文 `text.length`；编辑态由 **`resyncMirrorFromReader`** 与 Monaco 同步）。
- **`useAppSyncCurrentFileWatch.ts`**：「同步当前文件」开关：监听当前文件外部变更并触发自动重载。**`readerEditMode`** 为 true 时不注册监听；用户在编辑态保存也不会触发自动重载（避免覆盖未同步到只读管线的 Monaco 缓冲区）。
- **`useAppShellThemeWatch.ts`**：主题切换：根节点 class、编辑器主题、原生主题 IPC。
- **`useAppWindowBindings.ts`**：窗口挂载/卸载、可配置快捷键（`shortcutBindings`）、拖放与主进程 IPC 等绑定。
    - **拖放**：命中带 `data-drop-zone="file-list"` 的节点时向侧栏列表**追加**文件；落在其它区域时对拖入路径取「最外层首个」支持的文件并**打开**（与 `utils/dragDropFsPaths.ts` 配合）。
    - **全屏边缘**：`document` 上 `mousemove` 驱动全屏边缘唤起（具体逻辑在 `useAppReaderChrome`）。
    - **流与进度**：订阅 `file:stream-*`，在流结束并完成滚动/恢复阅读位置后置 `readingProgressSynced`。
    - **卸载落盘**：`pagehide` / `beforeunload` 时落盘会话与设置（与「清除缓存」防回写配合）。
- **`useReaderSidebarLists.ts`**：侧栏文件/章节/书签虚拟列表、过滤与滚动同步；文件列表按 **`fileCategory`** 筛选、按 **`fileSort`** 排序，与项上 `category` / `addedAt` 等字段合并展示。章节列表视口联动滚动受 **`suppressChapterListAutoScroll`** 抑制（进/出编辑、切换压缩空行等）；须在 **`syncChaptersAfterViewportSettled`** 的 `finally` 或流错误路径中恢复，否则换章不再居中当前章。
- **`useReaderInlineSearch.ts`**：阅读区内联搜索：关键词匹配、结果列表、当前命中定位与导航。
- **`useConnectionTest.ts`**：设置页 **测试连接** 按钮状态（`idle` / `pending` / `ok` / `fail`）；配置指纹变更后重置；供 **`AppConnectionTestButton.vue`** 使用。
- **`useFileListCategorySort.ts`**：文件列表：分类下拉（`AppCustomSelect`）的固定项/滚动项/计数与触发器文案；`FileSortMode` 与 `constants/fileCategories` 对齐。
- **`useFileListSelection.ts`**：文件列表「编辑模式」：多选路径、`Ctrl+A` / 反选、与列表焦点区配合；选中集随列表变化裁剪。
- **`useFileListMenus.ts`**：文件列表右键菜单、编辑模式菜单、**分类浮层**（`CategoryPickerMenu`）坐标与 `setFilesCategory` 派发。
- **`useTxtStreamPipeline.ts`**：大文件流式解析与只读展示。
    - 流式阶段**仅累积物理行**；字数/总行在格式化完成后写入 ref；展示格式化集中在 **`reader/readerDisplayPipeline.ts`** 的 **`formatPhysicalLinesForReader`** / **`applyReaderDisplayFromPhysicalLines`**。
    - 物理行/显示行映射、**`physicalSearchRangeToDisplayColumns`**（侧栏搜索命中 → Monaco 列，只读且开行首缩进时计入全角缩进）；**`readerEditMode`** 为 true 时不做缩进列偏移。
    - 插图锚点删行后同步收缩映射表。
    - 编辑态 **`resyncMirrorFromReader`** 将 Monaco 全文同步为 `physicalLineContents`（供搜索与底栏统计）。
- **`useAiChapterPlainTextBridge.ts`**：订阅 `window.colorTxt.onChapterPlainRequest`，调用 **`getChapterPlainTextByIndex`**（`currentChapterPlainText.ts`）后 `replyChapterPlainText`。
- **`useAiFoldContentSelectAll.ts`**：AI 阅读助手：工具调用 / 思考等折叠区正文的「全选」与键盘选择（与 `AiAssistantDetailsFold` 等配合）。
- **`useCharacterCardTilt.ts`**：角色卡 **3D 倾斜** 与光泽联动（思路参考 [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css)）。**`rotateX` / `rotateY`** 为唯一驱动；每帧由旋转反推 **`--char-pointer-*`**、**`--char-background-*`**、**`--char-card-opacity`** 等 CSS 变量。指针跟手用 **`CARD_SPRING_FOLLOW_ROTATE`**，移出卡片用 **`CARD_SPRING_SNAP_ROTATE`** 回正（带轻微过冲）。**`textureEffect === 'off'`** 或放大过渡未完成时禁用倾斜。
- **`useCharacterCardPopoverZoom.ts`**：角标「查看大图」：**原位**将同一张卡 **`Teleport` 到 `body`**，**`cardShell`（translater）** 负责 `translate3d` + `scale`，**`card__tilt`（rotator）** 负责 **`--char-popover-rotate-y`**（打开 360°→0°，关闭 0°→360° 后 instant 归 0°）。列表格内留 **`cardShellPlaceholder`** 占位；其它卡半透明且 **`pointer-events: none`**。放大激活约 100ms 后 **`tilt.resetIdle()`** 收掉悬停倾斜（对齐参考实现的 `interactEnd`）。

###### `constants/`

- **`appUi.ts`**：UI 常量：存储 key、侧栏宽度、字号/行高上下限与步进、`default*` 出厂默认等（无本地设置或与 `persistKey` 字段缺失时；见下文「阅读器字号与行高」「界面与阅读偏好默认值」）；re-export `readerPalette` 的 `applyReaderSurfaceToDocument` 等。
- **`readerPalette.ts`**：阅读器表面色（背景、章节标题、Monaco txtr token）默认值与合并逻辑；用户覆盖存 `colorTxt.ui.settings` 的 `readerPaletteOverridesLight` / `readerPaletteOverridesDark`；`useAppShellThemeWatch` 写入 `html` 的 `--reader-bg`、`--reader-chapter-title`。
- **`highlightColors.ts`**：自定义高亮色：默认亮/暗两套 `#RRGGBB` 数组、`MIN_HIGHLIGHT_COLORS`（至少 3 色）、`parseHighlightColorsArray` / `mergeHighlightColors` 等与设置持久化配合。
- **`fileCategories.ts`**：侧栏文件分类：`FileCategoryDefinition`、`FileSortMode`、筛选常量（`__all__` / `__uncategorized__`）、默认分类色表、`parseFileCategoryCatalog` 等。
- **`readerSidebarTab.ts`**：侧栏活动栏 tab id：`files` / `chapters` / `bookmarks` / `highlights` / `aiAssistant` / `character` / `search`。

###### `monaco/`

- **`chapterStickyScroll.ts`**：注册折叠区与文档符号以驱动黏性章节大纲；禁用黏性条点击跳转。
- **`readerEditorOptions.ts`**：阅读器 `create` / `updateOptions` 的选项构建（换行、只读/编辑 chrome、小地图、行号、stickyScroll 等）；垂直滚动条：**窗口只读 / 任意编辑** 为 `visible`（常显），**全屏只读** 为 `auto`（失焦淡出）。
- **`readerInlineDecorations.ts`**：章节标题行内装饰；Monaco 主题 chrome（小地图/滚动条/选区/当前行）；**`buildChapterMinimapSectionHeaderDecorations`**（编辑态小地图节标题）；合并 `readerPalette` 与 **`highlightColors`** 生成 Monarch token 规则；自定义高亮词开启时并入 `txtrHighlightMonarch` 生成的规则。
- **`readerMainMonaco.css`**（由 `ReaderMain` 引入）：小地图左侧阴影、滚动条轨道与滑块、概览尺层级（光标标记不被轨道遮挡）；全屏时小地图/滚动条/概览尺 `position: fixed` 贴视口右缘（见 **`appShell.css`**）。
- **`readerImageViewZones.ts`**：插图行 `<<IMG:…>>` 的 ViewZone 与内嵌展示；返回删行前行号供流管道同步映射；与 `colortxt://` 本地资源协议衔接。
- **`readerKeyScroll.ts`**：方向键/Page 键滚动。
- **`txtrHighlightMonarch.ts`**：由 `highlightWordsByIndex` 生成 `txtr.customHighlight.{index}` 类 Monarch 规则（更长词优先、同长则更小颜色索引优先；大小写不敏感）。
- **`txtrTextMonarch.ts`**：自定义 Monarch：`txtr-text` 语言；标点/对话/数字等着色；可选注入上述自定义高亮规则。

###### `reader/`

- **`chapterIndex.ts`**：当前视口行号对应的章节下标（二分查找）；侧栏书签项上的章节名亦用同一函数按书签行号推断。
- **`lineMapping.ts`**：物理行号与「滤空后显示行」的映射工具。
- **`ebookAnchorLookup.ts`**：电子书内链与压缩空行下的显示行 ↔ 物理行映射。
- **`readerEbookPointer.ts`**：阅读区内电子书内链指针/点击命中辅助。
- **`readerHighlightGeometry.ts`**：自定义高亮词浮动层（`ReaderHighlightFloat`）的几何与布局计算。

###### `ebook/`

- **目录**：电子书 → ColorTxt：解析为 UTF-8 正文与可选插图资源（与 `shared/ebookExtensions.ts` 扩展名一致）；格式细节与缓存策略见下文 **「电子书解析与转换」**。
- **`convertEbookToColorTxt.ts`**：按扩展名调度各解析器；`ensureEbookColorTxt`：严格 meta 缓存、`findReconciledConvertedTxt` 和解查找、写出 `{basename}.txt`。
- **`ebookFormat.ts`**：是否电子书路径、与 TXT 合并的「支持书籍路径」、输出基名与文件名净化等。
- **`ebookTypes.ts`**：转换产物类型（如 `ColorTxtArtifacts`：正文 + 可选 `imageWrites`）。
- **`pathUtils.ts`**：路径拼接与规范化（POSIX 风格片段，供转换与资源相对路径）。
- **`yieldToUi.ts`**：长解析中分段 `await`，避免主线程长时间阻塞。
- **`ebookInternalLinkMarkers.ts`**：正文内链标记 `<<ID:…>>` / `<<A:…|…>>` 及转义（阅读器内跳转）。
- **`parseEpub.ts`**：EPUB（ZIP）解析与转换；可尝试将 ZIP 当 EPUB 处理。
- **`parseMobi.ts`**：MOBI / AZW3：经 `mobi/foliateMobi` 抽取再转 artifacts。
- **`parsePdf.ts`**：PDF：`pdfjs-dist` 文本层抽取。
- **`parseFb2.ts`**：FB2 / FBZ（ZIP 包 FB2）解析与转换。
- **`parseChm.ts`**：CHM：目录与 HTML 遍历、插图写出；依赖 `chm/` 解压与读取。
- **`chm/chmArchive.ts`**：CHM 文件表、块定位与原始块读取。
- **`chm/lzxDecode.ts`**：LZX 流解压（CHM 存储块）。
- **`mobi/foliateMobi.js`**：Foliate MOBI 引擎（打包进渲染层）。
- **`mobi/foliateMobi.d.ts`**：上述脚本的 TypeScript 声明。

###### `ai/`

- **`buildBookVectorIndex.ts`**：按章节切块，经 preload 调用嵌入与向量索引相关 IPC 建库（与主进程 `registerAiIpc` / `aiVectorDb` 等配合）。
- **`embeddingReady.ts`**：**`getBuiltinEmbeddingBlockMessage`**：内置来源未下载时阻止建索引并提示去设置页下载。

###### `aiAssistant/`

- **`aiAssistantTypes.ts`**：UI 消息 / 工具条 / 思考块、`tokenEstimate` / `tokenUsage` 信息条等类型。
- **`aiAssistantSegments.ts`**：助手消息分段与工具引用交错。
- **`aiAssistantPlainText.ts`**：从 UI 模型提取可复制纯文本。
- **`aiAssistantDbMessages.ts`**：SQLite 消息行与 UI 结构互转；助手 `payload` 可含 `reasoning`、`tokenUsage`、`tokenUsageAvailable`；历史加载时在助手气泡后插入 **`tokenUsage` 角色消息**（由 **`AiTokenUsageBanner`** 渲染，受全局 **`showTokenUsage`** 控制）。
- **`aiAssistantHistoryFormat.ts`**：历史快照格式相关。
- **`aiAssistantExport.ts`**：对话导出（文件保存走主进程 `ai:export:save`）。

###### `directives/`

- **`aiStickScroll.ts`**：折叠区粘性滚底等（供 AI 助手详情折叠组件使用）。

###### `services/`

- **`appDialog.ts`**：队列式应用内对话框：`appAlert` / `appConfirm` / `appPrompt`（`appDialogModel` 队列）；由 `AppDialogHost.vue` 渲染。
- **`appToast.ts`**：顶部非阻塞 Toast（`appToast` / `dismissAppToast` / `clearAllAppToasts`）；由 `AppToastHost.vue` 渲染。
- **`fileListService.ts`**：目录选择、txt 列表合并与规范化；`TxtFileItem` 含可选 **`category`**、**`addedAt`**（「添加时间」排序）；分类重命名/删除时同步列表项。
- **`fileOpenService.ts`**：打开文件前的校验与恢复行号解析。
- **`physicalLineStream.ts`**：按换行切分流式块，处理跨 chunk 的不完整行。
- **`shortcutRegistry.ts`**：快捷键动作 ID、默认 Electron 快捷键、窗口/全局作用域。
- **`shortcutUtils.ts`**：快捷键规范化、物理键位解析（`code` 优先）、展示文案、冲突检测。
- **`shortcutService.ts`**：窗口级快捷键监听：按持久化绑定匹配并派发动作。

###### `stores/`

- **`cacheStore.ts`**：localStorage：`PersistedSettingsData` / 会话快照等解析与校验（含 **`fileCategory` / `fileSort` / `fileCategoryCatalog`**）。
- **`fileMetaStore.ts`**：单文件元数据：书签、末行/进度等；与 `colorTxt.file.meta` 同步。
- **`recentHistoryStore.ts`**：最近打开文件列表的持久化与更新。

###### `utils/`

- **`color.ts`**：十六进制与 RGB/HSV 互转、`normalizeLooseHex6` 等；供 `HexColorPickerField` 取色。
- **`format.ts`**：字数、文件大小等展示用格式化。
- **`fontFamilyCss.ts`**：字体族名转 CSS `font-family` 片段（引号与栈拼接，供字体选择等复用）。
- **`presetFontDefinitions.ts`**：预设字体：各平台族名栈、菜单标签、与持久化字体的预设匹配（见「预设字体与平台映射」）。
- **`dragDropFsPaths.ts`**：从拖放 `DataTransfer` 解析文件系统路径（供窗口级 drop 分流）。
- **`fileListPanelDisplay.ts`**：侧栏文件行左边框色、是否在「全部」筛选下显示分类色条等展示逻辑。
- **`modalStack.ts`**：弹窗层叠与 ESC 关闭顺序。
- **`defaultCacheDirs.ts`**：与 preload 对齐的默认路径：`resolveDefaultEbookConvertOutputDirSync`、`resolveDefaultCharacterPortraitCacheDirSync`（`userData` + `@shared` 子目录名）。
- **`fullscreenHeaderFloat.ts`**：指针是否落在全屏顶栏相关浮层子树（与 `constants/appUi` 中 `FULLSCREEN_HEADER_FLOAT_SELECTOR` 配合）。
- **`fullscreenSidebarFloat.ts`**：侧栏 Teleport 浮层命中检测（与 `FULLSCREEN_SIDEBAR_FLOAT_SELECTOR` 等配合）。
- **`aiBookHash.ts`**：书籍内容哈希（与主进程 `aiBookHash.ts` 算法一致，用于向量库 `book_hash`）。
- **`aiChunkBook.ts`**：纯文本按 token 目标切块（与 `AIConfig` 中 chunk 字段语义对齐）。
- **`currentChapterPlainText.ts`**：按 `chapterIndex` 从阅读器展示层切片（标题行至下一章前，与侧栏章字数一致；`HARD_CAP` 512_000），供 **`useAiChapterPlainTextBridge`** 与 `bookMeta` 装配。
- **`readerSurroundingPlainText.ts`**：视口附近节选（注入 `AIAgentBookMeta.surroundingText`）。
- **`aiMarkdownMarkedSetup.ts`**：`marked.use(marked-katex-extension)`：统一导出配置好的 `marked`（助手 Markdown 入口）。
- **`aiMarkdownMarkedPrep.ts`**：助手消息正文预处理再交给 marked。
- **`aiMarkdownChapterRef.ts`**：助手回复中章节引用类 token 的解析 / 链接化（与 `@shared/aiChapterRefPrompt` 约定配合）。
- **`aiToolFoldBody.ts`**：工具折叠区正文 HTML 辅助；将进度文案中的 **`当前进度：M/N`** 包为 `.aiDigestProgressFrac`（warning 加粗）。

##### `src/shared/`

- **`packageDerived.ts`**：从 package 信息派生的共享元数据（主/渲染共用）。
- **`ebookExtensions.ts`**：电子书扩展名常量与壳层打开路径判定。
- **`ebookConvertPaths.ts`**：默认转换输出子目录名 `ConvertedTxt`（`userData/ConvertedTxt`，与 preload 拼接一致）。
- **`aiTypes.ts`**：AI 共享类型与 **`defaultAIConfig`**（含 **`showTokenUsage`**、**`chat.tokenPricePerMillion`**、默认对话 Base URL 等）。
  - `AIConfig`、对话/嵌入端点；**文生图**（`AITxt2ImgConfig`，A1111 / ComfyUI）；Agent 载荷；角色画风/抽取结果等。
  - `defaultAIConfig` 与配置迁移常量。
- **`aiTxt2ImgIpc.ts`**：渲染进程调用 `ai:txt2img` 时的请求草稿与返回结果类型（含 **`testConnection`**，不出图）。
- **`txt2ImgBackend.ts`**：**`getTxt2ImgPromptFamily`**（`sd` / `natural`）、**`resolveTxt2ImgSize`**、各后端默认云端模型等。
- **`txt2ImgCloudSizePresets.ts`**：云端固定尺寸列表；切换服务商时 **`applyTxt2ImgSizeForBackendSwitch`**（参考 **512×768**，在比例足够接近的档位中选像素最少，利于立绘省额度）。
- **`txt2ImgCloudModelPresets.ts`**：各 **`backend`** 的模型 ID 建议（新→旧）；万相 2.5+ / 2.6+ 高分辨率与协议分支判定。
- **`txt2ImgOpenAiQuality.ts`**：OpenAI Images 画质枚举与设置页中文标签。
- **`aiSkills.ts`**：内置技能元数据、用户覆盖结构、自定义技能 `AiCustomSkill` 及合并/规范化工具。
- **`aiAgentSkillToolNames.ts`**：Agent 可调技能名常量（与主进程 `aiAgentTools` 等对齐）。
- **`aiChapterRefPrompt.ts`**：助手回复中章节引用类 token 的提示词约定（与 `aiMarkdownChapterRef.ts` 配合）。
- **`apiEndpointPresets.ts`**：对话 **`CHAT_API_PROVIDER_PRESETS`**（服务商名 + 官方 Base URL 两行下拉；含 OpenRouter、Gemini OpenAI 兼容、**「自定义 OpenAI 兼容服务」** 等）；**`findChatProviderPresetByBaseUrl`** 与接口地址联动（手改地址可反推服务商，清空后保持「自定义」）。文生图 **`TXT2IMG_BACKEND_PRESETS`**（服务商名 + 默认 Base URL 两行下拉；与 **`AITxt2ImgConfig.backend`** 一致）；选中服务商写入默认地址与默认云端模型，**不**按地址反推服务商。语音朗读 / 万相文案统一为 **「阿里云通义（DashScope）」**（**`DASHSCOPE_PLATFORM_LABEL`** 等）。
- **`builtinEmbeddingModels.ts`**：内置模型清单（默认 **`bge-small-zh-v1.5`** 512 维、**`multilingual-e5-small`** 384 维）；**`DEFAULT_HF_REMOTE_HOST`**（默认 **`https://hf-mirror.com`**，可清空改用官方 Hugging Face）。
- **`builtinEmbeddingIpc.ts`**：向主进程传递当前 **`builtinModel`** 与配置快照（下载/加载/清缓存 IPC）。
- **`aiDataPaths.ts`**：与主进程 **`aiPaths`** 一致的默认子目录名（`ai/data`、`ai/model-cache`），供渲染层 placeholder。
- **`aiTokenUsage.ts`**：`extractUsageFromChatJson`、`addTokenUsage`；**`readPromptCacheHitTokens`**（`prompt_cache_hit_tokens`、`prompt_tokens_details.cached_tokens`、`cache_read_input_tokens` 等）；**`computeTokenUsageCost`** / **`formatTokenUsageCost`**（去尾零）；`estimateAgentTurnTokens`；`formatTokenUsageEstimateLine` / **`formatTokenUsageActualLine`**（可追加「总花费约」）。
- **`characterTypes.ts`**：侧栏「角色」：`CharacterRosterEntry`、`CharacterBookStylePersisted`、`CharacterGender`（按书存 `file.meta`）。
- **`characterPortraitPaths.ts`**：立绘缓存根默认子目录名 `CharacterPortrait`、按书名净化目录段、立绘/草稿/临时 PNG 文件名与绝对路径拼接。
- **`characterCardTextureEffects.ts`**：角色卡 **闪卡纹理** 效果 id、菜单文案（`CHARACTER_CARD_TEXTURE_EFFECTS`）、**`DEFAULT_CHARACTER_CARD_TEXTURE_EFFECT`**（默认 **`soft` / 细腻光泽**）、**`normalizeCharacterCardTextureEffect`**（无效或已移除 id 回退默认）。可选 **`dividerBefore`** 控制子菜单项上方分隔线。
- **`chapterMatchBuiltinPatterns.ts`**：章节匹配三条内置正则（与 `renderer/chapter.ts` 同源）。
- **`chapterMatchAgentTurn.ts`**：判定 Agent 本轮是否以「生成/调整章节匹配规则」为主（配合 `chapter-match-rules` 技能）。
- **`colorTxtOpenSaveDialog.ts`**：打开/保存对话框选项类型（主进程 `dialogInvoke` 与 preload 对齐）。
- **`colorTxtShowMessageBox.ts`**：`showMessageBox` 选项类型（主进程 `messageBoxInvoke` 与 preload 对齐）。

#### `src/main/`（主进程）

**`index.ts`**

- 组装主进程能力：`createMainWindowFactory`（窗口创建）、`registerMainIpcHandlers`（业务 IPC）、`setupLaunchTxtHandlers`（启动 txt / 单实例）。
- `app.whenReady()` 后调用 `setupAutoUpdater()`，并根据启动参数 / macOS `open-file` 队列决定首个窗口是否直接打开某个 `.txt`；并调用 `registerGlobalShortcuts()`（见 `globalShortcuts.ts`）。
- `will-quit` 时调用 `unregisterGlobalShortcuts()`，避免进程退出后仍占用系统快捷键表。
- `activate` / `window-all-closed` 等生命周期钩子（非 macOS 全关窗口退出）。

**`globalShortcuts.ts`**

- 集中注册 / 注销主进程 `globalShortcut`；后续新增系统级快捷键时在本文件扩展 `registerGlobalShortcuts` / `unregisterGlobalShortcuts` 即可。
- **阅读器显隐**：默认 accelerator 为 **Control** + **\`（反引号键）**（`DEFAULT_TOGGLE_VISIBILITY_ACCELERATOR`；macOS 亦为 **Control** 而非 Cmd）在系统范围内触发；用户可在快捷键面板中修改，由 `setToggleVisibilityShortcut` 更新 `currentToggleVisibilityAccelerator` 并重新注册。
- **录制快捷键时临时注销**：`suspendGlobalShortcutsForRecording` / `resumeGlobalShortcutsAfterRecording` 在打开编辑弹层时注销当前全局热键、关闭后 `registerGlobalShortcuts()` 恢复，避免「录制组合键」与「已注册的全局热键」冲突。
- **校验与设置**：`validateGlobalShortcut` 用临时注册探测是否可用；`setToggleVisibilityShortcut` 失败时回滚到旧 accelerator。
- **单一状态位**：主进程用 `allWindowsStealthHidden` 维护两种模式：
  - **全部显示**（概念上）：含正常窗口与最小化窗口（任务栏仍能点到）；
  - **全部隐身**：所有窗口 `setSkipTaskbar(true)` + `hide()`，任务栏/Dock 上不可见。
- **作用范围**：每次切换都对 `BrowserWindow.getAllWindows()` 中每个未销毁窗口执行同一模式；进入隐身前把各窗口 `isMinimized()` 记入 `minimizeSnapshotByWindowId`，退出隐身时先 `show()` 再按需 `minimize()`，以恢复最小化形态。
- **macOS 程序坞**：与状态位一致。
  - 调用 `app.dock.hide()` / `app.dock.show()`（配合 `isVisible()` 避免重复调用）。
  - 退出隐身时先同步 Dock 再 `show()` 各窗口。
  - `will-quit` 时 `unregisterGlobalShortcuts()` 会在可见性需要时调用 `dock.show()`，避免退出后仍保持隐藏态。
  - **Cmd+Q 后图标仍在程序坞**：多数属于 **系统行为而非 Bug**：
    - (1) 曾在程序坞图标上右键勾选过「选项 → 保留在程序坞中」，退出后仍会保留为可点击启动的图标；
    - (2) 系统设置里若开启「在程序坞中显示最近使用的应用程序」，刚退出的应用会出现在该区域。应用**无权**替用户改写程序坞固定项或系统 Dock 偏好，需用户在程序坞中右键「选项 → 从程序坞中移除」，或在 **系统设置 → 桌面与程序坞** 中关闭上述「最近使用」相关选项（具体文案随 macOS 版本略有差异）。
- 与渲染进程 `services/shortcutService.ts` 中的键盘监听不同：后者仅在窗口聚焦且在前台时生效；本模块为 **Electron 主进程全局快捷键**，即使用户正在其他应用中也触发（若未被系统或其它应用抢占注册）。

**`detectTextEncoding.ts`**

- **职责**：根据文件头字节推断供 **`iconv-lite`** 解码的编码名；**`file:stream`** 与 **`file:readWholeTextFile`** 均经 **`detectTextFileEncoding(path, app.getLocale())`** 调用（实现于 `ipcHandlers.ts` 的 `detectEncoding`）。
- **采样**：最多读取文件头 **64 KiB**（小文件则仅为实际字节数）；**不是**采样上限过小，而是短文本本身可供统计的字节过少时 `jschardet` 易误判。
- **判定顺序**（`detectEncodingFromSample`）：
  1. **BOM**：UTF-8 / UTF-16 LE / UTF-16 BE；
  2. **纯 ASCII** → `utf8`；
  3. **严格 UTF-8**（`TextDecoder` fatal）→ `utf8`；
  4. **`jschardet.detect`**，并结合置信度与字节结构做修正（见下）；
  5. 高置信度（≥ **0.7**）时采用 chardet 结果（经 `normalizeEncodingName`，如 `gbk` / `gb2312` → `gb18030`）；
  6. 仍无法确定且字节像 GBK 族 → `gb18030`；否则回退 `utf8`。
- **中文 ANSI（记事本）启发式**（`shouldPreferGbkFamily`）：当样本 **< 512 字节**、chardet **置信度 < 0.7**、被判为 ISO-8859-* / Windows-125* 等西欧编码，或 **`app.getLocale()`** 为 `zh-*` 且置信度 < 0.9 时，若非合法 UTF-8 且非 ASCII 段均可解析为 **GBK/GB18030 双字节序列**，则优先 **`gb18030`**（覆盖「仅几字中文 + 英文」的短文件被误判为 `ISO-8859-2` 等情况）。
- **局限**：未识别 Windows「ANSI」标签本身；繁体 Big5（CP950）等与 GBK 字节形态相近时可能仍需用户通过底栏 **「保存为 GB2312」** 等方式显式转码；非中文环境的其它本地代码页亦不在此模块特判。

**`ipcHandlers.ts`**

- **集中注册的 IPC（`ipcMain`）**：`dialog:showOpenDialog` / `showSaveDialog` / **`showMessageBox`**（选项解析见 `dialogInvoke` / `messageBoxInvoke`）；`dir:listTxtFiles`（含扫描进度事件）、`file:stat`、`file:watchCurrent`、`fonts:listSystemFonts`、`shell:*`、`fs:*`、`colortxtLocal:registerPath`、`path:toFileUrl`、`file:stream` 等。
- **历史清理**：独立的 **`dialog:confirmClear*`** 等确认 IPC 已不在此注册（`registerMainIpcHandlers` 内仅 **`removeHandler`** 清理旧名，防热重载重复注册）；渲染侧改用 **`showMessageBox`** 或应用内 **`appDialog`** 队列。
- **快捷键**：`shortcut:getGlobalToggle`、`shortcut:validateGlobalToggle`、`shortcut:setGlobalToggle`、`shortcut:suspendForRecording`、`shortcut:resumeAfterRecording`（实现见 `globalShortcuts.ts`）。
- **流式读文件（主进程）**：`file:stream` 使用 `createReadStream` + `iconv-lite` 解码，经 `file:stream-*` 向渲染进程推送数据块；编码由 **`detectTextEncoding.ts`** 探测（见上专节）。
- **整文件读写（阅读器编辑）**：**`file:readWholeTextFile`**（一次性读入、**同一套**编码探测后解码为字符串）、**`file:writeTextFile`**（按指定编码整文件写出），与流式读盘并存；见 **「阅读器编辑模式」**。
- **流式读文件（并发与序号）**：每次新流递增 `requestId` 并 `destroy` 上一轮同窗口读流；发送 chunk 前校验序号，避免旧流残留。渲染进程在 `resetSession` 时清空 `activeStreamRequestId` / `activeStreamFilePath`，并在 `onStreamChunk` / `onStreamEnd` / `onStreamError` 中比对 `requestId`，避免快速重复打开同一文件时旧 chunk 混入已重置的解析管道。
- **渲染进程与 Monaco 写入**：主进程仍分块推送；渲染侧 `useTxtStreamPipeline` 对每个 chunk 只累积**物理行**；`onStreamEnd` 后 `flushCarry`，再 **`formatPhysicalLinesForReader`** → **`setFullText`**、更新 **`totalCharCount`**、**`setChapters`**（见 **「只读展示管线」**）。加载中不累加总字数、不匹配章节；底栏进度由各 chunk 的 `readBytes` / `totalBytes` 驱动。
- 目录递归收集 `.txt`：迭代遍历 + `realpath` 去重，避免符号链接成环导致栈溢出。
- 窗口相关：`window:new`、`window:setTitle`、`window:setFullscreen`、`theme:set`（同步原生主题并广播 `theme:sync`）、**`window:getInitialLoadIntent`**（同步，供首屏侧栏 tab）、**`window:shouldRestoreSession`**、**`window:consumePendingOpenTxtPath`** 等。

**`launchTxtHandlers.ts`**

- `app.requestSingleInstanceLock()`：第二实例会把待打开的 `.txt` 路径转发给已运行实例，并聚焦窗口。
- 解析启动参数中的 `.txt` 路径；macOS 额外处理 `open-file` 事件（启动阶段先入队，就绪后再打开）。

**`windowFactory.ts`**

- 创建 `BrowserWindow`：加载开发环境 `ELECTRON_RENDERER_URL` 或打包后的 `renderer/index.html`。
- 处理 `ready-to-show`、全屏切换事件广播、开发环境 DevTools 快捷键拦截等。
- 维护每窗口 **`shouldRestoreSession`**、**`pendingOpenTxt`** 等状态（`getInitialWindowLoadIntent` / 首屏侧栏 tab，见 **「启动与会话：侧栏初始标签」**），并在窗口关闭时清理。
- 窗口 `resize` / `move` / `close` 时触发边界保存（debounce + close 兜底），具体读写逻辑见 `windowBounds.ts`。

**`windowBounds.ts`**

- 将窗口位置与大小持久化到 `app.getPath("userData")/window-bounds.json`，启动时读取并校验是否仍在屏幕工作区内。

**`updater.ts`**

- `registerUpdaterIpc()`：注册 `app:isPackaged` 与 `updater:*` 等 IPC（开发环境未打包会跳过实际更新流程）。
- `setupAutoUpdater()`：打包环境下配置 `electron-updater` 行为，并向所有窗口广播更新生命周期事件。

**`updaterMessages.ts`**

- 将 `electron-updater` 的 `ERR_UPDATER_*` 及常见 Node 网络错误码映射为中文提示，供主进程在检查更新、下载与 `error` 事件中统一使用。

#### `src/preload/index.ts`（预加载）

- 使用 `contextBridge` 暴露 `window.colorTxt`，封装 `invoke` / `send` / `on`，避免渲染进程直接使用 Node API。
- **文件与流**：文件对话框与目录扫描（含扫描进度订阅）、`file:stat`、流式读文件事件（`file:stream-*`；载荷可含 **`sessionFilePath`** 表示逻辑书路径如电子书原路径）、**`readWholeTextFile` / `writeTextFile`**（阅读器编辑模式整盘读存，见 **「阅读器编辑模式」**）、`watchCurrentFile` / `onCurrentFileDiskChanged`（当前阅读文件磁盘变更）、外链与系统字体列表等。
- **`getUserDataPath`**（`sendSync`）、**`getDefaultEbookConvertOutputDir`**、**`getDefaultCharacterPortraitCacheDir`**（与 `@shared/ebookConvertPaths`、`@shared/characterPortraitPaths` 子目录名一致）。
- **`pathToReadableLocalUrl`**：调用 `colortxtLocal:registerPath`，返回 **`colortxt-local://resource/{uuid}`** 短 URL，供 `<img>` / 灯箱避免整段 `file://` 过长。
- 破坏性操作确认：部分使用应用内 **`appConfirm` / `appAlert`**（`services/appDialog.ts` → **`AppDialogHost`**）；**清除缓存**、**保存时向量维度变更警告**等使用原生 **`window.colorTxt.showMessageBox`**。
- 文件系统操作：`renamePath`（文件重命名）、`removePath` / `emptyDir` / `mkdir` 等。
- 窗口与系统集成：`openNewWindow`、`toggleDevTools`、`quitApp`、`setWindowTitle`、`setFullscreen`，以及全屏/主题相关事件（如 `onFullscreenChanged`、`onThemeSync`）。
- 会话与启动打开：`shouldRestoreSession`、`consumePendingOpenTxtPath`，**`getInitialWindowLoadIntent`**（同步 `window:getInitialLoadIntent`，首屏侧栏 tab，见 **「启动与会话：侧栏初始标签」**），以及 `onOpenTxtFromShell`（命令行/系统关联打开 txt 的路径回调）。
- **应用更新**：`checkForUpdates` / `downloadUpdate` / `quitAndInstall` 及 `onUpdater*` 事件订阅（含 `onUpdaterDownloadProgress`；打包环境下生效）。
- 拖放文件真实路径（`getPathForFile`）。
- **全局快捷键（显隐）**：`getGlobalShortcut`、`validateGlobalShortcut`、`setGlobalShortcut`、`suspendGlobalShortcutsForRecording`、`resumeGlobalShortcutsAfterRecording`（对应主进程 `shortcut:*` IPC）。
- **AI 章节原文（`ragContext`）**：**`onChapterPlainRequest`** / **`replyChapterPlainText`**（`ai:chapter-plain-request` 与一次性 reply 通道）；**`window.colorTxt.ai.onAgentEvent`** 订阅 `ai:agent:event`（`reasoning_delta`、`content_delta`、`tool_*`、`token_usage_estimate`、`token_usage_final`、`round_end`、`done`、`error` 等，类型见 `@shared/aiTypes`）。

#### `src/renderer/src/components/`（主要 Vue 组件）

表格单元格内换行使用 HTML `<br>`（下列较长说明已插入换行以便阅读）。

| 文件                                                 | 主要功能                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppHeader.vue`                                      | 顶栏：打开文件、书钉/书签、字体与字号行高、压缩空行/行首缩进（只读）、**高级换行策略**、内容上色、**高亮笔**、章节规则、主题、侧栏与全屏、查找与更多菜单等；**阅读器编辑**开关、编辑态**保存**与**格式化**（压缩空行/行首缩进）。<br>从 `App.vue` 接收当前 **`shortcutBindings`** 并传给 `MoreMenu`；**`@open-color-scheme`** 可从高亮菜单进入配色弹窗                                                                                                                                                                                                                                                 |
| `AppOverlays.vue`                                    | 蒙层弹窗：关于、快捷键、设置、配色、章节规则、**添加/编辑书签**（备注框上方章节名 + 正文预览；编辑时 footer 左 **「更新为当前行」**）与更新流等                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `AppContextMenu.vue`                                 | 上下文菜单：**`placement`** **`point`**（书签等，`x`/`y` 为视口内左上角，经夹取）或 **`aboveFooterMouseX`**（底栏路径/编码菜单：整块在底栏上方、横向以打开时指针 `clientX` 居中后再夹到窗口内，见 **「底栏」**）；支持 **`disabled`** 项、`excludeCloseWithin`（避免重复点触发控件时误判为外侧关闭）                                                                                                                                                                                                                                                                                                                                                                                    |
| `AppFooter.vue`                                      | 底栏：路径、加载/阅读进度、字数、大小、编码；**路径与编码**为链式按钮 + 向上弹出菜单，详见 **「底栏」**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `ReaderMain.vue`                                     | 阅读区：挂载编辑器与业务逻辑。<br>引入 **`readerMainMonaco.css`** 覆盖 Monaco 阅读区样式；编辑器静态选项集中在 `monaco/readerEditorOptions.ts`。<br>章节行内装饰与 **`highlightColors` / `highlightWordsByIndex`** 驱动的 Monarch 与装饰同步；选区添加自定义高亮词、色块选择器（按当前主题高亮色列表）；`monacoCustomHighlight` 开关。<br>**`ReaderHighlightFloat`** / **`ReaderImageLightbox`**；查找展开时可联动书钉；高亮词列表点击可进入查找；滚动与 probe。<br>全屏两侧空白滚轮经父组件调用 **`delegateEditorWheelFromBrowserEvent`**。<br>流式结束经 **`formatPhysicalLinesForReader`** 后 **`setFullText`**（见 **「只读展示管线」**）。**阅读器编辑**：整盘读写、**`applyEditFormat*`**、**`readerEditShowLineNumbers`** / **`readerEditMinimap`**、**`readerEditContentChange`**、**`captureViewportRestoreAnchor`**，见 **「阅读器编辑模式」**。<br>**书签**：**`getBookmarkSaveAnchorDisplayLine`**（与保存锚点、列表跳转一致的「视口上沿 + 一行字高」逻辑行）、**`jumpToBookmarkLine`**（`revealLineNearTop` 后再 `scrollTop -= lineHeight` 为黏性章节条留白）、**`getViewportTopLine`** 等 |
| `ReaderSidebar.vue`                                  | 侧栏容器：活动栏含文件 / 章节 / 书签 / 高亮词 / **AI 助手** / **角色** / 搜索（`constants/readerSidebarTab.ts`）。<br>挂载 `FileListPanel`、`ChapterListPanel`、`BookmarkListPanel`、`HighlightListPanel`、**`AiAssistantPanel`**、**`CharacterSidebarPanel`**、`SearchPanel`。<br>向文件列表下发 **`fileCategory` / `fileSort` / `fileCategoryCatalog`** 并上抛分类相关事件；与 `useReaderSidebarLists`、`useReaderInlineSearch` 等配合；**阅读器编辑**时章节区可提供刷新章节等入口                                                                                                                                                                                                |
| `FileListPanel.vue`                                  | 侧栏「文件」：txt/电子书路径列表、**分类筛选**与 **排序**、编辑模式多选、右键与批量改分类。<br>单项右键支持分类/移除/重命名/在新窗口打开/在文件管理器显示（Ctrl+右键附加「清除该文件数据」）；筛选在具体分类时 footer 动作为「清空分类」。<br>`data-drop-zone="file-list"` 标记列表拖放接收区                                                                                                                                                                                                                                                                                                                                           |
| `ChapterListPanel.vue`                               | 侧栏「章节」：章节列表、字数开关、跳转当前章                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `BookmarkListPanel.vue`                              | 侧栏「书签」：列表、跳转、编辑与清除；项内 **备注 / 章节名 / 正文预览**（章节由 `pickActiveChapterIdx` 推断；无备注但有章节名时不显示「无备注」占位；正文预览与弹窗同源逻辑）；**右键菜单** `Teleport` 到 **`document.body`** 并带 **`data-fullscreen-sidebar-float`**，避免被侧栏 `overflow` 裁切                                                                                                                                                                                                                                                                                                                                                                       |
| `HighlightListPanel.vue`                             | 侧栏「高亮词」：展示当前文件高亮词，支持删除与点击定位（通过内联搜索流转）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `SearchPanel.vue`                                    | 侧栏「搜索」：当前文件内搜索、结果列表与命中跳转。<br>**一行内多次匹配各占一条结果**（与 VS Code 一致）；预览仅高亮该条对应的区间。<br>跳转列号经 **`physicalSearchRangeToDisplayColumns`**（只读+行首缩进）或编辑态 1:1 物理列；详见 **「侧栏全文搜索」**                                                                                                                                                                                                                                                                                                                                                           |
| `FileCategoryFlyoutList.vue`                         | 文件列表分类子菜单：统一渲染右键分类 flyout 与批量分类入口的选项（含计数）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `FontPicker.vue`                                     | 预设字体（跨平台映射，逻辑见 `presetFontDefinitions.ts`）与系统字体列表                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `ChapterRulePanel.vue` / `ChapterRuleEditDialog.vue` | 章节匹配规则列表与编辑                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ColorSchemeTabBar.vue`                              | 配色弹窗内页签：**阅读器** / **高亮色**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `ColorSchemeReaderPanel.vue`                         | 「阅读器」页：表面色字段网格 + 实时预览（与 `ColorSchemePanel` 草稿联动）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ColorSchemeHighlightPanel.vue`                      | 「高亮色」页：按槽位编辑 `#RRGGBB`（`HexColorPickerField`）、增删行（不少于 `MIN_HIGHLIGHT_COLORS`）、表格内预览条                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `ColorSchemePanel.vue`                               | 配色弹窗容器：`ColorSchemeTabBar` + 上述两面板。<br>确定时分别 `applyReaderPalettes` 与 **`applyHighlightColors`**（亮/暗各一套数组）写回 `App.vue` 并经 `useAppPersistence` 落盘；打开时从 props 同步草稿                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `HexColorPickerField.vue`                            | 单行十六进制颜色 + HSV 取色浮层（智能上下翻转、视口贴边）；`draftHex` / `draftEnd` 事件供父组件在弹层打开期间做临时预览                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `MoreMenu.vue`                                       | 更多菜单：最近文件、查找、快捷键、设置、**配色**（动作 `openColorScheme`，默认 **F6**）、检查更新、关于、退出等。<br>菜单项右侧快捷键文案来自 **`shortcutBindings`**，经 `shortcutUtils.acceleratorToDisplayText` 与快捷键面板及 `shortcutService` 实际生效绑定同步                                                                                                                                                                                                                                                                                                                                                                 |
| `SettingsPanel.vue`                                  | 设置弹窗壳层：**`SettingsTabBar`** + 条件渲染子面板。<br>footer **「重置当前页」** 按当前 tab 将草稿恢复为应用内默认值（AI 页含 **`aiDataCacheDir`** 默认路径；向量页含内置/远程默认等，见 `resetAiDraft` / `resetVectorModelDraft`）。<br>**「确定」** 时：向量维度变更提示；**`aiDataCacheDir`** / **`builtinModelCacheDir`** 变更时确认并调用 **`ai:migrateDataCacheRoot`** / **`ai:migrateBuiltinModelCacheRoot`** 再 **`configSet`**。<br>**「清除缓存」** 见下文「清除缓存」                                                               |
| `SettingsTabBar.vue`                                 | 设置顶栏页签切换；导出 **`SettingsTabId`**（`general` / `reading` / `ai` / `vectorModel` / `txt2img` / `skills`）。<br>`showAiExtensionTabs` 为 false 时隐藏向量模型 / 角色卡 / 技能三个扩展页签                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `SettingsGeneralPanel.vue`                           | 「常规」：启动恢复上次文件、同步当前文件、历史条数、电子书转换缓存目录、章节最少字数、**清除缓存**按钮（向父组件 `clearCache`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `SettingsReadingPanel.vue`                           | 「阅读」：字号/行高滑块、压缩空行保留一行、引号/括号跨行匹配、Monaco 平滑滚动、全屏正文区宽度。<br>（`monacoCustomHighlight` 来自 props，用于禁用跨行开关提示）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `SettingsEditPanel.vue`                              | 「编辑」：**显示行号**（`readerEditShowLineNumbers`）、**启用小地图**（`readerEditMinimap`）、**自动刷新章节列表**（`editAutoRefreshChapterList`；少于 `editAutoRefreshChapterListMaxLines` 行时编辑变更防抖刷新章节，否则侧栏显示「刷新章节」）                                                                                                                                                                                                                                                                                                                                                                                      |
| `SettingsAIPanel.vue`                                | 「AI 阅读助手」：总开关；**服务商** + **接口地址**；API Key + **`AppConnectionTestButton`**；模型 / 温度等；Token 开关与单价；**`aiDataCacheDir`**；**`AppPullFlashButton`** 拉取聊天模型；快捷提问列表等 |
| `ApiEndpointInput.vue`                               | 设置页接口地址输入（可选建议列表；对话页建议列表常为空，以服务商下拉为主）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `AiTokenUsageBanner.vue`                             | 阅读助手 / 角色检索共用的 Token 实际消耗条（`formatTokenUsageActualLine`、可选花费）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `AiIndexProgressBanner.vue`                          | 建索引 / 向量化进度文案（阅读助手建索引与角色 **AI 检索** 前补索引共用）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `SettingsVectorModelPanel.vue`                       | 「向量模型」：**模型来源**（内置 / 远程）。<br>**内置**：缓存目录、HF 镜像、模型下拉、下载/清除。<br>**远程**：服务商 + 地址 + Key + **`AppConnectionTestButton`** + **嵌入模型**（**`ApiEndpointInput`** + 拉取）；切块与 **`ragTopK`** |
| `SettingsTxt2ImgPanel.vue`                           | 「角色卡」：**服务商**（两行下拉 + 默认地址/模型）+ **接口地址**；云端：**API 密钥**（**`AppConnectionTestButton`** 测试连接，不出图）+ **模型**（**`ApiEndpointInput`** 建议，可手输）+ **固定尺寸**下拉（本地仍为宽高）；OpenAI 系 **画质**下拉；A1111 采样 / 高清修复、Comfy 工作流；**`AppPullFlashButton`** 拉取采样器 / SD 模型。<br>**角色立绘缓存根目录** |
| `AppConnectionTestButton.vue`                        | 设置页共用 **测试连接**（图标 pending/成功/失败；成功不弹框；配置指纹变更后重置）；用于 AI 阅读助手、向量模型、角色卡文生图 |
| `SettingsSkillsPanel.vue`                            | 「技能」：内置技能开关与覆盖、自定义技能列表；由父级 footer「添加技能」打开 **`SettingsSkillEditModal`**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `SettingsSkillEditModal.vue`                         | 自定义技能新建/编辑弹窗                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `AppPullFlashButton.vue`                             | 短时按压态按钮：设置面板内从兼容服务端刷新模型/采样器列表等，完成态闪光反馈                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `NumericInput.vue`                                   | 通用数字输入：可选 `min` / `max`、整数模式                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `RangeSlider.vue`                                    | 通用范围滑块（最小/最大值与步进）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `SwitchToggle.vue`                                   | 通用开关控件                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ShortcutPanel.vue`                                  | 快捷键列表与编辑：表格展示、点击录制、Enter 确认、冲突提示、全局热键校验。<br>录制区为不可编辑聚焦区 + 闪烁光标，避免 IME 上屏                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `AboutPanel.vue`                                     | 关于面板                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `AppModal.vue`                                       | 通用模态框（与 `modalStack` 配合）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `AppUpdateFlow.vue`                                  | 自更新：检查/下载/安装进度、相关弹窗与 `electron-updater` 事件订阅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `IconButton.vue`                                     | 图标按钮                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `VirtualList.vue`                                    | 虚拟列表（长列表性能）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `AppCustomSelect.vue`                                | 通用自定义下拉（文件列表左侧 **分类筛选** 触发器、「全部 / 未分类 / 各分类 / 分类管理」与分类色块标记等）。<br>（用于侧栏文件列表分类入口）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `CategoryPickerMenu.vue`                             | 浮动菜单：编辑模式下为已选文件批量指定分类；单项与 `FileListPanel` 内分类操作共用选项与计数                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `FileCategoryManageModal.vue`                        | **分类管理**弹窗：增删改分类名称与颜色；重命名/删除时通过 `fileListService` 回写列表项 `category` 字段                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `PathPickerInput.vue`                                | 设置等场景下的目录绝对路径输入与主进程文件夹选择器（电子书转换输出目录、**角色立绘缓存根目录**等）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `AppDialogHost.vue`                                  | 挂载于 `App.vue`：渲染 `services/appDialog.ts` 队列（`appAlert` / `appConfirm` / `appPrompt`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `AppToastHost.vue`                                   | 挂载于 `App.vue`：渲染 `services/appToast.ts` 的顶部 Toast 列表                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `AiAssistantPanel.vue`                               | 侧栏 AI 阅读助手主面板：会话、输入、`onAgentEvent`、token 预估/实际条插入（受 **`showTokenUsage`** 控制）；**`findLiveAgentAssistant`**；**`AiTokenUsageBanner`**                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `AiAssistantChatMessages.vue`                        | 助手对话消息列表：气泡、工具折叠、思考块（流式未封存显示「正在思考…」）；关闭 Token 开关时不插入消耗条                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `AiAssistantDetailsFold.vue`                         | 助手详情区折叠容器（与 `directives/aiStickScroll`、**`useAiFoldContentSelectAll`** 配合）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `AiToolFoldBody.vue`                                 | 工具折叠正文；章文压缩进度 **`当前进度：M/N`** 样式（`utils/aiToolFoldBody.ts`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `AiMarkdown.vue`                                     | 助手回复 Markdown 渲染入口（内部用 `aiMarkdownMarkedSetup` / `aiMarkdownMarkedPrep`、章节引用 `aiMarkdownChapterRef`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `CharacterSidebarPanel.vue`                          | 侧栏「角色」：角色卡网格、**AI 检索** 抽屉、**角色立绘生成** 弹窗（预览 **2:3**、表单与底对齐操作钮）。<br>立绘弹窗：**画风 / 角色形象**；**SD 系**显示 **负面描述**（云端不显示）；关闭（应用/取消/×）时写入草稿与 **`file.meta`**（`characterBookStyle` + 当前角色 `promptZh`/`negativeZh`）。<br>监听 **`aiConfigSyncNonce`**，设置保存后同步文生图服务商 UI；实际出图仍由主进程 **`configGet`** 读最新配置。<br>检索区 **`AiIndexProgressBanner`**、**`AiTokenUsageBanner`** |
| `CharacterRosterCard.vue`                            | 单个角色条目卡片（**2:3**）：正反面 3D 翻转、立绘与竖排/背面信息；**`charHoloCard`** + **`data-char-texture`** 驱动闪卡层（**`card__shine` / `card__glare`**）。<br>**`useCharacterCardTilt`** + **`useCharacterCardPopoverZoom`**；列表倾斜幅度约 **40%**，放大后 **100%**。<br>背面长文滚动在顶/底边界 **`preventDefault`** 避免带动外层列表；**`:hover` 时 `z-index` 抬高** 避免倾斜遮挡相邻卡 |
| `ReaderHighlightFloat.vue`                           | 自定义高亮词旁的浮动操作条（依赖 `readerHighlightGeometry.ts` 与 `ReaderMain` 编辑器坐标）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `ReaderImageLightbox.vue`                            | 阅读区内插图的灯箱放大（`ReaderMain` 绑定 `imageLightboxSrc`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

与 **AI 阅读助手 / 向量模型 / 角色卡 / 技能 / 角色侧栏** 强相关的组件说明已集中到 **「AI 阅读助手与相关能力」** →「主要 Vue 组件（AI / 角色与相关设置）」；上表仍保留原行以便与「开发」章目录树对照检索。

## 侧栏文件列表：分类、排序与拖放

- **分类目录与筛选**：用户维护 **`fileCategoryCatalog`**（分类名与颜色表）、当前筛选 **`fileCategory`**（`__all__` / `__uncategorized__` / 具体分类名）、排序 **`fileSort`**（`FileSortMode`：文件名/路径/大小/阅读进度/最近阅读/添加时间等升序或降序）。
- **持久化**：上述与其它界面偏好一并写入 **`colorTxt.ui.settings`**（见 `cacheStore.PersistedSettingsData` 与 `useAppPersistence`）。
- **列表项字段**：`colorTxt.file.list` 中每条 `TxtFileItem` 除 `path` / `name` / `size` 外，可有 **`category`**（所属分类名）与 **`addedAt`**（加入列表时间，毫秒；旧数据由 `migrateTxtFileListAddedAt` 回填），用于展示与「添加时间」排序；分类与书籍元数据 **`colorTxt.file.meta`** 无关。
- **列表 UI**：`FileListPanel.vue` 使用 `useFileListCategorySort` 生成分类下拉项与计数、`useFileListSelection` 管编辑模式多选、`useFileListMenus` 管右键与分类浮层；`ReaderSidebar` 将事件上抛至 `App.vue` 的 `onSetFilesCategory` / `onApplyCategoryCatalog` 修改 `txtFiles` 与 catalog 并持久化。
- **编辑模式落盘时机**：`fileListEditing` 为 true 时，分类变更与目录编辑先写内存；退出编辑模式（`true -> false`）后统一 `persistFileListCache()`，减少编辑中频繁写入。
- **清空行为**：筛选为 `__all__` 时走 `confirmClearFileList`，筛选为具体分类时走 `confirmClearFileListCategory`，按钮文案与行为对应为「清空 / 清空分类」。
- **拖放**：见上文 **`useAppWindowBindings.ts`**：列表区域追加、其它区域打开首个支持文件。

## 电子书解析与转换（`src/renderer/src/ebook`）

渲染进程在**打开电子书**时将其转为 UTF-8 的 ColorTxt 正文（`.txt`），可选写出插图目录；转换与缓存逻辑集中在 `ebook/`，与 `shared/ebookExtensions.ts` 中的扩展名列表、`shared/ebookConvertPaths.ts` 中的默认输出子目录名保持一致（主进程目录扫描、壳层打开路径判定依赖前者）。

### 支持的格式与入口

| 扩展名            | 说明                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `.epub`           | ZIP 容器，走 `parseEpub.ts`                                                                                        |
| `.mobi` / `.azw3` | 先尝试 `tryConvertZipAsEpub`（部分 AZW3 实为 ePub 封装）；否则经 `mobi/foliateMobi` 抽取后由 `parseMobi.ts` 转产物 |
| `.fb2` / `.fbz`   | FB2 或 ZIP 内单 FB2，`parseFb2.ts`                                                                                 |
| `.pdf`            | `pdfjs-dist` 文本层，`parsePdf.ts`                                                                                 |
| `.chm`            | `parseChm.ts`；底层块读取与 LZX 在 `chm/chmArchive.ts`、`chm/lzxDecode.ts`                                         |

`ebookFormat.ts` 提供 `isEbookFilePath`、`isMarkdownFilePath`、`isSupportedBookPath`（TXT、`.md` + 上述电子书扩展名）、输出用基名 `ebookSourceFileBaseForOutput`（含 Windows 非法字符净化 `sanitizeWindowsFilenameSegment`）。拖放 / 关联打开时 `useAppWindowBindings` 用 `isSupportedBookPath` 过滤；主进程 `ipcHandlers` 的目录枚举用 `EBOOK_DOT_EXTENSIONS` 与 `.txt`、`.md` 一并收集。

### Markdown（`.md`）

- **打开**：`resolvePhysicalTextForOpen` 对非电子书路径直接流式读盘（与 `.txt` 相同），`physicalReaderPath` 指向 `.md` 原文件。
- **章节**：仅识别 ATX 标题（`#` … `######`，行首最多 3 个空白）；`markdownBlockContext` 在围栏代码块与 4 空格/TAB 缩进代码块内跳过 `#`；章节扫描基于**物理行**，避免「行首缩进」展示层误判；侧栏 `headingLevel` 每级缩进 10px；顶栏「章节匹配规则」对 `.md` 禁用。
- **插图（只读）**：`markdownImages` 将 `![alt](url)` 展开为独占行 `<<IMG:payload>>`，再复用 `readerImageViewZones`；`https:` URL 直链，`img-src` CSP 含 `https:`；编辑模式不展开，保存仍写回 `.md` 原文。

- 基于 [libmspack](https://github.com/kyz/libmspack)（GNU GPL）移植了一套 JavaScript 实现，以支持对 `.chm` 格式的解析
- 其他电子书格式的解析，主要参考 [foliate-js](https://github.com/johnfactotum/foliate-js)（MIT）

### 转换管线与输出布局

- **调度**：`convertEbookToColorTxt.ts` 中 `convertBookBufferToArtifacts(absSource, buffer)` 按源路径后缀分派各 `parse*.ts`，得到 `ColorTxtArtifacts`（`ebookTypes.ts`：`utf8` + 可选 `imageWrites`，每项含相对路径与 `ArrayBuffer`）。
- **写出**：`writeEbookConversionArtifacts` 将正文写入目标 `.txt`，插图按 `relativePath` 写到与 `{basename}.txt` **同目录**下；约定目录名为 **`{basename}.Images/`**（由 `imagesDirAbsBesideConvertedTxt` 与相对路径前缀一致）。无插图时会 `removePath` 清理残留插图目录。
- **正文后处理**：非空行且非独占行的 `<<IMG:…>>` 会在行首加两个全角空格（与阅读器「行首缩进」视觉一致）；空行与插图锚行不改动（见 `indentConvertedTxtPlainLines`）。
- **让出 UI**：`yieldToUi.ts` 用 `setTimeout(0)` 在长时间解析前后打断，便于底栏「转换中…」等状态刷新；`readBookAsArrayBuffer` 与 `ensureEbookColorTxt` 内多处调用。

### 输出路径与缓存

- **目标 `.txt` 路径（写入与严格缓存的参照）**：
    - `resolveConvertedTxtOutputPaths`：基名为源文件名整段（经 `ebookSourceFileBaseForOutput` 净化，如 `abc.epub` → `abc.epub.txt`）。
    - `ebookConvertOutputDir`（`colorTxt.ui.settings`）**非空**时输出到该目录；**空字符串**表示与**源书同目录**。
    - 新安装或尚无该键时，默认 **`app.getPath("userData")/ConvertedTxt`**（目录名见 `shared/ebookConvertPaths.ts`，preload `getDefaultEbookConvertOutputDir`）。
- **严格缓存命中**：`ensureEbookColorTxt` 在同时满足下列条件下直接复用、不再解析：`file.meta` 中 **`convertedTxtPath` 与当前策略算出的目标路径一致**（与 `resolveConvertedTxtOutputPaths` 逐路径规范化比较）、**`sourceMtimeMsAtConvert` 与当前源 `mtimeMs` 一致**，且对该路径 `stat` 仍为普通文件。
- **和解查找（路径无效统一处理）**：
    - **何时视为「路径无效」**：meta 中无 `convertedTxtPath`（空或未写入），或「有路径但严格缓存未通过」——共用同一套和解逻辑。
    - **何时执行和解**：仅当 **无记录路径**，或 **记录的源 mtime 与当前源 `mtimeMs` 一致（`mtimeStable`）** 时才和解，避免源书已更新仍复用旧的 `{basename}.txt`。
    - **实现**：**`findReconciledConvertedTxt`** 对候选路径规范化去重后依次 `stat`，**第一个存在的普通文件**即复用结果。
    - **候选顺序**：若 `mtimeStable` 且 meta 曾有非空路径，**优先该路径**（例如输出目录变更后旧文件仍留在原记录路径）；然后 **当前设置的输出目录**（非空时）下的 `{basename}.txt`；**源书同目录**下的 `{basename}.txt`；**默认 `userData/ConvertedTxt`** 下同名文件。
    - **无命中**：完整转换 `readBookAsArrayBuffer` → `convertBookBufferToArtifacts` → `writeEbookConversionArtifacts`（写出路径为当前策略下的 `convertedTxtPath`）。
- **meta 写回与打开路径**：
    - `useAppFileSession.resolvePhysicalTextForOpen` 在 `ensureEbookColorTxt` 后调用 `setEbookConvertedMeta`，写入 `convertedTxtPath` 与 `sourceMtimeMsAtConvert`，并 `persistFileMeta`。
    - 流式管道使用的 `physicalPath` 为转换后的 `.txt`；**逻辑上书路径**仍为源电子书路径；`currentFile`、会话、最近打开以**源书路径**为键。

### 内链标记与阅读器衔接

解析器可在正文中嵌入：

- **`<<ID:…>>`**：锚点。
- **`<<A:可见文案|目标ID>>`**：可点击链接。  
  转义规则见 `ebookInternalLinkMarkers.ts` 文件头注释；各格式下 `目标 ID` 形态（如 EPUB 为 `文件名#片段`、MOBI 为 `mobi-NNNN#片段`）由对应 `parse*.ts` 约定。

`ReaderMain.vue` 载入正文后调用 `stripEbookIdAndAMarkersFromText`：

- 去掉 `<<ID:…>>`，将 `<<A:…>>` 替换为可见文案；建立 `id → 物理行`、内链点击区间与「行首链内标签」映射。
- 与压缩空行配合时使用 `ebookDisplayLineToPhysical` / `ebookAnchorPhysicalToDisplay`（见 `reader/ebookAnchorLookup.ts`）。
- 章节检测侧用 `leadingEbookLinkLabelsByLine` 识别**假章节**（标题以链内链接文案为前缀时跳过）。

插图行 **`<<IMG:…>>`**：

- 由 `monaco/readerImageViewZones.ts` 等与 `pathUtils`（POSIX 片段拼接）配合展示，依赖 `colortxt://` 访问写出后的图片。
- 从 Monaco 正文中删除插图锚点独占行，并返回删行前的 Monaco 行号（降序）。
- `useTxtStreamPipeline.removeFilteredDisplayLinesAtOriginalIndices` 在压缩空行模式下据此同步裁剪 `filteredDisplayToPhysicalLine`，避免映射与正文行数不一致导致搜索/恢复错位。

### 目录与文件速查

| 文件 / 目录                                                                     | 职责                               |
| ------------------------------------------------------------------------------- | ---------------------------------- |
| `convertEbookToColorTxt.ts`                                                     | 调度解析、路径解析、缓存、写出产物 |
| `ebookFormat.ts` / `ebookTypes.ts`                                              | 路径判定、产物类型                 |
| `pathUtils.ts`                                                                  | 路径 join / dirname（FS 语义）     |
| `yieldToUi.ts`                                                                  | 解析前后让出主线程                 |
| `ebookInternalLinkMarkers.ts`                                                   | 内链标记解析、剥离与章节辅助       |
| `parseEpub.ts` / `parseMobi.ts` / `parsePdf.ts` / `parseFb2.ts` / `parseChm.ts` | 各格式实现                         |
| `chm/`                                                                          | CHM 归档与 LZX 解码                |
| `mobi/`                                                                         | Foliate MOBI 引擎脚本与类型声明    |

新增格式时：在 `shared/ebookExtensions.ts` 增加扩展名；主进程 `isTxtOrEbookFileName` 与 `isSupportedShellOpenPath` 会自动跟随；在 `convertBookBufferToArtifacts` 与 `EBOOK_DOT_EXTENSIONS` 中补全分支与列表；若需新资源类型，扩展 `ColorTxtArtifacts.imageWrites` 或正文约定即可。

## 全屏阅读与浮动 UI

全屏时顶栏、底栏、左侧章节/文件侧栏默认隐藏，靠屏幕边缘**感应区**呼出；移出对应面板区域后收起；在**阅读区所在 `.layout`** 上按下鼠标时也会一并收起已打开的浮动层（点在已展开侧栏内除外）。实现集中在 `src/renderer/src/composables/useAppReaderChrome.ts`，边缘像素与右侧滚动条「非唤起带」在 `src/renderer/src/constants/appUi.ts`（`FULLSCREEN_*_EDGE_PX`、`FULLSCREEN_RIGHT_SCROLLBAR_GUTTER_PX` 等）。

### 统一交互模型

1. **`document` `mousemove`（由 `useAppWindowBindings` 注册）**  
   仅当**当前全屏**且**该浮动层尚未显示**时，根据指针是否进入对应边缘感应区决定是否唤起：
   - **顶栏**：`clientY` 不超过顶缘厚度，且不在右侧 gutter 内（避免误触 Monaco 固定滚动条一带）。
   - **底栏**：`clientY` 不低于「视口高度 − 底缘厚度」，且不在右侧 gutter 内。
   - **侧栏**：`clientX` 不超过左缘厚度。  
     一旦某层已显示，上述函数对该层**不再处理收起**（避免与 `mouseleave` 重复、抖动）。

2. **面板根节点 `mouseleave`（在 `App.vue` 模板中绑定）**  
   仅当 **`isFullscreenView`** 为真时，将对应 `showFullscreen*` 置为 `false`：
   - 顶栏：`appHeaderWrap` → `onFullscreenHeaderMouseLeave`
   - 底栏：`appFooterWrap` → `onFullscreenFooterMouseLeave`
   - 侧栏：`sidebarPaneWrap` → `onFullscreenSidebarMouseLeave`  
     浏览器只在指针离开**该元素及其子节点**时触发，与可见命中区域一致；子菜单若 **Teleport** 到 `body`，移入浮层会先触发顶栏 `mouseleave` 导致顶栏收起，属已知限制（可后续为浮层根单独白名单）。

3. **`.layout` `mousedown`（`App.vue`）**  
   全屏时先于 `useAppFullscreenReaderLayout` 的 `onLayoutMouseDown` 调用 `dismissFullscreenPanelsOnLayoutPointerDown`：将顶栏、底栏、侧栏的 `showFullscreen*` 一律置 `false`（已为 `false` 则无影响）。顶栏、底栏挂在 `.layout` 之外，能命中 `.layout` 的按下即表示未点在顶/底栏上。侧栏在 `.layout` 内：若侧栏处于展开态且事件目标落在侧栏根容器子树内（含沿 **ShadowRoot.host** 向上的判定，与正文区滚轮转发一致），则**不**收起，避免在侧栏里点选时误关。

4. **层间互斥**  
   `canShowFullscreenPanel` 保证同一时刻只有一种浮动层可通过边缘被唤起（避免叠在一起）。

5. **退出全屏**  
   主进程广播非全屏或原生退出全屏时，`dismissFullscreenChromeForNativeExit` 会清空各 `showFullscreen*` 与全屏提示用的淡入淡出计时器，避免 UI 状态残留。

6. **顶栏与查找**  
   Monaco 查找控件展开时，`updateFullscreenHeaderHover` 内若 `isFindWidgetRevealed()` 为真会强制收起顶栏，避免与查找条布局冲突。

7. **侧栏宽度**  
   非全屏时侧栏仍可拖拽改宽；全屏浮动侧栏宽度仍用同一 `sidebarWidth` 状态（`startResizeSidebar` / `endSidebarResize` 等未改）。

### 顶栏 UI

全屏时 `AppHeader` 传入 `inFullscreen`；**「切换侧栏」** 图标按钮使用 `v-if="!inFullscreen"` 隐藏，避免与左缘感应侧栏重复。

### 全屏正文宽度与两侧空白滚轮

- **宽度**：设置里的「全屏正文区宽度」对应 `fullscreenReaderWidthPercent`，由 `useAppFullscreenReaderLayout` 的 `fullscreenReaderPaneStyle` 在全屏时给 `readerPaneWrap` 设 `width` / `maxWidth`（百分比）与水平 `auto` 外边距，使正文区在 `.layout` 内水平居中；两侧露出与正文同背景的空白。
- **滚轮**：
    - 空白区不在 Monaco 视图 DOM 上，原生 wheel 不会进入编辑器。
    - `App.vue` 在 **`.layout`** 上监听 **`@wheel`**，由 `useAppFullscreenReaderLayout.onLayoutWheel` 判断指针是否在 `readerPaneWrap` 矩形**之外**（左右空白）；且事件与全屏侧栏无关时，调用 `ReaderMain` 的 **`delegateEditorWheelFromBrowserEvent(ev)`**。
    - 内部对编辑器实例调用 **`delegateScrollFromMouseWheelEvent`**（`CodeEditorWidget` 运行时方法，未写入 `monaco` 的 `.d.ts`），与正文内滚轮走**同一条** Monaco 滚动逻辑。
- **`preventDefault` 顺序**：Monaco 在 `_onMouseWheel` 开头若发现 **`ev.defaultPrevented` 已为 true 会直接 return**，故 **`delegateEditorWheelFromBrowserEvent` 须在 `preventDefault` 之前调用**；委托完成后再对布局层 `preventDefault()`。侧栏内滚动通过 `composedPath` / `elementFromPoint` 与 Shadow DOM 向上判定排除，避免误劫持。
- **其它滚动**：键盘方向键、PageUp/PageDown 等仍由 `ReaderMain` 的 **`scrollByDeltaY` / `scrollByLineStep` / `scrollByPageStep`** 等驱动，与上述空白区 wheel 委托无关。
- **样式**：全屏时 Monaco 纵向滚动条、概览尺、**小地图**（编辑态开启时）通过 `appShell.css` 固定到视口最右侧：滚动条/概览尺 `right: 0`，小地图 `right: var(--txtr-fullscreen-scrollbar-size)`（默认 14px，与 Monaco 默认竖条宽度一致）；须 **`left: auto`** 覆盖 Monaco 内联 `left`，避免小地图落在居中正文中间。与窄正文居中并存。

## 阅读器字号与行高

实现集中在 `src/renderer/src/constants/appUi.ts` 与 `src/renderer/src/monaco/readerEditorOptions.ts`（`readerEditorLineHeight`）。

- **字号**：`minFontSize`～`maxFontSize`（整数 px），顶栏加减、快捷键与设置面板滑块共用同一状态。
- **行高倍数**：最小为 `minLineHeightMultiple`，步进 `lineHeightMultipleStep`（如 0.1）。
- **上限随字号变化**：Monaco 将编辑器 `lineHeight` 限制在约 `monacoMaxLineHeightPx`（150）像素量级；应用内行高由 `readerEditorLineHeight(字号, 倍数)` 得到（`Math.max(1, Math.round(字号 × 倍数))`）。
- **夹紧与持久化**：`maxLineHeightMultipleForFontSize(字号)` 得到该字号下允许的倍数上限；加载与设置「确定」时用 `clampLineHeightMultipleForFontSize` 将倍数夹到合法区间。
- **设置面板**：字号、行高均为滑块；行高滑块的上限随草稿字号变化；拖动字号若导致当前行高超限时，会自动下调行高草稿。
- **仅加大字号**（快捷键 / 顶栏）：若当前行高倍数在新字号下超限，会自动下调倍数并写回阅读器与持久化。

## 底栏（`AppFooter`）

由 **`AppFooter.vue`** 渲染，数据与事件由 **`App.vue`** 注入。阅读进度与百分比文案仍来自 **`useAppReadingProgress`**（与其余展示口径一致）。

### 左侧路径

- **展示**：`footerPathCaption` — 普通书籍为 **`physicalReaderPath ?? currentFile`**；**电子书转换中**为源书路径（`ebookConversionSourcePath`）。
- **交互**：路径为链式按钮，点击打开 **`AppContextMenu`**（非直接打开资源管理器）。
- **菜单项**（均受「整体在窗口内」夹取；某条不可用时仍显示为 **disabled**）：
  - **在文件管理器中显示**：与 **`revealCurrentFileInFolder`** 一致，目标路径为 **`physicalReaderPath ?? currentFile ?? ebookConversionSourcePath`**（无可用路径时 disabled）。
  - **重新加载**：**`openFilePath(currentFile, { keepSidebarTab: true })`**；无 **`currentFile`**、**`loading`** 或 **`ebookParsing`** 时为 disabled。
  - **关闭文件**：**`closeCurrentFile`**（**danger** 样式）；无 **`currentFile`** 时 disabled。

### 右侧编码

- **展示**：当前探测/保存用编码标签（**`fileEncoding`**）；打开文件时由主进程 **`detectTextEncoding.ts`** 自动探测（流式读与编辑载入共用），标签经 `encodingLabelForFooter` 显示（如 `UTF-8`、`GB2312`、其它 chardet 名大写）。
- **可点条件**：由 **`footerEncodingActionsEnabled`** 控制（需 **`physicalReaderPath`**、**`currentFile`**、非 **`loading`**、非 **`ebookParsing`** 且 **`writeTextFile` 可用**）。
- **菜单**：**保存为 UTF-8** / **保存为 GB2312** → **`saveReaderBufferWithIpcEncoding`**：`ReaderMain.getAllText()` → **`writeTextFile(physicalReaderPath, text, 编码)`** 覆盖落盘；成功后更新 **`fileEncoding`**、**`readerSaveEncoding`**，并 **`markReaderEditSaved`** / 清除编辑脏标记（与顶栏保存路径一致）。

### 弹出定位与互斥

- **`AppContextMenu`** **`placement="aboveFooterMouseX"`**：以底栏 **`<footer>`** 的 **`getBoundingClientRect().top`** 为界，菜单**底边**始终在底栏之上（留缝）；**横向**以打开瞬间的 **`clientX`** 与菜单宽度居中对齐后再做视口夹取。
- **路径菜单与编码菜单互斥**：打开其一会先关闭另一；共享同一组指针/底栏顶边坐标（`footerPopoverFooterTopPx` / `footerPopoverPointerXPx`）。

## 只读展示管线（`reader/readerDisplayPipeline.ts`）

流式读盘阶段 **`useTxtStreamPipeline`** 只向 **`physicalLineContents`** 追加**物理行**（插图锚点删行会收缩映射表）。加载过程中**不**累加总字数、**不**跑章节匹配；流结束或切换「压缩空行 / 行首缩进」时调用 **`formatPhysicalLinesForReader`** 得到展示正文与 **`displayLineToPhysicalLine`**，再 **`setFullText`**、更新 **`totalCharCount`**（`formatted.text.length`）并触发章节重建。

- **`applyReaderDisplayFromPhysicalLines(physicalAnchorLine)`**：基于内存物理行重算展示层并恢复视口（`useAppReaderUiPrefs` 切换开关、`syncChaptersAfterViewportSettled`）；失败回滚 UI 开关。
- **`physicalSearchRangeToDisplayColumns`**：侧栏搜索命中列 → Monaco 列；只读且 **`leadIndentFullWidth`** 时经 **`chapter.ts`** 的 **`physicalRangeToDisplayColumns`** 计入行首全角缩进；**`readerEditMode`** 为 true 时列 1:1。
- **`syncMirrorFromReaderModel`**：编辑态将 Monaco 全文写回物理行镜像，供 **`runSidebarSearch`** 与底栏 **`totalCharCount`**（`getAllText().length`）使用。

## 阅读器编辑模式（正文磁盘编辑）

只读模式下正文由上述**只读展示管线**写入 Monaco。**编辑模式**下 `ReaderMain` 展示 **`physicalReaderPath` 磁盘全文**：Monaco 行与源文件物理行**一一对应**（不经压缩/缩进展示层）；保存时将 Monaco 全文按编码写回该路径。顶栏编辑菜单可对全文做**格式化**（`reader/readerTextFormat.ts`）：**压缩空行**、**行首全角缩进**，经 `ReaderMain.applyEditFormat*` 写回模型并 **`runEditFormatWithChapterSync`** 刷新章节。

### 状态与入口（`App.vue`）

- **`readerEditMode` / `readerEditorDirty`**：是否处于编辑态、缓冲区是否与上次载入/保存快照不一致；`useAppShellThemeWatch` 在标题上对 dirty 追加 `*`。
- **`canEnterReaderEditMode`**：已打开文件、非 `loading`、**`readingProgressSynced`**、非 `ebookParsing`；否则顶栏「编辑」仅 **`appToast`**。
- **顶栏 `AppHeader`**：编辑开关、编辑态**保存**、编辑态**格式化**（压缩空行 / 行首缩进）；只读专用的压缩/缩进开关在编辑态由格式化菜单承担。
- **设置 → 编辑**：**`readerEditShowLineNumbers`**（默认关）、**`readerEditMinimap`**（默认关）、**`editAutoRefreshChapterList`**（默认开）；经 **`buildReaderMonacoModeEditorOptions`** 控制行号栏与小地图；小地图节标题由 **`buildChapterMinimapSectionHeaderDecorations`** 与章节快照同步。
- **底栏「编码」**：只读或编辑态均可将 **`getAllText()`** 按所选编码写回 **`physicalReaderPath`**。
- **切回只读**：未保存时 **`readerEditDiscardUnsavedMessageBox`** 确认后 `openFilePath` 重载；**`restorePhysicalLine`** 使用编辑态 Monaco 行号（即物理行），**不可**对编辑行号再调 `viewportDisplayLineToPhysicalLine`。
- **快捷键**：编辑态下滚动/翻页/查找等阅读快捷键仍由外层处理；Monaco 内仅保留编辑相关命令（如 **`colortxt.readerEdit.save`** → **`onSaveReaderFile`**）。

### `ReaderMain.vue` 载入与滚动

- **载入**：`readWholeTextFile` → `setValue` → **`applyReaderMonacoModeOptions(true)`**；成功 **`readerEditLoaded`**（`encoding`）、**`readerEditDirtyChange(false)`**；`App.vue` **`onReaderEditLoaded`** 内 **`resyncMirrorFromReader`**、有搜索词则 **`scheduleSidebarSearch`**、**`refreshChapterListFromReader`**，并在 `finally` 解除 **`suppressChapterListAutoScroll`**。
- **进入/退出编辑前**：**`captureViewportRestoreAnchor`**（`reader/readerViewportAnchor.ts`：物理行 + 折行内视觉行下标；采样带为视口顶沿下约第 2 条字高）写入 **`readerEditRestoreAnchor`**，须在 `readerEditMode` 切换前捕获；恢复时 **`restoreViewportToRestoreAnchor`**。只读侧仍可用 **`captureViewportAnchorPhysicalLine`** 作回退。
- **脏检测**：`onDidChangeContent` → **`readerEditContentChange`**；`App.vue` **`onReaderEditContentChange`** 同步镜像，编辑态且有关键词时 **`scheduleSidebarSearch`**（行内改动即时重搜，不依赖 `totalLineCount` watch）。
- **压缩空行开启时进入编辑**：用捕获的物理行在 `setValue` 后 **`scrollLineToBottom` / `jumpToLine`** 对齐视口。

### 章节、书签与搜索联动

- 编辑载入/格式化后从全文重算章节（`.md` 用 **`buildChaptersFromMarkdownEditorText`**）；编辑态一般不挂章节标题**行内**装饰（避免改标题时 Monaco 渲染异常），小地图节标题见上。
- **`App.vue`**：**`scheduleChapterListRefreshFromEdit`**（`CHAPTER_REFRESH_DEBOUNCE_MS` ≈ 400ms）在 **`editAutoRefreshChapterList`** 开启且行数 ≤ **`editAutoRefreshChapterListMaxLines`**（30 万）时，于 **`onReaderEditContentChange`** 防抖刷新章节；否则 **`showEditChapterRefreshButton`** 为 true，由侧栏 **「刷新章节」** 手动触发 **`refreshChapterListFromReader`**。
- **书签**：编辑态存 **Monaco 行**；只读滤空时存**物理行**（见 **「书签」**）。
- **侧栏搜索**：详见 **「侧栏全文搜索」**；退出编辑时 **`watch(readerEditMode)`**（`false`）重搜；进入编辑不在此 watch 中搜，等 **`readerEditLoaded`**。

### 同步当前文件与主进程 IPC

- **`useAppSyncCurrentFileWatch`**：编辑态不监听磁盘；编辑态保存不触发自动重载。
- **`file:readWholeTextFile` / `file:writeTextFile`**：见 `ipcHandlers.ts`；读盘编码与 **`file:stream`** 相同（**`detectTextEncoding.ts`**）；preload 暴露 **`readWholeTextFile`**、**`writeTextFile`**。

## 侧栏全文搜索（`App.vue` + `SearchPanel.vue`）

- **`runSidebarSearch`**：在 **`physicalLineContents`**（只读流式镜像；编辑态由 **`resyncMirrorFromReader`** 同步）上匹配；**同一物理行内每个 `range` 一条结果**（对齐 VS Code），`SidebarSearchResult` 仅含单段 **`range`** 与对应 **`displayLine`** / 列。
- **跳转**：**`onJumpToSearchResult`** → **`physicalSearchRangeToDisplayColumns`**（只读+行首缩进）或编辑态物理列 → **`revealRangeInCenter`** / 查找高亮。
- **重搜时机**：
  - **`watch(searchQuery)`**、匹配选项变化：始终防抖重搜。
  - **`watch(totalLineCount)`**：仅只读（加载完成、切换展示层导致行数变）；编辑态由 **`onReaderEditContentChange`** 负责。
  - **`watch(readerEditMode)`**：仅**退出**编辑（`false`）时重搜；**进入**编辑在 **`onReaderEditLoaded`** 之后重搜。

## 启动与会话：侧栏初始标签

- **主进程**（`windowFactory.ts`）：按窗口记录 **`shouldRestoreSession`**、**`pendingOpenTxtByWindowId`**；preload 同步 **`getInitialWindowLoadIntent`** → `window:getInitialLoadIntent`。
- **`reader/initialSidebarTab.ts`**：**`resolveInitialReaderSidebarTab`**：有待打开路径 → **章节**；否则若首窗口将恢复会话且 `session` 含 `currentFile` → **章节**；纯新窗口 → **文件**。`App.vue` 用其初始化 **`readerSidebarTab`**，避免首屏先闪「文件」再切「章节」。

## 书签（行号语义、侧栏与弹窗）

### 持久化行号（`colorTxt.file.meta` → `FileBookmarkItem.line`）

- **只读**且经滤空管线时：存 **物理行**（与 `viewportTopPhysicalLine`、章节重建所用全文分行一致）。
- **`readerEditMode`**：Monaco 与磁盘一行对一行，存盘行号即 **Monaco 显示行**，不经 `viewportDisplayLineToPhysicalLine`。

### 添加书签时记哪一行

- **`ReaderMain.getBookmarkSaveAnchorDisplayLine()`**：与 **`jumpToBookmarkLine`** 对齐——在当前滚动下取视口内容区 **上沿 + 一行字高**（`scrollTop + EditorOption.lineHeight`）处的 **逻辑行号**，对 **`getTopForLineNumber`** 做二分（折行下不同于简单「顶行 +1」）；无编辑器/模型时返回 `null`。
- **`useAppBookmarkPins`**：`confirmAddBookmark` 与弹窗预览共用 **`getPendingBookmarkSaveLine()`**——新建时优先锚点显示行再映射为物理行（只读）或直接用显示行（编辑）；锚点不可用时回退 **`viewportTopPhysicalLine`**。**编辑已有书签** 时 **`editingBookmarkLine`** 始终为打开弹窗时的 meta 行键；点「更新为当前行」只写入 **`stagedEditingBookmarkLine`**，预览与 **`getPendingBookmarkSaveLine()`** 用 **`staged ?? editing`**；**「保存」** 时若行有变则 **`removeBookmark(orig)`** 再 **`upsertBookmark(line, note)`**，否则仅 **`upsertBookmark`** 更新备注；关弹窗（含取消）会 **`watch(addBookmarkOpen)`** 清空暂存行。

### 从列表跳转

- **`jumpToBookmark`**：`physicalLineToDisplayForReader`（只读）后调用 **`ReaderMain.jumpToBookmarkLine`**：`revealLineNearTop` 后将 **`scrollTop`** 设为 **`getTopForLineNumber(line) - lineHeight`**，使目标行落在视口上沿约一行高之下，为黏性章节条留白。

### 侧栏列表（`BookmarkListPanel.vue`）

- **章节名**：`useAppBookmarkPins` 对每条书签用 **`pickActiveChapterIdx(chapters, line)`**（`reader/chapterIndex.ts`）；**只读**下先将存盘物理行换为 **Monaco 显示行** 再查章，**编辑态** 下用存盘行直接查（与章节表 `lineNumber` 坐标一致）。无匹配或标题去空后无字则不展示章节行。
- **正文预览**：与弹窗相同，从该书签行起向下扫描物理行，取首个 **trim** 非空内容；否则展示「（空行）」类占位。
- **备注占位**：有非空备注照常显示；**无备注** 若能显示章节名则不渲染「无备注」；无备注且无章节名时仍显示「无备注」斜体占位。
- **样式**：**`.bookmarkChapter`**（11px、字重 600、`opacity: 0.78`、单行省略）、**`.bookmarkContent`**（11px、斜体、`opacity: 0.7`、单行省略）；**`.bookmarkMain`** 内 **`gap: 2px`**，备注/章节/正文行统一 **`line-height: 1.35`**，与弹窗预览对齐。
- **右键菜单**：**`AppContextMenu`** 置于 **`<Teleport to="body">`**，组件根上 **`data-fullscreen-sidebar-float`**（与 **`FileListPanel`** 等侧栏 Teleport 菜单一致），避免侧栏滚动容器 **`overflow`** 裁切；坐标仍用 **`clientX` / `clientY`**（视口坐标）。

### 添加 / 编辑书签弹窗（`AppOverlays.vue`）

- **`addBookmarkDialogPreview`**（`useAppBookmarkPins` 计算属性）：仅在 **`addBookmarkOpen`** 时有效；内容含 **`chapterTitle?`**、**`content`**，推导行号与 **`confirmAddBookmark`** 一致；依赖 **`chapters`、`totalLineCount、lastProbeLine、readerEditMode`** 等以便章节重建、滚动探针、流式增行时刷新。
- **布局**：备注 **`textarea` 上方** 为预览区；章节名与正文样式、行距、间距与侧栏 **`.bookmarkChapter` / `.bookmarkContent` / `.bookmarkMain`** 一致；正文预览单行省略、**`title`** 悬停可看全文。
- **编辑态 footer**：左下角 **「更新为当前行」**（`canBookmark` 为 false 时禁用），经 **`@update-bookmark-to-current-viewport-line`** 调用 **`updateEditingBookmarkToCurrentViewportLine`**：仅更新 **`stagedEditingBookmarkLine`**，与备注一样在点 **「保存」** 时一并落盘；**「取消」** 关弹窗会清空暂存。仅 **`editingBookmarkLine != null`** 时显示。

### `App.vue` 数据流

- **`useAppBookmarkPins`** 除原有依赖外传入 **`chapters`** ref，供列表与弹窗推断章节名。

## 界面与阅读偏好默认值

首次运行或 `localStorage` 中尚无 `colorTxt.ui.settings`、或某字段未写入时，渲染进程使用 `src/renderer/src/constants/appUi.ts` 里以 `default` 前缀命名的常量作为初始值，包括：

- 主题、侧栏展开、语法着色；**压缩空行** / **保留一个空行** / **行首缩进**；**`readerEditShowLineNumbers`**、**`readerEditMinimap`**、**`editAutoRefreshChapterList`**；章节字数；字号与行高倍数；启动恢复会话；Monaco 高级换行等。
- **侧栏文件列表**筛选与排序默认值见 **`constants/fileCategories.ts`**（如 `FILE_CATEGORY_FILTER_ALL`、`DEFAULT_FILE_SORT`；分类目录首次用 `cloneDefaultFileCategoryCatalog()`）。
- `App.vue` 中对应 `ref` 引用上述常量；`ReaderMain.vue` 的 `withDefaults` 在未由父组件传入时与压缩空行、语法着色、高级换行、内部行高初值保持一致。已存在本地设置时仍以持久化数据为准。

## 自定义高亮词与高亮色

- **高亮色（全局、按主题）**：
    - 默认亮/暗两套颜色列表见 `constants/highlightColors.ts`（`DEFAULT_HIGHLIGHT_COLORS_LIGHT` / `DEFAULT_HIGHLIGHT_COLORS_DARK`）。
    - 在 **`ColorSchemePanel` →「高亮色」** 页编辑；确定后经 **`applyHighlightColors`** 写入 `App.vue`，并持久化到 **`colorTxt.ui.settings`** 的 `highlightColorsLight` / `highlightColorsDark`。
    - 当前 shell 主题为 `vs` 时用亮色表，`vs-dark` 时用暗色表（与阅读器表面色主题一致）。
- **自定义词（按文件）**：用户在编辑器中选中文本添加的词保存在该文件 **`colorTxt.file.meta`** 的 **`highlightWordsByIndex`**（键为颜色槽位索引字符串）。与书签类似先改内存，在切书、`rememberCurrentFileLine`、关窗卸载等路径随 `fileMetaStore` 落盘。
- **开关与语法**：
    - **`monacoCustomHighlight`** 存于 `colorTxt.ui.settings`。
    - 开启且存在有效词表时，`txtrHighlightMonarch.buildTxtrCustomHighlightMonarchRules` 生成 Monarch 规则，由 `txtrTextMonarch` 注入 `txtr-text`；`readerInlineDecorations` 为对应 token 提供前景色（与槽位索引及 `highlightColors` 对齐）。
    - 关闭开关或无语词时不注入自定义规则。

## 快捷键

- **动作与默认值**：`src/renderer/src/services/shortcutRegistry.ts` 定义动作 ID、说明、`scope`（`window` 窗口内 / `global` 系统级）及默认 Electron 快捷键字符串。
- **持久化**：用户覆盖保存在 `colorTxt.ui.settings` 的 `shortcutBindings`（见 `stores/cacheStore.ts` 与 `useAppPersistence`）；加载时与默认表合并、规范化（`shortcutUtils.mergeShortcutBindings`）。
- **还原默认**：`ShortcutPanel` 中「全部还原默认」将 `shortcutRegistry` 的默认表写回并持久化（与 `App.vue` / `useAppPersistence` 联动）。
- **冲突与校验**：多个窗口级动作绑定同一快捷键时，由 `shortcutUtils.collectShortcutConflicts` 在确认前提示；**全局显隐**另须经主进程 `validateGlobalShortcut`（临时 `globalShortcut.register` 探测系统是否允许）。
- **窗口级**：`shortcutService.ts` 在 `window` 上监听 `keydown`，将事件转为规范化快捷键并与当前 `ShortcutBindingMap` 比较；`useAppWindowBindings` 注入 `shortcutBindings` ref，并在有模态层时跳过（与 `modalStack` 配合）。
- **UI 展示**：`App.vue` 将同一 `shortcutBindings` ref 传给 `AppHeader` → `MoreMenu`；用户在快捷键面板修改并应用后，「更多」菜单中对应项旁的快捷键会立即与持久化绑定一致。
- **配色弹窗**：动作 ID **`openColorScheme`**（默认 **F6**），由 `useAppWindowBindings` 注入的 `openColorScheme` 打开 `ColorSchemePanel`（与顶栏高亮菜单内「打开配色」一致）。
- **全局级（仅「阅读器显隐」）**：主进程 `globalShortcuts.ts` 注册 `globalShortcut`；渲染进程保存或校验时通过 `window.colorTxt.validateGlobalShortcut` / `setGlobalShortcut`（IPC 名 `shortcut:validateGlobalToggle` / `shortcut:setGlobalToggle`）与主进程同步；详见上文 **`globalShortcuts.ts`**。
- **录制与 IME**：
    - 编辑弹层打开时主进程 `suspendGlobalShortcutsForRecording`，关闭时 `resume`，避免录制时触发已注册的全局热键。
    - 录制界面不用 `<input>`，而用可聚焦的 `div` 只展示规范化快捷键，并加 CSS 闪烁光标。
    - `shortcutUtils.keyboardEventToAccelerator` 优先用 **`KeyboardEvent.code`**（物理键位）解析主键；`code === 'Unidentified'` 等情况下回退 **`keyCode`**，最后才用 `key`，避免 `Ctrl+Shift+2` 被显示成 `Shift+@`。
    - 忽略 `Process` / `Dead` / `Unidentified` 与 `isComposing` 等与 IME 相关的无效键。

## AI 阅读助手与相关能力

本节汇总 **AI 阅读助手**、**向量检索（RAG）**、**文生图（角色卡）**、**角色侧栏**、**技能** 与 **Agent** 的入口、数据落点及与主进程的衔接。与 **「开发」** 章中的 **`src/` 目录树**、**`src/main/`**、**`preload`**、**主要 Vue 组件** 表互为参照。

### 功能与入口

- **入口**：侧栏活动栏 **「AI 助手」**、**「角色」**；设置中 **「AI 阅读助手」「向量模型」「角色卡」「技能」** 四个扩展页签在 **AI 总开关** 关闭时隐藏（见 `SettingsTabBar` / `draftAi.aiEnabled`）。
- **对话与 RAG**：正文与阅读器一致；**「向量模型」** 页选择 **内置本地模型**（新装默认）或 **远程嵌入 API**，并配置切块 / **`ragTopK`** 等。
    - 对当前书 **「建索引」** 时，渲染进程 **`buildBookVectorIndex.ts`** 按章节分块，经 preload 调主进程嵌入并写入当前 **AI 数据缓存根** 下的 **`vector.sqlite`**（`better-sqlite3` + `sqlite-vec`，路径见下节）。
    - **内置**来源须先在设置页 **下载** 对应模型（**`embeddingReady`** 会在未下载时拦截建索引）；**远程**来源需配置接口与模型名。
    - 修改嵌入 **向量维度** 并保存时，设置面板会 **`showMessageBox`** 提示将清空已建索引。
- **文生图 / 角色卡**：**「角色卡」** 页配置文生图后端与采样参数（见 `@shared/aiTypes` 的 **`AITxt2ImgConfig`**，默认 **`backend: "a1111"`**、`apiBaseUrl: http://127.0.0.1:7860`）；与主进程 **`aiTxt2Img.ts`**、`registerAiIpc` 暴露的 `ai:txt2img` 等 IPC 配合。服务商与默认地址见下节 **「文生图服务商」**。立绘文件落在 **`characterPortraitCacheDir`**（默认 **`userData/CharacterPortrait`**，按书名分子目录，见 `@shared/characterPortraitPaths`），主进程 **`characterPortraitFs.ts`** 负责迁移与复制。
- **角色卡 3D 倾斜与闪卡纹理**：侧栏 **「角色」→ 更多 → 卡片效果** 子菜单切换全局纹理（持久化 **`characterCardTextureEffect`**，默认 **细腻光泽**）；详见下节 **「角色卡 3D 倾斜与闪卡纹理」**。实现思路及部分样式、贴图参考 [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css)（见 README 致谢）。
- **技能与 Agent**：内置技能元数据与用户覆盖见 `@shared/aiSkills`；Agent 工具名与主进程 **`aiAgentTools.ts`** 对齐（`@shared/aiAgentSkillToolNames`）。流式对话与工具事件经 **`aiAgentChat.ts`** 推送到渲染层（`window.colorTxt.ai.onAgentEvent`）。
- **会话与配置**：每本书（内容哈希）多会话，消息存 **同一向量库文件** 内 SQLite 表。运行时 **`config.json`** 位于 **AI 数据缓存根**（**不含**聊天正文；含 **`showTokenUsage`**、**`chat.tokenPricePerMillion`**、**`aiDataCacheDir`**、**`embedding.*`** 等，API Key 不落盘明文）。默认对话 Base URL 为 **`http://127.0.0.1:1234/v1`**（本地 LM Studio）。聊天 / 嵌入 / 文生图请求由主进程代理，经 IPC 流式回传（可中止）。

### 对话模型服务商

阅读助手与角色 **AI 检索** 使用的对话能力均走 **OpenAI 兼容** `POST {baseUrl}/chat/completions`（Agent 另含 `tools` / `tool_calls`）。在 **设置 → AI 阅读助手 → 服务商** 下拉中选择预设会自动填入 **接口地址**；也可选 **「自定义 OpenAI 兼容服务」** 手填任意兼容网关地址。

预设清单与代码 **`@shared/apiEndpointPresets`**（`CHAT_API_PROVIDER_PRESETS`）一致；深度思考参数由 **`aiChatThinking.ts`** 按 `baseUrl` 识别注入（见下节「深度思考」）。

| 服务商 | 设置页预设 | 官方通用 Base URL（OpenAI 兼容） | 深度思考 | API 密钥 |
| ------ | ---------- | -------------------------------- | -------- | -------- |
| 本地 LM Studio | 本地 LM Studio | `http://127.0.0.1:1234/v1` | 已适配（`think: true`） | 通常不需要 |
| 本地 Ollama | 本地 Ollama | `http://127.0.0.1:11434/v1` | 已适配（`think: true`） | 通常不需要 |
| DeepSeek | DeepSeek | `https://api.deepseek.com/v1` | 已适配（`thinking` 开关） | 需要 |
| 阿里云通义 | 阿里云通义（DashScope） | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 已适配（`enable_thinking`） | 需要 |
| 智谱 GLM | 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | 已适配（`thinking` 开关） | 需要 |
| Moonshot（Kimi） | Moonshot（Kimi） | `https://api.moonshot.cn/v1` | 已适配（`enable_thinking`） | 需要 |
| 硅基流动 | 硅基流动 | `https://api.siliconflow.cn/v1` | 已适配（开启时 `enable_thinking`） | 需要 |
| OpenAI | OpenAI | `https://api.openai.com/v1` | 未单独适配（仅温度） | 需要 |
| OpenRouter | OpenRouter | `https://openrouter.ai/api/v1` | 已适配（`reasoning.effort`） | 需要 |
| Google Gemini | Google Gemini（OpenAI 兼容） | `https://generativelanguage.googleapis.com/v1beta/openai` | 已适配（`reasoning_effort`） | 需要（Google AI Key） |
| 其它兼容服务 | 自定义 OpenAI 兼容服务 | （手填，无固定地址） | 未识别时仅温度=1 | 视网关而定 |

说明：

- **深度思考「已适配」**：侧栏开启「深度思考」时，应用会发送该厂商文档对应的思考开关；流式思考文案优先解析 `reasoning_content` / `reasoning` / `thinking` / `thought` 等 delta 字段（因上游而异）。
- **未单独适配**：仍可使用对话与 Agent 工具，但不保证思考开关与思考流展示正常；自定义地址若与上表某行 **Base URL 一致**，保存后会自动匹配为对应预设项。
- **向量嵌入**另有一套来源（**设置 → 向量模型 → 内置本地 / 远程 API**），见下节「内置向量模型与缓存目录」；**不**使用上表对话服务商下拉。
- **文生图**（本地 A1111 / ComfyUI 与云端图像 API）与 **语音朗读**（阿里云通义 DashScope 云端语音）为独立配置，亦不在上表；文生图预设见下节。

### 文生图服务商

角色立绘出图走 **设置 → 角色卡** 中的文生图配置（`txt2img.*`），与对话服务商无关。在 **服务商** 下拉中选择预设会同时写入 **`backend`** 与默认 **接口地址**（`apiBaseUrl`）；下拉项为两行展示（服务商名 + 默认 Base URL），与 **AI 阅读助手 → 服务商** 交互类似。**仅手改接口地址时不会根据 URL 反推或切换服务商**（与对话侧「地址与服务商联动」不同）。

预设清单与代码 **`@shared/apiEndpointPresets`**（`TXT2IMG_BACKEND_PRESETS`）一致：

| 服务商 | `backend` | 默认 Base URL |
| -------- | --------- | ------------- |
| 本地 WebUI | `a1111` | `http://127.0.0.1:7860` |
| 本地 ComfyUI | `comfyui` | `http://127.0.0.1:8188` |
| OpenAI Images | `openai_images` | `https://api.openai.com/v1` |
| 阿里云通义万相（DashScope） | `dashscope_wanx` | `https://dashscope.aliyuncs.com` |
| Stability AI | `stability` | `https://api.stability.ai` |
| OpenAI 兼容 Images 代理 | `openai_compat_images` | （用户填写） |

说明：

- **A1111**：主进程调用 WebUI **`/sdapi/v1/*`**（如 txt2img、采样器与 SD 模型列表）；设置页可拉取采样器 / 模型 / 高清修复放大算法；**尺寸**为宽高数字输入（默认 **512×768**）。
- **ComfyUI**：经 **`/prompt`** 提交工作流并轮询 **`/history`**；需在设置中粘贴 **Comfy 工作流 JSON**（导出 API 格式）；尺寸同为自定义宽高。
- **云端四类**：`txt2img.apiKey` 经 **`SECRET_SLOT_AI_TXT2IMG_API_KEY`** 加密保存（与语音朗读、AI 阅读助手的通义密钥在应用内分开保存，界面文案均为 **「阿里云通义（DashScope）」** 系表述）。出图前由对话模型将 **画风 + 角色形象** 整理为自然语言 prompt（**`natural`** 族）或 SD tag（**`sd`** 族，含 Stability）。云端 **尺寸**为各后端固定档位（**`txt2ImgCloudSizePresets`**）；切换服务商时写入该后端 **默认云端模型**（**`txt2ImgCloudModelPresets`** / **`TXT2IMG_DEFAULT_CLOUD_MODEL`**），并按 **512×768** 参考比例选取档位（在比例足够接近的候选中选 **像素最少**，利于立绘省额度）。
- **测试连接**：**`ai:txt2img`** 的 **`testConnection`** 走 **`aiTxt2ImgTestConnection.ts`**，仅校验地址/密钥（如 OpenAI `/models`、万相 models、Stability 账户等），**不出图、不消耗图像额度**；设置页由 **`AppConnectionTestButton`** + **`useConnectionTest`** 展示 pending/成功/失败（成功不弹框）。
- **侧栏「角色立绘生成」**：**画风（本书）** + **角色形象** + **负面描述**（仅 **SD 系** backend 显示输入框；云端不展示，负面由设置内通用项与 prompt 整理承担）。字段仍持久化为 `characterBookStyle.stylePrefixZh` 与角色的 `promptZh` / `negativeZh`。关闭弹窗（应用 / 取消 / 关闭按钮）时同步草稿并 **`characterFileMetaPatch`**；打开弹窗或设置 **确定** 后递增的 **`aiConfigSyncNonce`** 会刷新侧栏对当前 **`txt2img.backend`** 的判断（实际出图 IPC 每次 **`configGet`** 读最新配置）。
- 切换服务商会**覆盖**当前 `apiBaseUrl`（及云端默认模型/尺寸）；兼容代理可选手填地址；手改地址**不**反推服务商。

### 角色卡 3D 倾斜与闪卡纹理

侧栏角色卡支持指针 **3D 倾斜**、随倾斜变化的全息 **光泽/纹理**，以及角标 **原位放大查看**（放大后仍可点击正反面翻转）。与文生图配置无关；全局一项设置作用于当前书籍下全部角色卡。

#### 入口与持久化

| 项目 | 说明 |
| ---- | ---- |
| 菜单 | 侧栏 **「角色」** 活动栏 → 卡片 **「更多」**（`ReaderSidebar`）→ **「卡片效果」** 浮动子菜单（`AppShellMenuTeleport`，`aria-label="卡片效果"`） |
| 设置键 | **`colorTxt.ui.settings`** → **`characterCardTextureEffect`**（`PersistedSettingsData` / `cacheStore.ts`） |
| 默认值 | **`soft`（细腻光泽）**；未保存、空串或已移除的 id 经 **`normalizeCharacterCardTextureEffect`** 回退为默认 |
| 应用范围 | 全局：切换后 **`CharacterSidebarPanel`** 网格内所有 **`CharacterRosterCard`** 同步 **`texture-effect`** |

子菜单在 **「关闭」** 项下方有一条分隔线；**「梦幻竖纹」**、**「梦幻虹彩」** 项上方各有一条分隔线（`dividerBefore: true`）。

#### 可选纹理（`@shared/characterCardTextureEffects`）

| id | 菜单名 | 说明 |
| --- | ------ | ---- |
| `off` | 关闭 | 无倾斜驱动的高光层（`useCharacterCardTilt` 禁用） |
| `soft` | 细腻光泽 | **默认**；仅 **`card__glare`** 径向高光（`characterCardHolo.css`） |
| `rainbow` | 迷离反闪 | Reverse Holo 风格 |
| `holo` | 梦幻竖纹 | 竖向彩虹扫描条 |
| `shiny-v` | 幻彩波纹 | sunpillar 基底 + Shiny V 覆写 |
| `trainer-full-art` | 波纹钢印 | sunpillar + 训练家底图 |
| `v-max` | 幻彩极光 | VMAX 金属/渐变纹理 |
| `v-star` | 极光异画 | VSTAR pastel |
| `trainer-gallery` | 梦幻虹彩 | 斜向彩虹条 + 柔光晕染 |
| `rainbow-rare` | 彩虹秘稀 | Rainbow Rare |
| `rainbow-alt` | 彩虹异画 | Rainbow Alt（整卡无 mask 时对 foil 等有专门覆写） |
| `cosmos` | 星云幻彩 | 星系分层贴图 + 扫描线 |

（旧设置中的无效 id 加载时自动变为 **细腻光泽**。）

#### DOM 与样式分层

单卡结构（`CharacterRosterCard.vue`）：

```text
cardShellWrap（悬停抬高 z-index）
  └ cardShell.charHoloCard[data-char-texture]     ← shellStyle：倾斜变量 + popover 平移/缩放
       └ card__perspective
            └ card__tilt                         ← rotateX/Y + --char-popover-rotate-y
                 └ card__flip                     ← 正反面 rotateY(180°)
                      ├ cardFace.cardFront       ← 立绘、竖排名、角标（放大/编辑）
                      └ cardFace.cardBack        ← 背面文案；实底 + isolation（避免全息层发黑）
                 每层 cardFace 上叠加 card__shine / card__glare（pointer-events: none）
```

- **样式文件**：`styles/characterCardHolo.css`（变量、透视、**off/soft**、popover 旋转、减弱动效 **`prefers-reduced-motion`**）；`styles/characterCardHoloEffects.css`（各纹理块，文件头注释含 id 与中文名）。
- **贴图**：`renderer/public/card-textures/`（`grain.webp`、`glitter.png`、`geometric.png`、`illusion-mask.png`、`metal.png`、`trainerbg.png`、`cosmos-*.png` 等），经 CSS 变量 **`--char-grain`**、**`--char-glitter`**、**`--char-foil-*`** 引用。
- **与宝可梦卡版的差异**：角色卡 **整卡铺满** 立绘区域，**不使用** 卡图 `mask` / `clip-path` 分区；部分效果（如彩虹异画）在参考实现里依赖 mask 的层已按整卡场景改写（例如关闭多余 `glare::after`、无 mask 时不用 foil 层）。

#### 倾斜与光泽联动

- **驱动**：`useCharacterCardTilt` 根据指针在卡面上的位置更新目标 **`rotateX` / `rotateY`**（列表乘以 **`rotateScale` 0.4**，放大后 **1.0**）。
- **弹簧**：`utils/characterCardSpring.ts` 中 **`stepSpringScalar`**；跟手与回正参数分离，避免移出时生硬归零。
- **光泽**：`effectFromRotation()` 由当前旋转反推指针与背景偏移，写入 **`--char-pointer-x/y`**、**`--char-pointer-from-center`** 等，保证回弹时高光与倾斜同步。
- **注意**：倾斜层（**`card__tilt`**）及子级 **勿加 `filter`**，否则会破坏 **`preserve-3d`** 翻转透视。

#### 原位放大（查看大图）

- **触发**：卡角 **放大镜** → `CharacterSidebarPanel` 设置 **`popoverCardId`** → 对应卡 **`popover-open`**。
- **动画**：`useCharacterCardPopoverZoom` 计算视口居中 **`translate` + `scale`**；Y 轴旋转在 **`card__tilt`** 上过渡（约 **420–450ms**）。
- **交互**：半透明遮罩点击关闭；放大过程中其它卡不可点；倾斜在 popover 激活后短暂延迟复位。
- **占位**：`Teleport` 后原网格位置用 **`cardShellPlaceholder`**（同 **2:3** 比例）避免布局跳动。

#### 背面与无障碍

- **背面**：`cardBack` 使用 **`background: var(--bg)`** + **`isolation: isolate`**；背面 **`card__shine`** 使用 **`mix-blend-mode: soft-light`** 并降低 opacity，避免在浅底/侧栏上 **`color-dodge`** 发灰发黑。
- **动效**：`prefers-reduced-motion: reduce` 时取消倾斜 transform 并隐藏 shine/glare 动画。

### 内置向量模型与缓存目录

#### AI 数据缓存目录（`aiDataCacheDir`）

- **设置位置**：**设置 → AI 阅读助手 → 数据缓存目录**（**`AIConfig.aiDataCacheDir`**，空串表示默认 **`{userData}/ai/data`**）。
- **目录内容**：**`config.json`**（AI 各子项配置，不含 API Key 明文）、**`vector.sqlite`**（及 WAL/SHM，含分块向量、按书的 Agent 会话与消息）、引导文件 **`userData/ai/data-cache-root.json`** 记录当前生效根路径。
- **旧版升级**：首次启动时若仍存在 **`userData/ai/config.json`** 或旧 **`vector.sqlite`**，主进程 **`upgradeLegacyAiDataLayoutIfNeeded`** 自动迁入 **`ai/data`** 并写 bootstrap。
- **变更目录**：设置里修改数据缓存目录并 **确定** 时，**`SettingsPanel`** 提示确认后调用 **`window.colorTxt.ai.migrateDataCacheRoot`**（关闭向量库连接后合并迁移 `config.json` 与 `vector.sqlite*`）。

#### 内置嵌入（`embedding.provider === "builtin"`）

- **设置位置**：**设置 → 向量模型 → 模型来源 → 内置本地模型**（`AppCustomSelect` 两行：标题 + 说明）。
- **模型**：`@shared/builtinEmbeddingModels` — **BGE Small ZH v1.5**（512 维，推荐）、**Multilingual E5 Small**（384 维）；切换内置模型会改变 **`embedding.dimension`**，保存时同样可能触发清空索引提示。
- **HF 镜像**：**`embedding.hfRemoteHost`**，默认 **`https://hf-mirror.com`**；留空则使用官方 **`https://huggingface.co`**。模型文件经 **`@huggingface/transformers`** 下载到 **`{模型缓存目录}/transformers-cache`**。
- **模型缓存目录**：**`embedding.builtinModelCacheDir`**，空串默认 **`{userData}/ai/model-cache`**；变更并确定时 **`migrateBuiltinModelCacheRoot`** 迁移已下载文件。
- **UI**：**下载** / **清除** 按钮（**`ai:embedding:builtin:*`** IPC）；下载进度百分比；**测试连接** / **自动检测维度** 走内置加载后探测。
- **与 RAG**：内置与远程共用 **`ragSearch`** / **`ragTopK`**（**`BUILTIN_EMBEDDING_SUPPORTS_RAG_TOP_K`**）；建索引、角色检索补索引前均会校验 **`embeddingBuiltinIsCached`**。

#### 远程嵌入（`embedding.provider === "remote"`）

- OpenAI 兼容：远程仅配置 **`embedding.baseUrl`**（与对话相同），主进程用 **`openAiCompatModelsUrl`** / **`openAiCompatEmbeddingsUrl`** 派生 **`GET …/models`**、**`POST …/embeddings`**。**设置 → 向量模型 → 远程 API** 使用 **`CHAT_API_PROVIDER_PRESETS`** + **接口地址**；嵌入 **模型** 为 **`ApiEndpointInput`** + 拉取建议，可手输 **`remoteModel`**。

### 深度思考

- **入口**：侧栏 **AI 阅读助手** 与 **角色 → AI 检索** 工具栏胶囊 **「深度思考」**（`aiAssistantDeepThinking`，持久化在 **`colorTxt.ui.settings`**）。
- **行为**：开启后 Agent 请求温度固定为 **1**，并由主进程 **`aiChatThinking.ts`** 按 **`chat.baseUrl`** 注入各厂商思考参数；流式 **`reasoning_delta`** 在助手 UI 的思考折叠区展示，写入助手消息 **`payload.reasoning`**。各厂商开关与「深度思考」列见上表 **「对话模型服务商」**。
- **工具轮历史**：DeepSeek、通义、智谱、Moonshot、硅基、OpenRouter、Gemini 兼容等会在 assistant 消息中回传 **`reasoning_content`**（`shouldAttachReasoningContentOnToolCalls`）。
- **防剧透**：与厂商无关；由 **`spoilerSafe`** 限制 RAG/检索章节上限与系统提示（见 Agent 载荷），阅读助手与角色检索共用同一设置项。

### Agent 工具 `ragContext`（章节原文）

向量索引仍主要用于 **`ragSearch`**；**`ragContext`** 拉取**整章**正文时：

| 条件 | 行为 |
| ---- | ---- |
| 未传 `range`（全章） | 主进程经 **`fetchChapterPlainTextFromRenderer`** 向阅读器索取与侧栏字数一致的章节切片（`source: "reader"`） |
| 阅读器无内容 | 回退 **`mergeChapterChunkRows`** 拼接向量分块（`source: "vector"`，字数可能因分块重叠偏大） |
| 原文字数 ≤ **1 万** | `compressed: false`，`mergedMarkdown` 为完整章文 |
| 原文字数 > **1 万** | 按每 **1 万** 字一段调用对话模型压缩，合并为约 **1 万** 字提要（`compressed: true`）；折叠区标题 **「读取章节原文（M/N）」**，正文两行说明 + **`当前进度：M/N`**（warning 色加粗，见 `aiToolFoldBody.ts`） |
| 传入 `range` | 仍走向量库该章分块的中段抽样（与旧版节选逻辑一致，`source: "vector"`） |

渲染侧 **`useAiChapterPlainTextBridge`**（`App.vue`）监听 **`ai:chapter-plain-request`**，用 **`getChapterPlainTextByIndex`** 回复；preload 暴露 **`onChapterPlainRequest`** / **`replyChapterPlainText`**。

### Token 用量

- **总开关**：**设置 → AI 阅读助手 →「显示 Token 消耗信息」**（`AIConfig.showTokenUsage`，默认开启）。关闭后侧栏不展示 Token 条，设置内 **「每百万 Token 价格」** 区块一并隐藏。
- **发送后、助手折叠区之前**：主进程发出 **`token_usage_estimate`**（`estimateAgentTurnTokens`：system + 历史 JSON 字符数 + 固定工具轮缓冲 + 第二轮 prompt 比例项；向量检索开启时另加 **`ragContext` 结果缓冲**；输出按 `maxTokens` 的约 12% 粗估）。仅为参考，**简单寒暄/身份类问题常明显偏高**（实际往往单轮、无工具）。
- **对话结束后**：先发 **`token_usage_final`**（汇总 Agent 各轮 `stream_options.include_usage` 与章节压缩中的 `chatCompletionOnce` usage），再发 **`done`**。渲染层用 **`AiTokenUsageBanner`** 在助手气泡后插入实际消耗条；有实际值后移除同 `requestId` 的预估条。
- **输入缓存命中**：`extractUsageFromChatJson` 解析 **`prompt_cache_hit_tokens`**、**`prompt_tokens_details.cached_tokens`**（OpenAI / OpenRouter 等）、**`cache_read_input_tokens`** 等；展示为「输入 N（缓存命中 M）」；**无需为 OpenRouter / Gemini 单独写适配**，取决于上游 `usage` 是否返回字段。
- **花费估算**：在设置中填写 **`chat.tokenPricePerMillion`**（输入缓存命中 / 未命中、输出，单位：元/百万 Token；**0 表示未设置**）。须同时配置 **输出价** 与 **至少一项输入价** 才在消耗条末尾显示 **「总花费约：¥…」**；仅设一项输入价时全部输入按该价计。金额由 **`formatTokenUsageCost`** 格式化（去掉小数尾随 0）。
- **角色检索**：**AI 检索** 流程中主进程 **`aiCharacterPortrait`** 汇总 LLM usage，侧栏在 **「正在检索…」** 折叠区下方显示同款 **`AiTokenUsageBanner`**（同样受 **`showTokenUsage`** 控制）。
- **持久化**：最终助手消息的 SQLite **`payload`** JSON 可含 **`tokenUsage`**、**`tokenUsageAvailable`**（与 **`reasoning`** 并列）；历史重载时由 **`aiAssistantDbMessages`** 还原 token 条。
- **事件路由注意**：`token_usage_final` 会把 token 条插在助手气泡**之后**，故处理 **`done` / `error`** 时须用 **`findLiveAgentAssistant()`**（按 `agentLive` 或末条 `assistant` 定位），不能假定 `messages` 最后一项仍是助手，否则无法结束「正在思考…」与等待状态。

### `userData` 中的 AI 相关路径

| 路径 / 目录 | 说明 |
| ----------- | ---- |
| `ai/data/`（默认数据缓存根） | **`config.json`**、**`vector.sqlite`**（+ WAL/SHM）；实际根目录取 **`aiDataCacheDir`** 或 **`data-cache-root.json`** |
| `ai/data-cache-root.json` | 记录当前生效的 AI 数据缓存绝对路径（`aiDataFs`） |
| `ai/model-cache/`（默认内置模型缓存根） | 内置 Transformers 权重；其下 **`transformers-cache/`**；实际根目录取 **`embedding.builtinModelCacheDir`** |
| `ai/config.json`、`ai/vector.sqlite`（旧版） | 仅迁移前遗留；启动时尽量迁入 **`ai/data/`** |
| `CharacterPortrait/`（默认子目录） | 角色立绘与相关 PNG 缓存根（路径受 `characterPortraitCacheDir` 控制；内部按书名再分子目录） |

### `localStorage` 与 `file.meta` 中的 AI 相关键

- **`colorTxt.ui.settings`**：**`aiSkillsEnabled`**、**`aiSkillOverrides`**、**`aiCustomSkills`**、**`aiAssistantDeepThinking`**、**`aiAssistantSpoilerSafe`**；**`characterPortraitCacheDir`**（空串表示使用默认 `userData/CharacterPortrait`）；**`characterCardTextureEffect`**（角色卡闪卡纹理 id，默认 **`soft`**，见 **「角色卡 3D 倾斜与闪卡纹理」**）。其余界面与阅读字段仍见「数据存储说明」中的 `PersistedSettingsData` / `cacheStore.ts`。
- **`colorTxt.file.meta`**：**`characterRoster`**、**`characterBookStyle`**（类型见 `@shared/characterTypes`），与书签、阅读进度、电子书转换路径等字段并列，详见 `FileMetaRecord` / `fileMetaStore.ts`。

### 主要 Vue 组件（AI / 角色与相关设置）

表格单元格内换行使用 HTML `<br>`。

| 文件 | 主要功能 |
| ---- | -------- |
| `ReaderSidebar.vue` | 侧栏容器：活动栏含 **AI 助手**、**角色** 等（`constants/readerSidebarTab.ts`）。<br>挂载 **`AiAssistantPanel`**、**`CharacterSidebarPanel`** 等；**角色 → 更多 → 卡片效果** 子菜单（`CHARACTER_CARD_TEXTURE_EFFECTS`、分隔线、`AppShellMenuTeleport`）；`v-model:character-card-texture-effect` 与 `App.vue` 同步 |
| `SettingsPanel.vue` | 设置壳层：确定时校验向量维度、**数据/模型缓存目录迁移**、`configSet` 与 `emit('apply')`；「清除缓存」见数据存储章 |
| `SettingsTabBar.vue` | 页签含 `ai` / `vectorModel` / `txt2img` / `skills`。<br>`showAiExtensionTabs` 为 false 时隐藏向量模型 / 角色卡 / 技能扩展页签 |
| `SettingsAIPanel.vue` | 「AI 阅读助手」：总开关；服务商 + 地址；API Key + **测试连接**；模型 / 温度；Token 与 **`aiDataCacheDir`** |
| `ApiEndpointInput.vue` | 接口地址手填输入框 |
| `AiTokenUsageBanner.vue` | Token 消耗与花费展示条（阅读助手、角色检索共用） |
| `AiIndexProgressBanner.vue` | 向量建索引进度条（阅读助手建索引、角色检索前补索引） |
| `SettingsVectorModelPanel.vue` | 「向量模型」：内置/远程；远程含 **测试连接** + 嵌入模型（建议+手输）；切块与 **`ragTopK`** |
| `SettingsTxt2ImgPanel.vue` | 「角色卡」：服务商 + 地址；云端 Key/**测试连接**/模型建议/固定尺寸；OpenAI 画质；A1111/Comfy 参数；**立绘缓存目录** |
| `AppConnectionTestButton.vue` | 设置页共用测试连接按钮（`useConnectionTest`） |
| `SettingsSkillsPanel.vue` | 「技能」：内置技能开关与覆盖、自定义技能列表；footer「添加技能」打开 **`SettingsSkillEditModal`** |
| `SettingsSkillEditModal.vue` | 自定义技能新建/编辑弹窗 |
| `AppPullFlashButton.vue` | 设置面板内刷新模型/采样器列表等，完成态闪光反馈 |
| `PathPickerInput.vue` | 目录选择（含 **角色立绘缓存根目录** 等） |
| `AiAssistantPanel.vue` | 侧栏 AI 阅读助手主面板：会话、输入、`onAgentEvent`（流式增量、工具、`token_usage_*`、`done`/`error`）；**`findLiveAgentAssistant`**；受 **`showTokenUsage`** 控制 Token 条 |
| `AiAssistantChatMessages.vue` | 消息列表：用户/助手气泡、思考块、工具折叠；**`AiTokenUsageBanner`**（预估/实际） |
| `AiAssistantDetailsFold.vue` | 助手详情折叠（与 `directives/aiStickScroll`、`useAiFoldContentSelectAll` 配合） |
| `AiToolFoldBody.vue` | 工具折叠正文；超长章压缩进度中 **`当前进度：M/N`** 高亮（`utils/aiToolFoldBody.ts`） |
| `AiMarkdown.vue` | 助手回复 Markdown（`aiMarkdownMarkedSetup` / `Prep`、`aiMarkdownChapterRef`） |
| `CharacterSidebarPanel.vue` | 侧栏「角色」：角色卡网格、**`popoverCardId`** 原位放大、**AI 检索**、**立绘生成**弹窗（2:3、底对齐按钮、关闭时保存文案）；下发 **`characterCardTextureEffect`**；**`aiConfigSyncNonce`** 同步文生图 UI |
| `CharacterRosterCard.vue` | 角色卡（2:3、3D 翻转、全息层、倾斜、原位放大）；背面滚动边界不带动外层列表 |
| `AppShellMenuTeleport.vue` | 侧栏 Teleport 菜单壳（卡片效果 flyout 等） |

### 源码与 IPC 速查

主进程 **`registerAiIpc.ts`** 集中注册 `ai:*` IPC（含 **`ai:embedding:builtin:*`** 列表/状态/下载/清缓存、**`ai:migrateDataCacheRoot`** / **`ai:migrateBuiltinModelCacheRoot`**）；**`aiPaths.ts`**、**`aiDataFs.ts`**、**`aiConfig.ts`**、**`aiVectorDb.ts`**、**`aiEmbedding.ts`**、**`embedding/*`**、**`aiChat.ts`**、**`aiAgentChat.ts`**、**`aiChatThinking.ts`** 等见 **「开发」** 目录树与 **「内置向量模型与缓存目录」**；渲染侧 **`ai/buildBookVectorIndex.ts`**、**`ai/embeddingReady.ts`**、**`shared/builtinEmbeddingModels.ts`**。预加载 **`window.colorTxt.ai.*`**（含 **`embeddingBuiltinLoad`**、**`migrateDataCacheRoot`** 等）见 **「`src/preload/index.ts`（预加载）」**。

角色卡倾斜/放大/纹理（无独立 IPC）：**`@shared/characterCardTextureEffects`**、**`composables/useCharacterCardTilt.ts`**、**`composables/useCharacterCardPopoverZoom.ts`**、**`utils/characterCardSpring.ts`**、**`styles/characterCardHolo*.css`**、**`components/CharacterRosterCard.vue`**；见 **「角色卡 3D 倾斜与闪卡纹理」**。

## 数据存储说明

应用数据分两类：**渲染进程**使用 Chromium 的 **`localStorage`**（与站点同源隔离，键名定义见 `src/renderer/src/constants/appUi.ts`）；**主进程**将窗口大小与位置写入 **`userData` 目录下的 JSON 文件**（见 `src/main/windowBounds.ts`）。**AI、向量库、角色立绘** 等与阅读助手相关的数据路径与键名另见 **「AI 阅读助手与相关能力」**。

### 渲染进程 `localStorage`

| 键名                    | 大致内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `colorTxt.ui.settings`  | 界面与阅读偏好：字体、字号与行高倍数，空行压缩/行首缩进、**`readerEditShowLineNumbers`**、**`readerEditMinimap`**、**`editAutoRefreshChapterList`**、高级换行、内容着色，**`monacoCustomHighlight`**，**Monaco 平滑滚动 `monacoSmoothScrolling`**，**`highlightColorsLight` / `highlightColorsDark`**（长度不足 `MIN_HIGHLIGHT_COLORS` 时解析失败则回退默认；与默认逐项相同可不写入），章节匹配规则、主题、侧栏是否展开，侧栏宽度、章节字数显示，启动是否恢复会话、最近文件条数上限、全屏正文区宽度，**`ebookConvertOutputDir`**（空串表示与源书同目录；首次无该键时默认 **`userData/ConvertedTxt`**），**`fileCategory`**、**`fileSort`**、**`fileCategoryCatalog`**，**可选 `shortcutBindings`**，**`readerPaletteOverridesLight` / `readerPaletteOverridesDark`** 等。**AI 与立绘缓存相关字段**（`aiSkillsEnabled`、`aiSkillOverrides`、`aiCustomSkills`、`aiAssistantDeepThinking`、`aiAssistantSpoilerSafe`、`characterPortraitCacheDir`、**`characterCardTextureEffect`** 等）见 **「AI 阅读助手与相关能力」** →「`localStorage` 与 `file.meta` 中的 AI 相关键」。完整字段见 `PersistedSettingsData` / `cacheStore.ts`。 |
| `colorTxt.session`      | 会话快照：当前文件路径、视口底部物理行号（`viewportBottomLine`，用于下次启动恢复阅读位置；是否恢复受设置项控制；章节列表在重新打开文件后由流式解析生成）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `colorTxt.file.list`    | 导入目录后的文件列表缓存：每项为 `TxtFileItem`（`path`、`name`、`size`，可选 **`category`**、**`addedAt`**）；与侧栏分类筛选、排序及 `fileListService` 规范化一致                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `colorTxt.file.meta`    | 按文件路径聚合的元数据：书签、阅读进度百分比、**Monaco `saveViewState()`**（`editorViewState`）、**`viewportTopPhysicalLine`**、**`highlightWordsByIndex`**；**电子书**：**`convertedTxtPath`**、**`sourceMtimeMsAtConvert`**。**角色侧栏相关字段**（`characterRoster`、`characterBookStyle` 等）见 **「AI 阅读助手与相关能力」** →「`localStorage` 与 `file.meta` 中的 AI 相关键」。其它字段见 `FileMetaRecord` / `fileMetaStore.ts`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `colorTxt.recent.files` | 最近打开记录：JSON 数组，每项**仅允许** `{ "path": "<文件路径>" }` 单键对象（MRU 顺序）；条数上限由设置决定（0～1000，默认 20，0 表示不记录）。阅读进度与视口恢复一律查 `colorTxt.file.meta`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

阅读进度口径说明：

- **展示口径（底栏 / 侧栏当前文件 /「更多-最近打开」当前文件）**：共用同一份运行时实时进度，基于编辑器视觉滚动位置（`scrollTop / maxScrollTop`）计算；到达底部时展示为 `100%`，并作为颜色切换为 `--success` 的依据。
- **恢复口径（重新打开同一文件）**：仅当 `file.meta` 中同时存在有效的 **`editorViewState`** 与 **`viewportTopPhysicalLine`** 时，在流结束且模型就绪后调用 Monaco `restoreViewState` 并做锚点校验；否则从**文首**打开（无单独行号兜底）。读入 meta 时若仅有 `editorViewState` 而无锚点，会丢弃该视图状态字段。
- **压缩空行与锚点兜底**：与 `editorViewState` 同时持久化 **`viewportTopPhysicalLine`**（保存时刻视口首行对应的源文件物理行号）。`restoreViewState` 后的 `nextTick` 内用 `getViewportTopLine` + `viewportDisplayLineToPhysicalLine` 校验当前首行物理行是否一致；不一致则按该物理行映射为显示行并 **`jumpToLine`**（使该行靠近视口顶部），避免仅依赖 Monaco 视图状态在滤空映射变化时出现错位。
- **恢复口径（重载当前正文 / 显式物理行）**：切换压缩空行、行首缩进、改动「保留一个空行」、应用章节匹配规则等触发**同路径重开**时，使用 `openFilePath(..., { restorePhysicalLine })`：取**视口末行**经 `viewportDisplayLineToPhysicalLine` 得到物理行，流结束后仍走 `scrollLineToBottom` 显示行对齐（与视图状态恢复互斥）。
- **启动会话（`colorTxt.session`）**：若该路径在 `file.meta` 中已有 `editorViewState`，启动恢复时优先用它；否则仍可用会话快照中的视口物理行作为后备（与 meta 独立）。
- **历史记录字段**：`progress` 与 `editorViewState` 均在 `file.meta` 持久化；`colorTxt.recent.files` 不存进度。当前打开文件的展示进度以运行时实时值为准。
- **阅读位置就绪标志（`readingProgressSynced`，`App.vue` ref）**：
    - 无打开文件时为 `true`；每次 `resetSession`（打开/重开某路径）后为 `false`。
    - `file:stream-end` 处理中，在「完成滚动到恢复行 / 滚到底 / 或无需恢复仅 `emitProbeLine`」对应的 `requestAnimationFrame` + `nextTick` 之后再置为 `true`；`file:stream-error` 与「关闭当前文件」流程中也会恢复为 `true`（避免永久卡死写盘路径）。
    - 该标志表示「末行/进度是否已与视口对齐」，**不是**仅表示 `loading === false`（流结束到滚动完成之间仍可能为 `false`）。

**内存与快速重开（防进度被顶行污染）**：

- **阅读器 probe 与 `touchRecentFile` 解耦**：`useAppChapterNavigation.onProbeLineChange` 仍会更新 `lastProbeLine`、当前章高亮等；仅在 `readingProgressSynced === true` 时才调用 `touchRecentFile`（`updateMeta: false`），从而在加载与滚动恢复完成前**不**用视口行号写内存中的 `recentFiles` / meta。流结束分支在 `markReadingProgressSynced` 之后补发一次 `emitProbeLine`，使首帧即与恢复后的视口对齐。
- **`rememberCurrentFileLine`**：在 `!readingProgressSynced` 时直接返回；否则 `touchRecentFile`（含当前 `saveViewState` 快照与进度）并 **`persistRecent` + `persistMeta`**，切书时把上一本书的 meta 写回内存与磁盘（`persistFileMeta` 仍受 `readingProgressSynced` 门控）。

**阅读进度：恢复 → 内存 → 存盘（无重复解析）**：

1. **恢复**：`openFilePath(path)` 从 `getFileMeta(path).editorViewState` 设置 `pendingRestoreEditorViewState`（无则不从文首以外恢复）。显式 `options.restoreLine` / `restorePhysicalLine` 时清空视图状态待恢复并走物理行链路。
2. **打开时写 recent 盘**：`resetSession` 后 `touchRecentFile(path, true, { persistRecent: true, updateMeta: false })` 仅把路径顶到 MRU 并 `persistRecentFiles`，**不**在此时改写 meta（避免覆盖尚未加载完成的状态）。
3. **滚动中**：仅 `readingProgressSynced` 后 `onProbeLineChange` 才 `touchRecentFile`（`updateMeta: false`），在内存中更新该路径的 `progress` + `editorViewState`，不写盘，关窗时 `flushRecentFilesAndFileMetaToDisk` 补齐。
4. **会话**：`persistReadingSessionSnapshot` 单独写 `colorTxt.session`（视口物理行），与 meta/recent 独立；若 meta 已有视图状态，启动恢复优先 meta。

**落盘时机（与 `useAppPersistence` 一致）**：

- `colorTxt.ui.settings` 在顶栏/侧栏偏好变更时即时写入（设置弹窗在点「确定」后才会写入）。
- `colorTxt.session` 仅在窗口卸载相关路径与 `persistWindowUnloadState` 一并写入。
- `colorTxt.file.list` 在列表清空、移除项、选择目录合并、从会话恢复列表等变更时写入。
- `colorTxt.file.meta`：在离开当前文件（切书前的 `remember`、关闭当前文件）或窗口卸载等路径上会调用 `persistFileMeta`；**仅当「当前无打开文件」或 `readingProgressSynced === true` 时才会真正写入 localStorage**，否则跳过写盘，保留磁盘上上一份可靠数据。书签的增删改只先改内存，随上述路径落盘。
- `colorTxt.recent.files` 在打开新书（`persistRecent: true`）、切书前 `rememberCurrentFileLine`（同上）、以及窗口卸载 `flush` 时写入；条目仅为 `{ path }`。滚动阅读不修改 recent 顺序，仅改 meta 内存直至落盘。

### 清除缓存（设置 → 常规）

- **作用**：在 **「常规」** 页点击 **「清除缓存」**，经 **`window.colorTxt.showMessageBox`** 原生确认后，仅保留 **`colorTxt.ui.settings`**，删除 **`colorTxt.session`**、**`colorTxt.file.list`**、**`colorTxt.recent.files`**、**`colorTxt.file.meta`** 等其余键，然后 **`window.location.reload()`**。
- **为何需要 `sessionStorage` 标记**：
    - 窗口在 `pagehide` / `beforeunload` 时会调用 `persistWindowUnloadState()`，把内存中的会话、文件列表、最近打开和 meta 写回磁盘。
    - 若在 `localStorage.clear()` 之后直接刷新，卸载事件仍会执行，**会把清缓存前的内存状态再次写入**，导致「清不干净」。
    - 实现：清存储前设置 **`sessionStorage`** 键 **`colorTxt.skipUnloadPersistence`**（`skipUnloadPersistenceSessionKey`，定义于 `constants/appUi.ts`），使 **`persistWindowUnloadState()`** 在卸载时**直接返回**，不写会话/列表/meta；卸载流程里仍会 **`persistSettings()`**，只更新 `colorTxt.ui.settings`，与「仅保留界面设置」一致。
- **新页加载**：`useAppPersistence` 的 **`initPersistenceBootstrap()`** 开头会 **`removeItem`** 清除上述标记，避免后续正常关窗时误跳过落盘。

### 「重置当前页」与历史上的全量恢复默认

- **当前 UI**：设置弹窗 footer **「重置当前页」** 仅将**当前 tab** 内的草稿恢复为代码中的默认值（如常规页恢复启动选项/电子书目录/章节字数等；阅读页恢复字号行高/平滑滚动等；**AI 阅读助手** 页另重置 **`tokenPricePerMillion`**、**`showTokenUsage`**、**`aiDataCacheDir`** 默认路径等，见 `SettingsPanel.resetAiDraft`；**向量模型** 页见 `resetVectorModelDraft`，恢复内置/远程默认与 **`builtinModelCacheDir`**），**不会自动落盘**——仍需点 **「确定」** 才会 `emit('apply')` 并持久化（AI 部分另走 `window.colorTxt.ai.configSet`）。
- **`skipSettingsPersistenceSessionKey`**：`useAppPersistence` 仍保留该 `sessionStorage` 门闩：若将来或脚本在**删除** `colorTxt.ui.settings` 后立刻刷新，应在刷新前写入该键为 `"1"`，否则 `beforeunload` 里的 **`persistSettings()`** 会把内存中的旧 UI 设置写回，抵消删除操作。`initPersistenceBootstrap()` 启动时会清除该键与 `skipUnloadPersistenceSessionKey`。

### 主进程用户数据目录

`userData` 下与 **AI、角色立绘** 相关的文件与目录见 **「AI 阅读助手与相关能力」** →「`userData` 中的 AI 相关路径」。

| 文件                                                   | 说明                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `window-bounds.json`（位于 `app.getPath("userData")`） | 保存普通窗口态下的位置与尺寸；全屏/最大化/最小化时不会写入                                 |
| `ConvertedTxt/`（默认子目录）                          | 电子书转换得到的 `.txt` 缓存（路径受 `ebookConvertOutputDir` 控制）                        |

## 预设字体与平台映射

预设项与 CSS `font-family` 栈定义在 `src/renderer/src/utils/presetFontDefinitions.ts`。菜单中的**显示名**与**实际族名**均随当前平台切换。

下表中「族名栈」为按优先级排列的字体族（前者缺失时依次回退）。

| 类型             | macOS      | Windows    | Linux 等   | 族名栈（macOS / Windows / Linux）                                                                                          |
| ---------------- | ---------- | ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| 内置字体         | 京華老宋体 | 京華老宋体 | 京華老宋体 | 均为 `KingHwa OldSong`（应用内置字体文件）                                                                                 |
| 黑体 / UI 无衬线 | 苹方-简    | 微软雅黑   | 思源黑体   | `PingFang SC` → `Hiragino Sans GB` / `Microsoft YaHei` / `Noto Sans CJK SC` → `WenQuanYi Micro Hei` → `Source Han Sans SC` |
| 宋体 / 明体      | 宋体-简    | 宋体       | 思源宋体   | `Songti SC` → `STSong` / `SimSun` / `Noto Serif CJK SC` → `Source Han Serif SC`                                            |
| 楷体             | 楷体-简    | 楷体       | 文鼎 UKai  | `Kaiti SC` → `STKaiti` / `KaiTi` / `AR PL UKai CN` → `Noto Serif CJK SC`                                                   |

说明：

- 名称中的「**-简**」表示对应 **简体中文（SC）** 字体族，与 macOS 字体册中常见命名一致；并非「只能显示简体字」，而是字形与排版习惯面向简体场景。
- **Linux** 等环境需自行安装常见中文字体包（如 Noto CJK、文泉驿、文鼎 UKai 等），否则可能回退到栈中后续族名或系统默认字体。
