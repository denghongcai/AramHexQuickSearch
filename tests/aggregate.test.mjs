import { describe, expect, it } from 'vitest'

import { aggregateAugments, computeTiers, spellComboName, spellName } from '../scripts/lib/aggregate.mjs'

/** 手算友好的最小 fixture：2 英雄 × 4 海克斯（棱彩 3 + 大金刚 1），外加 1 个待排除项。 */
function makeFixture() {
  const augmentsMeta = {
    101: { name: '棱彩甲', rarity: 'prismatic' },
    102: { name: '棱彩乙', rarity: 'prismatic' },
    103: { name: '棱彩丙', rarity: 'prismatic' },
    200: { name: '黄金丁', rarity: 'gold' },
  }
  const heroAugments = {
    1: {
      101: { games: 100, wins: 60, winRate: 0.6, lowSample: false },
      102: { games: 50, wins: 30, winRate: 0.6, lowSample: false },
      103: { games: 40, wins: 33, winRate: 0.825, lowSample: false },
      200: { games: 40, wins: 10, winRate: 0.25, lowSample: false },
      999: { games: 100, wins: 100, winRate: 1, lowSample: false }, // 应被排除
    },
    2: {
      101: { games: 30, wins: 18, winRate: 0.6, lowSample: false },
      103: { games: 60, wins: 42, winRate: 0.7, lowSample: false },
      200: { games: 60, wins: 15, winRate: 0.25, lowSample: false },
    },
  }
  return { heroAugments, augmentsMeta, excludedAugmentIds: [999] }
}

describe('aggregateAugments', () => {
  const { heroAugments, augmentsMeta, excludedAugmentIds } = makeFixture()
  const rows = aggregateAugments(heroAugments, augmentsMeta, excludedAugmentIds)

  it('跨英雄求和 games/wins，重算 winRate（不信任单英雄口径）', () => {
    const aug101 = rows.find((r) => r.id === 101)
    expect(aug101.games).toBe(130)
    expect(aug101.wins).toBe(78)
    expect(aug101.winRate).toBeCloseTo(0.6)
    const aug103 = rows.find((r) => r.id === 103)
    expect(aug103.games).toBe(100)
    expect(aug103.wins).toBe(75)
    expect(aug103.winRate).toBeCloseTo(0.75)
  })

  it('pickRate 分母 = 同稀有度全部海克斯 games 之和（不是全体）', () => {
    // 棱彩池总数 = 130(101) + 50(102) + 100(103) = 280；排除项 999 的 100 局不分母
    const aug101 = rows.find((r) => r.id === 101)
    expect(aug101.pickRate).toBeCloseTo(130 / 280)
    expect(rows.find((r) => r.id === 102).pickRate).toBeCloseTo(50 / 280)
    expect(rows.find((r) => r.id === 103).pickRate).toBeCloseTo(100 / 280)
    // 黄金池只有 200 自己：pickRate = 1
    const aug200 = rows.find((r) => r.id === 200)
    expect(aug200.pickRate).toBe(1)
    expect(aug200.rarity).toBe('gold')
  })

  it('heroCount = 出现该海克斯的英雄数', () => {
    expect(rows.find((r) => r.id === 101).heroCount).toBe(2)
    expect(rows.find((r) => r.id === 102).heroCount).toBe(1)
  })

  it('排除 excludedAugmentIds，且不进分母', () => {
    expect(rows.find((r) => r.id === 999)).toBeUndefined()
    // 若 999 混进棱彩分母，101 的 pickRate 会是 130/380 而非 130/280
    expect(rows.find((r) => r.id === 101).pickRate).toBeCloseTo(130 / 280)
    // 排除列表里的 id 不在数据中也不报错（真实数据即此形态）
    expect(() => aggregateAugments(heroAugments, augmentsMeta, [999, 1337, 3176])).not.toThrow()
  })

  it('按 winRate 降序 rank，同胜率按 id 升序；输出数组按 rank 排列', () => {
    expect(rows.map((r) => r.id)).toEqual([103, 101, 102, 200])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
    expect(rows.find((r) => r.id === 101).winRate).toBeCloseTo(rows.find((r) => r.id === 102).winRate)
  })

  it('每行字段齐全：{id,name,rarity,games,wins,winRate,pickRate,heroCount,rank}', () => {
    expect(rows[0]).toEqual({
      id: 103,
      name: '棱彩丙',
      rarity: 'prismatic',
      games: 100,
      wins: 75,
      winRate: 0.75,
      pickRate: 100 / 280,
      heroCount: 2,
      rank: 1,
    })
  })

  it('heroAugments 出现 meta 里没有的海克斯 id 时报错（防静默脏数据）', () => {
    const bad = { 1: { 777: { games: 10, wins: 5, winRate: 0.5, lowSample: false } } }
    expect(() => aggregateAugments(bad, augmentsMeta, [])).toThrow(/777/)
  })

  it('games/wins 非有限数值时报错（防 NaN 毒化排序）', () => {
    const bad = {
      1: { 101: { games: Number('x'), wins: 5, winRate: 0.5, lowSample: false } },
    }
    const meta = { 101: { name: '棱彩甲', rarity: 'prismatic' } }
    expect(() => aggregateAugments(bad, meta, [])).toThrow(/101/)
  })
})

