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

使用 `vue-tsc --noEmit`；根 `tsconfig.json` 启用了 `noUnusedLocals` / `noUnusedParameters`。

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
- Windows：`nsis`
- Linux：`AppImage`

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

### 项目结构

仓库根目录常用目录与文件：

| 目录 / 文件               | 说明                                                               |
| ------------------------- | ------------------------------------------------------------------ |
| `src/`                    | 应用源码（主进程、预加载、渲染进程）                               |
| `resources/`              | 打包资源（应用图标等）                                             |
| `dist/`                   | `electron-vite build` 编译输出，供 `electron-builder` 打入安装包   |
| `release/`                | `electron-builder` 最终产物输出目录                                |
| `images/`                 | 文档用截图等（不参与应用打包逻辑）                                 |
| `package.json`            | npm 脚本与依赖；`electron-builder` 打包/发布相关配置也在此         |
| `vite.config.ts`          | 供编辑器 / 工具链用的 Vite 占位配置；实际构建以 electron-vite 为准 |
| `electron.vite.config.ts` | electron-vite 配置：主进程 / preload / 渲染进程与 Monaco 插件      |

#### `src/` 总览

```text
src/
├── main/
│   ├── index.ts              # Electron 主进程入口：组装窗口工厂 / IPC / 单实例与启动参数
│   ├── ipcHandlers.ts        # 主进程 IPC：对话框、目录扫描、流式读文件、字体列表、主题同步等
│   ├── launchTxtHandlers.ts  # 单实例锁、命令行 / 系统关联打开 txt、向窗口广播打开路径
│   ├── windowFactory.ts      # BrowserWindow 创建：加载页面、全屏/DevTools、窗口边界持久化钩子
│   ├── windowBounds.ts       # 窗口位置与大小：读取/校验/保存到 userData
│   ├── globalShortcuts.ts    # 主进程系统级全局快捷键集中注册（退出时统一注销）
│   ├── updater.ts            # electron-updater：自更新与相关 IPC
│   └── updaterMessages.ts    # 更新错误码 / 网络错误的中文文案映射
├── preload/
│   └── index.ts              # 预加载：向渲染进程暴露受控 API
└── renderer/
    ├── index.html            # 渲染进程 HTML 壳
    └── src/
        ├── main.ts           # Vue 应用挂载
        ├── App.vue           # 根组件：布局与全局状态串联；书钉/书签、全屏阅读区布局、阅读进度等拆至 composables；向 ReaderMain 传入阅读偏好；挂载 `AppOverlays` 等
        ├── appShell.css      # 根组件专用样式（由 `App.vue` 以 scoped 方式引入）：全屏顶/底/侧栏布局、正文区等
        ├── injectionKeys.ts  # `provide` / `inject` 用的 `InjectionKey`（如书签备注输入框 `ref`，供 `useAppBookmarkPins` 与 `AppOverlays` 对齐）
        ├── style.css         # 全局样式与主题变量
        ├── env.d.ts          # 类型声明（如静态资源、window.colorTxt）
        ├── chapter.ts        # 章节标题检测、章节匹配规则（正则）的存取与校验
        ├── icons.ts          # 各功能图标的 SVG 字符串汇总，供组件内联使用
        ├── assets/           # 内置字体、界面 SVG 图标等静态资源
        ├── components/       # Vue 界面组件（见下表）
        ├── composables/      # 根组件用组合式函数拆分职责（以下为各文件概要）
        │   ├── useAppBookmarkPins.ts      # 书钉与书签：列表项、视口内活动书签、添加/移除/跳转及书签弹窗交互
        │   ├── useAppChapterListSync.ts   # 侧栏章节/文件列表「滚到当前」的一拍状态（与 VirtualList 配合）
        │   ├── useAppChapterNavigation.ts # 章节跳转、章节规则与最近文件、侧栏标签等联动；应用章节规则后重载当前文件时以视口末行恢复阅读位置（与 `useAppReaderUiPrefs` 切换排版一致）
        │   ├── useAppFileSession.ts       # 打开文件/选目录、会话快照恢复、与流管道和持久化衔接；`resetSession` 置 `readingProgressSynced` 为 false
        │   ├── useAppFullscreenReaderLayout.ts # 全屏时正文区域宽度样式；layout 上点击左右空白聚焦编辑器；两侧空白区 `wheel` 转交 `ReaderMain.delegateEditorWheelFromBrowserEvent`，见下文「全屏正文宽度与两侧空白滚轮」）；事件来自侧栏子树时不劫持（含 Shadow DOM 向上判定）
        │   ├── useAppPersistence.ts       # 界面设置、会话快照、最近打开列表、文件元数据（书签等）的加载与保存；`persistFileMeta` 受 `readingProgressSynced` 门控；`persistWindowUnloadState` 在「清除缓存」后的刷新流程中可被 `skipUnloadPersistenceSessionKey` 跳过（见「清除缓存（设置面板）」）
        │   ├── useAppReaderChrome.ts      # 全屏阅读时顶栏/底栏/侧栏悬停显隐与侧栏宽度拖拽
        │   ├── useAppReaderUiPrefs.ts     # 字号/行高/字体、高级换行与内容着色等阅读偏好与 Monaco、持久化同步；切换压缩空行/行首缩进时重载当前文件并以视口末行映射物理行恢复（与流结束 `scrollLineToBottom` 一致）；字号增大时按字号上限夹行高倍数
        │   ├── useAppReadingProgress.ts   # 阅读进度展示模型：以视觉滚动进度为主（到底=100%），并输出 `(当前行/总行)` 文案；供底栏/侧栏/最近打开统一使用
        │   ├── useAppShellThemeWatch.ts   # 主题切换：根节点 class、编辑器主题、原生主题 IPC
        │   ├── useAppWindowBindings.ts    # 窗口挂载/卸载、可配置快捷键（`shortcutBindings`）、拖放与主进程 IPC 等绑定；`document` 上 `mousemove` 驱动全屏边缘唤起（具体逻辑在 `useAppReaderChrome`）；订阅 `file:stream-*`，在流结束并完成滚动/恢复阅读位置后置 `readingProgressSynced`；`pagehide` / `beforeunload` 时落盘会话与设置（与「清除缓存」防回写配合）
        │   ├── useReaderSidebarLists.ts   # 侧栏文件/章节/书签虚拟列表、过滤与滚动同步
        │   └── useTxtStreamPipeline.ts    # 大文件流式解析：物理行/显示行映射、章节累加、空行压缩与章节留白标准化；正文在缓冲区累积，流结束再一次性 setFullText/setChapters（见 `ipcHandlers` 小节「渲染进程与 Monaco 写入」）
        ├── constants/
        │   └── appUi.ts      # UI 常量：存储 key（含 `skipUnloadPersistenceSessionKey`）、侧栏宽度、字号/行高上下限与步进、`default*` 出厂默认（无本地设置或与 `persistKey` 字段缺失时；见下文「阅读器字号与行高」「界面与阅读偏好默认值」）
        ├── monaco/           # Monaco 阅读器扩展（与 ReaderMain 配合）
        │   ├── chapterStickyScroll.ts    # 注册折叠区与文档符号以驱动黏性章节大纲；禁用黏性条点击跳转
        │   ├── readerEditorOptions.ts    # 阅读器 `create` / `updateOptions` 的选项构建（换行、只读、查找、stickyScroll 等）
        │   ├── readerInlineDecorations.ts # 章节标题行内装饰与阅读主题配色；语法高亮开关时同步 Monarch 主题色
        │   ├── readerKeyScroll.ts        # 方向键/Page 键滚动
        │   └── txtrTextMonarch.ts        # 自定义 Monarch：`txtr-text` 语言，标点/对话/数字等着色规则
        ├── reader/
        │   ├── chapterIndex.ts   # 当前视口行号对应的章节下标（二分查找）
        │   └── lineMapping.ts    # 物理行号与「滤空后显示行」的映射工具
        ├── services/
        │   ├── fileListService.ts      # 目录选择、txt 列表合并与规范化
        │   ├── fileOpenService.ts      # 打开文件前的校验与恢复行号解析
        │   ├── physicalLineStream.ts   # 按换行切分流式块，处理跨 chunk 的不完整行
        │   ├── shortcutRegistry.ts     # 快捷键动作 ID、默认 Electron 快捷键、窗口/全局作用域
        │   ├── shortcutUtils.ts        # 快捷键规范化、物理键位解析（`code` 优先）、展示文案、冲突检测
        │   └── shortcutService.ts      # 窗口级快捷键监听：按持久化绑定匹配并派发动作
        ├── stores/
        │   ├── cacheStore.ts           # localStorage：界面设置、会话快照的读写
        │   ├── fileMetaStore.ts        # 单文件元数据：书签、末行/进度等；与 `colorTxt.file.meta` 同步
        │   └── recentHistoryStore.ts   # 最近打开文件列表的持久化与更新
        ├── utils/
        │   ├── format.ts         # 字数、文件大小等展示用格式化
        │   ├── fontFamilyCss.ts          # 字体族名转 CSS `font-family` 片段（引号与栈拼接，供字体选择等复用）
        │   ├── presetFontDefinitions.ts # 预设字体：各平台族名栈、菜单标签、与持久化字体的预设匹配（见 README「预设字体与平台映射」）
        │   └── modalStack.ts           # 弹窗层叠与 ESC 关闭顺序
        └── workers/              # Web Worker（预留目录；用于耗时任务 offload 等）
```

