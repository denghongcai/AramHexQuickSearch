/**
 * 聚合与分级：纯计算，不读文件系统、不做网络请求。
 *
 * 输入全部来自 scripts/lib/aramhex.mjs 的 parseAramhex()（内存对象）：
 * - heroAugments: {[heroId]: {[augId]: {games, wins, winRate, lowSample}}}
 * - augments:     {[augId]: {name, rarity}}，rarity ∈ 'prismatic'|'gold'|'silver'
 * - heroes:       [{id, name, ..., winRate}]，按 winRate 降序
 */

/**
 * 跨英雄聚合海克斯强度并排名。
 *
 * 口径：
 * - games/wins：该海克斯在所有英雄身上的求和；winRate = wins/games 重算，
 *   不取单英雄口径的平均（大样本英雄权重应更高）。
 * - pickRate：games / Σ(同稀有度全部海克斯 games)。不同稀有度的出现池不同
 *   （棱彩只在棱彩池出现），分稀有度归一口径才正确；排除项不计入分母。
 * - heroCount：出现该海克斯的英雄数（条目数；games≤0 的条目在校验时即被拒绝）。
 * - rank：按 winRate 降序，同 winRate 按 id 升序稳定排序，rank = 名次（1 起）。
 * - 输出数组即按 rank 排列，可直接进榜。
 *
 * 防静默脏数据（与 aramhex.mjs 同哲学）：heroAugments 里出现 augments meta
 * 没有的 id、或 games/wins 非有限数值、或 games≤0（全零海克斯会让
 * wins/games=NaN 悄悄毒化排名排序）时，构建期报错而不是产出 NaN 行。
 * excludedAugmentIds 里的 id（如 1337/3176）无论是否出现在数据中都安全跳过。
 *
 * @param {Object<number, Object<number, {games:number, wins:number}>>} heroAugments
 * @param {Object<number, {name:string, rarity:string}>} augmentsMeta
 * @param {number[]} excludedAugmentIds
 * @returns {Array<{id:number, name:string, rarity:string, games:number, wins:number,
 *   winRate:number, pickRate:number, heroCount:number, rank:number}>}
 */
export function aggregateAugments(heroAugments, augmentsMeta, excludedAugmentIds = []) {
  const excluded = new Set((excludedAugmentIds ?? []).map(Number))
  const totals = new Map() // augId -> {games, wins, heroCount}

  for (const [heroId, augs] of Object.entries(heroAugments ?? {})) {
    for (const [rawAugId, s] of Object.entries(augs ?? {})) {
      const augId = Number(rawAugId)
      if (excluded.has(augId)) continue
      const meta = augmentsMeta?.[augId]
      if (!meta) {
        throw new Error(
          `heroAugments 里的海克斯 id=${augId}（英雄 ${heroId}）不在 augments meta 中，拒绝静默聚合`,
        )
      }
      if (!Number.isFinite(Number(s.games)) || !Number.isFinite(Number(s.wins)) || Number(s.games) <= 0) {
        throw new Error(
          `heroAugments 数值字段非法: 英雄 ${heroId} 海克斯 id=${augId} games=${s.games} wins=${s.wins}（games 必须为正有限数）`,
        )
      }
      const t = totals.get(augId) ?? { games: 0, wins: 0, heroCount: 0 }
      t.games += Number(s.games)
      t.wins += Number(s.wins)
      t.heroCount += 1
      totals.set(augId, t)
    }
  }

  // 分母按稀有度求和：只用进榜行本身（排除项天然不计入）。
  const poolByRarity = {}
  for (const [augId, t] of totals) {
    const rarity = augmentsMeta[augId].rarity
    poolByRarity[rarity] = (poolByRarity[rarity] ?? 0) + t.games
  }

  const rows = [...totals.entries()]
    .map(([augId, t]) => ({
      id: augId,
      name: augmentsMeta[augId].name,
      rarity: augmentsMeta[augId].rarity,
      games: t.games,
      wins: t.wins,
      winRate: t.wins / t.games,
      pickRate: t.games / poolByRarity[augmentsMeta[augId].rarity],
      heroCount: t.heroCount,
      rank: 0,
    }))
    .sort((a, b) => b.winRate - a.winRate || a.id - b.id)

  for (let i = 0; i < rows.length; i++) rows[i].rank = i + 1
  return rows
}

