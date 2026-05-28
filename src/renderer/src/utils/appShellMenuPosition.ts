export type AnchoredMenuPlacement =
  | "below-end"
  | "below-start"
  | "beside-right"
  | "beside-left";

export function clampRectInViewport(
  left: number,
  top: number,
  width: number,
  height: number,
  margin = 8,
): { left: number; top: number } {
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  return {
    left: Math.min(Math.max(margin, left), maxX),
    top: Math.min(Math.max(margin, top), maxY),
  };
}

/** 根据锚点与面板尺寸计算 fixed 定位（视口内夹取） */
export function computeAnchoredMenuPosition(
  anchorRect: DOMRect,
  panelSize: { width: number; height: number },
  placement: AnchoredMenuPlacement,
  opts?: { gap?: number; margin?: number },
): { left: number; top: number } {
  const gap = opts?.gap ?? 4;
  const margin = opts?.margin ?? 8;
  const w = panelSize.width;
  const h = panelSize.height;
  let left = anchorRect.left;
  let top = anchorRect.bottom + gap;

  switch (placement) {
    case "below-end":
      left = anchorRect.right - w;
      top = anchorRect.bottom + gap;
      break;
    case "below-start":
      left = anchorRect.left;
      top = anchorRect.bottom + gap;
      break;
    case "beside-right":
      left = anchorRect.right + gap;
      top = anchorRect.top - 6;
      if (left + w > window.innerWidth - margin) {
        left = anchorRect.left - w - gap;
      }
      break;
    case "beside-left":
      left = anchorRect.left - w - gap;
      top = anchorRect.top - 6;
      if (left < margin) {
        left = anchorRect.right + gap;
      }
      break;
  }

  return clampRectInViewport(left, top, w, h, margin);
}
