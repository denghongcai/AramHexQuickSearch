import { describe, expect, it } from 'vitest'

import { buildSearchKeys, normalize } from '../scripts/lib/search.mjs'

// 所有拼音期望值均按 pinyin-pro@3.29.5 实测输出钉死（多音字取库内最常用音，
// ü 一律转 v）。库升级后若快照不符，先跑探针核对再改期望。

describe('normalize', () => {
  it('NFKC 折叠全角/罗马数字，再转小写', () => {
    expect(normalize('ＹＡＳＵＯ')).toBe('yasuo')
    expect(normalize('Ⅷ')).toBe('viii')
    expect(normalize('YASUO')).toBe('yasuo')
  })

  it('去掉 a-z0-9 和 CJK 以外的一切（空格/标点/emoji）', () => {
    expect(normalize("Kai'Sa")).toBe('kaisa')
    expect(normalize('亚 索-123')).toBe('亚索123')
    expect(normalize('Annie🔥')).toBe('annie')
  })

  it('CJK 与数字原样保留', () => {
    expect(normalize('亚索')).toBe('亚索')
    expect(normalize('100011')).toBe('100011')
  })

  it('空串与非匹配字符串归为空串', () => {
    expect(normalize('')).toBe('')
    expect(normalize('!!!·••')).toBe('')
  })
})

describe('buildSearchKeys 亚索', () => {
  const keys = buildSearchKeys({ name: '亚索', title: '疾风剑豪', alias: 'Yasuo' })

  it('四字段齐全，字段名固定为 n/t/p/f', () => {
    expect(Object.keys(keys)).toEqual(['n', 't', 'p', 'f'])
  })

  it('n = 规范化中文名 + 规范化拉丁别名', () => {
    expect(keys.n).toEqual(['亚索', 'yasuo'])
  })

  it('t = 规范化称号 + 称号全拼', () => {
    expect(keys.t).toEqual(['疾风剑豪', 'jifengjianhao'])
  })

  it('p = 规范化拉丁别名', () => {
    expect(keys.p).toEqual(['yasuo'])
  })

  it('f = name 全拼首字母 + title 全拼首字母', () => {
    expect(keys.f).toEqual(['ys', 'jfjh'])
  })

  it('输出可 JSON 序列化（下游产物直接入库）', () => {
    expect(JSON.parse(JSON.stringify(keys))).toEqual(keys)
  })
})

describe('buildSearchKeys 多音字与 ü（按库真实行为钉值）', () => {
  it('蕾欧娜：欧→ou，首字母是 lon 而非 lun；称号 女神→nv（ü 转 v）', () => {
    expect(buildSearchKeys({ name: '蕾欧娜', title: '曙光女神', alias: 'Leona' })).toEqual({
      n: ['蕾欧娜', 'leona'],
      t: ['曙光女神', 'shuguangnvshen'],
      p: ['leona'],
      f: ['lon', 'sgns'],
    })
  })

  it('锤石：库默认读 chuishi（多音字以 pinyin-pro 默认读音为准）', () => {
    expect(buildSearchKeys({ name: '锤石', title: '魂锁典狱长', alias: 'Thresh' })).toEqual({
      n: ['锤石', 'thresh'],
      t: ['魂锁典狱长', 'hunsuodianyuchang'],
      p: ['thresh'],
      f: ['cs', 'hsdyc'],
    })
  })

  it('空 alias：n 只剩中文名，p 为空数组，t/f 不受影响', () => {
    expect(buildSearchKeys({ name: '亚索', title: '疾风剑豪', alias: '' })).toEqual({
      n: ['亚索'],
      t: ['疾风剑豪', 'jifengjianhao'],
      p: [],
      f: ['ys', 'jfjh'],
    })
    expect(buildSearchKeys({ name: '亚索', title: '疾风剑豪' }).p).toEqual([])
  })

  it('纯英文名：n 单项、p 为空数组；拉丁串逐字母过 pinyin，f 即整串（库真实行为）', () => {
    expect(buildSearchKeys({ name: 'Yasuo', title: '疾风剑豪' })).toEqual({
      n: ['yasuo'],
      t: ['疾风剑豪', 'jifengjianhao'],
      p: [],
      f: ['yasuo', 'jfjh'],
    })
  })

  it('去重：alias 与 name 相同、或称号本身就是拉丁串时，对应字段不重复', () => {
    expect(buildSearchKeys({ name: 'Yasuo', title: '疾风剑豪', alias: 'Yasuo' }).n).toEqual(['yasuo'])
    expect(buildSearchKeys({ name: '亚索', title: 'Yasuo', alias: 'Yasuo' }).t).toEqual(['yasuo'])
  })
})

describe('buildSearchKeys fail-fast', () => {
  it('name 缺失/规范化为空时报错（报出字段与原值）', () => {
    expect(() => buildSearchKeys({ title: '疾风剑豪' })).toThrow(/name/)
    expect(() => buildSearchKeys({ name: '', title: '疾风剑豪' })).toThrow(/name/)
    expect(() => buildSearchKeys({ name: '!!!', title: '疾风剑豪' })).toThrow(/!!!/)
  })

  it('title 缺失/规范化为空时报错', () => {
    expect(() => buildSearchKeys({ name: '亚索' })).toThrow(/title/)
    expect(() => buildSearchKeys({ name: '亚索', title: '···' })).toThrow(/title/)
  })

  it('alias 可缺省，但出现非字符串时拒绝（防上游结构漂移）', () => {
    expect(() => buildSearchKeys({ name: '亚索', title: '疾风剑豪', alias: null })).not.toThrow()
    expect(() => buildSearchKeys({ name: '亚索', title: '疾风剑豪', alias: 42 })).toThrow(/alias/)
  })

  it('name 非字符串直接报错', () => {
    expect(() => buildSearchKeys({ name: 157, title: '疾风剑豪' })).toThrow(/name/)
    expect(() => buildSearchKeys()).toThrow(/name/)
  })
})
