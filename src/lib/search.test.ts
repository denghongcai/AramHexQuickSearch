import { describe, expect, it } from 'vitest'

import { filterHeroes, matchesQuery, normalizeQuery } from './search'

// 手造 fixture（值参照构建期产物：亚索/曙光女神/提莫），不 import public/data 生成物。
// 构建期键值口径见 tests/search.test.mjs（scripts/lib/search.mjs 的实测钉值）。
const yasuo = {
  id: 157,
  search: { n: ['亚索', 'yasuo'], t: ['疾风剑豪', 'jifengjianhao'], p: ['yasuo'], f: ['ys', 'jfjh'] },
}
const leona = {
  id: 89,
  search: { n: ['蕾欧娜', 'leona'], t: ['曙光女神', 'shuguangnvshen'], p: ['leona'], f: ['lon', 'sgns'] },
}
const teemo = {
  id: 17,
  search: { n: ['提莫', 'teemo'], t: ['迅捷斥候', 'xunjiechihou'], p: ['teemo'], f: ['tm', 'xjch'] },
}
const heroes = [yasuo, leona, teemo]

describe('normalizeQuery（与构建期 normalize 同口径 + ü→v）', () => {
  it('NFKC 折叠全角、转小写、去非 a-z0-9/CJK 字符（含空格标点）', () => {
    // 与构建期 tests/search.test.mjs 同款的口径性用例
    expect(normalizeQuery('ＹＡＳＵＯ')).toBe('yasuo')
    expect(normalizeQuery("Kai'Sa")).toBe('kaisa')
    expect(normalizeQuery('亚 索-123')).toBe('亚索123')
  })

  it('CJK 保留——中文查询不能归一成空串（否则全匹配）', () => {
    expect(normalizeQuery('亚索')).toBe('亚索')
    expect(normalizeQuery('疾风剑豪')).toBe('疾风剑豪')
  })

  it('ü 归一为 v（构建期键里存的是 v，粘贴 nü 也要能命中 nvshen）', () => {
    expect(normalizeQuery('nü')).toBe('nv')
    expect(normalizeQuery('曙光nü')).toBe('曙光nv')
  })

  it('空串归为空串', () => {
    expect(normalizeQuery('')).toBe('')
    expect(normalizeQuery('!!!·••')).toBe('')
  })
})

describe('matchesQuery', () => {
  it('中文名命中', () => {
    expect(matchesQuery(yasuo, '亚索')).toBe(true)
  })

  it('拼音全拼命中', () => {
    expect(matchesQuery(yasuo, 'yasuo')).toBe(true)
  })

  it('首字母命中：name 首字母与 title 首字母', () => {
    expect(matchesQuery(yasuo, 'ys')).toBe(true)
    expect(matchesQuery(yasuo, 'jfjh')).toBe(true)
  })

  it('称号中文与称号拼音命中', () => {
    expect(matchesQuery(yasuo, '疾风剑豪')).toBe(true)
    expect(matchesQuery(yasuo, 'jifengjianhao')).toBe(true)
  })

  it('拉丁别名大小写不敏感（粘贴 Yasuo 命中 yasuo 键）', () => {
    expect(matchesQuery(yasuo, 'Yasuo')).toBe(true)
    expect(matchesQuery(yasuo, 'ＹＡＳＵＯ')).toBe(true)
  })

  it('数字 id：纯数字查询额外匹配 hero.id（157 → 亚索）', () => {
    expect(matchesQuery(yasuo, '157')).toBe(true)
    expect(matchesQuery(leona, '157')).toBe(false)
  })

  it('ü 粘贴命中构建期 v 键：曙光女神 t 含 shuguangnvshen', () => {
    expect(matchesQuery(leona, 'nv')).toBe(true)
    expect(matchesQuery(leona, 'nü')).toBe(true)
    expect(matchesQuery(leona, '曙光女神')).toBe(true)
  })

  it('p 字段不参与匹配（口径契约：p 是 n 的子集）', () => {
    const onlyP = { id: 1, search: { n: [], t: [], p: ['yasuo'], f: [] } }
    expect(matchesQuery(onlyP, 'yasuo')).toBe(false)
  })

  it('无命中返回 false', () => {
    expect(matchesQuery(yasuo, 'zzzz')).toBe(false)
    expect(matchesQuery(yasuo, '锤石')).toBe(false)
  })

  it('空查询恒真（交由 filterHeroes 短路）', () => {
    expect(matchesQuery(yasuo, '')).toBe(true)
  })
})

describe('filterHeroes', () => {
  it('按查询过滤且保持原顺序', () => {
    expect(filterHeroes(heroes, 'ys')).toEqual([yasuo])
    expect(filterHeroes(heroes, 'shuguangnvshen')).toEqual([leona])
    expect(filterHeroes(heroes, '157')).toEqual([yasuo])
  })

  it('空查询返回全量', () => {
    expect(filterHeroes(heroes, '')).toEqual(heroes)
  })

  it('无命中返回空数组', () => {
    expect(filterHeroes(heroes, 'zzzz')).toEqual([])
  })

  it('保留 hero 上检索字段以外的属性（泛型透传，不做对象裁剪）', () => {
    const withName = { ...yasuo, name: '亚索' }
    const out = filterHeroes([withName], 'ys')
    expect(out).toEqual([{ ...yasuo, name: '亚索' }])
  })
})
