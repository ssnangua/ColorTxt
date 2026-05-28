<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";
import type ReaderMain from "./ReaderMain.vue";
import type { Chapter } from "../chapter";
import { pickActiveChapterIdx } from "../reader/chapterIndex";
import type { AIAgentRendererEvent } from "@shared/aiTypes";
import {
  EMPTY_TOKEN_PRICE_PER_MILLION,
  normalizeAiQuickQuestions,
  normalizeTokenPricePerMillion,
  type AITokenPricePerMillion,
} from "@shared/aiTypes";
import type { AiCustomSkill, AiSkillUserOverride } from "@shared/aiSkills";
import { collectEnabledAgentSkills } from "@shared/aiSkills";
import {
  isAiVectorIndexAbortError,
  runAiBookVectorIndexBuild,
} from "../ai/buildBookVectorIndex";
import { getBuiltinEmbeddingBlockMessage } from "../ai/embeddingReady";
import { hashBookBrowser } from "../utils/aiBookHash";
import {
  getReaderSurroundingPlainText,
  READER_SURROUNDING_DEFAULT_MAX_CHARS,
} from "../utils/readerSurroundingPlainText";
import { dirnameFs, joinFs } from "../ebook/pathUtils";
import AiAssistantChatMessages from "./AiAssistantChatMessages.vue";
import { rowsToUiMessages } from "../aiAssistant/aiAssistantDbMessages";
import type { UiTokenUsageMsg } from "../aiAssistant/aiAssistantTypes";
import {
  buildChatExportDefaultName,
  buildAssistantChatExportJson,
  buildAssistantChatExportMarkdown,
  resolveExportThreadTitle,
} from "../aiAssistant/aiAssistantExport";
import {
  formatHistoryGroupLabel,
  formatThreadListTime,
  localDayKey,
} from "../aiAssistant/aiAssistantHistoryFormat";
import { assistantPlainText } from "../aiAssistant/aiAssistantPlainText";
import {
  appendReasoningDelta,
  buildSkillToolDisplayLabels,
  finalizeLiveThinkingAfterStop,
  sealLiveThinkingBeforeTool,
} from "../aiAssistant/aiAssistantSegments";
import type {
  AiHistoryThreadGroup,
  AiThreadListRow,
  UiAssistantMsg,
  UiMsg,
} from "../aiAssistant/aiAssistantTypes";
import AppCustomSelect, { type CustomSelectItem } from "./AppCustomSelect.vue";
import { icons } from "../icons";
import { appAlert } from "../services/appDialog";
import { appToast } from "../services/appToast";

/** 导出对话下拉菜单固定宽度（与内容版式一致，不作视口/触发器推算） */
const AI_EXPORT_MENU_WIDTH_PX = 210;

const selectListsEmpty: CustomSelectItem[] = [];

const LIST_STICK_BOTTOM_PX = 48;

/** 「回到底部」自定义平滑滚动：路程越长略久，并夹在区间内（原生 smooth 无法调速度） */
const AI_CHAT_SMOOTH_SCROLL_MIN_MS = 200;
const AI_CHAT_SMOOTH_SCROLL_MAX_MS = 1100;
/** 滚动快慢：数值越大同样路程耗时越短（像素/秒） */
const AI_CHAT_SMOOTH_SCROLL_SPEED_PX_PER_SEC = 3200;

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

const props = defineProps<{
  sessionFilePath: string | null;
  physicalReaderPath: string | null;
  chapters: Chapter[];
  activeChapterIdx: number;
  readerMainRef: InstanceType<typeof ReaderMain> | null;
  /**
   * 侧栏当前是否停留在「AI 阅读助手」页（与 `v-show` 一致）。
   * 未传时视为 true（兼容旧用法）；隐藏时会话加载后的贴底滚动推迟到可见时补一次，不会因单纯切换 Tab 而重复滚底。
   */
  assistantPanelVisible?: boolean;
  /** 设置 → 技能（未传则按「全部内置启用、无自定义」收集） */
  aiSkillsEnabled?: Record<string, boolean>;
  aiSkillOverrides?: Record<string, AiSkillUserOverride>;
  aiCustomSkills?: AiCustomSkill[];
  /** 设置「确定」保存 AI 配置后递增，用于刷新快速提问与对话模型缓存 */
  aiConfigSyncNonce?: number;
}>();

const emit = defineEmits<{
  jumpToChapter: [chapter: Chapter];
  /** 全屏：历史/导出/模型菜单等 Teleport 打开，用于抑制移出侧栏即收起 */
  "update:fullscreenAiAssistantPopoversOpen": [open: boolean];
}>();

const bookHash = ref("");
const threadId = ref<string | null>(null);
const messages = ref<UiMsg[]>([]);
const input = ref("");
const streaming = ref(false);
/** 从发送后到收到完成/错误：含索引、检索与等待首 token */
const chatAwaitingReply = ref(false);
const activeRequestId = ref(0);
const deepThinking = defineModel<boolean>("deepThinking", { default: false });
const spoilerSafe = defineModel<boolean>("spoilerSafe", { default: false });
const historyOpen = ref(false);
const chatModelOptions = ref<string[]>([]);
/** 上次拉取模型列表时的对话接口指纹（baseUrl + apiKey） */
const chatModelsListFingerprint = ref("");
const chatModelsLoading = ref(false);
/** 侧栏模型下拉「拉取模型」：加载 / 成功闪绿 / 失败 danger */
const composerPullModelsPhase = ref<"idle" | "loading" | "success" | "fail">(
  "idle",
);
let composerPullModelsSuccessTimer: ReturnType<typeof setTimeout> | null = null;
/** 与设置里保存的 `chat.model` 对齐，用于判断是否传 `chatModelOverride` */
const savedConfigModel = ref("");
const activeChatModel = ref("");
const chatTokenPricePerMillion = ref<AITokenPricePerMillion>({
  ...EMPTY_TOKEN_PRICE_PER_MILLION,
});
const showTokenUsage = ref(true);
const showJumpBottom = ref(false);
/** 平滑滚到底部进行中：勿根据 scroll 更新「回到底部」显隐，避免 dist 反复越过阈值闪烁 */
const jumpBottomRevealSuppressed = ref(false);
/** 聊天列表是否在底部附近；仅在为 true 时随流式更新自动滚到底 */
const listStickBottom = ref(true);
/**
 * 会话列表在隐藏面板内加载完成时无法滚到底（clientHeight 为 0），待面板可见后补一次；
 * 不为「每次切换到 AI Tab」而设，仅服务于加载消息后的贴底。
 */
const pendingScrollToBottomAfterVisible = ref(false);

const assistantTabEffectiveVisible = computed(
  () => props.assistantPanelVisible ?? true,
);

const skillToolDisplayLabels = computed(() =>
  buildSkillToolDisplayLabels(props.aiCustomSkills ?? []),
);

let jumpBottomSmoothDoneTimer: number | null = null;
let jumpBottomSmoothRafId: number | null = null;

function cancelJumpBottomSmoothRaf() {
  if (jumpBottomSmoothRafId != null) {
    cancelAnimationFrame(jumpBottomSmoothRafId);
    jumpBottomSmoothRafId = null;
  }
}

/** 列表容器平滑滚至当前最大 scrollTop，结束时调用 onComplete（仅用于「回到底部」） */
function runScrollListToBottomSmooth(
  el: HTMLElement,
  onComplete: () => void,
): void {
  const start = el.scrollTop;
  const max0 = el.scrollHeight - el.clientHeight;
  const dist0 = Math.max(0, max0 - start);
  if (dist0 < 1) {
    el.scrollTop = max0;
    onComplete();
    return;
  }
  const duration = Math.min(
    AI_CHAT_SMOOTH_SCROLL_MAX_MS,
    Math.max(
      AI_CHAT_SMOOTH_SCROLL_MIN_MS,
      (dist0 / AI_CHAT_SMOOTH_SCROLL_SPEED_PX_PER_SEC) * 1000,
    ),
  );
  const t0 = performance.now();
  const step = (now: number) => {
    const u = Math.min(1, (now - t0) / duration);
    const eased = easeOutCubic(u);
    const maxScroll = el.scrollHeight - el.clientHeight;
    el.scrollTop = start + (maxScroll - start) * eased;
    if (u < 1) {
      jumpBottomSmoothRafId = requestAnimationFrame(step);
    } else {
      jumpBottomSmoothRafId = null;
      el.scrollTop = el.scrollHeight - el.clientHeight;
      onComplete();
    }
  };
  jumpBottomSmoothRafId = requestAnimationFrame(step);
}

function endJumpBottomSmoothScrollTracking(syncJumpButton: boolean) {
  if (jumpBottomSmoothDoneTimer != null) {
    clearTimeout(jumpBottomSmoothDoneTimer);
    jumpBottomSmoothDoneTimer = null;
  }
  cancelJumpBottomSmoothRaf();
  jumpBottomRevealSuppressed.value = false;
  if (syncJumpButton) {
    const root = listRef.value;
    if (root) {
      const d = root.scrollHeight - root.scrollTop - root.clientHeight;
      showJumpBottom.value = d > 100;
    }
  }
}
const threads = ref<AiThreadListRow[]>([]);