#### `src/main/`（主进程）

**`index.ts`**

- 组装主进程能力：`createMainWindowFactory`（窗口创建）、`registerMainIpcHandlers`（业务 IPC）、`setupLaunchTxtHandlers`（启动 txt / 单实例）。
- `app.whenReady()` 后调用 `setupAutoUpdater()`，并根据启动参数 / macOS `open-file` 队列决定首个窗口是否直接打开某个 `.txt`；并调用 `registerGlobalShortcuts()`（见 `globalShortcuts.ts`）。
- `will-quit` 时调用 `unregisterGlobalShortcuts()`，避免进程退出后仍占用系统快捷键表。
- `activate` / `window-all-closed` 等生命周期钩子（非 macOS 全关窗口退出）。

**`globalShortcuts.ts`**

- 集中注册 / 注销主进程 `globalShortcut`；后续新增系统级快捷键时在本文件扩展 `registerGlobalShortcuts` / `unregisterGlobalShortcuts` 即可。
- **全部窗口显隐**：默认 accelerator 为 **Control** + **\`（反引号键）**（`DEFAULT_TOGGLE_VISIBILITY_ACCELERATOR`；macOS 亦为 **Control** 而非 Cmd）在系统范围内触发；用户可在快捷键面板中修改，由 `setToggleVisibilityShortcut` 更新 `currentToggleVisibilityAccelerator` 并重新注册。
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

**`ipcHandlers.ts`**

- 集中注册主进程 `ipcMain`：`dialog:*`（含打开文件/目录、**清除最近打开** / **清空文件列表** / **清空书签** / **清除应用缓存** 等确认框）、`dir:listTxtFiles`（含扫描进度事件）、`file:stat`、`fonts:listSystemFonts`、`shell:*` 等。
- **快捷键**：`shortcut:getGlobalToggle`、`shortcut:validateGlobalToggle`、`shortcut:setGlobalToggle`、`shortcut:suspendForRecording`、`shortcut:resumeAfterRecording`（实现见 `globalShortcuts.ts`）。
- **流式读文件**：`file:stream` 使用 `createReadStream` + `iconv-lite` 解码，并通过 `file:stream-*` 事件向渲染进程推送数据块；编码由文件头采样 + `jschardet` 探测。每次新流会递增 `requestId` 并 `destroy` 上一轮同窗口的读流，发送 chunk 前校验序号，避免旧流残留。渲染进程在 `resetSession` 时清空与主进程对齐的 `activeStreamRequestId` / `activeStreamFilePath`，并在 `onStreamChunk` / `onStreamEnd` / `onStreamError` 中比对 `requestId`，避免快速重复打开同一文件时旧 chunk 混入已重置的解析管道。
- **渲染进程与 Monaco 写入**：主进程仍分块推送；渲染侧 `useTxtStreamPipeline` 对每个 chunk 做解析，并在**字符串缓冲区**中累积待展示正文；`onStreamEnd` 后调用 `flushCarry` 处理 EOF 与尾行，再一次性通过 `ReaderMain` 的 **`setFullText`** 写入 Monaco 模型，随后 **`setChapters`**（开启行首全角缩进时再 **`normalizeLastLineLeadIndent`**）。加载过程中阅读区可保持空白，底栏进度仍由各 chunk 的 `readBytes` / `totalBytes` 驱动。
- 目录递归收集 `.txt`：迭代遍历 + `realpath` 去重，避免符号链接成环导致栈溢出。
- 窗口相关：`window:new`、`window:setTitle`、`window:setFullscreen`、`theme:set`（同步原生主题并广播 `theme:sync`）、以及会话恢复 / 待打开 txt 的一次性消费等。

**`launchTxtHandlers.ts`**

- `app.requestSingleInstanceLock()`：第二实例会把待打开的 `.txt` 路径转发给已运行实例，并聚焦窗口。
- 解析启动参数中的 `.txt` 路径；macOS 额外处理 `open-file` 事件（启动阶段先入队，就绪后再打开）。

**`windowFactory.ts`**

- 创建 `BrowserWindow`：加载开发环境 `ELECTRON_RENDERER_URL` 或打包后的 `renderer/index.html`。
- 处理 `ready-to-show`、全屏切换事件广播、开发环境 DevTools 快捷键拦截等。
- 维护“首个窗口是否应恢复会话 / 是否有待打开 txt”等窗口级状态，并在窗口关闭时清理。
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
- 文件对话框与目录扫描（含扫描进度订阅）、`file:stat`、流式读文件事件（`file:stream-*`）、外链与系统字体列表等。
- 破坏性操作前的确认：`confirmClearRecentFiles`、`confirmClearFileList`、`confirmClearBookmarks`、`confirmClearAppCache`（对应主进程 `dialog:confirmClear*`）。
- 窗口与系统集成：`openNewWindow`、`toggleDevTools`、`quitApp`、`setWindowTitle`、`setFullscreen`，以及全屏/主题相关事件（如 `onFullscreenChanged`、`onThemeSync`）。
- 会话与启动打开：`shouldRestoreSession`、`consumePendingOpenTxtPath`，以及 `onOpenTxtFromShell`（命令行/系统关联打开 txt 的路径回调）。
- **应用更新**：`checkForUpdates` / `downloadUpdate` / `quitAndInstall` 及 `onUpdater*` 事件订阅（含 `onUpdaterDownloadProgress`；打包环境下生效）。
- 拖放文件真实路径（`getPathForFile`）。
- **全局快捷键（显隐）**：`getGlobalShortcut`、`validateGlobalShortcut`、`setGlobalShortcut`、`suspendGlobalShortcutsForRecording`、`resumeGlobalShortcutsAfterRecording`（对应主进程 `shortcut:*` IPC）。

#### `src/renderer/src/components/`（主要 Vue 组件）

| 文件                                                 | 主要功能                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AppHeader.vue`                                      | 顶栏：打开文件、书钉/书签、字体与字号行高、压缩空行/行首缩进、**高级换行策略**（Monaco `wrappingStrategy: advanced`）、内容上色、章节规则、主题、侧栏与全屏、查找与更多菜单等                                                                                                                                                                                                                                                                                                                                                                 |
| `AppOverlays.vue`                                    | 蒙层弹窗：关于、快捷键、设置、章节规则、书签与更新流等                                                                                                                                                                                                                                                                                                                                                                                  |
| `AppContextMenu.vue`                                 | 通用右键菜单                                                                                                                                                                                                                                                                                                                                                                               |
| `AppFooter.vue`                                      | 底栏：当前路径、加载进度、阅读进度、字数、文件大小、编码                                                                                                                                                                                                                                                                                                                                   |
| `ReaderMain.vue`                                     | 阅读区：挂载编辑器与业务逻辑；编辑器静态选项集中在 `monaco/readerEditorOptions.ts`；章节行内装饰；查找、滚动与 probe；全屏两侧空白滚轮经父组件调用 **`delegateEditorWheelFromBrowserEvent`**（Monaco **`delegateScrollFromMouseWheelEvent`**）；键盘/翻页仍用 **`scrollByDeltaY`** 等；流式打开文件时在 `flushCarry` 末尾 **`setFullText`** 一次性灌入正文（保留 `appendText` 供其它场景） |
| `ReaderSidebar.vue`                                  | 侧栏容器：文件 / 章节 / 书签标签；挂载 `FileListPanel`、`ChapterListPanel`、`BookmarkListPanel`；与 `useReaderSidebarLists` 等配合                                                                                                                                                                                                                                                         |
| `FileListPanel.vue`                                  | 侧栏「文件」：txt 文件列表、过滤                                                                                                                                                                                                                                                                                                                                                           |
| `ChapterListPanel.vue`                               | 侧栏「章节」：章节列表、字数开关、跳转当前章                                                                                                                                                                                                                                                                                                                                               |
| `BookmarkListPanel.vue`                              | 侧栏「书签」：书签列表、跳转、编辑与清除                                                                                                                                                                                                                                                                                                                                                   |
| `FontPicker.vue`                                     | 预设字体（跨平台映射，逻辑见 `presetFontDefinitions.ts`）与系统字体列表                                                                                                                                                                                                                                                                                                                    |
| `ChapterRulePanel.vue` / `ChapterRuleEditDialog.vue` | 章节匹配规则列表与编辑                                                                                                                                                                                                                                                                                                                                                                     |
| `MoreMenu.vue`                                       | 更多菜单：最近文件、查找、快捷键、设置、检查更新、关于、退出等                                                                                                                                                                                                                                                                                                                             |
| `SettingsPanel.vue`                                  | 设置弹窗：启动恢复会话、历史条数、字号/行高、压缩空行保留一行、全屏正文区宽度等（**高级换行策略**仅在顶栏切换，见 `AppHeader.vue`）；确定后与 `App.vue` 持久化并同步阅读器；**footer 左侧「清除缓存」**（主进程确认框）清空除 `colorTxt.ui.settings` 外的其它 `localStorage` 数据并刷新窗口（见下文「清除缓存」）                                                                                                                   |
| `NumericInput.vue`                                   | 通用数字输入：可选 `min` / `max`、整数模式                                                                                                                                                                                                                                                                                                                                                 |
| `RangeSlider.vue`                                    | 通用范围滑块（最小/最大值与步进）                                                                                                                                                                                                                                                                                                                                                          |
| `SwitchToggle.vue`                                   | 通用开关控件                                                                                                                                                                                                                                                                                                                                                                               |
| `ShortcutPanel.vue`                                  | 快捷键列表与编辑：表格展示、点击录制、Enter 确认、冲突提示、全局热键校验；录制区为不可编辑聚焦区 + 闪烁光标，避免 IME 上屏                                                                                                                                                                                                                                                                 |
| `AboutPanel.vue`                                     | 关于面板                                                                                                                                                                                                                                                                                                                                                                                   |
| `AppModal.vue`                                       | 通用模态框（与 `modalStack` 配合）                                                                                                                                                                                                                                                                                                                                                         |
| `AppUpdateFlow.vue`                                  | 自更新：检查/下载/安装进度、相关弹窗与 `electron-updater` 事件订阅                                                                                                                                                                                                                                                                                                                         |
| `IconButton.vue`                                     | 图标按钮                                                                                                                                                                                                                                                                                                                                                                                   |
| `VirtualList.vue`                                    | 虚拟列表（长列表性能）                                                                                                                                                                                                                                                                                                                                                                     |

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

