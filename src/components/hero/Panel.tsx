import type { ReactNode } from 'react'

/** 面板骨架：圆角描边卡 + 小标题，与 Overview.tsx 同款习惯（详情页四块面板共用）。
 *  标题层级：移动端维持紧凑（xs/muted），lg 起放大加粗提色（PC 字号整改）；
 *  aside 注记独立钉在小字（不随标题放大） */
export function Panel({
  title,
  aside,
  children,
  className = '',
}: {
  title: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`flex min-h-0 min-w-0 flex-col rounded-xl border border-edge bg-panel p-3 ${className}`}>
      <h2 className="mb-1.5 flex shrink-0 items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-muted lg:text-xl lg:font-bold lg:text-txt">{title}</span>
        {aside != null && aside !== false && (
          <span className="shrink-0 text-xs font-normal text-muted">{aside}</span>
        )}
      </h2>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}
