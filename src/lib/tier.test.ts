import { describe, expect, it } from 'vitest'

import { tierSegments } from './tier'

// 手造 fixture：真实数据实测分布（173 人 = S14/A35/B69/C41/D14）
function makeHeroes(counts: Record<string, number>): Array<{ tier: string }> {
  const heroes: Array<{ tier: string }> = []
  for (const [tier, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i++) heroes.push({ tier })
  }
  return heroes
}

describe('tierSegments（TierBar 桌面 / 移动端共用的聚合纯函数）', () => {
  it('按固定 S→D 顺序聚合人数与占比', () => {
    const segs = tierSegments(makeHeroes({ S: 14, A: 35, B: 69, C: 41, D: 14 }))
    expect(segs.map((s) => s.tier)).toEqual(['S', 'A', 'B', 'C', 'D'])
    expect(segs.map((s) => s.count)).toEqual([14, 35, 69, 41, 14])
    expect(segs[0]!.share).toBeCloseTo(14 / 173, 8)
    expect(segs[2]!.share).toBeCloseTo(69 / 173, 8)
  })

  it('空列表返回全 0 段（share=0，条形仍可渲染骨架）', () => {
    expect(tierSegments([])).toEqual([
      { tier: 'S', count: 0, share: 0 },
      { tier: 'A', count: 0, share: 0 },
      { tier: 'B', count: 0, share: 0 },
      { tier: 'C', count: 0, share: 0 },
      { tier: 'D', count: 0, share: 0 },
    ])
  })

  it('未知 tier 值不计数，占比分母只含有效英雄', () => {
    const segs = tierSegments([{ tier: 'S' }, { tier: 'X' }, { tier: 'S' }])
    expect(segs.map((s) => s.count)).toEqual([2, 0, 0, 0, 0])
    expect(segs[0]!.share).toBe(1)
  })
})
