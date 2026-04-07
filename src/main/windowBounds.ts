import { app, screen, type BrowserWindow, type Rectangle } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type PersistedWindowBounds = {
  width: number;
  height: number;
  x?: number;
  y?: number;
};

export const DEFAULT_WINDOW_WIDTH = 1200;
export const DEFAULT_WINDOW_HEIGHT = 800;
const WINDOW_BOUNDS_FILE_NAME = "window-bounds.json";
export const WINDOW_MIN_WIDTH = 1000;
export const WINDOW_MIN_HEIGHT = 680;

function windowBoundsFilePath() {
  return path.join(app.getPath("userData"), WINDOW_BOUNDS_FILE_NAME);
}

function normalizeStoredWindowBounds(
  raw: unknown,
): PersistedWindowBounds | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const width = Number(obj.width);
  const height = Number(obj.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  const normalized: PersistedWindowBounds = {
    width: Math.max(WINDOW_MIN_WIDTH, Math.floor(width)),
    height: Math.max(WINDOW_MIN_HEIGHT, Math.floor(height)),
  };
  if (Number.isFinite(Number(obj.x))) normalized.x = Math.floor(Number(obj.x));
  if (Number.isFinite(Number(obj.y))) normalized.y = Math.floor(Number(obj.y));
  return normalized;
}

function loadPersistedWindowBounds(): PersistedWindowBounds | null {
  try {
    const filePath = windowBoundsFilePath();
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, "utf8");
    return normalizeStoredWindowBounds(JSON.parse(raw));
  } catch {
    return null;
  }
}

function isWindowRectVisible(rect: Rectangle) {
  const displays = screen.getAllDisplays();
  return displays.some((d) => {
    const b = d.workArea;
    const intersectsX = rect.x < b.x + b.width && rect.x + rect.width > b.x;
    const intersectsY = rect.y < b.y + b.height && rect.y + rect.height > b.y;
    return intersectsX && intersectsY;
  });
}

export function resolveInitialWindowBounds() {
  const stored = loadPersistedWindowBounds();
  if (!stored) {
    return { width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT };
  }
  const bounds: {
    width: number;
    height: number;
    x?: number;
    y?: number;
  } = {
    width: stored.width,
    height: stored.height,
  };
  if (typeof stored.x === "number") bounds.x = stored.x;
  if (typeof stored.y === "number") bounds.y = stored.y;
  if (
    typeof bounds.x === "number" &&
    typeof bounds.y === "number" &&
    isWindowRectVisible({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    })
  ) {
    return bounds;
  }
  return { width: bounds.width, height: bounds.height };
}

export function saveWindowBounds(win: BrowserWindow) {
  if (win.isDestroyed()) return;
  if (win.isMinimized() || win.isMaximized() || win.isFullScreen()) return;
  try {
    const bounds = win.getBounds();
    const payload: PersistedWindowBounds = {
      x: bounds.x,
      y: bounds.y,
      width: Math.max(WINDOW_MIN_WIDTH, Math.floor(bounds.width)),
      height: Math.max(WINDOW_MIN_HEIGHT, Math.floor(bounds.height)),
    };
    writeFileSync(windowBoundsFilePath(), JSON.stringify(payload), "utf8");
  } catch {
    // ignore
  }
}
