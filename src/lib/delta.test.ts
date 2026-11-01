import { describe, expect, it } from 'vitest'

import { deltaClass, formatDelta, ppDelta } from './delta'

describe('ppDelta（百分数直接相减）', () => {
  it('正差：海克斯胜率高于英雄全体（真实数据场景，需消浮点尾差）', () => {
    // 157 棱彩「秘术冲拳」65.64 vs 亚索全体 58.36
    expect(ppDelta(65.64, 58.36)).toBe(7.28)
  })

  it('负差', () => {
    expect(ppDelta(55.1, 58.36)).toBe(-3.26)
  })

  it('相同胜率差为 0', () => {
    expect(ppDelta(58.36, 58.36)).toBe(0)
  })

  it('两位小数尾差归整（0.030000000000001137 → 0.03）', () => {
    expect(ppDelta(50.1, 50.07)).toBe(0.03)
  })
})

describe('deltaClass（±2pp 分色）', () => {
  it('>+2pp accent 绿', () => {
    expect(deltaClass(7.28)).toBe('text-accent')
    expect(deltaClass(2.01)).toBe('text-accent')
  })

  it('<-2pp tier-d 红', () => {
    expect(deltaClass(-3.26)).toBe('text-tier-d')
    expect(deltaClass(-2.01)).toBe('text-tier-d')
  })

  it('±2pp 内（含边界）中性 muted', () => {
    expect(deltaClass(2)).toBe('text-muted')
    expect(deltaClass(-2)).toBe('text-muted')
    expect(deltaClass(0)).toBe('text-muted')
  })
})

describe('formatDelta（带符号两位小数）', () => {
  it('正数带 +', () => {
    expect(formatDelta(7.28)).toBe('+7.28')
  })

  it('负数自带 -，不加 +', () => {
    expect(formatDelta(-3.26)).toBe('-3.26')
  })

  it('0 显示 0.00', () => {
    expect(formatDelta(0)).toBe('0.00')
  })

  it('整数补齐两位小数', () => {
    expect(formatDelta(2)).toBe('+2.00')
  })
})
