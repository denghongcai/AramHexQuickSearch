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

describe('buildSearchKeys 社区别名（海斗 guides[].aliases）', () => {
  // 布兰德(63) 真实别名口径（海斗 index 实测）：中文名 / 拼全称 / 拉丁混排
  const brandAliases = ['布兰德', '复仇焰魂', 'Brand', '火男', 'huo', 'huonan', 'bu', 'bulande', 'fuchouyanhun', '烤肉', 'kaorou']
  const keys = buildSearchKeys({ name: '布兰德', title: '复仇焰魂', alias: 'Brand', aliases: brandAliases })

  it('字段名仍固定 n/t/p/f（前端 matcher 零改动）', () => {
    expect(Object.keys(keys)).toEqual(['n', 't', 'p', 'f'])
  })

  it('CJK 别名进 n：词本身 + 全拼（火男→huonan、烤肉→kaorou、布兰德→bulande 修复全拼缺口）', () => {
    for (const term of ['火男', 'huonan', '烤肉', 'kaorou', '布兰德', 'bulande', '复仇焰魂', 'fuchouyanhun']) {
      expect(keys.n).toContain(term)
    }
  })

  it('CJK 别名首字母进 f（火男→hn、烤肉→kr）', () => {
    expect(keys.f).toContain('hn')
    expect(keys.f).toContain('kr')
    expect(keys.f).toContain('bld')
  })

  it('拉丁别名进 n（前端只匹配 n/t/f，不进 n 就搜不到）与 p', () => {
    for (const term of ['brand', 'huo', 'huonan', 'bu', 'bulande', 'fuchouyanhun', 'kaorou']) {
      expect(keys.n).toContain(term)
      expect(keys.p).toContain(term)
    }
  })

  it('CJK 别名不进 p（p 仍只收纯拉丁词项）', () => {
    expect(keys.p).not.toContain('火男')
    expect(keys.p).not.toContain('烤肉')
  })

  it('别名拉丁大写归一（HuoNan → huonan）', () => {
    const upper = buildSearchKeys({ name: '布兰德', title: '复仇焰魂', aliases: ['HuoNan'] })
    expect(upper.n).toContain('huonan')
    expect(upper.p).toContain('huonan')
  })

  it('亚索外号：风男/压缩进 n，fn 进 f；压缩全拼 yasuo 与拉丁名去重', () => {
    const yasuo = buildSearchKeys({ name: '亚索', title: '疾风剑豪', alias: 'Yasuo', aliases: ['风男', '压缩', 'fengnan'] })
    expect(yasuo.n).toEqual(['亚索', 'yasuo', '疾风剑豪', 'jifengjianhao', '风男', 'fengnan', '压缩'])
    expect(yasuo.f).toEqual(['ys', 'jfjh', 'fn'])
    // p 只收纯拉丁词项：疾风剑豪全拼来自称号（进 n/t），不是拉丁词项
    expect(yasuo.p).toEqual(['yasuo', 'fengnan'])
  })

  it('向后兼容钉：无 aliases（缺省 / undefined / 空数组）输出与旧版完全一致', () => {
    const legacy = { n: ['亚索', 'yasuo'], t: ['疾风剑豪', 'jifengjianhao'], p: ['yasuo'], f: ['ys', 'jfjh'] }
    expect(buildSearchKeys({ name: '亚索', title: '疾风剑豪', alias: 'Yasuo' })).toEqual(legacy)
    expect(buildSearchKeys({ name: '亚索', title: '疾风剑豪', alias: 'Yasuo', aliases: undefined })).toEqual(legacy)
    expect(buildSearchKeys({ name: '亚索', title: '疾风剑豪', alias: 'Yasuo', aliases: [] })).toEqual(legacy)
  })

  it('fail-fast：aliases 非数组或词项非字符串时报错', () => {
    expect(() => buildSearchKeys({ name: '亚索', title: '疾风剑豪', aliases: '风男' })).toThrow(/aliases/)
    expect(() => buildSearchKeys({ name: '亚索', title: '疾风剑豪', aliases: [42] })).toThrow(/aliases/)
    expect(() => buildSearchKeys({ name: '亚索', title: '疾风剑豪', aliases: [null] })).toThrow(/aliases/)
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
