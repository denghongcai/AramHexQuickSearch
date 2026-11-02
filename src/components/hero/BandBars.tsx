import type { HeroBand, HeroDetail } from '@/lib/api'
import { formatCount } from '@/lib/format'
import { Panel } from './Panel'

/** 分段定义（aramhex bands 口径：玩家层 全体/休闲/中坚/顶尖），顺序固定；段缺失则省键 */
const BAND_ROWS = [
  { key: 'all', label: '全体' },
  { key: 'casual', label: '休闲' },
  { key: 'mid', label: '中坚' },
  { key: 'top', label: '顶尖' },
] as const

/** 单行：标签 + 横条（宽 = 胜率%）+ 胜率 + 场次 */
function BandRow({ label, band }: { label: string; band: HeroBand }) {
  return (
    <li className="flex items-center gap-2 text-xs lg:text-[0.9375rem]">
      <span className="w-8 shrink-0 text-muted">{label}</span>
      <span aria-hidden="true" className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-edge/40">
        <span
          className="block h-full rounded-full bg-accent"
          style={{ width: `${band.winRate}%` }}
        />
      </span>
      <span className="w-12 shrink-0 text-right font-tnum font-semibold tabular-nums">{band.winRate.toFixed(2)}%</span>
      <span className="w-14 shrink-0 text-right font-tnum tabular-nums whitespace-nowrap text-muted">
        {formatCount(band.games)}
      </span>
    </li>
  )
}

/**
 * 分段胜率（右栏）：all/casual/mid/top 四行横条；
 * 某段缺失跳过该行，全部缺失整个面板隐藏（契约允许缺段）。
 */
export function BandBars({ bands, className = '' }: { bands: HeroDetail['bands']; className?: string }) {
  const rows = BAND_ROWS.flatMap((def) => {
    const band = bands[def.key]
    return band ? [{ key: def.key, label: def.label, band }] : []
  })

  if (rows.length === 0) return null

  return (
    <Panel
      title="分段胜率"
      aside={<span className="shrink-0 font-normal">条长 = 胜率%</span>}
      className={`shrink-0 ${className}`}
    >
      <ul className="space-y-1.5 pt-0.5">
        {rows.map(({ key, label, band }) => (
          <BandRow key={key} label={label} band={band} />
        ))}
      </ul>
    </Panel>
  )
}