全屏时 `AppHeader` 传入 `inFullscreen`；**「切换侧栏」**图标按钮使用 `v-if="!inFullscreen"` 隐藏，避免与左缘感应侧栏重复。

### 全屏正文宽度与两侧空白滚轮

- **宽度**：设置里的「全屏正文区宽度」对应 `fullscreenReaderWidthPercent`，由 `useAppFullscreenReaderLayout` 的 `fullscreenReaderPaneStyle` 在全屏时给 `readerPaneWrap` 设 `width` / `maxWidth`（百分比）与水平 `auto` 外边距，使正文区在 `.layout` 内水平居中；两侧露出与正文同背景的空白。
- **滚轮**：空白区不在 Monaco 视图 DOM 上，原生 wheel 不会进入编辑器。`App.vue` 在 **`.layout`** 上监听 **`@wheel`**，由 `useAppFullscreenReaderLayout.onLayoutWheel` 判断指针是否落在 `readerPaneWrap` 矩形**之外**（左右空白）；若是且事件与全屏侧栏无关，则调用 `ReaderMain` 暴露的 **`delegateEditorWheelFromBrowserEvent(ev)`**，内部对编辑器实例调用运行时的 **`delegateScrollFromMouseWheelEvent`**（`CodeEditorWidget` 方法，未写入 `monaco` 的 `.d.ts`，但随 `monaco.editor.create` 实例存在），与在正文内触控板/滚轮走**同一条** Monaco 内部滚动逻辑，避免与内部手感不一致。
- **`preventDefault` 顺序**：Monaco 可滚动层在 `_onMouseWheel` 开头若发现 **`ev.defaultPrevented` 已为 true 会直接 return**。因此 **`delegateEditorWheelFromBrowserEvent` 必须在 `preventDefault` 之前调用**；委托完成后再对布局层 `preventDefault()`，避免页面/外层默认滚动。侧栏内滚动仍通过 `composedPath` / `elementFromPoint` 与 Shadow DOM 向上判定排除，避免误劫持。
- **其它滚动**：键盘方向键、PageUp/PageDown 等仍由 `ReaderMain` 的 **`scrollByDeltaY` / `scrollByLineStep` / `scrollByPageStep`** 等驱动，与上述空白区 wheel 委托无关。
- **样式**：全屏时 Monaco 纵向滚动条与概览尺通过 `appShell.css` 固定到视口最右侧（`.app.fullscreen` 下对 `.readerPane` 内对应节点 `position: fixed`），与窄正文居中并存。

