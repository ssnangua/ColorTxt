<h1>
  <p align="center">
    <img src="./resources/icon.png" width="32"> 彩读｜ColorTxt 3.0 <span style="color: orange">书源</span> × <span style="color: orange">AI+</span>
  </p>
</h1>

<p align="center">
  <img alt="PC" src="https://img.shields.io/badge/PC-Windows%EF%BD%9CmacOS%EF%BD%9CLinux-orange">
  <img alt="电子书" src="https://img.shields.io/badge/%E7%94%B5%E5%AD%90%E4%B9%A6-txt%EF%BD%9Cmd%EF%BD%9Cepub%EF%BD%9Cmobi%EF%BD%9Cazw3%EF%BD%9Cfb2%EF%BD%9Cfbz%EF%BD%9Cpdf%EF%BD%9Cchm-blue">
  <img alt="框架" src="https://img.shields.io/badge/%E6%A1%86%E6%9E%B6-Electron_%2B_Vue_%2B_Monaco-purple">
</p>

<p align="center">
  <strong>一款会给内容上色的本地 TXT 小说阅读器，带给你不一样的阅读体验！</strong>
</p>

<p align="center">
还有章节识别、简繁互转、划线标注、记笔记、词典、翻译、多角色语音朗读、AI 阅读助手、书源找书等功能。
</p>
<p align="center">
  <img src="./images/章节列表.jpg" width="600">
</p>


## 功能特性 <span style="font-size: 18px; font-weight: normal">[[预览图](./IMAGES.md)]</span>

