/**
 * 运行时英雄匹配（与 scripts/lib/search.mjs 构建期键配套）。
 *
 * 构建期把 n（名称词项）/ t（称号词项）/ p（拉丁别名）/ f（首字母）写进
 * heroes.json 的 hero.search；本模块只负责把用户查询归一成同一口径，
 * 再做子串（includes）匹配。p 是 n 的子集，不参与匹配。
 */

/** 检索词项最小结构（heroes.json 里 hero.search 的参与字段） */
export interface SearchKeys {
  n: string[]
  t: string[]
  f: string[]
}

/**
 * 查询串归一，与构建期 normalize 同口径：
 * NFKC → toLocaleLowerCase('zh-CN') → 保留 a-z0-9、CJK 与 ü、去其余 → ü→v。
 * ü 单独放行再转 v：构建期拼音键里存的是 v（如 shuguangnvshen），
 * 用户键盘/输入法粘贴 nü 也要能命中。
 */
export function normalizeQuery(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[^a-z0-9ü㐀-鿿]/g, '')
    .replaceAll('ü', 'v')
}

/**
 * 单英雄匹配：归一后查询对 search.n/t/f 任一词项 includes 即命中；
 * 纯数字查询额外匹配 String(hero.id)（输入 157 找到亚索）。
 * 空查询恒真（= 不过滤）。
 */
export function matchesQuery(
  hero: { id: number; search: SearchKeys },
  query: string,
): boolean {
  const q = normalizeQuery(query)
  if (!q) return true
  if (/^\d+$/.test(q) && String(hero.id).includes(q)) return true
  return (
    hero.search.n.some((k) => k.includes(q)) ||
    hero.search.t.some((k) => k.includes(q)) ||
    hero.search.f.some((k) => k.includes(q))
  )
}

/** 全量过滤；空查询原样返回（全量 173 行），命中项保持榜单原顺序。 */
export function filterHeroes<T extends { id: number; search: SearchKeys }>(
  heroes: T[],
  query: string,
): T[] {
  const q = normalizeQuery(query)
  if (!q) return heroes
  return heroes.filter((hero) => matchesQuery(hero, q))
}