## 阅读器字号与行高

实现集中在 `src/renderer/src/constants/appUi.ts` 与 `src/renderer/src/monaco/readerEditorOptions.ts`（`readerEditorLineHeight`）。

- **字号**：`minFontSize`～`maxFontSize`（整数 px），顶栏加减、快捷键与设置面板滑块共用同一状态。
- **行高倍数**：最小为 `minLineHeightMultiple`，步进 `lineHeightMultipleStep`（如 0.1）。**最大倍数随当前字号自动计算**：Monaco 将编辑器的 `lineHeight` 限制在约 `monacoMaxLineHeightPx`（150）像素量级；应用内传给 Monaco 的行高由 `readerEditorLineHeight(字号, 倍数)` 得到（`Math.max(1, Math.round(字号 × 倍数))`）。因此使用 `maxLineHeightMultipleForFontSize(字号)` 得到该字号下允许的倍数上限；持久化加载与设置「确定」时用 `clampLineHeightMultipleForFontSize` 将倍数夹到合法区间。
- **设置面板**：字号、行高均为滑块；行高滑块的上限随草稿字号变化；拖动字号若导致当前行高超限时，会自动下调行高草稿。
- **仅加大字号**（快捷键 / 顶栏）：若当前行高倍数在新字号下超限，会自动下调倍数并写回阅读器与持久化。

