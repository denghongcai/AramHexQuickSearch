import { pinyin } from 'pinyin-pro'

/**
 * 搜索键与拼音（构建期用，纯函数，输出可直接 JSON 序列化）。
 *
 * 输入来自 Task 7 的合成：aramhex heroes 的中文名/称号 + gtimg hero_list 的
 * 拉丁 alias；可选叠加海斗 index.json guides[].aliases 的社区外号（中文名 /
 * 全拼 / 首字母混合，如 布兰德 → ['火男','huonan','bulande',…]）。
 * 输出四个检索字段，供前端 includes 匹配（Task 9，matcher 零改动）：
 * - n: name 词项（规范化中文名 + 规范化拉丁别名，去重）
 * - t: title 词项（规范化称号 + 称号全拼，去重）
 * - p: alias 词项（规范化拉丁别名）
 * - f: 首字母词项（name 全拼首字母 + title 全拼首字母，去重）
 *
 * 例：{name:'亚索', title:'疾风剑豪', alias:'Yasuo'} →
 *   n:['亚索','yasuo']  t:['疾风剑豪','jifengjianhao']  p:['yasuo']  f:['ys','jfjh']
 *
 * 传入 aliases（海斗可用）时，name/title/alias/全部外号统一进词库：
 * 含 CJK 的词项 → 规范化词 + 全拼进 n、首字母进 f（火男 → huonan + hn）；
 * 纯拉丁词项 → 进 n 与 p（前端只匹配 n/t/f，拉丁词必须进 n 才可命中）。
 * 由此修复已知缺口：名称全拼缺失（布兰德 → bulande 此前搜不到）。
 * 降级行为：海斗整体不可用（manifest.haidouDir=null）或该英雄条目缺 aliases
 * 时不传本参数，输出与旧版完全一致（向后兼容，检索永不因别名缺失中断）。
 */

/**
 * 检索文本规范化：NFKC → toLocaleLowerCase('zh-CN') → 只留 a-z0-9 和 CJK。
 * CJK 范围 U+3400–U+9FFF（㐀-鿿），与海斗 hero-search 同款口径。
 * @param {unknown} text
 * @returns {string}
 */
export function normalize(text) {
  return String(text).normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[^a-z0-9㐀-鿿]/g, '')
}

/**
 * 汉字串转无调全拼，ü 转 v。多音字以 pinyin-pro 默认（最常用）读音为准，
 * 例如「锤石」→ chuishi 而非 cuishi；只要库版本固定，输出即确定。
 * ü 只会出现在拼音输出里（normalize 产物中已被正则剔除），转 v 后
 * 用户键盘可直接输入（nü → nv，输入法同款约定），前端无需再做 v/ü 归一。
 * @param {string} text 已 normalize 的文本
 * @returns {string}
 */
function toPinyinFull(text) {
  return pinyin(text, { toneType: 'none', type: 'array' })
    .join('')
    .replaceAll('ü', 'v')
}

/**
 * 汉字串转全拼首字母（ü 不出现在声母位置，无需转写）。
 * 拉丁串会逐字符成为独立"音节"，首字母即整串（库真实行为，不另行拦截）。
 * @param {string} text 已 normalize 的文本
 * @returns {string}
 */
function toPinyinInitials(text) {
  return pinyin(text, { toneType: 'none', type: 'array' })
    .map((s) => s[0])
    .join('')
}

/** 保序去重并去掉空串。 */
function uniqTerms(terms) {
  return [...new Set(terms.filter(Boolean))]
}

/** 规范化产物中是否含 CJK（normalize 只留 a-z0-9 与 U+3400–U+9FFF，见上文）。 */
const CJK_RE = /[㐀-鿿]/

