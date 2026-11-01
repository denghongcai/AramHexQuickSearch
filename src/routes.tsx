import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  useRouterState,
} from '@tanstack/react-router'
import { BottomNav } from './components/BottomNav'
import { HeroRail } from './components/HeroRail'
import { OverviewStrip } from './components/OverviewStrip'
import { TopBar } from './components/TopBar'
import { AboutPage } from './routes/AboutPage'
import { AugmentsPage } from './routes/AugmentsPage'
import { HeroDetailPage } from './routes/HeroDetail'
import { OverviewPage } from './routes/Overview'
import { parseRarity, type Rarity } from '@/lib/augments'

/** 根布局：
 *  lg（≥1024px）— h-dvh 网格 360px+1fr，TopBar 56px，左右两栏各自内滚，整页无滚动条；
 *  <lg — 单列文档流：/ = 精简总览条（OverviewStrip）+ 英雄榜整页，其余路由整页显示，
 *  底部固定 BottomNav。 */
function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const onHome = pathname === '/'

  return (
    <div className="flex min-h-dvh flex-col bg-ink text-txt lg:h-dvh lg:overflow-hidden">
      <TopBar />
      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[360px_1fr] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
        {/* 移动端 / 专属（Task 8 移动 IA 决策）：总览条在列表上方；lg 下 display:none，
            不占 grid 单元，下面 rail/main 两栏布局不受影响 */}
        {onHome && <OverviewStrip className="lg:hidden" />}
        <HeroRail className={onHome ? '' : 'hidden lg:flex'} />
        <main
          className={[
            'min-h-0 min-w-0 flex-1 lg:overflow-y-auto',
            // 移动端给固定底导航留出高度（--bottom-nav-h 见 styles.css）
            'pb-(--bottom-nav-h) lg:pb-0',
            // hidden 需在 flex 之后生成才生效，见构建产物层序——勿调换 HeroRail 基础类里的 flex
            onHome ? 'hidden lg:block' : 'block',
          ].join(' ')}
        >
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}

const rootRoute = createRootRoute({
  component: RootLayout,
  // ?q=：英雄榜搜索词。声明在根路由，rail 在所有路由（lg 侧栏）都可见，各处均可读写。
  // q 为空/缺失时从 URL 上摘掉，保持地址干净。
  // ?rarity=：海克斯榜稀有度筛选（Task 12），空/非法值视为全部并从 URL 摘掉；q 的行为保持不变。
  validateSearch: (search: Record<string, unknown>): { q?: string; rarity?: Rarity } => ({
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    rarity: parseRarity(search.rarity),
  }),
  // 未知路径 → 回首页
  notFoundComponent: () => <Navigate to="/" replace />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: OverviewPage,
})

const heroRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/hero/$id',
  component: HeroDetailPage,
})

const augmentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/augments',
  component: AugmentsPage,
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: AboutPage,
})

const routeTree = rootRoute.addChildren([indexRoute, heroRoute, augmentsRoute, aboutRoute])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
