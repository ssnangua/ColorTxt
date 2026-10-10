# AI 阅读助手

> 与 [开发构建.md](./开发构建.md) 中的项目结构、`src/main/ai/` 目录树互为参照。

## AI 阅读助手与相关能力

本节汇总 **AI 阅读助手**、**向量检索（RAG）**、**文生图（角色卡）**、**角色侧栏**、**技能** 与 **Agent** 的入口、数据落点及与主进程的衔接。与 [开发构建.md](./开发构建.md) 中的 **`src/` 目录树**、**`src/main/`**、**`preload`**、**主要 Vue 组件** 表互为参照。

### 功能与入口

- **入口**：侧栏活动栏 **「AI 助手」**、**「角色」**；设置中 **「AI 阅读助手」「向量模型」「角色卡」「技能」** 四个扩展页签在 **AI 总开关** 关闭时隐藏（见 `SettingsTabBar` / `draftAi.aiEnabled`）。**「语音朗读」** 页签始终可见，不依赖 AI 总开关。
- **阅读器引用提问**：只读选区工具条 **「问 AI」**（`ReaderSelectionToolbar` → `App.vue` **`onAskAiWithQuote`**）自动切到侧栏 **「AI 助手」**，经 **`AiAssistantPanel.prefillQuotedText`** 将原文填入输入框（blockquote 格式）；输入框自动增高并滚至末尾光标。详见 **「阅读器标注与笔记」**。
- **对话与 RAG**：正文与阅读器一致；**「向量模型」** 页选择 **内置本地模型**（新装默认）或 **远程嵌入 API**，并配置切块 / **`ragTopK`** 等。
    - 对当前书 **「建索引」** 时，渲染进程 **`buildBookVectorIndex.ts`** 按章节分块，经 preload 调主进程嵌入并写入当前 **AI 数据缓存根** 下的 **`vector.sqlite`**（`better-sqlite3` + `sqlite-vec`，路径见下节）。
    - **内置**来源须先在设置页 **下载** 对应模型（**`embeddingReady`** 会在未下载时拦截建索引）；**远程**来源需配置接口与模型名。
    - 修改嵌入 **向量维度** 并保存时，设置面板会 **`showMessageBox`** 提示将清空已建索引。
- **文生图 / 角色卡**：**「角色卡」** 页配置文生图后端与采样参数（见 `@shared/aiTypes` 的 **`AITxt2ImgConfig`**，默认 **`backend: "a1111"`**、`apiBaseUrl: http://127.0.0.1:7860`）；与主进程 **`ai/txt2img/index.ts`**、`registerAiIpc` 暴露的 `ai:txt2img` 等 IPC 配合。服务商与默认地址见下节 **「文生图服务商」**。立绘文件落在 **`characterPortraitCacheDir`**（默认 **`userData/CharacterPortrait`**，按书名分子目录，见 `@shared/characterPortraitPaths`），主进程 **`ai/tools/characterPortraitFs.ts`** 负责迁移与复制。
- **角色卡 3D 倾斜与闪卡纹理**：侧栏 **「角色」→ 更多 → 卡片效果** 子菜单切换全局纹理（持久化 **`characterCardTextureEffect`**，默认 **细腻光泽**）；详见下节 **「角色卡 3D 倾斜与闪卡纹理」**。实现思路及部分样式、贴图参考 [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css)（见 README 致谢）。
- **技能与 Agent**：内置技能元数据与用户覆盖见 `@shared/aiSkills`；Agent 工具名与主进程 **`ai/chat/agentTools.ts`** 对齐（`@shared/aiAgentSkillToolNames`）。流式对话与工具事件经 **`ai/chat/agentChat.ts`** 推送到渲染层（`window.colorTxt.ai.onAgentEvent`）。
- **会话与配置**：每本书（内容哈希）多会话，消息存 **同一向量库文件** 内 SQLite 表。运行时 **`config.json`** 位于 **AI 数据缓存根**（**不含**聊天正文；含 **`showTokenUsage`**、**`chat.tokenPricePerMillion`**、**`aiDataCacheDir`**、**`wordcloudMaxWords`**、**`autoMindmapOnSummaryAndCharacters`**、**`embedding.*`** 等，API Key 不落盘明文）。默认对话 Base URL 为 **`http://127.0.0.1:1234/v1`**（本地 LM Studio）。聊天 / 嵌入 / 文生图请求由主进程代理，经 IPC 流式回传（可中止）。

### 对话模型 / 文生图配置方案

**对话模型**与**文生图 API** 各自维护多套独立命名方案（**`chatProfiles` / `txt2imgProfiles`**，各最多 12 套），互不绑定：例如对话用 DeepSeek、立绘用本地 A1111。

| 项目 | 说明 |
| ---- | ---- |
| 设置入口 | **AI 阅读助手** / **角色卡** 页各自独立的 **配置方案** 区块（与「对话模型」「文生图 API 设置」同级） |
| 当前方案 | 下拉选中项为编辑对象；点设置 **确定** 后写入 **`activeChatProfileId`** / **`activeTxt2ImgProfileId`**，并同步到运行时 **`cfg.chat`** / **`cfg.txt2img`** 快照 |
| 方案内容 | 对话方案含完整 **`AIChatEndpoint`**（含 **`systemPromptExtra`**、Token 单价等）；文生图方案含完整 **`AITxt2ImgConfig`**（含 **`enabled`**、后端、密钥、采样/尺寸/Comfy 工作流等） |
| 不随方案变 | 向量模型、RAG 切块、快速提问、数据缓存目录、立绘缓存根目录、技能、语音朗读等仍为全局项 |
| API 密钥 | 各方案密钥加密存于 **`ai.chatProfileKeys`** / **`ai.txt2imgProfileKeys`**（JSON：`profileId → apiKey`）。**设置 → 确定** 时经 **`ai:config:set`** → **`saveAiConfig`** 落盘；关窗 **`persistSettings()`** **不写**保险库。启动时 **`hydrateApiKeysFromVault`** 从保险库灌回内存，并将已废弃旧槽（见下节）一次性迁入 profile 映射后删除 |
| 侧栏 | 无方案切换 UI；设置保存后 **`aiAssistantConfigSyncNonce`** 递增，阅读助手重新拉取对话模型列表。底栏模型菜单仍是下拉：已选 ID 不在新列表中时保留，并排在列表前，不会被换成第一项 |

实现见 **`@shared/aiEndpointProfiles`**、**`@shared/secretSlots`**、**`ai/infra/config.ts`**、**`secretStorage.ts`**（载入时旧版单套配置自动迁移为「默认」方案；旧单密钥 slot 仅读一次）。

### 对话模型服务商

阅读助手与角色 **AI 检索** 使用的对话能力均走 **OpenAI 兼容** `POST {baseUrl}/chat/completions`（Agent 另含 `tools` / `tool_calls`）。在 **设置 → AI 阅读助手 → 服务商** 下拉中选择预设会自动填入 **接口地址**并**清空当前模型**（需重新拉取或手输）；也可选 **「自定义 OpenAI 兼容服务」** 手填任意兼容网关地址。

