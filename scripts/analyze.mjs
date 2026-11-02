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
 * - haidouDir 为 null → 全部英雄 builds:null、buildCount 0、families 空，
 *   检索键不带社区别名（回落 name/title/alias 旧口径），流程不中断；
 * - index.json 声称可用而 heroes/{slug}.json 单文件缺失 → 该英雄 builds:null +
 *   warn（fetch 侧本就按文件粒度容错记 FAILED.json）；index.json 本身缺失/结构
 *   漂移 → 报错（manifest 声称可用而缓存不一致，必须大声失败）；
 * - gtimg hero_list.js 缺失/结构漂移 → 报错（alias/icon 是硬依赖，无降级路径）；
 * - 单个英雄在 gtimg 无 alias（理论上不该发生）→ 该英雄 alias/icon 为 null + warn，
 *   检索键不含拉丁词项；
 * - gtimg 图标索引（kiwi_augments.json / items.js）缺失/结构漂移 → 报错（图标
 *   是 Part B 输出契约的一部分）；单条目缺图标/缺 id → 跳过该条，对应行 icon
 *   输出 null（UI 保留色点/文字兜底）。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'

import { parseAramhex } from './lib/aramhex.mjs'
import { aggregateAugments, computeTiers, spellName, TIER_RULE } from './lib/aggregate.mjs'
import { buildItemMeta, clusterItemFamilies, parseBuilds } from './lib/haidou-builds.mjs'
import { isNotFound, readJsonFile } from './lib/json-file.mjs'
import { augmentTipSegments, itemTipSegments } from './lib/richtext.mjs'
import { DATA_DIR, SOURCES_JSON } from './lib/paths.mjs'
import { buildSearchKeys } from './lib/search.mjs'

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
 * 解析 gtimg kiwi_augments.json（海克斯图标索引，纯 JSON 数组）。
 * 每条 {augmentID, small_Icon, large_Icon, …}：small 优先，缺失回落 large，
 * 两者皆缺的条目跳过（该海克斯 icon 输出 null，UI 走色点兜底）。
 * 容错口径与 parseGtimgItemIcons 对齐：这是纯装饰性数据，不值得为单条脏行
 * 硬失败——重复 augmentID warn + 首条获胜（first-wins），缺数字 id 的条目跳过；
 * 只有整体结构漂移（非数组）才报错。
 * @param {unknown} json
 * @returns {Map<number, string>} augmentID → 图标 URL
 */
export function parseGtimgAugmentIcons(json) {
  if (!Array.isArray(json)) {
    throw new Error(`parseGtimgAugmentIcons: kiwi_augments.json 应为数组，收到 ${json == null ? String(json) : typeof json}`)
  }
  const icons = new Map()
  for (const entry of json) {
    const id = Number(entry?.augmentID)
    if (!Number.isFinite(id)) {
      throw new Error(`parseGtimgAugmentIcons: 条目缺数字 augmentID: ${JSON.stringify(entry)?.slice(0, 120)}`)
    }
    const url = typeof entry.small_Icon === 'string' && entry.small_Icon !== '' ? entry.small_Icon : undefined
    const large = typeof entry.large_Icon === 'string' && entry.large_Icon !== '' ? entry.large_Icon : undefined
    const icon = url ?? large
    if (!icon) continue // 两条皆缺图标 → 查无此 id → icon 输出 null（色点兜底）
    if (icons.has(id)) {
      console.warn(`[analyze] kiwi_augments.json augmentID=${id} 重复，保留首条图标（${icons.get(id)}），忽略 ${icon}`)
      continue
    }
    icons.set(id, icon)
  }
  return icons
}

/**
 * 解析 gtimg items.js（装备图标索引，纯 JSON：{items: [{itemId, iconPath, …}]}）。
 * iconPath 已是完整 URL（含大乱斗模式装 123430）。条目缺 id/iconPath 跳过——
 * 索引覆盖 706 件，缺一两条只是该装备图标回落 null，不值得为它硬失败。
 * @param {{items?: unknown}} json
 * @returns {Object<number, string>} itemId → 图标 URL
 */