const historyThreadGroups = computed((): AiHistoryThreadGroup[] => {
  const list = [...threads.value].sort((a, b) => b.updatedAt - a.updatedAt);
  const groups: AiHistoryThreadGroup[] = [];
  let curKey = "";
  for (const t of list) {
    const dk = localDayKey(t.updatedAt);
    if (dk !== curKey) {
      curKey = dk;
      groups.push({
        dayKey: dk,
        label: formatHistoryGroupLabel(dk),
        threads: [t],
      });
    } else {
      groups[groups.length - 1]!.threads.push(t);
    }
  }
  return groups;
});

const indexPhase = ref<
  "idle" | "chunking" | "embedding" | "indexing" | "error"
>("idle");
const indexEmbedCurrent = ref(0);
const indexEmbedTotal = ref(0);
const indexError = ref("");

/** 分块/向量化/写入索引进行中；`idle` 与 `error` 时可再次发起重建 */
function isAiVectorIndexPhaseBusy(): boolean {
  const p = indexPhase.value;
  return p === "chunking" || p === "embedding" || p === "indexing";
}

/** 列表展示：末尾追加临时「索引/向量化」消息，随滚动区滚动并在贴底时可见 */
const messagesForChatView = computed((): UiMsg[] => {
  const base = showTokenUsage.value
    ? messages.value
    : messages.value.filter((m) => m.role !== "tokenUsage");
  const ph = indexPhase.value;
  if (ph === "idle") return base;
  if (ph === "error") {
    return [
      ...base,
      {
        id: "__indexBanner",
        role: "indexBanner",
        phase: "error",
        errorText: indexError.value,
      },
    ];
  }
  return [
    ...base,
    {
      id: "__indexBanner",
      role: "indexBanner",
      phase: ph,
      embedCurrent: indexEmbedCurrent.value,
      embedTotal: indexEmbedTotal.value,
    },
  ];
});

const listRef = ref<HTMLElement | null>(null);
const historyBtnRef = useTemplateRef<HTMLButtonElement>("historyBtnRef");
const exportBtnRef = useTemplateRef<HTMLButtonElement>("exportBtnRef");
const historyDropdownRef = ref<HTMLElement | null>(null);
const exportMenuOpen = ref(false);
const exportDropdownRef = ref<HTMLElement | null>(null);
const exportDropLeft = ref(0);
const exportDropTop = ref(0);
const historyDropLeft = ref(0);
const historyDropTop = ref(0);
const historyDropWidth = ref(280);
/** 对话模型 AppCustomSelect 下拉是否展开（全屏侧栏收起抑制） */
const chatModelPanelOpen = ref(false);

watch(
  () => historyOpen.value || exportMenuOpen.value || chatModelPanelOpen.value,
  (v) => {
    emit("update:fullscreenAiAssistantPopoversOpen", v);
  },
  { immediate: true },
);

const composerInputRef =
  useTemplateRef<HTMLTextAreaElement>("composerInputRef");
const threadTitleInputRef = useTemplateRef<HTMLInputElement>(
  "threadTitleInputRef",
);

const threadTitleEditing = ref(false);
const threadTitleEditDraft = ref("");

const currentThreadTitle = computed(() => {
  const tid = threadId.value;
  if (!tid) return "—";
  const row = threads.value.find((x) => x.id === tid);
  return row?.title?.trim() || "新对话";
});

watch(threadId, () => {
  threadTitleEditing.value = false;
  /** 索引条/错误与会话无关，切换对话时清掉，避免上一会话的失败提示一直挂着 */
  indexPhase.value = "idle";
  indexError.value = "";
  indexEmbedCurrent.value = 0;
  indexEmbedTotal.value = 0;
});

function onThreadTitleDblClick() {
  if (
    !hasFile.value ||
    !threadId.value ||
    chatAwaitingReply.value ||
    streaming.value
  )
    return;
  threadTitleEditDraft.value = currentThreadTitle.value;
  threadTitleEditing.value = true;
  void nextTick(() => {
    const el = threadTitleInputRef.value;
    el?.focus();
    el?.select?.();
  });
}

async function submitThreadTitleEdit() {
  if (!threadTitleEditing.value) return;
  const tid = threadId.value;
  const next = threadTitleEditDraft.value.trim() || "新对话";
  const prev = currentThreadTitle.value;
  if (!tid || next === prev) {
    threadTitleEditing.value = false;
    return;
  }
  threadTitleEditing.value = false;
  try {
    await window.colorTxt.ai.threadRename(tid, next, true);
    await loadThreadList();
  } catch {
    // ignore
  }
}

function cancelThreadTitleEdit() {
  threadTitleEditing.value = false;
}

function onThreadTitleEditKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    void submitThreadTitleEdit();
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancelThreadTitleEdit();
    (e.target as HTMLInputElement).blur();
  }
}

/** 用于在分块等本地阶段响应「停止」（与主进程 embedding abort 配合） */
const currentTurnAbort = shallowRef<AbortController | null>(null);
/** 本轮已成功发起 Agent（等待主进程 done/error） */
const awaitingAgentDone = ref(false);
/** 用户中止：主进程仍会回送 done，由渲染进程持久化并跳过整表重载 */
const agentUserAbort = ref(false);

function isAbortLike(e: unknown): boolean {
  return isAiVectorIndexAbortError(e);
}

function abortActiveAiWork(requestId: number) {
  currentTurnAbort.value?.abort();
  currentTurnAbort.value = null;
  void window.colorTxt.ai.embedAbort(requestId);
  window.colorTxt.ai.chatAbort(requestId);
}

/** 输入区最大高度（px），超出后出现滚动条 */
const COMPOSER_INPUT_MAX_PX = 168;

function autosizeComposerInput() {
  const el = composerInputRef.value;
  if (!el) return;
  const maxPx = COMPOSER_INPUT_MAX_PX;
  /** 先折叠再测高度，避免沿用上一帧带滚动条时的 clientWidth 导致 scrollHeight 抖动 */
  el.style.overflow = "hidden";
  el.style.height = "0px";
  const natural = el.scrollHeight;
  const capped = Math.min(natural, maxPx);
  el.style.height = `${capped}px`;
  el.style.overflowY = natural > maxPx ? "auto" : "hidden";
}
let offAgent: (() => void) | null = null;

const hasFile = computed(() =>
  Boolean(props.sessionFilePath && props.physicalReaderPath),
);

function focusComposer() {
  if (!hasFile.value) return;
  void nextTick(() => {
    composerInputRef.value?.focus();
  });
}

/** 模型下拉顶部固定项：与任意模型名不冲突 */
const CHAT_MODEL_PULL_ITEM_ID = "__ai_pull_models__";

const chatModelFixedTopItems = computed((): CustomSelectItem[] => {
  const phase = composerPullModelsPhase.value;
  const loadingUi = phase === "loading";
  const successUi = phase === "success";
  const failUi = phase === "fail";
  const prefixHtml = successUi
    ? icons.success
    : failUi
      ? icons.fail
      : icons.refresh;
  return [
    {
      kind: "item",
      id: CHAT_MODEL_PULL_ITEM_ID,
      label: "拉取模型",
      actionOnly: true,
      keepOpenOnAction: true,
      disabled: chatModelsLoading.value,
      danger: failUi,
      prefixHtml,
      prefixWrapperClass: loadingUi ? "customSelectMenuPrefixSpin" : "",
      itemClass: successUi ? "appShellMenuItem--success" : "",
    },
    { kind: "divider" },
  ];
});

const chatModelScrollItems = computed((): CustomSelectItem[] => {
  const opts = chatModelOptions.value;
  const cur = activeChatModel.value.trim();
  const merged = cur && !opts.includes(cur) ? [cur, ...opts] : opts;
  return merged.map((m) => ({
    kind: "item",
    id: m,
    label: m,
  }));
});

