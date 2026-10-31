#!/usr/bin/env node
/**
 * Offline source fetcher for AramHexQuickSearch.
 *
 * Three public, anonymous sources, all cached under .cache/ (gitignored):
 *   1. aramhex  — git clone/pull of https://github.com/czgreat/aramhex-data
 *   2. haidou   — JSON scrape of https://haidou.zhishitft.cn (index + heroes + aux)
 *   3. gtimg    — raw game.gtimg.cn JS dumps (var xxx = {...}; NOT parsed here)
 *
 * Env overrides (directory paths only, no secrets):
 *   FRESH=1            force refetch even when the cache manifest exists
 *   ARAMHEX_LOCAL_DIR  use a local aramhex-data checkout instead of clone/pull
 *   HAIDOU_LOCAL_DIR   copy haidou files from a local mirror instead of HTTP
 *
 * Degradation: a failed haidou hero/aux file is recorded in .cache/haidou/FAILED.json
 * and the run continues; only data/index.json failing aborts the haidou source.
 */

import { execFile } from 'node:child_process'
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

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
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** true when a previous successful run left a cache and FRESH wasn't requested. */
export function shouldSkipFetch({ cacheExists, fresh }) {
  return cacheExists && !fresh
}

/** Map hero slugs to their haidou JSON URLs. */
export function haidouHeroUrls(slugs, base) {
  return slugs.map((slug) => `${base}/data/heroes/${slug}.json`)
}

/** GET with a plain browser UA; retries twice with exponential backoff (0.5s, 1s). */
async function fetchWithRetry(url, { retries = 2, backoffMs = [500, 1000] } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      if (attempt >= retries) throw err
      const delay = backoffMs[Math.min(attempt, backoffMs.length - 1)]
      console.warn(`  [retry ${attempt + 1}/${retries}] ${url} failed (${err.message}); wait ${delay}ms`)
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
 * Local override (ARAMHEX_LOCAL_DIR) wins; otherwise pull --ff-only an existing
 * clone, clone shallow when missing, and record HEAD. Pull failure degrades to
 * reusing the existing copy; a failed first clone is fatal.
 */
export async function fetchAramhex() {
  if (process.env.ARAMHEX_LOCAL_DIR) {
    const dir = path.resolve(process.env.ARAMHEX_LOCAL_DIR)
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
 * index.json is mandatory (fatal); every other file degrades into FAILED.json.
 */
export async function fetchHaidou() {
  const localDir = process.env.HAIDOU_LOCAL_DIR
    ? path.resolve(process.env.HAIDOU_LOCAL_DIR)
    : null
  const failed = []

  // Mandatory entry point: data/index.json (local copy or HTTP).
  const indexPath = 'data/index.json'
  let indexBytes
  if (localDir) {
    indexBytes = await readFile(path.join(localDir, indexPath))
  } else {
    indexBytes = await fetchWithRetry(`${HAIDOU_BASE}/${indexPath}`)
  }
  const index = JSON.parse(indexBytes.toString('utf8'))
  const slugs = index.guides.map((g) => g.slug)
  console.log(`[haidou] index: ${slugs.length} guides`)

  await mkdir(path.join(HAIDOU_DIR, 'data', 'heroes'), { recursive: true })
  await writeFile(path.join(HAIDOU_DIR, ...indexPath.split('/')), indexBytes)

  // Everything below is best-effort: aux config files first, then all heroes.
  const jobs = [
    ...HAIDOU_AUX.map((rel) => ({ rel, isHero: false })),
    ...slugs.map((slug) => ({ rel: `data/heroes/${slug}.json`, isHero: true })),
  ]

  let heroesOk = 0
  await runPool(jobs, 8, async (job) => {
    const abs = path.join(HAIDOU_DIR, ...job.rel.split('/'))
    try {
      const bytes = localDir
        ? await readFile(path.join(localDir, job.rel))
        : await fetchWithRetry(`${HAIDOU_BASE}/${job.rel}`)
      await mkdir(path.dirname(abs), { recursive: true })
      await writeFile(abs, bytes)
      if (job.isHero) heroesOk++
    } catch (err) {
      failed.push({ path: job.rel, error: String(err.message || err) })
      if (job.isHero) console.warn(`[haidou] hero failed: ${job.rel} (${err.message})`)
    }
  })

  await writeFile(HAIDOU_FAILED_JSON, JSON.stringify({ fetchedAt: new Date().toISOString(), failed }, null, 2) + '\n')

  const counts = { index: slugs.length, heroes: heroesOk, failed: failed.length }
  console.log(`[haidou] heroes ok=${heroesOk} failed=${failed.length}${localDir ? ` (local: ${localDir})` : ''}`)
  if (failed.length > 0) console.warn(`[haidou] failures recorded in ${HAIDOU_FAILED_JSON}`)
  return { dir: path.resolve(HAIDOU_DIR), counts }
}

/**
 * Source 3: game.gtimg.cn JS dumps, saved verbatim. These are JavaScript
 * assignments (var xxx = {...};), not JSON — parsing is downstream's job.
 */
export async function fetchGtimg() {
  await mkdir(GTIMG_DIR, { recursive: true })
  for (const { url, file } of GTIMG_FILES) {
    const buf = await fetchWithRetry(url)
    await writeFile(path.join(GTIMG_DIR, file), buf)
    console.log(`[gtimg] ${file} (${buf.length} bytes) starts with: ${buf.toString('utf8', 0, 120)}`)
  }
  return { dir: path.resolve(GTIMG_DIR) }
}

async function main() {
  const fresh = process.env.FRESH === '1'
  if (shouldSkipFetch({ cacheExists: existsSync(SOURCES_JSON), fresh })) {
    const prev = JSON.parse(await readFile(SOURCES_JSON, 'utf8'))
    console.log(`[fetch] cache exists (fetchedAt=${prev.fetchedAt}); skipping. Set FRESH=1 to force refetch.`)
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

main().catch((err) => {
  console.error(`[fetch] FAILED: ${err.message}`)
  process.exit(1)
})
