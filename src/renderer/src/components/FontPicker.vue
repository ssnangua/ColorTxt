<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  ref,
  computed,
  watch,
  nextTick,
} from "vue";
import { icons } from "../icons";
import IconButton from "./IconButton.vue";
import VirtualList from "./VirtualList.vue";
import { cssFontFamilyStack } from "../utils/fontFamilyCss";
import {
  PRESET_FONT_KEYS,
  detectFontPickerSelection,
  getPresetCssStack,
  getPresetFontStack,
  getPresetLabel,
  type PresetFontKey,
} from "../utils/presetFontDefinitions";

const props = defineProps<{
  monacoFontFamily: string;
}>();

const emit = defineEmits<{
  setMonacoFont: [fontFamily: string];
}>();

const fontMenuOpen = ref(false);
const showOtherFontsPanel = ref(false);
const systemFonts = ref<string[]>([]);
const systemFontsLoading = ref(false);

const fontMenuRootEl = ref<HTMLElement | null>(null);
const otherFontFilterInputRef = ref<HTMLInputElement | null>(null);
const fontOtherVirtualListRef = ref<InstanceType<typeof VirtualList> | null>(
  null,
);

/** 系统字体列表过滤关键字 */
const otherFontFilter = ref("");

const filteredSystemFonts = computed(() => {
  const list = systemFonts.value;
  const q = otherFontFilter.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter((f) => f.toLowerCase().includes(q));
});

/** 虚拟列表单行高度（px），与 `.fontOtherItem` 一致 */
const FONT_ROW_STRIDE = 36;
const VIRTUAL_OVERSCAN = 10;

const selectedFont = computed(() =>
  detectFontPickerSelection(props.monacoFontFamily),
);

const presetFontMenuItems = computed(() =>
  PRESET_FONT_KEYS.map((key) => ({
    key,
    label: getPresetLabel(key),
    stack: getPresetFontStack(key),
  })),
);

const fontPickerButtonTitle = computed(() =>
  selectedFont.value.key === "other"
    ? `字体：${selectedFont.value.otherName ?? ""}`
    : `字体：${getPresetLabel(selectedFont.value.key)}`,
);

const selectedOtherFontNormalized = computed(() => {
  if (selectedFont.value.key !== "other") return null;
  return (selectedFont.value.otherName ?? "").trim();
});

function setFontAndClose(fontFamily: string) {
  // 切换字体后保持面板打开，便于连续预览与比较
  emit("setMonacoFont", fontFamily);
}

async function ensureSystemFontsLoaded() {
  if (systemFonts.value.length > 0 || systemFontsLoading.value) return;
  if (!(window as any).colorTxt?.listSystemFonts) return;
  systemFontsLoading.value = true;
  try {
    systemFonts.value = await (window as any).colorTxt.listSystemFonts();
  } catch {
    systemFonts.value = [];
  } finally {
    systemFontsLoading.value = false;
  }
}

function toggleFontMenu() {
  fontMenuOpen.value = !fontMenuOpen.value;
  if (!fontMenuOpen.value) {
    showOtherFontsPanel.value = false;
    otherFontFilter.value = "";
  }
}

function choosePreset(key: PresetFontKey) {
  setFontAndClose(getPresetCssStack(key));
}

async function openOtherFonts() {
  showOtherFontsPanel.value = true;
  otherFontFilter.value = "";
  await ensureSystemFontsLoaded();
  await nextTick();
  otherFontFilterInputRef.value?.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollSelectedOtherFontIntoView();
    });
  });
}

function chooseOtherFont(fontName: string) {
  setFontAndClose(cssFontFamilyStack([fontName]));
}

function isOtherFontSelected(fontName: string) {
  if (selectedFont.value.key !== "other") return false;
  return fontName.trim() === (selectedFont.value.otherName ?? "").trim();
}

function closeFontMenu() {
  fontMenuOpen.value = false;
  showOtherFontsPanel.value = false;
  otherFontFilter.value = "";
}

function scrollSelectedOtherFontIntoView() {
  const selected = selectedOtherFontNormalized.value;
  if (!selected) return;
  const list = filteredSystemFonts.value;
  const idx = list.findIndex((f) => f.trim() === selected.trim());
  if (idx < 0) return;
  fontOtherVirtualListRef.value?.scrollToIndex(idx, { align: "center" });
}

watch(
  () => [
    showOtherFontsPanel.value,
    systemFontsLoading.value,
    systemFonts.value,
  ],
  ([opened, loading]) => {
    if (!opened) return;
    if (loading) return;
    void nextTick().then(() => {
      requestAnimationFrame(() => scrollSelectedOtherFontIntoView());
    });
  },
);

watch(otherFontFilter, () => {
  if (!showOtherFontsPanel.value || systemFontsLoading.value) return;
  void nextTick().then(() => {
    fontOtherVirtualListRef.value?.scrollToTop();
    requestAnimationFrame(() => scrollSelectedOtherFontIntoView());
  });
});

const onPointerDown = (_ev: PointerEvent) => {
  if (!fontMenuOpen.value) return;
  const root = fontMenuRootEl.value;
  if (!root) return;
  const target = _ev.target as Node | null;
  if (target && root.contains(target)) return;
  closeFontMenu();
};

