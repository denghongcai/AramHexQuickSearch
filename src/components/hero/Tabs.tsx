export interface TabDef<K extends string> {
  key: K
  label: string
  /** 可选色点类名（稀有度点等），调用方传共享映射里的 bg-* 字面量 */
  dot?: string
}

/**
 * 通用 tab 条（海克斯稀有度 / 出装流派共用）：
 * aria 语义齐全（tablist/tab/aria-selected），选中态用面板色块而非下划线，贴合深色主题。
 */
export function TabBar<K extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: ReadonlyArray<TabDef<K>>
  active: K
  onChange: (key: K) => void
  /** tablist 的可访问名称 */
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="flex shrink-0 items-center gap-1">
      {tabs.map((tab) => {
        const selected = tab.key === active
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={[
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
              selected ? 'bg-edge/60 text-txt' : 'text-muted hover:bg-edge/25 hover:text-txt',
            ].join(' ')}
          >
            {tab.dot && <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${tab.dot}`} />}
            <span className="whitespace-nowrap">{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