预设清单与代码 **`@shared/apiEndpointPresets`**（`CHAT_API_PROVIDER_PRESETS`）一致；深度思考参数由 **`ai/chat/chatThinking.ts`** 按 `baseUrl` 识别注入（见下节「深度思考」）。**附加系统提示词**见 **`@shared/aiSystemPromptPresets`**（设置页预设 + 文本框，写入 `chat.systemPromptExtraMode` / `systemPromptExtra`）。

| 服务商 | 设置页预设 | 官方通用 Base URL（OpenAI 兼容） | 深度思考 | API 密钥 |
| ------ | ---------- | -------------------------------- | -------- | -------- |
| 本地 LM Studio | 本地 LM Studio | `http://127.0.0.1:1234/v1` | 已适配（`think: true`） | 通常不需要 |
| 本地 Ollama | 本地 Ollama | `http://127.0.0.1:11434/v1` | 已适配（`think: true`） | 通常不需要 |
| DeepSeek | DeepSeek | `https://api.deepseek.com/v1` | 已适配（`thinking` 开关） | 需要 |
| 阿里云通义 | 阿里云通义（DashScope） | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 已适配（`enable_thinking`） | 需要 |
| 智谱 GLM | 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | 已适配（`thinking` 开关） | 需要 |
| Moonshot（Kimi） | Moonshot（Kimi） | `https://api.moonshot.cn/v1` | 已适配（`enable_thinking`） | 需要 |
| 硅基流动 | 硅基流动 | `https://api.siliconflow.cn/v1` | 已适配（开启时 `enable_thinking`） | 需要 |
| Agnes AI | Agnes AI | `https://apihub.agnes-ai.com/v1` | 已适配（`chat_template_kwargs.enable_thinking`） | 需要 |
| MiniMax | MiniMax | `https://api.minimaxi.com/v1` | 已适配（`thinking` + `reasoning_split`） | 需要 |
| 小米 MiMo | 小米 MiMo | `https://api.xiaomimimo.com/v1` | 已适配（`thinking.type` enabled/disabled） | 需要（**`api-key`** 头，见 **`applyOpenAiCompatAuthHeaders`**） |
| OpenAI | OpenAI | `https://api.openai.com/v1` | 未单独适配（仅温度） | 需要 |
| OpenRouter | OpenRouter | `https://openrouter.ai/api/v1` | 已适配（`reasoning.effort`） | 需要 |
| Atlas Cloud | Atlas Cloud | `https://api.atlascloud.ai/v1` | 未单独适配（仅温度） | 需要 |
| Google Gemini | Google Gemini（OpenAI 兼容） | `https://generativelanguage.googleapis.com/v1beta/openai` | 已适配（`reasoning_effort`） | 需要（Google AI Key） |
| 其它兼容服务 | 自定义 OpenAI 兼容服务 | （手填，无固定地址） | 未识别时仅温度=1 | 视网关而定 |

说明：

- **深度思考「已适配」**：侧栏开启「深度思考」时，应用会发送该厂商文档对应的思考开关；流式思考文案优先解析 `reasoning_content` / `reasoning` / `thinking` / `thought` 等 delta 字段（因上游而异）。
- **对话模型 ID**：设置页「模型」是 **`ApiEndpointInput`**（占位「输入模型 ID…」），可直接填写任意 ID，不依赖服务商提供 `GET /models`。已拉取的 id 作为建议；聚焦**输入框**且尚无建议时静默拉取（「拉取模型」「测试连接」不走这条静默路径，避免按钮的成功/失败反馈被吃掉）。**仅当输入框为空**时，成功结果才填入列表第一项；已填写的 ID（包括不在列表里的手输值）不覆盖。接口地址或 API 密钥一变就丢掉建议缓存，进行中的旧请求结果也不写回。
- **拉取模型列表**：`GET {baseUrl}/models`；有 API Key 时附带认证（MiMo 为 **`api-key`**，其余多为 Bearer）。**拉取失败时不展示本地预设模型**（与其它服务商一致），输入框里已有的 ID 保持不动。MiMo 成功后会 **`sortChatModelsForBaseUrl`** 去掉 `-tts`/`-asr` 并按 `vX.Y` 版本新→旧排序。侧栏底栏模型菜单仍是 **`AppCustomSelect`**，不能在那里新打 ID；当前手输 ID 不在列表中时保留并排在前面。
- **测试连接（对话）**：**`ai:test:chat`** 发送极简 **`POST …/chat/completions`**（不出长文）；HTTP **402** 或 body 中 **`insufficient_balance`** 统一提示 **「账户余额不足，无法发起对话。」**（**`registerAiIpc.ts`** → **`formatChatConnectionTestError`**）。
- **工具调用轮数**：**`chat.maxToolRounds`**（设置页 **工具调用轮数**，默认见 **`DEFAULT_MAX_TOOL_ROUNDS`**）限制单次 Agent 提问内模型↔工具往返次数；复杂任务可适当调高。
- **未单独适配**：仍可使用对话与 Agent 工具，但不保证思考开关与思考流展示正常；自定义地址若与上表某行 **Base URL 一致**，保存后会自动匹配为对应预设项。
- **向量嵌入**另有一套来源（**设置 → 向量模型 → 内置本地 / 远程 API**），见下节「内置向量模型与缓存目录」；**不**使用上表对话服务商下拉。
- **文生图**（本地 A1111 / ComfyUI 与云端图像 API）与 **语音朗读**（Edge TTS / 系统语音 / 通义 Qwen3-TTS / MiniMax TTS / **小米 MiMo TTS** / **火山引擎豆包语音合成大模型 2.0**，见 **「语音朗读」**）为独立配置，亦不在上表；文生图预设见下节。火山朗读 engine id 为 **`volcengine`**，使用新版 **`X-Api-Key`** + **`X-Api-Resource-Id: seed-tts-2.0`** 鉴权、官方 **444 个音色**（2.0 主表 293 + 多语种 151，含中文、英文及其他多语种）与默认 **24 kHz PCM**（可改）；官方无单独鉴权探测，连接测试会合成一个汉字并产生极少量用量。

### 文生图服务商

角色立绘出图走 **设置 → 角色卡** 中的文生图配置（`txt2img.*`），与对话服务商无关。在 **服务商** 下拉中选择预设会同时写入 **`backend`** 与默认 **接口地址**（`apiBaseUrl`）；下拉项为两行展示（服务商名 + 默认 Base URL），与 **AI 阅读助手 → 服务商** 交互类似。**仅手改接口地址时不会根据 URL 反推或切换服务商**（与对话侧「地址与服务商联动」不同）。

预设清单与代码 **`@shared/apiEndpointPresets`**（`TXT2IMG_BACKEND_PRESETS`）一致：

