<script setup lang="ts">
import {
  computed,
  inject,
  onBeforeUnmount,
  ref,
  watch,
  type ComponentPublicInstance,
} from "vue";
import type { ChapterMatchRule } from "../chapter";
import { bookmarkNoteInputRefKey } from "../injectionKeys";
import type { FileBookmarkItem } from "../stores/fileMetaStore";
import AboutPanel from "./AboutPanel.vue";
import AppModal from "./AppModal.vue";
import ColorSchemePanel from "./ColorSchemePanel.vue";
import AppUpdateFlow from "./AppUpdateFlow.vue";
import ChapterRulePanel from "./ChapterRulePanel.vue";
import SettingsPanel, { type SettingsApplyPayload } from "./SettingsPanel.vue";
import ShortcutPanel from "./ShortcutPanel.vue";
import type { ShortcutBindingMap } from "../services/shortcutRegistry";
import type { ReaderSurfacePalette } from "../constants/appUi";
import { readerEbookConvertingHintText } from "../constants/appUi";

const bookmarkNoteInputRef = inject(bookmarkNoteInputRefKey)!;

const props = defineProps<{
  restoreSessionOnStartup: boolean;
  recentFilesHistoryLimit: number;
  fullscreenReaderWidthPercent: number;
  readerFontSize: number;
  readerLineHeightMultiple: number;
  compressBlankKeepOneBlank: boolean;
  monacoCustomHighlight: boolean;
  txtrDelimitedMatchCrossLine: boolean;
  chapterRules: ChapterMatchRule[];
  chapterRuleErrorText: string;
  editingBookmarkLine: number | null;
  activeBookmarkInViewport: FileBookmarkItem | null;
  dirListScanning: boolean;
  dirListCurrentName: string;
  ebookParsing: boolean;
  shortcutBindings: ShortcutBindingMap;
  defaultShortcutBindings: ShortcutBindingMap;
  currentTheme: string;
  readerSurfaceLight: ReaderSurfacePalette;
  readerSurfaceDark: ReaderSurfacePalette;
  monacoFontFamily: string;
  highlightColorsLight: string[];
  highlightColorsDark: string[];
  ebookConvertOutputDir: string;
}>();

const emit = defineEmits<{
  applySettings: [payload: SettingsApplyPayload];
  applyChapterRules: [payload: { rules: ChapterMatchRule[] }];
  confirmAddBookmark: [];
  confirmRemoveActiveBookmark: [];
  applyShortcutBindings: [payload: ShortcutBindingMap];
  applyReaderPalettes: [
    payload: { light: ReaderSurfacePalette; dark: ReaderSurfacePalette },
  ];
  applyHighlightColors: [payload: { light: string[]; dark: string[] }];
}>();

const showAboutPanel = defineModel<boolean>("showAboutPanel", {
  default: false,
});
const showShortcutPanel = defineModel<boolean>("showShortcutPanel", {
  default: false,
});
const showSettingsPanel = defineModel<boolean>("showSettingsPanel", {
  default: false,
});
const showChapterRulePanel = defineModel<boolean>("showChapterRulePanel", {
  default: false,
});
const showColorSchemePanel = defineModel<boolean>("showColorSchemePanel", {
  default: false,
});
const addBookmarkOpen = defineModel<boolean>("addBookmarkOpen", {
  default: false,
});
const removeBookmarkOpen = defineModel<boolean>("removeBookmarkOpen", {
  default: false,
});
const bookmarkNoteInput = defineModel<string>("bookmarkNoteInput", {
  default: "",
});

const appUpdateFlowRef = ref<InstanceType<typeof AppUpdateFlow> | null>(null);
const convertingDotCount = ref(0);
let convertingDotTimer: number | null = null;

defineExpose({
  checkForUpdates: () => appUpdateFlowRef.value?.checkForUpdates(),
});

function bindBookmarkInput(el: Element | ComponentPublicInstance | null) {
  const node =
    el && typeof el === "object" && "$el" in el
      ? (el as ComponentPublicInstance).$el
      : el;
  bookmarkNoteInputRef.value = node as HTMLTextAreaElement | null;
}

function onBookmarkNoteKeydown(e: KeyboardEvent) {
  if (e.key !== "Enter" || e.isComposing) return;
  e.preventDefault();
  emit("confirmAddBookmark");
}

const convertingHintText = computed(() => {
  const baseText = readerEbookConvertingHintText.replace(/[.…]+$/u, "");
  return `${baseText}${".".repeat(convertingDotCount.value)}`;
});

