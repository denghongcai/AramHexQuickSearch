import { useMemo } from 'react'
import { useRouter, useSearch } from '@tanstack/react-router'
import { countByRarity, filterAugments, parseRarity, RARITIES, type Rarity } from '@/lib/augments'
import { GameIcon } from '@/components/GameIcon'
import { useAugments, type AugmentRow } from '@/lib/api'
import { formatCount } from '@/lib/format'
import { RARITY_DOT, RARITY_LABEL, RARITY_TEXT } from '@/lib/rarity'

/** 桌面表头单元格：吸顶 + 描边，滚动时表头不跟随滚出视口 */
const TH =
  'sticky top-0 z-10 border-b border-edge bg-panel px-2 py-2 text-left text-xs font-normal text-muted lg:text-sm'
/** 桌面数据单元格 */
const TD = 'border-b border-edge/40 px-2 py-2'

/** 稀有度 → 中文标签（rarity.ts 无此值时的兜底，正常数据三种都有） */
function rarityLabel(rarity: string): string {
  return RARITY_LABEL[rarity] ?? rarity
}

/** 稀有度筛选 tabs：全部 + 三种稀有度（undefined = 全部，进 URL ?rarity=） */
const TABS: ReadonlyArray<{ value: Rarity | undefined; label: string }> = [
  { value: undefined, label: '全部' },
  ...RARITIES.map((value) => ({ value, label: rarityLabel(value) })),
]

/** 桌面表格行（<lg 下由卡片列表接替）；稀有度不设列（tab 筛选已表达，图标兜底色点可见） */
function AugmentTr({ augment }: { augment: AugmentRow }) {
  return (
    <tr className="hover:bg-edge/20">
      <td className={`${TD} text-right font-tnum text-xs tabular-nums text-muted`}>{augment.rank}</td>
      <td className={TD}>
        <div className="flex items-center gap-2">
          {/* 游戏内图标 22px；gtimg 索引缺该 id 时回落稀有度色点 */}
          <GameIcon
            src={augment.icon}
            size={22}
            rounded="rounded-md"
            fallback={<span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${RARITY_DOT[augment.rarity]}`} />}
          />
          <span className="min-w-0 truncate" title={augment.name}>
            {augment.name}
          </span>
        </div>
      </td>
      <td className={`${TD} text-right font-tnum font-semibold tabular-nums`}>{augment.winRate}%</td>
      <td className={`${TD} text-right font-tnum tabular-nums text-muted`}>{augment.pickRate}%</td>
      <td className={`${TD} whitespace-nowrap text-right font-tnum tabular-nums text-muted`}>
        {formatCount(augment.games)}
      </td>
      <td className={`${TD} text-right font-tnum tabular-nums text-muted`}>{augment.heroCount}</td>
    </tr>
  )
}

/** 移动端卡片：rank + 名称 + 稀有度 + 胜率 + 场次，全宽单列堆叠 */
function AugmentCard({ augment }: { augment: AugmentRow }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-edge bg-panel px-3 py-2">
      <span className="w-7 shrink-0 text-right font-tnum text-xs tabular-nums text-muted">
        #{augment.rank}
      </span>
      {/* 游戏内图标 28px（卡片行高更大）；缺图回落稀有度色点 */}
      <GameIcon
        src={augment.icon}
        size={28}
        rounded="rounded-md"
        fallback={<span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${RARITY_DOT[augment.rarity]}`} />}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{augment.name}</p>
        <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
          <span className={RARITY_TEXT[augment.rarity]}>
            {rarityLabel(augment.rarity)}
          </span>
          <span className="font-tnum tabular-nums">场次 {formatCount(augment.games)}</span>
        </p>
      </div>
      <span className="shrink-0 font-tnum text-sm tabular-nums">{augment.winRate}%</span>
    </li>
  )
}

/**
 * /augments 海克斯排行：217 行全宽表格，按 rank（= 胜率降序名次）升序。
 * 桌面（lg）吃满右栏高度，表格内部滚动 + 吸顶表头，整页不出现滚动条；
 * 移动端换卡片列表，随页面滚动。稀有度筛选落在 ?rarity=（根路由 validateSearch），
 * 刷新 / 分享 / 后退都能还原。
 */
