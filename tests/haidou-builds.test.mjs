import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildItemMeta, clusterItemFamilies, parseBuilds } from '../scripts/lib/haidou-builds.mjs'

const FIXTURE_DIR = path.join(import.meta.dirname, 'fixtures/haidou')

function loadHero(slug) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'heroes', `${slug}.json`), 'utf8'))
}

function loadItemIndex() {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'items/index.json'), 'utf8'))
}

const heroA = loadHero('demo-yasuo')
const heroB = loadHero('demo-annie')
const itemMeta = buildItemMeta(loadItemIndex())

describe('buildItemMeta', () => {
  it('把 items/index.json 转成 {[id]: name} 查询表', () => {
    expect(itemMeta[3032]).toBe('育恩塔尔荒野箭')
    expect(itemMeta[1056]).toBe('多兰之戒')
    expect(Object.keys(itemMeta)).toHaveLength(10)
  })

  it('条目缺 id 或 name 时报错（防静默脏数据）', () => {
    expect(() => buildItemMeta({ items: [{ id: 1 }] })).toThrow(/缺 id 或 name/)
    expect(() => buildItemMeta({ items: [{ name: '无名' }] })).toThrow(/缺 id 或 name/)
  })

  it('重复 id 报错；items 缺失/非数组报错', () => {
    expect(() => buildItemMeta({ items: [{ id: 1, name: '甲' }, { id: 1, name: '乙' }] })).toThrow(/重复/)
    expect(() => buildItemMeta({})).toThrow(/items/)
    expect(() => buildItemMeta({ items: 'nope' })).toThrow(/items/)
    expect(() => buildItemMeta(null)).toThrow(/items/)
  })
})

