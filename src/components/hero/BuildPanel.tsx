import { useState, type ReactNode } from 'react'

import { GameIcon } from '@/components/GameIcon'
import { InfoTip } from '@/components/InfoTip'
import type { HeroBuild, ItemChip } from '@/lib/api'
import { formatCount } from '@/lib/format'
import { Panel } from './Panel'
import { TabBar, tabPanelProps } from './Tabs'

/** 单枚装备徽片内容：28px 游戏图标 + 名称（查无图标只留名称兜底） */
function ChipInner({ item }: { item: ItemChip }) {
  return (
    <>
      <GameIcon src={item.icon} size={28} rounded="rounded-md" />
      {item.name}
    </>
  )
}

/** 装备徽片（核心装 / 出门装 / 推荐装共用）：28px 游戏图标 + 名称，flex-wrap 防溢出；
 *  名单内允许重复装备名（真实数据如战士流出门装 双「增幅典籍」），key 需拼下标；
 *  有属性提示（tip）的装备可悬停/点击弹属性卡 */
function ItemChips({ items }: { items: ReadonlyArray<ItemChip> }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item, i) => {
        const inner = <ChipInner item={item} />
        return (
          <li key={`${item.id ?? item.name}-${i}`} className="flex items-center">
            {item.tip?.length || item.price ? (
              <InfoTip
                tip={item.tip}
                card={{ icon: item.icon, title: item.name, price: item.price }}
                label={`${item.name} 属性`}
              >
                <span className="flex cursor-pointer items-center gap-1.5 rounded-md border border-edge bg-ink px-2 py-1 text-sm transition-colors hover:border-rar-gold/60">
                  {inner}
                </span>
              </InfoTip>
            ) : (
              <span className="flex items-center gap-1.5 rounded-md border border-edge bg-ink px-2 py-1 text-sm">{inner}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** 小节：标签在上、内容在下；空列表给一行占位 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium text-muted lg:text-sm">{label}</h3>
      {children}
    </div>
  )
}

function EmptyField({ items }: { items: ReadonlyArray<ItemChip> }) {
  return items.length > 0 ? <ItemChips items={items} /> : <p className="text-xs text-muted">—</p>
}

/** 出门装/推荐装的属性合计行：70攻击力 · 80生命值 · 2.5%全能吸血（值半粗、属性名弱化） */
function TotalStatsLine({ label, stats }: { label: string; stats: HeroBuild['starterStats'] }) {
  if (!stats || stats.length === 0) return null
  return (
    <p className="rounded-lg bg-ink px-3 py-1.5 text-sm">
      <span className="text-muted">{label}：</span>
      {stats.map((s, i) => (
        <span key={`${s.name}-${s.pct}`} className="font-tnum tabular-nums">
          {i > 0 && <span className="text-muted"> · </span>}
          <span className="font-semibold">
            {s.value}
            {s.pct && '%'}
          </span>
          {s.name}
        </span>
      ))}
    </p>
  )
}

/**
 * 出装流派（右栏）：按 build 分 tab（key 作 tab id、name 作标题）。
 * builds 为 null（数据源不可用）时显示一行说明；
 * 流派内容 = 样本/胜率/登场率 + 核心装 + 出门装 + 推荐装 + 玩法 tips。
 */
export function BuildPanel({ builds, className = '' }: { builds: HeroBuild[] | null; className?: string }) {
  const list = builds ?? []
  // builds 内 key 唯一（数据契约），直接作 tab id；残留 state（切英雄后未重挂）回落第一个
  const [tab, setTab] = useState<string>(list[0]?.key ?? '')
  const active = list.find((build) => build.key === tab) ?? list[0]

  if (!active) {
    return (
      <Panel title="出装流派" className={`min-h-0 flex-1 ${className}`}>
        <p className="px-1.5 py-3 text-xs text-muted">出装数据源暂不可用。</p>
      </Panel>
    )
  }

  return (
    <Panel
      title="出装流派"
      aside={<span className="shrink-0 font-normal">{list.length} 个流派</span>}
      className={`min-h-0 flex-1 ${className}`}
    >
      <div className="flex h-full min-h-0 flex-col gap-2">
        {/* tab 与该流派核心三指标同行：左 tab、右样本/胜率/登场率，压缩面板头部高度 */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <TabBar
            idPrefix="hero-builds"
            label="出装流派"
            tabs={list.map((build) => ({ key: build.key, label: build.name }))}
            active={active.key}
            onChange={setTab}
          />
          <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs lg:text-sm">
            <div className="flex items-baseline gap-1">
              <dt className="text-muted">样本</dt>
              <dd className="font-tnum font-semibold tabular-nums">{formatCount(active.sampleCount)}场</dd>
            </div>
            <div className="flex items-baseline gap-1">
              <dt className="text-muted">胜率</dt>
              <dd className="font-tnum text-base font-semibold tabular-nums text-accent lg:text-lg">
                {active.winRate.toFixed(2)}%
              </dd>
            </div>
            <div className="flex items-baseline gap-1">
              <dt className="text-muted">登场率</dt>
              <dd className="font-tnum font-semibold tabular-nums">{active.pickRate.toFixed(2)}%</dd>
            </div>
          </dl>
        </div>
        {/* 面板常驻 DOM（hidden 切换显隐）：每个 tab 的 aria-controls 都有落点，
            id/labelledby 与 TabBar 同源（tabs.tsx） */}
        {list.map((build) => (
          <div
            key={build.key}
            {...tabPanelProps('hero-builds', build.key)}
            hidden={build.key !== active.key}
            className="space-y-2.5"
          >
            <Field label="核心装">
              <EmptyField
                items={build.core.names.map((name, i) => ({
                  id: build.core.itemIds[i],
                  name,
                  icon: build.core.icons[i] ?? null,
                  tip: build.core.tips?.[i] ?? null,
                  price: build.core.prices?.[i] ?? null,
                }))}
              />
            </Field>
            <Field label="出门装">
              <EmptyField items={build.starter} />
            </Field>
            <TotalStatsLine label="出门装合计" stats={build.starterStats} />
            <Field label="推荐装">
              <EmptyField items={build.recommended} />
            </Field>
            <TotalStatsLine label="推荐装合计" stats={build.recommendedStats} />
            {build.summary && (
              <Field label="玩法">
                <p className="whitespace-pre-line text-xs leading-relaxed text-muted lg:text-[0.9375rem]">{build.summary}</p>
              </Field>
            )}
          </div>
        ))}
      </div>
    </Panel>
  )
}
