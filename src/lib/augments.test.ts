import { describe, expect, it } from 'vitest'

import type { AugmentRow } from './api'
import { countByRarity, filterAugments, parseRarity, RARITIES } from './augments'

/** 造一条最小海克斯行（只带过滤逻辑用到的字段） */
function row(id: number, rarity: AugmentRow['rarity'], rank: number): AugmentRow {
  return { id, name: `海克斯${id}`, icon: null, rarity, games: 100, wins: 50, winRate: 50, pickRate: 1, heroCount: 3, rank }
}

const FIXTURE: AugmentRow[] = [
  row(1, 'prismatic', 1),
  row(2, 'gold', 2),
  row(3, 'prismatic', 3),
  row(4, 'silver', 4),
  row(5, 'gold', 5),
  row(6, 'silver', 6),
]

describe('parseRarity（?rarity= 校验）', () => {
  it('三种合法值原样返回', () => {
    expect(parseRarity('prismatic')).toBe('prismatic')
    expect(parseRarity('gold')).toBe('gold')
    expect(parseRarity('silver')).toBe('silver')
  })

  it('空串 / 缺失 / 非法值 / 非字符串 → undefined（= 全部）', () => {
    expect(parseRarity('')).toBeUndefined()
    expect(parseRarity(undefined)).toBeUndefined()
    expect(parseRarity(null)).toBeUndefined()
    expect(parseRarity('PRISMATIC')).toBeUndefined()
    expect(parseRarity('diamond')).toBeUndefined()
    expect(parseRarity(1)).toBeUndefined()
    expect(parseRarity({ rarity: 'gold' })).toBeUndefined()
  })

  it('RARITIES 覆盖 AugmentRow rarity 的全部取值', () => {
    expect(RARITIES).toEqual(['prismatic', 'gold', 'silver'])
  })
})

describe('filterAugments（稀有度过滤，保持 rank 升序）', () => {
  it('undefined 返回全量（拷贝，不影响入参顺序）', () => {
    expect(filterAugments(FIXTURE, undefined)).toHaveLength(6)
    expect(filterAugments(FIXTURE, undefined)).not.toBe(FIXTURE)
    expect(filterAugments(FIXTURE, undefined).map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('按稀有度过滤且相对顺序不变（rank 仍升序）', () => {
    expect(filterAugments(FIXTURE, 'prismatic').map((r) => r.id)).toEqual([1, 3])
    expect(filterAugments(FIXTURE, 'gold').map((r) => r.rank)).toEqual([2, 5])
    expect(filterAugments(FIXTURE, 'silver').map((r) => r.id)).toEqual([4, 6])
  })

  it('空列表返回空列表', () => {
    expect(filterAugments([], 'gold')).toEqual([])
  })
})

describe('countByRarity（tabs 条数徽标）', () => {
  it('undefined = 全量条数', () => {
    expect(countByRarity(FIXTURE, undefined)).toBe(6)
  })

  it('各稀有度条数合计 = 全量', () => {
    const counts = RARITIES.map((rarity) => countByRarity(FIXTURE, rarity))
    expect(counts).toEqual([2, 2, 2])
    expect(counts.reduce((a, b) => a + b, 0)).toBe(countByRarity(FIXTURE, undefined))
  })
})
