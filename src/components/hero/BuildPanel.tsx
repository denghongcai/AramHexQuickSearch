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
        <TabBar
          idPrefix="hero-builds"
          label="出装流派"
          tabs={list.map((build) => ({ key: build.key, label: build.name }))}
          active={active.key}
          onChange={setTab}
        />
        {/* 面板常驻 DOM（hidden 切换显隐）：每个 tab 的 aria-controls 都有落点，
            id/labelledby 与 TabBar 同源（tabs.tsx）；lg 下内容超高在面板内微滚，<lg 随文档流展开 */}
        {list.map((build) => (
          <div
            key={build.key}
            {...tabPanelProps('hero-builds', build.key)}
            hidden={build.key !== active.key}
            className="space-y-2.5"
          >
            <dl className="grid grid-cols-3 gap-2 rounded-lg bg-ink px-3 py-2 text-sm lg:text-base">
              <div>
                <dt className="text-muted">样本</dt>
                <dd className="mt-0.5 font-tnum font-semibold tabular-nums">{formatCount(build.sampleCount)}场</dd>
              </div>
              <div>
                <dt className="text-muted">胜率</dt>
                <dd className="mt-0.5 font-tnum text-base font-semibold tabular-nums text-accent lg:text-lg">
                  {build.winRate.toFixed(2)}%
                </dd>
              </div>
              <div>
                <dt className="text-muted">登场率</dt>
                <dd className="mt-0.5 font-tnum font-semibold tabular-nums">{build.pickRate.toFixed(2)}%</dd>
              </div>
            </dl>
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
            <Field label="推荐装">
              <EmptyField items={build.recommended} />
            </Field>
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
