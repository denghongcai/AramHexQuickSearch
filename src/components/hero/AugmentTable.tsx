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

/** 表头单元（sticky 沉在微滚容器顶上，滚动时保持列名可见） */
function HeadCell({ children, className = '', title }: { children: string; className?: string; title?: string }) {
  return (
    <th
      title={title}
      className={`sticky top-0 z-10 bg-panel px-1.5 py-1 font-normal ${className}`}
    >
      {children}
    </th>
  )
}

/** 单行：# 图标+名称 胜率 ±pp 场次；lowSample 整行灰显降权（±pp 不参与分色） */
function AugmentRowLine({
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
    <tr className={`border-t border-edge/40 ${row.lowSample ? 'text-muted opacity-60' : ''}`}>
      <td className="px-1.5 py-1.5 text-right font-tnum tabular-nums text-muted">{index + 1}</td>
      <td className="px-1.5 py-1.5">
        <div className="flex items-center gap-2">
          {/* 游戏内图标 22px；gtimg 索引缺该 id 时回落稀有度色点 */}
          <GameIcon
            src={row.icon}
            size={22}
            rounded="rounded-md"
            fallback={<span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${RARITY_DOT[rarity]}`} />}
          />
          <span className="min-w-0 flex-1 truncate">
            {row.name}
            {row.lowSample && (
              <span className="ml-1 rounded bg-edge/60 px-1 py-px align-middle text-[10px] text-muted">低样本</span>
            )}
          </span>
        </div>
      </td>
      <td className="px-1.5 py-1.5 text-right font-tnum font-semibold tabular-nums">{row.winRate.toFixed(2)}%</td>
      <td
        title={`相对该英雄全体 ${formatDelta(delta)}pp`}
        className={`px-1.5 py-1.5 text-right font-tnum tabular-nums ${row.lowSample ? '' : deltaClass(delta)}`}
      >
        {formatDelta(delta)}
      </td>
      <td className="px-1.5 py-1.5 text-right font-tnum tabular-nums whitespace-nowrap text-muted">
        {formatCount(row.games)}
      </td>
    </tr>
  )
}

/**
 * 海克斯表（左宽栏）：棱彩/黄金/白银三档 tab（默认棱彩），
 * 行 = 图标+名称 / 胜率 / ±Δpp（相对该英雄全体胜率，±2pp 内中性）/ 场次。
 * 密度整改（用户反馈信息密度太高）：默认只渲染胜率前 COLLAPSED_COUNT 行，
 * 「展开全部」按钮切换完整列表（aria-expanded 供读屏感知，切换文案随状态变化）；
 * lg 下表格在面板内微滚（一屏约束），<lg 限高 60dvh 随页面走。
 */

/** 折叠态每档最多展示的行数（按 winRate 降序取前 N，行序即榜单序） */
const COLLAPSED_COUNT = 12

export function AugmentTable({ hero, className = '' }: { hero: HeroDetail; className?: string }) {
  const [rarity, setRarity] = useState<keyof HeroDetail['augments']>('prismatic')
  const [expanded, setExpanded] = useState(false)

  return (
    <Panel
      title="海克斯强化"
      aside={<span className="shrink-0 font-normal">±pp = 相对该英雄全体胜率</span>}
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
                  <div className="max-h-[60dvh] min-h-0 flex-1 overflow-y-auto lg:max-h-none">
                    <table className="w-full table-fixed border-collapse text-xs lg:text-[15px]">
                      <thead>
                        <tr className="text-left text-muted">
                          <HeadCell className="w-8">#</HeadCell>
                          <HeadCell>名称</HeadCell>
                          <HeadCell className="w-14 text-right">胜率</HeadCell>
                          <HeadCell
                            className="w-14 text-right"
                            title="该海克斯胜率 − 该英雄全体胜率（百分数直接相减）"
                          >
                            ±pp
                          </HeadCell>
                          <HeadCell className="w-14 text-right">场次</HeadCell>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((row, i) => (
                          <AugmentRowLine key={row.id} row={row} index={i} overall={hero.ranking.winRate} rarity={key} />
                        ))}
                      </tbody>
                    </table>
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
