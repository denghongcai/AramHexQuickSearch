/** 海克斯稀有度 → 中文标签（augments.json rarity 字段的三种取值） */
export const RARITY_LABEL: Record<string, string> = {
  prismatic: '棱彩',
  gold: '黄金',
  silver: '白银',
}

/**
 * 稀有度 → 色点配色（bg 字面量写死在本模块，保证 Tailwind 扫描得到）。
 * 总览页海克斯榜 / 移动端总览条 / 海克斯排行表共用。
 */
export const RARITY_DOT: Record<string, string> = {
  prismatic: 'bg-rar-prismatic',
  gold: 'bg-rar-gold',
  silver: 'bg-rar-silver',
}

/**
 * 稀有度 → 文字配色（text 字面量同样写死在本模块，保证 Tailwind 扫描得到）。
 * 海克斯排行桌面表格 / 移动端卡片共用；数据契约只有三种取值，无需兜底类名。
 */
export const RARITY_TEXT: Record<string, string> = {
  prismatic: 'text-rar-prismatic',
  gold: 'text-rar-gold',
  silver: 'text-rar-silver',
}
