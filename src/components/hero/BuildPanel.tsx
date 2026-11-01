import { useState, type ReactNode } from 'react'

import type { HeroBuild } from '@/lib/api'
import { formatCount } from '@/lib/format'
import { Panel } from './Panel'
import { TabBar } from './Tabs'

/** 装备名徽片（核心装 / 出门装 / 推荐装共用），flex-wrap 防窄栏溢出；
 *  名单内允许重复装备名（真实数据如战士流出门装 双「增幅典籍」），key 需拼下标 */
function ItemChips({ names }: { names: readonly string[] }) {
  return (
    <ul className="flex flex-wrap gap-1">
      {names.map((name, i) => (
        <li key={`${name}-${i}`} className="rounded border border-edge bg-ink px-1.5 py-0.5 text-[11px]">
          {name}
        </li>
      ))}
    </ul>
  )
}

/** 小节：窄栏里标签在上、内容在下；空列表给一行占位 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-[11px] font-medium text-muted">{label}</h3>
      {children}
    </div>
  )
}

function EmptyField({ names }: { names: readonly string[] }) {
  return names.length > 0 ? <ItemChips names={names} /> : <p className="text-xs text-muted">—</p>
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
          label="出装流派"
          tabs={list.map((build) => ({ key: build.key, label: build.name }))}
          active={active.key}
          onChange={setTab}
        />
        {/* lg 下内容超高在面板内微滚；<lg 无高度约束，随文档流展开 */}
        <div role="tabpanel" className="min-h-0 flex-1 space-y-2.5 overflow-y-auto">
          <dl className="grid grid-cols-3 gap-2 rounded-lg bg-ink px-2 py-1.5 text-xs">
            <div>
              <dt className="text-muted">样本</dt>
              <dd className="mt-0.5 font-tnum tabular-nums">{formatCount(active.sampleCount)}场</dd>
            </div>
            <div>
              <dt className="text-muted">胜率</dt>
              <dd className="mt-0.5 font-tnum font-semibold tabular-nums text-accent">
                {active.winRate.toFixed(2)}%
              </dd>
            </div>
            <div>
              <dt className="text-muted">登场率</dt>
              <dd className="mt-0.5 font-tnum tabular-nums">{active.pickRate.toFixed(2)}%</dd>
            </div>
          </dl>
          <Field label="核心装">
            <EmptyField names={active.core.names} />
          </Field>
          <Field label="出门装">
            <EmptyField names={active.starter} />
          </Field>
          <Field label="推荐装">
            <EmptyField names={active.recommended} />
          </Field>
          {active.summary && (
            <Field label="玩法">
              <p className="whitespace-pre-line text-[11px] leading-relaxed text-muted">{active.summary}</p>
            </Field>
          )}
        </div>
      </div>
    </Panel>
  )
}