describe('parseBuilds', () => {
  const buildsA = parseBuilds(heroA, itemMeta)

  it('按真实字段映射：key/name/sampleCount/pickRate/winRate 原样透传', () => {
    expect(buildsA).toHaveLength(3)
    const crit = buildsA[0]
    expect(crit.key).toBe('crit')
    expect(crit.name).toBe('暴击流')
    expect(crit.sampleCount).toBe(1000)
    expect(crit.pickRate).toBe(0.5)
    expect(crit.winRate).toBe(0.6)
  })

  it('core 取自 coreProfile.itemIds（权威口径），names 按 itemMeta 解析且跟随 itemIds 顺序', () => {
    const crit = buildsA[0]
    expect(crit.core.itemIds).toEqual([3032, 6672, 3072])
    expect(crit.core.names).toEqual(['育恩塔尔荒野箭', '海妖杀手', '血手'])
    // items.core 的顺序与 itemIds 不一致（实测 yasuo 即如此；fixture 里 ap build
    // itemIds=[3157,3089,4645] 而 items.core=[3089,3157,4645]），输出一律跟随 itemIds
    const ap = buildsA[1]
    expect(ap.core.itemIds).toEqual([3157, 3089, 4645])
    expect(ap.core.names).toEqual(['中娅沙漏', '灭世者的死亡之帽', '星蚀驱驰'])
    expect(heroA.builds[1].items.core.map((it) => it.id)).toEqual([3089, 3157, 4645])
  })

  it('starter/recommended 取 item 对象数组映射为 [{name, icon}]（icon 缺省时 null）', () => {
    const crit = buildsA[0]
    expect(crit.starter).toEqual([{ name: '多兰之刃', icon: null }])
    expect(crit.recommended).toEqual(
      ['育恩塔尔荒野箭', '海妖杀手', '血手', '狂战士胫甲', '多米尼克领主的致意'].map((name) => ({ name, icon: null })),
    )
  })

  it('传入图标查询表/函数：core.icons 与 itemIds 平行，starter 图标按 id 查询；查无此 id 兜底 null', () => {
    const icons = { 3032: 'https://gtimg/3032.png', 1055: 'https://gtimg/1055.png' }
    const withIcons = parseBuilds(heroA, itemMeta, (id) => icons[id])
    const crit = withIcons[0]
    expect(crit.core.icons).toEqual(['https://gtimg/3032.png', null, null])
    expect(crit.starter).toEqual([{ name: '多兰之刃', icon: 'https://gtimg/1055.png' }])
    // 对象形态与 Map 形态同样接受（与 itemMeta 同款口径）
    expect(parseBuilds(heroA, itemMeta, icons)[0].core.icons).toEqual(crit.core.icons)
    expect(parseBuilds(heroA, itemMeta, new Map([[3032, 'u.png']]))[0].core.icons[0]).toBe('u.png')
    // itemIcon 缺省（不传 / null）→ icon 恒为 null，名称解析不受影响
    expect(parseBuilds(heroA, itemMeta, null)[0].core.icons).toEqual([null, null, null])
  })

  it('summary 取 gameplay.summary 按 \\n 连接，同一英雄每个 build 相同', () => {
    expect(buildsA[0].summary).toBe('演示第一条：先安稳发育。\n演示第二条：看清进场时机。\n演示第三条：按敌方阵容补装。')
    expect(buildsA[1].summary).toBe(buildsA[0].summary)
  })

  it('itemMeta 查不到名称时逐级兜底：meta → 对象自带 name → id 字符串，绝不抛错', () => {
    const buildsB = parseBuilds(heroB, itemMeta)
    // 1043 不在 items/index.json 片段里 → 保留 id 字符串
    expect(buildsB[2].core.itemIds).toEqual([3742, 3065, 1043])
    expect(buildsB[2].core.names).toEqual(['兰顿之兆', '振奋盔甲', '1043'])
    // 1055/1054 不在 meta 里，但 starter 对象自带 name → 用对象 name
    expect(buildsB[0].starter).toEqual([{ name: '多兰之刃', icon: null }])
    expect(buildsB[2].starter).toEqual([{ name: '多兰之盾', icon: null }])
    // 2003 既不在 meta 里也没有 name 字段 → id 字符串
    expect(buildsA[2].starter).toEqual([{ name: '多兰之刃', icon: null }, { name: '2003', icon: null }])
  })

  it('itemMeta 也接受 Map；缺省（null/undefined）时全部走兜底', () => {
    const asMap = new Map([[3032, '育恩塔尔荒野箭']])
    const mini = { gameplay: { summary: ['x'] }, builds: [{ key: 'k', coreProfile: { itemIds: [3032, 999] } }] }
    const fromMap = parseBuilds(mini, asMap)
    expect(fromMap[0].core.names).toEqual(['育恩塔尔荒野箭', '999'])
    const fromNull = parseBuilds(mini, null)
    expect(fromNull[0].core.names).toEqual(['3032', '999'])
  })

  it('coreProfile 缺失的 build：core 为空但仍进输出（聚类侧跳过）', () => {
    const buildsB = parseBuilds(heroB, itemMeta)
    expect(buildsB).toHaveLength(4)
    expect(buildsB[3].key).toBe('situational')
    expect(buildsB[3].core).toEqual({ itemIds: [], names: [], icons: [] })
  })

  it('builds 缺失或为空数组 → 返回 [] 不抛；gameplay 缺失 → summary 为空字符串', () => {
    expect(parseBuilds({}, itemMeta)).toEqual([])
    expect(parseBuilds({ builds: [] }, itemMeta)).toEqual([])
    expect(parseBuilds({ builds: [{ key: 'k' }] }, itemMeta)[0].summary).toBe('')
  })

  it('heroJson 非对象 / builds 非数组 → 报错（fail-fast）', () => {
    expect(() => parseBuilds(null, itemMeta)).toThrow(/heroJson/)
    expect(() => parseBuilds('x', itemMeta)).toThrow(/heroJson/)
    expect(() => parseBuilds({ builds: 'nope' }, itemMeta)).toThrow(/builds/)
    expect(() => parseBuilds({ builds: [42] }, itemMeta)).toThrow(/builds\[0\]/)
  })
})