function truncateModelLabel(raw: string, max = 28): string {
  const s = raw.trim();
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

const chatModelDisplayLabel = computed(() =>
  truncateModelLabel(activeChatModel.value),
);

/** 设置 → AI「快速提问」；随 configGet 刷新 */
const aiQuickQuestions = ref<string[]>([]);

const aiQuickQuestionsForUi = computed(() =>
  aiQuickQuestions.value.map((s) => s.trim()).filter(Boolean),
);

const showAiQuickQuestions = computed(() => {
  if (!hasFile.value) return false;
  if (isAiVectorIndexPhaseBusy()) return false;
  if (chatAwaitingReply.value || streaming.value) return false;
  if (messages.value.some((m) => m.role === "user" || m.role === "assistant")) {
    return false;
  }
  return aiQuickQuestionsForUi.value.length > 0;
});

async function syncChatModelFromConfig() {
  try {
    const cfg = await window.colorTxt.ai.configGet();
    savedConfigModel.value = cfg.chat.model.trim();
    activeChatModel.value = cfg.chat.model.trim();
    aiQuickQuestions.value = [...cfg.quickQuestions];
    chatTokenPricePerMillion.value = normalizeTokenPricePerMillion(
      cfg.chat.tokenPricePerMillion,
    );
    showTokenUsage.value = cfg.showTokenUsage !== false;
    return cfg;
  } catch {
    savedConfigModel.value = "";
    activeChatModel.value = "";
    aiQuickQuestions.value = normalizeAiQuickQuestions(undefined);
    chatTokenPricePerMillion.value = { ...EMPTY_TOKEN_PRICE_PER_MILLION };
    showTokenUsage.value = true;
    return null;
  }
}

function chatEndpointFingerprint(cfg: {
  chat: { baseUrl: string; apiKey: string };
}): string {
  return `${cfg.chat.baseUrl.trim()}\0${cfg.chat.apiKey}`;
}

function isChatModelsListStale(cfg: {
  chat: { baseUrl: string; apiKey: string };
}): boolean {
  if (!chatModelsListFingerprint.value) return true;
  return chatModelsListFingerprint.value !== chatEndpointFingerprint(cfg);
}

async function refreshChatModels(opts?: { composerSuccessFlash?: boolean }) {
  chatModelsLoading.value = true;
  if (opts?.composerSuccessFlash) {
    if (composerPullModelsSuccessTimer != null) {
      clearTimeout(composerPullModelsSuccessTimer);
      composerPullModelsSuccessTimer = null;
    }
    composerPullModelsPhase.value = "loading";
  }
  let ok = false;
  try {
    const cfg = await window.colorTxt.ai.configGet();
    const fp = chatEndpointFingerprint(cfg);
    const r = await window.colorTxt.ai.modelsList({
      baseUrl: cfg.chat.baseUrl,
      apiKey: cfg.chat.apiKey,
    });
    ok = r.ok;
    if (r.ok) {
      chatModelOptions.value = r.models;
      chatModelsListFingerprint.value = fp;
      if (r.models.length > 0) {
        const cur = activeChatModel.value.trim();
        if (!cur || !r.models.includes(cur)) {
          activeChatModel.value = r.models[0]!;
        }
      }
    } else {
      chatModelOptions.value = [];
      chatModelsListFingerprint.value = "";
    }
  } finally {
    chatModelsLoading.value = false;
    if (
      !opts?.composerSuccessFlash &&
      ok &&
      composerPullModelsPhase.value === "fail"
    ) {
      composerPullModelsPhase.value = "idle";
    }
    if (opts?.composerSuccessFlash) {
      if (ok) {
        composerPullModelsPhase.value = "success";
        if (composerPullModelsSuccessTimer != null) {
          clearTimeout(composerPullModelsSuccessTimer);
          composerPullModelsSuccessTimer = null;
        }
        composerPullModelsSuccessTimer = setTimeout(() => {
          composerPullModelsPhase.value = "idle";
          composerPullModelsSuccessTimer = null;
        }, 1000);
      } else {
        if (composerPullModelsSuccessTimer != null) {
          clearTimeout(composerPullModelsSuccessTimer);
          composerPullModelsSuccessTimer = null;
        }
        composerPullModelsPhase.value = "fail";
      }
    }
  }
}

function onChatModelPanelOpenChange(isOpen: boolean) {
  chatModelPanelOpen.value = isOpen;
  if (!isOpen || chatModelsLoading.value) return;
  void (async () => {
    const cfg = await window.colorTxt.ai.configGet();
    if (
      chatModelOptions.value.length > 0 &&
      !isChatModelsListStale(cfg)
    ) {
      return;
    }
    void refreshChatModels();
  })();
}

function onChatModelSelectAction(id: string) {
  if (id !== CHAT_MODEL_PULL_ITEM_ID) return;
  if (chatModelsLoading.value) return;
  void refreshChatModels({ composerSuccessFlash: true });
}

function onListScroll() {
  const el = listRef.value;
  if (!el) return;
  const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
  listStickBottom.value = dist < LIST_STICK_BOTTOM_PX;
  if (!jumpBottomRevealSuppressed.value) {
    showJumpBottom.value = dist > 100;
  }
}

async function refreshBookHash() {
  bookHash.value = "";
  if (!props.sessionFilePath || !props.physicalReaderPath) return;
  try {
    const st = await window.colorTxt.stat(props.physicalReaderPath);
    if (!st.isFile) return;
    bookHash.value = await hashBookBrowser(
      props.sessionFilePath,
      st.size,
      st.mtimeMs,
    );
  } catch {
    bookHash.value = "";
  }
}

async function loadThreadList() {
  if (!bookHash.value) {
    threads.value = [];
    return;
  }
  const list = await window.colorTxt.ai.threadList(bookHash.value);
  threads.value = list.map((t) => ({
    id: t.id,
    title: t.title,
    updatedAt: t.updatedAt,
    titleLocked: Number(t.titleLocked) === 1,
  }));
}

async function maybeRenameThreadFromFirstExchange(tid: string) {
  if (!bookHash.value) return;
  const rows = await window.colorTxt.ai.messageList(tid);
  const users = rows.filter((x) => x.role === "user");
  if (users.length !== 1) return;
  const remoteThreads = await window.colorTxt.ai.threadList(bookHash.value);
  const meta = remoteThreads.find((t) => t.id === tid);
  if (meta && Number(meta.titleLocked) === 1) return;
  const curTitle = meta?.title?.trim() ?? "";
  if (curTitle && curTitle !== "新对话") return;
  const title = users[0]!.content.trim().slice(0, 24) || "对话";
  await window.colorTxt.ai.threadRename(tid, title);
  await loadThreadList();
}

async function loadMessagesForThread(tid: string) {
  const rows = await window.colorTxt.ai.messageList(tid);
  messages.value = rowsToUiMessages(rows);
  await scrollListToBottomAfterMessagesLoad();
}

async function ensureThread() {
  if (!bookHash.value) return;
  const bh = bookHash.value;
  await loadThreadList();

  if (threads.value.length === 0) {
    await window.colorTxt.ai.threadDeleteEmptyForBook(bh);
    const id = await window.colorTxt.ai.threadCreate(bh, "新对话");
    threadId.value = id;
  } else {
    await window.colorTxt.ai.threadDeleteEmptyForBook(bh, threadId.value);
    await loadThreadList();
    if (!threadId.value) {
      threadId.value = threads.value[0]!.id;
    } else if (!threads.value.some((t) => t.id === threadId.value)) {
      const rows = await window.colorTxt.ai.messageList(threadId.value);
      if (rows.length > 0) threadId.value = threads.value[0]!.id;
    }
  }
  if (threadId.value) await loadMessagesForThread(threadId.value);
}

watch(
  () => [props.sessionFilePath, props.physicalReaderPath] as const,
  () => {
    threadId.value = null;
    messages.value = [];
    void (async () => {
      await refreshBookHash();
      await syncChatModelFromConfig();
      void refreshChatModels();
      await ensureThread();
    })();
  },
  { immediate: true },
);

watch(hasFile, () => {
  void nextTick(() => autosizeComposerInput());
});

watch(
  assistantTabEffectiveVisible,
  (vis) => {
    if (!vis) return;
    void (async () => {
      const cfg = await syncChatModelFromConfig();
      if (cfg && isChatModelsListStale(cfg)) {
        void refreshChatModels();
      }
      await nextTick();
      flushPendingScrollToBottomAfterVisible();
      focusComposer();
    })();
  },
  { immediate: true },
);

watch(
  () => props.aiConfigSyncNonce ?? 0,
  (n) => {
    if (n <= 0) return;
    void (async () => {
      const cfg = await syncChatModelFromConfig();
      if (cfg) void refreshChatModels();
    })();
  },
);

function scrollToBottom(behavior: ScrollBehavior = "auto") {
  const el = listRef.value;
  if (!el) return;
  listStickBottom.value = true;
  showJumpBottom.value = false;

  if (behavior === "smooth") {
    endJumpBottomSmoothScrollTracking(false);
    jumpBottomRevealSuppressed.value = true;
    let settled = false;
    const release = () => {
      if (settled) return;
      settled = true;
      if (jumpBottomSmoothDoneTimer != null) {
        clearTimeout(jumpBottomSmoothDoneTimer);
        jumpBottomSmoothDoneTimer = null;
      }
      endJumpBottomSmoothScrollTracking(true);
    };
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const approxMs = Math.min(
      AI_CHAT_SMOOTH_SCROLL_MAX_MS,
      Math.max(
        AI_CHAT_SMOOTH_SCROLL_MIN_MS,
        (Math.max(0, dist) / AI_CHAT_SMOOTH_SCROLL_SPEED_PX_PER_SEC) * 1000,
      ),
    );
    jumpBottomSmoothDoneTimer = window.setTimeout(release, approxMs + 400);
    runScrollListToBottomSmooth(el, release);
    return;
  }

  endJumpBottomSmoothScrollTracking(false);
  el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
}

function tryApplyScrollBottomAfterMessagesLoad() {
  const el = listRef.value;
  if (!el) return;
  if (el.clientHeight <= 0) {
    pendingScrollToBottomAfterVisible.value = true;
    return;
  }
  listStickBottom.value = true;
  showJumpBottom.value = false;
  el.scrollTop = el.scrollHeight;
  pendingScrollToBottomAfterVisible.value = false;
}

function flushPendingScrollToBottomAfterVisible() {
  if (!pendingScrollToBottomAfterVisible.value) return;
  void nextTick(() => {
    requestAnimationFrame(() => tryApplyScrollBottomAfterMessagesLoad());
  });
}

async function scrollListToBottomAfterMessagesLoad() {
  await nextTick();
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  tryApplyScrollBottomAfterMessagesLoad();
}

function maybeScrollListToBottom() {
  if (!listStickBottom.value) return;
  const run = () => {
    const el = listRef.value;
    if (el) el.scrollTop = el.scrollHeight;
    showJumpBottom.value = false;
  };
  /** 流式增高大后再贴底，避免同一帧内 scrollHeight 尚未更新 */
  requestAnimationFrame(run);
}

watch(
  () =>
    [
      indexPhase.value,
      indexEmbedCurrent.value,
      indexEmbedTotal.value,
      indexError.value,
      messages.value.length,
    ] as const,
  () => {
    void nextTick(() => maybeScrollListToBottom());
  },
);

function finalizeTokenUsage(ev: {
  requestId: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptCacheHitTokens?: number;
  available: boolean;
}) {
  if (!showTokenUsage.value) return;
  messages.value = messages.value.filter(
    (m) => !(m.role === "tokenUsage" && m.requestId === ev.requestId),
  );
  let aiIdx = -1;
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i]?.role === "assistant") {
      aiIdx = i;
      break;
    }
  }
  if (aiIdx < 0) return;
  const row: UiTokenUsageMsg = {
    id: `tok_use_${ev.requestId}`,
    role: "tokenUsage",
    requestId: ev.requestId,
    promptTokens: ev.promptTokens,
    completionTokens: ev.completionTokens,
    totalTokens: ev.totalTokens,
    ...(ev.promptCacheHitTokens != null && ev.promptCacheHitTokens > 0
      ? { promptCacheHitTokens: ev.promptCacheHitTokens }
      : {}),
    available: ev.available,
  };
  messages.value.splice(aiIdx + 1, 0, row);
}

