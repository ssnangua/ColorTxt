<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  reactive,
  ref,
  shallowRef,
  watch,
} from "vue";
import type { AITxt2ImgBackend, PortraitExtractResult } from "@shared/aiTypes";
import { getTxt2ImgPromptFamily } from "@shared/txt2ImgBackend";
import {
  EMPTY_TOKEN_PRICE_PER_MILLION,
  normalizeTokenPricePerMillion,
  type AITokenPricePerMillion,
} from "@shared/aiTypes";
import {
  addTokenUsage,
  type AITokenUsageTotals,
  ZERO_TOKEN_USAGE,
} from "@shared/aiTokenUsage";
import type {
  CharacterBookStylePersisted,
  CharacterGender,
  CharacterRosterEntry,
} from "@shared/characterTypes";
import {
  characterPortraitImageAbs,
  characterPortraitSessionDraftImageAbs,
  characterPortraitTmpImageAbs,
  sanitizeBookFolderSegment,
} from "@shared/characterPortraitPaths";
import { runAiBookVectorIndexBuild } from "../ai/buildBookVectorIndex";
import { hashBookBrowser } from "../utils/aiBookHash";
import type { Chapter } from "../chapter";
import { APP_DISPLAY_NAME } from "../constants/appUi";
import { vAiStickScroll } from "../directives/aiStickScroll";
import { icons } from "../icons";
import AiAssistantDetailsFold from "./AiAssistantDetailsFold.vue";
import AiIndexProgressBanner from "./AiIndexProgressBanner.vue";
import AiTokenUsageBanner from "./AiTokenUsageBanner.vue";
import AppModal from "./AppModal.vue";
import type { CharacterCardTextureEffectId } from "@shared/characterCardTextureEffects";
import { DEFAULT_CHARACTER_CARD_TEXTURE_EFFECT } from "@shared/characterCardTextureEffects";
import CharacterRosterCard from "./CharacterRosterCard.vue";
import { pushEscBeforeModal } from "../utils/modalStack";
import IconButton from "./IconButton.vue";
import ReaderImageLightbox from "./ReaderImageLightbox.vue";
import type ReaderMain from "./ReaderMain.vue";
import { appConfirm } from "../services/appDialog";

const props = withDefaults(
  defineProps<{
    sessionFilePath: string | null;
    physicalReaderPath: string | null;
    chapters: Chapter[];
    activeChapterIdx: number;
    /** 与 AI 阅读助手建索引同源：取全文分块并向量化 */
    readerMainRef: InstanceType<typeof ReaderMain> | null;
    panelVisible: boolean;
    characterPortraitCacheDir: string;
    characterCardTextureEffect?: CharacterCardTextureEffectId;
    characterRoster: readonly CharacterRosterEntry[];
    characterBookStyle?: CharacterBookStylePersisted;
    /** 设置「确定」保存后递增，用于同步文生图服务商等运行时配置 */
    aiConfigSyncNonce?: number;
  }>(),
  {
    sessionFilePath: null,
    physicalReaderPath: null,
    chapters: () => [],
    activeChapterIdx: -1,
    readerMainRef: null,
    panelVisible: false,
    characterPortraitCacheDir: "",
    characterCardTextureEffect: DEFAULT_CHARACTER_CARD_TEXTURE_EFFECT,
    characterRoster: () => [],
    characterBookStyle: undefined,
    aiConfigSyncNonce: 0,
  },
);

const spoilerSafe = defineModel<boolean>("spoilerSafe", { default: false });

const emit = defineEmits<{
  characterFileMetaPatch: [
    payload: {
      characterBookStyle?: CharacterBookStylePersisted;
      characterRoster?: CharacterRosterEntry[];
    },
  ];
  /** 全屏：编辑/添加角色抽屉打开时抑制侧栏移出即收起 */
  "update:fullscreenCharacterDrawerOpen": [open: boolean];
  /** 全屏：角色卡放大预览打开时抑制侧栏移出即收起 */
  "update:fullscreenCharacterCardZoomOpen": [open: boolean];
}>();

const embeddingEnabled = ref(false);
const txt2imgEnabled = ref(false);
const txt2imgBackend = ref<AITxt2ImgBackend>("a1111");
const chatTokenPricePerMillion = ref<AITokenPricePerMillion>({
  ...EMPTY_TOKEN_PRICE_PER_MILLION,
});
const showTokenUsage = ref(true);
const indexReady = ref(false);
const bookHash = ref("");

const slideOpen = ref(false);
const editingId = ref<string | null>(null);
const isAddMode = computed(() => editingId.value === null && slideOpen.value);

watch(
  slideOpen,
  (v) => {
    emit("update:fullscreenCharacterDrawerOpen", v);
  },
  { immediate: true },
);

const draftDisplayName = ref("");
const draftGender = ref<CharacterGender>("unknown");
const draftAgeText = ref("");
const draftIdentity = ref("");
const draftBio = ref("");
const draftRelations = ref("");
const draftPromptZh = ref("");
const draftNegativeZh = ref("");
const draftRetrieveThinking = ref("");
const draftStylePrefix = ref("");
const draftStyleNote = ref("");

const extracting = ref(false);
/** 主进程 portrait extract/infer 中止用，与 `allocatePortraitRetrieveSessionId` 对齐 */
const portraitRetrieveActiveSid = ref(0);
/** 与阅读助手思考折叠一致：检索进行中自动展开，结束后收起 */
const retrieveThinkingFoldOpen = ref(false);
const slideError = ref("");
const retrieveNoticeBanner = ref("");
/** 当前抽屉内是否已点过「检索」（用于首次检索后显示思考折叠区） */
const retrieveEverThisDrawer = ref(false);
const retrieveTokenUsage = ref<AITokenUsageTotals>(ZERO_TOKEN_USAGE);
const retrieveTokenUsageAvailable = ref(false);
const retrieveTokenUsageShown = ref(false);
const flipped = reactive<Record<string, boolean>>({});

/** 角色侧栏建索引进度：与阅读助手同一套阶段文案，使用独立 embed requestId */
const CHARACTER_INDEX_EMBED_REQUEST_ID = 9_231_001;

const retrieveIndexPhase = ref<
  "idle" | "chunking" | "embedding" | "indexing" | "error"
>("idle");
const retrieveIndexEmbedCurrent = ref(0);
const retrieveIndexEmbedTotal = ref(0);
const retrieveIndexError = ref("");
const retrieveIndexAbort = shallowRef<AbortController | null>(null);

const isRetrieveIndexBuilding = computed(() =>
  ["chunking", "embedding", "indexing"].includes(retrieveIndexPhase.value),
);

const generateOpen = ref(false);
const genTargetId = ref<string | null>(null);
const portraitLightboxSrc = ref("");
/** 原位放大中的角色卡 id（同一张 DOM，非 overlay 副本） */
const popoverCardId = ref<string | null>(null);

watch(
  () => Boolean(popoverCardId.value),
  (v) => {
    emit("update:fullscreenCharacterCardZoomOpen", v);
  },
  { immediate: true },
);

let removePopoverEsc: (() => void) | null = null;

watch(popoverCardId, (id, prevId) => {
  removePopoverEsc?.();
  removePopoverEsc = null;
  if (!id && prevId) {
    flipped[prevId] = false;
  }
  if (!id) return;
  removePopoverEsc = pushEscBeforeModal(() => {
    popoverCardId.value = null;
  });
});

const genStyleZh = ref("");
const genPromptZh = ref("");
const genNegativeZh = ref("");
const generating = ref(false);
const genError = ref("");
const genPreviewUrl = ref<string | null>(null);
const genTempReadableUrl = ref<string | null>(null);
const genTmpAbsPath = ref<string | null>(null);
const genApplying = ref(false);
const drawerPortraitPreviewUrl = ref<string | null>(null);
/** 编辑抽屉内待保存立绘会话键：编辑时为角色 id，添加时为 uuid */
const portraitEditSessionKey = ref("");

