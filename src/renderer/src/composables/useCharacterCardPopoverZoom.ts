import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
  type CSSProperties,
  type Ref,
} from "vue";

const POPOVER_TRANSITION_MS = 420;
const POPOVER_MAX_SCALE = 2.4;
const POPOVER_Z_INDEX = 12001;
/** 放大：360° → 0°；收回：0° → 360°（与打开反向，结束时 instant 归 0°） */
const POPOVER_OPEN_ROTATE_Y_DEG = 360;
const POPOVER_CLOSE_ROTATE_Y_DEG = 360;

export type CharacterCardPopoverAnchor = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CharacterCardPopoverLayout = {
  tx: number;
  ty: number;
  scale: number;
  rotateY: number;
};

function computePopoverTarget(
  anchor: CharacterCardPopoverAnchor,
): CharacterCardPopoverLayout {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxW = Math.min(420, vw * 0.92);
  const maxH = Math.min(vh * 0.88, maxW * (3 / 2));
  const scale = Math.min(
    maxW / Math.max(anchor.width, 1),
    maxH / Math.max(anchor.height, 1),
    POPOVER_MAX_SCALE,
  );
  return {
    tx: vw / 2 - anchor.left - anchor.width / 2,
    ty: vh / 2 - anchor.top - anchor.height / 2,
    scale,
    rotateY: 0,
  };
}

const POPOVER_IDLE: CharacterCardPopoverLayout = {
  tx: 0,
  ty: 0,
  scale: 1,
  rotateY: 0,
};

/**
 * 角色卡原位放大：
 * - card__translater → shell：translate + scale（本 composable 的 transform）
 * - card__rotator → card__tilt：--char-popover-rotate-y + 悬停倾斜（勿在 shell 上 rotateY）
 */
export function useCharacterCardPopoverZoom(
  shellRef: Ref<HTMLElement | null>,
  open: Ref<boolean>,
) {
  const popoverActive = ref(false);
  const anchor = ref<CharacterCardPopoverAnchor | null>(null);
  const tx = ref(0);
  const ty = ref(0);
  const scale = ref(1);
  const rotateY = ref(0);
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let activateGen = 0;

  const shellStyle = computed((): CSSProperties => {
    if (!popoverActive.value || !anchor.value) return {};
    const a = anchor.value;
    const layoutScale = scale.value;
    return {
      position: "fixed",
      left: `${a.left}px`,
      top: `${a.top}px`,
      width: `${a.width}px`,
      height: `${a.height}px`,
      maxWidth: "none",
      margin: 0,
      transform: `translate3d(${tx.value}px, ${ty.value}px, calc(${layoutScale} * 150px + 0.01px)) scale(${layoutScale})`,
      "--char-popover-rotate-y": `${rotateY.value}deg`,
      transformOrigin: "center center",
      zIndex: POPOVER_Z_INDEX,
    };
  });

  function clearCloseTimer() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  function applyTarget(target: CharacterCardPopoverLayout, animate: boolean) {
    const el = shellRef.value;
    if (!el) {
      tx.value = target.tx;
      ty.value = target.ty;
      scale.value = target.scale;
      rotateY.value = target.rotateY;
      return;
    }
    if (!animate) {
      const prev = el.style.transition;
      el.style.transition = "none";
      const tiltEl = el.querySelector<HTMLElement>(".card__tilt");
      const tiltPrev = tiltEl?.style.transition ?? "";
      if (tiltEl) tiltEl.style.transition = "none";
      tx.value = target.tx;
      ty.value = target.ty;
      scale.value = target.scale;
      rotateY.value = target.rotateY;
      void el.offsetHeight;
      el.style.transition = prev;
      if (tiltEl) tiltEl.style.transition = tiltPrev;
      return;
    }
    tx.value = target.tx;
    ty.value = target.ty;
    scale.value = target.scale;
    rotateY.value = target.rotateY;
  }

  function captureAnchor(): CharacterCardPopoverAnchor | null {
    const el = shellRef.value;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function reposition() {
    if (!open.value || !anchor.value) return;
    applyTarget(computePopoverTarget(anchor.value), false);
  }

  async function activate() {
    const gen = ++activateGen;
    clearCloseTimer();
    if (!open.value || gen !== activateGen) return;

    const captured = captureAnchor();
    if (!captured || !open.value || gen !== activateGen) return;
    anchor.value = captured;
    tx.value = 0;
    ty.value = 0;
    scale.value = 1;
    rotateY.value = POPOVER_OPEN_ROTATE_Y_DEG;
    popoverActive.value = true;
    await nextTick();
    if (!open.value || gen !== activateGen || !anchor.value) return;
    const target = computePopoverTarget(anchor.value);
    requestAnimationFrame(() => {
      if (!open.value || gen !== activateGen) return;
      applyTarget(target, true);
    });
  }

  function deactivate() {
    activateGen++;
    clearCloseTimer();
    applyTarget(
      {
        tx: 0,
        ty: 0,
        scale: 1,
        rotateY: POPOVER_CLOSE_ROTATE_Y_DEG,
      },
      true,
    );
    closeTimer = setTimeout(() => {
      applyTarget(POPOVER_IDLE, false);
      popoverActive.value = false;
      anchor.value = null;
      closeTimer = null;
    }, POPOVER_TRANSITION_MS + 40);
  }

  watch(
    open,
    (v) => {
      if (v) void activate();
      else deactivate();
    },
    { flush: "post" },
  );

  function onWindowResize() {
    if (!open.value || !anchor.value) return;
    applyTarget(
      { ...computePopoverTarget(anchor.value), rotateY: rotateY.value },
      true,
    );
  }

  onBeforeUnmount(() => {
    clearCloseTimer();
    window.removeEventListener("resize", onWindowResize);
  });

  watch(popoverActive, (v) => {
    if (v) {
      window.addEventListener("resize", onWindowResize);
    } else {
      window.removeEventListener("resize", onWindowResize);
    }
  });

  return {
    popoverActive,
    shellStyle,
    reposition,
  };
}
