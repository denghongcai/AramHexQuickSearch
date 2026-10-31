# AramHexQuickSearch 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 海克斯大乱斗（ARAM Mayhem）数据速查站——构建时离线拉取并分析 aramhex-data（+海斗公开出装数据），产出纯静态 Cloudflare Workers 应用；PC 端同屏 Dashboard 吃满宽度，移动端海斗式单列+底部导航。

**Architecture:** 三层。①数据管线：`scripts/` 内 Node 脚本在构建期抓取三个公开源（AramHex git 仓库 / 海斗公开 JSON / 腾讯 gtimg 静态定义），解析、聚合、聚类，产出 `public/data/*.json`；②纯静态 SPA：Vite + React 19 + TanStack Router/Query + Tailwind v4，运行时零外部请求；③部署：Wrangler 4 Workers Static Assets（SPA fallback + `_headers`），无服务端代码。仓库公开 ⇒ 代码中不得出现任何密钥/令牌（三个数据源均为公开匿名可访问，无需凭证）。

**Tech Stack:** Vite 7 · React 19 · TypeScript 5.9 · TanStack Router v1（code-based）· TanStack Query v5 · Tailwind CSS 4（@tailwindcss/vite）· Vitest 3 · pnpm · Wrangler 4（Workers Static Assets）· pinyin-pro（仅构建期）

---

## 背景约束（实现者必读）

1. **数据源与许可**（全部公开、匿名、无凭证）：
   - **A = aramhex-data**：`https://github.com/czgreat/aramhex-data`（CC BY-NC 4.0）。提供英雄胜率、英雄×海克斯、召唤师技能、分段。**没有出装数据**。
   - **B = 海斗公开 JSON**：`https://haidou.zhishitft.cn/data/index.json` 及 `data/heroes/{slug}.json`。提供出装/流派（站方人工审核的成品，非本次聚类产物）、条目中文名。
   - **C = 腾讯 gtimg 静态定义**：`https://game.gtimg.cn/images/lol/act/img/js/heroList/hero_list.js`（英雄拉丁名/图标/称号）。AramHex 与海斗的上游静态源，仅取公开静态资料。
2. **聚类**（用户要求"离线分析聚类"）：无逐局出装数据源，无法复刻海斗的原始聚类。可做且要做的是——**装备共现聚类**：从源 B 的全部流派核心装构建共现图，凝聚聚类推导"流派家族"，用于校验 8 桶分类并驱动 UI 分组。算法必须确定性（稳定排序）。
3. **公开仓库红线**：不提交 `.cache/`、不写任何 token（也不需要）、README 必须含数据署名（CC BY-NC 4.0 要求 attribution）。
4. **降级**：源 B 抓取失败时出装模块输出 `builds: null`，UI 隐藏该区块，构建不失败。

## 数据版本判定

取 `patches/` 下按语义版本排序最新的 `X.Y/normal`（排除 `-prehotfix`、`-pbe` 目录）。当前为 `16.21/normal`（2322 万局，快照 2026-10-28）。

---

### Task 1: 项目脚手架

**Files:** 创建 package.json、vite.config.ts、tsconfig.json、wrangler.jsonc、.gitignore、index.html、src/main.tsx、src/routes.tsx（空壳）、public/_headers、README.md

**Step 1: 初始化**

```bash
cd /home/dhc/workspace/AramHexQuickSearch && git init -b main
```

**Step 2: 写 package.json**

```json
{
  "name": "aramhex-quick-search",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "fetch:data": "node scripts/fetch-sources.mjs",
    "build:data": "node scripts/analyze.mjs",
    "prebuild": "pnpm -s fetch:data && pnpm -s build:data",
    "dev": "pnpm -s fetch:data && pnpm -s build:data && vite",
    "build": "vite build",
    "test": "vitest run",
    "preview": "pnpm -s prebuild && wrangler dev",
    "deploy": "pnpm -s build && wrangler deploy"
  }
}
```

随后 `pnpm add react react-dom @tanstack/react-router @tanstack/react-query` 与 `pnpm add -D vite @vitejs/plugin-react typescript @types/react @types/react-dom tailwindcss @tailwindcss/vite vitest wrangler pinyin-pro @cloudflare/workers-types`，版本取最新稳定。

**Step 3: 配置文件**

- `vite.config.ts`：react + tailwindcss 插件。
- `tsconfig.json`：bundler 模式，strict，paths `@/* -> src/*`。
- `wrangler.jsonc`：

```jsonc
{
  "name": "aramhex-quick-search",
  "compatibility_date": "2026-10-01",
  "assets": { "directory": "./dist", "not_found_handling": "single-page-application" }
}
```