| 服务商 | `backend` | 默认 Base URL | 默认模型（可覆盖） |
| -------- | --------- | ------------- | ------------------ |
| 本地 WebUI | `a1111` | `http://127.0.0.1:7860` | — |
| 本地 ComfyUI | `comfyui` | `http://127.0.0.1:8188` | — |
| OpenAI Images | `openai_images` | `https://api.openai.com/v1` | `gpt-image-2` |
| Agnes AI | `agnes_images` | `https://apihub.agnes-ai.com/v1` | `agnes-image-2.1-flash` |
| 阿里云通义万相（DashScope） | `dashscope_wanx` | `https://dashscope.aliyuncs.com` | `wan2.6-t2i` |
| MiniMax | `minimax_images` | `https://api.minimaxi.com/v1` | `image-01` |
| Stability AI | `stability` | `https://api.stability.ai` | `ultra` |
| OpenAI 兼容 Images 代理 | `openai_compat_images` | （用户填写） | `gpt-image-2` |

说明：

- **A1111**：主进程调用 WebUI **`/sdapi/v1/*`**（如 txt2img、采样器与 SD 模型列表）；设置页可拉取采样器 / 模型 / 高清修复放大算法；**尺寸**为宽高数字输入（默认 **512×768**）。
- **ComfyUI**：经 **`/prompt`** 提交工作流并轮询 **`/history`**；需在设置中粘贴 **Comfy 工作流 JSON**（导出 API 格式）；尺寸同为自定义宽高。
- **云端（除自定义兼容代理外）**：各方案 **`txt2img.apiKey`** 经 **`ai.txt2imgProfileKeys`** 加密保存（与语音朗读、AI 阅读助手等密钥在应用内**分开保存**，见 **「API 密钥保险库」**）。出图前由对话模型将 **画风 + 角色形象** 整理为自然语言 prompt（**`natural`** 族）或 SD tag（**`sd`** 族，含 Stability）。**尺寸**为各后端**固定档位**（**`txt2ImgCloudSizePresets`**）；切换服务商时写入该后端 **默认云端模型**（**`txt2ImgCloudModelPresets`** / **`TXT2IMG_DEFAULT_CLOUD_MODEL`**），并按 **512×768** 参考比例选取档位（在比例足够接近的候选中选 **像素最少**，利于立绘省额度）。
- **自定义 OpenAI 兼容 Images**（`openai_compat_images`）：走 **`ai/txt2img/openAI.ts`**（与官方 OpenAI Images 同一套请求）。**仅 DALL·E 2/3** 发送 `response_format: b64_json`；**`gpt-image-*` 不传该字段**（官方与多数网关会 400 `unknown_parameter`，模型固定返回 base64）。可选 `quality`。解析同时支持 `data[0].b64_json` 与 `data[0].url`。**尺寸为自由宽高 64–2048**（与本地 WebUI 相同 UI），便于对接未知网关（如仅支持非 OpenAI 官方分辨率的代理）。
- **MiniMax**（`minimax_images`）：专用 **`ai/txt2img/minimax.ts`**，`POST {baseUrl}/image_generation`（默认 Base 含 `/v1`，与对话一致），按宽高推导 **`aspect_ratio`**；默认模型 **`image-01`**；测试连接走 **`GET {baseUrl}/models`**（不出图）。
- **Agnes AI**（`agnes_images`）：专用 **`ai/txt2img/agnes.ts`**，仍走 `POST …/images/generations`，但文生图 Base64 用顶层 **`return_base64: true`**（**勿**发顶层 `response_format`，与 OpenAI 官方不同）；默认模型 **`agnes-image-2.1-flash`**；固定尺寸档含 **1024×768** 等（见 **`txt2ImgCloudSizePresets`**）。API Key 控制台：**`AGNES_API_KEY_CONSOLE_URL`**。
- **测试连接**：**`ai:txt2img`** 的 **`testConnection`** 走 **`ai/txt2img/testConnection.ts`**，仅校验地址/密钥（如 OpenAI `/models`、万相 models、MiniMax models、Stability 账户等），**不出图、不消耗图像额度**；设置页由 **`AppConnectionTestButton`** + **`useConnectionTest`** 展示 pending/成功/失败（成功不弹框）。
- **侧栏「角色立绘生成」**（**`CharacterPortraitGenerateModal`**，经 **`CharacterEditDrawer`**）：**画风（本书）** + **角色形象** + **负面描述**（仅 **SD 系** backend 显示输入框；云端不展示，负面由设置内通用项与 prompt 整理承担）。字段仍持久化为 `characterBookStyle.stylePrefixZh` 与角色的 `promptZh` / `negativeZh`。关闭弹窗（应用 / 取消 / 关闭按钮）时同步草稿并 **`characterFileMetaPatch`**；打开弹窗或设置 **确定** 后递增的 **`aiConfigSyncNonce`** 会刷新侧栏对当前 **`txt2img.backend`** 的判断（实际出图 IPC 每次 **`configGet`** 读最新配置）。
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

#### 网格拖动排序

- **入口**：侧栏角色列表内 **按住卡片正面** 拖动；**翻面到背面时不可排序**，须先点击翻回正面。
- **顺序**：`onCommit` 更新 **`characterRoster`** 并随 **`fileMetaStore`** 落盘（与检索结果、立绘字段同一 roster 条目）。
- **背面不可拖的原因** 见 **「列表拖动排序（SortableJS）」** → **「为何不支持背面拖动排序」**。
- **实现细节**（`fallbackTolerance`、飞回动画、filter）：同节 **「角色卡排序」**。

### 内置向量模型与缓存目录

#### AI 数据缓存目录（`aiDataCacheDir`）

- **设置位置**：**设置 → AI 阅读助手 → 数据缓存目录**（**`AIConfig.aiDataCacheDir`**，空串表示默认 **`{userData}/ai/data`**）。
- **目录内容**：**`config.json`**（AI 各子项配置，不含 API Key 明文；密钥在 **`userData/ai/secrets.v1.json`**，不随数据缓存目录迁移）、**`vector.sqlite`**（及 WAL/SHM，含分块向量、按书的 Agent 会话与消息）、**`segment.sqlite`**（及 WAL/SHM，词云按章分词词频缓存）；引导文件 **`userData/ai/data-cache-root.json`** 记录当前生效根路径。
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

- OpenAI 兼容：远程仅配置 **`embedding.baseUrl`**（与对话相同），主进程用 **`openAiCompatModelsUrl`** / **`openAiCompatEmbeddingsUrl`** 派生 **`GET …/models`**、**`POST …/embeddings`**。**设置 → 向量模型 → 远程 API** 使用 **`CHAT_API_PROVIDER_PRESETS`** + **接口地址**；嵌入 **模型** 为 **`ApiEndpointInput`** + 拉取建议，可手输 **`remoteModel`**。**单次嵌入条数**（**`embedding.remoteEmbedBatchSize`**）控制建索引时每批送入 `/embeddings` 的文本条数。

### 深度思考

- **入口**：侧栏 **AI 阅读助手** 与 **角色 → AI 检索** 工具栏胶囊 **「深度思考」**（`aiAssistantDeepThinking`，持久化在 **`colorTxt.ui.settings`**）。
- **行为**：开启后 Agent 请求温度固定为 **1**，并由主进程 **`ai/chat/chatThinking.ts`** 按 **`chat.baseUrl`** 注入各厂商思考参数；流式 **`reasoning_delta`** 在助手 UI 的思考折叠区展示，写入助手消息 **`payload.reasoning`**。各厂商开关与「深度思考」列见上表 **「对话模型服务商」**。
- **工具轮历史**：DeepSeek、通义、智谱、Moonshot、硅基、OpenRouter、Gemini 兼容、**Agnes AI** 等会在 assistant 消息中回传 **`reasoning_content`**（`shouldAttachReasoningContentOnToolCalls`）。
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

