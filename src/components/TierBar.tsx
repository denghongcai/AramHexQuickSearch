import { useMemo, useState } from 'react'
import { TIER_BG, tierSegments } from '@/lib/tier'

/**
 * Tier 分布横条：S→D 五段堆叠比例条（宽度按占比，段间 2px 面板色缝隙）。
 * 桌面总览页与移动端总览条共用同一组件。
 *
 * 身份不只靠颜色（tier 色 B/A 对在色觉障碍下偏近）：每段内直接标注 tier 字母，
 * 下方图例恒久展示各档「字母 + 人数」；hover 有 title 提示，点击/回车高亮该档
 * （其余段降透明度，移动端无 hover 的等价路径，再点一次取消）。
 */
export function TierBar({ heroes, className = '' }: { heroes: Array<{ tier: string }>; className?: string }) {
  const segs = useMemo(() => tierSegments(heroes), [heroes])
  const [active, setActive] = useState<string | null>(null)

  return (
    <div className={className}>
      <div
        role="group"
        aria-label="英雄 Tier 分布"
        className="flex h-5 gap-0.5 overflow-hidden rounded-md"
      >
        {segs
          .filter((seg) => seg.count > 0)
          .map((seg) => {
            const pct = `${(seg.share * 100).toFixed(1)}%`
            const dimmed = active !== null && active !== seg.tier
            return (
              <button
                key={seg.tier}
                type="button"
                onClick={() => setActive((prev) => (prev === seg.tier ? null : seg.tier))}
                title={`${seg.tier} · ${seg.count} 名英雄（${pct}）`}
                aria-label={`${seg.tier} tier：${seg.count} 名英雄，占 ${pct}`}
                aria-pressed={active === seg.tier}
                // flexGrow 按人数分宽（等价于按占比），段间 gap 吃进总宽、不会溢出容器
                style={{ flexGrow: seg.count, flexBasis: 0 }}
                className={`min-w-0 cursor-pointer text-center text-[0.625rem] font-bold text-ink ${
                  dimmed ? 'opacity-45' : 'hover:opacity-90'
                } ${TIER_BG[seg.tier] ?? 'bg-tier-c'}`}
              >
                {seg.tier}
              </button>
            )
          })}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.6875rem] text-muted">
        {segs.map((seg) => (
          <li
            key={seg.tier}
            className={`flex items-center gap-1 ${active === seg.tier ? 'font-semibold text-txt' : ''}`}
          >
            <span aria-hidden="true" className={`size-2 rounded-sm ${TIER_BG[seg.tier] ?? 'bg-tier-c'}`} />
            <span className="font-bold">{seg.tier}</span>
            <span className="font-tnum tabular-nums">{seg.count} 名</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
