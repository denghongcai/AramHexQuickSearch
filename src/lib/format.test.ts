import { describe, expect, it } from 'vitest'

import { formatCount } from './format'

describe('formatCount（万 / 亿缩写）', () => {
  it('≥1e8 用「亿」，1 位小数并去掉尾随 .0', () => {
    expect(formatCount(123456789)).toBe('1.2 亿')
    expect(formatCount(150000000)).toBe('1.5 亿')
    expect(formatCount(100000000)).toBe('1 亿')
  })

  it('≥100 万取整（对局数主口径：21169946 → 2117 万）', () => {
    expect(formatCount(21169946)).toBe('2117 万')
    expect(formatCount(10924630)).toBe('1092 万')
    expect(formatCount(1000000)).toBe('100 万')
  })

  it('1 万 ~ 100 万保留 1 位小数', () => {
    expect(formatCount(394680)).toBe('39.5 万')
    expect(formatCount(274931)).toBe('27.5 万')
    expect(formatCount(12345)).toBe('1.2 万')
    expect(formatCount(10000)).toBe('1 万')
  })

  it('<1 万原样返回', () => {
    expect(formatCount(9999)).toBe('9999')
    expect(formatCount(317)).toBe('317')
    expect(formatCount(0)).toBe('0')
  })

  it('非有限数原样字符串化（防御，正常数据不含）', () => {
    expect(formatCount(Number.NaN)).toBe('NaN')
  })
})
