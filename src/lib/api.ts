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
}

export interface HeroesPayload {
  heroes: HeroRow[]
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
