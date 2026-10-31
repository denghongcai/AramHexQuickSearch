import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { compareVersions, latestPatch, parseAramhex } from '../scripts/lib/aramhex.mjs'

const FIXTURE_DIR = path.join(import.meta.dirname, 'fixtures/aramhex')

describe('compareVersions 语义比较', () => {
  it('按数字段比较：16.9 < 16.10（不是字符串排序）', () => {
    expect(compareVersions('16.9', '16.10')).toBe(-1)
    expect(compareVersions('16.10', '16.9')).toBe(1)
  })

  it('相等返回 0，不等按段值比大小', () => {
    expect(compareVersions('16.21', '16.21')).toBe(0)
    expect(compareVersions('16.21', '16.20')).toBe(1)
    expect(compareVersions('16.20', '16.21')).toBe(-1)
  })
})

describe('latestPatch 排除非正式版本目录', () => {
  it('排除 pbe/prehotfix，取最新正式版本', () => {
    expect(latestPatch(['16.19', '16.20', '16.21', '16.21-pbe', '16.21-prehotfix'])).toBe('16.21')
  })

  it('语义排序而非字符串排序', () => {
    expect(latestPatch(['16.9', '16.10'])).toBe('16.10')
  })

  it('没有正式版本目录时返回 null', () => {
    expect(latestPatch(['16.21-pbe', '16.21-prehotfix'])).toBeNull()
    expect(latestPatch([])).toBeNull()
  })
})

describe('parseAramhex（mini fixture）', () => {
  const parsed = parseAramhex(FIXTURE_DIR)

  it('取最新正式版本并透传 meta 稳定字段', () => {
    // 不是 16.20 / 16.21-pbe / 16.21-prehotfix
    expect(parsed.patch).toBe('16.21')
    expect(parsed.snapshotAt).toBe('2026-10-31T02:25:44.658064+08:00')
    expect(parsed.gamesCollected).toBe(218549)
    expect(parsed.gamesValid).toBe(211699)
    expect(parsed.gamesExcluded).toBe(6850)
    expect(parsed.excludedAugmentIds).toEqual([1337, 3176])
    expect(parsed.regions).toEqual(['艾欧尼亚', '联盟一区'])
  })

  it('英雄解析为对象数组并按胜率降序（157 最高排第 1）', () => {
    expect(parsed.heroes.map((h) => h.id)).toEqual([157, 22, 1])
    expect(parsed.heroes[0]).toEqual({
      id: 157,
      name: '亚索',
      title: '疾风剑豪',
      games: 2596616,
      wins: 1514671,
      winRate: 0.583325,
      pickRate: 0.011514,
      rank: 1,
    })
  })

  it('hero_augments 按 heroId→augmentId 展开为驼峰字段', () => {
    expect(parsed.heroAugments[157][1134]).toEqual({
      games: 50000,
      wins: 29000,
      winRate: 0.58,
      lowSample: false,
    })
    expect(parsed.heroAugments[157][1002].lowSample).toBe(true)
    expect(parsed.heroAugments[22][1001].winRate).toBeCloseTo(0.522222)
  })

  it('augments 提供 id→{name,rarity}', () => {
    expect(parsed.augments[1134]).toEqual({ name: '不破之盾', rarity: 'silver' })
    expect(Object.keys(parsed.augments)).toHaveLength(3)
  })

  it('spells 组合 "4+14" 解析为 ids 数组', () => {
    expect(parsed.spells[157].find((s) => s.combo === '4+14')).toEqual({
      combo: '4+14',
      ids: [4, 14],
      games: 2000000,
      wins: 1170000,
    })
    expect(parsed.spells[157].find((s) => s.combo === '4+12')?.ids).toEqual([4, 12])
    expect(parsed.spells[22]).toHaveLength(1)
  })

  it('bands 合并 casual/mid/top 到英雄（跳过 high）', () => {
    expect(parsed.bands.casual[157]).toEqual({ winRate: 0.57, games: 2200000 })
    expect(parsed.bands.mid[157]).toEqual({ winRate: 0.6, games: 300000 })
    expect(parsed.bands.top[157]).toEqual({ winRate: 0.62, games: 150000 })
    expect(parsed.bands.high).toBeUndefined()
  })

  it('patches 目录缺失时抛出可读错误', () => {
    expect(() => parseAramhex(path.join(FIXTURE_DIR, 'no-such-dir'))).toThrow(/patches/)
  })
})
