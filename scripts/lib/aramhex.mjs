import fs from 'node:fs'
import path from 'node:path'

import { ARAMHEX_DIR } from './paths.mjs'

/**
 * AramHex 数据解析（只读 .cache/aramhex-data，不做任何网络请求）。
 *
 * 真实数据形态（16.21 实测）：
 * - patches/{version}/normal/{meta,heroes,augments,hero_augments,hero_spells}.json
 * - 另有 {version}-pbe、{version}-prehotfix 目录，均非正式版本，必须排除
 * - bands/{casual,high,mid,top}/heroes.json 与 heroes.json 同构；
 *   bands/high 与 bands/top 逐字节相同（官方兼容别名），只解析 casual/mid/top
 * - 全部数字字段为 snake_case，本模块统一转成驼峰数值
 */

/** bands 中与 top 逐字节相同的目录，解析时跳过。 */
const BAND_KEYS = ['casual', 'mid', 'top']

/** 正式版本目录名，如 16.21；排除 16.21-pbe / 16.21-prehotfix 等带后缀的目录。 */
const NORMAL_PATCH_RE = /^\d+(?:\.\d+)+$/

/**
 * 点分数字版本号的语义比较（16.9 < 16.10，不是字符串排序）。
 * 仅数字段：段内出现非数字时抛错，避免 NaN 比较悄悄给出不稳定顺序。
 * @param {string} a
 * @param {string} b
 * @returns {-1|0|1}
 */
