import { describe, it, expect } from 'vitest'
import { epubFileName } from '../../src/domain/file-name'

describe('library.download.cached: epubFileName', () => {
  it('library.download.cached: replaces path and reserved characters with underscores', () => {
    expect(epubFileName('A/B: "C"')).toBe('A_B_ _C_.epub')
  })

  it('library.download.cached: replaces backslash, angle brackets, pipe, question mark and star', () => {
    expect(epubFileName('a\\b<c>|d?e*f')).toBe('a_b_c__d_e_f.epub')
  })

  it('library.download.cached: trims surrounding whitespace and keeps Vietnamese letters', () => {
    expect(epubFileName('  Đấu Phá  ')).toBe('Đấu Phá.epub')
  })

  it('library.download.cached: empty or whitespace-only title becomes "truyen.epub"', () => {
    expect(epubFileName('')).toBe('truyen.epub')
    expect(epubFileName('   ')).toBe('truyen.epub')
  })
})
