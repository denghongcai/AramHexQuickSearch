import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { cacheFile, haidouHeroRels, haidouHeroUrls, shouldSkipFetch } from '../scripts/fetch-sources.mjs'
import { HAIDOU_DIR } from '../scripts/lib/paths.mjs'

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

  it('英雄缓存相对路径与 URL 同源（fetchHaidou 的真实代码路径）', () => {
    const slugs = ['yasuo', 'aatrox']
    expect(haidouHeroRels(slugs)).toEqual(['data/heroes/yasuo.json', 'data/heroes/aatrox.json'])
    expect(haidouHeroUrls(slugs, 'https://haidou.zhishitft.cn')).toEqual(
      haidouHeroRels(slugs).map((rel) => `https://haidou.zhishitft.cn/${rel}`),
    )
  })
})

describe('cacheFile traversal guard', () => {
  it('safe 相对路径解析到 haidou 缓存目录内', () => {
    expect(cacheFile('data/heroes/yasuo.json')).toBe(path.join(HAIDOU_DIR, 'data', 'heroes', 'yasuo.json'))
    expect(cacheFile('data/index.json')).toBe(path.join(HAIDOU_DIR, 'data', 'index.json'))
  })

  it('拒绝路径穿越段（第三方 index 数据可能含敌意 slug）', () => {
    expect(() => cacheFile('data/heroes/../../evil.json')).toThrow(/unsafe path rejected/)
    expect(() => cacheFile('..')).toThrow(/unsafe path rejected/)
    expect(() => cacheFile('')).toThrow(/unsafe path rejected/)
  })

  it('段内含点的合法文件名不受影响', () => {
    expect(() => cacheFile('data/heroes/a..b.json')).not.toThrow()
  })
})