- `public/_headers`：`/*` 加 `X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`。
- `.gitignore`：`node_modules/ dist/ .cache/ .dev.vars .wrangler/`。
- `index.html`：`<html lang="zh-CN">`，标题"海克斯大乱斗速查"，`theme-color #0b1210`。

**Step 4: 空壳可跑** — `src/main.tsx` 渲染 `<div>AramHexQuickSearch</div>`；`pnpm build` 通过。

**Step 5: Commit** `git commit -m "chore: scaffold vite+react+tanstack+workers"`

---

### Task 2: 数据源抓取 scripts/fetch-sources.mjs

**Files:** `scripts/fetch-sources.mjs`、`scripts/lib/paths.mjs`、`tests/fetch-sources.test.mjs`

约定：所有缓存入 `.cache/`（gitignored）。支持环境变量覆盖（非密钥，仅目录）：`ARAMHEX_LOCAL_DIR`、`HAIDOU_LOCAL_DIR`。

**Step 1: 写失败测试**（测试纯逻辑函数，网络函数薄封装不单测）

```js
// tests/fetch-sources.test.mjs
import { describe, it, expect } from 'vitest'
import { shouldSkipFetch, haidouHeroUrls } from '../scripts/fetch-sources.mjs'

describe('fetch-sources', () => {
  it('cache 命中且未要求 FRESH 时跳过', () => {
    expect(shouldSkipFetch({ cacheExists: true, fresh: false })).toBe(true)
    expect(shouldSkipFetch({ cacheExists: true, fresh: true })).toBe(false)
    expect(shouldSkipFetch({ cacheExists: false, fresh: false })).toBe(false)
  })
  it('生成 173 个英雄 JSON 的 URL 列表', () => {
    const urls = haidouHeroUrls(['yasuo', 'aatrox'], 'https://haidou.zhishitft.cn')
    expect(urls).toEqual([
      'https://haidou.zhishitft.cn/data/heroes/yasuo.json',
      'https://haidou.zhishitft.cn/data/heroes/aatrox.json',
    ])
  })
})
```

**Step 2: 运行确认失败** `pnpm vitest run tests/fetch-sources.test.mjs` → FAIL（模块不存在）

**Step 3: 实现** `scripts/fetch-sources.mjs`

- `fetchAramhex()`: `git clone --depth 1 https://github.com/czgreat/aramhex-data .cache/aramhex-data`（已存在则 `git -C .cache/aramhex-data pull --ff-only`；失败且目录存在→警告复用）。记录 commit：`git -C … rev-parse HEAD`。
- `fetchHaidou()`: 下载 `data/index.json`、`data/augments/index.json`、`data/items/index.json`、`config/augment-flow-exclusions.json` 与全部 `data/heroes/{slug}.json`（slug 列表来自 index.json）。并发 8，UA 正常浏览器串，重试 2 次，指数退避。**失败容忍**：单个英雄失败→记入 `.cache/haidou/FAILED.json`，不中断。
- `fetchGtimg()`: 下载 `hero_list.js`、`summonerskill_list.js`（文本）。
- 每步写 `.cache/sources.json`：{aramhexCommit, fetchedAt, counts}。

**Step 4: 测试通过** **Step 5: Commit** `feat: offline source fetcher with cache and graceful degradation`

---

### Task 3: AramHex 解析与最新版本检测

**Files:** `scripts/lib/aramhex.mjs`、`tests/aramhex.test.mjs`、`tests/fixtures/aramhex/`（手工造 mini 结构：`patches/16.21/normal/{meta,heroes,augments,hero_augments,hero_spells}.json`、`patches/16.21-pbe/normal/meta.json`、`patches/16.20/normal/meta.json`、`bands/casual|mid|top/heroes.json`）

**Step 1: 失败测试**

```js
describe('aramhex', () => {
  it('latestPatch 排除 pbe/prehotfix', () =>
    expect(latestPatch(new Set(['16.19','16.20','16.21','16.21-pbe','16.21-prehotfix']))).toBe('16.21'))
  it('解析英雄胜率并按胜率排序', () => { /* fixtures: 157 胜率最高排第1 */ })
  it('hero_augments 按 heroId→augmentId 展开 games/wins/winRate', () => {})
  it('bands 合并到英雄: band→winRate', () => {})
  it('spells 组合 "4+14" 解析为 ids 数组', () => {})
})
```

**Step 2: 跑失败** **Step 3: 实现**（注意：heroes.json 的 win_rate 是 0-1 小数；输出统一 `{id,name,title,games,wins,winRate,pickRate,rank}`；meta 里取 `snapshot_at`、`games_valid`）**Step 4: 通过** **Step 5: Commit**

---

### Task 4: 聚合与分级（tier）

**Files:** `scripts/lib/aggregate.mjs`、`tests/aggregate.test.mjs`

**Step 1: 失败测试**