### 思维导图（`mindmap` 工具）

阅读助手在用户明确要求可视化，或开启自动导图且问题适合层级展示时，可由 Agent 调用 **`mindmap`** 工具，在对话中嵌入 **markmap** 导图（非 Mermaid 正文图）。UI 由 **`AiMindmapView.vue`** 承载，数据经 **`parseMindmapToolResult.ts`** 挂到工具行。

| 项 | 说明 |
| ---- | ---- |
| 工具参数 | `reasoning`、`title`、`markdown`（`#` / `##` / `###` / `-` 层级；禁止 Mermaid `mindmap` 语法） |
| 数据流 | 须先 **`ragSearch` / `ragContext`**；全书概括（如快速提问「概括本书内容」）以 **`ragSearch`** 跨章为主；本章问题仍优先 **`ragContext(当前章)`** |
| 侧栏预览 | 工具折叠下方缩略图（`preview` 默认）：**仅展示**（`pointer-events: none`），不可拖拽；标题行与 **`AiAssistantDetailsFold`** 对齐（`icons.mindmap`）；点击预览区打开全屏；视口高度随侧栏宽度与内容约 **160–420px** 自适应；侧栏/导图 resize 时 markmap **300ms** 过渡；预览区文字不可选中 |
| 全屏大图 | `Teleport` 弹层：视口固定边距 **`padding: 6vh 4vw`**（随窗口放大，**无** 960×720 上限）；开/关 **Transition**（与 **`AppModal`** 同系淡入 + 面板缩放）；工具栏 **复原**（`icons.reset`）\|**全部收起**（`icons.fold`）\|**全部展开**（`icons.expand`）\|**导出 SVG**（`icons.download`）\|**关闭**（全局 **`aiActivityLikeBtn`**，关闭钮 danger hover）；底部一行左 **节点数/深度**、右操作说明；**滚轮缩放**（`scrollForPan: false`）；Esc/遮罩关闭后 **`blur`** 预览区，避免侧栏残留聚焦蓝框 |
| 节点交互 | **`toggleRecursively: false`**：单击节点仅切换该节点折叠状态；**全部收起**后点根节点不会递归展开整树（子节点保持原 fold 状态）。**Ctrl/Cmd+点击** 仍可递归展开/收起 |
| 导出 SVG | **`renderFullyExpandedExportSvg()`** 离屏渲染**全展开**导图后导出，与当前视图折叠状态无关 |
| 章节标记 | 展示前经 **`aiMarkdownChapterRef`**：`（ch=N）` 等替换为当前书 **章节标题**（`AiAssistantChatMessages` 传入 `chapters`）；持久化 JSON 仍为模型原始 markdown。与助手正文共用归一化（`（ch=a-b）`、序号后说明外移等），见 **`aiChapterRefPrompt`** |
| 持久化 | 工具结果 JSON 写入 SQLite **`messages`**（`role=tool`，`tool_name=mindmap`）；重开会话由 **`aiAssistantDbMessages`** 还原 |
| 自动出图 | **设置 → AI 阅读助手 →「生成思维导图」**（`AIConfig.autoMindmapOnSummaryAndCharacters`，默认开启）。关闭后仅在用户提到「思维导图」「导图」等时注入出图提示；**不**写死全部快速提问 |
| 意图判定 | **`@shared/aiMindmapIntent`**：`explicit`（用户显式要导图）/ `auto`（开放型结构化问题，由用户原话驱动）/ `none`；定位章节、单点事实查询等排除自动导图 |
| 与词云互斥 | **`@shared/aiVisualToolIntent`**：同轮若同时检测到词云与导图意图，默认**优先词云**；仅当用户原话显式同时要两者（如同时出现「词云」与「思维导图/关系图」）才双工具注入 |
| 默认快速提问 | `这章讲了什么`、`生成人物关系图`、`生成人名词云`、`概括本书内容`（`DEFAULT_AI_QUICK_QUESTIONS`；设置页 **恢复默认** 或配置缺省/空列表时回退） |
| 依赖 | **`markmap-lib`** / **`markmap-view`** 为 devDependencies，打进 renderer bundle（与 `marked` 类似，非整包 `node_modules` 外链） |

意图与 rag 后追问：**`@shared/aiMindmapIntent`**；主进程转换与统计：**`aiMindmapTool.ts`**（含 Mermaid `mindmap` 语法兜底转 Markdown 层级）。

### 词云图（`wordcloud` 工具）

阅读助手在用户提到「词云」或相关表述时，可由 Agent 调用 **`wordcloud`** 工具生成交互式词云（**d3-cloud** + Canvas）。UI 由 **`AiWordcloudView.vue`** 承载，数据经 **`parseWordcloudToolResult.ts`** 挂到工具行。**不依赖向量索引**，词频由主进程本地分词统计。

| 项 | 说明 |
| ---- | ---- |
| 工具参数 | `reasoning`、`title`、`mode`（`general` \| `semantic`）、`semanticQuery`（semantic 必填，贴近用户原话）、`scope`（`full` \| `chapter`）、`chapterIndex`、`maxWords`（未指定时用设置 **`wordcloudMaxWords`**，默认 **80**，范围 **10–200**） |
| **general** | 全书或单章高频词：`@node-rs/jieba` 分词 + 停用词过滤；按章词频合并后取 Top N |
| **semantic** | 两阶段：① 抽样章节 LLM **抽取**候选词项；② 全书计数后 LLM 按 **`semanticQuery`** **筛选**相关词（无预设语义类别，由用户原话驱动，如「武功招式」「角色名」等） |
| 分词缓存 | 数据缓存根下 **`segment.sqlite`**（`segmentCache.ts`）：按 **`bookHash` + chapterIndex** 缓存章级词频；章节正文变更时按 content hash 重建；侧栏 **更多 → 重建词云分词**（`ai:segment:rebuildBook`）可全书预热 |
| 防剧透 | 与阅读助手共用 **`spoilerSafe`**：统计章节范围不超过当前阅读章节 |
| 进度 | 工具折叠区展示阶段标题（构建分词缓存、语义抽取/筛选等） |
| 侧栏预览 | 与思维导图类似：缩略 Canvas、点击打开全屏；标题行 **`icons.wordcloud`** |
| 全屏交互 | **字体**（`FontPicker`，独立于阅读器字体）、**角度布局**（水平/垂直/混合，`wordcloudAngleMode`）、**配色**（`wordcloudPalettes`）、**重新生成**（递增 **`layoutSeed`** 换布局）、**导出 PNG**；拖动平移、滚轮缩放。全屏面板为让角度/配色菜单溢出而 **`overflow: visible`**，顶栏须自带上圆角（与思维导图弹层 `overflow: hidden` 裁切不同） | |
| 布局 seed | 每条词云独立 **`layoutSeed`**，写入 tool 消息 JSON；**重新生成**后经 **`ai:messageUpdateToolContent`** IPC 持久化，重开会话布局不变 |
| 统计行 | 左下角：**语义：xxx，词项：xxx**（general 模式仅显示词项数） |
| 词项上限 | **设置 → AI 阅读助手 → 词云图词项上限**（`AIConfig.wordcloudMaxWords`）；主进程 **`aiWordcloudTool`** 与 Agent 参数 **`maxWords`** 均钳制于此 |
| UI 偏好持久化 | **`colorTxt.ui.settings`**：**`wordcloudFontFamily`**、**`wordcloudAngleMode`**、**`wordcloudPaletteId`**（全局，非按会话） |
| 意图 | **`@shared/aiWordcloudIntent`**：检测词云意图、`general`/`semantic` 模式、从用户原话提炼 **`semanticQuery`**；与思维导图同轮互斥见 **`aiVisualToolIntent`** |
| 持久化 | 工具结果 JSON 写入 SQLite **`messages`**（`role=tool`，`tool_name=wordcloud`）；重开会话由 **`aiAssistantDbMessages`** 还原 |

