import { useMemo, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { TierBar } from '@/components/TierBar'
import {
  useAugments,
  useFamilies,
  useHeroes,
  useMeta,
  type AugmentRow,
  type HeroRow,
  type ItemFamily,
} from '@/lib/api'
import { formatCount } from '@/lib/format'
import { RARITY_DOT, RARITY_LABEL } from '@/lib/rarity'
import { TIER_BG } from '@/lib/tier'

/** 面板骨架：圆角描边卡 + 小标题（正常一屏放得下；内容超高时由 main 的 lg 内滚兜底） */
function Panel({
  title,
  aside,
  children,
  className = '',
}: {
  title: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`flex min-h-0 min-w-0 flex-col rounded-xl border border-edge bg-panel p-3 ${className}`}>
      <h2 className="mb-1.5 flex shrink-0 items-center justify-between gap-2 text-xs font-semibold text-muted">
        <span className="truncate">{title}</span>
        {aside}
      </h2>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}

/** 加载占位（数据为静态 JSON，通常一闪而过） */
function PendingRows({ rows }: { rows: number }) {
  return (
    <ul className="space-y-0.5">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="h-6 animate-pulse rounded-md bg-edge/40" />
      ))}
    </ul>
  )
}

/** Top10 英雄迷你榜行：rank/图标/名称/tier/胜率，整行导航到 /hero/$id */
function TopHeroRow({ hero }: { hero: HeroRow }) {
  return (
    <li>
      <Link
        to="/hero/$id"
        params={{ id: String(hero.id) }}
        className="flex items-center gap-2 rounded-md px-1.5 py-0.5 text-xs hover:bg-edge/25"
      >
        <span className="w-5 shrink-0 text-right font-tnum text-[11px] tabular-nums text-muted">
          {hero.rank}
        </span>
        <img
          src={hero.icon}
          alt=""
          loading="lazy"
          draggable={false}
          referrerPolicy="no-referrer"
          className="size-5 shrink-0 rounded-md border border-edge bg-ink object-cover"
        />
        <span className="min-w-0 flex-1 truncate">{hero.name}</span>
        <span
          className={`grid size-4 shrink-0 place-items-center rounded text-[10px] font-bold text-ink ${
            TIER_BG[hero.tier] ?? 'bg-tier-c'
          }`}
        >
          {hero.tier}
        </span>
        <span className="w-10 shrink-0 text-right font-tnum tabular-nums">{hero.winRate}%</span>
      </Link>
    </li>
  )
}

/** Top10 海克斯迷你榜行：rank/名称/稀有度色点/胜率/场次 */
function TopAugmentRow({ augment }: { augment: AugmentRow }) {
  return (
    <li className="flex items-center gap-2 px-1.5 py-0.5 text-xs">
      <span className="w-5 shrink-0 text-right font-tnum text-[11px] tabular-nums text-muted">
        {augment.rank}
      </span>
      <span
        title={RARITY_LABEL[augment.rarity] ?? augment.rarity}
        aria-label={RARITY_LABEL[augment.rarity] ?? augment.rarity}
        className={`size-2 shrink-0 rounded-full ${RARITY_DOT[augment.rarity] ?? 'bg-rar-silver'}`}
      />
      <span className="min-w-0 flex-1 truncate">{augment.name}</span>
      <span className="w-11 shrink-0 text-right font-tnum tabular-nums">{augment.winRate}%</span>
      <span className="w-14 shrink-0 text-right font-tnum tabular-nums whitespace-nowrap text-muted">
        {formatCount(augment.games)}
      </span>
    </li>
  )
}

/**
 * / 总览（桌面形态）：右栏一屏 grid——meta 卡、Tier 分布、两个 Top10 迷你榜、流派家族。
 * 移动端 / 由 RootLayout 渲染精简版 OverviewStrip（本组件在 <lg 下不显示）。
 */
