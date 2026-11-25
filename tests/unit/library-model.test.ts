import { describe, it, expect } from 'vitest'
import type { Book } from '../../src/db/db'
import { buildCards, genreOptions, authorOptions, splitRecent, DAY_MS, type CardFilters } from '../../src/ui/library/library-model'
import { normalize } from '../../src/domain/title'

function book(id: string, title: string, over: Partial<Book> = {}): Book {
  return {
    id,
    name: `${title}.epub`,
    title,
    normTitle: normalize(title),
    author: '',
    normAuthor: '',
    genres: [],
    description: '',
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
const F = (over: Partial<CardFilters> = {}): CardFilters => ({ q: '', saved: false, genre: '', author: '', ...over })

describe('library.grid.sorted', () => {
  it('library.grid.sorted: orders cards by normalised title', () => {
    const books = [book('1', 'Ánh Trăng'), book('2', 'Bạch Lộc'), book('3', 'an bình')]
    const cards = buildCards(books, [], [], F({ sort: 'az' }))
    expect(cards.map((c) => c.book.title)).toEqual(['an bình', 'Ánh Trăng', 'Bạch Lộc'])
  })

  it('library.sort.newest: default order is newest EPUB time first', () => {
    const books = [
      book('1', 'A', { modifiedTime: 100 }),
      book('2', 'B', { modifiedTime: 300 }),
      book('3', 'C', { modifiedTime: 200 }),
    ]
    expect(buildCards(books, [], [], F()).map((c) => c.book.id)).toEqual(['2', '3', '1'])
  })

  it('library.sort.recent: splits within a day / a week, no overlap', () => {
    const now = 10 * DAY_MS
    const books = [
      book('d', 'D', { modifiedTime: now - 1000 }),
      book('w', 'W', { modifiedTime: now - 3 * DAY_MS }),
      book('o', 'O', { modifiedTime: now - 9 * DAY_MS }),
    ]
    const r = splitRecent(buildCards(books, [], [], F()), now)
    expect(r.day.map((c) => c.book.id)).toEqual(['d'])
    expect(r.week.map((c) => c.book.id)).toEqual(['w'])
  })
})

describe('library.search.diacritics', () => {
  it('library.search.diacritics: "dau pha" matches only Đấu Phá Thương Khung', () => {
    const books = [book('1', 'Đấu Phá Thương Khung'), book('2', 'Đế Bá')]
    const cards = buildCards(books, [], [], F({ q: 'dau pha' }))
    expect(cards.map((c) => c.book.title)).toEqual(['Đấu Phá Thương Khung'])
  })
})

describe('library.search.tokens', () => {
  it('library.search.tokens: "khung thuong" matches Đấu Phá Thương Khung', () => {
    const books = [book('1', 'Đấu Phá Thương Khung'), book('2', 'Đế Bá')]
    const cards = buildCards(books, [], [], F({ q: 'khung thuong' }))
    expect(cards.map((c) => c.book.title)).toEqual(['Đấu Phá Thương Khung'])
  })
})

describe('library.search.author', () => {
  it('library.search.author: "thien tam" matches the author of Đấu Phá Thương Khung only', () => {
    const books = [
      book('1', 'Đấu Phá Thương Khung', { author: 'Thiên Tàm Thổ Đậu', normAuthor: 'thien tam tho dau' }),
      book('2', 'Đế Bá', { author: 'Yếm Bút Tiêu Sinh', normAuthor: 'yem but tieu sinh' }),
    ]
    const cards = buildCards(books, [], [], F({ q: 'thien tam' }))
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
    const cards = buildCards(books, files, [], F({ saved: true }))
    expect(cards.map((c) => c.book.id)).toEqual(['1', '5', '9'])
    expect(cards.find((c) => c.book.id === '9')?.localOnly).toBe(true)
  })

  it('library.filter.cached: "all" shows every visible book', () => {
    expect(buildCards(books, files, [], F())).toHaveLength(10)
  })
})

describe('library.filter.genre', () => {
  const books = [
    book('1', 'Truyện 1', { genres: ['Tiên hiệp'] }),
    book('2', 'Truyện 2', { genres: ['Tiên hiệp'] }),
    book('3', 'Truyện 3', { genres: ['Huyền huyễn'] }),
    book('4', 'Truyện 4', { genres: ['Huyền huyễn'] }),
    book('5', 'Truyện 5', { genres: ['Khoa huyễn', 'Tiên hiệp'] }),
  ]

  it('library.filter.genre: options are sorted by book count, highest first', () => {
    expect(genreOptions(books, new Set())).toEqual([
      { value: 'tien hiep', label: 'Tiên hiệp', count: 3 },
      { value: 'huyen huyen', label: 'Huyền huyễn', count: 2 },
      { value: 'khoa huyen', label: 'Khoa huyễn', count: 1 },
    ])
  })

  it('library.filter.genre: "Tiên hiệp" selects 3 books', () => {
    const cards = buildCards(books, [], [], F({ genre: 'tien hiep' }))
    expect(cards.map((c) => c.book.id)).toEqual(['1', '2', '5'])
  })

  it('library.filter.genre: a genre value with no option is ignored', () => {
    expect(buildCards(books, [], [], F({ genre: 'khong co' }))).toHaveLength(5)
  })
})

describe('library.filter.genre-other', () => {
  it('library.filter.genre-other: equal counts are ordered by key', () => {
    const books = [
      book('1', 'Truyện 1', { genres: ['Tiên hiệp'] }),
      book('2', 'Truyện 2', { genres: ['Huyền huyễn'] }),
      book('3', 'Truyện 3', { genres: ['Đô thị'] }),
      book('4', 'Truyện 4', { genres: ['Dị giới'] }),
    ]
    expect(genreOptions(books, new Set()).map((o) => o.label)).toEqual([
      'Dị giới',
      'Đô thị',
      'Huyền huyễn',
      'Tiên hiệp',
    ])
  })

  it('library.filter.genre-other: genres found only on hidden books have no option', () => {
    const books = [
      book('1', 'Truyện 1', { genres: ['Tiên hiệp'] }),
      book('2', 'Truyện 2', { genres: ['Khoa huyễn'], inDrive: 0 }),
    ]
    expect(genreOptions(books, new Set()).map((o) => o.value)).toEqual(['tien hiep'])
    expect(genreOptions(books, new Set(['2'])).map((o) => o.value)).toEqual(['khoa huyen', 'tien hiep'])
  })

  it('library.filter.genre-other: an other genre filters by its key', () => {
    const books = [book('1', 'Truyện 1', { genres: ['Đô thị'] }), book('2', 'Truyện 2', { genres: ['Tiên hiệp'] })]
    expect(buildCards(books, [], [], F({ genre: 'do thi' })).map((c) => c.book.id)).toEqual(['1'])
  })
})

describe('library.filter.author', () => {
  const books = [
    book('1', 'Truyện 1', { author: 'Nhĩ Căn', normAuthor: 'nhi can' }),
    book('2', 'Truyện 2', { author: 'Nhĩ Căn', normAuthor: 'nhi can' }),
    book('3', 'Truyện 3', { author: 'Vong Ngữ', normAuthor: 'vong ngu' }),
    book('4', 'Truyện 4'),
  ]

  it('library.filter.author: options are non-empty authors sorted by book count, highest first, with counts', () => {
    expect(authorOptions(books, new Set())).toEqual([
      { value: 'nhi can', label: 'Nhĩ Căn', count: 2 },
      { value: 'vong ngu', label: 'Vong Ngữ', count: 1 },
    ])
  })

  it('library.filter.author: picking "Nhĩ Căn" shows only its 2 books', () => {
    const cards = buildCards(books, [], [], F({ author: 'nhi can' }))
    expect(cards.map((c) => c.book.id)).toEqual(['1', '2'])
  })

  it('library.filter.author: an author value with no option is ignored', () => {
    expect(buildCards(books, [], [], F({ author: 'khong co' }))).toHaveLength(4)
  })
})

describe('library.filter.combined', () => {
  it('library.filter.combined: genre, author and saved combine with AND', () => {
    const books = [
      book('a', 'Truyện a', { genres: ['Tiên hiệp'], author: 'Nhĩ Căn', normAuthor: 'nhi can' }),
      book('b', 'Truyện b', { genres: ['Tiên hiệp'], author: 'Nhĩ Căn', normAuthor: 'nhi can' }),
      book('c', 'Truyện c', { genres: ['Huyền huyễn'], author: 'Nhĩ Căn', normAuthor: 'nhi can' }),
      book('d', 'Truyện d', { genres: ['Tiên hiệp'], author: 'Vong Ngữ', normAuthor: 'vong ngu' }),
    ]
    const files = [file('a'), file('c'), file('d')]
    const cards = buildCards(books, files, [], F({ saved: true, genre: 'tien hiep', author: 'nhi can' }))
    expect(cards.map((c) => c.book.id)).toEqual(['a'])
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
      buildCards(books, files, [prog('d', 0.426)], F()).map((c) => [c.book.id, c]),
    )
    expect(cards.a).toMatchObject({ cached: true, stale: false, localOnly: false })
    expect(cards.b).toMatchObject({ cached: true, stale: true, localOnly: false })
    expect(cards.c).toMatchObject({ cached: true, stale: false, localOnly: true })
    expect(cards.d).toMatchObject({ cached: false, stale: false, localOnly: false, fraction: 0.426 })
  })

  it('library.badge.states: stale is false without a cached file', () => {
    const cards = buildCards([book('x', 'Bản x', { md5: 'new', modifiedTime: 500 })], [], [], F())
    expect(cards[0].stale).toBe(false)
  })

  it('library.badge.states: deleted progress rows are ignored', () => {
    const cards = buildCards([book('d', 'Bản d')], [], [prog('d', 0.5, 1)], F())
    expect(cards[0].fraction).toBeUndefined()
  })
})

describe('library visibility rule', () => {
  it('library.visibility: local-only books without a cached file are hidden', () => {
    const books = [book('ghost', 'Ma', { inDrive: 0 }), book('ok', 'Có thật')]
    const cards = buildCards(books, [], [], F())
    expect(cards.map((c) => c.book.id)).toEqual(['ok'])
  })
})
