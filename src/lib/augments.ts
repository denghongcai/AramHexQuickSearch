import type { AugmentRow } from '@/lib/api'

/** 海克斯稀有度全集（augments.json rarity 字段的三种取值，按棱彩 → 黄金 → 白银排序） */
export const RARITIES = ['prismatic', 'gold', 'silver'] as const
export type Rarity = (typeof RARITIES)[number]

/**
 * 校验 ?rarity= 查询参数：合法取值原样返回，空串 / 非法值 / 非字符串一律
 * 返回 undefined（= 全部）。根路由 validateSearch 用它扩展 rarity，
 * 保证 URL 上只会出现三种合法值或干脆没有。
 */
export function parseRarity(value: unknown): Rarity | undefined {
  return (RARITIES as readonly string[]).includes(value as string)
    ? (value as Rarity)
    : undefined
}

/**
 * 按稀有度过滤海克斯榜；undefined（= 全部）原样返回全量。
 * 数据本身按 rank 升序排列，filter 保持相对顺序，因此过滤结果仍按 rank 升序。
 */
export function filterAugments<T extends AugmentRow>(
  rows: ReadonlyArray<T>,
  rarity: Rarity | undefined,
): T[] {
  if (!rarity) return [...rows]
  return rows.filter((row) => row.rarity === rarity)
}

/** 按稀有度计数（筛选 tabs 上的条数徽标用，undefined 视为全量） */
export function countByRarity(
  rows: ReadonlyArray<AugmentRow>,
  rarity: Rarity | undefined,
): number {
  if (!rarity) return rows.length
  return rows.reduce((n, row) => (row.rarity === rarity ? n + 1 : n), 0)
}