|  | 功能 | 说明 |
| :---: | --- | --- |
|  | 本地文件阅读 | 支持本地 `.txt` / `.md` 文件 |
|  | 其他电子书 | 支持常见的电子书格式（如 `.epub`），打开时会转换为 `.md` 进行加载 |
|  | 彩读书包 | 可导入/导出彩读专用的 `.ctz` / `.ctzx` 书包文件，方便分享和跨设备同步 |
|  | 自动编码识别 | `UTF-8` 和 `ANSI` 都能正常打开 |
| <img src="./src/renderer/src/assets/chapter_list.svg" width="18" height="18" alt=""> | 自动章节识别 | 内置常用的章节匹配规则，也支持自定义匹配规则 |
| <img src="./src/renderer/src/assets/palette.svg" width="18" height="18" alt=""> | **个性内容上色** | 使用一套自定义的高亮规则对内容进行着色，带来 **独特的阅读体验**！ |
| <img src="./src/renderer/src/assets/highlight.svg" width="18" height="18" alt=""> | **自定义高亮词** | 可选择任意词语进行高亮显示（可用于突出主要角色、关键词语等） |
| <img src="./src/renderer/src/assets/palette.svg" width="18" height="18" alt=""> | **自定义配色** | 内置多套配色方案，也可以自定义阅读区配色 / 高亮色 / 标注色 |
| <img src="./src/renderer/src/assets/enter_fullscreen.svg" width="18" height="18" alt=""> | 全屏阅读 | 禅模式，**沉浸式阅读体验**，阅读区域宽度可自由调整 |
| <img src="./src/renderer/src/assets/enter_minimalist_view.svg" width="18" height="18" alt=""> | 极简视图 | **专注阅读**，阅读区撑满窗口，鼠标移到窗口边缘唤出相应面板 |
| <img src="./src/renderer/src/assets/reading_ruler.svg" width="18" height="18" alt=""> | 阅读尺 | 适合注意力不容易集中的人（**ADHD**），聚焦阅读行，淡化其他行 |
| <img src="./src/renderer/src/assets/emituofo.svg" width="18" height="18" alt=""> | 摸鱼模式 | 打开一个无边框透明置顶的阅读窗口，不知道有什么用 |
| <img src="./src/renderer/src/assets/history.svg" width="18" height="18" alt=""> | **番茄时钟** | 保护眼睛，健康阅读，从你我做起！ |
| <img src="./src/renderer/src/assets/bookmark_active.svg" width="18" height="18" alt=""> | 书签 | 可添加带备注的书签 |
| <img src="./src/renderer/src/assets/note.svg" width="18" height="18" alt=""> | **划线笔记** | 可选中文本进行划线标注、记笔记 |
| <img src="./src/renderer/src/assets/edit.svg" width="18" height="18" alt=""> | **编辑模式** | 方便对小说内容进行修改（_错别字坚决不能忍！_） |
| <img src="./src/renderer/src/assets/play.svg" width="18" height="18" alt=""> | 定时滚动 | 定时滚动一屏或一行 |
| <img src="./src/renderer/src/assets/reading.svg" width="18" height="18" alt=""> | **语音朗读** | 支持旁白 / 对白多音色，配合 AI + 角色卡可实现多角色语音朗读 |
| <img src="./src/renderer/src/assets/replace.svg" width="18" height="18" alt=""> | **文本替换** | 全局替换文本（可用于替换人名、去广告文本等） |
| <img src="./src/renderer/src/assets/conver.svg" width="18" height="18" alt=""> | **简繁互转** | 简繁互转，字母 / 数字全半角互转 |
| <img src="./src/renderer/src/assets/AI_chat.svg" width="18" height="18" alt=""> | **AI 阅读助手** | 可以让 **AI** 帮忙分析剧情、回答小说相关问题（支持生成 <img src="./src/renderer/src/assets/mindmap.svg" width="18" height="18" alt=""> **思维导图** / <img src="./src/renderer/src/assets/wordcloud.svg" width="18" height="18" alt=""> **词云图**） |
| <img src="./src/renderer/src/assets/character.svg" width="18" height="18" alt=""> | **角色卡生成** | 借助 **AI** 检索小说中角色的相关信息生成摘要，通过 **文生图** 生成角色立绘 |
| <img src="./src/renderer/src/assets/AI_compose.svg" width="18" height="18" alt=""> | **AI 智能排版** | 让 **AI** 对文本进行排版，可自动处理硬换行、修正标点符号等 |
| <img src="./src/renderer/src/assets/findBook.svg" width="18" height="18" alt=""> | 书源找书 | 可多源搜索，支持在线阅读或整书下载（入口：「更多 → 找书」） |
| <img src="./src/renderer/src/assets/WebDAV.svg" width="18" height="18" alt=""> | **WebDAV** | 用于跨设备同步应用配置、书包 |
| <img src="./src/renderer/src/assets/dictionary.svg" width="18" height="18" alt=""> | 词典 | 查询词语释义，支持导入本地词库 |
| <img src="./src/renderer/src/assets/translate.svg" width="18" height="18" alt=""> | 翻译 | 翻译选中文本，支持 AI 翻译和多种翻译服务 |
| <img src="./src/renderer/src/assets/compress.svg" width="18" height="18" alt=""> | 空行压缩 | 压缩多余空行 |
| <img src="./src/renderer/src/assets/indent.svg" width="18" height="18" alt=""> | 行首缩进 | 在行首添加全角缩进 |
| <img src="./src/renderer/src/assets/ebook.svg" width="18" height="18" alt=""> | 文件列表 | 拖放添加文件 / 目录（会递归读取子目录），支持分类 / 排序 / 过滤；可切换列表 / 树状 |
| <img src="./src/renderer/src/assets/find.svg" width="18" height="18" alt=""> | 全文搜索 | 检索所有匹配项并给出结果列表（区别于阅读区的逐个查找） |
| <img src="./src/renderer/src/assets/font_family.svg" width="18" height="18" alt=""> | 字体 | 可设置字体 / 字号；内置 `京華老宋体`，也可以选择系统中安装的任意字体 |
| <img src="./src/renderer/src/assets/line_height_up.svg" width="18" height="18" alt=""> | 排版 | 可设置字间距 / 行间距 / 段间距 / 左右边距 |
| <img src="./src/renderer/src/assets/dark.svg" width="18" height="18" alt=""> | 主题切换 | 内置明亮 / 暗黑两种主题 |
|  | 粘性标题栏 | 章节标题会常驻顶部，看到哪里一目了然 |
|  | 阅读进度恢复 | 自动记录阅读进度，下次打开可以继续阅读 |
|  | 最近打开记录 | 记录最近打开的文件 |
| <img src="./src/renderer/src/assets/shortcut.svg" width="18" height="18" alt=""> | **摸鱼快捷键** | 摸鱼时可以快速隐藏阅读器 |
| <img src="./src/renderer/src/assets/new_window.svg" width="18" height="18" alt=""> | 多窗口 | 支持同时打开多个窗口 |

