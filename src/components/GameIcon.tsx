import { useEffect, useState, type ReactNode } from 'react'

/**
 * 游戏内图标（gtimg 原图）统一渲染：
 * - img 固定宽高（style 直写，避免动态类名被 Tailwind 清洗）+ 懒加载 +
 *   异步解码 + 空 alt（装饰图），固定宽高防 CLS；
 *   宽高以 rem 计（size 按设计稿 16px 根字号折算），随大屏根字号缩放；
 * - src 为 null（gtimg 索引缺该 id）或加载失败（onError，如 gtimg 短暂不可达）
 *   时渲染 fallback（调用方给色点等兜底），绝不放出破图/空框；
 *   fallback 缺省渲染为空（等价「无图标只有文字」）。
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
  /** 宽高（正方形），按 16px 根字号折算的像素值，内部转 rem */
  size: number
  /** 圆角类，默认 rounded（4px）；小尺寸可用 rounded-sm/full */
  rounded?: string
  fallback?: ReactNode
  className?: string
  /** 可选 hover 提示（如稀有度中文名；缺图时调用方自行在 fallback 上给等价提示） */
  title?: string
}) {
  const [errored, setErrored] = useState(false)
  // 同一组件被列表复用、src 换新 URL 时复位错误态（上一次的失败不该连坐新图标）
  useEffect(() => {
    setErrored(false)
  }, [src])

  if (!src || errored) return <>{fallback}</>
  return (
    <img
      src={src}
      alt=""
      title={title}
      loading="lazy"
      decoding="async"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setErrored(true)}
      style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }}
      className={`shrink-0 border border-edge bg-ink object-cover ${rounded} ${className}`}
    />
  )
}
