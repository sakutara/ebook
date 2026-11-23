import { describe, it, expect } from 'vitest'
import {
  cleanText,
  titleCaseVi,
  normalizeRequestText,
  requestKey,
  lacksDiacritics,
} from '../../src/domain/request-text'

describe('Request text normalisation', () => {
  it('story-request.normalize.title-case: title and author are NFC Vietnamese Title Case', () => {
    expect(normalizeRequestText('  phàm   nhân TU TIÊN truyện ')).toBe('Phàm Nhân Tu Tiên Truyện')
    expect(normalizeRequestText('vong ngữ')).toBe('Vong Ngữ')
  })

  it('story-request.normalize.nfc: decomposed marks are stored precomposed', () => {
    const decomposed = 'đ' + 'à' + 'o' // "đào" with a combining grave
    expect(decomposed).not.toBe('Đào')
    expect(normalizeRequestText(decomposed)).toBe('Đào')
  })

  it('story-request.normalize.punctuation: wrapping quotes and trailing punctuation are removed', () => {
    expect(normalizeRequestText('"đấu phá thương khung"!!')).toBe('Đấu Phá Thương Khung')
    expect(normalizeRequestText('đấu phá - thương khung ii')).toBe('Đấu Phá - Thương Khung II')
  })

  it('story-request.normalize.no-accent-warning: lacksDiacritics flags ASCII-only letter input', () => {
    expect(lacksDiacritics('pham nhan')).toBe(true)
    expect(lacksDiacritics('Phàm')).toBe(false)
    expect(lacksDiacritics('123')).toBe(false)
  })

  it('story-request.normalize.extra: hyphenated words and Roman numerals', () => {
    expect(normalizeRequestText('tường vi')).toBe('Tường Vi')
    expect(normalizeRequestText('x-men')).toBe('X-Men')
    expect(normalizeRequestText('(đấu phá)')).toBe('Đấu Phá')
    expect(normalizeRequestText('a​b')).toBe('Ab')
  })

  it('story-request.normalize.extra: cleanText strips wrapping brackets and quotes', () => {
    expect(cleanText('(đấu phá)')).toBe('đấu phá')
    expect(cleanText('  "x"  ')).toBe('x')
  })

  it('story-request.normalize.extra: titleCaseVi keeps Roman numerals II-XX upper-case', () => {
    expect(titleCaseVi('phàm nhân xx')).toBe('Phàm Nhân XX')
    expect(titleCaseVi('vi')).toBe('Vi')
  })

  it('story-request.normalize.key: requestKey uses the shared normalize function', () => {
    expect(requestKey('Phàm Nhân Tu Tiên', 'Vong Ngữ')).toBe('pham nhan tu tien|vong ngu')
  })
})
