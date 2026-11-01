import type { HeroRow } from '@/lib/api'

/** tier 顺序（数据管线 tierRule：S/A/B/C/D 分位档） */
export const TIERS = ['S', 'A', 'B', 'C', 'D'] as const
export type Tier = (typeof TIERS)[number]

/**
 * tier → 色片配色（bg 字面量写死在本模块，保证 Tailwind 扫描得到）。
 * HeroRail / Overview / TierBar 共用；字色一律配 text-ink。
 */
export const TIER_BG: Record<string, string> = {
  S: 'bg-tier-s',
  A: 'bg-tier-a',
  B: 'bg-tier-b',
  C: 'bg-tier-c',
  D: 'bg-tier-d',
}

export interface TierSegment {
  tier: Tier
  /** 该档英雄数 */
  count: number
  /** 占比 0-1（按已计入英雄总数） */
  share: number
}

/**
 * 按固定 S→D 顺序聚合英雄数与占比（TierBar 桌面 / 移动端共用，纯函数）。
 * 未知 tier 值不计数（数据契约只含五档，此处仅做容错）；空列表返回全 0 段。
 */
export function tierSegments(heroes: ReadonlyArray<Pick<HeroRow, 'tier'>>): TierSegment[] {
  const countBy = new Map<string, number>()
  let total = 0
  for (const { tier } of heroes) {
    if ((TIERS as readonly string[]).includes(tier)) {
      countBy.set(tier, (countBy.get(tier) ?? 0) + 1)
      total++
    }
  }
  return TIERS.map((tier) => {
    const count = countBy.get(tier) ?? 0
    return { tier, count, share: total > 0 ? count / total : 0 }
  })
}