主进程实现：**`tools/wordcloudTool.ts`**、**`tools/wordcloudChapterFetch.ts`**、**`aiJieba.ts`**、**`aiSegmentCache.ts`**；语义 prompt：**`@shared/aiWordcloudSemanticFocus`**（含高亮词检索用的 **`collectMax`**）；停用词：**`@shared/aiWordcloudStopwords`**。打包时 **`@node-rs/jieba`** 原生扩展经 **`asarUnpack`** 解出，**`prune-pack-deps`** 仅保留目标平台 **`jieba-*`** 包（交叉编译时用 **`npm pack`** 补装，例如 darwin-x64）。

### 高亮词 AI 检索（需启用 AI 阅读助手）

侧栏 **「高亮词」** 标题行在总开关 **`aiEnabled`** 开启时显示 **「AI 检索」**（图标 **`icons.aiSearch`** / `AI_search.svg`），用于按语义批量收集本书词语并打开 **「添加高亮词」** 面板。与角色「AI 检索」、对话词云不同：**不经 Agent 会话**，**不依赖向量索引**，**始终全书范围**（**不**受「防剧透」限制）。

| 项 | 说明 |
| ---- | ---- |
| 菜单 | **AI 检索：人名** / **地名** / 分隔线 / **自定义语义**（`appPrompt` 输入自由文本） |
| 管线 | 主进程 **`ai:wordcloud:run`** → 直接调 **`runWordcloudTool`**（`mode=semantic`，`unlimitedTerms: true`） |
| 结果 | 按出现次数降序的词语列表；完成后预填打开 **`HighlightTermEditModal`**（添加模式） |
| Loading | 全局蒙层 **「AI 检索中」**（`appLoading`）；检索中 **Esc** → **`ai:wordcloud:abort`** 中止（不弹错误） |
| 收集规模 | 相对词云展示放宽：更大章节抽样、分批抽取、候选上限约 **2000**、`maxTokens` 抬高；提示词要求尽可能多列（见 **`aiWordcloudSemanticFocus`** 的 `collectMax`）；仍受抽样覆盖与模型输出约束 |
| 渲染侧 | **`useHighlightAiSearch.ts`**（`ReaderSidebar` 接线）；bookHash 与助手同源（会话路径 + 正文 size/mtime） |

词云对话工具默认仍受设置 **`wordcloudMaxWords`（≤200）** 与「50～120」抽取提示约束；仅高亮词 IPC 走 `unlimitedTerms` / `collectMax` 路径。

### AI 智能排版（需启用 AI 阅读助手）

编辑模式下对全书或选区进行 AI 辅助排版（清理 HTML、乱码修复、水印/广告移除等），经 **Monaco Diff** 预览后写回磁盘。**`App.vue`** 侧 **`useAiSmartFormat`** 驱动管线，**`AiSmartFormatProgressModal`** 展示进度与 **停止**，**`useReaderSmartFormatDiff`** + **`ReaderMain`** 负责 Diff 预览（应用/放弃、预览期锁定编辑与保存）；设置项 **`aiSmartFormat`**（`@shared/aiSmartFormatTypes`）经 **`SettingsEditPanel`** 持久化于 **`colorTxt.ui.settings`**。

- **设置 → 编辑 → AI 智能排版**：预处理（清理 HTML 残留，默认开）、AI 处理（硬换行、标点、统一对话符号、**修正乱码**、**还原 \* 屏蔽**、**移除盗版水印**、**移除广告/引流**，后四项**默认开**——有 Diff 预览可校对）、后置处理（压缩空行、行首缩进，默认开）。系统提示词可在 **设置 → 技能** 中编辑内置 **「智能排版」**（无启用开关，专供本管线；不在 AI 阅读助手对话中注册为工具）。
- **入口**：编辑态顶栏「保存」右侧 **AI 智能排版**（全文，确认后执行；**`AppHeader`**，`canUseAiSmartFormat`）；右键 **AI 智能排版：选中文本** / **全文**。排版进行中或 Diff 预览时禁用编辑开关与智能排版按钮。
- **分段**（`aiSmartFormat/aiSmartFormatSegments.ts`）：全文有章节表时按章切分，且**包含第一章标题前的内容**（书名、简介、序等）；单章或章前段超过 **8000 字**时再按字数切块（尽量在换行处断开）。无章节时整文按 8000 字切块。选区超过 **6000 字**时同样按 8000 字切块。仅需本地预处理（如仅清 HTML）且无 LLM 时可为单段同步完成。
- **进度弹窗**（`AiSmartFormatProgressModal.vue`）：状态行固定 **正在处理…**；仅多段（`total > 1`）时显示 **当前进度：M/N**（`M` 在某段**处理完成**后更新）；需 LLM 时展示 **累计消耗 Token**（输入/缓存命中/输出与花费约，跨段累加，样式同 **`AiTokenUsageBanner`**，标签「累计消耗 Token」）。底栏 **停止**（`danger`）可中断：若已有成功变更的段落，进入 Diff 预览**仅含已完成段**对应行范围；若尚无成功段落则直接结束。停止提示为 **warning** Toast。
- **流程**：内存中逐段调用对话模型（及本地预处理）→ 校验通过后合并为 **proposed** → 后置 **压缩空行** / **行首缩进** → 在原编辑器区域打开 **Monaco Diff**（左原文、右排版结果）。预览顶栏：**排版预览**、差异计数与 **上/下处差异**（`Ctrl+↑/↓`）、**空白差异** / **折叠未更改** 工具、**放弃** / **应用**。预览期 **`Ctrl+F` / 菜单「查找」** 打开 Monaco 查找栏（当前聚焦的 Diff 侧；无焦点时默认右侧 modified）。预览期间锁定编辑模式与保存；仍可对右侧 modified 模型执行顶栏 **格式化**（压缩空行、行首缩进；**未**单独挂接 **「格式化：转换」** 子菜单，见 [基础功能.md](./基础功能.md) → **「简繁与全半角转换」**）。Diff 对照区**不**套用阅读区 **左右边距**（`readerHorizontalInsetPx`），放弃/应用后恢复。**应用** 后一次性写回并选中变更范围；**放弃** 前经确认弹框，确认后关闭预览且主文档不变。
- **类型与默认**（`@shared/aiSmartFormatTypes.ts`）：**`AiSmartFormatSettings`**、**`defaultAiSmartFormatSettings`**（乱码/屏蔽/水印/引流等默认开）、分段进度与 Review session 类型；**`aiSmartFormatHasAnyTask`** 判定是否至少启用一项任务。
- **实现要点**：渲染侧 **`useAiSmartFormat.ts`**（管线与 session）、**`useReaderSmartFormatDiff.ts`** + **`monaco/readerDiffEditorOptions.ts`**（Diff 编辑器）、**`aiSmartFormat/*`**（分段、后置处理、Review 类型、放弃确认文案）；主进程 **`ai/chat/textFormatCleanup.ts`**（`ai:text-format:cleanup` / `abort`，经 **`registerAiIpc.ts`** 注册）。
- **说明**：不能替代以正确编码重新打开文件；写回后不支持撤销；全书耗时与 Token 消耗随分段数增长。提示词与硬性约束均禁止「的 / 地 / 得」语法互替；段结果写回前会按原文还原此类替换（`revertDeDiDeParticleSubstitutions`）。

