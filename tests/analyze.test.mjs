import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { buildDataset, parseGtimgAugmentIcons, parseGtimgItemIcons, toPercent2dp, writeDataset } from '../scripts/analyze.mjs'
import { buildItemMeta, parseBuilds } from '../scripts/lib/haidou-builds.mjs'
import { buildSearchKeys } from '../scripts/lib/search.mjs'
import { augmentTipSegments, itemTipSegments } from '../scripts/lib/richtext.mjs'

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

describe('gtimg 图标索引解析（kiwi_augments.json / items.js）', () => {
  it('海克斯图标：small 优先，缺失回落 large，两者皆缺不进表（icon 输出 null）', () => {
    const icons = parseGtimgAugmentIcons(JSON.parse(fs.readFileSync(path.join(FIXTURES, 'gtimg/kiwi_augments.json'), 'utf8')))
    expect(icons.get(1001)).toBe('https://game.gtimg.cn/images/lol/act/img/rune/iamthejuggernaut_small.png')
    expect(icons.get(1002)).toBe('https://game.gtimg.cn/images/lol/act/img/rune/aetherstorm_large.png')
    expect(icons.has(1134)).toBe(false)
  })

  it('海克斯图标索引结构漂移：非数组 / 条目缺数字 augmentID → 报错', () => {
    expect(() => parseGtimgAugmentIcons({ nope: 1 })).toThrow(/数组/)
    expect(() => parseGtimgAugmentIcons([{ small_Icon: 'u.png' }])).toThrow(/augmentID/)
  })

  it('重复 augmentID 容错：warn + 首条图标获胜（与 items 索引口径对齐，不硬失败）', () => {
    const warn = console.warn
    const warnings = []
    console.warn = (msg) => warnings.push(String(msg))
    try {
      const icons = parseGtimgAugmentIcons([
        { augmentID: 7, small_Icon: 'first.png' },
        { augmentID: '7', small_Icon: 'second.png' },
        { augmentID: 8, small_Icon: 'only.png' },
      ])
      expect(icons.get(7)).toBe('first.png')
      expect(icons.get(8)).toBe('only.png')
      expect(warnings.some((m) => m.includes('augmentID=7 重复'))).toBe(true)
    } finally {
      console.warn = warn
    }
  })

  it('装备图标：iconPath 完整 URL，缺 id / 缺 iconPath 的条目跳过', () => {
    const icons = parseGtimgItemIcons(JSON.parse(fs.readFileSync(path.join(FIXTURES, 'gtimg/items.js'), 'utf8')))
    expect(icons[3032]).toBe('https://game.gtimg.cn/images/lol/act/img/item/3032.png')
    expect(icons[123430]).toBe('https://game.gtimg.cn/images/lol/act/img/item/123430.png')
    expect(1043 in icons).toBe(false)
    expect(() => parseGtimgItemIcons({ items: [{ itemId: 'x', iconPath: 'u' }, { itemId: 1 }] })).not.toThrow()
  })

  it('装备图标索引结构漂移（无 items 数组）→ 报错', () => {
    expect(() => parseGtimgItemIcons({})).toThrow(/items/)
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
    // haidou index.json 的 guides[].aliases 按 id join 进检索键（fixture 157 带 4 个词项）
    expect(row.search).toEqual(
      buildSearchKeys({ name: '亚索', title: '疾风剑豪', alias: 'Yasuo', aliases: ['风男', '压缩', 'Yasuo', 'fengnan'] }),
    )
    // join 断言：外号本身进 n、外号首字母进 f（前端 matcher 只查 n/t/f）
    expect(row.search.n).toEqual(
      expect.arrayContaining(['风男', '压缩', 'fengnan', 'yasuo', 'jifengjianhao']),
    )
    expect(row.search.f).toContain('fn')
  })

  it('guides 条目缺 aliases 的英雄优雅回落：hero 22 检索键与旧版一致（外号缺失不致命）', () => {
    const row = dataset.heroes.find((h) => h.id === 22)
    expect(row.search.n).toEqual(['李青'])
    expect(row.search.f).toEqual(['lq', 'ms']) // 李青 + 盲僧（称号）首字母，旧口径原样
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

  it('augments 三稀有度分组、组内 winRate 降序；lowSample 仅在 true 时输出；行带 gtimg 图标', () => {
    const yasuo = dataset.heroes[0]
    expect(Object.keys(yasuo.augments)).toEqual(['prismatic', 'gold', 'silver'])
    expect(yasuo.augments.prismatic).toEqual([])
    expect(yasuo.augments.gold).toEqual([
      {
        id: 1002,
        name: '尖端发明家',
        icon: 'https://game.gtimg.cn/images/lol/act/img/rune/aetherstorm_large.png', // small 缺失回落 large
        games: 1200,
        wins: 650,
        winRate: 54.17,
        lowSample: true,
      },
    ])
    // low_sample: false → 不输出 lowSample 键（省体积）；1134 无图标 → null
    expect(yasuo.augments.silver).toEqual([
      { id: 1134, name: '不破之盾', icon: null, games: 50000, wins: 29000, winRate: 58 },
    ])
    expect('lowSample' in yasuo.augments.silver[0]).toBe(false)

    const lee = dataset.heroes[1]
    expect(lee.augments.prismatic).toEqual([
      {
        id: 1001,
        name: '泰坦的坚决',
        icon: 'https://game.gtimg.cn/images/lol/act/img/rune/iamthejuggernaut_small.png',
        games: 9000,
        wins: 4700,
        winRate: 52.22,
        tip: augmentTipSegments(JSON.parse(fs.readFileSync(path.join(FIXTURES, 'gtimg/kiwi_augments.json'), 'utf8')).find((x) => x.augmentID === 1001)),
      },
    ])
    expect(lee.augments.silver).toEqual([
      { id: 1134, name: '不破之盾', icon: null, games: 800, wins: 400, winRate: 50, lowSample: true },
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

  it('builds = parseBuilds 输出 + winRate/pickRate 统一转 percent2dp（其余字段原样）', () => {
    const itemMeta = buildItemMeta(JSON.parse(fs.readFileSync(path.join(FIXTURES, 'haidou/items/index.json'), 'utf8')))
    const yasuoJson = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'haidou/heroes/demo-yasuo.json'), 'utf8'))
    // analyze 给 parseBuilds 传的是 gtimg 装备图标查询（与产物逐字段对齐）
    const itemIcons = parseGtimgItemIcons(JSON.parse(fs.readFileSync(path.join(FIXTURES, 'gtimg/items.js'), 'utf8')))
    const gtimgItemsFixture = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'gtimg/items.js'), 'utf8')).items
    const tipOf = (id) => {
      const e = gtimgItemsFixture.find((x) => Number(x.itemId) === id)
      const segs = e ? itemTipSegments(e) : []
      return segs.length > 0 ? segs : null
    }
    const priceOf = (id) => {
      const e = gtimgItemsFixture.find((x) => Number(x.itemId) === id)
      if (!e) return null
      const total = typeof e.total === 'string' && e.total !== '' ? e.total : null
      const price = typeof e.price === 'string' && e.price !== '' ? e.price : null
      return total ?? price
    }
    const expected = parseBuilds(yasuoJson, itemMeta, (id) => itemIcons[id] ?? null).map((b) => ({
      ...b,
      winRate: toPercent2dp(b.winRate),
      pickRate: toPercent2dp(b.pickRate),
      core: { ...b.core, tips: b.core.itemIds.map(tipOf), prices: b.core.itemIds.map(priceOf) },
      starter: b.starter.map((it) => ({ ...it, tip: tipOf(it.id), price: priceOf(it.id) })),
      recommended: b.recommended.map((it) => ({ ...it, tip: tipOf(it.id), price: priceOf(it.id) })),
    }))
    expect(dataset.heroes[0].builds).toEqual(expected)
    // 钉死换算值：crit build 0.6/0.5 → 60/50，meta.units 的 percent2dp 对 builds 同样成立
    expect(dataset.heroes[0].builds[0]).toMatchObject({ key: 'crit', winRate: 60, pickRate: 50, sampleCount: 1000 })
    // 图标契约：core.icons 与 itemIds 平行；starter/recommended 是 [{name, icon}]
    expect(dataset.heroes[0].builds[0].core.icons).toEqual([
      'https://game.gtimg.cn/images/lol/act/img/item/3032.png',
      'https://game.gtimg.cn/images/lol/act/img/item/6672.png',
      'https://game.gtimg.cn/images/lol/act/img/item/3072.png',
    ])
    expect(dataset.heroes[0].builds[0].starter).toEqual([
      { id: 1055, name: '多兰之刃', icon: 'https://game.gtimg.cn/images/lol/act/img/item/1055.png', tip: null, price: null },
    ])
    // 海斗索引里没有的英雄（fixture: demo-missing 文件缺失）→ builds null
    expect(dataset.heroes.find((h) => h.id === 1).builds).toBeNull()
  })

  it('build 缺 winRate → 构建期硬错误（toPercent2dp 拒绝 NaN，不让脏行混进产物）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aramhex-haidou-norate-'))
    try {
      fs.copyFileSync(path.join(FIXTURES, 'haidou/index.json'), path.join(dir, 'index.json'))
      fs.mkdirSync(path.join(dir, 'items'))
      fs.copyFileSync(path.join(FIXTURES, 'haidou/items/index.json'), path.join(dir, 'items/index.json'))
      fs.mkdirSync(path.join(dir, 'heroes'))
      const yasuo = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'haidou/heroes/demo-yasuo.json'), 'utf8'))
      delete yasuo.builds[0].winRate
      fs.writeFileSync(path.join(dir, 'heroes/demo-yasuo.json'), JSON.stringify(yasuo))
      fs.copyFileSync(path.join(FIXTURES, 'haidou/heroes/demo-annie.json'), path.join(dir, 'heroes/demo-annie.json'))
      expect(() => buildDataset({ ...CACHE_DIRS, haidouDir: dir }, MANIFEST)).toThrow(/有限/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('guides[].id 与英雄文件 hero.id 不一致 → 硬错误并给出两边 id（拒绝静默错位关联）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aramhex-haidou-mismatch-'))
    try {
      fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ guides: [{ id: 22, slug: 'impostor' }] }))
      fs.mkdirSync(path.join(dir, 'items'))
      fs.copyFileSync(path.join(FIXTURES, 'haidou/items/index.json'), path.join(dir, 'items/index.json'))
      fs.mkdirSync(path.join(dir, 'heroes'))
      // demo-yasuo 的 hero.id=157，却挂在 guide id=22（李青）名下
      fs.copyFileSync(path.join(FIXTURES, 'haidou/heroes/demo-yasuo.json'), path.join(dir, 'heroes/impostor.json'))
      expect(() => buildDataset({ ...CACHE_DIRS, haidouDir: dir }, MANIFEST)).toThrow(
        /heroId=22（slug=impostor）与英雄文件内的 hero\.id=157 不一致/,
      )
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('buildDataset → augments（全量榜单）', () => {
  it('聚合行按 rank 排列，winRate/pickRate 转百分数2位，保留 heroCount/rarity，行带图标', () => {
    expect(dataset.augments).toEqual([
      {
        id: 1134,
        name: '不破之盾',
        icon: null, // kiwi 索引 small/large 皆缺 → null（UI 色点兜底）
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
        icon: 'https://game.gtimg.cn/images/lol/act/img/rune/aetherstorm_large.png',
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
        icon: 'https://game.gtimg.cn/images/lol/act/img/rune/iamthejuggernaut_small.png',
        rarity: 'prismatic',
        games: 9000,
        wins: 4700,
        winRate: 52.22,
        pickRate: 100,
        heroCount: 1,
        rank: 3,
        tip: augmentTipSegments(
          JSON.parse(fs.readFileSync(path.join(FIXTURES, 'gtimg/kiwi_augments.json'), 'utf8')).find((x) => x.augmentID === 1001),
        ),
      },
    ])
  })
})

