#!/usr/bin/env node
/**
 * Offline source fetcher for AramHexQuickSearch.
 *
 * Three public, anonymous sources, all cached under .cache/ (gitignored):
 *   1. aramhex  — git clone/pull of https://github.com/czgreat/aramhex-data
 *   2. haidou   — JSON scrape of https://haidou.zhishitft.cn (index + heroes + aux)
 *   3. gtimg    — game.gtimg.cn JSON served with .js filenames, saved verbatim
 *                 (NOT parsed here; parsing is deferred to later tasks)
 *
 * Env overrides (directory paths only, no secrets):
 *   FRESH=1            force refetch even when the cache manifest exists
 *   ARAMHEX_LOCAL_DIR  use a local aramhex-data checkout instead of clone/pull
 *   HAIDOU_LOCAL_DIR   copy haidou files from a local mirror instead of HTTP
 *   DEBUG=1            verbose logging (e.g. gtimg file head)
 *
 * Degradation: a failed haidou hero/aux file (or a hostile-slug path, which is
 * rejected before any I/O) is recorded in .cache/haidou/FAILED.json and the run
 * continues. A total haidou outage (index.json unavailable) degrades to
 * haidouDir:null / haidouCounts:null in sources.json while aramhex + gtimg
 * still fetch and the run exits 0 — downstream treats a missing haidou dir as
 * builds:null. Only an aramhex first-clone failure is fatal.
 */

import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import {
  ARAMHEX_DIR,
  CACHE_DIR,
  GTIMG_DIR,
  HAIDOU_DIR,
  HAIDOU_FAILED_JSON,
  SOURCES_JSON,
} from './lib/paths.mjs'

const execFileAsync = promisify(execFile)

const ARAMHEX_REPO = 'https://github.com/czgreat/aramhex-data'
const HAIDOU_BASE = 'https://haidou.zhishitft.cn'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const FETCH_TIMEOUT_MS = 30_000

const HAIDOU_AUX = [
  'data/augments/index.json',
  'data/items/index.json',
  'config/augment-flow-exclusions.json',
]