### Token 用量

- **总开关**：**设置 → AI 阅读助手 →「显示 Token 消耗信息」**（`AIConfig.showTokenUsage`，默认开启）。关闭后侧栏不展示 Token 条，设置内 **「每百万 Token 价格」** 区块一并隐藏。
- **发送后、助手折叠区之前**：主进程发出 **`token_usage_estimate`**（`estimateAgentTurnTokens`：system + 历史 JSON 字符数 + 固定工具轮缓冲 + 第二轮 prompt 比例项；向量检索开启时另加 **`ragContext` 结果缓冲**；输出按 `maxTokens` 的约 12% 粗估）。仅为参考，**简单寒暄/身份类问题常明显偏高**（实际往往单轮、无工具）。
- **对话结束后**：先发 **`token_usage_final`**（汇总 Agent 各轮 `stream_options.include_usage` 与章节压缩中的 `chatCompletionOnce` usage），再发 **`done`**。渲染层用 **`AiTokenUsageBanner`** 在助手气泡后插入实际消耗条；有实际值后移除同 `requestId` 的预估条。
- **输入缓存命中**：`extractUsageFromChatJson` 解析 **`prompt_cache_hit_tokens`**、**`prompt_tokens_details.cached_tokens`**（OpenAI / OpenRouter 等）、**`cache_read_input_tokens`** 等；展示为「输入 N（缓存命中 M）」；**无需为 OpenRouter / Gemini 单独写适配**，取决于上游 `usage` 是否返回字段。
- **花费估算**：在设置中填写 **`chat.tokenPricePerMillion`**（输入缓存命中 / 未命中、输出，单位：元/百万 Token；**0 表示未设置**）。须同时配置 **输出价** 与 **至少一项输入价** 才在消耗条末尾显示 **「总花费约：¥…」**；仅设一项输入价时全部输入按该价计。金额由 **`formatTokenUsageCost`** 格式化（去掉小数尾随 0）。
- **角色检索**：**AI 检索** 流程中主进程 **`aiCharacterPortrait`** 汇总 LLM usage，侧栏在 **「正在检索…」** 折叠区下方显示同款 **`AiTokenUsageBanner`**（同样受 **`showTokenUsage`** 控制）。
- **智能排版**：多段 LLM 清理时在 **`AiSmartFormatProgressModal`** 中跨段累加展示 **累计消耗 Token**（见 **「AI 智能排版」**）。
- **持久化**：最终助手消息的 SQLite **`payload`** JSON 可含 **`tokenUsage`**、**`tokenUsageAvailable`**（与 **`reasoning`** 并列）；历史重载时由 **`aiAssistantDbMessages`** 还原 token 条。
- **事件路由注意**：`token_usage_final` 会把 token 条插在助手气泡**之后**，故处理 **`done` / `error`** 时须用 **`findLiveAgentAssistant()`**（按 `agentLive` 或末条 `assistant` 定位），不能假定 `messages` 最后一项仍是助手，否则无法结束「正在思考…」与等待状态。

### `userData` 中的 AI 相关路径

| 路径 / 目录 | 说明 |
| ----------- | ---- |
| `ai/data/`（默认数据缓存根） | **`config.json`**、**`vector.sqlite`**（+ WAL/SHM）、**`segment.sqlite`**（+ WAL/SHM，词云分词缓存）；实际根目录取 **`aiDataCacheDir`** 或 **`data-cache-root.json`** |
| `ai/secrets.v1.json` | **API 密钥保险库**（与 `config.json` 分离；不含聊天正文）。见下节 **「API 密钥保险库」** |
| `ai/data-cache-root.json` | 记录当前生效的 AI 数据缓存绝对路径（`aiDataFs`） |
| `ai/model-cache/`（默认内置模型缓存根） | 内置 Transformers 权重；其下 **`transformers-cache/`**；实际根目录取 **`embedding.builtinModelCacheDir`** |
| `ai/config.json`、`ai/vector.sqlite`（旧版） | 仅迁移前遗留；启动时尽量迁入 **`ai/data/`** |
| `CharacterPortrait/`（默认子目录） | 角色立绘与相关 PNG 缓存根（路径受 `characterPortraitCacheDir` 控制；内部按书名再分子目录） |

### API 密钥保险库（`secrets.v1.json`）

主进程 **`secretStorage.ts`** 将敏感字段加密写入 **`userData/ai/secrets.v1.json`**（与 **`config.json`**、向量库分离）。写入经**串行队列**串行化，落盘为 **`secrets.v1.json.tmp` → `rename`** 原子替换，避免关窗/并发写导致整文件损坏。

| 正式 slot（`@shared/secretSlots`） | 内容 |
| ---------------------------------- | ---- |
| **`ai.embedding.apiKey`** | 向量嵌入远程 API 单密钥（非按方案） |
| **`ai.chatProfileKeys`** | 对话方案密钥 JSON：`{ [profileId]: apiKey }` |
| **`ai.txt2imgProfileKeys`** | 文生图方案密钥 JSON：`{ [profileId]: apiKey }` |
| **`voiceRead.profileKeys`** | 朗读方案密钥 JSON：`{ [profileId]: { dashscopeApiKey?, minimaxApiKey?, mimoApiKey?, volcengineApiKey? } }` |
| **`translation.providerKeys`** | 选区翻译服务凭证 JSON（DeepL / 百度 / 有道 / 腾讯 / 火山 / 阿里等密钥与签名用标识；AI 翻译为 **`aiProfileKeys`** 按方案映射；见 [基础功能.md](./基础功能.md) →「选区翻译」） |

**已废弃 slot**（仅启动迁移时 **`getDeprecatedSecret`** 读一次，迁入 profile 映射后 **`purgeDeprecatedSecretSlots`** 删除，不再写入）：