/**
 * 构建英雄检索键。
 *
 * fail-fast：name/title 是检索主键，缺失或规范化后为空说明上游数据脏，
 * 构建期直接报错（报出字段名与原值），绝不静默产出残缺键；
 * alias 允许缺省（undefined/null/规范化为空 → p 为空数组、n 只有一项），
 * 但出现非字符串即视为上游结构漂移，同样报错；
 * aliases（社区外号）允许缺省（缺省 / 空数组 → 输出与旧版完全一致），
 * 但出现非数组或数组内非字符串同样报错。
 *
 * @param {Object} hero
 * @param {string} hero.name 中文名，如 '亚索'
 * @param {string} hero.title 称号，如 '疾风剑豪'
 * @param {string=} [hero.alias] 拉丁名，如 'Yasuo'，可缺省
 * @param {string[]=} [hero.aliases] 社区外号（海斗 guides[].aliases，中/拼/拉丁
 *   混合），可缺省；缺省或空数组时输出与旧版完全一致（向后兼容钉）
 * @returns {{n: string[], t: string[], p: string[], f: string[]}}
 * @throws {Error} name/title 非字符串或规范化后为空；alias 存在但非字符串；
 *   aliases 存在但非数组，或数组内含非字符串
 */
export function buildSearchKeys({ name, title, alias, aliases } = {}) {
  if (typeof name !== 'string') {
    throw new Error(`buildSearchKeys: name 必须是字符串，收到 ${typeof name}（${String(name)}）`)
  }
  if (typeof title !== 'string') {
    throw new Error(`buildSearchKeys: title 必须是字符串，收到 ${typeof title}（${String(title)}）`)
  }
  if (alias != null && typeof alias !== 'string') {
    throw new Error(`buildSearchKeys: alias 必须是字符串或缺省，收到 ${typeof alias}（${String(alias)}）`)
  }
  if (aliases != null && !Array.isArray(aliases)) {
    throw new Error(`buildSearchKeys: aliases 必须是字符串数组或缺省，收到 ${typeof aliases}（${String(aliases)}）`)
  }
  for (const term of aliases ?? []) {
    if (typeof term !== 'string') {
      throw new Error(`buildSearchKeys: aliases 词项必须是字符串，收到 ${typeof term}（${String(term)}）`)
    }
  }

  const normalName = normalize(name)
  const normalTitle = normalize(title)
  if (!normalName) {
    throw new Error(`buildSearchKeys: name 规范化后为空，无法生成检索键（原始值: ${JSON.stringify(name)}）`)
  }
  if (!normalTitle) {
    throw new Error(`buildSearchKeys: title 规范化后为空，无法生成检索键（原始值: ${JSON.stringify(title)}）`)
  }

  const normalAlias = alias != null ? normalize(alias) : ''

  // 旧口径（无社区别名时的唯一路径，逐字段语义不变）
  const n = uniqTerms([normalName, normalAlias])
  const t = uniqTerms([normalTitle, toPinyinFull(normalTitle)])
  const p = uniqTerms([normalAlias])
  const f = uniqTerms([toPinyinInitials(normalName), toPinyinInitials(normalTitle)])

  if (aliases == null || aliases.length === 0) {
    return { n, t, p, f }
  }

  // 有社区别名：name/title/alias/全部外号统一进词库（规范化 + ü→v，全字段去重）。
  // 含 CJK 的词项 → 词本身 + 全拼进 n（bulande/huonan/kaorou 由此可命中）、
  // 首字母进 f（huonan→hn）；纯拉丁词项 → 进 n 与 p（前端只匹配 n/t/f）。
  const extraN = []
  const extraP = []
  const extraF = []
  for (const raw of [name, title, alias, ...aliases]) {
    const term = raw != null ? normalize(raw) : ''
    if (!term) continue
    if (CJK_RE.test(term)) {
      extraN.push(term, toPinyinFull(term))
      extraF.push(toPinyinInitials(term))
    } else {
      extraN.push(term)
      extraP.push(term)
    }
  }
  return {
    n: uniqTerms([...n, ...extraN]),
    t,
    p: uniqTerms([...p, ...extraP]),
    f: uniqTerms([...f, ...extraF]),
  }
}
