import {
  computed,
  onBeforeUnmount,
  ref,
  type CSSProperties,
  type Ref,
} from "vue";
import type { CharacterCardTextureEffectId } from "@shared/characterCardTextureEffects";
import {
  CARD_SPRING_FOLLOW_ROTATE,
  CARD_SPRING_SNAP_ROTATE,
  CARD_SPRING_SNAP_ROTATE_KICK,
  isSpringSettled,
  stepSpringScalar,
  type CardSpringConfig,
} from "../utils/characterCardSpring";

function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n));
}

function round(n: number, places = 3): number {
  const p = 10 ** places;
  return Math.round(n * p) / p;
}

function adjust(
  value: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number,
): number {
  return toMin + ((toMax - toMin) * (value - fromMin)) / (fromMax - fromMin);
}

export type CharacterCardTiltVars = {
  "--char-rotate-x": string;
  "--char-rotate-y": string;
  "--char-pointer-x": string;
  "--char-pointer-y": string;
  "--char-pointer-from-center": string;
  "--char-pointer-from-top": string;
  "--char-pointer-from-left": string;
  "--char-background-x": string;
  "--char-background-y": string;
  "--char-card-opacity": string;
};

type TiltState = {
  rotateX: number;
  rotateY: number;
  cardOpacity: number;
};

type TiltVel = Record<keyof TiltState, number>;

/** 仅对旋转做弹簧；光泽/纹理变量每帧由旋转反推，与倾斜始终同步 */
const TILT_SPRING_KEYS = ["rotateX", "rotateY"] as const satisfies readonly (keyof TiltState)[];

const TILT_DIVISOR = 3.5;

const IDLE_STATE: TiltState = {
  rotateX: 0,
  rotateY: 0,
  cardOpacity: 1,
};

/** 由倾斜角反推光泽/背景定位（与 onPointerMove 里 rotate 公式互逆） */
function effectFromRotation(
  rotateX: number,
  rotateY: number,
  rotateScale: number,
) {
  const scale = rotateScale || 1;
  const center = {
    x: (-rotateX * TILT_DIVISOR) / scale,
    y: (rotateY * TILT_DIVISOR) / scale,
  };
  const percent = {
    x: clamp(round(center.x + 50)),
    y: clamp(round(center.y + 50)),
  };
  const fromCenter = clamp(
    Math.sqrt(center.x * center.x + center.y * center.y) / 50,
    0,
    1,
  );
  return {
    pointerX: percent.x,
    pointerY: percent.y,
    pointerFromCenter: round(fromCenter),
    pointerFromTop: round(percent.y / 100),
    pointerFromLeft: round(percent.x / 100),
    bgX: round(adjust(percent.x, 0, 100, 37, 63)),
    bgY: round(adjust(percent.y, 0, 100, 33, 67)),
  };
}

function stateToVars(s: TiltState, rotateScale: number): CharacterCardTiltVars {
  const fx = effectFromRotation(s.rotateX, s.rotateY, rotateScale);
  return {
    "--char-rotate-x": `${round(s.rotateX)}deg`,
    "--char-rotate-y": `${round(s.rotateY)}deg`,
    "--char-pointer-x": `${fx.pointerX}%`,
    "--char-pointer-y": `${fx.pointerY}%`,
    "--char-pointer-from-center": String(fx.pointerFromCenter),
    "--char-pointer-from-top": String(fx.pointerFromTop),
    "--char-pointer-from-left": String(fx.pointerFromLeft),
    "--char-background-x": `${fx.bgX}%`,
    "--char-background-y": `${fx.bgY}%`,
    "--char-card-opacity": String(round(s.cardOpacity, 2)),
  };
}

function zeroVel(): TiltVel {
  return { rotateX: 0, rotateY: 0, cardOpacity: 0 };
}

/**
 * 角色卡指针倾斜与光泽 CSS 变量（思路参考 pokemon-cards-css / simeydotme）。
 * 倾斜角为唯一驱动；光泽/纹理位由旋转反推，回弹时与卡片同步。
 * 指针跟手、移出回正均由弹簧逐帧插值（跟手平滑，回正带轻微过冲）。
 */