| 废弃 slot | 原用途 |
| --------- | ------ |
| **`ai.chat.apiKey`** | 旧版对话单密钥 |
| **`ai.txt2img.apiKey`** | 旧版文生图单密钥 |
| **`voiceRead.dashscopeApiKey`** | 旧版朗读通义单密钥 |

**持久化时机**（关窗 **`persistSettings()`** / **`persistWindowUnloadState()`** **均不写**保险库）：

| 能力 | 写入路径 |
| ---- | -------- |
| AI 对话 / 文生图 / 嵌入 | 设置 **确定** → **`ai:config:set`** → **`saveAiConfig`**（合并 `*ProfileKeys`，**`mergeProfileKeyMapsForSave`**） |
| 语音朗读 | 设置 **确定** → **`App.vue` `applySettings`** → **`persistVoiceReadSecretsToVault`**（**`secrets:setVoiceReadSecrets`**）；启动时 **`migrateVoiceReadSecretsToVaultIfNeeded`** 补迁 |
| 选区翻译 | 翻译设置变更 / 设置 **确定** → **`persistTranslationSecretsToVault`**（**`secrets:setTranslationSecrets`**）；启动 **`hydrateTranslationSecretsFromVault`** |
| 启动灌回 | **`hydrateApiKeysFromVault`**（AI）、**`hydrateVoiceReadSecretsFromVault`**（语音）、**`hydrateTranslationSecretsFromVault`**（翻译）；若 profile id 与映射不对齐，**`reconcileOrphanProfileKeys`** 将孤儿密钥挂回当前活跃方案 |

**localStorage**：**`colorTxt.ui.settings`** 中 **`voiceRead`** 及各方案 **`engineConfig`** **不含**密钥明文；根级 **`engineConfig`** 亦经 **`stripVoiceReadSettingsApiKeysForDisk`** 剥除。火山 `volcengineApiKey` 与其他朗读密钥一样进入系统凭据库，运行时才灌回内存供合成使用，**不会写入 `localStorage`**。

**多方案与多密钥**：同一 slot 内的 JSON 按 **方案 id** 索引，**不是**按服务商；同服务商多套方案、多套密钥可并存，互不同步覆盖。

### `localStorage` 与 `file.meta` 中的 AI 相关键

- **`colorTxt.ui.settings`**：**`aiSkillsEnabled`**、**`aiSkillOverrides`**、**`aiCustomSkills`**、**`aiAssistantDeepThinking`**、**`aiAssistantSpoilerSafe`**；**`voiceRead`**（引擎、朗读方案、单/多音色、**emotionEnabled** 等，见 **「语音朗读」**）；**`timedScroll`**（定时滚动，见 [基础功能.md](./基础功能.md) → **「定时滚动」**）；**`aiSmartFormat`**（编辑模式智能排版开关组，见 **「AI 智能排版」**）；**`textConvertZh`**、**`textConvertLetter`**、**`textConvertDigit`**（顶栏「转换」阅读模式展示层，见 [基础功能.md](./基础功能.md) → **「简繁与全半角转换」**）；**`characterPortraitCacheDir`**（空串表示使用默认 `userData/CharacterPortrait`）；**`characterCardTextureEffect`**（角色卡闪卡纹理 id，默认 **`soft`**，见 **「角色卡 3D 倾斜与闪卡纹理」**）；**`wordcloudFontFamily`**、**`wordcloudAngleMode`**、**`wordcloudPaletteId`**（词云全屏 UI 偏好，见 **「词云图」**）。朗读过滤 / 自动暂停另存 **`colortxt:voiceReadSpeak`**（见 [语音朗读](./语音朗读.md)）。其余界面与阅读字段仍见 [基础功能.md](./基础功能.md) → **「数据存储说明」**中的 `PersistedSettingsData` / `cacheStore.ts`。
- **`colorTxt.file.meta`**：**`characterRoster`**、**`characterBookStyle`**、角色 **`voiceReadVoiceId`** / **`voiceReadLanguage`** / **`voiceReadDialect`** 等（类型见 `@shared/characterTypes`），与书签、阅读进度、电子书转换路径等字段并列，详见 `FileMetaRecord` / `fileMetaStore.ts`。

### 主要 Vue 组件（AI / 角色与相关设置）

表格单元格内换行使用 HTML `<br>`。

