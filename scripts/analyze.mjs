#!/usr/bin/env node
/**
 * 构建期数据管线：把 .cache/ 里三个来源（aramhex / haidou / gtimg）解析、聚合、
 * 写出 public/data/*.json（前端唯一数据面，gitignored）。
 *
 * 主体是可测纯函数 buildDataset(cacheDirs, manifest)（只读入参目录、返回内存对象）；
 * main() 只是 IO 壳：读 .cache/sources.json（fetch-sources.mjs 产物）→
 * buildDataset → writeDataset(public/data)。直接 import 本模块不会执行构建。
 *
 * 降级契约（与 fetch-sources 对齐）：
 * - 海斗可用性只看 manifest.haidouDir 是否为 null（整体宕机后磁盘上可能仍残留
 *   旧的 .cache/haidou/ 目录，目录存在性不是信号）；
 * - haidouDir 为 null → 全部英雄 builds:null、buildCount 0、families 空，流程不中断；
 * - index.json 声称可用而 heroes/{slug}.json 单文件缺失 → 该英雄 builds:null +
 *   warn（fetch 侧本就按文件粒度容错记 FAILED.json）；index.json 本身缺失/结构
 *   漂移 → 报错（manifest 声称可用而缓存不一致，必须大声失败）；
 * - gtimg hero_list.js 缺失/结构漂移 → 报错（alias/icon 是硬依赖，无降级路径）；
 * - 单个英雄在 gtimg 无 alias（理论上不该发生）→ 该英雄 alias/icon 为 null + warn，
 *   检索键不含拉丁词项。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'

import { parseAramhex } from './lib/aramhex.mjs'
import { aggregateAugments, computeTiers, spellName } from './lib/aggregate.mjs'
import { buildItemMeta, clusterItemFamilies, parseBuilds } from './lib/haidou-builds.mjs'
import { DATA_DIR, SOURCES_JSON } from './lib/paths.mjs'
import { buildSearchKeys } from './lib/search.mjs'

/** meta.tierRule 固定声明，与 aggregate.mjs computeTiers 的切档口径一致。 */
export const TIER_RULE = 'S/A/B/C/D = 前8%/20%/40%/24%/后8%（累计ceil+同胜率不拆档）'

const ARAMHEX_SOURCE_URL = 'https://github.com/czgreat/aramhex-data'
const ARAMHEX_LICENSE = 'CC-BY-NC-4.0'
const HAIDOU_SOURCE_URL = 'https://haidou.zhishitft.cn/'
const GTIMG_SOURCE_URL = 'https://game.gtimg.cn/'
const GTIMG_ICON_BASE = 'https://game.gtimg.cn/images/lol/act/img/champion'

/** aramhex bands 的解析段（high 是 top 的官方别名，parseAramhex 已跳过）。 */
const BAND_KEYS = ['casual', 'mid', 'top']

/** 海克斯稀有度词表（aramhex meta 固定三种；组键顺序即输出顺序）。 */
const AUGMENT_RARITIES = ['prismatic', 'gold', 'silver']

/**
 * 全站唯一的 winRate/pickRate 百分数换算：0.583325 → 58.33。
 * meta.units 的 'percent2dp' 即指本函数。非有限输入报错，绝不让 NaN 进产物。
 * @param {number} rate
 * @returns {number}
 */
export function toPercent2dp(rate) {
  const scaled = Number(rate) * 10000
  if (!Number.isFinite(scaled)) {
    throw new Error(`toPercent2dp: 胜率/出场率应为有限数字，收到 ${String(rate)}`)
  }
  return Math.round(scaled) / 100
}

function readJsonFile(file) {
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (err) {
    const wrapped = new Error(`读取文件失败: ${file}（${err.message}）`, { cause: err })
    wrapped.code = err.code
    throw wrapped
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new Error(`解析 JSON 失败: ${file}（${err.message}）`, { cause: err })
  }
}

/** fetch 侧容错产生的「文件不存在」（其余错误仍视为缓存污染）。 */
function isNotFound(err) {
  return err?.code === 'ENOENT' || err?.cause?.code === 'ENOENT'
}

/**
 * 解析 gtimg hero_list.js（纯 JSON，.js 扩展名是 CDN 习惯）。
 * 中文名以 aramhex 为准（gtimg 的 name/title 语义与 aramhex 相反），这里只取 alias。
 * @param {{hero?: unknown}} json
 * @returns {Object<number, string>} heroId（数字）→ 拉丁 alias；alias 缺失的条目跳过
 */
