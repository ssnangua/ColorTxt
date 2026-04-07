<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppModal from "./AppModal.vue";
import HexColorPickerField from "./HexColorPickerField.vue";
import {
  defaultReaderPaletteDark,
  defaultReaderPaletteLight,
  READER_SURFACE_LABELS,
  READER_SURFACE_ROW_PAIRS,
  type ReaderSurfacePalette,
} from "../constants/appUi";

const props = defineProps<{
  currentTheme: string;
  readerSurfaceLight: ReaderSurfacePalette;
  readerSurfaceDark: ReaderSurfacePalette;
  monacoFontFamily: string;
}>();

const emit = defineEmits<{
  applyReaderPalettes: [
    payload: { light: ReaderSurfacePalette; dark: ReaderSurfacePalette },
  ];
}>();

const modelValue = defineModel<boolean>({ default: false });

const activeTab = ref<"keywords" | "reader">("reader");

const draftLight = ref<ReaderSurfacePalette>({ ...defaultReaderPaletteLight });
const draftDark = ref<ReaderSurfacePalette>({ ...defaultReaderPaletteDark });

const isLightShell = computed(() => props.currentTheme === "vs");

const activeDraft = computed(() =>
  isLightShell.value ? draftLight.value : draftDark.value,
);

/** 颜色选择弹层打开时的临时预览（未点确定不写回 draft） */
const pickerLive = ref<Partial<Record<keyof ReaderSurfacePalette, string>>>({});

const displaySurface = computed(
  (): ReaderSurfacePalette => ({
    ...activeDraft.value,
    ...pickerLive.value,
  }),
);

const previewBoxStyle = computed(() => ({
  backgroundColor: displaySurface.value.readerBg,
  fontFamily: props.monacoFontFamily,
  fontSize: "18px",
  lineHeight: 1.5,
}));

function syncDraftFromProps() {
  draftLight.value = { ...props.readerSurfaceLight };
  draftDark.value = { ...props.readerSurfaceDark };
}

function colorForEditingKey(key: keyof ReaderSurfacePalette): string {
  return isLightShell.value ? draftLight.value[key] : draftDark.value[key];
}

function onPickerUpdate(key: keyof ReaderSurfacePalette, color: string) {
  const hex = color.startsWith("#") ? color : `#${color}`;
  if (isLightShell.value) {
    draftLight.value = { ...draftLight.value, [key]: hex };
  } else {
    draftDark.value = { ...draftDark.value, [key]: hex };
  }
}

function onPickerDraftHex(key: keyof ReaderSurfacePalette, hex: string) {
  const v = hex.startsWith("#") ? hex : `#${hex}`;
  pickerLive.value = { ...pickerLive.value, [key]: v };
}

function onPickerDraftEnd() {
  pickerLive.value = {};
}

function onApply() {
  emit("applyReaderPalettes", {
    light: { ...draftLight.value },
    dark: { ...draftDark.value },
  });
  modelValue.value = false;
}

function onCancel() {
  modelValue.value = false;
}

function onResetDefaults() {
  draftLight.value = { ...defaultReaderPaletteLight };
  draftDark.value = { ...defaultReaderPaletteDark };
}

watch(modelValue, (open) => {
  if (!open) {
    activeTab.value = "reader";
    pickerLive.value = {};
    return;
  }
  syncDraftFromProps();
});
</script>