const GTIMG_FILES = [
  {
    url: 'https://game.gtimg.cn/images/lol/act/img/js/heroList/hero_list.js',
    file: 'hero_list.js',
  },
  {
    url: 'https://game.gtimg.cn/images/lol/act/img/js/summonerskillList/summonerskill_list.js',
    file: 'summonerskill_list.js',
  },
  // 海克斯图标索引（纯 JSON 数组：augmentID / small_Icon / large_Icon / …）
  {
    url: 'https://game.gtimg.cn/images/lol/act/img/js/kiwi/kiwi_augments.json',
    file: 'kiwi_augments.json',
  },
  // 装备图标索引（纯 JSON：items[].itemId / iconPath 完整 URL，含大乱斗模式装）
  {
    url: 'https://game.gtimg.cn/images/lol/act/img/js/items/items.js',
    file: 'items.js',
  },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** true when a previous successful run left a cache and FRESH wasn't requested. */
export function shouldSkipFetch({ cacheExists, fresh }) {
  return cacheExists && !fresh
}

/** Hero JSON paths relative to the haidou cache dir (single source of truth). */
export function haidouHeroRels(slugs) {
  return slugs.map((slug) => `data/heroes/${slug}.json`)
}

/** Map hero slugs to their haidou JSON URLs. */
export function haidouHeroUrls(slugs, base) {
  return haidouHeroRels(slugs).map((rel) => `${base}/${rel}`)
}

const CACHE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/

/**
 * Resolve a slash-relative haidou path under HAIDOU_DIR, refusing traversal.
 * index.json is third-party data; a hostile slug like "../package.json" must
 * never write outside .cache. Throws on unsafe input — callers treat that as a
 * per-file failure (FAILED.json), not a crash.
 */
export function cacheFile(rel) {
  const segments = rel.split('/')
  if (segments.some((segment) => !CACHE_SEGMENT_RE.test(segment) || segment === '..')) {
    throw new Error(`unsafe path rejected: "${rel}"`)
  }
  const abs = path.join(HAIDOU_DIR, ...segments)
  if (!abs.startsWith(HAIDOU_DIR + path.sep)) {
    throw new Error(`path escapes cache dir: "${rel}"`)
  }
  return abs
}

/**
 * GET with a plain browser UA and a 30s timeout. Retries 429/5xx and network
 * errors twice with exponential backoff (0.5s, 1s); other 4xx (404/403/410…)
 * are permanent and fail immediately. The final error always names the URL.
 */
async function fetchWithRetry(url, { retries = 2, backoffMs = [500, 1000] } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} ${res.statusText}`)
        err.retryable = res.status === 429 || res.status >= 500
        throw err
      }
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      const retryable = err.retryable !== false // network/timeout errors retry
      if (attempt >= retries || !retryable) {
        throw new Error(`${url}: ${err?.message || String(err)}`, { cause: err })
      }
      const delay = backoffMs[Math.min(attempt, backoffMs.length - 1)]
      console.warn(`  [retry ${attempt + 1}/${retries}] ${url} failed (${err?.message || err}); wait ${delay}ms`)
      await sleep(delay)
    }
  }
}

/** Fixed-concurrency worker pool (no third-party deps). */
async function runPool(items, concurrency, worker) {
  let next = 0
  const results = new Array(items.length)
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++
        results[index] = await worker(items[index], index)
      }
    }),
  )
  return results
}

/**
 * Source 1: aramhex-data git repo.
 * Local override (ARAMHEX_LOCAL_DIR, must exist) wins; otherwise pull --ff-only
 * an existing clone, clone shallow when missing, and record HEAD. Pull failure
 * degrades to reusing the existing copy; a failed first clone is fatal.
 */
export async function fetchAramhex() {
  if (process.env.ARAMHEX_LOCAL_DIR) {
    const dir = path.resolve(process.env.ARAMHEX_LOCAL_DIR)
    if (!existsSync(dir)) throw new Error(`ARAMHEX_LOCAL_DIR does not exist: ${dir}`)
    console.log(`[aramhex] using local dir: ${dir}`)
    return { dir, commit: 'local' }
  }

  const dir = ARAMHEX_DIR
  if (existsSync(dir)) {
    try {
      await execFileAsync('git', ['-C', dir, 'pull', '--ff-only'])
      console.log('[aramhex] pulled (ff-only)')
    } catch (err) {
      console.warn(`[aramhex] pull failed, reusing existing copy: ${err.message}`)
    }
  } else {
    await mkdir(path.dirname(dir), { recursive: true })
    await execFileAsync('git', ['clone', '--depth', '1', ARAMHEX_REPO, dir])
    console.log(`[aramhex] cloned ${ARAMHEX_REPO}`)
  }

  const { stdout } = await execFileAsync('git', ['-C', dir, 'rev-parse', 'HEAD'])
  const commit = stdout.trim()
  console.log(`[aramhex] commit ${commit}`)
  return { dir: path.resolve(dir), commit }
}

/**
 * Source 2: haidou JSON mirror.
 * Every per-file failure — including hostile-slug path rejection — degrades
 * into FAILED.json. A total outage (index.json unavailable) degrades to
 * {dir: null, counts: null} so the overall build still succeeds.
 */
export async function fetchHaidou() {
  const localDir = process.env.HAIDOU_LOCAL_DIR
    ? path.resolve(process.env.HAIDOU_LOCAL_DIR)
    : null
  const failed = []

  const writeFailedJson = async () => {
    await mkdir(HAIDOU_DIR, { recursive: true })
    await writeFile(
      HAIDOU_FAILED_JSON,
      JSON.stringify({ fetchedAt: new Date().toISOString(), failed }, null, 2) + '\n',
    )
  }

  // Entry point: data/index.json. Its absence is a total haidou outage —
  // skip the whole source gracefully (haidou:null in the manifest), never fatal.
  const indexPath = 'data/index.json'
  let index
  let indexBytes
  try {
    indexBytes = localDir
      ? await readFile(path.join(localDir, indexPath))
      : await fetchWithRetry(`${HAIDOU_BASE}/${indexPath}`)
    index = JSON.parse(indexBytes.toString('utf8'))
  } catch (err) {
    const message = err?.message || String(err)
    console.warn(`[haidou] index.json unavailable (${message}); skipping haidou source, build continues`)
    failed.push({ path: indexPath, error: message })
    await writeFailedJson()
    return { dir: null, counts: null }
  }

  const slugs = index.guides.map((g) => g.slug)
  console.log(`[haidou] index: ${slugs.length} guides`)
  await mkdir(path.dirname(cacheFile(indexPath)), { recursive: true })
  await writeFile(cacheFile(indexPath), indexBytes)

  // Everything below is best-effort: aux config files first, then all heroes.
  const jobs = [
    ...HAIDOU_AUX.map((rel) => ({ rel, isHero: false })),
    ...haidouHeroRels(slugs).map((rel) => ({ rel, isHero: true })),
  ]

  let heroesOk = 0
  await runPool(jobs, 8, async (job) => {
    try {
      const abs = cacheFile(job.rel) // reject hostile slugs before any I/O
      const bytes = localDir
        ? await readFile(path.join(localDir, job.rel))
        : await fetchWithRetry(`${HAIDOU_BASE}/${job.rel}`)
      await mkdir(path.dirname(abs), { recursive: true })
      await writeFile(abs, bytes)
      if (job.isHero) heroesOk++
    } catch (err) {
      failed.push({ path: job.rel, error: err?.message || String(err) })
      if (job.isHero) console.warn(`[haidou] hero failed: ${job.rel} (${err?.message || err})`)
    }
  })

  await writeFailedJson()

  const counts = { index: slugs.length, heroes: heroesOk, failed: failed.length }
  console.log(`[haidou] heroes ok=${heroesOk} failed=${failed.length}${localDir ? ` (local: ${localDir})` : ''}`)
  if (failed.length > 0) console.warn(`[haidou] failures recorded in ${HAIDOU_FAILED_JSON}`)
  return { dir: path.resolve(HAIDOU_DIR), counts }
}

/**
 * Source 3: game.gtimg.cn JSON dumps (served with .js filenames), saved
 * verbatim and unparsed — parsing is deferred to later tasks.
 */
export async function fetchGtimg() {
  await mkdir(GTIMG_DIR, { recursive: true })
  for (const { url, file } of GTIMG_FILES) {
    const buf = await fetchWithRetry(url)
    await writeFile(path.join(GTIMG_DIR, file), buf)
    console.log(`[gtimg] ${file} (${buf.length} bytes)`)
    if (process.env.DEBUG === '1') {
      console.log(`[gtimg] ${file} starts with: ${buf.toString('utf8', 0, 120)}`)
    }
  }
  return { dir: path.resolve(GTIMG_DIR) }
}

/** Parsed sources.json, or null when missing/corrupt (fall through to fetch). */
function readManifestSafe() {
  try {
    return JSON.parse(readFileSync(SOURCES_JSON, 'utf8'))
  } catch {
    return null
  }
}

/**
 * A cache is only skippable when all three source dirs still exist on disk AND
 * every gtimg file (incl. the icon indexes added later) is present — an old
 * cache from before the icon sources existed must refetch, or analyze would
 * die on the missing files.
 */
function manifestComplete(manifest) {
  const dirsOk = Boolean(
    manifest &&
      [manifest.aramhexDir, manifest.haidouDir, manifest.gtimgDir].every(
        (dir) => dir && existsSync(dir),
      ),
  )
  const gtimgFilesOk = Boolean(
    manifest?.gtimgDir &&
      GTIMG_FILES.every(({ file }) => existsSync(path.join(manifest.gtimgDir, file))),
  )
  return dirsOk && gtimgFilesOk
}

async function main() {
  const fresh = process.env.FRESH === '1'
  const cached = readManifestSafe()
  if (shouldSkipFetch({ cacheExists: manifestComplete(cached), fresh })) {
    console.log(`[fetch] cache complete (fetchedAt=${cached.fetchedAt}); skipping. Set FRESH=1 to force refetch.`)
    return
  }

  const aramhex = await fetchAramhex()
  const haidou = await fetchHaidou()
  const gtimg = await fetchGtimg()

  const manifest = {
    aramhexCommit: aramhex.commit,
    aramhexDir: aramhex.dir,
    haidouDir: haidou.dir,
    gtimgDir: gtimg.dir,
    fetchedAt: new Date().toISOString(),
    haidouCounts: haidou.counts,
  }
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(SOURCES_JSON, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`[fetch] done -> ${SOURCES_JSON}`)
  console.log(JSON.stringify(manifest, null, 2))
}

// Only auto-run when executed directly (node scripts/fetch-sources.mjs).
// vitest imports this module for its pure helpers; a bare import must never
// trigger real network fetches. realpath on both sides keeps symlinks honest.
const isMain = (() => {
  try {
    const entry = process.argv[1]
    return Boolean(entry) && realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()

if (isMain) {
  await main().catch((err) => {
    console.error(`[fetch] FAILED: ${err?.message || String(err)}`)
    process.exit(1)
  })
}
