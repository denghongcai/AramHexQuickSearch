import { useQuery } from '@tanstack/react-query'

/** 请求 /data 下的静态 JSON（数据管线产物，随 public/ 拷贝） */
export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${path}`)
  // vite dev 的 SPA fallback 会把不存在的 /data 路径回成 index.html（200 + text/html），
  // 这里拦成与线上 404 同文案的错误，调用方按「不存在」处理而不是 JSON 解析报错
  if (!(res.headers.get('content-type') ?? '').includes('json')) {
    throw new Error(`请求失败 404: ${path}`)
  }
  return (await res.json()) as T
}

/** meta.json：数据集版本信息 */
export interface Meta {
  patch: string
  snapshotAt: string
  gamesValid: number
  heroCount: number
  augmentCount: number
  generatedAt: string
  tierRule: string
  sources: Record<string, unknown>
}

/** heroes.json 单行：英雄榜单行（winRate/pickRate 已是百分数，2 位小数） */
export interface HeroRow {
  id: number
  name: string
  title: string
  alias: string
  icon: string
  tier: string
  rank: number
  winRate: number
  pickRate: number
  games: number
  buildCount: number
  /** 构建期检索键（scripts/lib/search.mjs），n/t/p/f 口径见该文件 */
  search: {
    n: string[]
    t: string[]
    p: string[]
    f: string[]
  }
}

export interface HeroesPayload {
  heroes: HeroRow[]
}

/** augments.json 单行：全局海克斯排行（winRate/pickRate 已是百分数，2 位小数） */
export interface AugmentRow {
  id: number
  name: string
  rarity: 'prismatic' | 'gold' | 'silver'
  games: number
  wins: number
  winRate: number
  pickRate: number
  /** 覆盖英雄数 */
  heroCount: number
  /** 按胜率降序的名次 */
  rank: number
}

export interface AugmentsPayload {
  augments: AugmentRow[]
}

/** families.json 单行：装备共现聚类出的一个流派家族（核心位物品簇） */
export interface ItemFamily {
  id: number
  items: number[]
  names: string[]
  /** 核心位含本簇至少一件物品的出装 build 数 */
  buildCount: number
}

export interface FamiliesPayload {
  families: ItemFamily[]
  /** itemId → 家族 id 的映射（构建期产物） */
  itemFamily: Record<string, number>
}

/** hero/{id}.json：一个分段的胜率（winRate 百分数 2 位小数；段缺失则省键） */
export interface HeroBand {
  winRate: number
  games: number
}

/** hero/{id}.json：召唤师技能组合行（spells 已按 games 降序） */
export interface HeroSpellRow {
  /** 技能 id 组合，如 "4+32"（作行 key） */
  combo: string
  ids: number[]
  /** 逐段翻译的中文名（与 ids 对齐） */
  names: string[]
  games: number
  wins: number
  winRate: number
}

/** hero/{id}.json：单个海克斯在该英雄下的战绩 */
export interface HeroAugmentRow {
  id: number
  name: string
  games: number
  wins: number
  winRate: number
  /** 样本过低（构建期阈值打标），UI 需灰显降权 */
  lowSample?: boolean
}

/** hero/{id}.json：一个出装流派（winRate/pickRate 与 ranking 同口径的百分数 2 位小数） */
export interface HeroBuild {
  /** 流派标识（builds 内唯一，作 tab id） */
  key: string
  /** 流派名，如 "暴击流"（作 tab 标题） */
  name: string
  /** 该流派覆盖的对局数 */
  sampleCount: number
  /** 占该英雄对局比例（百分数 2 位小数） */
  pickRate: number
  winRate: number
  /** 玩法 tips，\n 分段 */
  summary: string
  core: { itemIds: number[]; names: string[] }
  /** 出门装名列表 */
  starter: string[]
  /** 推荐装名列表（按合成顺序） */
  recommended: string[]
}

/** hero/{id}.json：单英雄详情全量（Task 11 数据契约，不含 tier——色片由英雄榜补） */
export interface HeroDetail {
  id: number
  name: string
  title: string
  icon: string
  alias: string
  ranking: { winRate: number; pickRate: number; games: number; wins: number; rank: number }
  /** 分段胜率：all 固定有，casual/mid/top 缺段省键 */
  bands: { all?: HeroBand; casual?: HeroBand; mid?: HeroBand; top?: HeroBand }
  spells: HeroSpellRow[]
  augments: { prismatic: HeroAugmentRow[]; gold: HeroAugmentRow[]; silver: HeroAugmentRow[] }
  /** 出装流派列表；数据源不可用时为 null */
  builds: HeroBuild[] | null
}

/** 英雄详情查询：列表 hover 预取，详情页（Task 11）复用同一 queryKey */
export function heroQuery<T = unknown>(id: string | number) {
  return {
    queryKey: ['hero', String(id)] as const,
    queryFn: () => fetchJson<T>(`/data/hero/${encodeURIComponent(String(id))}.json`),
  }
}

/** 数据集版本信息 */
export function useMeta() {
  return useQuery({
    queryKey: ['meta'] as const,
    queryFn: () => fetchJson<Meta>('/data/meta.json'),
  })
}

/** 英雄榜（按 rank 升序全量） */
export function useHeroes() {
  return useQuery({
    queryKey: ['heroes'] as const,
    queryFn: () => fetchJson<HeroesPayload>('/data/heroes.json'),
  })
}

/** 单英雄详情（与列表 hover 预取共用 queryKey，点进详情即命中缓存）；任何失败最多重试 1 次（默认 3 次），尽快进错误态 */
export function useHero(id: string | number) {
  return useQuery({ ...heroQuery<HeroDetail>(id), retry: 1 })
}

/** 海克斯全局排行（按胜率降序全量） */
export function useAugments() {
  return useQuery({
    queryKey: ['augments'] as const,
    queryFn: () => fetchJson<AugmentsPayload>('/data/augments.json'),
  })
}

/** 流派家族聚类产物（总览页与详情页共用同一 queryKey 缓存） */
export function useFamilies() {
  return useQuery({
    queryKey: ['families'] as const,
    queryFn: () => fetchJson<FamiliesPayload>('/data/families.json'),
  })
}
