/**
 * 将单族名格式化为 CSS font-family 片段（含引号，便于保留空格）。
 * 与系统字体选择路径共用，避免预设与「其他字体」两套写法。
 */
export function quoteFontFamily(fontName: string): string {
  return `"${fontName.replace(/"/g, '\\"')}"`;
}

/**
 * 由族名列表生成完整 CSS `font-family`（逐项加引号后逗号拼接，不含通用备选族）。
 */
export function cssFontFamilyStack(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => quoteFontFamily(p))
    .join(", ");
}

/**
 * 去掉 CSS 族名片段两侧的引号（单段，不含逗号）。
 */
export function stripCssFontFamilyQuotes(segment: string): string {
  return segment.trim().replace(/^["']|["']$/g, "");
}

/**
 * 从完整 `font-family` CSS 串中取第一个族名（去引号），用于展示「其他字体」等。
 */
export function parseFirstFontFamilyNameFromCss(fontFamilyCss: string): string {
  const first = fontFamilyCss.split(",")[0] ?? fontFamilyCss;
  return stripCssFontFamilyQuotes(first);
}
