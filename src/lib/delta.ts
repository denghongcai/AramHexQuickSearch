/**
 * 海克斯 Δpp 计算 / 着色 / 格式化（Task 11 英雄详情海克斯表）。
 *
 * 口径：Δpp = 该海克斯在该英雄下的胜率 − 该英雄全体胜率。
 * 两边都是百分数（58.36 = 58.36%），直接相减；结果四舍五入到 2 位小数，
 * 消除浮点尾差（65.64 - 58.36 = 7.280000000000001 → 7.28）。
 */

/** 百分数直接相减，保留 2 位小数 */
export function ppDelta(winRate: number, overallWinRate: number): number {
  return Math.round((winRate - overallWinRate) * 100) / 100
}

/** Δpp → 文字色类：±2pp 内中性（muted），正数 accent 绿，负数 tier-d 红 */
export function deltaClass(delta: number): string {
  if (delta > 2) return 'text-accent'
  if (delta < -2) return 'text-tier-d'
  return 'text-muted'
}

/** Δpp → 带符号两位小数文本：+7.28 / -3.26 / 0.00 */
export function formatDelta(delta: number): string {
  return `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`
}
