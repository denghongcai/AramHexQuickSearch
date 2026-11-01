import { useState } from 'react'

import type { HeroAugmentRow, HeroDetail } from '@/lib/api'
import { deltaClass, formatDelta, ppDelta } from '@/lib/delta'
import { formatCount } from '@/lib/format'
import { RARITY_DOT } from '@/lib/rarity'
import { Panel } from './Panel'
import { TabBar, type TabDef } from './Tabs'

/** 稀有度 tab：契约键序 棱彩→金→银，色点复用共享 RARITY_DOT 映射 */
const RARITY_TABS: ReadonlyArray<TabDef<keyof HeroDetail['augments']>> = [
  { key: 'prismatic', label: '棱彩', dot: RARITY_DOT.prismatic },
  { key: 'gold', label: '金色', dot: RARITY_DOT.gold },
  { key: 'silver', label: '银色', dot: RARITY_DOT.silver },
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

/** 单行：# 名称 胜率 ±pp 场次；lowSample 整行灰显降权（±pp 不参与分色） */
function AugmentRowLine({ row, index, overall }: { row: HeroAugmentRow; index: number; overall: number }) {
  const delta = ppDelta(row.winRate, overall)

  return (
    <tr className={`border-t border-edge/40 ${row.lowSample ? 'text-muted opacity-60' : ''}`}>
      <td className="px-1.5 py-1 text-right font-tnum tabular-nums text-muted">{index + 1}</td>
      <td className="truncate px-1.5 py-1">
        {row.name}
        {row.lowSample && (
          <span className="ml-1 rounded bg-edge/60 px-1 py-px align-middle text-[10px] text-muted">低样本</span>
        )}
      </td>
      <td className="px-1.5 py-1 text-right font-tnum tabular-nums">{row.winRate.toFixed(2)}%</td>
      <td
        title={`相对该英雄全体 ${formatDelta(delta)}pp`}
        className={`px-1.5 py-1 text-right font-tnum tabular-nums ${row.lowSample ? '' : deltaClass(delta)}`}
      >
        {formatDelta(delta)}
      </td>
      <td className="px-1.5 py-1 text-right font-tnum tabular-nums whitespace-nowrap text-muted">
        {formatCount(row.games)}
      </td>
    </tr>
  )
}

/**
 * 海克斯表（左宽栏）：棱彩/金色/银色三档 tab（默认棱彩），
 * 行 = 名称 / 胜率 / ±Δpp（相对该英雄全体胜率，±2pp 内中性）/ 场次；
 * lg 下表格在面板内微滚（一屏约束），<lg 限高 60dvh 随页面走。
 */
export function AugmentTable({ hero, className = '' }: { hero: HeroDetail; className?: string }) {
  const [rarity, setRarity] = useState<keyof HeroDetail['augments']>('prismatic')
  const rows = hero.augments[rarity]

  return (
    <Panel
      title="海克斯强化"
      aside={<span className="shrink-0 font-normal">±pp = 相对该英雄全体胜率</span>}
      className={className}
    >
      <div className="flex h-full min-h-0 flex-col gap-1.5">
        <TabBar label="海克斯稀有度" tabs={RARITY_TABS} active={rarity} onChange={setRarity} />
        {rows.length === 0 ? (
          <p className="px-1.5 py-3 text-xs text-muted">该稀有度下暂无数据。</p>
        ) : (
          <div className="max-h-[60dvh] min-h-0 flex-1 overflow-y-auto lg:max-h-none">
            <table className="w-full table-fixed border-collapse text-xs">
              <thead>
                <tr className="text-left text-muted">
                  <HeadCell className="w-8">#</HeadCell>
                  <HeadCell>名称</HeadCell>
                  <HeadCell className="w-12 text-right">胜率</HeadCell>
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
                {rows.map((row, i) => (
                  <AugmentRowLine key={row.id} row={row} index={i} overall={hero.ranking.winRate} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  )
}
