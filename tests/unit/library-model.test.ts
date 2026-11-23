import { describe, it, expect } from 'vitest'
import type { Book } from '../../src/db/db'
import { buildCards } from '../../src/ui/library/library-model'
import { normalize } from '../../src/domain/title'

function book(id: string, title: string, over: Partial<Book> = {}): Book {
  return {
    id,
    name: `${title}.epub`,
    title,
    normTitle: normalize(title),
    size: 10,
    modifiedTime: 100,
    md5: `md5-${id}`,
    inDrive: 1,
    lastSeenAt: 1,
    updatedAt: 1,
    ...over,
  }
}

const file = (bookId: string, md5 = `md5-${bookId}`, modifiedTime = 100) => ({ bookId, md5, modifiedTime })
const prog = (bookId: string, fraction: number, deleted: 0 | 1 = 0) => ({ bookId, fraction, deleted })

describe('library.grid.sorted', () => {
  it('library.grid.sorted: orders cards by normalised title', () => {
    const books = [book('1', 'Ánh Trăng'), book('2', 'Bạch Lộc'), book('3', 'an bình')]
    const cards = buildCards(books, [], [], '', 'all')
    expect(cards.map((c) => c.book.title)).toEqual(['an bình', 'Ánh Trăng', 'Bạch Lộc'])
  })
})

describe('library.search.diacritics', () => {
  it('library.search.diacritics: "dau pha" matches only Đấu Phá Thương Khung', () => {
    const books = [book('1', 'Đấu Phá Thương Khung'), book('2', 'Đế Bá')]
    const cards = buildCards(books, [], [], 'dau pha', 'all')
    expect(cards.map((c) => c.book.title)).toEqual(['Đấu Phá Thương Khung'])
  })
})

describe('library.filter.cached', () => {
  // 10 books; cached: 1, 5 (in Drive) and 9 (local-only, inDrive 0).
  const books = Array.from({ length: 10 }, (_, i) =>
    book(String(i + 1), `Truyện ${String(i + 1).padStart(2, '0')}`, i === 8 ? { inDrive: 0 } : {}),
  )
  const files = [file('1'), file('5'), file('9')]

  it('library.filter.cached: "saved" keeps only cached books, including local-only ones', () => {
    const cards = buildCards(books, files, [], '', 'saved')
    expect(cards.map((c) => c.book.id)).toEqual(['1', '5', '9'])
    expect(cards.find((c) => c.book.id === '9')?.localOnly).toBe(true)
  })

  it('library.filter.cached: "all" shows every visible book', () => {
    expect(buildCards(books, files, [], '', 'all')).toHaveLength(10)
  })
})

describe('library.badge.states', () => {
  it('library.badge.states: model flags for cached, stale, local-only and remote-with-progress', () => {
    const books = [
      book('a', 'Bản a'),
      book('b', 'Bản b', { md5: 'new-b', modifiedTime: 200 }),
      book('c', 'Bản c', { inDrive: 0 }),
      book('d', 'Bản d'),
    ]
    const files = [file('a'), file('b', 'md5-b', 100), file('c')]
    const cards = Object.fromEntries(
      buildCards(books, files, [prog('d', 0.426)], '', 'all').map((c) => [c.book.id, c]),
    )
    expect(cards.a).toMatchObject({ cached: true, stale: false, localOnly: false })
    expect(cards.b).toMatchObject({ cached: true, stale: true, localOnly: false })
    expect(cards.c).toMatchObject({ cached: true, stale: false, localOnly: true })
    expect(cards.d).toMatchObject({ cached: false, stale: false, localOnly: false, fraction: 0.426 })
  })

  it('library.badge.states: stale is false without a cached file', () => {
    const cards = buildCards([book('x', 'Bản x', { md5: 'new', modifiedTime: 500 })], [], [], '', 'all')
    expect(cards[0].stale).toBe(false)
  })

  it('library.badge.states: deleted progress rows are ignored', () => {
    const cards = buildCards([book('d', 'Bản d')], [], [prog('d', 0.5, 1)], '', 'all')
    expect(cards[0].fraction).toBeUndefined()
  })
})

describe('library visibility rule', () => {
  it('library.visibility: local-only books without a cached file are hidden', () => {
    const books = [book('ghost', 'Ma', { inDrive: 0 }), book('ok', 'Có thật')]
    const cards = buildCards(books, [], [], '', 'all')
    expect(cards.map((c) => c.book.id)).toEqual(['ok'])
  })
})