/** token 横幅插在助手气泡之后时，列表末尾不再是 assistant；须按 agentLive/末条助手定位 */
function findLiveAgentAssistant(): UiAssistantMsg | undefined {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const m = messages.value[i];
    if (m?.role === "assistant" && m.agentLive) return m;
  }
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const m = messages.value[i];
    if (m?.role === "assistant") return m;
  }
  return undefined;
}

onMounted(() => {
  document.addEventListener("pointerdown", onHistoryDocPointerDown);
  document.addEventListener("keydown", onHistoryDocKeydown, true);
  window.addEventListener("resize", onHistoryWindowResize);
  void nextTick(() => autosizeComposerInput());
  offAgent = window.colorTxt.ai.onAgentEvent((ev: AIAgentRendererEvent) => {
    if (ev.requestId !== activeRequestId.value) return;

    if (ev.type === "token_usage_final") {
      finalizeTokenUsage(ev);
      void nextTick(() => maybeScrollListToBottom());
      return;
    }

    const liveAssistant = findLiveAgentAssistant();

    switch (ev.type) {
      case "reasoning_delta":
        if (!liveAssistant) return;
        appendReasoningDelta(liveAssistant, ev.delta);
        break;
      case "content_delta":
        if (!liveAssistant) return;
        /** 开始输出正文时封存思考块，避免无 tool 轮次结束后仍显示「正在思考…」 */
        sealLiveThinkingBeforeTool(liveAssistant);
        liveAssistant.answer += ev.delta;
        break;
      case "tool_executing":
        if (!liveAssistant) return;
        sealLiveThinkingBeforeTool(liveAssistant);
        liveAssistant.tools.push({
          id: `live_${ev.toolCallId}_${Date.now()}`,
          toolCallId: ev.toolCallId,
          name: ev.name,
          argsPreview: ev.argsPreview,
          status: "running",
          preview: "",
          full: "",
          open: false,
          progressTitle: "",
          progressMessage: "",
        });
        liveAssistant.segments.push({ kind: "toolRef", toolCallId: ev.toolCallId });
        break;
      case "tool_progress": {
        if (!liveAssistant) return;
        const t = liveAssistant.tools.find((x) => x.toolCallId === ev.toolCallId);
        if (t) {
          t.progressTitle = ev.title;
          t.progressMessage = ev.detail;
        }
        break;
      }
      case "tool_result": {
        if (!liveAssistant) return;
        const t = liveAssistant.tools.find((x) => x.toolCallId === ev.toolCallId);
        if (t) {
          t.status = ev.ok ? "done" : "error";
          t.preview = ev.preview;
          t.full = ev.full;
        }
        break;
      }
      case "round_end":
        if (!liveAssistant) return;
        /** 多轮 tool 之间模型常在 assistant.content 里重复输出草稿；清空以免叠在同一条气泡里 */
        liveAssistant.answer = "";
        break;
      case "done":
        streaming.value = false;
        chatAwaitingReply.value = false;
        currentTurnAbort.value = null;
        awaitingAgentDone.value = false;
        if (liveAssistant) {
          liveAssistant.agentLive = false;
          finalizeLiveThinkingAfterStop(liveAssistant);
        }
        if (agentUserAbort.value) {
          agentUserAbort.value = false;
          if (liveAssistant) {
            void (async () => {
              const tid = threadId.value;
              if (!tid) return;
              const aid = await window.colorTxt.ai.messageAppend(
                tid,
                "assistant",
                assistantPlainText(liveAssistant),
                true,
              );
              liveAssistant.id = aid;
              liveAssistant.createdAt = Date.now();
              await maybeRenameThreadFromFirstExchange(tid);
            })();
          }
          break;
        }
        void (async () => {
          const tid = threadId.value;
          if (tid) {
            await loadMessagesForThread(tid);
            await maybeRenameThreadFromFirstExchange(tid);
          }
        })();
        break;
      case "error":
        streaming.value = false;
        chatAwaitingReply.value = false;
        currentTurnAbort.value = null;
        awaitingAgentDone.value = false;
        agentUserAbort.value = false;
        if (liveAssistant) {
          liveAssistant.agentLive = false;
          finalizeLiveThinkingAfterStop(liveAssistant);
          if (liveAssistant.answer.trim()) liveAssistant.errorDetail = ev.message;
          else {
            liveAssistant.answer = ev.message;
            liveAssistant.error = true;
          }
        }
        break;
      default:
        break;
    }
    void nextTick(() => maybeScrollListToBottom());
  });
});

onBeforeUnmount(() => {
  if (composerPullModelsSuccessTimer != null) {
    clearTimeout(composerPullModelsSuccessTimer);
    composerPullModelsSuccessTimer = null;
  }
  endJumpBottomSmoothScrollTracking(false);
  document.removeEventListener("pointerdown", onHistoryDocPointerDown);
  document.removeEventListener("keydown", onHistoryDocKeydown, true);
  window.removeEventListener("resize", onHistoryWindowResize);
  offAgent?.();
  if (chatAwaitingReply.value || streaming.value) {
    onStop();
  }
});

/** 侧栏 header「更多 → 重建向量索引」；与首次发送前的建索共用 buildIndex 与 indexPhase 展示 */
async function requestRebuildVectorIndex(): Promise<void> {
  const cfg = await window.colorTxt.ai.configGet();
  if (!cfg.embeddingEnabled) {
    await appAlert(
      "请先在「设置」→「向量模型」中启用向量模型，再构建索引。",
    );
    return;
  }
  const blockMsg = await getBuiltinEmbeddingBlockMessage(cfg);
  if (blockMsg) {
    await appAlert(blockMsg);
    return;
  }
  if (isAiVectorIndexPhaseBusy()) {
    appToast("索引任务正在进行中，请稍候。", {
      kind: "primary",
    });
    return;
  }
  if (chatAwaitingReply.value || streaming.value) {
    appToast("对话正在进行中，请先停止或等待完成后再重建索引。");
    return;
  }
  activeRequestId.value += 1;
  const requestId = activeRequestId.value;
  const ac = new AbortController();
  try {
    const success = await buildIndex(ac.signal, requestId);
    if (!success && !ac.signal.aborted && !indexError.value.trim()) {
      indexPhase.value = "error";
      indexError.value = "索引未完成。";
    }
  } catch (e) {
    if (isAiVectorIndexAbortError(e) || ac.signal.aborted) return;
    indexPhase.value = "error";
    indexError.value = e instanceof Error ? e.message : String(e);
  }
}

