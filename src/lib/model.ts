import { DEFAULT_PARAMS, type Params } from './estimate'

export type Lang = 'en' | 'uk'
export type Theme = 'auto' | 'light' | 'dark'

export interface Settings {
  lang: Lang
  theme: Theme
  currency: string
  jobTitle: string
  customer: string
}

export interface AppState {
  settings: Settings
  params: Params
}

const KEY = 'print-cost-estimator:v1'

export function defaultState(): AppState {
  const uk = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('uk')
  return {
    settings: { lang: uk ? 'uk' : 'en', theme: 'auto', currency: '$', jobTitle: '', customer: '' },
    params: { ...DEFAULT_PARAMS },
  }
}

/** Merges stored values over the defaults, keeping only keys of the right type. */
export function mergeState(raw: unknown): AppState {
  const d = defaultState()
  if (!raw || typeof raw !== 'object') return d
  const r = raw as { settings?: Record<string, unknown>; params?: Record<string, unknown> }
  const pick = <T extends object>(base: T, src: Record<string, unknown> | undefined): T => {
    const out = { ...base }
    if (src && typeof src === 'object') {
      for (const k of Object.keys(base) as (keyof T)[]) {
        const v = src[k as string]
        if (typeof v === typeof base[k] && (typeof v !== 'number' || Number.isFinite(v))) out[k] = v as T[keyof T]
      }
    }
    return out
  }
  const settings = pick(d.settings, r.settings)
  if (settings.lang !== 'en' && settings.lang !== 'uk') settings.lang = d.settings.lang
  if (!['auto', 'light', 'dark'].includes(settings.theme)) settings.theme = 'auto'
  return { settings, params: pick(d.params, r.params) }
}

export function loadState(): AppState {
  try {
    return mergeState(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return defaultState()
  }
}

export function saveState(s: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage full or unavailable: settings just won't persist
  }
}