export function parseGtimgItemIcons(json) {
  const items = json?.items
  if (!Array.isArray(items)) {
    throw new Error(`parseGtimgItemIcons: items.js 应含 items 数组，收到 ${json == null ? String(json) : typeof json?.items}`)
  }
  const icons = {}
  for (const entry of items) {
    const id = Number(entry?.itemId)
    if (!Number.isFinite(id)) continue
    if (typeof entry.iconPath === 'string' && entry.iconPath !== '') icons[id] = entry.iconPath
  }
  return icons
}

/**
 * 解析 gtimg kiwi_augments.json 的提示分段（tooltip 纯文本优先，desc 富文本解析，
 * 分段口径见 lib/richtext.mjs）。容错与 parseGtimgAugmentIcons 完全一致。
 * @param {unknown} json
 * @returns {Map<number, Array<{text: string, hl?: true}>>} augmentID → 提示分段（空数组 = 无提示）
 */
export function parseGtimgAugmentTips(json) {
  if (!Array.isArray(json)) {
    throw new Error(`parseGtimgAugmentTips: kiwi_augments.json 应为数组，收到 ${json == null ? String(json) : typeof json}`)
  }
  const tips = new Map()
  for (const entry of json) {
    const id = Number(entry?.augmentID)
    if (!Number.isFinite(id)) {
      throw new Error(`parseGtimgAugmentTips: 条目缺数字 augmentID: ${JSON.stringify(entry)?.slice(0, 120)}`)
    }
    const segs = augmentTipSegments(entry)
    if (!tips.has(id)) tips.set(id, segs)
  }
  return tips
}

/**
 * 解析 gtimg items.js 的属性提示分段（description 富文本解析优先，plaintext 兜底，
 * 分段口径见 lib/richtext.mjs）。容错与 parseGtimgItemIcons 对齐（缺 id/文本跳过）。
 * @param {{items?: unknown}} json
 * @returns {Object<number, {tip: Array<{text: string, hl?: true}>, price: string|null}>}
 *   itemId → {提示分段, 游戏内售价}；两者皆缺的条目不进表
 */
export function parseGtimgItemTips(json) {
  const items = json?.items
  if (!Array.isArray(items)) {
    throw new Error(`parseGtimgItemTips: items.js 应含 items 数组，收到 ${json == null ? String(json) : typeof json?.items}`)
  }
  const tips = {}
  for (const entry of items) {
    const id = Number(entry?.itemId)
    if (!Number.isFinite(id)) continue
    const segs = itemTipSegments(entry)
    const price = typeof entry.price === 'string' && entry.price !== '' ? entry.price : null
    if (segs.length > 0 || price) tips[id] = { tip: segs, price }
  }
  return tips
}

/**
 * 解析海斗 data 层（index.json + items/index.json + heroes/{slug}.json）。
 * slug→heroId 映射以 index.json 的 guides[].id 为准（实测即英雄数字 id）。
 * @param {string} haidouDataDir 含 index.json 的目录（manifest.haidouDir 下的 data/）
 * @param {(id: number) => string|null} itemIconLookup gtimg 装备图标查询（buildDataset 组装）
 * @returns {{buildsByHero: Map<number, Array>, itemMeta: Object<number, string>,
 *   aliasesByHero: Map<number, string[]>}} aliasesByHero = heroId → 社区别名词项
 *   （guides[].aliases，搜索外号用）；条目缺 aliases 或词项结构漂移时该英雄
 *   不进表（搜索侧优雅回落旧口径，warn 提示，不中断构建）
 */
