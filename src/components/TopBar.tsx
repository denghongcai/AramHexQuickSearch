import { useMeta } from '@/lib/api'

/** 顶栏：固定高 56px；左站名，右数据版本信息（仅 lg 显示，移动端保持精简） */
export function TopBar() {
  const { data: meta } = useMeta()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-edge bg-panel px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-md bg-accent/15">
          {/* 六边形 logo，与 favicon 同形 */}
          <svg
            viewBox="0 0 32 32"
            className="size-4 text-accent"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
          >
            <path d="M16 5.5 26 11.25v9.5L16 26.5 6 20.75v-9.5z" />
          </svg>
        </span>
        <span className="truncate text-[15px] font-semibold tracking-wide">海克斯大乱斗速查</span>
      </div>
      {meta && (
        <p className="hidden shrink-0 items-center gap-2 font-tnum text-xs tabular-nums text-muted lg:flex">
          <span className="text-accent">Patch {meta.patch}</span>
          <span aria-hidden="true">·</span>
          {/* snapshotAt 的日期部分 */}
          <span>{meta.snapshotAt.slice(0, 10)}</span>
        </p>
      )}
    </header>
  )
}
