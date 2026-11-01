# 海克斯大乱斗速查（AramHexQuickSearch）

大乱斗（ARAM）海克斯强化与英雄胜率数据速查站：构建时离线分析三份公开数据源，产出纯静态 JSON，前端零服务端逻辑，部署在 Cloudflare Workers（Static Assets）。

## 功能

- **英雄榜 `/`** — 173 名英雄按名次排列（胜率 / 登场率 / 场次 / Tier 分位）；支持名称、称号、拼音全拼与首字母、别名搜索（落 `?q=`，刷新/分享可还原）；桌面左栏列表 + 右栏总览条（海克斯胜率 Top10、流派家族、Tier 分布），移动端单列堆叠。
- **英雄详情 `/hero/$id`** — 海克斯强化按稀有度分档（棱彩 / 金色 / 银色，±pp 相对该英雄全体胜率，低样本灰显）；召唤师技能组合 Top5；分段胜率横条（全体 / 休闲 / 中坚 / 顶尖）；出装流派分 tab（核心装 / 出门装 / 推荐装 / 玩法）。
- **海克斯排行 `/augments`** — 全量海克斯按胜率降序（登场率为同稀有度内占比口径）；稀有度筛选落 `?rarity=` 深链。
- **关于 `/about`** — 数据来源署名（CC BY-NC 4.0 醒目展示）、方法说明、免责声明、数据快照。

响应式：lg（≥1024px）整页吃满一屏、双栏各自内滚；<lg 单列文档流 + 底部导航。

## 技术栈

- 构建：Vite + TypeScript
- UI：React 19 + Tailwind CSS 4
- 数据层：TanStack Router + TanStack Query
- 部署：Cloudflare Workers（Static Assets，SPA 回退）
- 数据处理：Node.js 脚本（构建时离线分析，无服务端逻辑）
- 测试：Vitest

## 快速开始

```bash
pnpm install        # 安装依赖（Node >= 22.12）
pnpm dev            # 拉取数据 → 离线分析 → 启动 Vite 开发服务器
pnpm test           # 运行 Vitest 测试
pnpm full           # 完整流水线：拉取数据 → 离线分析 → vite build
pnpm exec wrangler dev   # 本地以 Workers Static Assets 配置预览 dist/（需先 pnpm full）
pnpm deploy         # pnpm full 后 wrangler deploy 部署到 Cloudflare Workers
```

**`build` 与 `full` 的区别**：`pnpm build` 仅构建前端产物，不触碰数据；`pnpm full` 才会拉取并重新分析数据源。日常改 UI 用 `build`，刷新数据（或首次构建/部署）用 `full`。

## CI 自动部署（每日）

`.github/workflows/deploy.yml`：每天北京时间 16:00（UTC 08:00）自动拉取最新数据并部署 Workers；也可在 Actions 页手动触发（Run workflow）。

一次性配置（只有仓库所有者能做，凭据不进代码）：

1. Cloudflare 控制台 → My Profile → API Tokens → 创建自定义令牌，权限：`Account / Workers Scripts / Edit`（建议再加 `Account / Account Settings / Read`）
2. GitHub 仓库 → Settings → Secrets and variables → Actions → New repository secret，添加两个：
   - `CLOUDFLARE_API_TOKEN` — 上一步的令牌
   - `CLOUDFLARE_ACCOUNT_ID` — Cloudflare 控制台右侧栏的 Account ID
3. 到 Actions 页手动跑一次 `deploy` 验证

安全边界：公开仓库的 fork PR 拿不到 secrets，无法借 PR 部署；手动触发需要仓库 write 权限（仅所有者）；工作流文件只引用密钥名，不包含任何值。

## 构建管线

```
scripts/fetch-sources.mjs        scripts/analyze.mjs                 前端
三源抓取/缓存  ──────────────▶  离线分析与聚合一 ──────────────▶  public/data/*.json ──▶ vite 按需 fetch
.cache/（gitignore）             （stats → 排名/tier/聚类/检索键）
```