describe('clusterItemFamilies', () => {
  // fixture 3 个天然家族：暴击 3 件（双英雄暴击 build 共现）、法系 3 件、坦克 2 件；
  // 家族间零共现；1036/1043 只出现 1 次 → 不是节点
  const allBuilds = [...parseBuilds(heroA, itemMeta), ...parseBuilds(heroB, itemMeta)]
  const result = clusterItemFamilies(allBuilds)

  it('恰好聚成 3 簇，familyId = 簇内最小 id，families 按 id 升序', () => {
    expect(result.families.map((f) => f.id)).toEqual([3032, 3065, 3089])
  })

  it('每件物品归对簇，簇内物品按 id 升序', () => {
    expect(result.families.map((f) => f.items)).toEqual([
      [3032, 3072, 6672],
      [3065, 3742],
      [3089, 3157, 4645],
    ])
  })

  it('itemFamily 覆盖全部 8 个节点；只出现 1 次的 1036/1043 不进图', () => {
    expect(result.itemFamily).toEqual({
      3032: 3032,
      3065: 3065,
      3072: 3032,
      3089: 3089,
      3157: 3089,
      3742: 3065,
      4645: 3089,
      6672: 3032,
    })
    expect('1036' in result.itemFamily).toBe(false)
    expect('1043' in result.itemFamily).toBe(false)
  })

  it('buildCount = 簇覆盖的 build 数（按核心位计）', () => {
    expect(result.families.map((f) => f.buildCount)).toEqual([2, 2, 2])
  })

  it('边权按 build sampleCount 加权：权重能改变是否达到阈值', () => {
    // 10/11 在 sampleCount=1000 的 build 共现（Jaccard≈0.998 → 合并）；
    // 20/21 在 sampleCount=1 的 build 共现（Jaccard=1/3 < 0.5 → 不合并）
    const builds = [
      { core: { itemIds: [10, 11] }, sampleCount: 1000 },
      { core: { itemIds: [10] }, sampleCount: 1 },
      { core: { itemIds: [11] }, sampleCount: 1 },
      { core: { itemIds: [20, 21] }, sampleCount: 1 },
      { core: { itemIds: [20] }, sampleCount: 1 },
      { core: { itemIds: [21] }, sampleCount: 1 },
    ]
    const r = clusterItemFamilies(builds)
    expect(r.families.map((f) => ({ id: f.id, items: f.items, buildCount: f.buildCount }))).toEqual([
      { id: 10, items: [10, 11], buildCount: 3 },
      { id: 20, items: [20], buildCount: 2 },
      { id: 21, items: [21], buildCount: 2 },
    ])
  })

  it('确定性：输入顺序无关、重复运行结果一致', () => {
    const reversed = clusterItemFamilies([...allBuilds].reverse())
    expect(reversed).toEqual(result)
    expect(clusterItemFamilies(allBuilds)).toEqual(result)
    expect(allBuilds).toHaveLength(7) // 输入未被修改
  })

  it('全部排序稳定：families 按 id 升序、itemFamily 键按 id 升序、簇内物品按 id 升序', () => {
    const ids = result.families.map((f) => f.id)
    expect([...ids].sort((a, b) => a - b)).toEqual(ids)
    expect(Object.keys(result.itemFamily)).toEqual(['3032', '3065', '3072', '3089', '3157', '3742', '4645', '6672'])
  })

  it('空输入 / 全部 build 无核心位 → {families: [], itemFamily: {}}', () => {
    expect(clusterItemFamilies([])).toEqual({ families: [], itemFamily: {} })
    expect(clusterItemFamilies([{ core: { itemIds: [], names: [] }, sampleCount: 5 }])).toEqual({
      families: [],
      itemFamily: {},
    })
    // 物品 1/2 都出现在 ≥2 个 build（是节点）且确有共现（边权 10），但
    // sim = 10/(20+20-10) = 1/3 < 阈值 0.5 → 各自成单件家族（零共现不合并的
    // 路径由上面的 fixture 家族间零共现覆盖）
    const lone = clusterItemFamilies([
      { core: { itemIds: [1, 2] }, sampleCount: 10 },
      { core: { itemIds: [1] }, sampleCount: 10 },
      { core: { itemIds: [2] }, sampleCount: 10 },
    ])
    expect(lone.families.map((f) => f.id)).toEqual([1, 2])
    expect(lone.itemFamily).toEqual({ 1: 1, 2: 2 })
  })

  it('非数组输入 / 核心位 build 缺有限 sampleCount → 报错（NaN 会毒化排序）', () => {
    expect(() => clusterItemFamilies('x')).toThrow(/数组/)
    expect(() => clusterItemFamilies(null)).toThrow(/数组/)
    expect(() => clusterItemFamilies([{ core: { itemIds: [1, 2] } }])).toThrow(/sampleCount/)
    expect(() => clusterItemFamilies([{ core: { itemIds: [1, 2] }, sampleCount: Number.NaN }])).toThrow(/sampleCount/)
    // 无核心位的 build 不参与加权，sampleCount 缺失不报错
    expect(() => clusterItemFamilies([{ core: { itemIds: [] } }])).not.toThrow()
  })
})
