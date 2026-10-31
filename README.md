# 海克斯大乱斗速查（AramHexQuickSearch）

海克斯大乱斗数据速查站 · 构建时离线分析 [aramhex-data](https://github.com/czgreat/aramhex-data)。

> **开发中** — 脚手架阶段，功能尚未实现。

## 技术栈

- 构建：Vite + TypeScript
- UI：React 19 + Tailwind CSS 4
- 数据层：TanStack Router + TanStack Query
- 部署：Cloudflare Workers（Static Assets，SPA 回退）
- 数据处理：Node.js 脚本（构建时离线分析，无服务端逻辑）
- 测试：Vitest

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 拉取数据 → 离线分析 → 启动 Vite 开发服务器 |
| `pnpm build` | 仅构建前端产物（`vite build`），**不**处理数据 |
| `pnpm full` | 完整流水线：拉取数据 → 离线分析 → `vite build` |
| `pnpm test` | 运行 Vitest 测试 |
| `pnpm preview` | `wrangler dev` 本地预览（需先有 `dist/`，即先跑过 `pnpm build` 或 `pnpm full`） |
| `pnpm deploy` | `pnpm full` 后部署到 Cloudflare Workers |

**`build` 与 `full` 的区别**：数据抓取与分析依赖外部数据源，日常改 UI 只需 `pnpm build`；需要刷新数据产物（或首次构建/部署）时用 `pnpm full`。完整文档见 `docs/plans/`。

## 数据来源与署名

- [aramhex-data](https://github.com/czgreat/aramhex-data) — CC BY-NC 4.0（英雄/海克斯/技能/分段统计数据）
- 海斗一图流公开 JSON — <https://haidou.zhishitft.cn/>（出装/流派数据，构建期拉取；接入见 Task 2）
- 腾讯 gtimg 静态资料 — <https://game.gtimg.cn/>（英雄名/图标等静态定义；接入见后续任务）

本项目非商业用途；数据许可归各来源所有，CC BY-NC 4.0 要求署名。

