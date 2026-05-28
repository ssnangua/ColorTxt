<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  toRef,
  watch,
} from "vue";
import type { CharacterRosterEntry } from "@shared/characterTypes";
import {
  DEFAULT_CHARACTER_CARD_TEXTURE_EFFECT,
  type CharacterCardTextureEffectId,
} from "@shared/characterCardTextureEffects";
import { useCharacterCardTilt } from "../composables/useCharacterCardTilt";
import { useCharacterCardPopoverZoom } from "../composables/useCharacterCardPopoverZoom";
import zoomInSvg from "../assets/zoom_in.svg?raw";
import { icons } from "../icons";
import IconButton from "./IconButton.vue";

const props = withDefaults(
  defineProps<{
    entry: CharacterRosterEntry;
    portraitUrl: string | null;
    flipped: boolean;
    /** 由列表父级统一测量，全卡同值 */
    nameZoom?: number;
    textureEffect?: CharacterCardTextureEffectId;
    /** 从原位放大至视口中央（同一张卡，非复制 overlay） */
    popoverOpen?: boolean;
  }>(),
  {
    nameZoom: 1,
    textureEffect: DEFAULT_CHARACTER_CARD_TEXTURE_EFFECT,
    popoverOpen: false,
  },
);

const popoverOpenRef = toRef(props, "popoverOpen");

const emit = defineEmits<{
  toggleFlip: [];
  edit: [];
  viewPortrait: [];
}>();

const cardShellRef = ref<HTMLElement | null>(null);
const textureEffectRef = toRef(props, "textureEffect");

/** 列表小卡倾斜约为默认的 40%；放大后为 100% */
const CARD_TILT_SCALE_LIST = 0.4;
const CARD_TILT_SCALE_POPOVER = 1;

const { popoverActive, shellStyle: popoverShellStyle } = useCharacterCardPopoverZoom(
  cardShellRef,
  popoverOpenRef,
);

const tilt = useCharacterCardTilt({
  enabled: computed(
    () =>
      props.textureEffect !== "off" &&
      (!props.popoverOpen || popoverActive.value),
  ),
  rotateScale: computed(() =>
    popoverActive.value ? CARD_TILT_SCALE_POPOVER : CARD_TILT_SCALE_LIST,
  ),
  textureEffect: textureEffectRef,
});

const shellStyle = computed(() => ({
  ...tilt.styleVars.value,
  ...popoverShellStyle.value,
}));

function onShellPointerMove(ev: PointerEvent) {
  if (props.popoverOpen && !popoverActive.value) return;
  const el = cardShellRef.value;
  if (!el) return;
  tilt.onPointerMove(ev, el);
}

function onShellPointerLeave() {
  tilt.onPointerLeave();
}

/** 对齐 pokemon popover() 里的 interactEnd(delay)：放大过程中弹回悬停倾斜 */
const POPOVER_TILT_RESET_DELAY_MS = 100;
let popoverTiltResetTimer: ReturnType<typeof setTimeout> | null = null;

function clearPopoverTiltResetTimer() {
  if (popoverTiltResetTimer) {
    clearTimeout(popoverTiltResetTimer);
    popoverTiltResetTimer = null;
  }
}

watch(popoverActive, (active) => {
  clearPopoverTiltResetTimer();
  if (!active) return;
  popoverTiltResetTimer = setTimeout(() => {
    popoverTiltResetTimer = null;
    tilt.resetIdle();
  }, POPOVER_TILT_RESET_DELAY_MS);
});

watch(popoverOpenRef, (open) => {
  if (!open) tilt.resetIdle();
});

const backScrollEl = ref<HTMLElement | null>(null);

/** 背面滚轮步进缩放（侧栏卡片区域较小，默认 delta 偏大） */
const BACK_SCROLL_WHEEL_PIXEL_FACTOR = 0.32;
const BACK_SCROLL_WHEEL_LINE_PX = 8;
const BACK_SCROLL_WHEEL_PAGE_FACTOR = 0.22;
const BACK_SCROLL_WHEEL_MAX_STEP_PX = 28;

function backScrollWheelDeltaY(ev: WheelEvent): number {
  let dy: number;
  switch (ev.deltaMode) {
    case WheelEvent.DOM_DELTA_LINE:
      dy = ev.deltaY * BACK_SCROLL_WHEEL_LINE_PX;
      break;
    case WheelEvent.DOM_DELTA_PAGE:
      dy =
        ev.deltaY *
        (backScrollEl.value?.clientHeight ?? 80) *
        BACK_SCROLL_WHEEL_PAGE_FACTOR;
      break;
    default:
      dy = ev.deltaY * BACK_SCROLL_WHEEL_PIXEL_FACTOR;
  }
  if (!Number.isFinite(dy) || dy === 0) return 0;
  const sign = Math.sign(dy);
  return sign * Math.min(Math.abs(dy), BACK_SCROLL_WHEEL_MAX_STEP_PX);
}