async function buildIndex(
  signal: AbortSignal,
  requestId: number,
): Promise<boolean> {
  if (!bookHash.value || !props.readerMainRef?.getAllText) return false;
  if (signal.aborted) {
    const e = new Error("Aborted");
    e.name = "AbortError";
    throw e;
  }
  const hooks = {
    onPhase: (p: "chunking" | "embedding" | "indexing") => {
      indexPhase.value = p;
    },
    onEmbedProgress: (cur: number, tot: number) => {
      indexEmbedTotal.value = tot;
      indexEmbedCurrent.value = cur;
    },
    clearError: () => {
      indexError.value = "";
    },
    setError: (m: string) => {
      indexError.value = m;
    },
    setPhaseIdle: () => {
      indexPhase.value = "idle";
    },
    setPhaseError: () => {
      indexPhase.value = "error";
    },
  };
  return runAiBookVectorIndexBuild({
    signal,
    embedRequestId: requestId,
    bookHash: bookHash.value,
    fullText: props.readerMainRef.getAllText(),
    chapters: props.chapters,
    hooks,
    abortMode: "throw",
  });
}

async function ensureIndexed(
  requestId: number,
  signal: AbortSignal,
): Promise<boolean> {
  if (!bookHash.value) return false;
  const cfg = await window.colorTxt.ai.configGet();
  if (!cfg.embeddingEnabled) return true;
  const has = await window.colorTxt.ai.indexHasBook(bookHash.value);
  if (has) return true;
  return buildIndex(signal, requestId);
}

/** 必须以阅读器视口探针为准，避免侧栏 activeChapterIdx 未及时同步时错章 */
function resolvedChapterIdxForAi(): number {
  const probe = props.readerMainRef?.getProbeLine?.() ?? 1;
  const fromProbe = pickActiveChapterIdx(props.chapters, probe);
  if (fromProbe >= 0) return fromProbe;
  if (props.activeChapterIdx >= 0) return props.activeChapterIdx;
  return -1;
}

function bookMetaPayload() {
  const path = props.sessionFilePath ?? "";
  const base =
    path
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^.]+$/, "") ?? "未命名";
  const idx = resolvedChapterIdxForAi();
  const ch = idx >= 0 ? props.chapters[idx] : undefined;
  const reader = props.readerMainRef ?? undefined;
  const sel = reader?.getSelectedText?.()?.trim() ?? "";
  const selPart =
    sel.length > 0 ? (sel.length > 320 ? `${sel.slice(0, 320)}…` : sel) : "";
  const windowCap = selPart ? 400 : READER_SURROUNDING_DEFAULT_MAX_CHARS;
  const windowPart = getReaderSurroundingPlainText(reader, windowCap).trim();
  const surroundingParts: string[] = [];
  if (idx >= 0 && ch) {
    const titleBit = (ch.title ?? "").trim() || "（无标题）";
    surroundingParts.push(
      `【与本节选同位的当前章】第 ${idx + 1} 章 · ${titleBit}（总结/问答「本章」时 ragContext 的 chapterIndex=${idx}）`,
    );
  }
  if (selPart) surroundingParts.push(`当前选中：\n${selPart}`);
  if (windowPart) surroundingParts.push(`视窗周边：\n${windowPart}`);
  const surroundingText =
    surroundingParts.length > 0 ? surroundingParts.join("\n\n") : undefined;

  return {
    fileTitle: base,
    chapterCount: Math.max(props.chapters.length, 1),
    currentChapterIndex: idx,
    currentChapterTitle:
      idx >= 0 ? (ch?.title ?? "") : "（阅读位置未匹配到章节）",
    ...(surroundingText !== undefined ? { surroundingText } : {}),
  };
}

async function onQuickQuestion(q: string) {
  const text = q.trim();
  if (!text || chatAwaitingReply.value || streaming.value || !hasFile.value) {
    return;
  }
  input.value = text;
  await nextTick();
  autosizeComposerInput();
  await onSend();
}

async function onSend() {
  const text = input.value.trim();
  if (!text || chatAwaitingReply.value || !hasFile.value) return;
  await ensureThread();
  const tid = threadId.value;
  if (!tid || !bookHash.value) return;

  const cfg = await window.colorTxt.ai.configGet();
  const effectiveModel = activeChatModel.value.trim() || cfg.chat.model.trim();
  if (!effectiveModel) {
    await appAlert("请先在设置 → AI 中配置对话模型，或在本面板选择模型。");
    return;
  }

  input.value = "";
  void nextTick(() => autosizeComposerInput());
  /** 首条用户消息一落库就立刻按问题命名，不必等 Agent 结束（done 里仍会再调一次，已改名则 no-op） */
  const priorUserCount = messages.value.filter((m) => m.role === "user").length;
  const uid = await window.colorTxt.ai.messageAppend(tid, "user", text);
  if (priorUserCount === 0) void maybeRenameThreadFromFirstExchange(tid);
  const userTs = Date.now();
  messages.value.push({
    id: uid,
    role: "user",
    content: text,
    createdAt: userTs,
  });
  messages.value.push({
    id: `pending_${userTs}`,
    role: "assistant",
    segments: [{ kind: "think", sealed: false, text: "", open: true }],
    tools: [],
    answer: "",
    createdAt: userTs,
    agentLive: true,
  });
  chatAwaitingReply.value = true;
  /** 须在占位助手行插入后再测 scrollHeight，否则会少滚一截，流式输出时也依赖 listStickBottom 正确贴底 */
  await nextTick();
  scrollToBottom();
  awaitingAgentDone.value = false;
  agentUserAbort.value = false;
  activeRequestId.value += 1;
  const requestId = activeRequestId.value;

  const turnAc = new AbortController();
  currentTurnAbort.value = turnAc;

  try {
    const ok = await ensureIndexed(requestId, turnAc.signal);
    if (turnAc.signal.aborted) {
      const e = new Error("Aborted");
      e.name = "AbortError";
      throw e;
    }
    if (!ok) {
      streaming.value = false;
      chatAwaitingReply.value = false;
      currentTurnAbort.value = null;
      const last = messages.value[messages.value.length - 1];
      if (last?.role === "assistant") {
        last.answer =
          indexError.value.trim() !== ""
            ? `索引失败：${indexError.value}`
            : "索引未完成，无法启动阅读助手。";
        last.error = true;
        last.agentLive = false;
        finalizeLiveThinkingAfterStop(last);
      }
      /** 错误已写入助手气泡，收起索引条，避免与气泡内「索引失败：…」双条重复 */
      indexPhase.value = "idle";
      indexError.value = "";
      return;
    }

    streaming.value = true;
    currentTurnAbort.value = null;

    const bookMeta = bookMetaPayload();
    const override =
      activeChatModel.value.trim() &&
      activeChatModel.value.trim() !== savedConfigModel.value.trim()
        ? activeChatModel.value.trim()
        : undefined;

    const start = await window.colorTxt.ai.agentStart({
      requestId,
      threadId: tid,
      bookHash: bookHash.value,
      userText: text,
      bookMeta,
      deepThinking: deepThinking.value,
      spoilerSafe: spoilerSafe.value,
      chatModelOverride: override,
      slidingWindowSize: cfg.chat.slidingWindowSize,
      enabledSkills: collectEnabledAgentSkills(
        props.aiSkillsEnabled ?? {},
        props.aiSkillOverrides ?? {},
        props.aiCustomSkills ?? [],
      ),
    });
    if (!start.ok) {
      streaming.value = false;
      chatAwaitingReply.value = false;
      currentTurnAbort.value = null;
      const last = messages.value[messages.value.length - 1];
      if (last?.role === "assistant") {
        last.answer = start.error ?? "无法发起对话";
        last.error = true;
        last.agentLive = false;
        finalizeLiveThinkingAfterStop(last);
      }
      return;
    }
    awaitingAgentDone.value = true;
  } catch (e) {
    streaming.value = false;
    chatAwaitingReply.value = false;
    currentTurnAbort.value = null;
    awaitingAgentDone.value = false;
    const last = messages.value[messages.value.length - 1];
    if (isAbortLike(e) || turnAc.signal.aborted) {
      if (last?.role === "assistant") {
        last.aborted = true;
        last.agentLive = false;
        finalizeLiveThinkingAfterStop(last);
        void (async () => {
          const t = threadId.value;
          if (!t || last.role !== "assistant") return;
          const aid = await window.colorTxt.ai.messageAppend(
            t,
            "assistant",
            assistantPlainText(last),
            true,
          );
          last.id = aid;
          last.createdAt = Date.now();
          await maybeRenameThreadFromFirstExchange(t);
        })();
      }
      return;
    }
    if (last?.role === "assistant") {
      last.answer = e instanceof Error ? e.message : String(e);
      last.error = true;
      last.agentLive = false;
      finalizeLiveThinkingAfterStop(last);
    }
  }
}

