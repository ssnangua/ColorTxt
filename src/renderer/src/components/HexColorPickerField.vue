<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import {
  hexToHsv,
  hsvToHex,
  normalizeLooseHex6,
  type Hsv,
} from "../utils/color";

const props = withDefaults(
  defineProps<{
    /** `#RRGGBB` */
    modelValue: string;
    disabled?: boolean;
    /** 弹层 z-index（需高于所在蒙版） */
    popoverZIndex?: number;
  }>(),
  {
    disabled: false,
    popoverZIndex: 12000,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  /** 弹层打开时草稿色变化（用于外部实时预览颜色） */
  draftHex: [value: string];
  /** 弹层关闭（确定/取消/失焦），外部应清除对该行的临时预览 */
  draftEnd: [];
}>();

const rootRef = ref<HTMLElement | null>(null);
const popRef = ref<HTMLElement | null>(null);
const svBoxRef = ref<HTMLElement | null>(null);
const hueBarRef = ref<HTMLElement | null>(null);

const popOpen = ref(false);
const draft = ref<Hsv>({ h: 210, s: 0.7, v: 0.9 });
const hexInput = ref("");
const hexInputElRef = ref<HTMLInputElement | null>(null);
const popStyle = ref<Record<string, string>>({});
/** 避免首帧高度为 0 时用 fallback 判定「贴底」、实测变矮后又改回下方导致跳动 */
const popVertPlacementLock = ref<"below" | "above" | null>(null);

function syncDraftFromModel() {
  const h = hexToHsv(props.modelValue);
  if (h) draft.value = { ...h };
  else draft.value = { h: 210, s: 0.7, v: 0.9 };
  hexInput.value = props.modelValue;
}

const POP_GAP = 6;
const POP_FALLBACK_W = 280;
const POP_FALLBACK_H = 260;

function placePopover(popEl?: HTMLElement | null) {
  const root = rootRef.value;
  const pop = popEl ?? popRef.value;
  if (!root) return;
  const r = root.getBoundingClientRect();
  const pr = pop?.getBoundingClientRect();
  const popW =
    pr && pr.width >= 1 ? pr.width : POP_FALLBACK_W;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let placement: "below" | "above";
  if (popVertPlacementLock.value !== null) {
    placement = popVertPlacementLock.value;
  } else {
    const hForFlip =
      pr && pr.height >= 1 ? pr.height : POP_FALLBACK_H;
    const belowTop = r.bottom + POP_GAP;
    placement =
      belowTop + hForFlip > vh - 8 ? "above" : "below";
    popVertPlacementLock.value = placement;
  }

  let left = r.left + r.width / 2 - popW / 2;
  if (left + popW > vw - 8) left = Math.max(8, vw - popW - 8);
  if (left < 8) left = 8;

  /** 在上方时用 bottom 锚定底边到色块顶侧 */
  if (placement === "below") {
    let top = r.bottom + POP_GAP;
    if (top < 8) top = 8;
    popStyle.value = {
      position: "fixed",
      left: `${left}px`,
      top: `${top}px`,
      bottom: "auto",
      zIndex: String(props.popoverZIndex),
      transformOrigin: "top center",
    };
  } else {
    popStyle.value = {
      position: "fixed",
      left: `${left}px`,
      top: "auto",
      bottom: `${vh - r.top + POP_GAP}px`,
      zIndex: String(props.popoverZIndex),
      transformOrigin: "bottom center",
    };
  }
}

function onPopBeforeEnter(el: Element) {
  placePopover(el as HTMLElement);
}

function onPopAfterEnter() {
  requestAnimationFrame(() => {
    placePopover();
    hexInputElRef.value?.focus();
  });
}

function openPop() {
  if (props.disabled) return;
  syncDraftFromModel();
  popVertPlacementLock.value = null;
  popOpen.value = true;
}

function closePop() {
  popOpen.value = false;
  popVertPlacementLock.value = null;
  emit("draftEnd");
}

function togglePop() {
  if (popOpen.value) closePop();
  else openPop();
}

function onCancel() {
  syncDraftFromModel();
  closePop();
}

function onConfirm() {
  applyHexInputToDraft();
  const hex = hsvToHex(draft.value.h, draft.value.s, draft.value.v);
  emit("update:modelValue", hex);
  closePop();
}

function hueForCss(h: number): number {
  return ((h % 360) + 360) % 360;
}

/** 与 pickHue / 光标一致：自上而下 hue 0°→360°（线性） */
const hueBg =
  "linear-gradient(to bottom, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))";

const svLayersStyle = computed(() => ({
  backgroundColor: `hsl(${hueForCss(draft.value.h)}, 100%, 50%)`,
}));

const svCursorStyle = computed(() => ({
  left: `${draft.value.s * 100}%`,
  top: `${(1 - draft.value.v) * 100}%`,
  transform: "translate(-50%, -50%)",
}));

const hueCursorStyle = computed(() => ({
  top: `${(draft.value.h / 360) * 100}%`,
  left: "50%",
  transform: "translate(-50%, -50%)",
}));

/** 弹层打开时用草稿色实时预览；关闭后用已确认的 modelValue */
const swatchDisplayColor = computed(() => {
  if (!popOpen.value) return props.modelValue;
  return hsvToHex(draft.value.h, draft.value.s, draft.value.v);
});

function pickSvFromEvent(ev: PointerEvent, box: HTMLElement) {
  const r = box.getBoundingClientRect();
  const x = Math.max(0, Math.min(r.width, ev.clientX - r.left));
  const y = Math.max(0, Math.min(r.height, ev.clientY - r.top));
  draft.value = {
    ...draft.value,
    s: r.width <= 0 ? 0 : x / r.width,
    v: r.height <= 0 ? 0 : 1 - y / r.height,
  };
  hexInput.value = hsvToHex(draft.value.h, draft.value.s, draft.value.v);
}

function pickHueFromEvent(ev: PointerEvent, bar: HTMLElement) {
  const r = bar.getBoundingClientRect();
  const y = Math.max(0, Math.min(r.height, ev.clientY - r.top));
  const t = r.height <= 0 ? 0 : y / r.height;
  /** 底部 t=1 对应 h=360（与顶部 h=0 同色），勿改为 0，否则滑块会跳到顶端 */
  const h = t * 360;
  draft.value = {
    ...draft.value,
    h,
  };
  hexInput.value = hsvToHex(draft.value.h, draft.value.s, draft.value.v);
}

let svDragging = false;
let hueDragging = false;

function blurHexInput() {
  hexInputElRef.value?.blur();
}

function onSvPointerDown(ev: PointerEvent) {
  const box = svBoxRef.value;
  if (!box) return;
  blurHexInput();
  ev.preventDefault();
  ev.stopPropagation();
  svDragging = true;
  box.setPointerCapture(ev.pointerId);
  pickSvFromEvent(ev, box);
}

function onSvPointerMove(ev: PointerEvent) {
  if (!svDragging) return;
  const box = svBoxRef.value;
  if (!box) return;
  pickSvFromEvent(ev, box);
}

function onSvPointerUp(ev: PointerEvent) {
  if (!svDragging) return;
  svDragging = false;
  try {
    svBoxRef.value?.releasePointerCapture(ev.pointerId);
  } catch {
    // ignore
  }
}

function onHuePointerDown(ev: PointerEvent) {
  const bar = hueBarRef.value;
  if (!bar) return;
  blurHexInput();
  ev.preventDefault();
  ev.stopPropagation();
  hueDragging = true;
  bar.setPointerCapture(ev.pointerId);
  pickHueFromEvent(ev, bar);
}

function onHuePointerMove(ev: PointerEvent) {
  if (!hueDragging) return;
  const bar = hueBarRef.value;
  if (!bar) return;
  pickHueFromEvent(ev, bar);
}

function onHuePointerUp(ev: PointerEvent) {
  if (!hueDragging) return;
  hueDragging = false;
  try {
    hueBarRef.value?.releasePointerCapture(ev.pointerId);
  } catch {
    // ignore
  }
}

function applyHexInputToDraft() {
  const raw = hexInput.value.trim();
  const canonical = normalizeLooseHex6(raw);
  if (!canonical) return;
  const h = hexToHsv(canonical);
  if (!h) return;
  draft.value = { ...h };
  hexInput.value = canonical;
}

function onDocPointerDown(ev: PointerEvent) {
  if (!popOpen.value) return;
  const t = ev.target as Node | null;
  if (!t) return;
  if (rootRef.value?.contains(t) || popRef.value?.contains(t)) return;
  onCancel();
}

function onWinResize() {
  if (!popOpen.value) return;
  popVertPlacementLock.value = null;
  placePopover();
}

watch(
  () => props.modelValue,
  () => {
    if (!popOpen.value) return;
    hexInput.value = props.modelValue;
  },
);

watch(
  () => draft.value,
  () => {
    if (!popOpen.value) return;
    emit("draftHex", hsvToHex(draft.value.h, draft.value.s, draft.value.v));
  },
  { deep: true },
);

onMounted(() => {
  document.addEventListener("pointerdown", onDocPointerDown, true);
  window.addEventListener("resize", onWinResize);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointerDown, true);
  window.removeEventListener("resize", onWinResize);
});
</script>