### 关于「其他电子书格式」的支持

支持打开 `.md` 文件，章节按 ATX `#` 标题识别，章节列表按标题层级缩进，父级可折叠。

> [!NOTE]
> 只支持标题、链接、图片等少量 Markdown 语法，服务于小说文本。

支持打开常见的电子书格式（`.epub`/`.mobi`/`.azw3`/`.fb2`/`.fbz`/`.pdf`/`.chm`），打开时会转换为 `.md` 进行加载。

> [!NOTE]
> 会舍弃掉电子书自带的样式，只提取里面的文本进行展示。<br />对于排版精美的电子书，建议使用专门的阅读器进行阅读，彩读**只适用于**纯文本或带简单插图的电子书。

### 关于「摸鱼快捷键」与「摸鱼模式」

「摸鱼快捷键」可以快速隐藏阅读器，包括窗口、任务栏按钮（Windows）、程序坞图标（macOS），不知道有什么用。

默认的快捷键是 `Ctrl`+`` ` ``，你也可以在「快捷键」面板中自定义。

> [!NOTE]
> macOS 上，要隐藏程序坞图标，需要在 `系统设置` → `桌面与程序坞` 中关掉 `在程序坞中显示建议App和最近使用的App`。

「摸鱼模式」会打开一个无边框、无任务栏、透明背景、始终置顶的阅读窗口，不知道有什么用。

全局快捷键 `Ctrl` + `↑` / `↓` 翻页、`Ctrl` + `←` / `→` 切章。

右键菜单可开关「定时滚动」。

> [!WARNING]
> 已知问题：在 Linux Wayland 上，全局快捷键会失效，这个暂时没有解决办法。

### 关于「高级换行策略」

> [!IMPORTANT]
> 彩读给 Monaco 打了补丁，「简单换行策略」下的中文自动换行效果已经得到了不错的改善，所以除非情况特殊，不建议开启「高级换行策略」

阅读器默认使用一套比较简单的换行算法，效率高，但不够准确，会出现该换行却没有换行的情况。这个问题连 VSCode 都没能完美解决。

「高级换行策略」则使用了一套更复杂的算法，能有效提高换行的准确性，但性能较差。当要处理的文件比较大时，会出现明显卡顿，要等计算完才能恢复。

所以在做一些会影响布局的操作时（比如修改文字格式、调整窗口大小等），建议先关掉「高级换行策略」，等操作完后再重新开启。

> [!WARNING]
> 已知问题：启用「高级换行策略」会有很大的内存开销，且这个占用难以被释放，见 [#5311](https://github.com/microsoft/monaco-editor/issues/5311)。

### 关于「词典」

内置 `Wiktionary`、`Wikipedia` 网络词典，支持导入本地词典 `StarDict` / `MDict` / `DICT` / `Slob` / `BGL`。

<details>
<summary>词典下载</summary>

> 实用建议：优先 `StarDict` 和 `MDict`；要离线维基/维基词典可用 `Slob`；要开源多语对译可用 `FreeDict`。

- **StarDict**（`.ifo` / `.idx` / `.dict.dz`）
  - http://download.huzheng.org/zh_CN/ — 胡正旧站，中文区常用
  - https://tuxor1337.frama.io/firedict/dictionaries.html — 开源许可的 StarDict 汇总
- **MDict**（`.mdx` / `.mdd`）
  - https://downloads.freemdict.com/ — FreeMdict 下载站
  - https://mdx.mdict.org/ — 常用镜像目录
- **Slob**（`.slob`，Aard2）
  - https://github.com/itkach/slob/wiki/Dictionaries — 官方词典索引
- **DICT**（dictd，常为 `.index` + `.dict.dz`）
- **BGL**（Babylon）
- https://freedict.org/downloads/ — FreeDict，多语双向，提供 `StarDict` / `Slob` / `Dictd` 词典下载

</details>

### 关于「翻译」

支持以下翻译服务：

| 服务商 | 说明 |
| --- | --- |
| **AI 翻译** | OpenAI 兼容接口，根据 AI 服务商配置相应 API 密钥 |
| 微软翻译 | Edge 免费通道，无需配置 |
| Google 翻译 | 免费网页接口，无需配置 |
| Yandex 翻译 | 免费通道，无需配置 |
| DeepL | 官方 API / DeepLX，需要 API Key |
| 百度翻译 | 官方开放平台，需要 APP ID 与密钥 |
| 有道翻译 | 官方开放平台，需要应用 ID 与密钥 |
| 腾讯翻译 | 腾讯云机器翻译，需要 SecretId / SecretKey |
| 火山翻译 | 火山引擎机器翻译，需要 Access Key |
| 阿里翻译 | 阿里云机器翻译，需要 AccessKey |

### 关于「语音朗读」

支持的 TTS：

| 服务商    | API 密钥                | 说明                                            |
| --------- | ----------------------- | ----------------------------------------------- |
| Edge TTS  |                         |                                                 |
| 系统语音  |                         |                                                 |
| 讲述人自然语音  |                    | 仅 Windows，通过 Windows SAPI5 调用本机音色，<br />需安装适配器与语音包，如 [NaturalVoiceSAPIAdapter](https://github.com/gexgd0419/NaturalVoiceSAPIAdapter) |
| Qwen3-TTS | 阿里云通义（DashScope） |                                                 |
| MiniMax   | MiniMax                 |                                                 |
| 小米 MiMo | MiMo                    | 支持 **音色定制** 和 **音色克隆**，**目前限免** |
| 豆包语音合成大模型 2.0 | 火山引擎 | 内置官方 **444 个音色**，可切换方言 |

- 支持「单音色」或「旁白/对白多音色」。
  - 启用「AI 阅读助手」时，多音色可区分「男声」「女声」，也可以在「角色卡」中给角色设置专属音色。
- 支持「朗读过滤」（朗读时忽略特定内容）和「自动暂停」（朗读指定的章节数或时长后自动暂停）。

### 关于「AI」功能

|   <p align="center"><strong>分析剧情</strong></p> ![](./images/AI阅读助手_剧情分析.jpg)   | <p align="center"><strong>生成章节匹配规则</strong></p> ![](./images/AI阅读助手_生成章节匹配规则.jpg) |
| :---------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------------: |
| <p align="center"><strong>生成思维导图</strong></p> ![](./images/AI阅读助手_思维导图.jpg) |     <p align="center"><strong>生成词云图</strong></p> ![](./images/AI阅读助手_词云图.jpg)     |
|          <p align="center"><strong>角色卡</strong></p> ![](./images/角色卡.jpg)           |     <p align="center"><strong>生成角色立绘</strong></p> ![](./images/角色卡_立绘生成.jpg)     |

**对话模型**：用于「AI 阅读助手」对话，以及「角色卡」整理检索结果、推断画风；

**向量模型**：用于全文检索（RAG），支持 **内置本地模型** 和 **远程嵌入 API**。

<details>
<summary>为什么需要向量模型？</summary>

> 简单来说，就是 **对话模型** 擅长「思考」和「说」，却不擅长「找」，我们也不可能每提一个问题都把整本小说的内容一起发给 AI 服务器，成本太高。（比如你问 `xxx在第几章出场？`，这个问题显然需要在整本书里找）
> 
> 而 **向量模型** 就是来做这个事情的，它会提前给整本小说 _建立索引_ （可以简单理解为生成了一个「小说内容的搜索引擎」），当你提问时，它会在索引库中「找到」和问题 _相关性最高_ 的几个片段再交给 AI。<br/>这个过程是在 _本地执行_ 的，不需要消耗 Token；发给 AI 服务器的原文也只剩下找出来的几个片段，从而降低了成本。

</details>

远程接口目前只支持 OpenAI 规范，以下为预设的服务商列表：

| 服务商                       | 默认接口地址                                              |
| ---------------------------- | --------------------------------------------------------- |
| 本地 LM Studio               | `http://127.0.0.1:1234/v1`                                |
| 本地 Ollama（OpenAI 兼容）   | `http://127.0.0.1:11434/v1`                               |
| DeepSeek                     | `https://api.deepseek.com/v1`                             |
| 阿里云通义（DashScope）      | `https://dashscope.aliyuncs.com/compatible-mode/v1`       |
| 智谱 GLM                     | `https://open.bigmodel.cn/api/paas/v4`                    |
| Moonshot（Kimi）             | `https://api.moonshot.cn/v1`                              |
| 硅基流动                     | `https://api.siliconflow.cn/v1`                           |
| Agnes AI                     | `https://apihub.agnes-ai.com/v1`                          |
| MiniMax                      | `https://api.minimaxi.com/v1`                             |
| 小米 MiMo                    | `https://api.xiaomimimo.com/v1`                           |
| OpenAI                       | `https://api.openai.com/v1`                               |
| OpenRouter                   | `https://openrouter.ai/api/v1`                            |
| Requesty                     | `https://router.requesty.ai/v1`                           |
| Google Gemini（OpenAI 兼容） | `https://generativelanguage.googleapis.com/v1beta/openai` |
| _自定义 OpenAI 兼容服务_     | _（手动输入接口地址）_                                    |