## 界面与阅读偏好默认值

首次运行或 `localStorage` 中尚无 `colorTxt.ui.settings`、或某字段未写入时，渲染进程使用 `src/renderer/src/constants/appUi.ts` 里以 `default` 前缀命名的常量作为初始值（主题、侧栏展开、语法着色、**压缩空行** / **保留一个空行** / **行首缩进**、章节字数、字号与行高倍数、启动恢复会话、Monaco 高级换行等）。`App.vue` 中对应 `ref` 引用这些常量；`ReaderMain.vue` 的 `withDefaults` 在未由父组件传入时与压缩空行、语法着色、高级换行、内部行高初值保持一致。已存在本地设置时仍以持久化数据为准。

## 快捷键

- **动作与默认值**：`src/renderer/src/services/shortcutRegistry.ts` 定义动作 ID、说明、`scope`（`window` 窗口内 / `global` 系统级）及默认 Electron 快捷键字符串。
- **持久化**：用户覆盖保存在 `colorTxt.ui.settings` 的 `shortcutBindings`（见 `stores/cacheStore.ts` 与 `useAppPersistence`）；加载时与默认表合并、规范化（`shortcutUtils.mergeShortcutBindings`）。
- **还原默认**：`ShortcutPanel` 中「全部还原默认」将 `shortcutRegistry` 的默认表写回并持久化（与 `App.vue` / `useAppPersistence` 联动）。
- **冲突与校验**：多个窗口级动作绑定同一快捷键时，由 `shortcutUtils.collectShortcutConflicts` 在确认前提示；**全局显隐**另须经主进程 `validateGlobalShortcut`（临时 `globalShortcut.register` 探测系统是否允许）。
- **窗口级**：`shortcutService.ts` 在 `window` 上监听 `keydown`，将事件转为规范化快捷键并与当前 `ShortcutBindingMap` 比较；`useAppWindowBindings` 注入 `shortcutBindings` ref，并在有模态层时跳过（与 `modalStack` 配合）。
- **全局级（仅「全部窗口显隐」）**：主进程 `globalShortcuts.ts` 注册 `globalShortcut`；渲染进程保存或校验时通过 `window.colorTxt.validateGlobalShortcut` / `setGlobalShortcut`（IPC 名 `shortcut:validateGlobalToggle` / `shortcut:setGlobalToggle`）与主进程同步；详见上文 **`globalShortcuts.ts`**。
- **录制与 IME**：编辑弹层打开时主进程 `suspendGlobalShortcutsForRecording`，关闭时 `resume`，避免录制时触发已注册的全局热键。录制界面不用 `<input>`，而用可聚焦的 `div` 只展示规范化快捷键，并加 CSS 闪烁光标；`shortcutUtils.keyboardEventToAccelerator` 优先用 **`KeyboardEvent.code`**（物理键位）解析主键，在 `code === 'Unidentified'` 等情况下回退 **`keyCode`**，最后才用 `key`；避免 `Ctrl+Shift+2` 被显示成 `Shift+@`、并忽略 `Process` / `Dead` / `Unidentified` 与 `isComposing` 等与 IME 相关的无效键。