export function AugmentsPage() {
  const { data, isPending, isError } = useAugments()
  const router = useRouter()
  const { rarity } = useSearch({ strict: false }) as { rarity?: Rarity }
  // validateSearch 已挡非法值，这里再 parse 一次兜底（直接键入脏 URL 也安全）
  const active = parseRarity(rarity)

  const all = data?.augments ?? []
  const rows = useMemo(() => filterAugments(all, active), [all, active])

  const setRarity = (next: Rarity | undefined) => {
    void router.navigate({
      // 函数式更新保留其它 search 参数（如 ?q=），rarity 为 undefined 时从 URL 摘掉
      to: '/augments',
      search: (prev) => ({ ...prev, rarity: next }),
      replace: true,
    })
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-col gap-2 p-3 lg:h-full">
      <header className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 className="text-base font-semibold lg:text-xl lg:font-bold">海克斯排行</h2>
        {/* 口径注记：pickRate 是「同稀有度内场次占比」，不是全局占比 */}
        <p className="text-[11px] text-muted">登场率：稀有度内占比 · 按胜率降序</p>
      </header>

      {/* 稀有度筛选 tabs（徽标数始终按全量统计，不随筛选变化） */}
      <div role="group" aria-label="稀有度筛选" className="flex shrink-0 flex-wrap gap-1.5">
        {TABS.map((tab) => {
          const isActive = active === tab.value
          return (
            <button
              key={tab.label}
              type="button"
              aria-pressed={isActive}
              onClick={() => setRarity(tab.value)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                isActive
                  ? 'border-accent bg-accent/15 font-medium text-accent'
                  : 'border-edge bg-panel text-muted hover:border-accent/50 hover:text-txt'
              }`}
            >
              {tab.label}
              <span className="ml-1 font-tnum tabular-nums opacity-80">
                {countByRarity(all, tab.value)}
              </span>
            </button>
          )
        })}
      </div>

      {/* lg 下容器内滚（吃满右栏高度），<lg 随页面滚动 */}
      <div className="min-h-0 min-w-0 flex-1 lg:overflow-y-auto">
        {isPending ? (
          <>
            {/* 移动端：卡片骨架（列表本体也是卡片） */}
            <ul className="space-y-2 lg:hidden">
              {Array.from({ length: 12 }, (_, i) => (
                <li key={i} className="h-12 animate-pulse rounded-lg bg-edge/40" />
              ))}
            </ul>
            {/* 桌面端：表格行骨架，pending 期间右栏不整块空白 */}
            <div aria-hidden="true" className="hidden space-y-1.5 lg:block">
              {Array.from({ length: 24 }, (_, i) => (
                <div key={i} className="h-6 animate-pulse rounded bg-edge/30" />
              ))}
            </div>
          </>
        ) : isError ? (
          <p className="py-6 text-sm text-tier-d">海克斯榜加载失败，请刷新重试。</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-sm text-muted" role="status">
            该稀有度下没有数据。
          </p>
        ) : (
          <>
            {/* 桌面表格：内部滚动，217 行不撑破右栏 */}
            <table className="hidden w-full table-fixed border-separate border-spacing-0 text-sm lg:table lg:text-[15px]">
              <thead>
                <tr>
                  <th className={`${TH} w-10 text-right`}>#</th>
                  <th className={TH}>名称</th>
                  <th className={`${TH} w-[4.5rem] text-right`}>胜率</th>
                  {/* 口径见列头 title 与页头注记 */}
                  <th
                    className={`${TH} w-16 text-right`}
                    title="登场率 = 稀有度内占比（该海克斯场次 / 同稀有度总场次）"
                  >
                    登场率
                  </th>
                  <th className={`${TH} w-20 text-right`}>场次</th>
                  <th className={`${TH} w-12 text-right`} title="覆盖英雄数">
                    英雄
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((augment) => (
                  <AugmentTr key={augment.id} augment={augment} />
                ))}
              </tbody>
            </table>

            {/* 移动端卡片列表（随页面滚动，无内滚） */}
            <ul className="space-y-2 lg:hidden">
              {rows.map((augment) => (
                <AugmentCard key={augment.id} augment={augment} />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}
