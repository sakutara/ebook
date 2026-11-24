import { describe, it, expect } from 'vitest'
import {
  KNOWN_GENRES,
  genreKey,
  canonicalGenre,
  genresFromSubjects,
} from '../../src/domain/genre'

describe('library.filter.genre: known genres', () => {
  it('library.filter.genre: KNOWN_GENRES lists the three display names', () => {
    expect([...KNOWN_GENRES]).toEqual(['Tiên hiệp', 'Huyền huyễn', 'Khoa huyễn'])
  })

  it('library.filter.genre: genreKey normalises case, diacritics and đ', () => {
    expect(genreKey('Tiên Hiệp')).toBe('tien hiep')
    expect(genreKey('tien hiep')).toBe('tien hiep')
    expect(genreKey('Đô Thị')).toBe('do thi')
  })
})

describe('library.filter.genre: canonicalGenre', () => {
  it('library.filter.genre: maps aliases to the known display name', () => {
    expect(canonicalGenre('xianxia')).toBe('Tiên hiệp')
    expect(canonicalGenre('tu tien')).toBe('Tiên hiệp')
    expect(canonicalGenre('tu tiên')).toBe('Tiên hiệp')
    expect(canonicalGenre('Fantasy')).toBe('Huyền huyễn')
    expect(canonicalGenre('xuanhuan')).toBe('Huyền huyễn')
    expect(canonicalGenre('Science Fiction')).toBe('Khoa huyễn')
    expect(canonicalGenre('scifi')).toBe('Khoa huyễn')
    expect(canonicalGenre('sci-fi')).toBe('Khoa huyễn')
  })

  it('library.filter.genre: known display names map to themselves in canonical form', () => {
    expect(canonicalGenre('Tiên Hiệp')).toBe('Tiên hiệp')
    expect(canonicalGenre('khoa huyễn')).toBe('Khoa huyễn')
  })

  it('library.filter.genre: unknown genre is trimmed and Title Cased with collapsed spaces', () => {
    expect(canonicalGenre('đô thị')).toBe('Đô Thị')
    expect(canonicalGenre('  ĐÔ    THỊ  ')).toBe('Đô Thị')
    expect(canonicalGenre('lịch sử')).toBe('Lịch Sử')
  })

  it('library.filter.genre: empty input canonicalises to empty string', () => {
    expect(canonicalGenre('   ')).toBe('')
  })
})

describe('library.filter.genre: genresFromSubjects', () => {
  it('library.filter.genre: dedupes by key and keeps first-seen order', () => {
    expect(genresFromSubjects(['Tiên Hiệp', 'tien hiep', 'Fantasy'])).toEqual([
      'Tiên hiệp',
      'Huyền huyễn',
    ])
  })

  it('library.filter.genre: drops empty and whitespace-only subjects', () => {
    expect(genresFromSubjects(['', '  ', 'đô thị'])).toEqual(['Đô Thị'])
  })

  it('library.filter.genre: keeps unknown subjects, title-cased, in order', () => {
    expect(genresFromSubjects(['Đô thị', 'Fantasy', 'đô thị'])).toEqual([
      'Đô Thị',
      'Huyền huyễn',
    ])
  })

  it('library.filter.genre: returns empty array for no subjects', () => {
    expect(genresFromSubjects([])).toEqual([])
  })

  it('splits a single subject that packs several genres', () => {
    expect(genresFromSubjects(['Đô thị, Linh dị; Tiên hiệp'])).toEqual(['Đô Thị', 'Linh Dị', 'Tiên hiệp'])
  })
})
