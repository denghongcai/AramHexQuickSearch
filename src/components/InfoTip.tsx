import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { TipSegment } from '@/lib/api'

/** 属性卡片信息（调用方组装）：图标/标题/副信息/售价，金色描边呼应游戏客户端 */
export interface TipCard {
  icon?: string | null
  title: string
  meta?: string
  price?: string | null
}

const POPOVER_W = 320

/**
 * 悬停/点击弹出的属性卡片（装备属性、海克斯描述共用）。
 * 交互：hover 即显（移开即隐）；点击固定（再点/点外部/Esc 取消固定）；
 * 移动端无 hover，点按即固定。
 * 定位：fixed 按触发器坐标计算（脱离任何 overflow 容器不被裁切），
 * 贴近视口底部自动上翻、超右自动左移，滚动/缩放实时跟随。
 * 触发内容由 children 提供（调用方保留原有视觉，本组件负责弹层与开合状态）。
 */
export function InfoTip({
  tip,
  card,
  label,
  children,
  className = '',
}: {
  tip?: TipSegment[] | null
  card?: TipCard | null
  label: string
  children: ReactNode
  className?: string
}) {
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLSpanElement>(null)
  const open = Boolean(pinned || hovered) && ((tip?.length ?? 0) > 0 || card != null)

  const place = useCallback(() => {
    const wrap = wrapRef.current
    const pop = popRef.current
    if (!wrap || !pop) return
    const tr = wrap.getBoundingClientRect()
    const left = Math.min(Math.max(tr.left, 8), window.innerWidth - POPOVER_W - 8)
    let top = tr.bottom + 8
    if (top + pop.offsetHeight > window.innerHeight - 8 && tr.top - pop.offsetHeight - 8 > 8) {
      top = tr.top - pop.offsetHeight - 8
    }
    setPos({ left: Math.round(left), top: Math.round(top) })
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place, tip, card])

  useEffect(() => {
    if (!open) return
    const onScroll = () => place()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setPinned(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(false)
    }
    document.addEventListener('click', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      document.removeEventListener('click', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, place])

  const plain = (tip ?? []).map((s) => s.text).join('')

  return (
    <span
      ref={wrapRef}
      className={`relative inline-flex min-w-0 ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={plain ? `${label}：${plain}` : label}
        onClick={() => setPinned((v) => !v)}
        className="min-w-0 text-left"
      >
        {children}
      </button>
      {open && (
        <span
          ref={popRef}
          role="tooltip"
          className="fixed z-50 rounded-lg border border-rar-gold/50 bg-[#0a1210] p-3 text-xs leading-relaxed text-txt shadow-2xl"
          style={
            pos
              ? { left: pos.left, top: pos.top, width: POPOVER_W }
              : { left: -9999, top: -9999, width: POPOVER_W, visibility: 'hidden' }
          }
        >
          {card && (
            <span className="mb-2 flex items-center gap-2.5 border-b border-rar-gold/40 pb-2">
              {card.icon && (
                <img
                  src={card.icon}
                  alt=""
                  draggable={false}
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 shrink-0 rounded-md border border-edge bg-ink object-cover"
                />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-bold text-txt">{card.title}</span>
                {card.meta && <span className="truncate text-[0.6875rem] text-muted">{card.meta}</span>}
              </span>
              {card.price && (
                <span className="flex shrink-0 items-center gap-1 font-tnum text-sm font-semibold tabular-nums text-rar-gold">
                  {card.price}
                  <span aria-hidden="true" className="text-xs">
                    ◈
                  </span>
                </span>
              )}
            </span>
          )}
          <span className="block whitespace-pre-line">
            {(tip ?? []).map((s, i) => (
              <span key={i} className={s.hl ? 'font-semibold text-accent' : undefined}>
                {s.text}
              </span>
            ))}
          </span>
        </span>
      )}
    </span>
  )
}
