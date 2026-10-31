/**
 * 海斗出装解析 + 装备共现聚类（纯函数，不读文件系统、不做网络请求）。
 *
 * 真实数据形态（.cache/haidou/data/ 实测，173 英雄 / 409 build，全部字段齐全）：
 * - heroes/{slug}.json 顶层：{schemaVersion, hero, ranking, build, defaultBuildKey,
 *   builds, summonerSpells, skillOrder, items, augments, gameplay, legacy}
 * - builds[] 每项：{key, name, sampleCount, lowSampleWarning, pickRate, winRate,
 *   coreProfile:{sampleCount, pickRate, winRate, itemIds:[3 个数字], selectionMinPickRate},
 *   starter:{sampleCount, pickRate, winRate}, skillOrder:"Q>E>W",
 *   items:{starter:[{id,name,icon}], core:[{id,name,...,source:"coreProfile"}],
 *   recommended:[...]}}
 * - 核心位权威口径是 coreProfile.itemIds（纯数字数组）。注意 items.core 的顺序
 *   与 itemIds 不一致（实测 yasuo：itemIds=[123430,3032,6333] 而
 *   items.core=[3032,123430,6333]），输出顺序一律跟随 itemIds 原始顺序。
 * - gameplay.summary 为 3 条打法文案字符串数组（实测 173/173 存在）。
 * - items/index.json：{schemaVersion, site, items:[{id,name,icon,tier,...}]}，
 *   只收录热度 Top 117 件。starter 位常用出门装（长剑/多兰系等 37 个 id）
 *   不在其中——实测 765 处 starter 引用查不到 meta。因此名称解析逐级兜底：
 *   itemMeta → item 对象自带 name → id 字符串，绝不抛错。
 *
 * 聚类口径（见 clusterItemFamilies 的 JSDoc）：节点只取核心位（starter/
 * recommended 噪声大，不进图），边权按 build sampleCount 加权，凝聚聚类
 * 阈值 0.5。输出全序确定（同权重按 id 升序），同输入同输出。
 *
 * 实测结论（409 build 全量冒烟，阈值 0.5）：63 个节点聚出 54 个家族——
 * 7 个多件家族（心之钢/狂徒/无终恨意=坦克、帽子/影焰=法核、兰德里/火炬=
 * 法 poke、无尽/收集者=暴击、耳语头环/月石/流水=辅助、时光/大天使=成长法、
 * 幻影/挺进）+ 47 个单件家族。单件多为跨桶泛用件（死亡之舞、狂妄、公理
 * 圆弧……物品被多个流派共用，成对 Jaccard 普遍 <0.5），因此家族数不会收敛
 * 到海斗的 8 桶——8 桶是 build 级标签（builds[].key），本聚类是物品级补充
 * 视角，核心位归入多件家族的覆盖率约 45%。
 */

/** 凝聚聚类的停止阈值：最大簇间 Jaccard 相似度低于该值即停止合并。 */
export const JACCARD_THRESHOLD = 0.5

/** 节点准入门槛：itemId 至少出现在多少个 build 的核心位才进图。 */
export const MIN_CORE_BUILDS = 2

/**
 * 把海斗 items/index.json 转成 {[id]: name} 查询表。
 * 条目缺 id/name 或 id 重复时报错——meta 是名称的权威来源，脏了要大声失败，
 * 而不是悄悄产出错误名称。
 * @param {{items?: Array<{id?: unknown, name?: unknown}>}|null} itemsIndexJson
 * @returns {Object<number, string>}
 */