function onBackScrollWheel(ev: WheelEvent) {
  if (!props.flipped) return;
  const el = backScrollEl.value;
  if (!el) return;
  const t = ev.target as Node | null;
  const backFace = el.closest(".cardBack");
  if (!t || !backFace?.contains(t)) return;
  const dy = backScrollWheelDeltaY(ev);
  const maxScroll = el.scrollHeight - el.clientHeight;
  if (maxScroll <= 0) {
    if (dy !== 0) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    return;
  }
  const atTop = el.scrollTop <= 0.5;
  const atBottom = el.scrollTop >= maxScroll - 0.5;
  if ((dy > 0 && atBottom) || (dy < 0 && atTop)) {
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  const next = Math.min(maxScroll, Math.max(0, el.scrollTop + dy));
  el.scrollTop = next;
  ev.preventDefault();
  ev.stopPropagation();
}

const backScrollWheelOpts = { capture: true, passive: false } as const;

onMounted(() => {
  void nextTick(() => {
    cardShellRef.value?.addEventListener(
      "wheel",
      onBackScrollWheel,
      backScrollWheelOpts,
    );
  });
});

onBeforeUnmount(() => {
  clearPopoverTiltResetTimer();
  cardShellRef.value?.removeEventListener(
    "wheel",
    onBackScrollWheel,
    backScrollWheelOpts,
  );
});
</script>

<template>
  <div class="cardShellWrap">
    <div
      v-if="popoverActive"
      class="cardShellPlaceholder"
      aria-hidden="true"
    />
    <Teleport to="body" :disabled="!popoverActive">
      <div
        ref="cardShellRef"
        class="cardShell charHoloCard"
        :class="{
          flipped,
          'cardShell--popover': popoverActive,
        }"
        :data-char-texture="textureEffect"
        :style="shellStyle"
        @pointermove="onShellPointerMove"
        @pointerleave="onShellPointerLeave"
      >
    <div class="card__perspective">
      <div class="card__tilt">
        <div class="card__flip" @click="emit('toggleFlip')">
        <div class="cardFace cardFront">
          <div
            class="portrait"
            :class="{ 'portrait--empty': !portraitUrl }"
            :style="
              portraitUrl ? { backgroundImage: `url(${portraitUrl})` } : {}
            "
          />
          <span
            class="cardNameVertical"
            :class="{
              'cardNameVertical--female': entry.gender === 'female',
              'cardNameVertical--male': entry.gender === 'male',
              'cardNameVertical--unknown': entry.gender === 'unknown',
            }"
            :style="{ zoom: nameZoom }"
            :title="entry.displayName || '佚名'"
          >
            {{ entry.displayName || "佚名" }}
          </span>
          <div class="card__shine" aria-hidden="true" />
          <div class="card__glare" aria-hidden="true" />
          <div
            v-if="!popoverOpen"
            class="cardCornerActions"
            @click.stop
          >
            <IconButton
              :icon-html="icons.edit"
              title="编辑"
              :aria-label="`编辑 ${entry.displayName}`"
              class="cardCornerAction"
              @click="emit('edit')"
            />
            <IconButton
              :icon-html="zoomInSvg"
              title="放大"
              aria-label="放大角色卡"
              :disabled="!portraitUrl"
              class="cardCornerAction"
              @click="emit('viewPortrait')"
            />
          </div>
        </div>
        <div
          class="cardFace cardBack"
          :style="
            portraitUrl
              ? { '--card-portrait-bg': `url(${portraitUrl})` }
              : { '--card-portrait-bg': 'none' }
          "
        >
          <div class="cardBackContent">
          <div
            class="cardNameBack"
            :class="{
              'cardNameBack--female': entry.gender === 'female',
              'cardNameBack--male': entry.gender === 'male',
              'cardNameBack--unknown': entry.gender === 'unknown',
            }"
            :title="entry.displayName || '佚名'"
          >
            {{ entry.displayName || "佚名" }}
          </div>
          <div ref="backScrollEl" class="backScroll">
            <div v-if="entry.ageText" class="backLine">
              <div class="k">年龄</div>
              <div class="v">{{ entry.ageText }}</div>
            </div>
            <div v-if="entry.identity" class="backLine">
              <div class="k">身份</div>
              <div class="v">{{ entry.identity }}</div>
            </div>
            <div v-if="entry.bio" class="backLine">
              <div class="k">简介</div>
              <div class="v">{{ entry.bio }}</div>
            </div>
            <div v-if="entry.relations" class="backLine">
              <div class="k">关系</div>
              <div class="v">{{ entry.relations }}</div>
            </div>
            <div
              v-if="
                !entry.ageText &&
                !entry.identity &&
                !entry.bio &&
                !entry.relations
              "
              class="charCardBackEmpty"
            >
              背面信息可在编辑中填写，或由检索自动摘录。
            </div>
          </div>
          </div>
          <div class="card__shine" aria-hidden="true" />
          <div class="card__glare" aria-hidden="true" />
        </div>
        </div>
      </div>
    </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.cardShellWrap {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  position: relative;
  z-index: 0;
}

/* 倾斜/阴影会超出格位，悬停时抬到相邻卡之上 */
.cardShellWrap:hover,
.cardShellWrap:focus-within {
  z-index: 4;
}