<details>
<summary>OpenAI 接口拼接方式（不重要）</summary>

- 拉取模型列表：`GET {接口地址}/models`
- 对话：`POST {接口地址}/chat/completions`
- 调用嵌入模型：`POST {接口地址}/embeddings`

</details>

**内置本地模型**：下载模型到本地运行，无需 API（模型文件没有打包，需要在「设置」中手动下载）：

| 内置模型                                       | 说明                                |
| ---------------------------------------------- | ----------------------------------- |
| BGE Small ZH v1.5 _（~47 MB，维度：512）_      | 高质量中文嵌入                      |
| Multilingual E5 Small _（~118 MB，维度：384）_ | 多语言支持（100+ 语言），综合性能好 |

**文生图**：用于「角色卡」生成角色立绘，支持以下接口：

| 服务商                      | 默认接口地址                     |
| --------------------------- | -------------------------------- |
| 本地 WebUI                  | `http://127.0.0.1:7860`          |
| 本地 ComfyUI                | `http://127.0.0.1:8188`          |
| OpenAI Images               | `https://api.openai.com/v1`      |
| Agnes AI                    | `https://apihub.agnes-ai.com/v1` |
| 阿里云通义万相（DashScope） | `https://dashscope.aliyuncs.com` |
| MiniMax                     | `https://api.minimaxi.com/v1`    |
| Stability AI                | `https://api.stability.ai`       |
| _自定义 OpenAI 兼容服务_    | _（手动输入接口地址）_           |

