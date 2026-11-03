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
 * - <br> → 换行符（游戏内每条属性独立一行，弹层用 whitespace-pre-line 渲染）；
 * - <mainText>/<stats> 为结构容器，不产生分段；
 * - <passive>（被动名）前强制换行 → 独立小节，hl 高亮；
 * - 其余行内标签（attention/scaleXX/healing/…）圈住的文字 → {text, hl:true}；
 * - 标签外文字 → {text}；@变量@ 占位符剔除；
 * - 分段 text 内可含 \n（多行），段内横向空白折叠，每行 trim。
 * @param {string} s
 * @returns {Array<{text: string, hl?: true}>}
 */
export function richTextSegments(s) {
  if (typeof s !== 'string') return []
  const segs = []
  let buf = ''
  let hl = false
  /** 被动名闭合后置位：吞掉紧随的一个 <br>（避免叠出空行） */
  let swallowBreak = false
  const flush = () => {
    // 横向空白折叠 + 每行 trim；连续换行（≥2）统一折叠为「一个空行」——
    // 换行多了显乱，空行只用于区块分隔，绝不叠加
    const lines = buf
      .replace(/[ \t]+/g, ' ')
      .split('\n')
      .map((l) => l.trim())
      .join('\n')
      .replace(/\n{2,}/g, '\n\n')
    if (lines.trim() !== '') segs.push(hl ? { text: lines, hl: true } : { text: lines })
    buf = ''
  }
  for (const tk of s.split(/(<[^>]+>)/g)) {
    if (tk === '') continue
    const m = tk.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/)
    if (!m) {
      buf += tk.replace(/@[A-Za-z_][A-Za-z0-9_]*@/g, '')
      swallowBreak = false
      continue
    }
    const closing = m[1] === '/'
    const tag = m[2].toLowerCase()
    if (tag === 'br') {
      // 被动名闭合后的紧随 <br> 吞掉（其闭合已自带换行，否则会叠出空行）
      if (swallowBreak) {
        swallowBreak = false
        continue
      }
      buf += '\n'
      continue
    }
    if (tag === 'maintext' || tag === 'stats') continue
    if (tag === 'passive' && !closing) {
      // 被动名独立成节：先落段，再以换行开头开启新的高亮段
      flush()
      hl = true
      buf = '\n'
      continue
    }
    if (tag === 'passive' && closing) {
      // 被动名独占一行，闭合后空一行再接描述（用户排版规范）；
      // 若源数据紧随 <br>，配合 flush 的折叠也只会是一个空行
      flush()
      hl = false
      buf = '\n\n'
      swallowBreak = true
      continue
    }
    // 行内样式标签开/闭：闭侧先把已积累文本按当前 hl 落段，再翻转状态
    flush()
    hl = !closing
    swallowBreak = false
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

/**
 * 装备属性表：解析 description 的 <stats> 块（数值 [可带 %] + 中文属性名 成对出现）。
 * 例："50 攻击力  45% 攻击速度" → [{name:'攻击力', pct:false, value:50}, {name:'攻击速度', pct:true, value:45}]
 * 无 <stats> 块（如消耗品生命药水）返回 []。
 * @param {string} description
 * @returns {Array<{name: string, pct: boolean, value: number}>}
 */
/**
 * 极简 XML 片段解析器（无依赖）：把 gtimg 的类 XML 描述解析为节点树。
 * 支持嵌套元素、自闭合（<br/>）、属性（attrs 原样字符串）与文本节点（#text）。
 * 只处理良构片段——gtimg 数据源满足；异常输入按文本兜底，不抛错。
 * @param {string} s
 * @returns {{tag: string, attrs?: string, children: Array<object>, text?: string}}
 */
export function parseXmlFragment(s) {
  const root = { tag: '#fragment', children: [] }
  const stack = [root]
  for (const tk of s.match(/<[^>]+>|[^<]+/g) ?? []) {
    const top = stack[stack.length - 1]
    const close = tk.match(/^<\/(\s*[a-zA-Z0-9-]+)\s*>$/)
    if (close) {
      if (stack.length > 1) stack.pop()
      continue
    }
    const open = tk.match(/^<\s*([a-zA-Z0-9-]+)((?:\s+[^<>]*?)?)\s*(\/)?>$/)
    if (open) {
      const node = { tag: open[1].toLowerCase(), attrs: (open[2] ?? '').trim(), children: [] }
      top.children.push(node)
      // <br> 等 HTML 空元素没有闭合标签，不能压栈（否则后续节点全成其子节点）
      if (!tk.endsWith('/>') && !['br', 'hr', 'img', 'meta'].includes(open[1].toLowerCase())) stack.push(node)
      continue
    }
    top.children.push({ tag: '#text', text: tk.replace(/@[A-Za-z_][A-Za-z0-9_]*@/g, '') })
  }
  return root
}

/** 元素的直接文本内容（拼接 #text 子节点，折叠空白） */
function elementText(node) {
  return (node.children ?? [])
    .filter((c) => c.tag === '#text')
    .map((c) => c.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 深度优先找第一个指定标签名的元素 */
function findElement(node, tag) {
  for (const c of node.children ?? []) {
    if (c.tag === tag) return c
    const hit = findElement(c, tag)
    if (hit) return hit
  }
  return null
}

/** 装备属性表：正经解析 description 的 <stats> XML 块——数值元素 + 紧随文本节点（属性名）。
 *  例：'<stats><attention>65</attention>攻击力<br><attention>25%</attention>攻击速度</stats>'
 *  → [{name:'攻击力', pct:false, value:65}, {name:'攻击速度', pct:true, value:25}]
 *  无 <stats> 块（如消耗品生命药水）返回 []。
 * @param {string} description
 * @returns {Array<{name: string, pct: boolean, value: number}>}
 */
export function itemStats(description) {
  if (typeof description !== 'string') return []
  const statsEl = findElement(parseXmlFragment(description), 'stats')
  if (!statsEl) return []
  const out = []
  const kids = statsEl.children
  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i]
    if (kid.tag === '#text' || kid.tag === 'br') continue
    const valueText = elementText(kid)
    const value = parseFloat(valueText)
    if (!Number.isFinite(value)) continue
    // 属性名 = 数值元素之后紧邻的文本节点（如 <attention>25%</attention>攻击速度）
    const nameNode = kids[i + 1]
    const name = nameNode?.tag === '#text' ? nameNode.text.trim() : ''
    if (name === '') continue
    // % 在数值文本里（如 2.5%），不在属性名上
    out.push({ name, pct: valueText.includes('%'), value })
  }
  return out
}
