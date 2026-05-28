/** 角色卡列表全息/纹理效果（全局设置，存 colorTxt.ui.settings） */

export type CharacterCardTextureEffectId =
  | "off"
  | "soft"
  | "rainbow"
  | "holo"
  | "shiny-v"
  | "trainer-full-art"
  | "v-max"
  | "v-star"
  | "trainer-gallery"
  | "rainbow-rare"
  | "rainbow-alt"
  | "cosmos";

export type CharacterCardTextureEffectOption = {
  id: CharacterCardTextureEffectId;
  labelZh: string;
  descriptionZh?: string;
  /** 菜单项上方显示分隔线 */
  dividerBefore?: boolean;
};

export const CHARACTER_CARD_TEXTURE_EFFECTS: readonly CharacterCardTextureEffectOption[] =
  [
    { id: "off", labelZh: "关闭" },
    {
      id: "soft",
      labelZh: "细腻光泽",
      descriptionZh: "仅高光 glare（默认）",
    },
    {
      id: "rainbow",
      labelZh: "迷离反闪",
      descriptionZh: "Reverse Holo",
    },
    {
      id: "holo",
      labelZh: "梦幻竖纹",
      descriptionZh: "Rare Holo 竖向彩虹条",
      dividerBefore: true,
    },
    {
      id: "shiny-v",
      labelZh: "幻彩波纹",
      descriptionZh: "Shiny V",
    },
    {
      id: "trainer-full-art",
      labelZh: "波纹钢印",
      descriptionZh: "Trainer Full Art",
    },
    {
      id: "v-max",
      labelZh: "幻彩极光",
      descriptionZh: "VMAX 渐变纹理",
    },
    {
      id: "v-star",
      labelZh: "极光异画",
      descriptionZh: "VSTAR（偏淡 pastel）",
    },
    {
      id: "trainer-gallery",
      labelZh: "梦幻虹彩",
      descriptionZh: "斜向彩虹条 + 柔光晕染（原 Trainer Gallery）",
      dividerBefore: true,
    },
    {
      id: "rainbow-rare",
      labelZh: "彩虹秘稀",
      descriptionZh: "Rainbow Rare",
    },
    {
      id: "rainbow-alt",
      labelZh: "彩虹异画",
      descriptionZh: "Rainbow Alt / VMAX Alt",
    },
    {
      id: "cosmos",
      labelZh: "星云幻彩",
      descriptionZh: "Galaxy / Cosmos Holo",
    },
  ];

/** 新安装、未保存设置、或已移除/无效效果 id 时回退为「细腻光泽」 */
export const DEFAULT_CHARACTER_CARD_TEXTURE_EFFECT: CharacterCardTextureEffectId =
  "soft";

const VALID = new Set<string>(
  CHARACTER_CARD_TEXTURE_EFFECTS.map((o) => o.id),
);

export function normalizeCharacterCardTextureEffect(
  raw: unknown,
): CharacterCardTextureEffectId {
  const id = typeof raw === "string" ? raw.trim() : "";
  if (VALID.has(id)) return id as CharacterCardTextureEffectId;
  return DEFAULT_CHARACTER_CARD_TEXTURE_EFFECT;
}

export function characterCardTextureEffectLabel(
  id: CharacterCardTextureEffectId,
): string {
  return (
    CHARACTER_CARD_TEXTURE_EFFECTS.find((o) => o.id === id)?.labelZh ?? id
  );
}