## 数据存储说明

应用数据分两类：**渲染进程**使用 Chromium 的 **`localStorage`**（与站点同源隔离，键名定义见 `src/renderer/src/constants/appUi.ts`）；**主进程**将窗口大小与位置写入 **`userData` 目录下的 JSON 文件**（见 `src/main/windowBounds.ts`）。

### 渲染进程 `localStorage`

| 键名                     | 大致内容                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `colorTxt.ui.settings`  | 界面与阅读偏好：字体、字号与行高倍数，空行压缩/行首缩进、高级换行、内容着色，章节匹配规则、主题、侧栏是否展开，侧栏的宽度、章节字数显示，设置里的启动是否恢复会话、最近文件条数上限、全屏正文区宽度，**可选字段 `shortcutBindings`**（各快捷键动作 ID → 快捷键字符串，缺省则使用 `shortcutRegistry` 默认）等（结构见 `PersistedSettingsData`） |
| `colorTxt.session`      | 会话快照：当前文件路径、视口底部物理行号（`viewportBottomLine`，用于下次启动恢复阅读位置；是否恢复受设置项控制；章节列表在重新打开文件后由流式解析生成）                                                                                                                                                                                       |
| `colorTxt.file.list`    | 导入目录后的 txt 文件列表缓存（路径、显示名、大小等）                                                                                                                                                                                                                                                                                          |
| `colorTxt.file.meta`    | 按文件路径聚合的元数据：书签、阅读进度百分比、**Monaco `saveViewState()` 序列化结果**（`editorViewState`）、**视口首行物理行号**（`viewportTopPhysicalLine`，与视图状态同时写入，用于压缩空行映射校验）、`updatedAt` 等（结构见 `FileMetaRecord` / `fileMetaStore.ts`）                                                                        |
| `colorTxt.recent.files` | 最近打开记录：JSON 数组，每项**仅允许** `{ "path": "<文件路径>" }` 单键对象（MRU 顺序）；条数上限由设置决定（0～1000，默认 20，0 表示不记录）。阅读进度与视口恢复一律查 `colorTxt.file.meta`                                                                                                                                                  |