export function parseGtimgHeroList(json) {
  const list = json?.hero
  if (!Array.isArray(list)) {
    throw new Error(`parseGtimgHeroList: hero_list.js 应含 hero 数组，收到 ${json == null ? String(json) : typeof json?.hero}`)
  }
  const aliasById = {}
  for (const entry of list) {
    const id = Number(entry?.heroId)
    if (!Number.isFinite(id)) {
      throw new Error(`parseGtimgHeroList: hero 条目缺数字 heroId: ${JSON.stringify(entry)?.slice(0, 120)}`)
    }
    if (id in aliasById) {
      throw new Error(`parseGtimgHeroList: heroId=${id} 重复`)
    }
    if (typeof entry.alias === 'string' && entry.alias !== '') aliasById[id] = entry.alias
  }
  return aliasById
}

/**
 * 解析海斗 data 层（index.json + items/index.json + heroes/{slug}.json）。
 * slug→heroId 映射以 index.json 的 guides[].id 为准（实测即英雄数字 id）。
 * @param {string} haidouDataDir 含 index.json 的目录（manifest.haidouDir 下的 data/）
 * @returns {{buildsByHero: Map<number, Array>, itemMeta: Object<number, string>}}
 */
function parseHaidou(haidouDataDir) {
  const guides = readJsonFile(path.join(haidouDataDir, 'index.json'))?.guides
  if (!Array.isArray(guides)) {
    throw new Error(`haidou index.json 缺少 guides 数组: ${path.join(haidouDataDir, 'index.json')}`)
  }
  const itemMeta = buildItemMeta(readJsonFile(path.join(haidouDataDir, 'items', 'index.json')))

  const buildsByHero = new Map()
  const seenSlugs = new Set()
  let missing = 0
  for (const guide of guides) {
    const heroId = Number(guide?.id)
    const slug = guide?.slug
    if (!Number.isFinite(heroId) || typeof slug !== 'string' || slug === '') {
      throw new Error(`haidou index.json guides 条目缺数字 id 或 slug: ${JSON.stringify(guide)?.slice(0, 120)}`)
    }
    if (buildsByHero.has(heroId) || seenSlugs.has(slug)) {
      throw new Error(`haidou index.json guides 重复: slug=${slug} heroId=${heroId}`)
    }
    seenSlugs.add(slug)

    let heroJson
    try {
      heroJson = readJsonFile(path.join(haidouDataDir, 'heroes', `${slug}.json`))
    } catch (err) {
      if (!isNotFound(err)) throw err
      missing++
      console.warn(`[analyze] haidou 英雄文件缺失，该英雄 builds 降级为 null: ${slug}.json`)
      continue
    }
    buildsByHero.set(heroId, parseBuilds(heroJson, itemMeta))
  }
  if (missing > 0) {
    console.warn(`[analyze] haidou ${missing}/${guides.length} 个英雄文件缺失（fetch 侧 FAILED.json 应有记录）`)
  }
  return { buildsByHero, itemMeta }
}

/**
 * 英雄分段胜率：all 固定有（aramhex 全量口径），casual/mid/top 缺段省略键。
 */
function buildBands(hero, bands) {
  const out = { all: { winRate: toPercent2dp(hero.winRate), games: hero.games } }
  for (const band of BAND_KEYS) {
    const entry = bands[band]?.[hero.id]
    if (entry) out[band] = { winRate: toPercent2dp(entry.winRate), games: entry.games }
  }
  return out
}

/**
 * 召唤师技能组合列表：按 games 降序（解析器不排序，这里排），names 逐段翻译。
 */
function buildSpells(combos) {
  return (combos ?? [])
    .map((s) => ({
      combo: s.combo,
      ids: s.ids,
      names: s.ids.map((id) => spellName(id)),
      games: s.games,
      wins: s.wins,
      winRate: toPercent2dp(s.wins / s.games),
    }))
    .sort((a, b) => b.games - a.games || (a.combo < b.combo ? -1 : a.combo > b.combo ? 1 : 0))
}

/**
 * 单英雄海克斯按稀有度分组，组内 winRate 降序；lowSample 仅 true 时输出（省体积）。
 * excluded_augments（1337/3176 等统计失真项）在英雄明细里同样排除——真实数据
 * 上游已不含这些 id，这里是防御：上游口径回退时不让脏行悄悄进产物。
 */