export function buildItemMeta(itemsIndexJson) {
  const items = itemsIndexJson?.items
  if (!Array.isArray(items)) {
    throw new Error('buildItemMeta: items/index.json 里缺少 items 数组，拒绝构建查询表')
  }
  const meta = {}
  for (const it of items) {
    const id = it?.id
    const name = it?.name
    if (typeof id !== 'number' || !Number.isFinite(id) || typeof name !== 'string' || name === '') {
      throw new Error(`buildItemMeta: items 条目缺 id 或 name（收到 ${JSON.stringify(it)}），拒绝静默跳过`)
    }
    if (id in meta) {
      throw new Error(`buildItemMeta: items 里 id=${id} 重复（${meta[id]} 与 ${name}）`)
    }
    meta[id] = name
  }
  return meta
}

/**
 * 名称三级兜底：itemMeta → item 对象自带 name → id 字符串。
 * 海斗 items/index.json 只收录 Top 117 件，starter 位大量查不到是常态（实测
 * 765 处），必须容错而不是抛错。
 * @param {number} id
 * @param {{name?: string}|undefined} itemObj
 * @param {(id: number) => string|undefined} lookup
 * @returns {string}
 */
function resolveName(id, itemObj, lookup) {
  return lookup(id) ?? (typeof itemObj?.name === 'string' && itemObj.name !== '' ? itemObj.name : String(id))
}

/**
 * 构造 itemMeta 查询函数：接受 {[id]: name} 对象或 Map，null/undefined 视为
 * 空查询（全部走兜底）；其他类型直接报错。
 * @param {Object<number, string>|Map<number, string>|null|undefined} itemMeta
 * @returns {(id: number) => string|undefined}
 */
function metaLookup(itemMeta) {
  if (itemMeta == null) return () => undefined
  if (itemMeta instanceof Map) return (id) => itemMeta.get(id)
  if (typeof itemMeta !== 'object') {
    throw new Error(`parseBuilds: itemMeta 应为 {[id]: name} 对象或 Map，收到 ${typeof itemMeta}`)
  }
  return (id) => itemMeta[id]
}

/**
 * 解析单个海斗英雄 JSON 为 UI 友好的出装数组。
 *
 * 口径：
 * - core 取 coreProfile.itemIds（权威口径）；缺失时 core 为空数组（该 build
 *   仍进输出，聚类侧自然跳过）。names 与 itemIds 一一对应、顺序一致。
 * - starter/recommended 由 item 对象数组映射为名称数组（同样三级兜底）。
 * - summary 取 gameplay.summary 按换行连接，同一英雄的每个 build 相同
 *   （英雄级文案，不是 build 级）；gameplay 缺失时为空字符串。
 * - pickRate/winRate/sampleCount 原样透传（展示层数值口径与海斗一致）。
 *
 * 容错边界：builds 缺失或为空数组 → 返回 []（部分英雄可能没有出装数据）；
 * itemMeta 查不到名称 → 逐级兜底。fail-fast 边界：heroJson 非对象、builds
 * 存在但不是数组、build 条目非对象 → 报错（这些意味着缓存被污染）。
 *
 * @param {Object} heroJson 海斗 data/heroes/{slug}.json 的解析结果
 * @param {Object<number, string>|Map<number, string>|null} [itemMeta] buildItemMeta 的产物
 * @returns {Array<{key: string|undefined, name: string|undefined, sampleCount: number,
 *   pickRate: number, winRate: number, summary: string,
 *   core: {itemIds: number[], names: string[]}, starter: string[], recommended: string[]}>}
 */
