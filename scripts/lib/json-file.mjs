import fs from 'node:fs'

/**
 * 带上下文的 JSON 文件读取（构建期脚本共用）。
 *
 * - 读文件失败 → 「读取文件失败: <路径>（<原因>）」，原 err 挂在 cause 上、
 *   其 code（如 ENOENT）透传到包装错误的 code，供调用方做降级判断；
 * - 解析失败 → 「解析 JSON 失败: <路径>（<原因>）」。
 * @param {string} file
 * @returns {unknown}
 */
export function readJsonFile(file) {
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (err) {
    const wrapped = new Error(`读取文件失败: ${file}（${err.message}）`, { cause: err })
    wrapped.code = err.code
    throw wrapped
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new Error(`解析 JSON 失败: ${file}（${err.message}）`, { cause: err })
  }
}

/**
 * 是否为「文件不存在」（区别于其他 IO / 解析错误——前者可降级，后者是缓存污染）。
 * @param {unknown} err
 * @returns {boolean}
 */
export function isNotFound(err) {
  return err?.code === 'ENOENT' || err?.cause?.code === 'ENOENT'
}
