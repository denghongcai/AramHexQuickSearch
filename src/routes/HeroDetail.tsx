import type { ReactNode } from 'react'
import { Link, useParams } from '@tanstack/react-router'

import { AugmentTable } from '@/components/hero/AugmentTable'
import { BandBars } from '@/components/hero/BandBars'
import { BuildPanel } from '@/components/hero/BuildPanel'
import { SpellList } from '@/components/hero/SpellList'
import { useHero, useHeroes } from '@/lib/api'
import { formatCount } from '@/lib/format'
import { TIER_BG } from '@/lib/tier'

/** 桌面两栏（左宽：出装流派 + 海克斯表 / 右窄 320px：召唤师技能 + 分段）的骨架，加载与正常态共用 */
function DetailSkeletonGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[minmax(0,1fr)]">
      {children}
    </div>
  )
}

/** 加载占位：静态 JSON 通常一闪而过，只给块级骨架 */
function PendingPage() {
  return (
    <section className="flex flex-col gap-3 p-3 lg:h-full">
      <div className="h-[76px] shrink-0 animate-pulse rounded-xl border border-edge bg-panel" />
      <DetailSkeletonGrid>
        <div className="animate-pulse rounded-xl border border-edge bg-panel" />
        <div className="flex flex-col gap-3">
          {[5, 4, 6].map((rows, i) => (
            <div key={i} className="space-y-1.5 rounded-xl border border-edge bg-panel p-3">
              {Array.from({ length: rows }, (_, j) => (
                <div key={j} className="h-4 animate-pulse rounded bg-edge/40" />
              ))}
            </div>
          ))}
        </div>
      </DetailSkeletonGrid>
    </section>
  )
}

/** 错误态：404（不存在/无数据）与其它错误分开文案，给返回入口，不白屏 */
function ErrorPage({ id, missing }: { id: string; missing: boolean }) {
  return (
    <section className="p-3">
      <div className="rounded-xl border border-edge bg-panel p-8 text-center">
        <p className="text-sm text-tier-d">
          {missing ? `英雄 #${id} 不存在或暂无数据` : '英雄数据加载失败，请刷新重试'}
        </p>
        <Link
          to="/"
          className="mt-4 inline-block rounded-lg border border-edge px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-accent"
        >
          ← 返回英雄榜
        </Link>
      </div>
    </section>
  )
}

/**
 * /hero/$id 英雄详情（Task 11，布局按用户反馈重排）：
 * lg —— 头部一行 + 左宽右窄两栏：左栏出装流派在上、海克斯表填满剩余高度（面板内微滚），
 *       右栏召唤师技能 + 分段胜率；整页一屏。
 * <lg —— 单列文档流：头部 → 出装流派 → 海克斯表 → 召唤师技能 → 分段，BottomNav 不变。
 */
export function HeroDetailPage() {
  const { id } = useParams({ from: '/hero/$id' })
  const heroQ = useHero(id)
  // 详情 JSON 不含 tier：S 色片用英雄榜（rail 已缓存，无额外请求）里的档位补上
  const tier = useHeroes().data?.heroes.find((hero) => String(hero.id) === id)?.tier

  if (heroQ.isPending) return <PendingPage />
  if (heroQ.isError) {
    const message = heroQ.error instanceof Error ? heroQ.error.message : String(heroQ.error)
    return <ErrorPage id={id} missing={message.includes('404')} />
  }

  const hero = heroQ.data

  return (
    <section className="flex flex-col gap-3 p-3 lg:h-full">
      {/* 头部：图标 名称 称号 S色片 胜率 登场率 场次 名次 */}
      <header className="flex shrink-0 items-center gap-3 rounded-xl border border-edge bg-panel p-3">
        <img
          src={hero.icon}
          alt={`${hero.name} ${hero.title}`}
          draggable={false}
          referrerPolicy="no-referrer"
          className="size-12 shrink-0 rounded-lg border border-edge bg-ink object-cover"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold leading-6 lg:text-2xl lg:leading-8">{hero.name}</h1>
            {tier && (
              <span
                title={`Tier ${tier}`}
                className={`grid size-5 shrink-0 place-items-center rounded-md text-[11px] font-bold text-ink ${
                  TIER_BG[tier] ?? 'bg-tier-c'
                }`}
              >
                {tier}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted lg:text-[15px]">{hero.title}</p>
        </div>
        <dl className="ml-auto flex shrink-0 items-end gap-3 text-xs sm:gap-4 lg:text-sm">
          <div className="text-right">
            <dt className="text-muted">胜率</dt>
            <dd className="mt-0.5 font-tnum text-base font-semibold leading-5 tabular-nums text-accent lg:text-lg">
              {hero.ranking.winRate.toFixed(2)}%
            </dd>
          </div>
          <div className="text-right">
            <dt className="text-muted">登场率</dt>
            <dd className="mt-0.5 font-tnum leading-5 tabular-nums">{hero.ranking.pickRate.toFixed(2)}%</dd>
          </div>
          <div className="text-right">
            <dt className="text-muted">场次</dt>
            <dd className="mt-0.5 font-tnum leading-5 tabular-nums">{formatCount(hero.ranking.games)}</dd>
          </div>
          <div className="hidden text-right sm:block">
            <dt className="text-muted">名次</dt>
            <dd className="mt-0.5 font-tnum leading-5 tabular-nums">#{hero.ranking.rank}</dd>
          </div>
        </dl>
      </header>

      <DetailSkeletonGrid>
        {/* 左宽栏：出装流派（自然高）在上 → 海克斯表 flex-1 填满剩余、面板内微滚。
            ⚠️ 两个组件是同父兄弟，key 必须带不同前缀——同 key 兄弟会让 React 在
            切英雄时错误复用/残留节点（生产事故：出装面板随切换不断堆叠，
            且生产版 React 不输出重复 key 警告） */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-hidden">
          <BuildPanel key={`build-${hero.id}`} builds={hero.builds} className="shrink-0" />
          <AugmentTable key={`augments-${hero.id}`} hero={hero} className="min-h-0 flex-1" />
        </div>
        {/* 右窄栏：召唤师技能 Top5 → 分段胜率（短面板，自然高堆叠） */}
        <div className="flex min-h-0 flex-col gap-3">
          <SpellList spells={hero.spells} />
          <BandBars bands={hero.bands} />
        </div>
      </DetailSkeletonGrid>
    </section>
  )
}