function onStop() {
  const rid = activeRequestId.value;
  const shouldWaitAgentDone = awaitingAgentDone.value && streaming.value;
  if (shouldWaitAgentDone) agentUserAbort.value = true;
  abortActiveAiWork(rid);
  streaming.value = false;
  chatAwaitingReply.value = false;
  currentTurnAbort.value = null;
  const last = messages.value[messages.value.length - 1];
  if (last?.role === "assistant") {
    last.aborted = true;
    last.agentLive = false;
    finalizeLiveThinkingAfterStop(last);
  }
  if (!shouldWaitAgentDone && last?.role === "assistant") {
    awaitingAgentDone.value = false;
    void (async () => {
      const t = threadId.value;
      if (!t) return;
      const aid = await window.colorTxt.ai.messageAppend(
        t,
        "assistant",
        assistantPlainText(last),
        true,
      );
      last.id = aid;
      last.createdAt = Date.now();
      await maybeRenameThreadFromFirstExchange(t);
    })();
  }
}

async function onNewChat() {
  if (!bookHash.value) return;
  if (streaming.value) onStop();
  else if (chatAwaitingReply.value) {
    abortActiveAiWork(activeRequestId.value);
    chatAwaitingReply.value = false;
  }
  const prevId = threadId.value;
  const id = await window.colorTxt.ai.threadCreate(bookHash.value, "新对话");
  threadId.value = id;
  messages.value = [];
  showJumpBottom.value = false;
  listStickBottom.value = true;
  if (prevId && prevId !== id) {
    const prevRows = await window.colorTxt.ai.messageList(prevId);
    if (prevRows.length === 0) await window.colorTxt.ai.threadDelete(prevId);
  }
  await nextTick();
  const listEl = listRef.value;
  if (listEl) listEl.scrollTop = 0;
  await loadThreadList();
  historyOpen.value = false;
  focusComposer();
}

async function positionHistoryDropdown() {
  const trig = historyBtnRef.value;
  if (!trig) return;
  const r = trig.getBoundingClientRect();
  historyDropWidth.value = Math.max(280, Math.min(420, r.width + 240));
  historyDropLeft.value = r.left;
  historyDropTop.value = r.bottom + 4;
  await nextTick();
  const panel = historyDropdownRef.value;
  if (!panel) return;
  const margin = 8;
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  const maxX = Math.max(margin, window.innerWidth - w - margin);
  const maxY = Math.max(margin, window.innerHeight - h - margin);
  historyDropLeft.value = Math.min(
    Math.max(margin, historyDropLeft.value),
    maxX,
  );
  historyDropTop.value = Math.min(Math.max(margin, historyDropTop.value), maxY);
}

async function toggleHistoryDropdown() {
  if (historyOpen.value) {
    historyOpen.value = false;
    return;
  }
  exportMenuOpen.value = false;
  await loadThreadList();
  historyOpen.value = true;
  await nextTick();
  await positionHistoryDropdown();
}

async function positionExportDropdown() {
  const trig = exportBtnRef.value;
  if (!trig) return;
  const r = trig.getBoundingClientRect();
  exportDropLeft.value = r.right - AI_EXPORT_MENU_WIDTH_PX;
  exportDropTop.value = r.bottom + 4;
  await nextTick();
  const panel = exportDropdownRef.value;
  if (!panel) return;
  const margin = 8;
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  const maxX = Math.max(margin, window.innerWidth - w - margin);
  const maxY = Math.max(margin, window.innerHeight - h - margin);
  exportDropLeft.value = Math.min(Math.max(margin, exportDropLeft.value), maxX);
  exportDropTop.value = Math.min(Math.max(margin, exportDropTop.value), maxY);
}

async function toggleExportMenu() {
  if (messages.value.length === 0) return;
  exportMenuOpen.value = !exportMenuOpen.value;
  if (exportMenuOpen.value) {
    historyOpen.value = false;
    await nextTick();
    await positionExportDropdown();
  }
}

function resolveExportSaveDefaultPath(fileName: string): string | undefined {
  const base = props.physicalReaderPath || props.sessionFilePath;
  if (!base?.trim()) return undefined;
  const dir = dirnameFs(base.trim());
  if (!dir || dir === ".") return undefined;
  return joinFs(dir, fileName);
}