const portraitUrlById = reactive<Record<string, string>>({});

const sessionBookTitle = computed(() => {
  const p = props.sessionFilePath ?? props.physicalReaderPath;
  if (!p) return "";
  const sep = p.includes("\\") ? "\\" : "/";
  const base = p.slice(p.lastIndexOf(sep) + 1);
  const dot = base.lastIndexOf(".");
  const withoutExt = dot > 0 ? base.slice(0, dot) : base;
  return withoutExt.trim() || base;
});

const bookFolderSegment = computed(() =>
  sanitizeBookFolderSegment(
    props.sessionFilePath ?? props.physicalReaderPath ?? "",
  ),
);

const hasOpenFile = computed(() => {
  const s = props.sessionFilePath?.trim();
  const p = props.physicalReaderPath?.trim();
  return Boolean(s || p);
});

/** 角色卡列宽，由父级单次 ResizeObserver 更新，子卡共用 */
const cardGridRef = ref<HTMLElement | null>(null);
const rosterNameZoom = ref(1);
let cardGridResizeObserver: ResizeObserver | null = null;

function teardownCardGridResizeObserver() {
  cardGridResizeObserver?.disconnect();
  cardGridResizeObserver = null;
}

function syncRosterNameZoomFromGrid() {
  const grid = cardGridRef.value;
  if (!grid) {
    rosterNameZoom.value = 1;
    return;
  }
  const shell = grid.querySelector(".cardShell") as HTMLElement | null;
  const w = shell?.getBoundingClientRect().width ?? 0;
  rosterNameZoom.value = w > 0 ? w / 150 : 1;
}

function ensureCardGridResizeObserver() {
  const grid = cardGridRef.value;
  if (!grid || typeof ResizeObserver === "undefined") {
    teardownCardGridResizeObserver();
    if (grid) syncRosterNameZoomFromGrid();
    else rosterNameZoom.value = 1;
    return;
  }
  syncRosterNameZoomFromGrid();
  if (cardGridResizeObserver) return;
  cardGridResizeObserver = new ResizeObserver(() => {
    syncRosterNameZoomFromGrid();
  });
  cardGridResizeObserver.observe(grid);
}

function onCardGridLayoutContextChange() {
  const ok =
    hasOpenFile.value && props.characterRoster.length > 0 && cardGridRef.value;
  if (!ok) {
    teardownCardGridResizeObserver();
    rosterNameZoom.value = 1;
    return;
  }
  ensureCardGridResizeObserver();
}

watch(
  [hasOpenFile, () => props.characterRoster.length, () => props.panelVisible],
  () => {
    onCardGridLayoutContextChange();
  },
  { flush: "post", immediate: true },
);

const canRetrieve = computed(
  () =>
    Boolean(draftDisplayName.value.trim()) &&
    !extracting.value &&
    !isRetrieveIndexBuilding.value,
);

const showThinkingSection = computed(
  () =>
    extracting.value ||
    retrieveEverThisDrawer.value ||
    Boolean(draftRetrieveThinking.value.trim()),
);

watch(
  () => [slideOpen.value, extracting.value] as const,
  async ([active, busy]) => {
    await nextTick();
    if (!active) return;
    retrieveThinkingFoldOpen.value = busy;
  },
  { immediate: true },
);

function onRetrieveThinkingFoldContentPointerDown(ev: PointerEvent) {
  const t = ev.currentTarget;
  if (t instanceof HTMLElement) t.focus({ preventScroll: true });
}

function clearRetrieveTokenUsage(): void {
  retrieveTokenUsage.value = ZERO_TOKEN_USAGE;
  retrieveTokenUsageAvailable.value = false;
  retrieveTokenUsageShown.value = false;
}

function absorbRetrieveTokenUsage(part: {
  tokenUsage?: AITokenUsageTotals;
  tokenUsageAvailable?: boolean;
}): void {
  if (part.tokenUsage) {
    retrieveTokenUsage.value = addTokenUsage(
      retrieveTokenUsage.value,
      part.tokenUsage,
    );
  }
  if (part.tokenUsageAvailable === true) {
    retrieveTokenUsageAvailable.value = true;
  }
}

const genTargetEntry = computed(() => {
  const id = genTargetId.value;
  if (!id) return undefined;
  return props.characterRoster.find((r) => r.id === id);
});

/** 当前生成弹层对应的角色名（卡片入口用 roster；抽屉入口用草稿名） */
const genModalDisplayName = computed(() => {
  if (genTargetId.value) {
    return genTargetEntry.value?.displayName.trim() ?? "";
  }
  return draftDisplayName.value.trim();
});

const genModalActivePreviewUrl = computed(
  () => genTempReadableUrl.value ?? genPreviewUrl.value,
);

const canApplyGenTemp = computed(
  () =>
    Boolean(genTempReadableUrl.value) &&
    !generating.value &&
    !genApplying.value &&
    Boolean(genModalDisplayName.value.trim()),
);

const genShowsNegativeAdvanced = computed(
  () => getTxt2ImgPromptFamily(txt2imgBackend.value) === "sd",
);

const canGenerateImage = computed(
  () =>
    txt2imgEnabled.value &&
    Boolean(genStyleZh.value.trim() || genPromptZh.value.trim()) &&
    !generating.value &&
    !genApplying.value &&
    Boolean(genModalDisplayName.value.trim()),
);

async function resolveCacheRootAbs(): Promise<string> {
  const d = props.characterPortraitCacheDir.trim();
  if (d) return d;
  return window.colorTxt.getDefaultCharacterPortraitCacheDir();
}

async function portraitAbsForDisplayName(displayName: string): Promise<string> {
  const root = await resolveCacheRootAbs();
  return characterPortraitImageAbs(root, bookFolderSegment.value, displayName);
}

async function portraitTmpAbsForDisplayName(
  displayName: string,
): Promise<string> {
  const root = await resolveCacheRootAbs();
  return characterPortraitTmpImageAbs(
    root,
    bookFolderSegment.value,
    displayName,
  );
}

async function portraitSessionDraftAbs(sessionKey: string): Promise<string> {
  const root = await resolveCacheRootAbs();
  return characterPortraitSessionDraftImageAbs(
    root,
    bookFolderSegment.value,
    sessionKey,
  );
}

async function deletePortraitSessionDraftFileAt(
  sessionKey: string,
  bookSegment: string,
): Promise<void> {
  const sk = sessionKey.trim();
  if (!sk || !bookSegment.trim()) return;
  try {
    const root = await resolveCacheRootAbs();
    const p = characterPortraitSessionDraftImageAbs(root, bookSegment, sk);
    const st = await window.colorTxt.stat(p);
    if (st.isFile) await window.colorTxt.removePath(p);
  } catch {
    /* ignore */
  }
}

async function deletePortraitSessionDraftFile(
  sessionKey: string,
): Promise<void> {
  await deletePortraitSessionDraftFileAt(sessionKey, bookFolderSegment.value);
}

/** 按角色显示名删除正式立绘与文生图临时 `_tmp` 文件（不存在则忽略） */
async function removeCharacterPortraitFilesByDisplayName(
  displayName: string,
): Promise<void> {
  const name = displayName.trim();
  if (!name) return;
  try {
    const abs = await portraitAbsForDisplayName(name);
    const st = await window.colorTxt.stat(abs);
    if (st.isFile) await window.colorTxt.removePath(abs);
  } catch {
    /* ignore */
  }
  try {
    const tmpAbs = await portraitTmpAbsForDisplayName(name);
    const st = await window.colorTxt.stat(tmpAbs);
    if (st.isFile) await window.colorTxt.removePath(tmpAbs);
  } catch {
    /* ignore */
  }
}

