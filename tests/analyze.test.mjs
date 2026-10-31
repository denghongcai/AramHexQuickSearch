import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildDataset, toPercent2dp, writeDataset } from '../scripts/analyze.mjs'
import { buildItemMeta, parseBuilds } from '../scripts/lib/haidou-builds.mjs'
import { buildSearchKeys } from '../scripts/lib/search.mjs'

const FIXTURES = path.join(import.meta.dirname, 'fixtures')
const CACHE_DIRS = {
  aramhexDir: path.join(FIXTURES, 'aramhex'),
  // 与真实缓存不同：fixture 的 haidou 目录直接就是 "data 层"（index.json + heroes/ + items/），
  // main() 传入的则是 manifest.haidouDir 下的 data/ 子目录
  haidouDir: path.join(FIXTURES, 'haidou'),
  gtimgDir: path.join(FIXTURES, 'gtimg'),
}
const MANIFEST = { aramhexCommit: 'abc1234def', fetchedAt: '2026-10-31T16:06:22.815Z' }

const dataset = buildDataset(CACHE_DIRS, MANIFEST)
// 海斗整体降级：manifest haidouDir 为 null（整体宕机后的形态）
const degraded = buildDataset({ ...CACHE_DIRS, haidouDir: null }, MANIFEST)

describe('toPercent2dp（全站唯一百分数换算）', () => {
  it('0.583325 → 58.33，0 → 0，1 → 100', () => {
    expect(toPercent2dp(0.583325)).toBe(58.33)
    expect(toPercent2dp(0)).toBe(0)
    expect(toPercent2dp(1)).toBe(100)
  })

  it('非有限数字报错，不产出 NaN 混进产物', () => {
    expect(() => toPercent2dp(Number.NaN)).toThrow(/有限/)
    expect(() => toPercent2dp(Number.POSITIVE_INFINITY)).toThrow(/有限/)
    expect(() => toPercent2dp(undefined)).toThrow(/有限/)
  })
})

describe('buildDataset → meta', () => {
  it('meta 字段与键序符合契约', () => {
    expect(Object.keys(dataset.meta)).toEqual([
      'patch',
      'snapshotAt',
      'gamesValid',
      'heroCount',
      'augmentCount',
      'generatedAt',
      'tierRule',
      'units',
      'sources',
    ])
    expect(dataset.meta.patch).toBe('16.21')
    expect(dataset.meta.snapshotAt).toBe('2026-10-31T02:25:44.658064+08:00')
    expect(dataset.meta.gamesValid).toBe(211699)
    expect(dataset.meta.heroCount).toBe(3)
    expect(dataset.meta.augmentCount).toBe(3)
    expect(Number.isNaN(Date.parse(dataset.meta.generatedAt))).toBe(false)
  })

  it('tierRule / units 为固定声明字符串', () => {
    expect(dataset.meta.tierRule).toBe('S/A/B/C/D = 前8%/20%/40%/24%/后8%（累计ceil+同胜率不拆档）')
    expect(dataset.meta.units).toEqual({ winRate: 'percent2dp', pickRate: 'percent2dp' })
  })

  it('sources 透出 manifest commit 与三个来源 URL / 许可', () => {
    expect(dataset.meta.sources).toEqual({
      aramhex: { commit: 'abc1234def', url: 'https://github.com/czgreat/aramhex-data', license: 'CC-BY-NC-4.0' },
      haidou: { url: 'https://haidou.zhishitft.cn/', used: true },
      gtimg: { url: 'https://game.gtimg.cn/' },
    })
  })

  it('manifest 缺 aramhexCommit 时 commit 为 null 而不是 undefined（可序列化）', () => {
    const d = buildDataset(CACHE_DIRS, {})
    expect(d.meta.sources.aramhex.commit).toBeNull()
  })
})

