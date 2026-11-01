import { useState } from 'react'

import { GameIcon } from '@/components/GameIcon'
import type { HeroAugmentRow, HeroDetail } from '@/lib/api'
import { deltaClass, formatDelta, ppDelta } from '@/lib/delta'
import { formatCount } from '@/lib/format'
import { RARITY_DOT } from '@/lib/rarity'
import { Panel } from './Panel'
import { TabBar, tabPanelProps, type TabDef } from './Tabs'

/** 稀有度 tab：契约键序 棱彩→金→银，色点复用共享 RARITY_DOT 映射 */
const RARITY_TABS: ReadonlyArray<TabDef<keyof HeroDetail['augments']>> = [
  { key: 'prismatic', label: '棱彩', dot: RARITY_DOT.prismatic },
  { key: 'gold', label: '黄金', dot: RARITY_DOT.gold },
  { key: 'silver', label: '白银', dot: RARITY_DOT.silver },
]

/**
 * 海克斯强化（左宽栏，用户反馈两轮迭代后的形态）：
 * - 单行 = # 图标 名称 胜率 ±pp；场次收进悬停提示（多列下列宽装不下，且胜率是主指标）
 * - lg 起两列、2xl 三列的响应式网格——宽屏不再被单列长表浪费横向空间；
 *   <lg 单列随页面滚动（限高 60dvh）
 * - 密度：默认只渲染胜率前 COLLAPSED_COUNT 行，「展开全部」切换（aria-expanded）
 * - 行序即榜单序；lowSample 整行灰显 + 徽片（±pp 不参与分色）
 */

/** 折叠态每档最多展示的行数（按 winRate 降序取前 N，行序即榜单序） */
const COLLAPSED_COUNT = 12

/** 单行（网格单元）：# 图标 名称 胜率 ±pp；场次与 ±pp 口径进 title 悬停 */
function AugmentCell({
  row,
  index,
  overall,
  rarity,
}: {
  row: HeroAugmentRow
  index: number
  overall: number
  /** 当前稀有度 tab（icon 缺失时色点兜底用） */
  rarity: keyof HeroDetail['augments']
}) {
  const delta = ppDelta(row.winRate, overall)

  return (
    <div
      title={`场次 ${formatCount(row.games)} · 相对该英雄全体 ${formatDelta(delta)}pp`}
      className={`flex min-w-0 items-center gap-2.5 rounded-md px-1.5 py-1.5 ${row.lowSample ? 'text-muted opacity-60' : ''}`}
    >
      <span className="w-6 shrink-0 text-right font-tnum text-sm tabular-nums text-muted">{index + 1}</span>
      <GameIcon
        src={row.icon}
        size={28}
        rounded="rounded-md"
        fallback={<span aria-hidden="true" className={`size-3 shrink-0 rounded-full ${RARITY_DOT[rarity]}`} />}
      />
      <span className="min-w-0 flex-1 truncate text-[15px] lg:text-[17px]">
        {row.name}
        {row.lowSample && (
          <span className="ml-1 rounded bg-edge/60 px-1 py-px align-middle text-[10px] text-muted">低样本</span>
        )}
      </span>
      <span className="shrink-0 font-tnum text-base font-bold tabular-nums lg:text-[18px]">
        {row.winRate.toFixed(2)}%
      </span>
      <span
        className={`w-14 shrink-0 text-right font-tnum text-sm tabular-nums ${row.lowSample ? '' : deltaClass(delta)}`}
      >
        {formatDelta(delta)}
      </span>
    </div>
  )
}

export function AugmentTable({ hero, className = '' }: { hero: HeroDetail; className?: string }) {
  const [rarity, setRarity] = useState<keyof HeroDetail['augments']>('prismatic')
  const [expanded, setExpanded] = useState(false)

  return (
    <Panel
      title="海克斯强化"
      aside={<span className="shrink-0 font-normal">±pp = 相对该英雄全体胜率 · 悬停看场次</span>}
      className={className}
    >
      <div className="flex h-full min-h-0 flex-col gap-1.5">
        <TabBar idPrefix="hero-augments" label="海克斯稀有度" tabs={RARITY_TABS} active={rarity} onChange={setRarity} />
        {/* 三个面板常驻 DOM（hidden 切换显隐）：每个 tab 的 aria-controls 都有落点，
            id/labelledby 与 TabBar 同源（tabs.tsx）不会写岔 */}
        {RARITY_TABS.map(({ key }) => {
          const rows = hero.augments[key]
          const visible = expanded ? rows : rows.slice(0, COLLAPSED_COUNT)
          return (
            <div
              key={key}
              {...tabPanelProps('hero-augments', key)}
              hidden={key !== rarity}
              className="flex min-h-0 flex-1 flex-col"
            >
              {rows.length === 0 ? (
                <p className="px-1.5 py-3 text-xs text-muted">该稀有度下暂无数据。</p>
              ) : (
                <>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {/* 列数随断点真实递进（17px 名称下单列 ~90px 会截成单字）：
                        lg 单列（名称全宽）→ 2xl 两列 → 3xl(≥2000px，2K 屏) 三列 */}
                    <div className="grid gap-x-4 gap-y-0.5 2xl:grid-cols-2 3xl:grid-cols-3">
                      {visible.map((row, i) => (
                        <AugmentCell key={row.id} row={row} index={i} overall={hero.ranking.winRate} rarity={key} />
                      ))}
                    </div>
                  </div>
                  {rows.length > COLLAPSED_COUNT && (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setExpanded((v) => !v)}
                      className="mx-1.5 shrink-0 self-start rounded-md border border-edge px-2 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-txt lg:text-sm"
                    >
                      {expanded ? '收起' : `展开全部 ${rows.length} 行`}
                    </button>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
