/**
 * pokemon-cards-css 的 stiffness/damping 面向 Svelte spring 求解器，不能直接用于本项目的逐帧积分。
 */
/** 指针跟手：略欠阻尼，跟得上光标又避免瞬跳 */
export const CARD_SPRING_FOLLOW_ROTATE = { stiffness: 210, damping: 19 };
/**
 * 移出回正：高刚度 + 低阻尼比 → 过冲幅度大、周期短（勿用低刚度，只会变慢）
 * ζ ≈ 0.17
 */
export const CARD_SPRING_SNAP_ROTATE = { stiffness: 32, damping: 1.9 };
/** 移出时沿回正方向的初速度倍率（加大穿过 0° 时的惯性，过冲更明显） */
export const CARD_SPRING_SNAP_ROTATE_KICK = 1.65;
/** 指针/光泽变量：较快收束，避免长时间抖动 */
export const CARD_SPRING_SNAP = { stiffness: 30, damping: 8.5 };

export type CardSpringConfig = { stiffness: number; damping: number };

export function stepSpringScalar(
  current: number,
  target: number,
  velocity: number,
  config: CardSpringConfig,
  dtSec: number,
): { value: number; velocity: number } {
  const force = -config.stiffness * (current - target);
  const damp = -config.damping * velocity;
  const nextV = velocity + (force + damp) * dtSec;
  const next = current + nextV * dtSec;
  return { value: next, velocity: nextV };
}

export function isSpringSettled(
  current: number,
  target: number,
  velocity: number,
  epsilon = 0.04,
): boolean {
  return (
    Math.abs(current - target) < epsilon && Math.abs(velocity) < epsilon
  );
}