describe('buildDataset → heroes（列表行）', () => {
  it('按 rank 升序排列', () => {
    expect(dataset.heroes.map((h) => h.id)).toEqual([157, 22, 1])
    expect(dataset.heroes.map((h) => h.rank)).toEqual([1, 2, 3])
  })

  it('157 行字段完整：aramhex 中文名 + gtimg alias/icon（完整 URL）+ tier + 百分数2位', () => {
    const row = dataset.heroes[0]
    expect(row).toMatchObject({
      id: 157,
      name: '亚索',
      title: '疾风剑豪',
      alias: 'Yasuo',
      icon: 'https://game.gtimg.cn/images/lol/act/img/champion/Yasuo.png',
      tier: 'S',
      rank: 1,
      winRate: 58.33, // 0.583325
      pickRate: 1.15, // 0.011514
      games: 2596616,
      buildCount: 3,
    })
    expect(row.search).toEqual(buildSearchKeys({ name: '亚索', title: '疾风剑豪', alias: 'Yasuo' }))
  })

  it('gtimg 缺 alias 的英雄降级：alias/icon 为 null，检索键 p 为空数组', () => {
    const row = dataset.heroes.find((h) => h.id === 22)
    expect(row.alias).toBeNull()
    expect(row.icon).toBeNull()
    expect(row.search.p).toEqual([])
    expect(row.search.n).toEqual(['李青'])
  })

  it('n=3 时档位压缩符合 computeTiers：157=S，22/1=B', () => {
    expect(dataset.heroes.map((h) => [h.id, h.tier])).toEqual([
      [157, 'S'],
      [22, 'B'],
      [1, 'B'],
    ])
  })

  it('buildCount = 海斗 builds 数；海斗未覆盖的英雄为 0', () => {
    expect(dataset.heroes.map((h) => [h.id, h.buildCount])).toEqual([
      [157, 3],
      [22, 4],
      [1, 0],
    ])
  })
})

describe('buildDataset → hero 明细', () => {
  it('157：ranking 用百分数2位并带 wins', () => {
    const hero = dataset.heroes[0]
    expect(hero.ranking ?? hero.wins).toBeDefined() // 明细挂在同一行上，ranking 由 writeDataset 投影
    expect(hero.wins).toBe(1514671)
  })

  it('bands：all + casual/mid/top，百分数2位；缺段省略键（hero 1 无任何分段）', () => {
    const yasuo = dataset.heroes[0]
    expect(yasuo.bands).toEqual({
      all: { winRate: 58.33, games: 2596616 },
      casual: { winRate: 57, games: 2200000 },
      mid: { winRate: 60, games: 300000 },
      top: { winRate: 62, games: 150000 },
    })
    const none = dataset.heroes.find((h) => h.id === 1)
    expect(Object.keys(none.bands)).toEqual(['all'])
    expect(none.bands.all).toEqual({ winRate: 49.2, games: 490451 })
  })

  it('spells 按 games 降序，names 逐段翻译，winRate 百分数2位', () => {
    expect(dataset.heroes[0].spells).toEqual([
      { combo: '4+14', ids: [4, 14], names: ['闪现', '点燃'], games: 2000000, wins: 1170000, winRate: 58.5 },
      { combo: '4+12', ids: [4, 12], names: ['闪现', '传送'], games: 500000, wins: 255000, winRate: 51 },
    ])
    expect(dataset.heroes[1].spells).toEqual([
      { combo: '4+14', ids: [4, 14], names: ['闪现', '点燃'], games: 800000, wins: 430000, winRate: 53.75 },
    ])
  })

  it('无海斗出装记录的英雄 spells/augments 为空但不缺失', () => {
    const none = dataset.heroes.find((h) => h.id === 1)
    expect(none.spells).toEqual([])
    expect(none.augments).toEqual({ prismatic: [], gold: [], silver: [] })
  })

  it('augments 三稀有度分组、组内 winRate 降序；lowSample 仅在 true 时输出', () => {
    const yasuo = dataset.heroes[0]
    expect(Object.keys(yasuo.augments)).toEqual(['prismatic', 'gold', 'silver'])
    expect(yasuo.augments.prismatic).toEqual([])
    expect(yasuo.augments.gold).toEqual([
      { id: 1002, name: '尖端发明家', games: 1200, wins: 650, winRate: 54.17, lowSample: true },
    ])
    // low_sample: false → 不输出 lowSample 键（省体积）
    expect(yasuo.augments.silver).toEqual([{ id: 1134, name: '不破之盾', games: 50000, wins: 29000, winRate: 58 }])
    expect('lowSample' in yasuo.augments.silver[0]).toBe(false)

    const lee = dataset.heroes[1]
    expect(lee.augments.prismatic).toEqual([
      { id: 1001, name: '泰坦的坚决', games: 9000, wins: 4700, winRate: 52.22 },
    ])
    expect(lee.augments.silver).toEqual([
      { id: 1134, name: '不破之盾', games: 800, wins: 400, winRate: 50, lowSample: true },
    ])
    expect(lee.augments.gold).toEqual([])
  })

  it('excluded_augments（1337）不漏进英雄明细与全量榜单', () => {
    const yasuo = dataset.heroes[0]
    for (const rows of Object.values(yasuo.augments)) {
      expect(rows.some((r) => r.id === 1337)).toBe(false)
    }
    expect(dataset.augments.some((r) => r.id === 1337)).toBe(false)
    expect(dataset.augments.some((r) => r.id === 3176)).toBe(false)
  })

  it('builds 为 parseBuilds 输出的原样透传', () => {
    const itemMeta = buildItemMeta(JSON.parse(fs.readFileSync(path.join(FIXTURES, 'haidou/items/index.json'), 'utf8')))
    const yasuoJson = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'haidou/heroes/demo-yasuo.json'), 'utf8'))
    expect(dataset.heroes[0].builds).toEqual(parseBuilds(yasuoJson, itemMeta))
    // 海斗索引里没有的英雄（fixture: demo-missing 文件缺失）→ builds null
    expect(dataset.heroes.find((h) => h.id === 1).builds).toBeNull()
  })
})

