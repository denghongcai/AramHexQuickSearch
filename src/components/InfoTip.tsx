import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { TipSegment } from '@/lib/api'

/**
 * 悬停/点击弹出的属性小卡（装备属性、海克斯描述共用）。
 * 交互：hover 即显（移开即隐）；点击固定（再点/点外部/Esc 取消固定）；
 * 移动端无 hover，点按即固定。segments 为游戏内提示分段（hl 段主题色加粗）。
 * 触发内容由 children 提供（调用方保留原有视觉，本组件只负责弹层与开合状态）。
 */
export function InfoTip({
  tip,
  label,
  children,
  className = '',
}: {
  tip: TipSegment[] | null | undefined
  /** 无障碍名（触发内容的完整语义，如「暴风之剑 属性」） */
  label: string
  children: ReactNode
  className?: string
}) {
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const open = Boolean(pinned || hovered) && Array.isArray(tip) && tip.length > 0

  // 点击固定后：点外部或 Esc 取消固定（hover 态无需监听，移开即隐）
  useEffect(() => {
    if (!pinned) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setPinned(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(false)
    }
    document.addEventListener('click', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [pinned])

  const plain = (tip ?? []).map((s) => s.text).join('')

  return (
    <span
      ref={ref}
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
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-1.5 w-72 rounded-lg border border-edge bg-panel p-2.5 text-xs leading-relaxed text-txt shadow-lg"
        >
          {(tip ?? []).map((s, i) => (
            <span key={i} className={s.hl ? 'font-semibold text-accent' : undefined}>
              {s.text}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
