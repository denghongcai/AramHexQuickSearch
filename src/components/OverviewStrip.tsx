import { Link } from '@tanstack/react-router'
import { useAugments, useHeroes, useMeta } from '@/lib/api'
import { formatCount } from '@/lib/format'
import { RARITY_DOT } from '@/lib/rarity'
import { TierBar } from '@/components/TierBar'

/**
 * 移动端精简总览条（Task 8 移动 IA 决策的落地，Task 10 实现）：
 * 仅移动端 / 渲染（挂载由 RootLayout 控制，`lg:hidden` 兜底防桌面泄漏），
 * 位于英雄榜列表上方。<details> 默认展开——summary 一行摘要
 * （patch · 有效对局数 · 英雄数），展开后是 tier 分布横条（与桌面同组件）+
 * Top5 海克斯链接；折叠后只占 summary 一行高，不挡榜单。
 */
export function OverviewStrip({ className = '' }: { className?: string }) {
  const { data: meta } = useMeta()
  const { data: heroesData } = useHeroes()
  const { data: augmentsData } = useAugments()
  const topAugments = augmentsData?.augments.slice(0, 5) ?? []

  return (
    <details open className={`border-b border-edge bg-panel px-3 py-2 ${className}`}>
      <summary className="-my-1 cursor-pointer list-none select-none py-1 text-xs text-muted [&::-webkit-details-marker]:hidden">
        {meta ? (
          <span className="font-tnum tabular-nums">
            <span className="font-semibold text-accent">{meta.patch}</span>
            <span aria-hidden="true"> · </span>
            {formatCount(meta.gamesValid)}局
            <span aria-hidden="true"> · </span>
            {meta.heroCount} 英雄
          </span>
        ) : (
          <span className="animate-pulse">总览加载中…</span>
        )}
      </summary>
      <div className="mt-2 space-y-2">
        <TierBar heroes={heroesData?.heroes ?? []} />
        <ul className="flex flex-wrap gap-1.5">
          {topAugments.map((augment) => (
            <li key={augment.id}>
              <Link
                to="/augments"
                className="flex max-w-full items-center gap-1 rounded-full border border-edge bg-ink px-2 py-0.5 text-[11px] hover:border-accent"
              >
                <span
                  aria-hidden="true"
                  title={augment.rarity}
                  className={`size-1.5 shrink-0 rounded-full ${RARITY_DOT[augment.rarity] ?? 'bg-rar-silver'}`}
                />
                <span className="max-w-28 truncate">{augment.name}</span>
                <span className="shrink-0 font-tnum tabular-nums text-muted">{augment.winRate}%</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
