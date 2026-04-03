import {
  cssFontFamilyStack,
  parseFirstFontFamilyNameFromCss,
} from "./fontFamilyCss";

/** 与 FontPicker 预设项一一对应（京華老宋体为内置字体，其余为系统近似替代） */
export type PresetFontKey = "kinghwa" | "msyahei" | "simsun" | "kaiti";

export const PRESET_FONT_KEYS: readonly PresetFontKey[] = [
  "kinghwa",
  "msyahei",
  "simsun",
  "kaiti",
] as const;

/**
 * 预设项在菜单中的显示名：须与当前平台实际族名栈一致，避免 Mac 上仍写「微软雅黑」等 Windows 专用名。
 */
const PRESET_LABELS: Record<
  PresetFontKey,
  Record<"darwin" | "win32" | "other", string>
> = {
  kinghwa: {
    darwin: "京華老宋体",
    win32: "京華老宋体",
    other: "京華老宋体",
  },
  msyahei: {
    darwin: "苹方-简",
    win32: "微软雅黑",
    other: "思源黑体",
  },
  simsun: {
    darwin: "宋体-简",
    win32: "宋体",
    other: "思源宋体",
  },
  kaiti: {
    darwin: "楷体-简",
    win32: "楷体",
    other: "文鼎 UKai",
  },
};

type PlatformStacks = {
  darwin: readonly string[];
  win32: readonly string[];
  /** Linux 等 */
  other: readonly string[];
};

type PresetStackDef =
  | { readonly all: readonly string[] }
  | PlatformStacks;

/**
 * Linux / 非 Win、非 Mac：使用常见包可提供的族名（Noto、文泉驿、文鼎等）。
 * STSong/STKaiti 为苹果/旧华文体系，Linux 上通常不存在，不作为回退。
 */
const PRESET_STACKS: Record<PresetFontKey, PresetStackDef> = {
  kinghwa: { all: ["KingHwa OldSong"] },
  msyahei: {
    darwin: ["PingFang SC", "Hiragino Sans GB"],
    win32: ["Microsoft YaHei"],
    other: [
      "Noto Sans CJK SC",
      "WenQuanYi Micro Hei",
      "Source Han Sans SC",
    ],
  },
  simsun: {
    darwin: ["Songti SC", "STSong"],
    win32: ["SimSun"],
    other: ["Noto Serif CJK SC", "Source Han Serif SC"],
  },
  kaiti: {
    darwin: ["Kaiti SC", "STKaiti"],
    win32: ["KaiTi"],
    other: ["AR PL UKai CN", "Noto Serif CJK SC"],
  },
};

function getRendererPlatform(): "darwin" | "win32" | "other" {
  if (typeof navigator === "undefined") return "other";
  const p = navigator.platform ?? "";
  const ua = navigator.userAgent ?? "";
  if (/Mac|iPhone|iPad|iPod/i.test(p) || /Mac OS X|Macintosh/i.test(ua)) {
    return "darwin";
  }
  if (/Win/i.test(p) || /Windows/i.test(ua)) return "win32";
  return "other";
}

function stacksForPreset(key: PresetFontKey): readonly string[] {
  const def = PRESET_STACKS[key];
  if ("all" in def) return def.all;
  const plat = getRendererPlatform();
  return def[plat];
}

export function getPresetFontStack(key: PresetFontKey): string[] {
  return [...stacksForPreset(key)];
}

export function getPresetLabel(key: PresetFontKey): string {
  return PRESET_LABELS[key][getRendererPlatform()];
}

export function getPresetCssStack(key: PresetFontKey): string {
  return cssFontFamilyStack(getPresetFontStack(key));
}

function getAllKnownStacksForPreset(key: PresetFontKey): string[][] {
  const def = PRESET_STACKS[key];
  if ("all" in def) return [[...def.all]];
  return [[...def.darwin], [...def.win32], [...def.other]];
}

function normalizeCssFontFamilyCompare(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export function fontFamilyMatchesPresetCss(
  fontFamilyCss: string,
  key: PresetFontKey,
): boolean {
  const n = normalizeCssFontFamilyCompare(fontFamilyCss);
  for (const stack of getAllKnownStacksForPreset(key)) {
    if (normalizeCssFontFamilyCompare(cssFontFamilyStack(stack)) === n) {
      return true;
    }
  }
  return false;
}

export type DetectedFontKey =
  | { key: PresetFontKey }
  | { key: "other"; otherName: string };

/**
 * 根据当前 `monacoFontFamily`（完整 CSS 串）判断是预设还是「其他字体」。
 */
export function detectFontPickerSelection(fontFamilyCss: string): DetectedFontKey {
  for (const key of PRESET_FONT_KEYS) {
    if (fontFamilyMatchesPresetCss(fontFamilyCss, key)) {
      return { key };
    }
  }
  if (fontFamilyCss.includes("KingHwa OldSong")) {
    return { key: "kinghwa" };
  }

  return {
    key: "other",
    otherName: parseFirstFontFamilyNameFromCss(fontFamilyCss),
  };
}
