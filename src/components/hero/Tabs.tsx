export interface TabDef<K extends string> {
  key: K
  label: string
  /** 可选色点类名（稀有度点等），调用方传共享映射里的 bg-* 字面量 */
  dot?: string
}

/** tab 元素 DOM id：`${idPrefix}-tab-${key}` */
function tabId(idPrefix: string, key: string): string {
  return `${idPrefix}-tab-${key}`
}

/** 面板元素 DOM id：`${idPrefix}-panel-${key}`（与 tabId 同一约定，供调用方给面板挂 id） */
export function panelId(idPrefix: string, key: string): string {
  return `${idPrefix}-panel-${key}`
}

/** 面板通用属性：id + role + aria-labelledby，与 TabBar 的 aria-controls 成对（展开写避免调用方漏接） */
export function tabPanelProps(idPrefix: string, key: string) {
  return {
    id: panelId(idPrefix, key),
    role: 'tabpanel' as const,
    'aria-labelledby': tabId(idPrefix, key),
  }
}

/**
 * 通用 tab 条（海克斯稀有度 / 出装流派共用）：选中态用面板色块而非下划线，贴合深色主题。
 * 覆盖的 aria 语义：role=tablist/tab、aria-selected、id + aria-controls 指向面板；
 * 调用方须给面板挂 tabPanelProps(idPrefix, key)（id + role=tabpanel + aria-labelledby），
 * 两侧约定由本模块派生、不会写岔。方向键漫游焦点（ARIA 完整模式）对这两个小 tab 条
 * 属过度设计，刻意省略——原生 Tab 键可达即可。
 */
export function TabBar<K extends string>({
  tabs,
  active,
  onChange,
  label,
  idPrefix,
}: {
  tabs: ReadonlyArray<TabDef<K>>
  active: K
  onChange: (key: K) => void
  /** tablist 的可访问名称 */
  label: string
  /** tab/面板 DOM id 前缀（面板侧用 tabPanelProps 传同一前缀） */
  idPrefix: string
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
            id={tabId(idPrefix, tab.key)}
            aria-selected={selected}
            aria-controls={panelId(idPrefix, tab.key)}
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