- `aggregateAugments(heroAugments, augmentsMeta)`：跨英雄求和 games/wins；`pickRate = games / Σ(该稀有度全部 augment games)`；`heroCount`；按 winRate 降序 rank。断言固定 fixture 数值。
- `computeTiers(heroes)`：按 winRate 分位切 S/A/B/C/D = 前 8% / 20% / 40% / 24% / 后 8%（173 人 ≈ 14/35/69/41/14）。断言边界与数量。
- `spellName(ids)`：静态表 `{1:'净化',3:'疾跑',4:'闪现',6:'虚弱',7:'治疗',11:'惩戒',12:'传送',14:'点燃',21:'屏障',32:'标记'}`，`'4+14'→'闪现+点燃'`。

**Step 2-4: TDD 循环** **Step 5: Commit**

---

### Task 5: 搜索键与拼音

**Files:** `scripts/lib/search.mjs`、`tests/search.test.mjs`

**Step 1: 失败测试**：`buildSearchKeys({name:'亚索', title:'疾风剑豪', alias:'Yasuo'})` → `{n:['亚索','yasuo'], t:['疾风剑豪','jifengjianhao'], p:['yasuo'], f:['yaso','jfh']}`（f=拼音首字母；英文统一小写去符号；用 pinyin-pro，构建期依赖）。

**Step 2-4: TDD** **Step 5: Commit**

---

### Task 6: 海斗出装解析 + 装备共现聚类

**Files:** `scripts/lib/haidou-builds.mjs`、`tests/haidou-builds.test.mjs`、`tests/fixtures/haidou/`（2 个英雄 JSON + items index 片段）

**Step 1: 失败测试**

- `parseBuilds(heroJson, itemMeta)`：builds[] → `{key,name,sampleCount,pickRate,winRate,core:{itemIds,names},starter:[names],recommended:[names],summary}`；itemIds 不在 itemMeta 时保留 id 作名（容错）。
- `clusterItemFamilies(builds)`：
  - 节点=出现于 ≥2 个 build 核心位的 itemId；边权=同 build 共现次数（按 sampleCount 加权）。
  - 凝聚聚类（每次合并边权最大的对，Jaccard 相似度，阈值 0.5 停止）；**排序必须稳定**（同权按 id 升序）→ 输出 `{families:[{id,items:[ids],buildCount}], itemFamily:{}}`。
  - fixture：3 个天然家族（暴击系 3 件、法系 3 件、坦克系 2 件，共现清晰）→ 断言恰好聚成 3 簇。

**Step 2-4: TDD** **Step 5: Commit**

---

### Task 7: 汇总输出 scripts/analyze.mjs

**Files:** `scripts/analyze.mjs`、`tests/analyze.test.mjs`

**Step 1: 失败测试**（用 fixtures 目录跑全管线，断言输出 JSON 形状）

**Step 2: 实现**：串 Tasks 3-6，写 `public/data/`：

- `meta.json`：`{patch, snapshotAt, gamesValid, heroCount, augmentCount, generatedAt, tierRule, sources:{aramhex:{commit,url,license:'CC-BY-NC-4.0'}, haidou:{url,note}, gtimg:{url}}}`
- `heroes.json`：`{heroes:[{id,name,title,alias,icon,tier,rank,winRate,pickRate,games,search,families?}]}`（icon = gtimg URL，构建期拼好）
- `augments.json`：全局海克斯排行（含 name/rarity/games/wins/winRate/pickRate/heroCount/rank）
- `hero/{id}.json`：详情（见背景约束的形状；bands 含 all/casual/mid/top 的 {winRate,games}；augments 按稀有度分组、组内按 winRate 降序、附 lowSample；builds 来自源 B 或 null）
- `families.json`：聚类产物

**Step 3: 通过** **Step 4: 真实数据冒烟**：`pnpm fetch:data && pnpm build:data && ls -la public/data`——173 个 hero 文件、meta.patch='16.21'。**Step 5: Commit**

---

### Task 8: 应用外壳（路由 + 响应式 Dashboard 骨架）

**Files:** `src/main.tsx`、`src/routes.tsx`、`src/App.css`(删)→`src/styles.css`、`src/components/{TopBar,BottomNav,HeroRail}.tsx`

路由（code-based TanStack Router）：`/`(总览) `/hero/$id` `/augments` `/about`，404→index。