export function useCharacterCardTilt(opts: {
  enabled: Ref<boolean>;
  textureEffect: Ref<CharacterCardTextureEffectId>;
  /** 倾斜幅度倍率，1 为默认；列表小卡可用 0.35～0.5 */
  rotateScale?: Ref<number>;
}) {
  const current = ref<TiltState>({ ...IDLE_STATE });
  const target = ref<TiltState>({ ...IDLE_STATE });
  const velocity = ref<TiltVel>(zeroVel());
  const vars = ref<CharacterCardTiltVars>(stateToVars(IDLE_STATE, 1));
  const interacting = ref(false);

  let springRafId: number | null = null;
  let springLastTs = 0;
  let springMode: "follow" | "snap" = "snap";
  let moveRafId: number | null = null;
  let leaveTimer: ReturnType<typeof setTimeout> | null = null;

  const styleVars = computed(() => vars.value as unknown as CSSProperties);

  function publish() {
    const scale = opts.rotateScale?.value ?? 1;
    vars.value = stateToVars({ ...current.value }, scale);
  }

  function cancelMoveRaf() {
    if (moveRafId != null) {
      cancelAnimationFrame(moveRafId);
      moveRafId = null;
    }
  }

  function stopSpring() {
    if (springRafId != null) {
      cancelAnimationFrame(springRafId);
      springRafId = null;
    }
    springLastTs = 0;
  }

  function activeSpringConfig(): CardSpringConfig {
    return springMode === "follow"
      ? CARD_SPRING_FOLLOW_ROTATE
      : CARD_SPRING_SNAP_ROTATE;
  }

  function stepChannel(key: (typeof TILT_SPRING_KEYS)[number], dt: number) {
    const r = stepSpringScalar(
      current.value[key],
      target.value[key],
      velocity.value[key],
      activeSpringConfig(),
      dt,
    );
    current.value[key] = r.value;
    velocity.value[key] = r.velocity;
  }

  function allSettled(): boolean {
    return TILT_SPRING_KEYS.every((k) =>
      isSpringSettled(
        current.value[k],
        target.value[k],
        velocity.value[k],
        0.15,
      ),
    );
  }

  function springTick(ts: number) {
    if (springLastTs === 0) {
      springLastTs = ts;
      springRafId = requestAnimationFrame(springTick);
      return;
    }

    const dt = Math.min((ts - springLastTs) / 1000, 0.05);
    springLastTs = ts;
    if (dt <= 0) {
      springRafId = requestAnimationFrame(springTick);
      return;
    }

    for (const k of TILT_SPRING_KEYS) stepChannel(k, dt);
    publish();

    if (springMode === "follow") {
      springRafId = requestAnimationFrame(springTick);
      return;
    }

    if (!allSettled()) {
      springRafId = requestAnimationFrame(springTick);
      return;
    }

    stopSpring();
    current.value = { ...target.value };
    velocity.value = zeroVel();
    publish();
  }

  function ensureSpringLoop() {
    if (springRafId == null) {
      springLastTs = 0;
      springRafId = requestAnimationFrame(springTick);
    }
  }

  function beginSnapReset() {
    interacting.value = false;
    springMode = "snap";
    target.value = { ...IDLE_STATE };
    const kick = CARD_SPRING_SNAP_ROTATE_KICK;
    for (const k of ["rotateX", "rotateY"] as const) {
      const pos = current.value[k];
      if (Math.abs(pos) > 0.25) {
        velocity.value[k] = -pos * kick;
      }
    }
    ensureSpringLoop();
  }

  function resetIdleImmediate() {
    cancelMoveRaf();
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
    stopSpring();
    springMode = "snap";
    current.value = { ...IDLE_STATE };
    target.value = { ...IDLE_STATE };
    velocity.value = zeroVel();
    interacting.value = false;
    publish();
  }

  function setPointerTarget(next: TiltState) {
    interacting.value = true;
    springMode = "follow";
    target.value = { ...next };
    current.value.cardOpacity = 1;
    ensureSpringLoop();
  }

  function onPointerMove(ev: PointerEvent, el: HTMLElement) {
    if (!opts.enabled.value || opts.textureEffect.value === "off") return;

    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }

    const rect = el.getBoundingClientRect();
    const absolute = {
      x: ev.clientX - rect.left,
      y: ev.clientY - rect.top,
    };
    const percent = {
      x: clamp(round((100 / rect.width) * absolute.x)),
      y: clamp(round((100 / rect.height) * absolute.y)),
    };
    const center = { x: percent.x - 50, y: percent.y - 50 };
    const rotateScale = opts.rotateScale?.value ?? 1;

    const next: TiltState = {
      rotateX: round(-(center.x / TILT_DIVISOR) * rotateScale),
      rotateY: round((center.y / TILT_DIVISOR) * rotateScale),
      cardOpacity: 1,
    };

    cancelMoveRaf();
    moveRafId = requestAnimationFrame(() => {
      moveRafId = null;
      setPointerTarget(next);
    });
  }

  function onPointerLeave() {
    cancelMoveRaf();
    if (leaveTimer) clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      leaveTimer = null;
      beginSnapReset();
    }, 80);
  }

  onBeforeUnmount(() => {
    cancelMoveRaf();
    stopSpring();
    if (leaveTimer) clearTimeout(leaveTimer);
  });

  return {
    styleVars,
    interacting,
    onPointerMove,
    onPointerLeave,
    resetIdle: beginSnapReset,
    resetIdleImmediate,
  };
}