<template>
  <AppModal
    v-model="modelValue"
    title="配色"
    max-width="720px"
    :body-scroll="false"
  >
    <div class="colorSchemeLayout">
      <div class="colorSchemeTabBar" role="tablist" aria-label="配色分类">
        <div class="tabs">
          <button
            type="button"
            role="tab"
            class="tabBtn"
            :class="{ active: activeTab === 'keywords' }"
            :aria-selected="activeTab === 'keywords'"
            @click="activeTab = 'keywords'"
          >
            自定义关键词
          </button>
          <button
            type="button"
            role="tab"
            class="tabBtn"
            :class="{ active: activeTab === 'reader' }"
            :aria-selected="activeTab === 'reader'"
            @click="activeTab = 'reader'"
          >
            阅读器
          </button>
        </div>
      </div>

      <div class="colorSchemeScroll">
        <div
          v-show="activeTab === 'keywords'"
          class="colorSchemePlaceholder"
          role="tabpanel"
        >
          <p>敬请期待</p>
        </div>

        <div
          v-show="activeTab === 'reader'"
          class="colorSchemeReader"
          role="tabpanel"
        >
          <div class="readerPalettePreview" :style="previewBoxStyle">
            <p class="readerPalettePreviewP">
              <span :style="{ color: displaySurface.chapterTitle }"
                >第6章 实力测试</span
              >
            </p>
            <p class="readerPalettePreviewP">
              <span class="readerPalettePreviewIndent">　　</span>
              <span :style="{ color: displaySurface.txtrSpecialMarker }"
                >＊＊＊＊＊＊＊＊＊＊</span
              >
            </p>
            <p class="readerPalettePreviewP">
              <span class="readerPalettePreviewIndent">　　</span>
              <span class="readerPalettePreviewBody">可靠</span>
              <span :style="{ color: displaySurface.txtrPunctuation }">《</span>
              <span :style="{ color: displaySurface.txtrBracketInner }"
                >九重雷刀</span
              >
              <span :style="{ color: displaySurface.txtrPunctuation }">》</span>
              <span class="readerPalettePreviewBody">发力方法</span>
              <span :style="{ color: displaySurface.txtrPunctuation }">，</span>
              <span class="readerPalettePreviewBody">却达到初级战将级</span>
              <span :style="{ color: displaySurface.txtrPunctuation }">，</span>
              <span class="readerPalettePreviewBody">而且是远超底线</span>
              <span :style="{ color: displaySurface.txtrNumber }">8000</span>
              <span :style="{ color: displaySurface.txtrEnglish }">kg</span>
              <span :style="{ color: displaySurface.txtrPunctuation }">。</span>
            </p>
            <p class="readerPalettePreviewP">
              <span class="readerPalettePreviewIndent">　　</span>
              <span :style="{ color: displaySurface.txtrPunctuation }">“</span>
              <span :style="{ color: displaySurface.txtrQuoteInner }"
                >最后测试一下神经反应速度。</span
              >
              <span :style="{ color: displaySurface.txtrPunctuation }">”</span>
            </p>
          </div>

          <table class="colorSchemeTable">
            <tbody>
              <tr v-for="(pair, rowIdx) in READER_SURFACE_ROW_PAIRS" :key="rowIdx">
                <td class="colorSchemeRowLabel">
                  {{ READER_SURFACE_LABELS[pair[0]] }}
                </td>
                <td>
                  <HexColorPickerField
                    :model-value="colorForEditingKey(pair[0])"
                    @update:model-value="onPickerUpdate(pair[0], $event)"
                    @draft-hex="onPickerDraftHex(pair[0], $event)"
                    @draft-end="onPickerDraftEnd"
                  />
                </td>
                <td class="colorSchemeRowLabel">
                  {{ READER_SURFACE_LABELS[pair[1]] }}
                </td>
                <td>
                  <HexColorPickerField
                    :model-value="colorForEditingKey(pair[1])"
                    @update:model-value="onPickerUpdate(pair[1], $event)"
                    @draft-hex="onPickerDraftHex(pair[1], $event)"
                    @draft-end="onPickerDraftEnd"
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <div class="colorSchemeReaderFooter">
            <button type="button" class="btn" size="large" @click="onResetDefaults">
              还原默认配色
            </button>
            <div class="colorSchemeReaderFooterActions">
              <button type="button" class="btn" size="large" @click="onCancel">
                取消
              </button>
              <button
                type="button"
                class="btn primary"
                size="large"
                @click="onApply"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppModal>
</template>

<style scoped>
.colorSchemeLayout {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.colorSchemeTabBar {
  flex-shrink: 0;
  margin-bottom: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.colorSchemeScroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-top: 8px;
}

.tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tabBtn {
  box-sizing: border-box;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--tab-fg);
  font-size: 14px;
  padding: 8px 10px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
  display: inline-flex;
  align-items: center;
}

.tabBtn:hover {
  color: var(--tab-fg-hover);
  background: transparent;
}

.tabBtn.active {
  color: var(--tab-fg-active);
  background: transparent;
  border-bottom: 2px solid var(--tab-underline);
  font-weight: 600;
}

.colorSchemePlaceholder {
  min-height: 120px;
  padding: 24px 0;
  color: var(--muted);
  font-size: 14px;
}

.readerPalettePreview {
  margin-bottom: 16px;
  padding: 14px 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
  white-space: pre-wrap;
  word-break: break-word;
}

.readerPalettePreviewP {
  margin: 0;
}

.readerPalettePreviewIndent,
.readerPalettePreviewBody {
  color: var(--fg);
}

.colorSchemeTable {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  table-layout: fixed;
}

.colorSchemeTable td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.colorSchemeTable td:nth-child(1),
.colorSchemeTable td:nth-child(3) {
  width: 22%;
}

.colorSchemeRowLabel {
  font-weight: normal;
  color: var(--fg);
}

.colorSchemeReaderFooter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 16px;
  padding-top: 4px;
  width: 100%;
}

.colorSchemeReaderFooterActions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
</style>
