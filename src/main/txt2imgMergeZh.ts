/** 文生图：设置里通用片段在前，角色侧栏片段在后，中文顿号衔接 */
export function mergeTxt2ImgZhGeneralBeforeSpecific(
  general: string,
  specific: string,
): string {
  const g = general.trim();
  const s = specific.trim();
  if (!g) return s;
  if (!s) return g;
  return `${g}，${s}`;
}
