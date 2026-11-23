import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { BrowserContext, Request, Route } from '@playwright/test'

/** A book as the R2 bucket would describe it (metadata.json + objects). */
export interface MockBook {
  /** Slug; also the folder name and the EPUB object name stem. */
  id: string
  title: string
  author?: string
  genres?: string[]
  /** File name under tests/fixtures. Defaults to book-v1.epub. */
  fixture?: string
  /** Defaults to a stable hash of id and fixture. */
  md5?: string
  /** Defaults to the fixture's byte length. */
  size?: number
  /** ISO upload time; a newer one makes an older cached copy stale. Defaults to 2026-11-01. */
  updatedAt?: string
  /** Cover request answers 404. */
  noCover?: boolean
  /** Holds the EPUB response for this long before answering. */
  delayMs?: number
}

export interface R2MockOptions {
  /** `null` or `undefined` makes `catalog.json` answer 404 (an empty bucket). */
  books?: MockBook[] | null
}

export interface R2MockController {
  /** Replaces the catalog served from now on (`null` = 404). */
  setBooks(books: MockBook[] | null | undefined): void
  /** Every URL that reached the R2 mock, in order. */
  readonly requests: string[]
  /** Number of requests whose path ends with `pathSuffix`. */
  count(pathSuffix: string): number
}

const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url))
const DEFAULT_FIXTURE = 'book-v1.epub'
const R2_ORIGIN = 'https://r2.test'
const EPUB_MIME = 'application/epub+zip'
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' }
const DEFAULT_UPDATED_AT = '2026-11-01T00:00:00.000Z'

const fixtureCache = new Map<string, Buffer>()
let coverCache: Buffer | undefined

function fixtureBytes(name: string): Buffer {
  let bytes = fixtureCache.get(name)
  if (!bytes) {
    bytes = readFileSync(`${FIXTURES_DIR}${name}`)
    fixtureCache.set(name, bytes)
  }
  return bytes
}

function coverBytes(): Buffer {
  coverCache ??= readFileSync(`${FIXTURES_DIR}cover.jpg`)
  return coverCache
}

/** Path of a book's EPUB object, e.g. `/books/sach-mau/sach-mau.epub`. */
export function epubPath(id: string): string {
  return `/books/${id}/${id}.epub`
}

/** Path of a book's cover object. */
export function coverPath(id: string): string {
  return `/books/${id}/cover.jpg`
}

const AUTHORS = ['Nhĩ Căn', 'Vong Ngữ', 'Thiên Tàm Thổ Đậu'] as const
const GENRES = ['Tiên hiệp', 'Huyền huyễn', 'Khoa huyễn'] as const

/** Builds `n` books titled "Truyện số N" (ids `truyen-so-N`) plus "Đấu Phá Thương Khung" (n + 1 total). */
export function makeLibrary(n: number): MockBook[] {
  const books: MockBook[] = Array.from({ length: n }, (_, i) => {
    const k = i + 1
    return {
      id: `truyen-so-${k}`,
      title: `Truyện số ${k}`,
      author: AUTHORS[i % AUTHORS.length],
      genres: [GENRES[i % GENRES.length]],
    }
  })
  return [
    ...books,
    {
      id: 'dau-pha-thuong-khung',
      title: 'Đấu Phá Thương Khung',
      author: 'Thiên Tàm Thổ Đậu',
      genres: ['Huyền huyễn'],
    },
  ]
}

function resolvedFixture(book: MockBook): string {
  return book.fixture ?? DEFAULT_FIXTURE
}

function resolvedMd5(book: MockBook): string {
  return book.md5 ?? createHash('md5').update(`${book.id}:${resolvedFixture(book)}`).digest('hex')
}

function resolvedSize(book: MockBook): number {
  return book.size ?? fixtureBytes(resolvedFixture(book)).length
}

/** Metadata entry in the shape the app reads from catalog.json. */
function toEntry(book: MockBook) {
  return {
    id: book.id,
    title: book.title,
    author: book.author ?? '',
    genres: book.genres ?? [],
    description: '',
    epub: `${book.id}.epub`,
    size: resolvedSize(book),
    md5: resolvedMd5(book),
    updatedAt: book.updatedAt ?? DEFAULT_UPDATED_AT,
  }
}

async function answerPreflight(route: Route, request: Request): Promise<void> {
  const requested = request.headers()['access-control-request-headers']
  await route.fulfill({
    status: 204,
    headers: {
      ...CORS_HEADERS,
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      ...(requested ? { 'Access-Control-Allow-Headers': requested } : {}),
    },
  })
}

async function notFound(route: Route): Promise<void> {
  await route.fulfill({ status: 404, headers: CORS_HEADERS, body: 'not found' })
}

/**
 * Routes the R2 Worker endpoints used by the app (`catalog.json`, covers, EPUBs) for the given
 * browser context. Call before navigating. Answers with the Worker's cache headers and CORS.
 */
export async function mockR2(context: BrowserContext, options: R2MockOptions = {}): Promise<R2MockController> {
  let books: MockBook[] | null = options.books ?? null
  const requests: string[] = []

  await context.route(`${R2_ORIGIN}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    requests.push(request.url())

    if (request.method() === 'OPTIONS') return answerPreflight(route, request)

    if (url.pathname === '/catalog.json') {
      if (books === null) return notFound(route)
      const body = { schema: 1, generatedAt: DEFAULT_UPDATED_AT, books: books.map(toEntry) }
      await route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
        body: JSON.stringify(body),
      })
      return
    }

    const cover = /^\/books\/([^/]+)\/cover\.jpg$/.exec(url.pathname)
    if (cover) {
      const id = decodeURIComponent(cover[1])
      const book = books?.find((b) => b.id === id)
      if (!book || book.noCover) return notFound(route)
      await route.fulfill({
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'image/jpeg',
          // Not HTTP-cached, so an offline reload can only show the cover from the service worker's cache.
          'Cache-Control': 'no-store',
        },
        body: coverBytes(),
      })
      return
    }

    const epub = /^\/books\/([^/]+)\/([^/]+)\.epub$/.exec(url.pathname)
    if (epub) {
      const id = decodeURIComponent(epub[1])
      const book = books?.find((b) => b.id === id)
      if (!book) return notFound(route)
      if (book.delayMs) await new Promise((resolve) => setTimeout(resolve, book.delayMs))
      const bytes = fixtureBytes(resolvedFixture(book))
      await route.fulfill({
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Access-Control-Expose-Headers': 'Content-Length',
          'Accept-Ranges': 'bytes',
          // Not HTTP-cached: every download must reach the mock so the request counts are exact.
          'Cache-Control': 'no-store',
          'Content-Type': EPUB_MIME,
          'Content-Length': String(bytes.length),
        },
        body: bytes,
      })
      return
    }

    await notFound(route)
  })

  return {
    setBooks(next) {
      books = next ?? null
    },
    requests,
    count(pathSuffix: string) {
      return requests.filter((u) => new URL(u).pathname.endsWith(pathSuffix)).length
    },
  }
}