export function compareVersions(a, b) {
  const as = String(a).split('.')
  const bs = String(b).split('.')
  const len = Math.max(as.length, bs.length)
  for (let i = 0; i < len; i++) {
    const x = Number(as[i] ?? 0)
    const y = Number(bs[i] ?? 0)
    if (Number.isNaN(x) || Number.isNaN(y)) {
      throw new Error(`compareVersions 仅支持数字段，收到: ${a} vs ${b}`)
    }
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/**
 * 从 patches/ 目录名集合里挑出最新正式版本。
 * @param {string[]} patchDirNames
 * @returns {string|null} 无正式版本目录时返回 null
 */
export function latestPatch(patchDirNames) {
  const normal = (patchDirNames ?? []).filter((name) => NORMAL_PATCH_RE.test(name))
  if (normal.length === 0) return null
  return normal.reduce((best, cur) => (compareVersions(cur, best) > 0 ? cur : best))
}

function readJson(file) {
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (err) {
    throw new Error(`读取文件失败: ${file}（${err.message}）`, { cause: err })
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new Error(`解析 JSON 失败: ${file}（${err.message}）`, { cause: err })
  }
}

/**
 * 解析 AramHex 数据根目录，返回最新正式版本的统计。
 * @param {string} [aramhexDir] 默认 .cache/aramhex-data
 * @returns {{
 *   patch: string,
 *   snapshotAt: string|undefined,
 *   gamesCollected: number|undefined,
 *   gamesValid: number|undefined,
 *   gamesExcluded: number|undefined,
 *   excludedAugmentIds: number[],
 *   regions: string[],
 *   heroes: Array<{id:number,name:string,title:string,games:number,wins:number,winRate:number,pickRate:number,rank:number}>,
 *   heroAugments: Object<number, Object<number, {games:number,wins:number,winRate:number,lowSample:boolean}>>,
 *   augments: Object<number, {name:string,rarity:string}>,
 *   spells: Object<number, Array<{combo:string,ids:number[],games:number,wins:number}>>,
 *   bands: {casual?: Object<number, {winRate:number,games:number}>, mid?: Object, top?: Object},
 * }}
 */
export function parseAramhex(aramhexDir = ARAMHEX_DIR) {
  const patchesDir = path.join(aramhexDir, 'patches')
  let entries
  try {
    entries = fs.readdirSync(patchesDir, { withFileTypes: true })
  } catch (err) {
    throw new Error(`AramHex patches 目录不可读: ${patchesDir}（${err.message}），先运行 pnpm fetch:data`)
  }
  const patch = latestPatch(entries.filter((e) => e.isDirectory()).map((e) => e.name))
  if (!patch) throw new Error(`patches/ 下没有任何正式版本目录: ${patchesDir}`)

  const normalDir = path.join(patchesDir, patch, 'normal')
  const meta = readJson(path.join(normalDir, 'meta.json'))
  const heroesRaw = readJson(path.join(normalDir, 'heroes.json'))
  const augmentsRaw = readJson(path.join(normalDir, 'augments.json'))
  const heroAugmentsRaw = readJson(path.join(normalDir, 'hero_augments.json'))
  const spellsRaw = readJson(path.join(normalDir, 'hero_spells.json'))

  // 文件里已带官方按胜率名次的 rank，直接沿用；数组按胜率降序重排方便直接展示。
  const heroes = Object.entries(heroesRaw)
    .map(([id, h]) => ({
      id: Number(id),
      name: h.name,
      title: h.title,
      games: Number(h.games),
      wins: Number(h.wins),
      winRate: Number(h.win_rate),
      pickRate: Number(h.pick_rate),
      rank: Number(h.rank),
    }))
    .sort((a, b) => b.winRate - a.winRate || a.id - b.id)

  // 防静默脏数据：缺 win_rate 的英雄会变 NaN，排序后仍然通过，最终序列化成
  // "winRate":null 混进产物。这里直接构建期报错，指明英雄 id。
  if (heroes.length === 0) {
    throw new Error(`heroes.json 没有英雄数据: ${path.join(normalDir, 'heroes.json')}`)
  }
  for (const h of heroes) {
    const badFields = ['games', 'winRate', 'pickRate'].filter((f) => !Number.isFinite(h[f]))
    if (badFields.length > 0) {
      throw new Error(
        `heroes.json 数值字段非法: id=${h.id} 字段=${badFields.join(',')}（${path.join(normalDir, 'heroes.json')}）`,
      )
    }
  }

  const augments = {}
  for (const [augId, a] of Object.entries(augmentsRaw)) {
    augments[Number(augId)] = { name: a.name, rarity: a.rarity }
  }

  const heroAugments = {}
  for (const [heroId, augs] of Object.entries(heroAugmentsRaw)) {
    const perHero = {}
    for (const [augId, s] of Object.entries(augs)) {
      perHero[Number(augId)] = {
        games: Number(s.games),
        wins: Number(s.wins),
        winRate: Number(s.win_rate),
        lowSample: Boolean(s.low_sample),
      }
    }
    heroAugments[Number(heroId)] = perHero
  }

  // 组合键如 "4+14"：两个召唤师技能 id 数字升序以 + 连接（D/F 顺序已合并）。
  const spells = {}
  for (const [heroId, combos] of Object.entries(spellsRaw)) {
    spells[Number(heroId)] = Object.entries(combos).map(([combo, s]) => ({
      combo,
      ids: combo.split('+').map(Number),
      games: Number(s.games),
      wins: Number(s.wins),
    }))
  }

  const bands = {}
  for (const band of BAND_KEYS) {
    const file = path.join(normalDir, 'bands', band, 'heroes.json')
    if (!fs.existsSync(file)) {
      // 跳过 bands/high 属预期（与 top 逐字节相同）；casual/mid/top 缺失则要暴露出来。
      console.warn(`[aramhex] bands/${band}/heroes.json 缺失，返回值中 bands.${band} 为 undefined（${normalDir}）`)
      continue
    }
    const map = {}
    for (const [heroId, h] of Object.entries(readJson(file))) {
      map[Number(heroId)] = { winRate: Number(h.win_rate), games: Number(h.games) }
    }
    bands[band] = map
  }

  const matches = meta.matches ?? {}
  return {
    patch,
    snapshotAt: meta.snapshot_at,
    gamesCollected: matches.collected != null ? Number(matches.collected) : undefined,
    gamesValid: matches.valid != null ? Number(matches.valid) : undefined,
    gamesExcluded: matches.excluded != null ? Number(matches.excluded) : undefined,
    excludedAugmentIds: Object.keys(meta.excluded_augments ?? {}).map(Number),
    regions: meta.regions ?? [],
    heroes,
    heroAugments,
    augments,
    spells,
    bands,
  }
}
