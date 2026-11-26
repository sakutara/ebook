import type { AppDB } from '../db/db'

export interface ReaderPrefs {
  fontScale: number
  lineHeight: 1.4 | 1.6 | 1.8
  theme: 'light' | 'sepia' | 'dark'
  /** Turn pages with media-session buttons (headset, page-turner remote, lock screen). */
  mediaKeys: boolean
}

export const DEFAULT_PREFS: ReaderPrefs = { fontScale: 1, lineHeight: 1.6, theme: 'light', mediaKeys: true }

export const THEMES = {
  light: { fg: '#2b2118', bg: '#faf6ee' },
  sepia: { fg: '#433422', bg: '#f1e6cc' },
  dark: { fg: '#e0d6c4', bg: '#16120e' },
} as const

const LINE_HEIGHTS: readonly number[] = [1.4, 1.6, 1.8]
const THEME_NAMES = Object.keys(THEMES) as ReaderPrefs['theme'][]
const SETTING_KEY = 'reader.prefs'

/** Merge with defaults; sanitise every field. Invalid values fall back to defaults. */
export function clampPrefs(p: Partial<ReaderPrefs>): ReaderPrefs {
  const raw = typeof p?.fontScale === 'number' && Number.isFinite(p.fontScale)
    ? p.fontScale
    : DEFAULT_PREFS.fontScale
  const fontScale = Math.round(Math.min(1.6, Math.max(0.8, raw)) * 10) / 10
  const lineHeight = LINE_HEIGHTS.includes(p?.lineHeight as number)
    ? (p.lineHeight as ReaderPrefs['lineHeight'])
    : DEFAULT_PREFS.lineHeight
  const theme = THEME_NAMES.includes(p?.theme as ReaderPrefs['theme'])
    ? (p.theme as ReaderPrefs['theme'])
    : DEFAULT_PREFS.theme
  const mediaKeys = typeof p?.mediaKeys === 'boolean' ? p.mediaKeys : DEFAULT_PREFS.mediaKeys
  return { fontScale, lineHeight, theme, mediaKeys }
}

export async function loadPrefs(db: AppDB): Promise<ReaderPrefs> {
  const row = await db.settings.get(SETTING_KEY)
  if (!row) return { ...DEFAULT_PREFS }
  return clampPrefs((row.value ?? {}) as Partial<ReaderPrefs>)
}

/** Device preference, not a synced record: no outbox op. */
export async function savePrefs(db: AppDB, p: ReaderPrefs): Promise<void> {
  await db.settings.put({ key: SETTING_KEY, value: clampPrefs(p), updatedAt: Date.now() })
}

export function prefsCss(p: ReaderPrefs): string {
  const { fg, bg } = THEMES[p.theme]
  return [
    `html { font-size: ${Math.round(p.fontScale * 100)}% !important; line-height: ${p.lineHeight} !important; color: ${fg} !important; background: ${bg} !important; }`,
    `a:any-link { color: ${fg} !important; }`,
    // No text selection (or iOS long-press callout) while reading: it only distracts.
    `html, body, body * { -webkit-user-select: none !important; user-select: none !important; -webkit-touch-callout: none !important; }`,
  ].join('\n')
}
