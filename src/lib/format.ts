/**
 * 数字缩写格式化（万 / 亿），总览页 meta 卡与移动端总览条共用。
 *
 * 口径：
 * - ≥1e8 用「亿」，保留 1 位小数；
 * - ≥1e4 用「万」，其中 ≥100 万取整（对局数主口径，如 21169946 → 2117 万），
 *   其余保留 1 位小数（如 394680 → 39.5 万）；
 * - <1e4 原样返回；
 * - 尾随 .0 一律去掉（1.0 亿 → 1 亿）。
 */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (n >= 1e8) return `${trimTrailingZero((n / 1e8).toFixed(1))} 亿`
  if (n >= 1e4) {
    const wan = n / 1e4
    return `${wan >= 100 ? String(Math.round(wan)) : trimTrailingZero(wan.toFixed(1))} 万`
  }
  return String(n)
}

/** 去掉 toFixed 产生的尾随 .0（"1.0" → "1"，"39.5" 不动） */
function trimTrailingZero(s: string): string {
  return s.replace(/\.0$/, '')
}