/** 在可读 URL 上追加 `?t=` / `&t=`，避免同路径文件被替换后浏览器仍用旧缓存 */
function withUrlCacheBust(url: string, t: number = Date.now()): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${t}`;
}

async function refreshRuntimeFlags() {
  try {
    const c = await window.colorTxt.ai.configGet();
    embeddingEnabled.value = c.embeddingEnabled;
    txt2imgEnabled.value = c.txt2img.enabled;
    txt2imgBackend.value = c.txt2img.backend;
    chatTokenPricePerMillion.value = normalizeTokenPricePerMillion(
      c.chat.tokenPricePerMillion,
    );
    showTokenUsage.value = c.showTokenUsage !== false;
  } catch {
    embeddingEnabled.value = false;
    txt2imgEnabled.value = false;
    chatTokenPricePerMillion.value = { ...EMPTY_TOKEN_PRICE_PER_MILLION };
    showTokenUsage.value = true;
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

async function refreshIndexReady() {
  indexReady.value = false;
  if (!bookHash.value || !embeddingEnabled.value) return;
  try {
    indexReady.value = await window.colorTxt.ai.indexHasBook(bookHash.value);
  } catch {
    indexReady.value = false;
  }
}

async function portraitPreviewReadableUrl(
  displayName: string,
): Promise<string | null> {
  const trimmed = displayName.trim();
  if (!trimmed) return null;
  try {
    const p = await portraitAbsForDisplayName(trimmed);
    const st = await window.colorTxt.stat(p);
    if (!st.isFile) return null;
    const raw = await window.colorTxt.pathToReadableLocalUrl(p);
    if (!raw) return null;
    return withUrlCacheBust(raw);
  } catch {
    return null;
  }
}

/** 立绘可读 URL：会话草稿（上传/应用中未入库）优先，再走正式路径。 */
async function readablePortraitDraftThenCanonical(opts: {
  displayName: string;
  sessionKey: string;
}): Promise<string | null> {
  const name = opts.displayName.trim();
  const sk = opts.sessionKey.trim();
  if (sk) {
    try {
      const draftP = await portraitSessionDraftAbs(sk);
      const st = await window.colorTxt.stat(draftP);
      if (st.isFile) {
        const raw = await window.colorTxt.pathToReadableLocalUrl(draftP);
        if (raw) return withUrlCacheBust(raw);
      }
    } catch {
      /* 无草稿或不可读 */
    }
  }
  if (!name) return null;
  return portraitPreviewReadableUrl(name);
}

async function refreshDrawerPortraitPreview() {
  const name = draftDisplayName.value.trim();
  if (!name || !slideOpen.value) {
    drawerPortraitPreviewUrl.value = null;
    return;
  }
  drawerPortraitPreviewUrl.value = await readablePortraitDraftThenCanonical({
    displayName: name,
    sessionKey: portraitEditSessionKey.value,
  });
}

async function refreshGenModalPreview() {
  const name = genModalDisplayName.value.trim();
  if (!name) {
    genPreviewUrl.value = null;
    return;
  }
  /** 抽屉入口 `genTargetId` 为空，用抽屉 `portraitEditSessionKey`；未来若从卡片带入 id，则优先用之查草稿 */
  const draftKey =
    (genTargetId.value ?? "").trim() || portraitEditSessionKey.value.trim();
  genPreviewUrl.value = await readablePortraitDraftThenCanonical({
    displayName: name,
    sessionKey: draftKey,
  });
}

watch(
  () =>
    [
      draftDisplayName.value,
      slideOpen.value,
      props.characterPortraitCacheDir,
      bookFolderSegment.value,
      portraitEditSessionKey.value,
    ] as const,
  () => {
    void refreshDrawerPortraitPreview();
  },
);

/** 切换书籍等场景关闭立绘弹窗时不写入 meta（避免错书） */
const genSuppressPersistOnClose = ref(false);

/** 将立绘生成面板中的画风 / 形象 / 负面同步到抽屉草稿并写入 file.meta */
function persistGenPanelTextFields(): void {
  const styleZh = genStyleZh.value.trim();
  const promptZh = genPromptZh.value.trim();
  const negativeZh = genNegativeZh.value.trim();

  draftStylePrefix.value = styleZh;
  draftPromptZh.value = promptZh;
  draftNegativeZh.value = negativeZh;

  const patch: {
    characterBookStyle: CharacterBookStylePersisted;
    characterRoster?: CharacterRosterEntry[];
  } = {
    characterBookStyle: {
      stylePrefixZh: styleZh,
      styleNoteZh:
        props.characterBookStyle?.styleNoteZh?.trim() ??
        draftStyleNote.value.trim(),
      updatedAt: Date.now(),
    },
  };

  const editId = editingId.value;
  if (editId != null) {
    const idx = rosterIndexById(editId);
    if (idx >= 0) {
      patch.characterRoster = props.characterRoster.map((r, i) =>
        i === idx ? { ...r, promptZh, negativeZh } : r,
      );
    }
  }

  emit("characterFileMetaPatch", patch);
}

watch(generateOpen, async (open, wasOpen) => {
  if (open) {
    await refreshRuntimeFlags();
    genTempReadableUrl.value = null;
    genTmpAbsPath.value = null;
    genError.value = "";
    const name = genModalDisplayName.value.trim();
    if (name) {
      try {
        const tmp = await portraitTmpAbsForDisplayName(name);
        const st = await window.colorTxt.stat(tmp);
        if (st.isFile) await window.colorTxt.removePath(tmp);
      } catch {
        /* 无临时文件或删除失败均忽略 */
      }
    }
    await refreshGenModalPreview();
    return;
  }
  if (wasOpen && !genSuppressPersistOnClose.value) {
    persistGenPanelTextFields();
  }
  genSuppressPersistOnClose.value = false;

  genTempReadableUrl.value = null;
  genTmpAbsPath.value = null;
  const name = genModalDisplayName.value.trim();
  if (!name) return;
  try {
    const tmp = await portraitTmpAbsForDisplayName(name);
    const st = await window.colorTxt.stat(tmp);
    if (st.isFile) await window.colorTxt.removePath(tmp);
  } catch {
    /* ignore */
  }
});

async function refreshPortraitUrlForEntry(e: CharacterRosterEntry) {
  const name = e.displayName.trim();
  if (!name) {
    delete portraitUrlById[e.id];
    return;
  }
  const p = await portraitAbsForDisplayName(name);
  try {
    const st = await window.colorTxt.stat(p);
    if (st.isFile) {
      const url = await window.colorTxt.pathToReadableLocalUrl(p);
      if (url) portraitUrlById[e.id] = withUrlCacheBust(url);
      else delete portraitUrlById[e.id];
    } else {
      delete portraitUrlById[e.id];
    }
  } catch {
    delete portraitUrlById[e.id];
  }
}

async function refreshAllPortraitUrls() {
  for (const e of props.characterRoster) {
    await refreshPortraitUrlForEntry(e);
  }
}

watch(
  () =>
    [
      props.sessionFilePath,
      props.physicalReaderPath,
      props.characterPortraitCacheDir,
      props.characterRoster,
    ] as const,
  () => {
    void refreshBookHash().then(() => refreshIndexReady());
    void refreshAllPortraitUrls();
  },
  { deep: true },
);

watch(
  () => props.panelVisible,
  (vis) => {
    if (vis) {
      void refreshRuntimeFlags().then(() => refreshIndexReady());
    }
  },
  { immediate: true },
);

watch(
  () => props.aiConfigSyncNonce ?? 0,
  (n, prev) => {
    if (n <= 0 || n === prev) return;
    void refreshRuntimeFlags();
  },
);

watch(embeddingEnabled, () => {
  void refreshIndexReady();
});

watch(bookHash, () => {
  void refreshIndexReady();
});

function toggleFlip(id: string) {
  flipped[id] = !flipped[id];
}

function rosterIndexById(id: string): number {
  return props.characterRoster.findIndex((r) => r.id === id);
}

function openAddSlide() {
  slideError.value = "";
  retrieveNoticeBanner.value = "";
  if (editingId.value) {
    void deletePortraitSessionDraftFile(editingId.value);
  } else if (portraitEditSessionKey.value.trim()) {
    void deletePortraitSessionDraftFile(portraitEditSessionKey.value);
  }
  portraitEditSessionKey.value = crypto.randomUUID();
  editingId.value = null;
  draftDisplayName.value = "";
  draftGender.value = "unknown";
  draftAgeText.value = "";
  draftIdentity.value = "";
  draftBio.value = "";
  draftRelations.value = "";
  draftPromptZh.value = "";
  draftNegativeZh.value = "";
  draftRetrieveThinking.value = "";
  clearRetrieveTokenUsage();
  draftStylePrefix.value = props.characterBookStyle?.stylePrefixZh ?? "";
  draftStyleNote.value = props.characterBookStyle?.styleNoteZh ?? "";
  slideOpen.value = true;
  retrieveEverThisDrawer.value = false;
}

function openEditSlide(entry: CharacterRosterEntry) {
  slideError.value = "";
  retrieveNoticeBanner.value = "";
  if (editingId.value == null && portraitEditSessionKey.value.trim()) {
    void deletePortraitSessionDraftFile(portraitEditSessionKey.value);
  }
  const prevId = editingId.value;
  if (prevId && prevId !== entry.id) {
    void deletePortraitSessionDraftFile(prevId);
  }
  editingId.value = entry.id;
  draftDisplayName.value = entry.displayName;
  draftGender.value = entry.gender;
  draftAgeText.value = entry.ageText;
  draftIdentity.value = entry.identity;
  draftBio.value = entry.bio;
  draftRelations.value = entry.relations;
  draftPromptZh.value = entry.promptZh;
  draftNegativeZh.value = entry.negativeZh;
  draftRetrieveThinking.value = entry.retrieveThinkingText;
  clearRetrieveTokenUsage();
  draftStylePrefix.value = props.characterBookStyle?.stylePrefixZh ?? "";
  draftStyleNote.value = props.characterBookStyle?.styleNoteZh ?? "";
  portraitEditSessionKey.value = entry.id;
  slideOpen.value = true;
  retrieveEverThisDrawer.value = false;
}

function toggleCharacterCardPopover(entry: CharacterRosterEntry) {
  const url = portraitUrlById[entry.id];
  if (!url) return;
  if (popoverCardId.value === entry.id) {
    popoverCardId.value = null;
    return;
  }
  popoverCardId.value = entry.id;
}

function openPortraitLightboxFromUrl(url: string | null | undefined) {
  const u = typeof url === "string" ? url.trim() : "";
  if (!u) return;
  portraitLightboxSrc.value = u;
}

function closeSlide() {
  if (extracting.value) return;
  const sk = portraitEditSessionKey.value.trim();
  void deletePortraitSessionDraftFile(sk);
  portraitEditSessionKey.value = "";
  abortRetrieveIndexBuild();
  retrieveIndexPhase.value = "idle";
  retrieveIndexEmbedCurrent.value = 0;
  retrieveIndexEmbedTotal.value = 0;
  retrieveIndexError.value = "";
  slideOpen.value = false;
  editingId.value = null;
  slideError.value = "";
  retrieveNoticeBanner.value = "";
  retrieveEverThisDrawer.value = false;
}

function abortRetrieveIndexBuild() {
  retrieveIndexAbort.value?.abort();
  retrieveIndexAbort.value = null;
  void window.colorTxt.ai.embedAbort(CHARACTER_INDEX_EMBED_REQUEST_ID);
}

let nextPortraitRetrieveSessionId = 0;
function allocatePortraitRetrieveSessionId(): number {
  nextPortraitRetrieveSessionId += 1;
  return nextPortraitRetrieveSessionId;
}

function isPortraitRetrieveAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  if (e instanceof Error && e.name === "AbortError") return true;
  return false;
}

async function buildCharacterBookIndex(signal: AbortSignal): Promise<boolean> {
  if (!bookHash.value) {
    retrieveIndexPhase.value = "error";
    retrieveIndexError.value = "无法绑定本书上下文。";
    return false;
  }
  const getText = props.readerMainRef?.getAllText;
  if (!getText) {
    retrieveIndexPhase.value = "error";
    retrieveIndexError.value = "无法读取全书文本，请确认阅读器已加载本书。";
    return false;
  }
  if (signal.aborted) {
    retrieveIndexPhase.value = "idle";
    return false;
  }
  return runAiBookVectorIndexBuild({
    signal,
    embedRequestId: CHARACTER_INDEX_EMBED_REQUEST_ID,
    bookHash: bookHash.value,
    fullText: getText(),
    chapters: props.chapters,
    abortMode: "returnFalse",
    hooks: {
      onPhase: (p) => {
        retrieveIndexPhase.value = p;
      },
      onEmbedProgress: (cur, tot) => {
        retrieveIndexEmbedTotal.value = tot;
        retrieveIndexEmbedCurrent.value = cur;
      },
      clearError: () => {
        retrieveIndexError.value = "";
      },
      setError: (m) => {
        retrieveIndexError.value = m;
      },
      setPhaseIdle: () => {
        retrieveIndexPhase.value = "idle";
      },
      setPhaseError: () => {
        retrieveIndexPhase.value = "error";
      },
    },
  });
}

/** 切换或关闭当前书时：中止建索、清空编辑抽屉表单并关闭 */
function resetCharacterEditDrawerOnBookChange() {
  portraitEditSessionKey.value = "";
  abortRetrieveIndexBuild();
  const prSid = portraitRetrieveActiveSid.value;
  if (prSid !== 0) {
    void window.colorTxt.ai.portraitRetrieveAbort(prSid);
    portraitRetrieveActiveSid.value = 0;
    void window.colorTxt.ai.portraitRetrieveSessionDispose(prSid);
  }
  retrieveIndexPhase.value = "idle";
  retrieveIndexEmbedCurrent.value = 0;
  retrieveIndexEmbedTotal.value = 0;
  retrieveIndexError.value = "";
  extracting.value = false;
  retrieveEverThisDrawer.value = false;
  slideError.value = "";
  retrieveNoticeBanner.value = "";
  editingId.value = null;
  draftDisplayName.value = "";
  draftGender.value = "unknown";
  draftAgeText.value = "";
  draftIdentity.value = "";
  draftBio.value = "";
  draftRelations.value = "";
  draftPromptZh.value = "";
  draftNegativeZh.value = "";
  draftRetrieveThinking.value = "";
  clearRetrieveTokenUsage();
  draftStylePrefix.value = "";
  draftStyleNote.value = "";
  slideOpen.value = false;
}

watch(
  () => [props.sessionFilePath, props.physicalReaderPath] as const,
  (next, prev) => {
    if (prev === undefined) return;
    const [sp, pp] = next;
    const [osp, opp] = prev;
    if (sp === osp && pp === opp) return;

    void (async () => {
      const sk = portraitEditSessionKey.value.trim();
      if (sk) {
        const oldSeg = sanitizeBookFolderSegment(osp ?? opp ?? "");
        if (oldSeg) {
          await deletePortraitSessionDraftFileAt(sk, oldSeg);
        } else {
          await deletePortraitSessionDraftFile(sk);
        }
      }
      portraitEditSessionKey.value = "";

      generating.value = false;
      genApplying.value = false;
      genSuppressPersistOnClose.value = true;
      generateOpen.value = false;
      genTargetId.value = null;
      genError.value = "";
      genPreviewUrl.value = null;
      genTempReadableUrl.value = null;
      genTmpAbsPath.value = null;

      if (slideOpen.value) {
        resetCharacterEditDrawerOnBookChange();
      }
    })();
  },
);

function genderFromExtract(
  g: PortraitExtractResult["gender"],
): CharacterGender {
  return g === "male" || g === "female" || g === "unknown" ? g : "unknown";
}

function buildRetrieveThinking(ex: PortraitExtractResult): string {
  const parts: string[] = [];
  if (ex.confidence_note?.trim()) {
    parts.push(`【可信度】\n${ex.confidence_note.trim()}`);
  }
  if (ex.appearance_zh?.trim()) {
    parts.push(`【外貌汇总】\n${ex.appearance_zh.trim()}`);
  }
  if (ex.excerpts?.length) {
    let startedExcerpts = false;
    for (const e of ex.excerpts.slice(0, 12)) {
      const q = e.quote.trim();
      if (!q) continue;
      if (!startedExcerpts) {
        parts.push("【摘录】");
        startedExcerpts = true;
      }
      const title = e.chapterTitle?.trim();
      const head = title ? `⭐ ${title}` : `⭐ 第 ${e.chapterIndex + 1} 章`;
      parts.push(`${head}\n${q}`);
    }
  }
  return parts.join("\n\n");
}

function getRetrieveBlockMessage(): string {
  if (!embeddingEnabled.value) {
    return "向量模型未启用：无法从书籍中检索角色描写。";
  }
  return "";
}

async function onRetrieve() {
  if (extracting.value || isRetrieveIndexBuilding.value) return;
  slideError.value = "";
  retrieveNoticeBanner.value = "";
  if (retrieveIndexPhase.value === "error") {
    retrieveIndexPhase.value = "idle";
    retrieveIndexError.value = "";
  }
  await refreshRuntimeFlags();
  await refreshBookHash();
  await refreshIndexReady();
  const block = getRetrieveBlockMessage();
  if (block) {
    retrieveNoticeBanner.value = block;
    return;
  }

  if (!bookHash.value) return;

  draftRetrieveThinking.value = "";
  clearRetrieveTokenUsage();
  const retrieveSessionId = allocatePortraitRetrieveSessionId();
  portraitRetrieveActiveSid.value = retrieveSessionId;
  retrieveEverThisDrawer.value = true;
  extracting.value = true;

  try {
    let hasIndex = await window.colorTxt.ai.indexHasBook(bookHash.value);
    if (!hasIndex) {
      abortRetrieveIndexBuild();
      const ac = new AbortController();
      retrieveIndexAbort.value = ac;
      try {
        const built = await buildCharacterBookIndex(ac.signal);
        if (!built) return;
      } finally {
        retrieveIndexAbort.value = null;
      }
      await refreshIndexReady();
      hasIndex = await window.colorTxt.ai.indexHasBook(bookHash.value);
      if (!hasIndex) {
        retrieveNoticeBanner.value = "索引未完成，请稍后重试。";
        return;
      }
    }

    const res = await window.colorTxt.ai.portraitExtract({
      bookHash: bookHash.value,
      characterName: draftDisplayName.value.trim(),
      spoilerSafe: spoilerSafe.value,
      activeChapterIdx: props.activeChapterIdx,
      retrieveSessionId,
    });
    if ("error" in res) {
      const errText = typeof res.error === "string" ? res.error : "摘录失败";
      if (!/abort|aborted/i.test(errText)) {
        retrieveNoticeBanner.value = errText;
      }
      return;
    }
    const ok = res as PortraitExtractResult;
    draftPromptZh.value = ok.sd_prompt_zh;
    draftNegativeZh.value = ok.negative_zh.trim();
    draftGender.value = genderFromExtract(ok.gender);
    draftAgeText.value = ok.age_text.trim();
    draftIdentity.value = ok.identity_zh.trim();
    draftBio.value = ok.bio_zh.trim();
    draftRelations.value = ok.relations_zh.trim();
    draftRetrieveThinking.value = buildRetrieveThinking(ok);
    absorbRetrieveTokenUsage(ok);
    retrieveTokenUsageShown.value = true;

    const title = sessionBookTitle.value.trim();
    const inf = await window.colorTxt.ai.portraitInferBookStyle({
      bookHash: bookHash.value,
      ...(title ? { fileTitle: title } : {}),
      spoilerSafe: spoilerSafe.value,
      activeChapterIdx: props.activeChapterIdx,
      retrieveSessionId,
    });
    if (!("error" in inf)) {
      absorbRetrieveTokenUsage(inf);
      const nextStyle: CharacterBookStylePersisted = {
        stylePrefixZh: inf.style_sd_prefix_zh.trim(),
        styleNoteZh: inf.note_zh.trim(),
        updatedAt: Date.now(),
      };
      draftStylePrefix.value = nextStyle.stylePrefixZh;
      draftStyleNote.value = nextStyle.styleNoteZh ?? "";
      emit("characterFileMetaPatch", { characterBookStyle: nextStyle });
    }
    retrieveNoticeBanner.value = "";
  } catch (e) {
    if (!isPortraitRetrieveAbortError(e)) {
      retrieveNoticeBanner.value = e instanceof Error ? e.message : String(e);
    }
  } finally {
    extracting.value = false;
    portraitRetrieveActiveSid.value = 0;
    void window.colorTxt.ai.portraitRetrieveSessionDispose(retrieveSessionId);
    if (!draftRetrieveThinking.value.trim()) {
      retrieveEverThisDrawer.value = false;
    }
  }
}

function onStopPortraitRetrieve() {
  abortRetrieveIndexBuild();
  const sid = portraitRetrieveActiveSid.value;
  if (sid !== 0) void window.colorTxt.ai.portraitRetrieveAbort(sid);
}

function buildEntryFromDraft(id: string): CharacterRosterEntry {
  return {
    id,
    displayName: draftDisplayName.value.trim(),
    gender: draftGender.value,
    ageText: draftAgeText.value.trim(),
    identity: draftIdentity.value.trim(),
    bio: draftBio.value.trim(),
    relations: draftRelations.value.trim(),
    promptZh: draftPromptZh.value.trim(),
    negativeZh: draftNegativeZh.value.trim(),
    retrieveThinkingText: draftRetrieveThinking.value.trim(),
  };
}

async function onSaveSlide() {
  if (extracting.value) return;
  slideError.value = "";
  retrieveNoticeBanner.value = "";
  const name = draftDisplayName.value.trim();
  if (!name) {
    slideError.value = "请填写角色名。";
    return;
  }

  const stylePatch: CharacterBookStylePersisted = {
    stylePrefixZh: draftStylePrefix.value.trim(),
    styleNoteZh: draftStyleNote.value.trim(),
    updatedAt: Date.now(),
  };

  let nextRoster: CharacterRosterEntry[];
  if (editingId.value == null) {
    if (props.characterRoster.length >= 200) {
      slideError.value = "角色数量已达上限（200）。";
      return;
    }
    const id = crypto.randomUUID();
    nextRoster = [...props.characterRoster, buildEntryFromDraft(id)];
  } else {
    const idx = rosterIndexById(editingId.value);
    if (idx < 0) {
      slideError.value = "找不到该角色记录。";
      return;
    }
    nextRoster = props.characterRoster.map((r, i) =>
      i === idx ? buildEntryFromDraft(editingId.value!) : r,
    );
  }

  const sk = portraitEditSessionKey.value.trim();
  if (sk) {
    try {
      const draftPath = await portraitSessionDraftAbs(sk);
      const st = await window.colorTxt.stat(draftPath);
      if (st.isFile) {
        const dest = await portraitAbsForDisplayName(name);
        const cp = await window.colorTxt.characterPortrait.copyFileTo({
          from: draftPath,
          to: dest,
        });
        if (!cp.ok) {
          slideError.value = cp.error ?? "立绘保存失败";
          return;
        }
        try {
          await window.colorTxt.removePath(draftPath);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* 无待写入草稿 */
    }
  }

  emit("characterFileMetaPatch", {
    characterBookStyle: stylePatch,
    characterRoster: nextRoster,
  });
  closeSlide();
}

async function onDeleteSlide() {
  if (extracting.value) return;
  const id = editingId.value;
  if (!id) return;
  const ok = await appConfirm(
    "确定要删除该角色卡吗？立绘图片也将一并删除。",
    "删除角色卡",
  );
  if (!ok) return;
  const entry = props.characterRoster.find((r) => r.id === id);
  void deletePortraitSessionDraftFile(id);
  if (entry?.displayName?.trim()) {
    await removeCharacterPortraitFilesByDisplayName(entry.displayName);
  }
  const nextRoster = props.characterRoster.filter((r) => r.id !== id);
  emit("characterFileMetaPatch", { characterRoster: nextRoster });
  delete flipped[id];
  delete portraitUrlById[id];
  closeSlide();
}

async function openGenerateFromDrawer() {
  await refreshRuntimeFlags();
  genTargetId.value = null;
  genStyleZh.value =
    props.characterBookStyle?.stylePrefixZh?.trim() ??
    draftStylePrefix.value.trim();
  genPromptZh.value = draftPromptZh.value.trim();
  genNegativeZh.value = draftNegativeZh.value.trim();
  genError.value = "";
  generateOpen.value = true;
}

async function onPortraitTxt2ImgAbort() {
  if (!generating.value) return;
  try {
    await window.colorTxt.ai.portraitTxt2ImgToPathAbort();
  } catch {
    /* ignore */
  }
}

async function onGenerateCommit() {
  genError.value = "";
  const displayName = genModalDisplayName.value.trim();
  if (!displayName) {
    genError.value = "缺少角色名";
    return;
  }
  generating.value = true;
  try {
    await refreshRuntimeFlags();
    if (!txt2imgEnabled.value) {
      genError.value = "请先在设置中启用文生图。";
      return;
    }
    const tmpOut = await portraitTmpAbsForDisplayName(displayName);
    const res = await window.colorTxt.ai.portraitTxt2ImgToPath({
      outputPath: tmpOut,
      styleZh: genStyleZh.value.trim(),
      appearanceZh: genPromptZh.value.trim(),
      negativeZh: genNegativeZh.value.trim(),
    });
    if (!res.ok) {
      if (res.error !== "已停止") {
        genError.value = res.error || "生成失败";
      }
      return;
    }
    genTmpAbsPath.value = tmpOut;
    const raw = await window.colorTxt.pathToReadableLocalUrl(tmpOut);
    genTempReadableUrl.value = raw ? withUrlCacheBust(raw) : null;
    persistGenPanelTextFields();
    await refreshGenModalPreview();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== "已停止") {
      genError.value = msg;
    }
  } finally {
    generating.value = false;
  }
}

async function onGenApply() {
  const displayName = genModalDisplayName.value.trim();
  if (!displayName) {
    genError.value = "缺少角色名";
    return;
  }
  if (!genTempReadableUrl.value) {
    genError.value = "请先生成立绘预览";
    return;
  }
  genError.value = "";
  genApplying.value = true;
  try {
    const tmpAbs =
      genTmpAbsPath.value ?? (await portraitTmpAbsForDisplayName(displayName));
    let st;
    try {
      st = await window.colorTxt.stat(tmpAbs);
    } catch {
      genError.value = "请先生成立绘预览";
      return;
    }
    if (!st.isFile) {
      genError.value = "请先生成立绘预览";
      return;
    }
    const sk = portraitEditSessionKey.value.trim();
    if (!sk) {
      genError.value = "请关闭并重新打开编辑面板后再试。";
      return;
    }
    const draftDest = await portraitSessionDraftAbs(sk);
    const cp = await window.colorTxt.characterPortrait.copyFileTo({
      from: tmpAbs,
      to: draftDest,
    });
    if (!cp.ok) {
      genError.value = cp.error ?? "应用失败";
      return;
    }
    try {
      await window.colorTxt.removePath(tmpAbs);
    } catch {
      /* ignore */
    }
    genTmpAbsPath.value = null;
    genTempReadableUrl.value = null;
    await refreshGenModalPreview();
    await refreshDrawerPortraitPreview();
    generateOpen.value = false;
  } catch (e) {
    genError.value = e instanceof Error ? e.message : String(e);
  } finally {
    genApplying.value = false;
  }
}

async function onDrawerUploadPortrait() {
  const sk = portraitEditSessionKey.value.trim();
  if (!sk) {
    await window.colorTxt.alert("请关闭并重新打开编辑面板后再试。");
    return;
  }
  const r = await window.colorTxt.showOpenDialog({ properties: ["openFile"] });
  const picked =
    r.canceled || r.filePaths.length === 0 ? "" : (r.filePaths[0] ?? "");
  if (!picked.trim()) return;
  const dest = await portraitSessionDraftAbs(sk);
  const cp = await window.colorTxt.characterPortrait.copyFileTo({
    from: picked.trim(),
    to: dest,
  });
  if (!cp.ok) {
    await window.colorTxt.alert(cp.error ?? "上传失败");
    return;
  }
  await refreshDrawerPortraitPreview();
}

async function onClearAllCharacters() {
  if (props.characterRoster.length === 0) return;
  if (!window.colorTxt) return;
  const r = await window.colorTxt.showMessageBox({
    type: "warning",
    title: APP_DISPLAY_NAME,
    buttons: ["取消", "清空"],
    defaultId: 1,
    cancelId: 0,
    message: "确定要清空当前文件的全部角色卡吗？",
    detail: "所有角色的立绘图片也将一并删除，且该操作不可逆！",
    noLink: true,
  });
  if (r.response !== 1) return;
  for (const r of props.characterRoster) {
    void deletePortraitSessionDraftFile(r.id);
    if (r.displayName?.trim()) {
      await removeCharacterPortraitFilesByDisplayName(r.displayName);
    }
  }
  for (const k of Object.keys(flipped)) {
    delete flipped[k];
  }
  for (const k of Object.keys(portraitUrlById)) {
    delete portraitUrlById[k];
  }
  closeSlide();
  emit("characterFileMetaPatch", { characterRoster: [] });
}

onBeforeUnmount(() => {
  removePopoverEsc?.();
  removePopoverEsc = null;
  abortRetrieveIndexBuild();
  teardownCardGridResizeObserver();
});
</script>

<template>
  <div class="characterSidebar">
    <div class="sidebarListWrap">
      <div class="sidebarTabBody">
        <div v-if="!hasOpenFile" class="empty">未打开文件</div>
        <div v-else class="characterContentColumn">
          <div v-if="characterRoster.length === 0" class="emptySlot">
            <div class="empty">当前文件暂无角色</div>
          </div>
          <div v-else class="characterMainScroll">
            <div ref="cardGridRef" class="cardGrid">
              <CharacterRosterCard
                v-for="row in characterRoster"
                :key="row.id"
                :entry="row"
                :portrait-url="portraitUrlById[row.id] ?? null"
                :flipped="!!flipped[row.id]"
                :name-zoom="rosterNameZoom"
                :texture-effect="characterCardTextureEffect"
                :popover-open="popoverCardId === row.id"
                @toggle-flip="toggleFlip(row.id)"
                @edit="openEditSlide(row)"
                @view-portrait="toggleCharacterCardPopover(row)"
              />
            </div>
          </div>
        </div>
      </div>
      <div v-if="hasOpenFile" class="sidebarTabFooter">
        <span class="sidebarTabFooterStat"
          >共 {{ characterRoster.length }} 个</span
        >
        <div class="sidebarTabFooterEnd">
          <button
            type="button"
            class="link primary hoverMode sidebarTabFooterAction"
            @click="openAddSlide"
          >
            添加角色
          </button>
          <button
            type="button"
            class="link danger hoverMode sidebarTabFooterAction"
            :disabled="characterRoster.length === 0"
            @click="onClearAllCharacters"
          >
            清空
          </button>
        </div>
      </div>
    </div>

    <Transition name="charDrawerFade">
      <div
        v-if="slideOpen"
        class="drawerBackdrop"
        aria-hidden="true"
        @click="closeSlide"
      />
    </Transition>
    <Transition name="charDrawerSlide">
      <aside
        v-if="slideOpen"
        class="drawer"
        role="dialog"
        aria-modal="true"
        :aria-label="isAddMode ? '添加角色' : '编辑角色'"
        @click.stop
      >
        <div class="drawerBody">
          <div class="field">
            <span class="label">角色名</span>
            <div class="drawerNameRow">
              <div :inert="extracting">
                <input
                  v-model="draftDisplayName"
                  type="text"
                  class="drawerNameInput"
                  spellcheck="false"
                  :disabled="extracting"
                  @keydown.enter.prevent="canRetrieve && onRetrieve()"
                />
              </div>
              <div class="drawerRetrieveRow">
                <button
                  v-if="!extracting"
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
                <div class="drawerRetrieveRowEnd">
                  <button
                    v-if="extracting"
                    type="button"
                    class="btn danger drawerRetrieveStopBtn"
                    @click="onStopPortraitRetrieve"
                  >
                    停止
                  </button>
                  <button
                    type="button"
                    class="btn primary drawerRetrieveBtn"
                    :disabled="!canRetrieve"
                    @click="onRetrieve"
                  >
                    {{ extracting ? "检索中…" : "AI 检索" }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <AiAssistantDetailsFold
            v-if="showThinkingSection"
            v-model:open="retrieveThinkingFoldOpen"
            variant="think"
            :live="extracting"
            :show-content="Boolean(draftRetrieveThinking.trim()) || extracting"
            @content-pointerdown="onRetrieveThinkingFoldContentPointerDown"
          >
            <template #icon>
              <span
                v-if="extracting"
                class="svg charRetrieveThinkIconPulse"
                v-html="icons.thinkingPulse"
              />
              <span
                v-else
                class="svg charRetrieveThinkIconBrain"
                v-html="icons.find"
              />
            </template>
            <template #title>
              <template v-if="extracting">正在检索…</template>
              <template v-else>检索结果</template>
            </template>
            <pre v-ai-stick-scroll class="aiFoldBody aiFoldBody--thinking">{{
              draftRetrieveThinking
            }}</pre>
          </AiAssistantDetailsFold>

          <AiIndexProgressBanner
            v-if="retrieveIndexPhase !== 'idle'"
            class="charRetrieveIndexProgress"
            :phase="retrieveIndexPhase"
            :embed-current="retrieveIndexEmbedCurrent"
            :embed-total="retrieveIndexEmbedTotal"
            :error-text="retrieveIndexError"
          />

          <AiTokenUsageBanner
            v-if="showTokenUsage && retrieveTokenUsageShown"
            class="charRetrieveTokenUsage"
            :usage="retrieveTokenUsage"
            :available="retrieveTokenUsageAvailable"
            :token-price-per-million="chatTokenPricePerMillion"
          />

          <div
            v-if="retrieveNoticeBanner.trim()"
            class="aiNoticeBanner"
            role="status"
            aria-live="polite"
          >
            <span
              class="aiNoticeBanner__icon"
              aria-hidden="true"
              v-html="icons.warning"
            />
            <span>{{ retrieveNoticeBanner }}</span>
          </div>

          <div class="drawerMainFields" :inert="extracting">
            <div class="field">
              <span class="label">立绘</span>
              <div class="drawerPortraitBlock">
                <div
                  class="drawerPortraitFrame"
                  :class="{
                    portraitPreviewClickable: Boolean(drawerPortraitPreviewUrl),
                  }"
                  :title="
                    drawerPortraitPreviewUrl ? '点击查看立绘大图' : undefined
                  "
                  role="presentation"
                  @click="openPortraitLightboxFromUrl(drawerPortraitPreviewUrl)"
                >
                  <img
                    v-if="drawerPortraitPreviewUrl"
                    :src="drawerPortraitPreviewUrl"
                    alt=""
                    class="drawerPortraitImg"
                  />
                  <span v-else class="drawerPortraitPlaceholder">暂无立绘</span>
                </div>
                <div class="drawerPortraitBtns">
                  <button
                    type="button"
                    class="btn"
                    :disabled="extracting || !draftDisplayName.trim()"
                    @click="onDrawerUploadPortrait"
                  >
                    选择图片
                  </button>
                  <button
                    type="button"
                    class="btn primary"
                    :disabled="
                      extracting || !txt2imgEnabled || !draftDisplayName.trim()
                    "
                    @click="openGenerateFromDrawer"
                  >
                    AI 生成
                  </button>
                </div>
              </div>
            </div>

            <div class="field">
              <span class="label">性别</span>
              <div class="genderToolbarRow">
                <IconButton
                  :icon-html="icons.genderMale"
                  title="男"
                  aria-label="男"
                  :active="draftGender === 'male'"
                  :pressed="draftGender === 'male'"
                  :disabled="extracting"
                  class="genderMale"
                  @click="draftGender = 'male'"
                />
                <IconButton
                  :icon-html="icons.genderFemale"
                  title="女"
                  aria-label="女"
                  :active="draftGender === 'female'"
                  :pressed="draftGender === 'female'"
                  :disabled="extracting"
                  class="genderFemale"
                  @click="draftGender = 'female'"
                />
                <IconButton
                  :icon-html="icons.genderUnknown"
                  title="未知"
                  aria-label="未知"
                  :active="draftGender === 'unknown'"
                  :pressed="draftGender === 'unknown'"
                  :disabled="extracting"
                  class="genderUnknown"
                  @click="draftGender = 'unknown'"
                />
              </div>
            </div>

            <label class="field">
              <span class="label">年龄</span>
              <input
                v-model="draftAgeText"
                type="text"
                :disabled="extracting"
              />
            </label>
            <label class="field">
              <span class="label">身份</span>
              <input
                v-model="draftIdentity"
                type="text"
                :disabled="extracting"
              />
            </label>
            <label class="field">
              <span class="label">简介</span>
              <textarea v-model="draftBio" rows="4" :disabled="extracting" />
            </label>
            <label class="field">
              <span class="label">关系</span>
              <textarea
                v-model="draftRelations"
                rows="4"
                :disabled="extracting"
              />
            </label>
          </div>

          <p v-if="slideError" class="error">{{ slideError }}</p>
        </div>
        <footer class="drawerFoot drawerFoot--links">
          <div class="drawerFootStart">
            <button
              v-if="!isAddMode"
              type="button"
              class="link danger hoverMode drawerFootAction"
              :disabled="extracting"
              @click="onDeleteSlide"
            >
              删除角色
            </button>
          </div>
          <div class="drawerFootEnd">
            <button
              type="button"
              class="link danger hoverMode drawerFootAction"
              :disabled="extracting"
              @click="closeSlide"
            >
              取消
            </button>
            <button
              type="button"
              class="link primary hoverMode drawerFootAction"
              :disabled="extracting || !draftDisplayName.trim()"
              @click="onSaveSlide"
            >
              {{ isAddMode ? "添加角色" : "保存修改" }}
            </button>
          </div>
        </footer>
      </aside>
    </Transition>

    <AppModal
      v-model="generateOpen"
      title="角色立绘生成"
      max-width="720px"
      :mask-closable="false"
      :esc-closable="!generating"
      :body-scroll="false"
    >
      <div v-if="generateOpen" class="genSplit">
        <div class="genPreviewCol">
          <div
            class="genPreviewFrame"
            :class="{
              portraitPreviewClickable: Boolean(genModalActivePreviewUrl),
            }"
            :title="genModalActivePreviewUrl ? '点击查看立绘大图' : undefined"
            role="presentation"
            @click="openPortraitLightboxFromUrl(genModalActivePreviewUrl)"
          >
            <img
              v-if="genModalActivePreviewUrl"
              :src="genModalActivePreviewUrl"
              alt=""
              class="genPreviewImg"
            />
            <span v-else class="genPreviewPlaceholder">暂无预览</span>
          </div>
        </div>
        <div class="genSettingsCol">
          <div class="genSettingsScroll">
            <label class="genFormRow">
              <span class="genFormLabel">画风（本书通用）</span>
              <textarea
                v-model="genStyleZh"
                rows="3"
                class="genFormTextarea"
                placeholder="描述整体的画风、色调、风格等"
              />
            </label>
            <label class="genFormRow">
              <span class="genFormLabel">角色形象</span>
              <textarea
                v-model="genPromptZh"
                rows="4"
                class="genFormTextarea"
                placeholder="描述角色的外貌、服饰、姿态等"
              />
            </label>
            <label v-if="genShowsNegativeAdvanced" class="genFormRow">
              <span class="genFormLabel">负面描述</span>
              <textarea
                v-model="genNegativeZh"
                rows="2"
                class="genFormTextarea"
                placeholder="描述你不希望出现的特征"
              />
            </label>
          </div>
          <div class="genSettingsFoot">
            <div class="genSettingsFootStart">
              <button
                type="button"
                size="large"
                class="btn primary"
                :disabled="!canGenerateImage"
                @click="onGenerateCommit"
              >
                {{ generating ? "生成中…" : "生成" }}
              </button>
              <span
                v-if="genError"
                class="genGenerateError"
                :title="genError"
                >{{ genError }}</span
              >
              <button
                v-if="generating"
                type="button"
                size="large"
                class="btn danger"
                @click="onPortraitTxt2ImgAbort"
              >
                停止
              </button>
            </div>
            <div class="genSettingsFootEnd">
              <button
                type="button"
                size="large"
                class="btn"
                :disabled="generating || genApplying"
                @click="generateOpen = false"
              >
                取消
              </button>
              <button
                type="button"
                size="large"
                class="btn primary"
                :disabled="!canApplyGenTemp"
                @click="onGenApply"
              >
                {{ genApplying ? "应用中…" : "应用" }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppModal>

    <ReaderImageLightbox v-model="portraitLightboxSrc" />
    <Teleport to="body">
      <div
        v-if="popoverCardId"
        class="charCardPopoverBackdrop"
        aria-hidden="true"
        @click="popoverCardId = null"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.characterSidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 auto;
}

.sidebarListWrap {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sidebarTabBody {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.characterContentColumn {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  overflow-x: hidden;
}

.emptySlot {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.characterMainScroll {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cardGrid {
  display: grid;
  min-width: 0;
  max-width: 100%;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  align-items: start;
}

.cardGrid:has(.cardShell--popover) .cardShell:not(.cardShell--popover) {
  opacity: 0.42;
  transition: opacity 0.28s ease;
  pointer-events: none;
}

.empty {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 10px 16px;
  font-size: 12px;
  color: var(--secondary);
}

.sidebarTabBody > .empty {
  flex: 1 1 auto;
}

.sidebarTabFooter {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--muted);
  border-top: 1px solid var(--border);
  background: var(--bg);
  user-select: none;
}

.sidebarTabFooterStat {
  flex: 1;
  min-width: 0;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebarTabFooterEnd {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.sidebarTabFooterAction {
  flex-shrink: 0;
}

.drawerBackdrop {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.38);
}

.drawer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 50;
  width: min(380px, 100%);
  max-width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border-right: 1px solid var(--border);
  box-shadow: 6px 0 22px rgba(0, 0, 0, 0.18);
}

.drawerBody {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 12px 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.drawerFoot {
  flex-shrink: 0;
  border-top: 1px solid var(--border);
  background: var(--bg);
  font-size: 12px;
  color: var(--muted);
  user-select: none;
}

.drawerFoot--links {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  box-sizing: border-box;
}

.drawerFootStart {
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
}

.drawerFootEnd {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  margin-left: auto;
}

.drawerFootAction {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  line-height: 1.25;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  background: var(--panel);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.drawerNameRow {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  min-width: 0;
}

.drawerMainFields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.drawerRetrieveRow {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.drawerRetrieveRowEnd {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto;
}

.drawerRetrieveStopBtn {
  flex-shrink: 0;
}

.drawerNameInput {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
}

.drawerRetrieveBtn {
  flex-shrink: 0;
  white-space: nowrap;
}

/* #icon 插在 AiAssistantDetailsFold 内，由本组件编译，须本地补样式（与阅读助手一致） */
.charRetrieveThinkIconPulse {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: color-mix(in srgb, #3b82f6 75%, var(--accent) 25%);
  animation: charRetrieveThinkPulseBreathe 1.25s ease-in-out infinite;
}

@keyframes charRetrieveThinkPulseBreathe {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.92);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.charRetrieveThinkIconBrain :deep(svg) {
  width: 16px;
  height: 16px;
  display: block;
}

.charRetrieveThinkIconBrain :deep(svg path) {
  fill: currentColor;
}

.drawerPortraitBlock {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drawerPortraitFrame {
  width: 100%;
  aspect-ratio: 3 / 4;
  max-height: 200px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
}

.portraitPreviewClickable {
  cursor: zoom-in;
}

.portraitPreviewClickable:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.drawerPortraitImg {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.drawerPortraitPlaceholder {
  font-size: 12px;
  color: var(--muted);
}

.drawerPortraitBtns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.label {
  font-size: 12px;
}

.genderToolbarRow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.error {
  margin: 0;
  color: var(--error-fg, #c62828);
  line-height: 1.4;
}

.fine {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
}

.muted {
  color: var(--muted);
}

.genSplit {
  display: flex;
  gap: 16px;
  align-items: stretch;
  flex: 1 1 auto;
  min-height: 0;
  max-height: min(78vh, 560px);
  padding: 4px 2px 8px;
  box-sizing: border-box;
}

/* 预览比例与 CharacterRosterCard 一致（宽:高 = 2:3） */
.genPreviewCol {
  flex: 0 0 230px;
  width: 230px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  min-width: 0;
}

.genPreviewFrame {
  width: 100%;
  aspect-ratio: 2 / 3;
  flex: 0 0 auto;
  box-sizing: border-box;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.genPreviewImg {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.genPreviewPlaceholder {
  font-size: 12px;
  color: var(--muted);
  padding: 12px;
  text-align: center;
}

.genSettingsCol {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.genSettingsScroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 4px;
}

.genFormRow {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}

.genFormLabel {
  font-size: 12px;
  font-weight: 600;
  color: var(--fg);
}

.genFormTextarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 0;
}

.genCloudHint {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.45;
}

.genSettingsFoot {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding-top: 10px;
}

.genSettingsFootStart {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.genGenerateError {
  flex: 1 1 0;
  min-width: 0;
  font-size: 12px;
  line-height: 1.35;
  color: var(--danger);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.genSettingsFootEnd {
  display: flex;
  align-items: center;
  gap: 10px;
}

.charDrawerFade-enter-active,
.charDrawerFade-leave-active {
  transition: opacity 0.2s ease;
}
.charDrawerFade-enter-from,
.charDrawerFade-leave-to {
  opacity: 0;
}

.charDrawerSlide-enter-active,
.charDrawerSlide-leave-active {
  transition: transform 0.22s ease;
}
.charDrawerSlide-enter-from,
.charDrawerSlide-leave-to {
  transform: translateX(-104%);
}

.genderMale {
  background: var(--male) !important;
}
.genderFemale {
  background: var(--female) !important;
}
.genderUnknown {
  background: var(--unknown) !important;
}
:deep(.genderMale .icon),
:deep(.genderFemale .icon),
:deep(.genderUnknown .icon) {
  color: #fff;
}
.genderMale,
.genderFemale,
.genderUnknown {
  opacity: 0.3;

  &:hover,
  &.active {
    opacity: 1;
  }
}

.drawerBody .aiFold,
.drawerBody .aiNoticeBanner,
.drawerBody .charRetrieveTokenUsage,
.drawerBody .charRetrieveIndexProgress {
  margin: 0;
}
</style>

<style>
.charCardPopoverBackdrop {
  position: fixed;
  inset: 0;
  z-index: 12000;
  background: color-mix(in srgb, #000 58%, transparent);
}
</style>
