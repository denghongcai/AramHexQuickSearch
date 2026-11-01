import type { ReactNode } from 'react'

/**
 * 游戏内图标（gtimg 原图）统一渲染：
 * - img 固定像素宽高（style 直写，避免动态类名被 Tailwind 清洗）+ 懒加载 +
 *   异步解码 + 空 alt（装饰图），固定宽高防 CLS；
 * - src 为 null（gtimg 索引缺该 id）时渲染 fallback（调用方给色点等兜底），
 *   绝不放出破图；fallback 缺省渲染为空（等价「无图标只有文字」）。
 */
export function GameIcon({
  src,
  size,
  rounded = 'rounded',
  fallback = null,
  className = '',
  title,
}: {
  src: string | null
  /** 固定像素宽高（正方形） */
  size: number
  /** 圆角类，默认 rounded（4px）；小尺寸可用 rounded-sm/full */
  rounded?: string
  fallback?: ReactNode
  className?: string
  /** 可选 hover 提示（如稀有度中文名；缺图时调用方自行在 fallback 上给等价提示） */
  title?: string
}) {
  if (!src) return <>{fallback}</>
  return (
    <img
      src={src}
      alt=""
      title={title}
      loading="lazy"
      decoding="async"
      draggable={false}
      referrerPolicy="no-referrer"
      style={{ width: size, height: size }}
      className={`shrink-0 border border-edge bg-ink object-cover ${rounded} ${className}`}
    />
  )
}