export function OverviewPage() {
  const metaQ = useMeta()
  const heroesQ = useHeroes()
  const augmentsQ = useAugments()
  const familiesQ = useFamilies()

  const meta = metaQ.data
  const heroes = heroesQ.data?.heroes ?? []
  const topHeroes = heroes.slice(0, 10)
  const topAugments = augmentsQ.data?.augments.slice(0, 10) ?? []

  // 只渲染多件家族（items.length ≥ 2，Task 6 实测注记）。multiFamilies 是过滤后全量
  // （footnote 计数口径），展示取 buildCount 降序前 8——未来多件家族超过 8 个时，
  // 被截掉的不会误计进单件数。
  const families = familiesQ.data?.families ?? []
  const multiFamilies = useMemo(() => families.filter((f) => f.items.length >= 2), [families])
  const multiTop = useMemo(
    () => [...multiFamilies].sort((a, b) => b.buildCount - a.buildCount).slice(0, 8),
    [multiFamilies],
  )
  const singleFamilyCount = families.length - multiFamilies.length

  return (
    <section className="grid gap-3 p-3 lg:h-full lg:grid-cols-2 lg:grid-rows-[auto_auto_minmax(0,1fr)]">
      {/* 1. meta 卡 */}
      <Panel title="数据集">
        {meta ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 pt-0.5 text-xs">
            <div>
              <dt className="text-muted">版本</dt>
              <dd className="mt-0.5 font-tnum font-semibold tabular-nums text-accent">
                Patch {meta.patch}
              </dd>
            </div>
            <div>
              <dt className="text-muted">快照日期</dt>
              <dd className="mt-0.5 font-tnum tabular-nums">{meta.snapshotAt.slice(0, 10)}</dd>
            </div>
            <div>
              <dt className="text-muted">有效对局</dt>
              <dd className="mt-0.5 font-tnum tabular-nums">{formatCount(meta.gamesValid)}场</dd>
            </div>
            <div>
              <dt className="text-muted">英雄</dt>
              <dd className="mt-0.5 font-tnum tabular-nums">{meta.heroCount} 名</dd>
            </div>
          </dl>
        ) : (
          <PendingRows rows={2} />
        )}
      </Panel>

      {/* 2. Tier 分布条（桌面 / 移动端共用组件） */}
      <Panel title="Tier 分布">
        <TierBar heroes={heroes} className="pt-0.5" />
        <p className="mt-1 truncate text-[11px] text-muted">
          {meta?.tierRule ?? '按胜率分位切档，详见「关于」页'}
        </p>
      </Panel>

      {/* 3. Top10 英雄迷你榜（行点击 → /hero/$id） */}
      <Panel title="英雄胜率 Top10">
        {heroesQ.isPending ? (
          <PendingRows rows={10} />
        ) : heroesQ.isError ? (
          <p className="px-1.5 py-2 text-xs text-tier-d">英雄榜加载失败，请刷新重试。</p>
        ) : (
          <ul className="space-y-0.5">
            {topHeroes.map((hero) => (
              <TopHeroRow key={hero.id} hero={hero} />
            ))}
          </ul>
        )}
      </Panel>

      {/* 4. Top10 海克斯迷你榜（标题 → /augments） */}
      <Panel
        title={
          <Link to="/augments" className="hover:text-accent">
            海克斯胜率 Top10
          </Link>
        }
      >
        {augmentsQ.isPending ? (
          <PendingRows rows={10} />
        ) : augmentsQ.isError ? (
          <p className="px-1.5 py-2 text-xs text-tier-d">海克斯榜加载失败，请刷新重试。</p>
        ) : (
          <ul className="space-y-0.5">
            {topAugments.map((augment) => (
              <TopAugmentRow key={augment.id} augment={augment} />
            ))}
          </ul>
        )}
      </Panel>

      {/* 5. 流派家族概览（只渲染多件家族，占满第三行） */}
      <Panel
        title="流派家族 · 多件组合"
        aside={<span className="shrink-0 font-normal">核心位聚类 · 套数 = 覆盖出装数</span>}
        className="lg:col-span-2"
      >
        {familiesQ.isPending ? (
          <PendingRows rows={5} />
        ) : familiesQ.isError ? (
          <p className="px-1.5 py-2 text-xs text-tier-d">家族数据加载失败，请刷新重试。</p>
        ) : multiTop.length === 0 ? (
          <p className="px-1.5 py-2 text-xs text-muted">本版本没有聚出多件家族。</p>
        ) : (
          <>
            <ul>
              {multiTop.map((family: ItemFamily) => (
                <li
                  key={family.id}
                  className="flex items-center gap-2 border-b border-edge/40 px-1.5 py-0.5 text-xs last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate">{family.names.slice(0, 3).join(' + ')}</span>
                  <span className="shrink-0 text-muted">{family.items.length} 件</span>
                  <span className="w-14 shrink-0 text-right font-tnum tabular-nums text-muted">
                    {family.buildCount} 套
                  </span>
                </li>
              ))}
            </ul>
            {singleFamilyCount > 0 && (
              <p className="mt-1.5 px-1.5 text-[11px] text-muted">
                另有 {singleFamilyCount} 个单件家族未列入，聚类口径见「关于」页。
              </p>
            )}
          </>
        )}
      </Panel>
    </section>
  )
}
