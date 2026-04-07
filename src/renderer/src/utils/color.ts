export type Rgb = { r: number; g: number; b: number };
export type Hsv = { h: number; s: number; v: number };

const HEX6 = /^#?([0-9a-fA-F]{6})$/;
const HEX_CHARS = /^[0-9a-fA-F]+$/;

/**
 * 宽松解析为 `#rrggbb`：可省略 `#`；三位简写（如 `ccc`、`#f0a`）展开为六位。
 * 无法识别时返回 `null`。
 */
export function normalizeLooseHex6(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (s.startsWith("#")) s = s.slice(1);
  if (!HEX_CHARS.test(s)) return null;
  if (s.length === 3) {
    s = `${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
  }
  if (s.length !== 6) return null;
  return `#${s.toLowerCase()}`;
}

export function parseHex6(hex: string): Rgb | null {
  const m = hex.trim().match(HEX6);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const x = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${x(r)}${x(g)}${x(b)}`;
}

export function rgbToHsv(r: number, g: number, b: number): Hsv {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  const s = max <= 1e-6 ? 0 : d / max;
  const v = max;
  return { h: h * 360, s, v };
}

export function hsvToRgb(h: number, s: number, v: number): Rgb {
  const hh = (((h % 360) + 360) % 360) / 60;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0;
  let g = 0;
  let b = 0;
  switch (i) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    default:
      r = v;
      g = p;
      b = q;
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

export function hexToHsv(hex: string): Hsv | null {
  const rgb = parseHex6(hex);
  if (!rgb) return null;
  return rgbToHsv(rgb.r, rgb.g, rgb.b);
}

export function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}