| 文件 | 主要功能 |
| ---- | -------- |
| `ReaderSidebar.vue` | 侧栏容器：活动栏含 **笔记**、**AI 助手**、**角色** 等（`constants/readerSidebarTab.ts`）。<br>挂载 **`AnnotationListPanel`**、**`AiAssistantPanel`**、**`CharacterSidebarPanel`** 等；**`askAiWithQuote`** 切 tab 并 **`prefillQuotedText`**；**角色 → 更多 → 卡片效果** 子菜单（`CHARACTER_CARD_TEXTURE_EFFECTS`、分隔线、`AppShellMenuTeleport`）；`v-model:character-card-texture-effect` 与 `App.vue` 同步 |
| `SettingsPanel.vue` | 设置壳层：确定时校验向量维度、**数据/模型缓存目录迁移**、`configSet`（AI 密钥）与 `emit('apply')`（含 **`persistVoiceReadSecretsToVault`**）；「数据管理 / 清除缓存」见 [基础功能.md](./基础功能.md) →「数据管理」 |
| `SettingsTabBar.vue` | 页签含 **`voiceRead`** / `ai` / `vectorModel` / `txt2img` / `skills` / `edit` / `general` / `reading`。<br>`showAiExtensionTabs` 为 false 时隐藏向量模型 / 角色卡 / 技能扩展页签 |
| `SettingsAIPanel.vue` | 「AI 阅读助手」：总开关；服务商含 **MiniMax**；**配置方案**；对话模型（**`ApiEndpointInput`** 可手输模型 ID，拉取结果为建议）+ **测试连接**；Token 与 **`aiDataCacheDir`**；快速提问等 |
| `AiMindmapView.vue` | 阅读助手思维导图：侧栏预览 + 全屏交互（markmap）；全部收起/展开、章节标题替换、**全展开** SVG 导出 |
| `AiWordcloudView.vue` | 阅读助手词云：侧栏预览 + 全屏 Canvas（d3-cloud）；字体/角度/配色、重新生成（`layoutSeed`）、PNG 导出。全屏面板 `overflow: visible`（角度/配色菜单），顶栏自带上圆角 |
| `ApiEndpointInput.vue` | 可手输文本 + 可选建议列表。接口地址的建议常为空；对话模型 ID、远程嵌入模型等把拉取结果当作建议 |
| `AiTokenUsageBanner.vue` | Token 消耗与花费展示条（阅读助手、角色检索共用） |
| `AiIndexProgressBanner.vue` | 向量建索引进度条（阅读助手建索引、角色检索前补索引） |
| `SettingsVectorModelPanel.vue` | 「向量模型」：内置/远程；远程含 **测试连接** + 嵌入模型（建议+手输）；切块与 **`ragTopK`** |
| `SettingsTxt2ImgPanel.vue` | 「角色卡」：服务商 + 地址（含 **MiniMax** `minimax_images`）；云端 Key/**测试连接**/模型建议；**固定尺寸**或 **自由宽高**；OpenAI 画质；A1111/Comfy 参数；**立绘缓存目录** |
| `AppConnectionTestButton.vue` | 设置页共用测试连接按钮（`useConnectionTest`） |
| `SettingsSkillsPanel.vue` | 「技能」：内置技能开关与覆盖、自定义技能列表；footer「添加技能」打开 **`SettingsSkillEditModal`** |
| `SettingsVoiceReadPanel.vue` | 「语音朗读」：朗读方案、引擎（含 **MiMo**、**火山引擎 `volcengine`**）、单/多音色、AI 识别、**情绪标注**、通义/MiniMax/MiMo/火山密钥与测试连接；火山接入豆包语音合成大模型 2.0、444 个官方音色与默认可改的 24 kHz PCM，各槽位可选手动语种/方言，连接测试会合成一个汉字并产生极少量用量；页底 **朗读设置**（过滤 / 自动暂停，见 [语音朗读](./语音朗读.md)） |
| `SettingsVolcengineVoiceSpeechMode.vue` | 火山语种/方言下拉（设置页槽位 / 角色卡抽屉共用） |
| `VoiceReadToolbar.vue` | 顶栏朗读控制条（含 **音量** 滑块与左侧 **朗读设置** 齿轮；设置内 **音调** 为合成参数）；与 **定时滚动** 互斥 |
| `SettingsSkillEditModal.vue` | 自定义技能新建/编辑弹窗 |
| `AppPullFlashButton.vue` | 设置面板内刷新模型/采样器列表等，完成态闪光反馈 |
| `PathPickerInput.vue` | 目录选择（含 **角色立绘缓存根目录** 等） |
| `AiAssistantPanel.vue` | 侧栏 AI 阅读助手主面板：会话、输入、`onAgentEvent`（流式增量、工具、`token_usage_*`、`done`/`error`）；历史列表会话名 **`title`** 悬停提示；**`findLiveAgentAssistant`**；受 **`showTokenUsage`** 控制 Token 条。<br>标题行 **更多**：重建向量索引 / 重建词云分词；清除向量索引缓存 / 清除词云分词缓存 / 清除对话记录（`ai:index:deleteBook` 仅向量；`ai:segment:deleteBook` / `ai:segment:rebuildBook`）。<br>**导出**默认名 **`{书名}-{对话标题}[（带思考过程）].chat.{md\|json}`**（`aiAssistantExport.buildChatExportDefaultName`）。<br>**`prefillQuotedText(text)`**：阅读器 **「问 AI」** 填入 blockquote 引用并 autosize / 滚至光标 |
| `AiAssistantChatMessages.vue` | 消息列表：用户/助手气泡、思考块、工具折叠、**`AiMindmapView`** / **`AiWordcloudView`**（传入 `chapters`）；**`AiMarkdown`** 章节跳转；**`AiTokenUsageBanner`** |
| `AiAssistantDetailsFold.vue` | 助手详情折叠（与 `directives/aiStickScroll`、`useAiFoldContentSelectAll` 配合） |
| `AiToolFoldBody.vue` | 工具折叠正文；超长章压缩进度中 **`当前进度：M/N`** 高亮（`utils/aiToolFoldBody.ts`） |
| `AiMarkdown.vue` | 助手回复 Markdown（`aiMarkdownMarkedSetup` / `Prep`、`aiMarkdownChapterRef`） |
| `CharacterSidebarPanel.vue` | 侧栏「角色」编排根：角色卡网格、**拖动排序**、**`popoverCardId`** 原位放大、导入/导出包；立绘 FS 经 **`useCharacterPortraitFs`**；编辑经 **`CharacterEditDrawer`**；下发 **`characterCardTextureEffect`** / **`aiConfigSyncNonce`** |
| `CharacterEditDrawer.vue` | 角色编辑/新建抽屉：草稿保存删除、语音试听、立绘上传；火山专属音色可再选语种/方言；挂载 **`useCharacterPortraitRetrieve`** 与 **`CharacterPortraitGenerateModal`** |
| `CharacterPortraitGenerateModal.vue` | 立绘 txt2img：预览、生成/中止/应用、提示词持久化 |
| `CharacterRosterCard.vue` | 角色卡（2:3、3D 翻转、全息层、倾斜、原位放大）；背面滚动边界不带动外层列表 |
| `SettingsEditPanel.vue` | 「编辑」：**显示行号**、**启用小地图**、**自动刷新章节列表**；**AI 智能排版**开关组（`aiSmartFormat`） |
| `AppHeader.vue` | 编辑态顶栏 **AI 智能排版** 按钮（`canUseAiSmartFormat`）；排版进行中或 Diff 预览时禁用 |
| `AiSmartFormatProgressModal.vue` | 智能排版进度弹窗：**正在处理…**、多段时 **当前进度：M/N**、累计 Token 条（**`AiTokenUsageBanner`**）、**停止**（`danger`）；挂载于 **`App.vue`** |
| `AppShellMenuTeleport.vue` | 侧栏 Teleport 菜单壳（卡片效果 flyout 等） |

### 源码与 IPC 速查

主进程 **`registerAiIpc.ts`** 集中注册 `ai:*` IPC（含 **`ai:embedding:builtin:*`**、**`ai:text-format:*`** 智能排版、**`ai:wordcloud:run` / `ai:wordcloud:abort`** 高亮词 AI 检索、**`ai:migrateDataCacheRoot`** / **`ai:migrateBuiltinModelCacheRoot`**、**`ai:messageUpdateToolContent`** 等）；实现见 **`src/main/ai/`**（**`infra/`**、**`chat/`**、**`rag/embedding/`**、**`txt2img/`**、**`tools/`**）。渲染侧智能排版：**`useAiSmartFormat.ts`**、**`aiSmartFormat/*`**、**`AiSmartFormatProgressModal.vue`**；高亮词 AI 检索：**`useHighlightAiSearch.ts`**；向量索引：**`ai/buildBookVectorIndex.ts`**、**`ai/embeddingReady.ts`**。预加载 **`window.colorTxt.ai.*`** 见 **「`src/preload/index.ts`（预加载）」**。

角色卡倾斜/放大/纹理/排序（无独立 IPC）：**`@shared/characterCardTextureEffects`**、**`composables/useCharacterCardTilt.ts`**、**`composables/useCharacterCardPopoverZoom.ts`**、**`composables/useCharacterRosterReorder.ts`**、**`composables/useCharacterPortraitFs.ts`**、**`composables/useCharacterPortraitRetrieve.ts`**、**`composables/useSortableReorder.ts`**、**`utils/characterCardSpring.ts`**、**`utils/characterCardTiltDom.ts`**、**`styles/characterCardHolo*.css`**、**`components/CharacterRosterCard.vue`** / **`CharacterEditDrawer.vue`** / **`CharacterPortraitGenerateModal.vue`**；见 **「角色卡 3D 倾斜与闪卡纹理」** 与 **「列表拖动排序（SortableJS）」**。