/** 造 n 个英雄，winRate 从 0.6 起严格递减（无 toFixed，防浮点意外并列），可传 override 定制并列。 */
function makeHeroes(n, override = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    winRate: override[i + 1] ?? 0.6 - i * 0.001,
  }))
}

describe('computeTiers', () => {
  it('n=10 时切 1/2/4/2/1（S/A/B/C/D）', () => {
    const tiers = computeTiers(makeHeroes(10))
    expect(tiers[1]).toBe('S')
    expect(tiers[2]).toBe('A')
    expect(tiers[3]).toBe('A')
    expect(tiers[4]).toBe('B')
    expect(tiers[7]).toBe('B')
    expect(tiers[8]).toBe('C')
    expect(tiers[9]).toBe('C')
    expect(tiers[10]).toBe('D')
    expect(Object.values(tiers).join('')).toBe('S' + 'AA' + 'BBBB' + 'CC' + 'D')
  })

  it('同 winRate 不跨档拆散：第 1、2 名并列时 S 档扩到 2 人', () => {
    const heroes = makeHeroes(10, { 1: 0.6, 2: 0.6 })
    const tiers = computeTiers(heroes)
    expect(tiers[1]).toBe('S')
    expect(tiers[2]).toBe('S')
    expect(tiers[3]).toBe('A')
    expect(Object.values(tiers).join('')).toBe('SS' + 'A' + 'BBBB' + 'CC' + 'D')
  })

  it('档边界落在并列组中间时，整组归更高档（B|C 边界）', () => {
    // n=10：B 档是第 4-7 名；让第 7、8 名并列，则它们都留在 B，C 缩到 1 人
    const heroes = makeHeroes(10, { 7: 0.5945, 8: 0.5945 })
    const tiers = computeTiers(heroes)
    expect(tiers[7]).toBe('B')
    expect(tiers[8]).toBe('B')
    expect(tiers[9]).toBe('C')
    expect(Object.values(tiers).join('')).toBe('S' + 'AA' + 'BBBBB' + 'C' + 'D')
  })

  it('C|D 边界同样整组归更高档：垫底并列时 D 档可为空（统一规则：并列进高档）', () => {
    const heroes = makeHeroes(10, { 9: 0.5905, 10: 0.5905 })
    const tiers = computeTiers(heroes)
    expect(tiers[9]).toBe('C')
    expect(tiers[10]).toBe('C')
    expect(Object.values(tiers).join('')).toBe('S' + 'AA' + 'BBBB' + 'CCC' + '')
  })

  it('n=173 时分布为 14/35/69/41/14', () => {
    const tiers = computeTiers(makeHeroes(173))
    const counts = { S: 0, A: 0, B: 0, C: 0, D: 0 }
    for (const t of Object.values(tiers)) counts[t]++
    expect(counts).toEqual({ S: 14, A: 35, B: 69, C: 41, D: 14 })
  })

  it('全部并列时整体归 S（不拆散优先于档位大小）', () => {
    const heroes = makeHeroes(5).map((h) => ({ ...h, winRate: 0.5 }))
    const tiers = computeTiers(heroes)
    expect(Object.values(tiers).join('')).toBe('SSSSS')
  })

  it('边界输入不炸：空数组与单人', () => {
    expect(computeTiers([])).toEqual({})
    expect(computeTiers([{ id: 42, winRate: 0.5 }])).toEqual({ 42: 'S' })
  })

  it('输入未按胜率排序也能算对（内部重排，结果与有序输入一致），且不改入参', () => {
    const heroes = makeHeroes(10).slice().reverse()
    const tiers = computeTiers(heroes)
    // id 1 胜率最高 → 仍是 S；id 10 垫底 → 仍是 D
    expect(tiers[1]).toBe('S')
    expect(tiers[10]).toBe('D')
    expect(tiers).toEqual(computeTiers(makeHeroes(10)))
    expect(heroes[0].id).toBe(10) // 入参数组顺序未被改动
  })

  it('返回可序列化普通对象（heroId → tier）', () => {
    const tiers = computeTiers(makeHeroes(3))
    expect(JSON.parse(JSON.stringify(tiers))).toEqual(tiers)
  })
})

describe('spellName / spellComboName', () => {
  it('静态表覆盖全部常见召唤师技能', () => {
    expect(spellName([1])).toBe('净化')
    expect(spellName([3])).toBe('疾跑')
    expect(spellName([4])).toBe('闪现')
    expect(spellName([6])).toBe('虚弱')
    expect(spellName([7])).toBe('治疗')
    expect(spellName([11])).toBe('惩戒')
    expect(spellName([12])).toBe('传送')
    expect(spellName([14])).toBe('点燃')
    expect(spellName([21])).toBe('屏障')
    expect(spellName([32])).toBe('标记')
  })

  it('[4,14] → 闪现+点燃', () => {
    expect(spellName([4, 14])).toBe('闪现+点燃')
  })

  it('未知 id 容错为 技能+id（真实数据含表外 id 13）', () => {
    expect(spellName([13])).toBe('技能13')
    expect(spellName([4, 13])).toBe('闪现+技能13')
    expect(() => spellName(['怪东西'])).not.toThrow()
  })

  it('spellComboName：4+14 → 闪现+点燃', () => {
    expect(spellComboName('4+14')).toBe('闪现+点燃')
    expect(spellComboName('1')).toBe('净化')
    expect(spellComboName('4+999')).toBe('闪现+技能999')
  })
})
