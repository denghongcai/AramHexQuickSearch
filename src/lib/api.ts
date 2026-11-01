import { useQuery } from '@tanstack/react-query'

/** 请求 /data 下的静态 JSON（数据管线产物，随 public/ 拷贝） */
export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${path}`)
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
