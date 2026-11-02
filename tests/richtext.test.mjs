import { describe, it, expect } from 'vitest'
import { stripRichTags, richTextSegments, augmentTipSegments, itemTipSegments } from '../scripts/lib/richtext.mjs'

describe('stripRichTags（纯文本场景：aria/标题）', () => {
  it('剥样式标签保留内部文字（kiwi desc 形态）', () => {
    expect(
      stripRichTags('变为近战状态，并且获得<physicalDamage>攻击力</physicalDamage>、<healing>生命值</healing>'),
    ).toBe('变为近战状态，并且获得攻击力、生命值')
  })

  it('items.js description：<br> 转空格防止属性名粘连', () => {
    expect(
      stripRichTags('<mainText><stats><attention>50</attention>攻击力<br><attention>45%</attention>攻击速度</stats></mainText>'),
    ).toBe('50攻击力 45%攻击速度')
  })

  it('剔除 @变量@ 占位符（无上游数值可填）', () => {
    expect(stripRichTags('每@Stacks_Max@层获得增益')).toBe('每层获得增益')
  })

  it('非字符串输入返回空串', () => {
    expect(stripRichTags(null)).toBe('')
    expect(stripRichTags(undefined)).toBe('')
    expect(stripRichTags(123)).toBe('')
  })
})

describe('richTextSegments（分段解析，hl = 游戏内高亮段）', () => {
  it('items.js description：数值段高亮、<br> 拆行（\\n 保留）', () => {
    expect(
      richTextSegments('<mainText><stats><attention>50</attention>攻击力<br><attention>45%</attention>攻击速度</stats></mainText>'),
    ).toEqual([
      { text: '50', hl: true },
      { text: '攻击力\n' },
      { text: '45%', hl: true },
      { text: '攻击速度' },
    ])
  })

  it('结构容器（mainText/stats）不产生分段；被动名换行独立成节', () => {
    expect(richTextSegments('<mainText><passive>熟能生巧</passive><br>攻击时永久成长。</mainText>')).toEqual([
      { text: '\n熟能生巧', hl: true },
      { text: '\n攻击时永久成长。' },
    ])
  })

  it('kiwi desc 的 scale/healing 标签段高亮，@占位符剔除', () => {
    expect(richTextSegments('每@Stacks_Max@层获得<scaleAF>适应之力</scaleAF>')).toEqual([
      { text: '每层获得' },
      { text: '适应之力', hl: true },
    ])
  })

  it('纯文本输入 → 单段无 hl', () => {
    expect(richTextSegments('略微提升移动速度')).toEqual([{ text: '略微提升移动速度' }])
  })

  it('非字符串输入返回空数组', () => {
    expect(richTextSegments(null)).toEqual([])
    expect(richTextSegments(undefined)).toEqual([])
  })
})

describe('augmentTipSegments', () => {
  it('tooltip（纯文本）优先，输出单段', () => {
    expect(augmentTipSegments({ tooltip: '纯文本提示', desc: '<b>富文本</b>' })).toEqual([{ text: '纯文本提示' }])
  })

  it('tooltip 缺失时 desc 富文本解析兜底', () => {
    expect(augmentTipSegments({ desc: '获得<attention>攻击力</attention>' })).toEqual([
      { text: '获得', },
      { text: '攻击力', hl: true },
    ])
  })

  it('非对象/皆缺返回空数组', () => {
    expect(augmentTipSegments(null)).toEqual([])
    expect(augmentTipSegments({})).toEqual([])
  })
})

describe('itemTipSegments', () => {
  it('description 富文本解析优先（完整属性）', () => {
    expect(itemTipSegments({ description: '<mainText><attention>25</attention>移动速度</mainText>', plaintext: '短摘要' })).toEqual([
      { text: '25', hl: true },
      { text: '移动速度' },
    ])
  })

  it('description 为空时 plaintext 单段兜底', () => {
    expect(itemTipSegments({ plaintext: '略微提升移动速度' })).toEqual([{ text: '略微提升移动速度' }])
  })

  it('非对象/皆缺返回空数组', () => {
    expect(itemTipSegments({})).toEqual([])
    expect(itemTipSegments(null)).toEqual([])
  })
})