function parseHaidou(haidouDataDir, itemIconLookup) {
  const guides = readJsonFile(path.join(haidouDataDir, 'index.json'))?.guides
  if (!Array.isArray(guides)) {
    throw new Error(`haidou index.json 缺少 guides 数组: ${path.join(haidouDataDir, 'index.json')}`)
  }
  const itemMeta = buildItemMeta(readJsonFile(path.join(haidouDataDir, 'items', 'index.json')))

  const buildsByHero = new Map()
  const aliasesByHero = new Map()
  const seenSlugs = new Set()
  let missing = 0
  let aliasDrift = 0
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
    // 社区别名是可选增强字段：缺失（老版本 index）静默跳过；结构漂移（非字符串
    // 数组）warn 后跳过——外号搜不到可以接受，构建失败不可以
    if (guide.aliases != null) {
      if (Array.isArray(guide.aliases) && guide.aliases.every((a) => typeof a === 'string')) {
        aliasesByHero.set(heroId, guide.aliases)
      } else {
        aliasDrift++
      }
    }

    let heroJson
    try {
      heroJson = readJsonFile(path.join(haidouDataDir, 'heroes', `${slug}.json`))
    } catch (err) {
      if (!isNotFound(err)) throw err
      missing++
      console.warn(`[analyze] haidou 英雄文件缺失，该英雄 builds 降级为 null: ${slug}.json`)
      continue
    }
    // 唯一的静默数据错位风险点：索引 id 与英雄文件自带的 hero.id 必须一致，
    // 否则出装会挂到错误英雄头上——报错并给出两边的 id，绝不静默关联。
    const heroFileId = heroJson?.hero?.id
    if (Number(heroFileId) !== heroId) {
      throw new Error(
        `haidou guides 的 heroId=${heroId}（slug=${slug}）与英雄文件内的 hero.id=${JSON.stringify(heroFileId)} 不一致，拒绝静默关联`,
      )
    }
    buildsByHero.set(heroId, parseBuilds(heroJson, itemMeta, itemIconLookup))
  }
  if (missing > 0) {
    console.warn(`[analyze] haidou ${missing}/${guides.length} 个英雄文件缺失（fetch 侧 FAILED.json 应有记录）`)
  }
  if (aliasDrift > 0) {
    console.warn(`[analyze] haidou ${aliasDrift}/${guides.length} 条 guides 的 aliases 结构漂移（非字符串数组），已忽略`)
  }
  return { buildsByHero, itemMeta, aliasesByHero }
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
 * 图标来自 gtimg kiwi 索引（small 优先）；查无此 id 输出 null（UI 色点兜底）。
 */