watch(
  () => props.ebookParsing,
  (parsing) => {
    if (parsing) {
      convertingDotCount.value = 0;
      if (convertingDotTimer == null) {
        convertingDotTimer = window.setInterval(() => {
          convertingDotCount.value = (convertingDotCount.value + 1) % 4;
        }, 360);
      }
      return;
    }
    convertingDotCount.value = 0;
    if (convertingDotTimer != null) {
      window.clearInterval(convertingDotTimer);
      convertingDotTimer = null;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (convertingDotTimer != null) {
    window.clearInterval(convertingDotTimer);
    convertingDotTimer = null;
  }
});
</script>

<template>
  <AppUpdateFlow ref="appUpdateFlowRef" />

  <AboutPanel v-model="showAboutPanel" />
  <ShortcutPanel
    v-model="showShortcutPanel"
    :shortcut-bindings="shortcutBindings"
    :default-shortcut-bindings="defaultShortcutBindings"
    @apply="emit('applyShortcutBindings', $event)"
  />
  <SettingsPanel
    v-model="showSettingsPanel"
    :restore-session-on-startup="restoreSessionOnStartup"
    :recent-files-history-limit="recentFilesHistoryLimit"
    :fullscreen-reader-width-percent="fullscreenReaderWidthPercent"
    :reader-font-size="readerFontSize"
    :reader-line-height-multiple="readerLineHeightMultiple"
    :compress-blank-keep-one-blank="compressBlankKeepOneBlank"
    :monaco-custom-highlight="monacoCustomHighlight"
    :txtr-delimited-match-cross-line="txtrDelimitedMatchCrossLine"
    :ebook-convert-output-dir="ebookConvertOutputDir"
    @apply="emit('applySettings', $event)"
  />
  <ChapterRulePanel
    v-model="showChapterRulePanel"
    :rules="chapterRules"
    :error-text="chapterRuleErrorText"
    @apply="emit('applyChapterRules', $event)"
  />

  <ColorSchemePanel
    v-model="showColorSchemePanel"
    :current-theme="currentTheme"
    :reader-surface-light="readerSurfaceLight"
    :reader-surface-dark="readerSurfaceDark"
    :monaco-font-family="monacoFontFamily"
    :highlight-colors-light="highlightColorsLight"
    :highlight-colors-dark="highlightColorsDark"
    @apply-reader-palettes="emit('applyReaderPalettes', $event)"
    @apply-highlight-colors="emit('applyHighlightColors', $event)"
  />

  <AppModal
    v-model="addBookmarkOpen"
    :title="editingBookmarkLine == null ? '添加书签' : '编辑书签'"
    max-width="480px"
  >
    <div class="bookmarkModalBody">
      <textarea
        :ref="bindBookmarkInput"
        v-model="bookmarkNoteInput"
        class="bookmarkNoteInput"
        rows="3"
        wrap="soft"
        placeholder="输入备注（可选）"
        @keydown="onBookmarkNoteKeydown"
      />
    </div>
    <template #footer>
      <div class="bookmarkModalFooter">
        <button class="btn" size="large" @click="addBookmarkOpen = false">
          取消
        </button>
        <button
          class="btn primary"
          size="large"
          @click="emit('confirmAddBookmark')"
        >
          {{ editingBookmarkLine == null ? "添加" : "保存" }}
        </button>
      </div>
    </template>
  </AppModal>

  <AppModal v-model="removeBookmarkOpen" title="移除书签" max-width="480px">
    <div class="bookmarkModalBody">
      <p class="bookmarkModalText">
        {{ activeBookmarkInViewport?.note || "无备注" }}
      </p>
    </div>
    <template #footer>
      <div class="bookmarkModalFooter">
        <button class="btn" size="large" @click="removeBookmarkOpen = false">
          取消
        </button>
        <button
          class="btn danger"
          size="large"
          @click="emit('confirmRemoveActiveBookmark')"
        >
          移除
        </button>
      </div>
    </template>
  </AppModal>

  <Transition name="dirScanOverlay">
    <div
      v-if="dirListScanning || ebookParsing"
      class="dirScanOverlay"
      aria-live="polite"
      aria-busy="true"
    >
      <p class="dirScanLine" :title="dirListCurrentName">
        {{
          ebookParsing
            ? convertingHintText
            : dirListCurrentName || "准备中…"
        }}
      </p>
    </div>
  </Transition>
</template>

<style scoped>
.dirScanOverlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
}

.dirScanLine {
  margin: 0;
  max-width: min(92vw, 720px);
  font-size: 12px;
  color: #ffffff;
  text-align: center;
  word-break: break-all;
  font-family: ui-monospace, "Cascadia Mono", "Consolas", monospace;
}

.dirScanOverlay-enter-active,
.dirScanOverlay-leave-active {
  transition: opacity 0.2s ease;
}

.dirScanOverlay-enter-from,
.dirScanOverlay-leave-to {
  opacity: 0;
}

.bookmarkModalBody {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bookmarkModalText {
  margin: 0;
  font-size: 13px;
  color: var(--fg);
  white-space: pre-wrap;
  word-break: break-word;
}

.bookmarkNoteInput {
  width: 100%;
  resize: none;
  font-size: 14px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.bookmarkModalFooter {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
