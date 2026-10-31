import { describe, expect, it } from 'vitest'

import { haidouHeroUrls, shouldSkipFetch } from '../scripts/fetch-sources.mjs'

describe('fetch-sources', () => {
  it('cache 命中且未要求 FRESH 时跳过', () => {
    expect(shouldSkipFetch({ cacheExists: true, fresh: false })).toBe(true)
    expect(shouldSkipFetch({ cacheExists: true, fresh: true })).toBe(false)
    expect(shouldSkipFetch({ cacheExists: false, fresh: false })).toBe(false)
  })

  it('生成英雄 JSON 的 URL 列表', () => {
    const urls = haidouHeroUrls(['yasuo', 'aatrox'], 'https://haidou.zhishitft.cn')
    expect(urls).toEqual([
      'https://haidou.zhishitft.cn/data/heroes/yasuo.json',
      'https://haidou.zhishitft.cn/data/heroes/aatrox.json',
    ])
  })
})