async function exportMd() {
  const tid = threadId.value;
  if (!tid || messages.value.length === 0) return;
  exportMenuOpen.value = false;
  const exportTitle = resolveExportThreadTitle(
    threadId.value,
    threads.value,
    messages.value,
  );
  const name = buildChatExportDefaultName(exportTitle, "md", false);
  const r = await window.colorTxt.ai.exportSave({
    defaultName: name,
    defaultPath: resolveExportSaveDefaultPath(name),
    data: buildAssistantChatExportMarkdown(
      messages.value,
      exportTitle,
      false,
      skillToolDisplayLabels.value,
    ),
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (!r.ok && "error" in r) await appAlert(r.error);
}

async function exportMdWithReasoning() {
  const tid = threadId.value;
  if (!tid || messages.value.length === 0) return;
  exportMenuOpen.value = false;
  const exportTitle = resolveExportThreadTitle(
    threadId.value,
    threads.value,
    messages.value,
  );
  const name = buildChatExportDefaultName(exportTitle, "md", true);
  const r = await window.colorTxt.ai.exportSave({
    defaultName: name,
    defaultPath: resolveExportSaveDefaultPath(name),
    data: buildAssistantChatExportMarkdown(
      messages.value,
      exportTitle,
      true,
      skillToolDisplayLabels.value,
    ),
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (!r.ok && "error" in r) await appAlert(r.error);
}

async function exportJson() {
  const tid = threadId.value;
  if (!tid || messages.value.length === 0) return;
  exportMenuOpen.value = false;
  const exportTitle = resolveExportThreadTitle(
    threadId.value,
    threads.value,
    messages.value,
  );
  const name = buildChatExportDefaultName(exportTitle, "json", false);
  const r = await window.colorTxt.ai.exportSave({
    defaultName: name,
    defaultPath: resolveExportSaveDefaultPath(name),
    data: buildAssistantChatExportJson(
      messages.value,
      exportTitle,
      false,
      skillToolDisplayLabels.value,
    ),
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!r.ok && "error" in r) await appAlert(r.error);
}

async function exportJsonWithReasoning() {
  const tid = threadId.value;
  if (!tid || messages.value.length === 0) return;
  exportMenuOpen.value = false;
  const exportTitle = resolveExportThreadTitle(
    threadId.value,
    threads.value,
    messages.value,
  );
  const name = buildChatExportDefaultName(exportTitle, "json", true);
  const r = await window.colorTxt.ai.exportSave({
    defaultName: name,
    defaultPath: resolveExportSaveDefaultPath(name),
    data: buildAssistantChatExportJson(
      messages.value,
      exportTitle,
      true,
      skillToolDisplayLabels.value,
    ),
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!r.ok && "error" in r) await appAlert(r.error);
}

async function copyAllMarkdown() {
  if (messages.value.length === 0) return;
  exportMenuOpen.value = false;
  try {
    const exportTitle = resolveExportThreadTitle(
      threadId.value,
      threads.value,
      messages.value,
    );
    await navigator.clipboard.writeText(
      buildAssistantChatExportMarkdown(
        messages.value,
        exportTitle,
        false,
        skillToolDisplayLabels.value,
      ),
    );
  } catch {
    appToast("复制失败：剪贴板不可用");
  }
}

async function copyAllMarkdownWithReasoning() {
  if (messages.value.length === 0) return;
  exportMenuOpen.value = false;
  try {
    const exportTitle = resolveExportThreadTitle(
      threadId.value,
      threads.value,
      messages.value,
    );
    await navigator.clipboard.writeText(
      buildAssistantChatExportMarkdown(
        messages.value,
        exportTitle,
        true,
        skillToolDisplayLabels.value,
      ),
    );
  } catch {
    appToast("复制失败：剪贴板不可用");
  }
}

function onHistoryDocPointerDown(ev: PointerEvent) {
  const t = ev.target as Node | null;
  if (historyOpen.value) {
    if (t && historyDropdownRef.value?.contains(t)) return;
    if (t && historyBtnRef.value?.contains(t)) return;
    historyOpen.value = false;
  }
  if (exportMenuOpen.value) {
    if (t && exportDropdownRef.value?.contains(t)) return;
    if (t && exportBtnRef.value?.contains(t)) return;
    exportMenuOpen.value = false;
  }
}

function onHistoryDocKeydown(ev: KeyboardEvent) {
  if (ev.key !== "Escape") return;
  if (historyOpen.value) {
    ev.preventDefault();
    historyOpen.value = false;
    return;
  }
  if (exportMenuOpen.value) {
    ev.preventDefault();
    exportMenuOpen.value = false;
  }
}

function onHistoryWindowResize() {
  if (historyOpen.value) void positionHistoryDropdown();
  if (exportMenuOpen.value) void positionExportDropdown();
}

async function selectThread(id: string) {
  if (streaming.value) onStop();
  else if (chatAwaitingReply.value) {
    abortActiveAiWork(activeRequestId.value);
    chatAwaitingReply.value = false;
  }
  threadId.value = id;
  await loadMessagesForThread(id);
  historyOpen.value = false;
  focusComposer();
}

function onHistoryRowKeydown(e: KeyboardEvent, id: string) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    void selectThread(id);
  }
}

async function deleteThread(id: string) {
  await window.colorTxt.ai.threadDelete(id);
  if (threadId.value === id) threadId.value = null;
  await ensureThread();
  if (historyOpen.value) {
    await nextTick();
    await positionHistoryDropdown();
  }
}

async function onChClick(chapterIndexZeroBased: number) {
  const ch = props.chapters[chapterIndexZeroBased];
  if (ch) emit("jumpToChapter", ch);
  else
    appToast(
      `未找到第 ${chapterIndexZeroBased + 1} 章（chapterIndex=${chapterIndexZeroBased}）`,
    );
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void onSend();
  }
}

defineExpose({
  requestRebuildVectorIndex,
});
</script>

<template>
  <div class="aiPanel">
    <template v-if="hasFile">
      <div class="aiToolbarRow">
        <button
          ref="historyBtnRef"
          type="button"
          class="aiActivityLikeBtn"
          title="历史对话"
          aria-label="历史对话"
          aria-haspopup="listbox"
          :aria-expanded="historyOpen"
          @click="toggleHistoryDropdown"
        >
          <span class="svg" v-html="icons.history" />
        </button>
        <div class="aiToolbarThreadTitleWrap">
          <input
            v-if="threadTitleEditing"
            ref="threadTitleInputRef"
            v-model="threadTitleEditDraft"
            class="aiToolbarThreadTitleInput"
            type="text"
            maxlength="120"
            aria-label="会话名称"
            @blur="submitThreadTitleEdit"
            @keydown="onThreadTitleEditKeydown"
          />
          <span
            v-else
            class="aiToolbarThreadTitle"
            :title="currentThreadTitle"
            @click="onThreadTitleDblClick"
            >{{ currentThreadTitle }}</span
          >
        </div>
        <div class="aiToolbarEnd">
          <button
            ref="exportBtnRef"
            type="button"
            class="aiActivityLikeBtn"
            title="导出对话"
            aria-label="导出对话"
            aria-haspopup="menu"
            :aria-expanded="exportMenuOpen"
            :disabled="messages.length === 0"
            @click="toggleExportMenu"
          >
            <span class="svg" v-html="icons.download" />
          </button>
          <button
            type="button"
            class="aiActivityLikeBtn"
            title="新对话"
            @click="onNewChat"
          >
            <span class="svg" v-html="icons.newChat" />
          </button>
        </div>
      </div>

      <Teleport to="body">
        <div
          v-if="historyOpen"
          ref="historyDropdownRef"
          class="aiHistoryDropdown appShellMenuPanel"
          data-fullscreen-sidebar-float
          role="listbox"
          aria-label="会话历史"
          :style="{
            left: `${historyDropLeft}px`,
            top: `${historyDropTop}px`,
            width: `${historyDropWidth}px`,
          }"
          @click.stop
        >
          <ul
            v-if="threads.length > 0"
            class="aiHistoryDropdownList"
            role="presentation"
          >
            <template v-for="g in historyThreadGroups" :key="g.dayKey">
              <li class="aiHistoryDropdownDate" role="presentation">
                {{ g.label }}
              </li>
              <li
                v-for="t in g.threads"
                :key="t.id"
                class="aiHistoryDropdownRow"
                :class="{ 'is-active': t.id === threadId }"
                role="option"
                tabindex="-1"
                :aria-selected="t.id === threadId"
                @click="selectThread(t.id)"
                @keydown="onHistoryRowKeydown($event, t.id)"
              >
                <div class="aiHistoryDropdownRowBody">
                  <div class="aiHistoryDropdownTitleRow">
                    <span class="aiHistoryDropdownLabel">{{
                      t.title || "未命名"
                    }}</span>
                    <time
                      class="aiHistoryDropdownTime"
                      :datetime="new Date(t.updatedAt).toISOString()"
                      >{{ formatThreadListTime(t.updatedAt) }}</time
                    >
                  </div>
                </div>
                <button
                  type="button"
                  class="aiHistoryDropdownDelete"
                  title="删除会话"
                  aria-label="删除会话"
                  tabindex="-1"
                  @click.stop="deleteThread(t.id)"
                >
                  <span class="svg" v-html="icons.remove" />
                </button>
              </li>
            </template>
          </ul>
          <p v-else class="aiHistoryDropdownEmpty">暂无对话记录</p>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="exportMenuOpen"
          ref="exportDropdownRef"
          class="aiExportDropdown appShellMenuPanel"
          data-fullscreen-sidebar-float
          role="menu"
          aria-label="导出"
          :style="{
            left: `${exportDropLeft}px`,
            top: `${exportDropTop}px`,
            width: `${AI_EXPORT_MENU_WIDTH_PX}px`,
          }"
          @click.stop
        >
          <button
            type="button"
            class="appShellMenuItem"
            role="menuitem"
            @click="exportMd"
          >
            导出 Markdown
          </button>
          <button
            type="button"
            class="appShellMenuItem"
            role="menuitem"
            @click="exportMdWithReasoning"
          >
            导出 Markdown（带思考过程）
          </button>
          <div class="appShellMenuDivider" role="presentation" />
          <button
            type="button"
            class="appShellMenuItem"
            role="menuitem"
            @click="exportJson"
          >
            导出 JSON
          </button>
          <button
            type="button"
            class="appShellMenuItem"
            role="menuitem"
            @click="exportJsonWithReasoning"
          >
            导出 JSON（带思考过程）
          </button>
          <div class="appShellMenuDivider" role="presentation" />
          <button
            type="button"
            class="appShellMenuItem"
            role="menuitem"
            @click="copyAllMarkdown"
          >
            复制全部
          </button>
          <button
            type="button"
            class="appShellMenuItem"
            role="menuitem"
            @click="copyAllMarkdownWithReasoning"
          >
            复制全部（带思考过程）
          </button>
        </div>
      </Teleport>

      <div class="aiListWrap">
        <div ref="listRef" class="aiList" @scroll="onListScroll">
          <AiAssistantChatMessages
            :messages="messagesForChatView"
            :skill-tool-labels="skillToolDisplayLabels"
            :token-price-per-million="
              showTokenUsage ? chatTokenPricePerMillion : null
            "
            @chapter-click="onChClick"
          />
        </div>
        <button
          v-show="showJumpBottom"
          type="button"
          class="aiJumpBottom"
          @click="scrollToBottom('smooth')"
        >
          <span class="svg" v-html="icons.jumpBottom" />
          回到底部
        </button>
      </div>

      <div class="aiComposerStack">
        <div v-if="showAiQuickQuestions" class="aiQuickQuestions">
          <div class="aiQuickQuestionsTitle">快速提问</div>
          <ul class="aiQuickQuestionsList" role="list">
            <li
              v-for="(q, i) in aiQuickQuestionsForUi"
              :key="`${i}-${q}`"
              class="aiQuickQuestionItem"
              @click="onQuickQuestion(q)"
            >
              {{ q }}
            </li>
          </ul>
        </div>
        <div class="aiComposer">
          <textarea
            ref="composerInputRef"
            v-model="input"
            class="aiComposerInput"
            rows="1"
            :disabled="!hasFile || chatAwaitingReply"
            placeholder="关于这本书的问题…"
            @input="autosizeComposerInput"
            @keydown="onKeydown"
          />
          <div class="aiComposerFooter">
            <div class="aiComposerFooterMain">
              <button
                type="button"
                class="aiActivityLikeBtn aiComposerNewChatBtn"
                title="新对话"
                :disabled="!hasFile"
                @click="onNewChat"
              >
                <span class="svg" v-html="icons.newChat" />
              </button>
              <div class="aiComposerModelPickWrap">
                <AppCustomSelect
                  class="aiModelPick"
                  :model-value="activeChatModel"
                  :display-label="chatModelDisplayLabel"
                  placeholder="选择模型…"
                  :fixed-top-items="chatModelFixedTopItems"
                  :scroll-items="chatModelScrollItems"
                  :fixed-bottom-items="selectListsEmpty"
                  :scroll-max-height="260"
                  :min-panel-width="240"
                  ariaLabel="对话模型"
                  @panel-open-change="onChatModelPanelOpenChange"
                  @action="onChatModelSelectAction"
                  @update:model-value="activeChatModel = $event"
                />
              </div>
            </div>
            <button
              v-if="chatAwaitingReply"
              type="button"
              class="aiActivityLikeBtn aiComposerActionBtn aiComposerStopBtn"
              title="停止"
              @click="onStop"
            >
              <span class="svg" v-html="icons.stop" />
            </button>
            <button
              v-else
              type="button"
              class="aiActivityLikeBtn aiComposerActionBtn aiComposerSendBtn"
              title="发送"
              :disabled="!hasFile || !input.trim()"
              @click="onSend"
            >
              <span class="svg" v-html="icons.send" />
            </button>
          </div>
        </div>
        <div class="aiComposerTogglesRow">
          <button
            type="button"
            class="aiPillToggle"
            :class="{ 'aiPillToggle--on': deepThinking }"
            title="启用更深入的分析与推理过程，响应时间可能更长"
            @click="deepThinking = !deepThinking"
          >
            <span class="svg aiPillToggle__icon" v-html="icons.brain" />
            深度思考
          </button>
          <button
            type="button"
            class="aiPillToggle"
            :class="{ 'aiPillToggle--on': spoilerSafe }"
            title="避免透露当前阅读进度之后的内容"
            @click="spoilerSafe = !spoilerSafe"
          >
            <span
              class="svg aiPillToggle__icon"
              v-html="spoilerSafe ? icons.viewOff : icons.view"
            />
            防剧透
          </button>
        </div>
      </div>
    </template>
    <div v-else class="aiPanelEmpty">请先打开一本书后再开始聊天</div>
  </div>
</template>

<style scoped>
.aiPanel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg);
}