阅读进度口径说明：

- **展示口径（底栏 / 侧栏当前文件 /「更多-最近打开」当前文件）**：共用同一份运行时实时进度，基于编辑器视觉滚动位置（`scrollTop / maxScrollTop`）计算；到达底部时展示为 `100%`，并作为颜色切换为 `--success` 的依据。
- **恢复口径（重新打开同一文件）**：仅当 `file.meta` 中同时存在有效的 **`editorViewState`** 与 **`viewportTopPhysicalLine`** 时，在流结束且模型就绪后调用 Monaco `restoreViewState` 并做锚点校验；否则从**文首**打开（无单独行号兜底）。读入 meta 时若仅有 `editorViewState` 而无锚点，会丢弃该视图状态字段。
- **压缩空行与锚点兜底**：与 `editorViewState` 同时持久化 **`viewportTopPhysicalLine`**（保存时刻视口首行对应的源文件物理行号）。`restoreViewState` 后的 `nextTick` 内用 `getViewportTopLine` + `viewportDisplayLineToPhysicalLine` 校验当前首行物理行是否一致；不一致则按该物理行映射为显示行并 **`jumpToLine`**（使该行靠近视口顶部），避免仅依赖 Monaco 视图状态在滤空映射变化时出现错位。
- **恢复口径（重载当前正文 / 显式物理行）**：切换压缩空行、行首缩进、改动「保留一个空行」、应用章节匹配规则等触发**同路径重开**时，使用 `openFilePath(..., { restorePhysicalLine })`：取**视口末行**经 `viewportDisplayLineToPhysicalLine` 得到物理行，流结束后仍走 `scrollLineToBottom` 显示行对齐（与视图状态恢复互斥）。
- **启动会话（`colorTxt.session`）**：若该路径在 `file.meta` 中已有 `editorViewState`，启动恢复时优先用它；否则仍可用会话快照中的视口物理行作为后备（与 meta 独立）。
- **历史记录字段**：`progress` 与 `editorViewState` 均在 `file.meta` 持久化；`colorTxt.recent.files` 不再存进度。当前打开文件的展示进度仍以运行时实时值为准。
- **阅读位置就绪标志（`readingProgressSynced`，`App.vue` ref）**：无打开文件时为 `true`。每次 `resetSession`（打开/重开某路径）后为 `false`；`file:stream-end` 处理中在「完成滚动到恢复行 / 滚到底 / 或无需恢复仅 `emitProbeLine`」对应的 `requestAnimationFrame` + `nextTick` 之后再置为 `true`；`file:stream-error` 与「关闭当前文件」流程中也会将标志恢复为 `true`（避免永久卡死写盘路径）。该标志与「末行/进度是否已与视口对齐」语义一致，而非仅表示 `loading === false`（流结束到滚动完成之间仍可能为 `false`）。

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