.cardShellPlaceholder {
  width: 100%;
  aspect-ratio: 2 / 3;
  visibility: hidden;
  pointer-events: none;
}

.cardShell {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  aspect-ratio: 2 / 3;
}

.cardShell--popover {
  will-change: transform;
  /* 仅平移/缩放（对齐 pokemon card__translater）；旋转在 .card__tilt */
  transition: transform 0.42s cubic-bezier(0.25, 0.9, 0.35, 1);
}

.card__perspective {
  width: 100%;
  height: 100%;
  min-height: 0;
  perspective: 480px;
  perspective-origin: center center;
  transform-style: preserve-3d;
}

.card__tilt {
  width: 100%;
  height: 100%;
  min-height: 0;
  transform-style: preserve-3d;
}

.card__flip {
  width: 100%;
  height: 100%;
  min-height: 0;
  transform-style: preserve-3d;
  transform-origin: center center;
  transition: transform 0.38s ease;
  cursor: pointer;
}

.cardShell.flipped .card__flip {
  transform: rotateY(180deg);
}

.cardFace {
  position: relative;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  background: transparent;
}

.cardFront,
.cardFront * {
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

.cardFront {
  z-index: 1;
  display: grid;
  box-shadow: inset 0 0 0 1px var(--border);
  -webkit-transform: translate3d(0, 0, 2px);
  transform: translate3d(0, 0, 2px);
}

.cardShell:not(.flipped) .cardBack {
  pointer-events: none;
}

.cardShell.flipped .cardFront {
  pointer-events: none;
  z-index: 0;
}

.cardBack {
  display: grid;
  font-size: 12px;
  line-height: 1.35;
  color: var(--fg);
  min-height: 0;
  /* 实底：背面全息层 color-dodge 等不能叠在透明底上，否则会透侧栏而发灰发黑 */
  background: var(--bg);
  isolation: isolate;
  box-shadow: inset 0 0 0 1px var(--border);
  -webkit-transform: rotateY(180deg) translate3d(0, 0, 2px);
  transform: rotateY(180deg) translate3d(0, 0, 2px);
}

.cardBackContent {
  grid-area: 1 / 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  z-index: 2;
  position: relative;
}

.cardShell.flipped .cardBack {
  z-index: 2;
  pointer-events: auto;
}

.cardBack::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background-image: var(--card-portrait-bg, none);
  background-size: cover;
  background-position: center top;
  background-repeat: no-repeat;
  opacity: 0.15;
  pointer-events: none;
}

.portrait {
  background-color: transparent;
  background-size: cover;
  background-position: center top;
  background-repeat: no-repeat;
}

.portrait--empty {
  background-color: var(--panel);
}

.cardNameVertical {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
  box-sizing: border-box;
  max-height: calc(100% - 48px);
  padding: 12px 6px;
  color: #ffffff;
  font-family: "KingHwa OldSong", "Songti SC", "SimSun", serif;
  font-size: 12px;
  line-height: 1.2;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  letter-spacing: 0.22em;
  overflow: hidden;
  pointer-events: none;
  border-bottom-left-radius: 8px;
}

.cardNameVertical--female {
  background: var(--female);
}

.cardNameVertical--male {
  background: var(--male);
}

.cardNameVertical--unknown {
  background: var(--unknown);
}

.cardCornerActions {
  position: absolute;
  bottom: 6px;
  left: 6px;
  z-index: 6;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease;
}

.cardShell:not(.flipped):hover .cardCornerActions {
  opacity: 1;
  pointer-events: auto;
}

.iconBtn.cardCornerAction {
  width: 24px;
  height: 24px;
  background: rgba(0, 0, 0, 0.3);
}
.iconBtn.cardCornerAction:hover {
  background: rgba(0, 0, 0, 0.7);
}

:deep(.iconBtn.cardCornerAction .icon) {
  color: #ffffff;
}

.backScroll {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 4px;
  /* 透明，露出 cardBack::before 立绘水印；勿用不透明 var(--bg) 盖住 */
  background: transparent;
}

.backScroll > * {
  position: relative;
  z-index: 1;
}

.cardNameBack {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  box-sizing: border-box;
  padding: 8px;
  color: #ffffff;
  font-family: "KingHwa OldSong", "Songti SC", "SimSun", serif;
  font-size: 16px;
  line-height: 1.2;
  letter-spacing: 0.22em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.cardNameBack--female {
  background: var(--female);
}

.cardNameBack--male {
  background: var(--male);
}

.cardNameBack--unknown {
  background: var(--unknown);
}

.backLine {
  padding: 4px;
  margin: 0;
}

.backLine + .backLine {
  margin-top: 4px;
}

.backLine .k {
  color: #ffffff;
  font-weight: 600;
  margin-bottom: 4px;
  padding: 4px 6px;
  border-radius: 4px;
  background: linear-gradient(to right, var(--warning), transparent);
}
.backLine .v {
  padding-left: 6px;
}

.charCardBackEmpty {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
</style>
