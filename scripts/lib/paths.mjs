import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repo root (scripts/lib/ -> ../..). */
export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** All fetched data lives under .cache/ (gitignored, never committed). */
export const CACHE_DIR = path.join(ROOT_DIR, '.cache')

/** AramHex data repo clone (or ARAMHEX_LOCAL_DIR override target). */
export const ARAMHEX_DIR = path.join(CACHE_DIR, 'aramhex-data')

/** Haidou scraped JSON mirror (or HAIDOU_LOCAL_DIR override target). */
export const HAIDOU_DIR = path.join(CACHE_DIR, 'haidou')

/** Raw game.gtimg.cn JS dumps (parsed downstream, not here). */
export const GTIMG_DIR = path.join(CACHE_DIR, 'gtimg')

/** Manifest written after a full successful fetch run. */
export const SOURCES_JSON = path.join(CACHE_DIR, 'sources.json')

/** Per-file failures tolerated during the haidou fetch. */
export const HAIDOU_FAILED_JSON = path.join(HAIDOU_DIR, 'FAILED.json')
