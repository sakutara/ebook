import { describe, it, expect } from 'vitest'
import { titleFromName, normalize, matchesQuery } from '../../src/domain/title'

describe('title', () => {
  it('catalog.sync.fields: derives title and normTitle from the file name', () => {
    const title = titleFromName('Đấu_Phá  Thương Khung.EPUB')
    expect(title).toBe('Đấu Phá Thương Khung')
    expect(normalize(title)).toBe('dau pha thuong khung')
  })

  it('library.search.diacritics: "dau pha" matches only Đấu Phá Thương Khung', () => {
    const books = ['Đấu Phá Thương Khung', 'Đế Bá']
    const shown = books.filter((t) => matchesQuery(normalize(t), 'dau pha'))
    expect(shown).toEqual(['Đấu Phá Thương Khung'])
  })

  it('library.search.tokens: token order does not matter', () => {
    expect(matchesQuery(normalize('Đấu Phá Thương Khung'), 'khung thuong')).toBe(true)
  })

  it('title: empty query matches everything', () => {
    expect(matchesQuery(normalize('Đế Bá'), '')).toBe(true)
    expect(matchesQuery(normalize('Đế Bá'), '   ')).toBe(true)
  })

  it('title: accented and unaccented titles normalise equally', () => {
    expect(normalize('Phàm Nhân Tu Tiên')).toBe(normalize(titleFromName('Pham Nhan Tu Tien.epub')))
    expect(normalize('Phàm Nhân Tu Tiên')).toBe('pham nhan tu tien')
  })

  it('title: parentheses become spaces', () => {
    expect(normalize('Đấu Phá Thương Khung (Full)')).toBe('dau pha thuong khung full')
  })

  it('title: uppercase .EPUB extension is stripped', () => {
    expect(titleFromName('Sample.EPUB')).toBe('Sample')
    expect(titleFromName('Sample.epub')).toBe('Sample')
  })

  it('title: name without extension is kept as-is, trimmed', () => {
    expect(titleFromName('  Plain Name  ')).toBe('Plain Name')
  })
})
