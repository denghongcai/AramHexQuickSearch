import { pinyin } from 'pinyin-pro'

/**
 * 搜索键与拼音（构建期用，纯函数，输出可直接 JSON 序列化）。
 *
 * 输入来自 Task 7 的合成：aramhex heroes 的中文名/称号 + gtimg hero_list 的
 * 拉丁 alias。输出四个检索字段，供前端 includes 匹配（Task 9）：
 * - n: name 词项（规范化中文名 + 规范化拉丁别名，去重）
 * - t: title 词项（规范化称号 + 称号全拼，去重）
 * - p: alias 词项（规范化拉丁别名）
 * - f: 首字母词项（name 全拼首字母 + title 全拼首字母，去重）
 *
 * 例：{name:'亚索', title:'疾风剑豪', alias:'Yasuo'} →
 *   n:['亚索','yasuo']  t:['疾风剑豪','jifengjianhao']  p:['yasuo']  f:['ys','jfjh']
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

/**
 * 构建英雄检索键。
 *
 * fail-fast：name/title 是检索主键，缺失或规范化后为空说明上游数据脏，
 * 构建期直接报错（报出字段名与原值），绝不静默产出残缺键；
 * alias 允许缺省（undefined/null/规范化为空 → p 为空数组、n 只有一项），
 * 但出现非字符串即视为上游结构漂移，同样报错。
 *
 * @param {Object} hero
 * @param {string} hero.name 中文名，如 '亚索'
 * @param {string} hero.title 称号，如 '疾风剑豪'
 * @param {string=} [hero.alias] 拉丁名，如 'Yasuo'，可缺省
 * @returns {{n: string[], t: string[], p: string[], f: string[]}}
 * @throws {Error} name/title 非字符串或规范化后为空；alias 存在但非字符串
 */
export function buildSearchKeys({ name, title, alias } = {}) {
  if (typeof name !== 'string') {
    throw new Error(`buildSearchKeys: name 必须是字符串，收到 ${typeof name}（${String(name)}）`)
  }
  if (typeof title !== 'string') {
    throw new Error(`buildSearchKeys: title 必须是字符串，收到 ${typeof title}（${String(title)}）`)
  }
  if (alias != null && typeof alias !== 'string') {
    throw new Error(`buildSearchKeys: alias 必须是字符串或缺省，收到 ${typeof alias}（${String(alias)}）`)
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

  return {
    n: uniqTerms([normalName, normalAlias]),
    t: uniqTerms([normalTitle, toPinyinFull(normalTitle)]),
    p: uniqTerms([normalAlias]),
    f: uniqTerms([toPinyinInitials(normalName), toPinyinInitials(normalTitle)]),
  }
}
