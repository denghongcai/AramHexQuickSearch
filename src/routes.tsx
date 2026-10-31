import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  useParams,
  useRouterState,
} from '@tanstack/react-router'
import { BottomNav } from './components/BottomNav'
import { HeroRail } from './components/HeroRail'
import { TopBar } from './components/TopBar'
import { useHeroes, useMeta } from './lib/api'

/** 根布局：
 *  lg（≥1024px）— h-dvh 网格 360px+1fr，TopBar 56px，左右两栏各自内滚，整页无滚动条；
 *  <lg — 单列文档流，/ 即英雄榜整页，其余路由整页显示，底部固定 BottomNav。 */
function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const onHome = pathname === '/'

  return (
    <div className="flex min-h-dvh flex-col bg-ink text-txt lg:h-dvh lg:overflow-hidden">
      <TopBar />
      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[360px_1fr] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
        <HeroRail className={onHome ? '' : 'hidden lg:flex'} />
        <main
          className={[
            'min-h-0 min-w-0 flex-1 lg:overflow-y-auto',
            // 移动端给固定底导航留出高度
            'pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0',
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

/** / 总览（Task 10 填充） */
function OverviewPage() {
  const { data: meta } = useMeta()

  return (
    <section className="p-6">
      <h2 className="text-lg font-semibold">总览</h2>
      {meta && (
        <p className="mt-2 font-tnum text-xs tabular-nums text-muted">
          Patch {meta.patch} · {meta.heroCount} 英雄 · {meta.augmentCount} 海克斯
        </p>
      )}
      <p className="mt-6 text-sm text-muted">总览内容在 Task 10 填充。</p>
    </section>
  )
}

/** /hero/$id 详情（Task 11 填充） */
function HeroDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string }
  const { data } = useHeroes()
  const hero = data?.heroes.find((h) => String(h.id) === id)

  return (
    <section className="p-6">
      <h2 className="text-lg font-semibold">
        {hero ? `${hero.name} · ${hero.title}` : `英雄 #${id}`}
      </h2>
      <p className="mt-2 text-sm text-muted">详情页在 Task 11 填充。</p>
    </section>
  )
}

/** /augments（Task 12 填充） */
function AugmentsPage() {
  return (
    <section className="p-6">
      <h2 className="text-lg font-semibold">海克斯强化</h2>
      <p className="mt-2 text-sm text-muted">强化符文列表在 Task 12 填充。</p>
    </section>
  )
}

/** /about（Task 12 填充） */
function AboutPage() {
  return (
    <section className="p-6">
      <h2 className="text-lg font-semibold">关于</h2>
      <p className="mt-2 text-sm text-muted">数据来源与口径说明在 Task 12 填充。</p>
    </section>
  )
}

const rootRoute = createRootRoute({
  component: RootLayout,
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