describe('buildDataset → augments（全量榜单）', () => {
  it('聚合行按 rank 排列，winRate/pickRate 转百分数2位，保留 heroCount/rarity', () => {
    expect(dataset.augments).toEqual([
      {
        id: 1134,
        name: '不破之盾',
        rarity: 'silver',
        games: 50800,
        wins: 29400,
        winRate: 57.87, // 29400/50800
        pickRate: 100, // silver 池只有这一件
        heroCount: 2,
        rank: 1,
      },
      {
        id: 1002,
        name: '尖端发明家',
        rarity: 'gold',
        games: 1200,
        wins: 650,
        winRate: 54.17,
        pickRate: 100,
        heroCount: 1,
        rank: 2,
      },
      {
        id: 1001,
        name: '泰坦的坚决',
        rarity: 'prismatic',
        games: 9000,
        wins: 4700,
        winRate: 52.22,
        pickRate: 100,
        heroCount: 1,
        rank: 3,
      },
    ])
  })
})

describe('buildDataset → families', () => {
  it('跨英雄聚类，家族附物品名（itemMeta 解析），全量输出不过滤', () => {
    expect(dataset.families.families).toEqual([
      {
        id: 3032,
        items: [3032, 3072, 6672],
        names: ['育恩塔尔荒野箭', '血手', '海妖杀手'],
        buildCount: 2,
      },
      { id: 3065, items: [3065, 3742], names: ['振奋盔甲', '兰顿之兆'], buildCount: 2 },
      {
        id: 3089,
        items: [3089, 3157, 4645],
        names: ['灭世者的死亡之帽', '中娅沙漏', '星蚀驱驰'],
        buildCount: 2,
      },
    ])
    expect(dataset.families.itemFamily).toEqual({
      3032: 3032,
      3065: 3065,
      3072: 3032,
      3089: 3089,
      3157: 3089,
      3742: 3065,
      4645: 3089,
      6672: 3032,
    })
  })
})

describe('海斗降级（manifest haidouDir = null）', () => {
  it('全部英雄 builds:null、buildCount 0，不中断流程', () => {
    expect(degraded.heroes.map((h) => h.builds)).toEqual([null, null, null])
    expect(degraded.heroes.map((h) => h.buildCount)).toEqual([0, 0, 0])
    expect(degraded.heroes.map((h) => h.id)).toEqual([157, 22, 1])
  })

  it('families 为空、meta.sources.haidou.used=false，其余数据不受影响', () => {
    expect(degraded.families).toEqual({ families: [], itemFamily: {} })
    expect(degraded.meta.sources.haidou.used).toBe(false)
    expect(degraded.meta.patch).toBe(dataset.meta.patch)
    expect(degraded.heroes.map((h) => [h.id, h.tier, h.winRate])).toEqual(
      dataset.heroes.map((h) => [h.id, h.tier, h.winRate]),
    )
    expect(degraded.augments).toEqual(dataset.augments)
  })
})