export function parseBuilds(heroJson, itemMeta) {
  if (heroJson == null || typeof heroJson !== 'object' || Array.isArray(heroJson)) {
    throw new Error(`parseBuilds: heroJson 应为英雄 JSON 对象，收到 ${heroJson === null ? 'null' : typeof heroJson}`)
  }
  const { builds } = heroJson
  if (builds == null) return []
  if (!Array.isArray(builds)) {
    throw new Error(`parseBuilds: 英雄 ${heroJson.hero?.slug ?? '?'} 的 builds 应为数组，收到 ${typeof builds}`)
  }
  const lookup = metaLookup(itemMeta)
  const summary = Array.isArray(heroJson.gameplay?.summary)
    ? heroJson.gameplay.summary.join('\n')
    : typeof heroJson.gameplay?.summary === 'string'
      ? heroJson.gameplay.summary
      : ''

  /** @type {(items: unknown) => string[]} item 对象数组 → 名称数组（缺 id 的脏条目跳过） */
  const toNames = (items) =>
    (Array.isArray(items) ? items : [])
      .filter((it) => it != null && typeof it === 'object' && Number.isFinite(it.id))
      .map((it) => resolveName(it.id, it, lookup))

  return builds.map((b, i) => {
    if (b == null || typeof b !== 'object') {
      throw new Error(`parseBuilds: 英雄 ${heroJson.hero?.slug ?? '?'} 的 builds[${i}] 不是对象`)
    }
    const itemIds = Array.isArray(b.coreProfile?.itemIds) ? b.coreProfile.itemIds : []
    return {
      key: b.key,
      name: b.name,
      sampleCount: b.sampleCount,
      pickRate: b.pickRate,
      winRate: b.winRate,
      summary,
      core: { itemIds, names: itemIds.map((id) => resolveName(id, undefined, lookup)) },
      starter: toNames(b.items?.starter),
      recommended: toNames(b.items?.recommended),
    }
  })
}

/**
 * 装备共现凝聚聚类：把各 build 核心位的物品按"一起出"的强度聚成家族。
 *
 * 口径：
 * - 节点：出现在 ≥MIN_CORE_BUILDS 个 build 核心位的 itemId（每 build 核心位
 *   先去重；starter/recommended 不进图）。
 * - 边权 w(a,b)：a、b 同 build 核心位共现的样本量，按 build sampleCount 求和。
 * - 节点权 W(a)：a 出现过的全部 build 的 sampleCount 之和。
 * - Jaccard 相似度（物品对）：sim(a,b) = w(a,b) / (W(a) + W(b) - w(a,b))。
 *   凝聚成簇后推广到簇对：w = 跨簇边权之和，W = 簇内节点权之和，同一公式
 *   （内部紧密时该值可 >1，只用于比较大小，不影响排序正确性）。
 * - 合并：每轮取相似度最大的簇对合并（同分按两簇最小 id 的字典序取最先者），
 *   最大相似度 < JACCARD_THRESHOLD 即停止。
 * - familyId = 簇内最小 itemId（数字，可序列化）；单件节点自成一家族。
 * - buildCount：核心位含本簇至少一件物品的 build 数（一个 build 可同时计入
 *   多个簇）。
 *
 * 确定性是硬要求：节点/边/候选对的遍历与并列比较全部显式排序（id 升序），
 * 同输入同输出，构建可重现。
 *
 * 容错边界：空数组或全部 build 无核心位 → {families: [], itemFamily: {}}；
 * 核心位里的非数字/非有限 id（如 NaN、字符串）静默丢弃（脏缓存防御），
 * 不抛错。
 * fail-fast 边界：输入非数组、或参与加权的 build 的 sampleCount 非有限数
 * （NaN/undefined 会毒化权重与排序）→ 报错。
 *
 * @param {Array<{core: {itemIds: number[]}, sampleCount: number}>} builds parseBuilds 的输出
 * @returns {{families: Array<{id: number, items: number[], buildCount: number}>,
 *   itemFamily: Object<number, number>}} itemFamily 只覆盖节点（出现于
 *   ≥MIN_CORE_BUILDS 个 build 核心位的物品）；未达门槛的核心位物品没有键，
 *   消费方必须把"查无此键"当作"无家族"处理
 */
