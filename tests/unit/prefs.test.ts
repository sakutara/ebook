import { describe, it, expect } from 'vitest'
import { AppDB } from '../../src/db/db'
import {
  DEFAULT_PREFS,
  THEMES,
  clampPrefs,
  loadPrefs,
  prefsCss,
  savePrefs,
  type ReaderPrefs,
} from '../../src/reader/prefs'

const freshDb = () => new AppDB('t-' + crypto.randomUUID())

describe('reader prefs', () => {
  it('reader.prefs.persist: saved prefs survive reopening the database', async () => {
    const name = 't-' + crypto.randomUUID()
    const db1 = new AppDB(name)
    const prefs: ReaderPrefs = { fontScale: 1.2, lineHeight: 1.6, theme: 'dark' }
    await savePrefs(db1, prefs)
    db1.close()

    const db2 = new AppDB(name)
    expect(await loadPrefs(db2)).toEqual(prefs)
    db2.close()
  })

  it('prefs: defaults when unset', async () => {
    const db = freshDb()
    expect(await loadPrefs(db)).toEqual(DEFAULT_PREFS)
    // returns a copy, not the shared default object
    const loaded = await loadPrefs(db)
    expect(loaded).not.toBe(DEFAULT_PREFS)
    db.close()
  })

  it('prefs: fontScale clamps to 0.8..1.6 and rounds to 0.1', () => {
    expect(clampPrefs({ fontScale: 0.5 }).fontScale).toBe(0.8)
    expect(clampPrefs({ fontScale: 2 }).fontScale).toBe(1.6)
    expect(clampPrefs({ fontScale: 1.25 }).fontScale).toBe(1.3)
  })

  it('prefs: invalid theme falls back to light', () => {
    const p = clampPrefs({ theme: 'neon' as unknown as ReaderPrefs['theme'] })
    expect(p.theme).toBe('light')
  })

  it('prefs: prefsCss contains the dark theme colours and 120%', () => {
    const css = prefsCss({ fontScale: 1.2, lineHeight: 1.6, theme: 'dark' })
    const { fg, bg } = THEMES.dark
    expect(css).toContain(
      `html { font-size: 120% !important; line-height: 1.6 !important; color: ${fg} !important; background: ${bg} !important; }`,
    )
    expect(css).toContain(`a:any-link { color: ${fg} !important; }`)
  })
})