布局（Tailwind）：
- `lg:`（≥1024）：`h-dvh grid grid-cols-[360px_1fr] overflow-hidden`；左=HeroRail（搜索+列表，内部 `overflow-y-auto`），右=`<Outlet/>`（`overflow-y-auto`）。**顶栏 fixed 高度 56px，两栏吃满剩余高度**。
- `<lg`：单列；`/` 即英雄榜整页；详情是整页路由；底部 BottomNav（英雄/海克斯/关于），`env(safe-area-inset-bottom)`。
- 主题：dark（底 `#0b1210`、面板 `#111917`、线 `#223029`），主色青 `#3ef0b0` 系，tier 色 S 金/A 紫/B 蓝/C 灰/D 暗红，rarity 色 棱彩 `#d7a7ff`/金 `#efc54a`/银 `#aebcc3`，数字 `tabular-nums`。

数据：TanStack Query；`queryFn = fetch('/data/…').then(r=>r.json())`；`staleTime: Infinity`。Rail 行 hover prefetch `hero/{id}.json`。

**Step 1-3: 实现并 build 通过** **Step 4: `pnpm dev` + playwright 截图验证 lg 与 lg 断点** **Step 5: Commit**

---

### Task 9: 英雄榜 Rail + 搜索

**Files:** `src/components/HeroRail.tsx`、`src/lib/search.ts`（运行时匹配：对预计算 search keys 做 includes）

- 输入 `?q=`（router search param，受控输入写入 URL，replace 模式）。
- 匹配：对 `search.n/t/p/f` 任一 includes（查询串先 `NFKC→小写→去非字母数字`；拼音查询直接比对 p 字段）。
- 行内容：`#rank 图标 名称 tier片 wr% pick%`，当前路由高亮。
- **测试**：`src/lib/search.ts` 纯函数 vitest 用例（拼音/别名/称号/数字 id）。

**Commit**

---

### Task 10: 总览页 `/`

**Files:** `src/routes/Overview.tsx`

内容（桌面一屏放下）：meta 卡（patch/快照时间/有效对局数/英雄数）、Tier 分布条（S~D 人数）、Top10 英雄迷你榜、Top10 海克斯迷你榜（链接 `/augments`）、流派家族概览（families.json：每族 top3 装备+覆盖 build 数）。全部 `grid` 多列铺满。

**Commit**

---

### Task 11: 英雄详情 `/hero/$id`

**Files:** `src/routes/HeroDetail.tsx` + 子组件 `AugmentTable, BandBars, SpellList, BuildPanel`

桌面布局（目标 ≤1 屏 + 表格内部微滚）：

```
┌ 头部: 图标 名称 称号 [S] 胜率 登场 场次 ────────────┐
├ 海克斯(棱彩|金|银 tabs, 占 2 列, 表内滚动) ┬ 召唤师技能 Top5 │
│  # 名称 胜率 场次 lowSample标记           ├ 分段对比条形    │
│                                          └ 出装流派 tabs   │
└──────────────────────────────────────────┴────────────────┘
```

- 海克斯表：默认棱彩；行=名称/胜率(相对该英雄全体胜率的 ±pp 着色)/场次/低样本灰显。
- 分段对比：all/casual/mid/top 四行横条（CSS 宽度百分比）。
- 出装：`builds===null` 时整块隐藏并显示一行"出装数据源暂不可用"。

**Commit**

---

### Task 12: 海克斯排行 `/augments` + 关于 `/about`

- `/augments`：全宽表格（rank/名称/稀有度/胜率/登场/场次/覆盖英雄数），稀有度筛选 tabs，`?rarity=` 进 URL。移动端卡片化。
- `/about`：数据来源三行署名（**AramHex CC BY-NC 4.0 必须显著**）、tier 分位规则、流派家族聚类方法一句话、免责声明（非官方，与腾讯/Riot 无隶属；非商业用途）。

**Commit**

---

### Task 13: 端到端验证与收尾

**Step 1:** `pnpm build`（prebuild 全链路真实抓取）→ `wrangler dev` 本地起。
**Step 2:** playwright 验证清单：
- `/` 桌面 1920×1080 截图：无整页滚动条（`document.documentElement.scrollHeight <= innerHeight+2`）。
- 搜索"ym"（亚索首字母）→ rail 过滤到亚索。
- `/hero/157` 详情渲染、棱彩/金/银切换、分段条出现。
- `/augments` 表格渲染且按胜率降序。
- 375×812 移动端截图：单列+底部导航，无横向滚动（`scrollWidth <= innerWidth`）。
- 断网重载（route block `**/data/**`）→ 页面仍可渲染（静态资产本地）。
**Step 3:** README 完成：简介/快速开始/构建管线说明/数据来源与许可署名/部署（`wrangler deploy`）/公开仓库注意事项。
**Step 4:** `git commit`；打 tag `v0.1.0`。

---

## 明确不做（YAGNI）

- 无 SSR/边缘函数逻辑（纯静态资产）
- 无多版本切换、无对比页、无收藏/本地存储偏好
- 不搬运海斗图片资源（海报/海克斯图标热链或缺失，v1 用色块）
- 不做账号、后端 API、统计分析