export function clusterItemFamilies(builds) {
  if (!Array.isArray(builds)) {
    throw new Error(`clusterItemFamilies: builds 应为数组，收到 ${typeof builds}`)
  }

  // 单 build 核心位去重后的集合 + 每件物品出现过的 build 数 / 权重和
  const coreSets = []
  const nodeBuilds = new Map() // itemId -> 出现过的 build 数
  const nodeWeight = new Map() // itemId -> Σ sampleCount
  const edgeWeight = new Map() // "a:b"(a<b) -> Σ 共现 sampleCount
  for (const [i, b] of builds.entries()) {
    const ids = [...new Set(b?.core?.itemIds ?? [])].filter((id) => typeof id === 'number' && Number.isFinite(id))
    if (ids.length === 0) continue // 无核心位的 build 不进图，其 sampleCount 不参与校验
    if (typeof b.sampleCount !== 'number' || !Number.isFinite(b.sampleCount)) {
      throw new Error(
        `clusterItemFamilies: builds[${i}]（key=${JSON.stringify(b?.key)}）的 sampleCount 应为有限数字，收到 ${String(b.sampleCount)}`,
      )
    }
    coreSets.push(new Set(ids))
    for (const a of ids) {
      nodeBuilds.set(a, (nodeBuilds.get(a) ?? 0) + 1)
      nodeWeight.set(a, (nodeWeight.get(a) ?? 0) + b.sampleCount)
    }
    for (let x = 0; x < ids.length; x++) {
      for (let y = x + 1; y < ids.length; y++) {
        const key = edgeKey(ids[x], ids[y])
        edgeWeight.set(key, (edgeWeight.get(key) ?? 0) + b.sampleCount)
      }
    }
  }

  const nodes = [...nodeBuilds.entries()].filter(([, n]) => n >= MIN_CORE_BUILDS).map(([id]) => id)
  nodes.sort((a, b) => a - b)
  if (nodes.length === 0) return { families: [], itemFamily: {} }

  /** @returns {number} 簇对相似度（同 Jaccard 公式的簇级推广，无边时为 0） */
  const sim = (c1, c2) => {
    let co = 0
    for (const a of c1) for (const b of c2) co += edgeWeight.get(edgeKey(a, b)) ?? 0
    if (co <= 0) return 0
    let w1 = 0
    let w2 = 0
    for (const a of c1) w1 += nodeWeight.get(a) ?? 0
    for (const b of c2) w2 += nodeWeight.get(b) ?? 0
    const denom = w1 + w2 - co
    return denom > 0 ? co / denom : 0
  }

  // 簇按最小 id 升序维护；每轮全量重算簇对相似度（节点规模 ≤ 百级，开销可忽略）
  let clusters = nodes.map((id) => [id])
  while (clusters.length > 1) {
    let best = null // {sim, a, b}，a/b 为两簇的最小 id（a<b，唯一定位一个簇对）
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const s = sim(clusters[i], clusters[j])
        if (s <= 0) continue
        const [a, b] = clusters[i][0] < clusters[j][0] ? [clusters[i][0], clusters[j][0]] : [clusters[j][0], clusters[i][0]]
        // 严格优于当前最优才替换：sim 降序，同分按 (a, b) 字典序 → 全序确定
        if (best === null || s > best.sim || (s === best.sim && (a < best.a || (a === best.a && b < best.b)))) {
          best = { sim: s, a, b }
        }
      }
    }
    if (best === null || best.sim < JACCARD_THRESHOLD) break
    const merged = [...clusters.find((c) => c[0] === best.a), ...clusters.find((c) => c[0] === best.b)]
    merged.sort((x, y) => x - y)
    clusters = clusters.filter((c) => c[0] !== best.a && c[0] !== best.b)
    clusters.push(merged)
  }

  clusters.sort((c1, c2) => c1[0] - c2[0])
  const families = clusters.map((items) => ({
    id: items[0],
    items,
    buildCount: coreSets.reduce((n, set) => n + (items.some((id) => set.has(id)) ? 1 : 0), 0),
  }))
  const itemFamily = {}
  for (const f of families) for (const id of f.items) itemFamily[id] = f.id
  return { families, itemFamily }
}

/** 边的稳定键：小 id 在前，保证 (a,b) 与 (b,a) 落到同一个槽。 */
function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}