function buildHeroAugments(heroId, entries, augmentsMeta, excludedAugmentIds) {
  const groups = {}
  for (const rarity of AUGMENT_RARITIES) groups[rarity] = []
  const excluded = new Set((excludedAugmentIds ?? []).map(Number))
  for (const [rawId, s] of Object.entries(entries ?? {})) {
    const id = Number(rawId)
    if (excluded.has(id)) continue
    const meta = augmentsMeta[id]
    if (!meta) {
      throw new Error(`英雄 ${heroId} 的海克斯 id=${id} 不在 augments meta 中，拒绝静默输出`)
    }
    const bucket = groups[meta.rarity]
    if (!bucket) {
      throw new Error(`英雄 ${heroId} 的海克斯 id=${id} 稀有度未知: ${JSON.stringify(meta.rarity)}`)
    }
    const row = { id, name: meta.name, games: s.games, wins: s.wins, winRate: toPercent2dp(s.winRate) }
    if (s.lowSample) row.lowSample = true
    bucket.push(row)
  }
  for (const bucket of Object.values(groups)) {
    bucket.sort((a, b) => b.winRate - a.winRate || a.id - b.id)
  }
  return groups
}

/**
 * 汇总三个来源为内存数据集（写盘前形态）。
 *
 * @param {{
 *   aramhexDir: string,
 *   haidouDir: string|null,  // 海斗 data 层目录（index.json 所在）；null = 海斗整体不可用
 *   gtimgDir: string,
 * }} cacheDirs
 * @param {{aramhexCommit?: string}} [manifest] fetch-sources 写出的 sources.json（原样传入）
 * @returns {{
 *   meta: object,            // meta.json 内容（含 generatedAt）
 *   heroes: Array<object>,   // 按 rank 升序；行内含明细，写出时按 heroes.json / hero/{id}.json 各自投影
 *   augments: Array<object>, // aggregateAugments 输出 + 百分数2位，按 rank 升序
 *   families: {families: Array<object>, itemFamily: Object<number, number>},
 * }}
 */
export function buildDataset(cacheDirs, manifest = {}) {
  if (cacheDirs == null || typeof cacheDirs !== 'object') {
    throw new Error('buildDataset: cacheDirs 应为 {aramhexDir, haidouDir, gtimgDir}')
  }

  // 1-3. AramHex 解析 → 海克斯跨英雄聚合 → 英雄分档
  const aramhex = parseAramhex(cacheDirs.aramhexDir)
  const augments = aggregateAugments(aramhex.heroAugments, aramhex.augments, aramhex.excludedAugmentIds).map((row) => ({
    ...row,
    winRate: toPercent2dp(row.winRate),
    pickRate: toPercent2dp(row.pickRate),
  }))
  const tiers = computeTiers(aramhex.heroes)

  // 4. 海斗（可选源）：可用性以 manifest 的 haidouDir 为准，绝不看磁盘目录
  let buildsByHero = null
  let itemMeta = null
  if (cacheDirs.haidouDir != null) {
    ;({ buildsByHero, itemMeta } = parseHaidou(cacheDirs.haidouDir))
  }

  // 5. gtimg hero_list.js → alias/icon 索引（拉丁名唯一来源）
  const aliasById = parseGtimgHeroList(readJsonFile(path.join(cacheDirs.gtimgDir, 'hero_list.js')))

  // 6-7. 每英雄合成检索键与明细，再对全部 build 做装备家族聚类
  const missingAlias = []
  const allBuilds = []
  const heroes = aramhex.heroes
    .map((h) => {
      const alias = aliasById[h.id] ?? null
      if (!alias) missingAlias.push(h.id)
      const builds = buildsByHero?.get(h.id) ?? null
      if (builds) allBuilds.push(...builds)
      return {
        id: h.id,
        name: h.name,
        title: h.title,
        alias,
        icon: alias ? `${GTIMG_ICON_BASE}/${alias}.png` : null,
        tier: tiers[h.id],
        rank: h.rank,
        winRate: toPercent2dp(h.winRate),
        pickRate: toPercent2dp(h.pickRate),
        games: h.games,
        wins: h.wins,
        search: buildSearchKeys({ name: h.name, title: h.title, alias: alias ?? undefined }),
        buildCount: builds ? builds.length : 0,
        bands: buildBands(h, aramhex.bands),
        spells: buildSpells(aramhex.spells[h.id]),
        augments: buildHeroAugments(h.id, aramhex.heroAugments[h.id], aramhex.augments, aramhex.excludedAugmentIds),
        builds,
      }
    })
    .sort((a, b) => a.rank - b.rank || a.id - b.id)
  if (missingAlias.length > 0) {
    console.warn(
      `[analyze] gtimg hero_list 缺 ${missingAlias.length} 个英雄的 alias（id=${missingAlias.join(',')}），alias/icon 输出 null`,
    )
  }

  const clustered = clusterItemFamilies(allBuilds)
  const families = {
    families: clustered.families.map((f) => ({
      id: f.id,
      items: f.items,
      names: f.items.map((id) => itemMeta?.[id] ?? String(id)),
      buildCount: f.buildCount,
    })),
    itemFamily: clustered.itemFamily,
  }

  return {
    meta: {
      patch: aramhex.patch,
      snapshotAt: aramhex.snapshotAt,
      gamesValid: aramhex.gamesValid,
      heroCount: heroes.length,
      augmentCount: augments.length,
      generatedAt: new Date().toISOString(),
      tierRule: TIER_RULE,
      units: { winRate: 'percent2dp', pickRate: 'percent2dp' },
      sources: {
        aramhex: { commit: manifest.aramhexCommit ?? null, url: ARAMHEX_SOURCE_URL, license: ARAMHEX_LICENSE },
        haidou: { url: HAIDOU_SOURCE_URL, used: cacheDirs.haidouDir != null },
        gtimg: { url: GTIMG_SOURCE_URL },
      },
    },
    heroes,
    augments,
    families,
  }
}