### 清除缓存（设置面板）

- **作用**：在设置弹窗 footer 左侧点击「清除缓存」，经主进程 **`dialog:confirmClearAppCache`** 确认后，仅保留 **`colorTxt.ui.settings`**（界面与阅读偏好：字体、主题、章节规则、快捷键绑定等），删除 **`colorTxt.session`**、**`colorTxt.file.list`**、**`colorTxt.recent.files`**、**`colorTxt.file.meta`** 等其余键，然后 **`window.location.reload()`** 重新加载渲染进程。
- **为何需要 `sessionStorage` 标记**：窗口在 `pagehide` / `beforeunload` 时会调用 `persistWindowUnloadState()`，把内存中的会话、文件列表、最近打开和 meta 写回磁盘。若在 `localStorage.clear()` 之后直接刷新，卸载事件仍会执行，**会把清缓存前的内存状态再次写入**，导致「清不干净」。实现上在清存储前设置 **`sessionStorage`** 键 **`colorTxt.skipUnloadPersistence`**（常量名 `skipUnloadPersistenceSessionKey`，定义于 `constants/appUi.ts`），使 **`persistWindowUnloadState()`** 在卸载时**直接返回**，不再写会话/列表/meta；卸载流程里仍会调用 **`persistSettings()`**，只更新 `colorTxt.ui.settings`，与「仅保留界面设置」一致。
- **新页加载**：`useAppPersistence` 的 **`initPersistenceBootstrap()`** 开头会 **`removeItem`** 清除上述标记，避免后续正常关窗时误跳过落盘。

### 主进程用户数据目录

| 文件                                                   | 说明                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| `window-bounds.json`（位于 `app.getPath("userData")`） | 保存普通窗口态下的位置与尺寸；全屏/最大化/最小化时不会写入 |

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