1. **抓取**（`pnpm fetch:data`）：三源全部匿名公开，缓存进 `.cache/`（gitignored，命中缓存则跳过）：
   - `aramhex` — `git clone/pull` [czgreat/aramhex-data](https://github.com/czgreat/aramhex-data)（统计数据主源）；
   - `haidou` — 海斗一图流公开 JSON 抓取（出装/流派原始数据）；
   - `gtimg` — 腾讯 game.gtimg.cn 静态资料（英雄名/图标等定义）。
2. **分析**（`pnpm build:data`）：读 `.cache/`，按数据版本自动取 aramhex `patches/` 目录里最新的正式版本号（如 `16.21`），聚合出英雄榜、海克斯榜、分段/技能统计、装备共现聚类（流派家族）、构建期检索键，写入 `public/data/`（`meta.json`、`heroes.json`、`augments.json`、`families.json`、`hero/{id}.json`）。
3. **构建**：`vite build` 把 `public/` 一并拷进 `dist/`，wrangler 按 Static Assets 部署 `dist/`。

环境变量（均只是目录/开关，无密钥）：

| 变量 | 作用 |
| --- | --- |
| `FRESH=1` | 强制重新抓取（忽略缓存命中） |
| `ARAMHEX_LOCAL_DIR` | 用本地 aramhex-data 检出代替 clone/pull |
| `HAIDOU_LOCAL_DIR` | 用本地海斗镜像代替 HTTP 抓取 |
| `DEBUG=1` | 抓取阶段输出详细日志（如 gtimg 文件头部采样） |

海斗整体不可用时降级为 `builds: null`（详情页出装面板显示「暂不可用」），不影响其余数据；只有 aramhex 首次 clone 失败才是致命错误。

## 数据来源与许可署名

- [czgreat/aramhex-data](https://github.com/czgreat/aramhex-data) — 英雄/海克斯/技能/分段统计数据，**CC BY-NC 4.0** 许可。该许可要求**署名**：本站在「关于」页显著标注来源与许可链接；使用本项目公开部署时同样需要保留该署名。
- 海斗一图流公开 JSON — <https://haidou.zhishitft.cn/>（出装/流派数据，构建期拉取）。口径说明：出装流派为该站公开的推荐组合，本项目仅做装备共现聚类与翻译整理。
- 腾讯 gtimg 静态资料 — <https://game.gtimg.cn/>（英雄名/图标等静态定义）。口径说明：仅取静态资料字段，统计口径与腾讯官方无关。

本项目为**非商业**用途；各数据许可归来源所有。英雄/海克斯胜率的统计口径以 aramhex 为准，出装与流派的原始口径以海斗为准——两者样本与统计方法不同，页面内已按区块标注。

## 已知取舍与延后项

- **IME 组合输入未做缓冲**：搜索框在输入法组合期间每个按键都会同步到 `?q=`（URL 为 replace 模式，不产生历史记录）。实测可用（组合文本会命中拼音键），但未做 compositionstart/end 缓冲优化；如手感有问题可后续加缓冲。
- **抓取并发池未提升为共享库**：`scripts/fetch-sources.mjs` 内的 8-worker pool 为该文件私有实现；若后续管线新增并发抓取需求，先把它提为 `scripts/lib/` 纯函数并补测试再复用。
- 代码许可为 MIT（见 LICENSE）；数据许可独立（见上节），两者不相覆盖。

## 目录结构速览

```
├── scripts/                  # 数据管线（Node，无依赖）
│   ├── fetch-sources.mjs     #   三源抓取/缓存（FRESH=1 / *LOCAL_DIR 见上表）
│   ├── analyze.mjs           #   离线分析 → public/data/
│   └── lib/                  #   各源解析、tier 分位、检索键、聚类
├── public/data/              # 管线产物（gitignored，pnpm full 重新生成）
├── src/
│   ├── routes/               # 四个路由页面（/ 、/hero/$id 、/augments 、/about）
│   ├── components/           # TopBar / HeroRail / OverviewStrip / BottomNav / hero/*
│   ├── lib/                  # api 类型与查询、搜索、tier、稀有度映射等
│   └── routes.tsx            # 路由表与根布局（?q= / ?rarity= 状态在 URL）
├── tests/                    # 管线脚本测试（fixtures 本地样张）
├── docs/plans/               # 设计与实施计划文档
└── wrangler.jsonc            # Workers Static Assets 配置（SPA 回退）
```

## 公开仓库注意事项

- 仓库内**无任何密钥/令牌**：三个数据源都是匿名公开接口，抓取脚本不带鉴权。
- `.cache/`（原始数据缓存）与 `public/data/`（分析产物）均 gitignored，不入库；克隆后跑一次 `pnpm full` 即可重建。
- Playwright 验收截图与运行产物（`.playwright-dev/`、`.playwright-cli/`、`.wrangler/`）同样不入库。
- 部署用自己的 Cloudflare 账号；`wrangler.jsonc` 不含账号敏感信息。