describe('buildDataset → families', () => {
  it('跨英雄聚类，家族附物品名（itemMeta 解析）+ 图标（gtimg），全量输出不过滤', () => {
    const itemIcon = (id) => `https://game.gtimg.cn/images/lol/act/img/item/${id}.png`
    expect(dataset.families.families).toEqual([
      {
        id: 3032,
        items: [3032, 3072, 6672],
        names: ['育恩塔尔荒野箭', '血手', '海妖杀手'],
        icons: [itemIcon(3032), itemIcon(3072), itemIcon(6672)],
        buildCount: 2,
      },
      {
        id: 3065,
        items: [3065, 3742],
        names: ['振奋盔甲', '兰顿之兆'],
        icons: [itemIcon(3065), itemIcon(3742)],
        buildCount: 2,
      },
      {
        id: 3089,
        items: [3089, 3157, 4645],
        names: ['灭世者的死亡之帽', '中娅沙漏', '星蚀驱驰'],
        icons: [itemIcon(3089), itemIcon(3157), itemIcon(4645)],
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

  it('检索键回落旧口径（无社区别名）：157 的 n 不含风男/压缩', () => {
    expect(degraded.heroes[0].search).toEqual(buildSearchKeys({ name: '亚索', title: '疾风剑豪', alias: 'Yasuo' }))
    expect(degraded.heroes[0].search.n).not.toContain('风男')
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
  it('gtimg 目录整体缺失 → 报错（图标索引先读，kiwi_augments.json 首个报错）', () => {
    expect(() => buildDataset({ ...CACHE_DIRS, gtimgDir: path.join(FIXTURES, 'no-such-dir') }, MANIFEST)).toThrow(
      /kiwi_augments/,
    )
  })

  it('gtimg 图标索引/hero_list 逐个缺失 → 全部报错（gtimg 无降级路径）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aramhex-gtimg-partial-'))
    try {
      fs.copyFileSync(path.join(FIXTURES, 'gtimg/hero_list.js'), path.join(dir, 'hero_list.js'))
      expect(() => buildDataset({ ...CACHE_DIRS, gtimgDir: dir }, MANIFEST)).toThrow(/kiwi_augments/)
      fs.copyFileSync(path.join(FIXTURES, 'gtimg/kiwi_augments.json'), path.join(dir, 'kiwi_augments.json'))
      expect(() => buildDataset({ ...CACHE_DIRS, gtimgDir: dir }, MANIFEST)).toThrow(/items\.js/)
      fs.copyFileSync(path.join(FIXTURES, 'gtimg/items.js'), path.join(dir, 'items.js'))
      expect(() => buildDataset({ ...CACHE_DIRS, gtimgDir: dir }, MANIFEST)).not.toThrow()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('haidouDir 非 null 但 index.json 缺失 → 报错（manifest 声称可用而缓存不一致）', () => {
    expect(() => buildDataset({ ...CACHE_DIRS, haidouDir: path.join(FIXTURES, 'aramhex') }, MANIFEST)).toThrow(
      /index\.json/,
    )
  })

  it('haidou index.json 结构漂移（无 guides 数组）→ 报错', () => {
    const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aramhex-haidou-bad-'))
    try {
      fs.writeFileSync(path.join(badDir, 'index.json'), '{"site":"broken"}')
      expect(() => buildDataset({ ...CACHE_DIRS, haidouDir: badDir }, MANIFEST)).toThrow(/guides/)
    } finally {
      fs.rmSync(badDir, { recursive: true, force: true })
    }
  })
})

describe('writeDataset', () => {
  // 模块级一次性构建产物目录：本组全部用例只读它，afterAll 里清理
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aramhex-analyze-'))
  afterAll(() => fs.rmSync(outDir, { recursive: true, force: true }))

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
    // Part B 图标契约：core.icons 平行数组 + starter 对象数组（icon 查 gtimg）
    expect(hero.builds[0].core.icons).toHaveLength(3)
    expect(hero.builds[0].starter).toEqual([{ id: 1055, name: '多兰之刃', icon: 'https://game.gtimg.cn/images/lol/act/img/item/1055.png', tip: null, price: null }])
    expect(Object.keys(hero.augments.silver[0])).toEqual(['id', 'name', 'icon', 'games', 'wins', 'winRate'])
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
