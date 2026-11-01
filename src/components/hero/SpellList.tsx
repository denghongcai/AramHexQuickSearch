import type { HeroDetail } from '@/lib/api'
import { formatCount } from '@/lib/format'
import { Panel } from './Panel'

/**
 * 召唤师技能 Top5（右栏）：spells 已按 games 降序，这里只取前 5 行；
 * 行 = 组合名（names 逐段 join） / 场次 / 胜率。
 */
export function SpellList({ spells, className = '' }: { spells: HeroDetail['spells']; className?: string }) {
  const top = spells.slice(0, 5)

  return (
    <Panel title="召唤师技能 Top5" className={`shrink-0 ${className}`}>
      {top.length === 0 ? (
        <p className="px-1.5 py-3 text-xs text-muted">暂无数据。</p>
      ) : (
        <ul className="space-y-0.5">
          {top.map((spell) => (
            <li key={spell.combo} className="flex items-center gap-2 px-1.5 py-0.5 text-xs">
              <span className="min-w-0 flex-1 truncate">{spell.names.join(' + ')}</span>
              <span className="w-14 shrink-0 text-right font-tnum tabular-nums whitespace-nowrap text-muted">
                {formatCount(spell.games)}
              </span>
              <span className="w-12 shrink-0 text-right font-tnum tabular-nums">
                {spell.winRate.toFixed(2)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