<template>
  <div ref="rootRef" class="hexColorPicker">
    <button
      type="button"
      class="hexColorPickerTrigger"
      :class="{ 'hexColorPickerTrigger--open': popOpen }"
      :disabled="disabled"
      :aria-expanded="popOpen"
      aria-haspopup="dialog"
      :title="swatchDisplayColor"
      @click.stop="togglePop"
    >
      <span
        class="hexColorPickerSwatch"
        :style="{ backgroundColor: swatchDisplayColor }"
      />
    </button>
    <Teleport to="body">
      <Transition
        name="hexPickerPop"
        @before-enter="onPopBeforeEnter"
        @after-enter="onPopAfterEnter"
      >
        <div
          v-if="popOpen"
          ref="popRef"
          class="hexColorPickerPop"
          :style="popStyle"
          role="dialog"
          aria-label="选择颜色"
          @click.stop
        >
          <div class="hexColorPickerMain">
            <div
              ref="svBoxRef"
              class="hexColorPickerSv"
              :style="svLayersStyle"
              @pointerdown="onSvPointerDown"
              @pointermove="onSvPointerMove"
              @pointerup="onSvPointerUp"
              @pointercancel="onSvPointerUp"
            >
              <div class="hexColorPickerSvWhite" />
              <div class="hexColorPickerSvBlack" />
              <div class="hexColorPickerSvCursor" :style="svCursorStyle" />
            </div>
            <div
              ref="hueBarRef"
              class="hexColorPickerHue"
              :style="{ background: hueBg }"
              @pointerdown="onHuePointerDown"
              @pointermove="onHuePointerMove"
              @pointerup="onHuePointerUp"
              @pointercancel="onHuePointerUp"
            >
              <div class="hexColorPickerHueCursor" :style="hueCursorStyle" />
            </div>
          </div>
          <div class="hexColorPickerFooter">
            <input
              ref="hexInputElRef"
              v-model="hexInput"
              class="hexColorPickerHexInput"
              type="text"
              spellcheck="false"
              maxlength="7"
              aria-label="十六进制色值"
              @change="applyHexInputToDraft"
              @keyup.enter="applyHexInputToDraft"
            />
            <div class="hexColorPickerActions">
              <button type="button" class="hexColorPickerBtnText" @click="onCancel">
                取消
              </button>
              <button type="button" class="btn" @click="onConfirm">
                确定
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.hexColorPicker {
  display: inline-flex;
  vertical-align: middle;
}

.hexColorPickerTrigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 4px;
  box-sizing: border-box;
  border-radius: 6px;
  border: 1px solid var(--border, #dcdfe6);
  background: var(--panel, #fff);
  cursor: pointer;
}

.hexColorPickerTrigger--open {
  border-color: var(--accent, #409eff);
}

.hexColorPickerTrigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hexColorPickerSwatch {
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  aspect-ratio: 1;
  border-radius: 2px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}

.hexColorPickerPop {
  --picker-handle-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.28),
    0 1px 2px rgba(0, 0, 0, 0.22);

  width: 280px;
  padding: 12px;
  border-radius: 8px;
  background: var(--panel, #fff);
  border: 1px solid var(--border, #e4e7ed);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  overflow: visible;
}

.hexPickerPop-enter-active,
.hexPickerPop-leave-active {
  transition: transform 0.2s cubic-bezier(0.33, 1, 0.68, 1);
}

.hexPickerPop-enter-from,
.hexPickerPop-leave-to {
  transform: scaleY(0);
}

.hexPickerPop-enter-to,
.hexPickerPop-leave-from {
  transform: scaleY(1);
}

.hexColorPickerMain {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.hexColorPickerSv {
  position: relative;
  flex: 1;
  height: 140px;
  border-radius: 0;
  overflow: visible;
  cursor: crosshair;
  touch-action: none;
}

.hexColorPickerSvWhite {
  position: absolute;
  inset: 0;
  background: linear-gradient(to right, #fff, rgba(255, 255, 255, 0));
  pointer-events: none;
}

.hexColorPickerSvBlack {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, #000, rgba(0, 0, 0, 0));
  pointer-events: none;
}

.hexColorPickerSvCursor {
  position: absolute;
  z-index: 2;
  width: 8px;
  height: 8px;
  box-sizing: border-box;
  border: 1.5px solid #fff;
  border-radius: 50%;
  background: transparent;
  box-shadow:
    var(--picker-handle-shadow),
    inset 0 0 0 1px rgba(0, 0, 0, 0.22);
  pointer-events: none;
}

.hexColorPickerHue {
  position: relative;
  flex-shrink: 0;
  width: 12px;
  height: 140px;
  border-radius: 0;
  overflow: visible;
  cursor: ns-resize;
  touch-action: none;
}

.hexColorPickerHueCursor {
  position: absolute;
  z-index: 2;
  width: 14px;
  height: 4px;
  margin-left: 0;
  box-sizing: border-box;
  border-radius: 999px;
  background: #fff;
  border: 0.5px solid rgba(0, 0, 0, 0.2);
  box-shadow: var(--picker-handle-shadow);
  pointer-events: none;
}

.hexColorPickerFooter {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hexColorPickerHexInput {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  font-size: 13px;
  font-family: ui-monospace, monospace;
}

.hexColorPickerActions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.hexColorPickerBtnText {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--icon-btn-fg);
  font-size: 13px;
  cursor: pointer;
  transition: 0.1s;
}

.hexColorPickerBtnText:hover {
  background: var(--icon-btn-bg-hover);
}
</style>