### 关于「AI 智能排版」

启用「AI 阅读助手」时，在编辑模式下，可通过工具栏「AI 智能排版」一键全文排版，或者在编辑器中选中文本后「右键 → AI 智能排版：选中文本」进行局部排版（长文建议分次排版）。

排版完成后会显示 **Diff 预览**，可对排版结果逐一确认，点「应用」后再一次性写回，「放弃」则主文档不变。

<img src="./images/AI智能排版_Diff预览.jpg" width="600">

> [!NOTE]
> **不同模型的排版结果可能差异较大**，_请自行测试_。

可在「设置 → 编辑」中自定义排版选项：

| 选项                  | 作用                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| **清理 HTML 残留**    | 解码 `&#35498;` 与 `&nbsp;` 等 HTML 实体，并去除 `<br/>` 等 HTML 残留。            |
| **修正硬换行**        | 将同一自然段内因排版产生的句中强行换行合并为一行。                                 |
| **修正标点符号**      | 引号/括号配对、半角转全角、断句补标点等；不改动数字小数点与英文对白中的半角标点。  |
| **统一对话符号**      | 将对话统一为 `“”` 或 `「」` 包裹。                                                 |
| **修正乱码**          | 尝试将 `锟斤拷` `�` 等乱码还原为合理汉字；_有一定误还原风险，请自行检查。_         |
| **还原 \* 屏蔽**      | 尝试根据上下文还原正文里的 `*` 和谐字；不处理整行分隔线；_可能误猜，请自行检查。_  |
| **移除盗版水印**      | 删除句中插入的防盗版杂符（如 `月*漪〇/泣②sa/`）；_有一定误删风险，请自行检查。_    |
| **移除广告/引流信息** | 删除 `发布于 xxx` `看小说，就来 xxx 网` 等站宣水印；_有一定误删风险，请自行检查。_ |
| **压缩空行**          | 自动应用「格式化：压缩空行」。                                                     |
| **行首缩进**          | 自动应用「格式化：行首缩进」。                                                     |

可通过「设置 → 技能 → 智能排版」自定义 AI 排版行为。

> [!NOTE]
> 「最大 Token 数」会限制 AI 单次回复内容长度，所以排版时会根据该设置进行分段，如果想减少分段数（请求次数），可以适当调高该值，如改为 8192。