/** tier 档位从高到低。 */
export const TIER_ORDER = ['S', 'A', 'B', 'C', 'D']

/**
 * 按 winRate 分位给英雄切 S/A/B/C/D 档。
 *
 * 切档规则（n = 英雄数；边界 = 累计人数上限，一律 Math.ceil(n * 累计分位)）：
 * - S:  名次 1 .. ceil(n*0.08)              （前 8%）
 * - A:  到 ceil(n*0.28)                     （次 20%，8%+20%=28%）
 * - B:  到 ceil(n*0.68)                     （次 40%，28%+40%=68%）
 * - C:  到 n - ceil(n*0.08)                 （次 24%，吃剩余）
 * - D:  尾部 ceil(n*0.08)                   （后 8%，从底部锚定，C 吃剩余）
 * 用累计分位取整而不是各档份额单独取整（ceil(0.4n) 会把 B 变 70 人），
 * 这样 n=173 恰好 14/35/69/41/14；n=10 → 1/2/4/2/1。
 *
 * 并列规则：同 winRate 的英雄绝不跨档拆散。按名次切档后，若档边界两侧
 * winRate 相等，边界外扩到该并列组的边缘——整组归更高档（统一方向，
 * 含 C|D 边界：垫底并列时整组进 C，D 可为空）。
 * 如第 1、2 名同胜率时 S 档从 1 人扩到 2 人，而不是把并列组撕开。
 * 极端情况（并列组巨大、n 很小）下高档会吞并低档，档位为空是预期行为；
 * 全员并列时全部归 S。
 *
 * 纯函数：内部对副本按 winRate 降序、id 升序重排（不要求入参已排序，
 * 也不修改入参）；返回可 JSON 序列化的普通对象。
 *
 * @param {Array<{id:number, winRate:number}>} heroes
 * @returns {Object<number, 'S'|'A'|'B'|'C'|'D'>} heroId → tier
 */
export function computeTiers(heroes) {
  const sorted = [...(heroes ?? [])].sort((a, b) => b.winRate - a.winRate || a.id - b.id)
  const n = sorted.length
  if (n === 0) return {}

  const ceil = (x) => Math.ceil(n * x)
  // 各档起止下标（左闭右开），名义值先按累计分位算出，再被并列规则外推与钳制。
  const bounds = [ceil(0.08), ceil(0.28), ceil(0.68), n - ceil(0.08)]

  let prev = 0
  const clamped = bounds.map((b) => {
    const start = Math.min(Math.max(b, prev), n)
    // 边界两侧 winRate 相等 → 边界右移，整组归更高档
    let end = start
    while (end < n && sorted[end].winRate === sorted[start - 1]?.winRate) end++
    prev = end
    return end
  })
  // [0, c0)=S, [c0, c1)=A, [c1, c2)=B, [c2, c3)=C, [c3, n)=D
  const tiers = {}
  for (let i = 0; i < n; i++) {
    const t = clamped[0] > i ? 'S' : clamped[1] > i ? 'A' : clamped[2] > i ? 'B' : clamped[3] > i ? 'C' : 'D'
    tiers[sorted[i].id] = t
  }
  return tiers
}

/** 召唤师技能 id → 中文名（13 清晰术来自 gtimg summonerskill_list，真实数据 7 种组合在用）。表外 id 容错为 "技能"+id，不抛错。 */
const SPELL_NAMES = {
  1: '净化',
  3: '疾跑',
  4: '闪现',
  6: '虚弱',
  7: '治疗',
  11: '惩戒',
  12: '传送',
  13: '清晰术',
  14: '点燃',
  21: '屏障',
  32: '标记',
}

/**
 * 召唤师技能命名。入参为 id 数组（如 [4,14]）或单个 id（如 4）。
 * @param {number[]|number} ids
 * @returns {string} 例：[4,14] → '闪现+点燃'；未知 id → '技能'+id
 */
export function spellName(ids) {
  const list = Array.isArray(ids) ? ids : [ids]
  return list.map((id) => SPELL_NAMES[id] ?? `技能${id}`).join('+')
}

/**
 * 召唤师技能组合键命名（aramhex 的 combo 键，如 '4+14'）。
 * @param {string} combo 形如 '4+14'
 * @returns {string} 例：'4+14' → '闪现+点燃'；未知段容错为 '技能'+段
 */
export function spellComboName(combo) {
  return spellName(String(combo).split('+'))
}
