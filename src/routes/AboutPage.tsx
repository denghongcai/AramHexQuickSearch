import { type ReactNode } from 'react'
import { useMeta, type Meta } from '@/lib/api'
import { formatCount } from '@/lib/format'

/** 署名常量：链接与许可名称是公开事实，写死展示；meta 里能读到的只做补充（如 commit） */
const ARAMHEX_URL = 'https://github.com/czgreat/aramhex-data'
const ARAMHEX_LICENSE = 'CC BY-NC 4.0'
const ARAMHEX_LICENSE_URL = 'https://creativecommons.org/licenses/by-nc/4.0/deed.zh'
const HAIDOU_URL = 'https://haidou.zhishitft.cn/'
const GTIMG_URL = 'https://game.gtimg.cn/'

/** meta.sources 元素的宽松形状（构建期写入，缺字段时回退署名常量） */
interface SourceMeta {
  url?: string
  commit?: string
}

/** 从 meta.sources[key]（类型上是 Record<string, unknown>）安全取出已知字段 */
function sourceOf(meta: Meta | undefined, key: string): SourceMeta {
  const raw = meta?.sources?.[key]
  return raw && typeof raw === 'object' ? (raw as SourceMeta) : {}
}

/** 内容区块骨架：圆角描边卡 + 小节标题，桌面 / 移动端共用 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-edge bg-panel p-4">
      <h3 className="text-xs font-semibold text-muted">{title}</h3>
      <div className="mt-2 text-sm">{children}</div>
    </section>
  )
}

/** 外链：统一新窗口 + 不带 referrer */
function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="break-all font-medium text-accent hover:underline"
    >
      {children}
    </a>
  )
}

/**
 * /about 关于页：数据来源与署名（显著置顶，CC BY-NC 4.0 必须醒目）、
 * 方法说明（tier 规则从 meta.tierRule 读，不硬编码）、免责声明、数据快照。
 * 桌面单列 max-w 排版，移动端顺滑堆叠。
 */
export function AboutPage() {
  const { data: meta } = useMeta()
  // 链接统一策略：展示用常量兜底，meta.sources 能读到同名字段则优先（三源一致，不单源特殊化）
  const aramhex = sourceOf(meta, 'aramhex')
  const haidou = sourceOf(meta, 'haidou')
  const gtimg = sourceOf(meta, 'gtimg')

  return (
    <section className="mx-auto w-full max-w-3xl space-y-3 p-3 lg:p-6">
      <h2 className="text-lg font-semibold lg:text-xl lg:font-bold">关于</h2>

      {/* 1. 数据来源与署名（显著位置） */}
      <Section title="数据来源与署名">
        <ul className="space-y-3">
          <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="w-16 shrink-0 text-xs text-muted">统计数据</span>
            <span className="min-w-0 flex-1 basis-48">
              <ExtLink href={aramhex.url ?? ARAMHEX_URL}>czgreat/aramhex-data</ExtLink>
              <span className="mt-0.5 block text-[0.6875rem] text-muted">
                英雄榜 / 海克斯榜胜率统计来源
              </span>
            </span>
            {/* 许可证醒目展示（meta 里是 SPDX 写法 CC-BY-NC-4.0，此处按人读习惯展示） */}
            <a
              href={ARAMHEX_LICENSE_URL}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent hover:underline"
            >
              {ARAMHEX_LICENSE}
            </a>
          </li>
          <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="w-16 shrink-0 text-xs text-muted">出装 / 流派</span>
            <span className="min-w-0 flex-1 basis-48">
              <ExtLink href={haidou.url ?? HAIDOU_URL}>海斗一图流公开数据（haidou.zhishitft.cn）</ExtLink>
              <span className="mt-0.5 block text-[0.6875rem] text-muted">出装与流派家族的原始公开数据</span>
            </span>
          </li>
          <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="w-16 shrink-0 text-xs text-muted">静态资料</span>
            <span className="min-w-0 flex-1 basis-48">
              <ExtLink href={gtimg.url ?? GTIMG_URL}>腾讯 game.gtimg.cn</ExtLink>
              <span className="mt-0.5 block text-[0.6875rem] text-muted">英雄名称 / 头像等静态资源</span>
            </span>
          </li>
        </ul>
      </Section>

      {/* 2. 方法说明 */}
      <Section title="方法说明">
        <dl className="space-y-2">
          <div>
            <dt className="text-xs text-muted">Tier 分位规则</dt>
            <dd className="mt-0.5">
              {/* 规则文案以 meta.json 的 tierRule 为准，不硬编码 */}
              {meta?.tierRule ?? '按胜率分位切档（S/A/B/C/D），详见数据仓库统计脚本。'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">流派家族聚类</dt>
            <dd className="mt-0.5">
              按核心位装备的共现关系做 Jaccard 凝聚聚类，把经常一起出现的装备归为同一流派家族；
              实现见仓库 <code className="font-tnum text-xs">scripts/lib/haidou-builds.mjs</code>。
            </dd>
          </div>
        </dl>
      </Section>

      {/* 3. 免责声明 */}
      <Section title="免责声明">
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>本站为非官方粉丝工具，与腾讯、Riot Games 均无隶属或合作关系。</li>
          <li>
            数据仅供研究参考，统计来源采用 <span className="font-medium text-txt">CC BY-NC</span>{' '}
            许可授权，仅限非商业用途。
          </li>
          <li>胜率、登场率等统计不构成任何游戏建议。</li>
        </ul>
      </Section>

      {/* 4. 数据快照 */}
      <Section title="数据快照">
        {meta ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">版本</dt>
              <dd className="mt-0.5 font-tnum font-semibold tabular-nums text-accent">
                Patch {meta.patch}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">快照时间</dt>
              <dd className="mt-0.5 font-tnum tabular-nums">
                {meta.snapshotAt.slice(0, 16).replace('T', ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">有效对局</dt>
              <dd
                className="mt-0.5 font-tnum tabular-nums"
                title={`精确值 ${meta.gamesValid.toLocaleString('en-US')}`}
              >
                {formatCount(meta.gamesValid)}场
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">英雄</dt>
              <dd className="mt-0.5 font-tnum tabular-nums">{meta.heroCount} 名</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">海克斯</dt>
              <dd className="mt-0.5 font-tnum tabular-nums">{meta.augmentCount} 个</dd>
            </div>
            {aramhex.commit && (
              <div>
                <dt className="text-xs text-muted">aramhex 快照</dt>
                <dd className="mt-0.5 font-tnum tabular-nums">
                  <ExtLink href={`${aramhex.url ?? ARAMHEX_URL}/commit/${aramhex.commit}`}>
                    {aramhex.commit.slice(0, 7)}
                  </ExtLink>
                </dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="animate-pulse text-sm text-muted">快照信息加载中…</p>
        )}
      </Section>
    </section>
  )
}