/** heroes.json 列表行投影（契约字段与键序，前端检索/榜单用）。 */
export function heroSummary(hero) {
  return {
    id: hero.id,
    name: hero.name,
    title: hero.title,
    alias: hero.alias,
    icon: hero.icon,
    tier: hero.tier,
    rank: hero.rank,
    winRate: hero.winRate,
    pickRate: hero.pickRate,
    games: hero.games,
    search: hero.search,
    buildCount: hero.buildCount,
  }
}

/** hero/{id}.json 明细投影（契约字段与键序）。 */
export function heroDetail(hero) {
  return {
    id: hero.id,
    name: hero.name,
    title: hero.title,
    icon: hero.icon,
    alias: hero.alias,
    ranking: { winRate: hero.winRate, pickRate: hero.pickRate, games: hero.games, wins: hero.wins, rank: hero.rank },
    bands: hero.bands,
    spells: hero.spells,
    augments: hero.augments,
    builds: hero.builds,
  }
}

/**
 * 把 buildDataset 的产物写出为 public/data/*.json（同步写，173 英雄 <1s）。
 * 先清空 hero/ 再写：版本更替后消失的英雄不能留陈旧 JSON 给前端。
 * @param {ReturnType<typeof buildDataset>} dataset
 * @param {string} outDir
 */
export function writeDataset(dataset, outDir) {
  const heroDir = path.join(outDir, 'hero')
  fs.rmSync(heroDir, { recursive: true, force: true })
  fs.mkdirSync(heroDir, { recursive: true })
  const write = (rel, value) => fs.writeFileSync(path.join(outDir, rel), JSON.stringify(value) + '\n')
  write('meta.json', dataset.meta)
  write('heroes.json', { heroes: dataset.heroes.map(heroSummary) })
  write('augments.json', { augments: dataset.augments })
  write('families.json', dataset.families)
  for (const hero of dataset.heroes) {
    write(path.join('hero', `${hero.id}.json`), heroDetail(hero))
  }
}

/** IO 壳：读 .cache/sources.json → buildDataset → 写 public/data。带阶段前缀报错。 */
function main() {
  let manifest
  try {
    manifest = readJsonFile(SOURCES_JSON)
  } catch (err) {
    throw new Error(`[analyze] 读取 sources.json 失败（先运行 pnpm fetch:data）: ${err.message}`, { cause: err })
  }

  let dataset
  try {
    dataset = buildDataset(
      {
        aramhexDir: manifest.aramhexDir,
        // manifest.haidouDir 指向 .cache/haidou/，海斗 data 层在其 data/ 子目录
        haidouDir: manifest.haidouDir != null ? path.join(manifest.haidouDir, 'data') : null,
        gtimgDir: manifest.gtimgDir,
      },
      manifest,
    )
  } catch (err) {
    throw new Error(`[analyze] 构建数据集失败: ${err.message}`, { cause: err })
  }

  try {
    writeDataset(dataset, DATA_DIR)
  } catch (err) {
    throw new Error(`[analyze] 写出 public/data 失败: ${err.message}`, { cause: err })
  }

  console.log(
    `[analyze] patch=${dataset.meta.patch} heroes=${dataset.meta.heroCount} augments=${dataset.meta.augmentCount} ` +
      `families=${dataset.families.families.length} haidou=${dataset.meta.sources.haidou.used ? 'used' : 'skipped'} -> ${DATA_DIR}`,
  )
}

// Only auto-run when executed directly (node scripts/analyze.mjs). vitest imports
// this module for buildDataset/writeDataset; a bare import must never write files.
const isMain = (() => {
  try {
    const entry = process.argv[1]
    return Boolean(entry) && realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()

if (isMain) {
  try {
    main()
  } catch (err) {
    console.error(err?.message || String(err))
    process.exit(1)
  }
}
