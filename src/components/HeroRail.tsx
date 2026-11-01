import { memo, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useRouter, useRouterState, useSearch } from '@tanstack/react-router'
import { heroQuery, useHeroes, type HeroRow } from '@/lib/api'
import { filterHeroes } from '@/lib/search'
import { TIER_BG } from '@/lib/tier'

/** memo：hero 引用来自 React Query 缓存（稳定），导航时只有 active 布尔变化的行重渲染 */
const HeroItem = memo(function HeroItem({ hero }: { hero: HeroRow }) {
  const queryClient = useQueryClient()
  // 布尔 selector：导航时只让受影响的 2 行（旧高亮 + 新高亮）重渲染，而非全列表
  const active = useRouterState({
    select: (s) => s.location.pathname === `/hero/${hero.id}`,
  })
  // hover / 聚焦时预取详情，点进详情页即秒开
  const prefetch = () => void queryClient.prefetchQuery(heroQuery(hero.id))

  return (
    <li>
      <Link
        to="/hero/$id"
        params={{ id: String(hero.id) }}
        onMouseEnter={prefetch}
        onFocus={prefetch}
        className={`flex items-center gap-2 border-l-2 py-2 pl-3 pr-2 text-sm lg:text-[15px] ${
          active ? 'border-accent bg-edge/40' : 'border-transparent hover:bg-edge/25'
        }`}
      >
        <span className="w-7 shrink-0 text-right font-tnum text-xs tabular-nums text-muted">
          #{hero.rank}
        </span>
        <img
          src={hero.icon}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          className="size-8 shrink-0 rounded-lg border border-edge bg-ink object-cover"
        />
        <span className="min-w-0 flex-1 truncate">{hero.name}</span>
        <span
          className={`grid size-5 shrink-0 place-items-center rounded-md text-[11px] font-bold text-ink ${
            TIER_BG[hero.tier] ?? 'bg-tier-c'
          }`}
        >
          {hero.tier}
        </span>
        <span className="w-14 shrink-0 text-right font-tnum text-xs font-semibold tabular-nums">
          {hero.winRate}%
        </span>
        <span className="w-12 shrink-0 text-right font-tnum text-xs tabular-nums text-muted">
          {hero.pickRate}%
        </span>
      </Link>
    </li>
  )
})

/**
 * 英雄榜栏：搜索框 + 英雄列表。
 * lg 下占 360px 左栏、列表内部滚动；<lg 下全宽、随页面滚动（无内滚）。
 * 查询词落在 ?q=（根路由 validateSearch），replace 写入不产生历史记录，
 * 刷新/分享/后退都能还原过滤态。
 *
 * IME 组合守卫（修复中文输入法拼音散架）：输入受控值是本地镜像 localQ，
 * URL ?q= 只在组合结束（compositionend）后才同步——组合期间的 onChange 只更新
 * 镜像、不 navigate（每次 navigate 重渲染都会重置 input value，把组合中的拼音
 * 打散成纯英文）。Chrome 系 input 先于 compositionend、Safari 反序，两条路径
 * 都会收敛到一次 URL 同步（onCompositionEnd 用当前输入框全值兜底），行为一致。
 */
export function HeroRail({ className = '' }: { className?: string }) {
  const { data, isPending, isError } = useHeroes()
  // router.navigate 不带 from：search-only 更新停在当前路径（详情页里打字不丢 /hero/$id）
  const router = useRouter()
  const { q } = useSearch({ strict: false }) as { q?: string }

  // 组合中的标记用 ref（不触发渲染）；镜像 state 驱动输入框，组合期间 URL 不动
  const composingRef = useRef(false)
  const [localQ, setLocalQ] = useState(q ?? '')

  const syncToUrl = (value: string) =>
    void router.navigate({
      // '.' = 停在当前路径；函数式更新保留其他 search 参数；空串摘掉 q，URL 回到干净状态
      to: '.',
      search: (prev) => ({ ...prev, q: value || undefined }),
      replace: true,
    })

  // 外部回灌：浏览器前进/后退、原生 × 清空等外部变化改写了 URL 的 q 时镜像回
  // 本地；比较后才 set（q 与镜像本就一致时不动作），且组合期间绝不回灌（防抖动
  // 与打字覆盖）
  useEffect(() => {
    if (!composingRef.current && (q ?? '') !== localQ) setLocalQ(q ?? '')
  }, [q, localQ])

  const heroes = data?.heroes ?? []
  const visible = filterHeroes(heroes, q ?? '')

  return (
    <aside className={`flex min-h-0 min-w-0 flex-col bg-panel ${className}`}>
      <div className="p-3">
        <input
          type="search"
          value={localQ}
          onChange={(e) => {
            const value = e.target.value
            setLocalQ(value)
            // 组合期间的中间拼音（如 "huo'nang"）不进 URL；组合结束后由
            // onCompositionEnd 统一同步（Safari 反序时 composing 已复位，这里照常同步）
            if (!composingRef.current) syncToUrl(value)
          }}
          onCompositionStart={() => {
            composingRef.current = true
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false
            // 用当前输入框全值（而非 e.data）同步：覆盖多次组合拼接的完整查询
            syncToUrl(e.currentTarget.value)
          }}
          aria-label="搜索英雄 / 拼音 / 别名"
          placeholder="搜索英雄 / 拼音 / 别名"
          className="w-full rounded-lg border border-edge bg-ink px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent lg:text-[15px]"
        />
      </div>

      {isPending ? (
        <ul className="space-y-2 p-3">
          {Array.from({ length: 12 }, (_, i) => (
            <li key={i} className="h-12 animate-pulse rounded-lg bg-edge/40" />
          ))}
        </ul>
      ) : isError ? (
        <p className="p-4 text-sm text-tier-d">英雄榜加载失败，请刷新重试。</p>
      ) : visible.length === 0 ? (
        <p className="p-4 text-sm text-muted" role="status">
          没有匹配「{q}」的英雄
        </p>
      ) : (
        <ul className="min-h-0 flex-1 pb-(--bottom-nav-h) lg:overflow-y-auto lg:pb-2">
          {visible.map((hero) => (
            <HeroItem key={hero.id} hero={hero} />
          ))}
        </ul>
      )}
    </aside>
  )
}