### 关于「书包」

书包是彩读专用的压缩包格式，方便分享和跨设备同步。

书包文件的扩展名为 **`.ctz`**（普通 zip 包）/ **`.ctzx`**（加密包），目录结构如下：

```text
{文件名}.ctz|ctzx/
  characters/
    portraits/       # 角色立绘
    manifest.json    # 角色卡
  content/
    {文件名}.txt|md   # 原文件
    {文件名}.Images/  # md 文件的插图
  bookmarks.json     # 书签
  highlights.json    # 高亮词
  notes.json         # 笔记
  manifest.json      # 书包配置文件
```

### 关于「WebDAV」

用于跨设备同步应用配置、书包。

在「设置 → WebDAV」中开启：

- 主界面：
  - 侧栏「WebDAV」面板：上传/同步「配置」；拉取上传的书包列表，可过滤、排序、下载
  - 底栏「文件路径」菜单：上传/同步「书包」（基于当前打开文件导出的带阅读进度的书包）
- 找书窗口：
  - 顶栏「WebDAV」菜单可分别上传/同步「书架 / 书源 / 设置」

远端目录结构：

```text
ColorTxt/
  Main/       # 主界面配置
  Books/      # 上传的书包
  FindBook/   # 找书窗口书架/书源/设置
```

## 预设字体

| 类型             | macOS      | Windows    | Linux      |
| ---------------- | ---------- | ---------- | ---------- |
| 内置字体         | 京華老宋体 | 京華老宋体 | 京華老宋体 |
| 黑体 / UI 无衬线 | 苹方-简    | 微软雅黑   | 思源黑体   |
| 宋体 / 明体      | 宋体-简    | 宋体       | 思源宋体   |
| 楷体             | 楷体-简    | 楷体       | 文鼎 UKai  |

说明：

- 名称中的「**-简**」表示对应 **简体中文（SC）** 字体族，与 macOS 字体册中常见命名一致；并非「只能显示简体字」，而是字形与排版习惯面向简体场景。
- **Linux** 环境需自行安装常见中文字体包（如 Noto CJK、文泉驿、文鼎 UKai 等），否则可能回退到系统默认字体。

## 其他

- [开发文档](./DOCS.md)
- [更新日志](./CHANGELOG.md)

## 相关

- 应用图标由 [豆包](https://www.doubao.com/) 生成
- 内置背景图由 [ChatGPT Images 2.0](https://chatgpt.com/images/) 生成
- 页面里的图标来自 [iconfont](https://www.iconfont.cn/)
- 内置的 `京華老宋体` 仅供学习交流使用，商用请购买正版字体
- 内容上色灵感来源于 VS Code 插件 [vscode-txt-syntax](https://github.com/xshrim/vscode-txt-syntax)
- 基于 [jschardet](https://github.com/aadsm/jschardet) 检测编码，配合 [iconv-lite](https://github.com/pillarjs/iconv-lite) 进行解码
- 使用 [font-list](https://github.com/oldj/node-font-list) 获取系统字体列表
- 基于 [libmspack](https://github.com/kyz/libmspack) 移植了一套 JavaScript 实现，以支持对 `.chm` 格式的解析
- 其他电子书格式的解析，主要参考 [foliate-js](https://github.com/johnfactotum/foliate-js) 的实现
- AI 阅读助手和语音朗读的基础功能，参考了 [ReadAny](https://github.com/codedogQBY/ReadAny) 的实现
- 词典功能参考了 [readest](https://github.com/readest/readest)
- 角色卡 3D 卡片效果的实现思路及部分样式、贴图资源来源于 [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css)
- 基于 [@node-rs/jieba](https://github.com/napi-rs/node-rs/tree/main/packages/jieba) 实现中文分词，以支持词云生成
- 基于 [OpenCC](https://github.com/byvoid/opencc) 实现简繁互转
- 划线/笔记功能的交互，参考了 [微信读书网页版](https://weread.qq.com/)
- 书源解析逻辑参考：[legado-E（阅读Sigma）](https://github.com/Luoyacheng/legado-E)

## 链接

- [科技爱好者周刊](https://github.com/ruanyf/weekly/issues/10004)
- [LINUX DO](https://linux.do/t/topic/2772329)
