<h1>
  <p align="center">
    <img src="./resources/icon.png" width="32"> 彩读｜ColorTxt 2.0 <span style="color: orange">AI+</span>
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
还有章节识别、空行压缩、行首缩进、语音朗读、AI 阅读助手等功能。
</p>

<p align="center">
  <img src="./images/章节列表.jpg" width="600">
</p>

## 功能特性 <span style="font-size: 18px; font-weight: normal">[[示例图](./IMAGES.md)]</span>

- 本地文件阅读：可打开单个 `.txt`/`.md` 文件，也可以导入整个目录（会递归读取子目录）。
- 支持其他格式：支持打开常见的电子书格式（如 `.epub`），打开时会转换为 `.txt` 进行加载。
- 流式读取文件：按块读取内容，降低大文件一次性加载的压力。
- 自动编码识别：`UTF-8` 和 `ANSI` 都能正常打开。
- **自动章节识别**：内置常用的章节匹配规则，也支持自定义匹配规则。
- **个性内容上色**：使用一套自定义的高亮规则对内容进行着色，带来 _独特的阅读体验！_
- **自定义高亮词**：可选择任意词语进行高亮显示（可用于突出主要角色、关键词语等）。
- 支持**定制配色**：可自定义阅读区和高亮词的配色。
- **章节标题常驻**：章节标题会常驻顶部，看到哪里一目了然。
- 支持修改字体、字号、行高（内置 `京華老宋体`，也可以选择系统中安装的任意字体）。
- 支持**空行压缩**、**行首缩进**。
- **阅读进度恢复**：自动记录阅读进度，下次打开可以继续阅读。
- 最近打开记录：默认记录最近打开的20个文件。
- 文件列表功能：支持**分类**、**排序**、文件名**过滤**。
- 支持内容查找：快速定位关键词。
- 支持全文搜索：检索所有匹配项并给出结果列表（区别于阅读区的逐个查找）。
- 支持**书签功能**：书签可以添加备注。
- 支持全屏阅读：阅读区域宽度可自由调整。
- 支持**主题切换**：内置明亮和暗黑两种主题。
- 支持多个窗口：可同时打开多个窗口。
- **摸鱼快捷键**：摸鱼时可以快速隐藏阅读器。
- **AI阅读助手**：可以让 **AI** 帮忙分析剧情，或者回答小说的相关问题。
- **角色卡生成**：借助 **AI** 检索小说中角色的相关信息生成摘要，通过**文生图**生成角色立绘。
- **支持编辑模式**：方便对小说内容进行修改（_错别字坚决不能忍！_）
- **语音朗读功能**：支持 Edge TTS、系统语音和阿里云通义（DashScope）云端语音。

### 关于「其他电子书格式」的支持

支持打开 `.md` 文件，章节按 ATX `#` 标题识别，章节列表按标题层级缩进。

支持打开常见的电子书格式（`.epub`/`.mobi`/`.azw3`/`.fb2`/`.fbz`/`.pdf`/`.chm`），打开时会转换为 `.txt` 进行加载。

**说明**：会舍弃掉电子书自带的样式，只提取里面的文本进行展示，这是「内容上色」的前提，想要在带有各种样式的条件下精准匹配到目标文本进行上色，基本不可能。

### 关于「摸鱼快捷键」

「摸鱼快捷键」可以快速隐藏阅读器，包括窗口、任务栏按钮（Windows）、程序坞图标（macOS），让摸鱼更安全。

默认的快捷键是 `Ctrl`+`` ` ``，你也可以在「快捷键」面板中自定义。

在 macOS 上，要隐藏程序坞图标，需要在 `系统设置` -> `桌面与程序坞` 中关掉 `在程序坞中显示建议App和最近使用的App`。

**已知问题**：在 Linux Wayland 上，全局快捷键会失效，这个暂时没有解决办法。

### 关于「高级换行策略」

阅读器默认使用一套比较简单的换行算法，效率高，但不够准确，会出现该换行却没有换行的情况。这个问题连 VSCode 都没能完美解决。

「高级换行策略」则使用了一套更复杂的算法，能有效提高换行的准确性，但性能较差。当要处理的文件比较大时，会出现明显卡顿，要等计算完才能恢复。

所以在做一些会影响布局的操作时（比如修改文字格式、调整窗口大小等），建议先关掉「高级换行策略」，等操作完后再重新开启。

**已知问题**：启用「高级换行策略」会有很大的内存开销，且这个占用难以被释放，见 [#5311](https://github.com/microsoft/monaco-editor/issues/5311)。

### 关于「AI」功能

**对话模型**：用于「AI 阅读助手」对话，以及「角色卡」整理检索结果、推断画风；

**向量模型**：用于全文检索（RAG），支持 **内置本地模型** 和 **远程嵌入 API**。

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
| OpenAI                       | `https://api.openai.com/v1`                               |
| OpenRouter                   | `https://openrouter.ai/api/v1`                            |
| Google Gemini（OpenAI 兼容） | `https://generativelanguage.googleapis.com/v1beta/openai` |
| _自定义 OpenAI 兼容服务_     | _（手动输入接口地址）_                                    |

OpenAI 接口拼接方式：

- 拉取模型列表：`GET {接口地址}/models`
- 对话：`POST {接口地址}/chat/completions`
- 调用嵌入模型：`POST {接口地址}/embeddings`

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
| 阿里云通义万相（DashScope） | `https://dashscope.aliyuncs.com` |
| Stability AI                | `https://api.stability.ai`       |
| _自定义 OpenAI 兼容服务_    | _（手动输入接口地址）_           |

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
- 页面里的图标来自 [iconfont](https://www.iconfont.cn/)
- 内置的 `京華老宋体` 仅供学习交流使用，商用请购买正版字体
- 基于 [jschardet](https://github.com/aadsm/jschardet) 检测编码，配合 [iconv-lite](https://github.com/pillarjs/iconv-lite) 进行解码
- 使用 [font-list](https://github.com/oldj/node-font-list) 获取系统字体列表
- 基于 [libmspack](https://github.com/kyz/libmspack) 移植了一套 JavaScript 实现，以支持对 `.chm` 格式的解析
- 其他电子书格式的解析，主要参考 [foliate-js](https://github.com/johnfactotum/foliate-js) 的实现
- AI 聊天助手和语音朗读的基础功能，主要参考了 [ReadAny](https://github.com/codedogQBY/ReadAny) 的实现
- 角色卡 3D 卡片效果的实现思路及部分样式、贴图资源参考 [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css)
