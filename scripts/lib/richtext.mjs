/**
 * gtimg 富文本解析（装备/海克斯的游戏内提示 → 前端可渲染的分段结构）。
 * 数据源口径（实测）：
 * - kiwi_augments.json 的 tooltip 本就是无标签纯文本（含括号补充），desc 带样式标签
 *   与 @变量@ 占位符（如 @Stacks_Max@，无上游数值可替换，剔除后语句仍通顺）；
 * - items.js 的 description 是完整属性富文本：<attention>50</attention> 这类标签
 *   圈住的正是游戏内高亮显示的数值段，<passive> 是被动名，<br> 是换行，
 *   <mainText>/<stats> 是纯结构容器；
 * - items.js 的 plaintext 是官方短摘要（纯文本）。
 *
 * 输出统一为分段数组 [{text, hl?}]：hl=true 的段前端用主题色加粗渲染
 * （对应游戏内的数值/被动高亮）。纯文本场景取 map(s => s.text).join('')。
 */

/** 剥标签取纯文本（aria/标题等纯文本场景用）：<br> 转空格防粘连，标签剔除保留
 *  内部文字，@变量@ 占位符剔除，连续空白折叠 */
export function stripRichTags(s) {
  if (typeof s !== 'string') return ''
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/@[A-Za-z_][A-Za-z0-9_]*@/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 富文本 → 分段数组。规则（对 gtimg 两类源实测归纳）：
 * - <br> → 空格；
 * - <mainText>/<stats> 为结构容器，不产生分段；
 * - 其余行内标签（attention/scaleXX/healing/…/passive）圈住的文字 → {text, hl:true}；
 * - 标签外文字 → {text}；
 * - 相邻分段自然交替，不做合并；@变量@ 占位符剔除。
 * @param {string} s
 * @returns {Array<{text: string, hl?: true}>}
 */
export function richTextSegments(s) {
  if (typeof s !== 'string') return []
  const segs = []
  let buf = ''
  let hl = false
  const flush = () => {
    const t = buf.replace(/\s+/g, ' ').trim()
    if (t !== '') segs.push(hl ? { text: t, hl: true } : { text: t })
    buf = ''
  }
  for (const tk of s.split(/(<[^>]+>)/g)) {
    if (tk === '') continue
    const m = tk.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/)
    if (!m) {
      buf += tk.replace(/@[A-Za-z_][A-Za-z0-9_]*@/g, '')
      continue
    }
    const closing = m[1] === '/'
    const tag = m[2].toLowerCase()
    if (tag === 'br') {
      buf += ' '
      continue
    }
    if (tag === 'maintext' || tag === 'stats') continue
    // 行内样式标签开/闭：闭侧先把已积累文本按当前 hl 落段，再翻转状态
    flush()
    hl = !closing
  }
  flush()
  return segs
}

/** 海克斯提示分段：tooltip 纯文本优先（单段），desc 富文本解析兜底；皆缺返回 [] */
export function augmentTipSegments(entry) {
  if (entry == null || typeof entry !== 'object') return []
  const tip = typeof entry.tooltip === 'string' ? entry.tooltip.trim() : ''
  if (tip !== '') return [{ text: tip }]
  return richTextSegments(entry.desc)
}

/** 装备提示分段：description 富文本解析优先，plaintext 短摘要单段兜底；皆缺返回 [] */
export function itemTipSegments(entry) {
  if (entry == null || typeof entry !== 'object') return []
  const desc = typeof entry.description === 'string' && entry.description.trim() !== '' ? richTextSegments(entry.description) : []
  if (desc.length > 0) return desc
  const plain = typeof entry.plaintext === 'string' ? entry.plaintext.trim() : ''
  return plain !== '' ? [{ text: plain }] : []
}