onMounted(() => {
  document.addEventListener("pointerdown", onPointerDown, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onPointerDown, true);
});
</script>

<template>
  <div ref="fontMenuRootEl" class="fontPicker">
    <IconButton
      :icon-html="icons.fontFamily"
      :active="fontMenuOpen"
      :pressed="fontMenuOpen"
      :title="fontPickerButtonTitle"
      aria-label="选择字体"
      @click.stop="toggleFontMenu"
    />

    <div v-if="fontMenuOpen" class="fontMenu" @click.stop>
      <div v-if="!showOtherFontsPanel" class="fontMenuList">
        <button
          v-for="item in presetFontMenuItems"
          :key="item.key"
          class="fontMenuItem"
          :class="{ active: selectedFont.key === item.key }"
          :style="{ fontFamily: cssFontFamilyStack(item.stack) }"
          @click="choosePreset(item.key)"
        >
          {{ item.label }}
        </button>

        <button
          v-if="selectedFont.key === 'other' && selectedFont.otherName"
          class="fontMenuItem"
          :class="{ active: selectedFont.key === 'other' }"
          :style="{
            fontFamily: cssFontFamilyStack([selectedFont.otherName]),
          }"
          @click="void openOtherFonts()"
        >
          {{ selectedFont.otherName }}
        </button>

        <div class="fontMenuDivider"></div>

        <button class="fontMenuItem" @click="openOtherFonts">其他字体</button>
      </div>

      <div v-else class="fontOtherPanel">
        <div class="fontOtherHeader">
          <div class="fontOtherTitle">选择系统字体</div>
          <button
            class="btn"
            @click="
              showOtherFontsPanel = false;
              otherFontFilter = '';
            "
          >
            返回
          </button>
        </div>

        <div v-if="systemFontsLoading" class="fontOtherLoading">加载中...</div>

        <template v-else>
          <div class="fontOtherFilterRow">
            <input
              ref="otherFontFilterInputRef"
              v-model="otherFontFilter"
              type="search"
              class="fontOtherFilterInput"
              placeholder="过滤字体名称…"
              autocomplete="off"
              spellcheck="false"
              @click.stop
            />
          </div>

          <div v-if="systemFonts.length === 0" class="fontOtherEmpty">
            未获取到字体列表
          </div>
          <div
            v-else-if="filteredSystemFonts.length === 0"
            class="fontOtherEmpty"
          >
            无匹配的字体
          </div>
          <VirtualList
            v-else
            ref="fontOtherVirtualListRef"
            class="fontOtherList"
            :item-count="filteredSystemFonts.length"
            :row-stride="FONT_ROW_STRIDE"
            :overscan="VIRTUAL_OVERSCAN"
            :scroll-padding="10"
            :item-key="(i) => filteredSystemFonts[i] ?? i"
          >
            <template #default="{ index }">
              <button
                type="button"
                class="fontOtherItem"
                :class="{
                  active: isOtherFontSelected(filteredSystemFonts[index]),
                }"
                :style="{
                  fontFamily: cssFontFamilyStack([filteredSystemFonts[index]]),
                }"
                @click="chooseOtherFont(filteredSystemFonts[index])"
              >
                {{ filteredSystemFonts[index] }}
              </button>
            </template>
          </VirtualList>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fontPicker {
  position: relative;
}

.fontMenu {
  position: absolute;
  top: 38px;
  right: 0;
  z-index: 200;
  min-width: 220px;
  max-width: 300px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.fontMenuDivider {
  height: 1px;
  background: var(--border);
  margin: 0;
}

.fontMenuList {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fontMenuItem {
  text-align: left;
  border: none;
  background: transparent;
  color: var(--list-item-fg);
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fontMenuItem:hover {
  color: var(--list-item-fg);
  background: var(--list-item-bg-hover);
}

.fontMenuItem.active {
  color: var(--list-item-fg-active);
  background: var(--list-item-bg-active);
}

.fontOtherPanel {
  display: flex;
  flex-direction: column;
  max-height: 70vh;
  min-height: 0; /* allow inner scroll */
}

.fontOtherFilterRow {
  padding: 0 6px 8px 6px;
  flex-shrink: 0;
}

.fontOtherFilterInput {
  width: 100%;
  box-sizing: border-box;
}

.fontOtherHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 6px 12px 6px;
}

.fontOtherTitle {
  font-size: 12px;
  color: var(--fg);
}

.fontOtherLoading,
.fontOtherEmpty {
  padding: 10px;
  color: var(--muted);
  font-size: 12px;
}

.fontOtherList {
  overflow: auto;
  padding-right: 2px;
  min-height: 0; /* allow flex overflow container to size correctly */
  flex: 1;
}

.fontOtherItem {
  text-align: left;
  border: none;
  background: transparent;
  color: var(--list-item-fg);
  box-sizing: border-box;
  height: 36px;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.fontOtherItem:hover {
  color: var(--list-item-fg);
  background: var(--list-item-bg-hover);
}

.fontOtherItem.active {
  color: var(--list-item-fg-active);
  background: var(--list-item-bg-active);
}
</style>