/** 与章节侧栏 `.empty` 一致：未打开文件时仅居中提示 */
.aiPanelEmpty {
  box-sizing: border-box;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 10px 16px;
  font-size: 12px;
  color: var(--secondary);
}

.aiToolbarRow {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 6px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  height: 40px;
}

.aiToolbarThreadTitleWrap {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
}

.aiToolbarThreadTitle {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
  padding: 2px 4px;
  border-radius: 4px;
}

.aiToolbarThreadTitle:hover {
  background: color-mix(in srgb, var(--fg) 6%, transparent);
}

.aiToolbarThreadTitleInput {
  flex: 1 1 auto;
  min-width: 0;
  box-sizing: border-box;
  padding: 4px 8px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--bg);
  color: var(--fg);
  font-size: 12px;
  font-family: inherit;
}

.aiToolbarThreadTitleInput:focus {
  outline: none;
}

.aiModelPick {
  min-width: 0;
  flex: unset;
}

.aiModelPick :deep(.customSelectTrigger) {
  border: none;
  background: transparent;
  color: var(--tab-fg);
}

.aiModelPick :deep(.customSelectTrigger:hover) {
  color: var(--tab-fg-hover);
  background: var(--icon-btn-bg-hover);
}

.aiToolbarEnd {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

/**
 * 与左侧活动栏图标按钮同系（透明底、tab 字色），
 * 尺寸与当前行模型下拉触发器高度对齐。
 */
.aiActivityLikeBtn {
  box-sizing: border-box;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: var(--tab-fg);
}

.aiActivityLikeBtn:hover:not(:disabled) {
  color: var(--tab-fg-hover);
  background: var(--icon-btn-bg-hover);
}

.aiActivityLikeBtn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.aiActivityLikeBtn .svg :deep(svg) {
  width: 16px;
  height: 16px;
}

.aiActivityLikeBtn .svg :deep(svg path) {
  fill: currentColor;
}

.svg :deep(svg) {
  width: 16px;
  height: 16px;
  display: block;
}

.aiListWrap {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.aiList {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 12px 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  user-select: text;
  -webkit-user-select: text;
  cursor: auto;
}

.aiJumpBottom {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 999px;
  border: none;
  background: var(--primary);
  color: #ffffff;
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
  white-space: nowrap;
  user-select: none;
}

.aiJumpBottom:hover {
  background: var(--primary-hover);
}

.aiJumpBottom .svg :deep(svg) {
  width: 12px;
  height: 12px;
}

.aiJumpBottom .svg :deep(svg path) {
  fill: currentColor;
}

.aiComposerStack {
  flex-shrink: 0;
  margin: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.aiQuickQuestions {
  padding: 0 2px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.aiQuickQuestionsTitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}

.aiQuickQuestionsList {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.aiQuickQuestionItem {
  width: 100%;
  box-sizing: border-box;
  text-align: left;
  padding: 6px 8px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  cursor: pointer;
  border-radius: 8px;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.aiQuickQuestionItem:hover {
  background: var(--primary-bg);
  color: var(--primary);
}

.aiComposer {
  flex-shrink: 0;
  margin: 0;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--input-bg);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.12s ease;
}

.aiComposer:focus-within {
  border-color: var(--accent);
}

.aiComposerInput {
  width: 100%;
  box-sizing: border-box;
  min-height: calc(1.45em + 8px);
  max-height: 168px;
  overflow-x: hidden;
  overflow-y: hidden;
  padding: 6px 4px 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--fg);
  font-size: 13px;
  line-height: 1.45;
  font-family: inherit;
  user-select: text;
  -webkit-user-select: text;
  /** 预留纵向滚动条槽位，避免出现滚动条时变窄换行、行数突变 */
  /* scrollbar-gutter: stable; */
}

.aiComposerInput:focus {
  outline: none;
}

.aiComposerFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  flex-wrap: nowrap;
  min-width: 0;
}

.aiComposerFooterMain {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 2px;
}

.aiComposerNewChatBtn {
  flex-shrink: 0;
}

.aiComposerModelPickWrap {
  flex: 1 1 120px;
  min-width: 0;
  display: flex;
  justify-content: flex-start;
}

.aiComposerTogglesRow {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  padding: 0 2px;
  min-width: 0;
}

.aiComposerActionBtn {
  flex-shrink: 0;
}

.aiComposerSendBtn {
  border-radius: 50%;
}

.aiComposerSendBtn:disabled {
  color: var(--info);
  background: var(--info-border);
}

.aiComposerSendBtn:not(:disabled) {
  color: var(--input-bg);
  background: var(--primary);
}

.aiActivityLikeBtn.aiComposerSendBtn:hover:not(:disabled) {
  color: var(--input-bg);
  background: var(--primary-hover);
}

.aiComposerStopBtn {
  border-radius: 50%;
}

.aiComposerStopBtn:not(:disabled) {
  color: var(--input-bg);
  background: var(--danger);
}

.aiActivityLikeBtn.aiComposerStopBtn:hover:not(:disabled) {
  color: var(--input-bg);
  background: var(--danger-hover);
}

.aiComposerStopBtn .svg :deep(svg) {
  width: 12px;
  height: 12px;
}

.aiComposerActionBtn .svg :deep(svg path) {
  fill: currentColor;
}

.aiHistoryDropdown {
  position: fixed;
  z-index: 7200;
  box-sizing: border-box;
  max-height: min(360px, calc(100vh - 24px));
  display: flex;
  flex-direction: column;
  min-width: 0;
  /** 横向 6px + 行内 10px ≈ 侧栏章节虚拟列表（scroll 6px + item 10px）；纵向留白 */
  padding: 6px;
  user-select: none;
}

.aiExportDropdown {
  position: fixed;
  z-index: 7200;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/**
 * 与书签列表一致（`style.css` `.sidebar .virtualList-scroll.sidebarList`）：
 * 水平留白由 `.aiHistoryDropdown` 的 `padding: 6px` 统一提供；列表不再额外 `padding-right`，
 * 且不使用 `scrollbar-gutter: stable`（无滚动条时也会占位导致右侧白条）。
 */
.aiHistoryDropdownList {
  list-style: none;
  margin: 0;
  box-sizing: border-box;
  padding: 0;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.aiHistoryDropdownList::-webkit-scrollbar-thumb {
  border-right-width: 0;
}

.aiHistoryDropdownList + .aiHistoryDropdownList {
  padding-top: 8px;
}

.aiHistoryDropdownDate {
  list-style: none;
  margin: 0;
  padding: 8px 10px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  letter-spacing: 0.03em;
}

.aiHistoryDropdownDate:first-child {
  padding-top: 4px;
}

.aiHistoryDropdownRow {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 4px 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--list-item-fg);
  font-size: 12px;
  line-height: 1.35;
  outline: none;
}

.aiHistoryDropdownRow:hover {
  background: var(--list-item-bg-hover);
}

.aiHistoryDropdownRow.is-active {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.aiHistoryDropdownRow.is-active:hover {
  background: color-mix(in srgb, var(--accent) 14%, var(--list-item-bg-hover));
}

.aiHistoryDropdownRowBody {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  min-height: 0;
}

.aiHistoryDropdownTitleRow {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.aiHistoryDropdownLabel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--fg);
}

.aiHistoryDropdownTime {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
  white-space: nowrap;
}

.aiHistoryDropdownDelete {
  flex-shrink: 0;
  box-sizing: border-box;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.12s ease,
    color 0.12s ease;
}

.aiHistoryDropdownRow:hover .aiHistoryDropdownDelete,
.aiHistoryDropdownRow:focus-within .aiHistoryDropdownDelete {
  opacity: 1;
}

.aiHistoryDropdownDelete:hover {
  color: var(--danger);
}

.aiHistoryDropdownDelete .svg :deep(svg) {
  width: 12px;
  height: 12px;
  display: block;
}

.aiHistoryDropdownDelete .svg :deep(svg path) {
  fill: currentColor;
}

.aiHistoryDropdownEmpty {
  margin: 0;
  padding: 10px;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
}
</style>
