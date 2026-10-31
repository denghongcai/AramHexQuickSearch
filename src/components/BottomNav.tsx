import { Link } from '@tanstack/react-router'

/** 底部导航：<lg 显示，lg 隐藏；三个 tab 对应 / 、/augments 、/about */
const TABS = [
  { to: '/', label: '英雄', exact: true },
  { to: '/augments', label: '海克斯', exact: false },
  { to: '/about', label: '关于', exact: false },
] as const

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-edge bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          activeOptions={{ exact: tab.exact }}
          className="flex flex-col items-center py-2.5 text-xs"
          activeProps={{ className: 'text-accent' }}
          inactiveProps={{ className: 'text-muted' }}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