function buildHeroAugments(heroId, entries, augmentsMeta, excludedAugmentIds, augmentIcons, augmentTips) {
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
    const row = {
      id,
      name: meta.name,
      icon: augmentIcons?.get(id) ?? null,
      games: s.games,
      wins: s.wins,
      winRate: toPercent2dp(s.winRate),
    }
    const tip = augmentTips?.get(id) ?? []
    if (tip.length > 0) row.tip = tip
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
  // 3b. gtimg 图标索引：海克斯（kiwi，small 优先）与装备（items.js）两张查询表
  const augmentIcons = parseGtimgAugmentIcons(readJsonFile(path.join(cacheDirs.gtimgDir, 'kiwi_augments.json')))
  const itemIcons = parseGtimgItemIcons(readJsonFile(path.join(cacheDirs.gtimgDir, 'items.js')))
  // 3b+. gtimg 提示分段索引：海克斯属性描述与装备属性描述（游戏内高亮分段）
  const augmentTips = parseGtimgAugmentTips(readJsonFile(path.join(cacheDirs.gtimgDir, 'kiwi_augments.json')))
  const itemTips = parseGtimgItemTips(readJsonFile(path.join(cacheDirs.gtimgDir, 'items.js')))
  // 装备图标查询（parseHaidou/家族聚类共用）；查无此装备兜底 null
  const itemIconLookup = (id) => itemIcons[id] ?? null
  const itemTipLookup = (id) => itemTips[id] ?? null
  const augments = aggregateAugments(aramhex.heroAugments, aramhex.augments, aramhex.excludedAugmentIds).map((row) => ({
    id: row.id,
    name: row.name,
    icon: augmentIcons.get(row.id) ?? null,
    rarity: row.rarity,
    games: row.games,
    wins: row.wins,
    winRate: toPercent2dp(row.winRate),
    pickRate: toPercent2dp(row.pickRate),
    heroCount: row.heroCount,
    rank: row.rank,
  }))
  for (const row of augments) {
    const tip = augmentTips.get(row.id) ?? []
    if (tip.length > 0) row.tip = tip
  }
  const tiers = computeTiers(aramhex.heroes)

  // 4. 海斗（可选源）：可用性以 manifest 的 haidouDir 为准，绝不看磁盘目录
  let buildsByHero = null
  let itemMeta = null
  let aliasesByHero = null
  if (cacheDirs.haidouDir != null) {
    ;({ buildsByHero, itemMeta, aliasesByHero } = parseHaidou(cacheDirs.haidouDir, itemIconLookup))
  }

  // 5. gtimg hero_list.js → alias/icon 索引（拉丁名唯一来源）
  const aliasById = parseGtimgHeroList(readJsonFile(path.join(cacheDirs.gtimgDir, 'hero_list.js')))

  // 6-7. 每英雄合成检索键与明细，再对全部 build 做装备家族聚类
  // builds 的 winRate/pickRate 也在此统一转 percent2dp：整个数据集一种口径，
  // meta.units 的声明才为真（parseBuilds 保持海斗源口径透传，见其 JSDoc）。
  // 缺 winRate/pickRate 的 build 会被 toPercent2dp 拒绝 → 构建期硬错误。
  // 同时把装备提示分段（gtimg items.js，按 item id join）挂到核心装/出门装/推荐装上，
  // 供前端悬停/点击弹 tips；查无分段为 null（与 icons 同款平行数组口径）。
  const toPercentBuilds = (builds) =>
    builds.map((b) => ({
      ...b,
      winRate: toPercent2dp(b.winRate),
      pickRate: toPercent2dp(b.pickRate),
      core: {
        ...b.core,
        tips: b.core.itemIds.map((id) => itemTipLookup(id)?.tip ?? null),
        prices: b.core.itemIds.map((id) => itemTipLookup(id)?.price ?? null),
        prices: b.core.itemIds.map((id) => itemTipLookup(id)?.price ?? null),
      },
      starter: b.starter.map((it) => ({ ...it, tip: itemTipLookup(it.id)?.tip ?? null, price: itemTipLookup(it.id)?.price ?? null })),
      recommended: b.recommended.map((it) => ({ ...it, tip: itemTipLookup(it.id)?.tip ?? null, price: itemTipLookup(it.id)?.price ?? null })),
    }))
  const missingAlias = []
  const allBuilds = []
  const heroes = aramhex.heroes
    .map((h) => {
      const alias = aliasById[h.id] ?? null
      if (!alias) missingAlias.push(h.id)
      const builds = buildsByHero?.has(h.id) ? toPercentBuilds(buildsByHero.get(h.id)) : null
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
        // 别名按 guides[].id join 英雄；海斗降级或该英雄条目缺 aliases 时传
        // undefined → buildSearchKeys 走旧口径（优雅降级，见 search.mjs JSDoc）
        search: buildSearchKeys({
          name: h.name,
          title: h.title,
          alias: alias ?? undefined,
          aliases: aliasesByHero?.get(h.id),
        }),
        buildCount: builds ? builds.length : 0,
        bands: buildBands(h, aramhex.bands),
        spells: buildSpells(aramhex.spells[h.id]),
        augments: buildHeroAugments(h.id, aramhex.heroAugments[h.id], aramhex.augments, aramhex.excludedAugmentIds, augmentIcons, augmentTips),
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
      // 与 names 平行的图标数组；gtimg 索引查无此装备兜底 null
      icons: f.items.map((id) => itemIconLookup(id)),
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
    // 预期错误都带 [analyze] 阶段前缀，只打 message；不带前缀的是没被阶段
    // 包装的意外错误（TypeError 等），打 stack 才有定位信息。
    const message = err?.message || String(err)
    console.error(message.startsWith('[analyze]') ? message : (err?.stack || message))
    process.exit(1)
  }
}