describe('fail-fast 边界', () => {
  it('gtimg hero_list.js 缺失 → 报错（alias/icon 是硬依赖）', () => {
    expect(() => buildDataset({ ...CACHE_DIRS, gtimgDir: path.join(FIXTURES, 'no-such-dir') }, MANIFEST)).toThrow(
      /hero_list/,
    )
  })

  it('haidouDir 非 null 但 index.json 缺失 → 报错（manifest 声称可用而缓存不一致）', () => {
    expect(() => buildDataset({ ...CACHE_DIRS, haidouDir: path.join(FIXTURES, 'aramhex') }, MANIFEST)).toThrow(
      /index\.json/,
    )
  })

  it('haidou index.json 结构漂移（无 guides 数组）→ 报错', () => {
    const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aramhex-haidou-bad-'))
    fs.writeFileSync(path.join(badDir, 'index.json'), '{"site":"broken"}')
    expect(() => buildDataset({ ...CACHE_DIRS, haidouDir: badDir }, MANIFEST)).toThrow(/guides/)
  })
})

describe('writeDataset', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aramhex-analyze-'))

  // 预埋上一轮的陈旧产物：写出后必须被清掉
  fs.mkdirSync(path.join(outDir, 'hero'), { recursive: true })
  fs.writeFileSync(path.join(outDir, 'hero', '999.json'), '{"stale":true}')
  fs.writeFileSync(path.join(outDir, 'heroes.json'), '{"heroes":"junk"}')

  writeDataset(dataset, outDir)

  it('产出 4 个顶层文件 + 每英雄一个明细文件，陈旧 hero 文件被清理', () => {
    expect(fs.readdirSync(outDir).sort()).toEqual(['augments.json', 'families.json', 'hero', 'heroes.json', 'meta.json'])
    expect(fs.readdirSync(path.join(outDir, 'hero')).sort()).toEqual(['1.json', '157.json', '22.json'])
    expect(fs.existsSync(path.join(outDir, 'hero', '999.json'))).toBe(false)
  })

  it('heroes.json 行是列表投影：不含 wins/bands/spells/augments/builds', () => {
    const { heroes } = JSON.parse(fs.readFileSync(path.join(outDir, 'heroes.json'), 'utf8'))
    expect(Object.keys(heroes[0])).toEqual([
      'id',
      'name',
      'title',
      'alias',
      'icon',
      'tier',
      'rank',
      'winRate',
      'pickRate',
      'games',
      'search',
      'buildCount',
    ])
    expect(heroes[0]).toMatchObject({ id: 157, tier: 'S', winRate: 58.33, buildCount: 3 })
  })

  it('hero/{id}.json 契约键序：ranking/bands/spells/augments/builds', () => {
    const hero = JSON.parse(fs.readFileSync(path.join(outDir, 'hero', '157.json'), 'utf8'))
    expect(Object.keys(hero)).toEqual(['id', 'name', 'title', 'icon', 'alias', 'ranking', 'bands', 'spells', 'augments', 'builds'])
    expect(Object.keys(hero.ranking)).toEqual(['winRate', 'pickRate', 'games', 'wins', 'rank'])
    expect(hero.ranking).toEqual({ winRate: 58.33, pickRate: 1.15, games: 2596616, wins: 1514671, rank: 1 })
    expect(hero.builds).toHaveLength(3)
    expect(hero.builds[0].core.names).toEqual(['育恩塔尔荒野箭', '海妖杀手', '血手'])
  })

  it('海斗缺失的英雄写出 builds:null；meta 原样落盘', () => {
    const none = JSON.parse(fs.readFileSync(path.join(outDir, 'hero', '1.json'), 'utf8'))
    expect(none.builds).toBeNull()
    expect(Object.keys(none.bands)).toEqual(['all'])
    const meta = JSON.parse(fs.readFileSync(path.join(outDir, 'meta.json'), 'utf8'))
    expect(meta.patch).toBe('16.21')
    expect(meta.sources.haidou.used).toBe(true)
    const families = JSON.parse(fs.readFileSync(path.join(outDir, 'families.json'), 'utf8'))
    expect(families.families).toHaveLength(3)
    expect(Object.keys(families)).toEqual(['families', 'itemFamily'])
    const augments = JSON.parse(fs.readFileSync(path.join(outDir, 'augments.json'), 'utf8'))
    expect(Object.keys(augments)).toEqual(['augments'])
    expect(augments.augments[0].winRate).toBe(57.87)
  })
})
