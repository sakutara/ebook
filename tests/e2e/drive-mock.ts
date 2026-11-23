import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { BrowserContext, Request, Route } from '@playwright/test'

export interface MockFile {
  id: string
  name: string
  /** File name under tests/fixtures. Defaults to book-v1.epub. */
  fixture?: string
  modifiedTime?: string
  md5?: string
  extra?: boolean
  /** Holds full-body responses (no Range header, and uc downloads) for this long before answering. */
  delayMs?: number
}

export interface DriveMockController {
  setFiles(files: MockFile[]): void
  /** Every URL that reached the Drive mock (list, media and download routes), in order. */
  readonly requests: string[]
  /** Number of `alt=media` range/full reads plus `uc` downloads for a file id. */
  mediaRequests(id: string): number
  /** Full-body reads for a file id: `alt=media` requests without a Range header plus `uc` downloads. */
  fullMediaRequests(id: string): number
}

const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url))
const DEFAULT_FIXTURE = 'book-v1.epub'
const DEFAULT_MODIFIED = '2026-11-01T00:00:00.000Z'
const PAGE_SIZE = 200
const LIST_PATH = '/drive/v3/files'
const MEDIA_PREFIX = '/drive/v3/files/'
const API_HOST = 'www.googleapis.com'
const DOWNLOAD_HOST = 'drive.google.com'
const EPUB_MIME = 'application/epub+zip'

const fixtureCache = new Map<string, Buffer>()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fixtureBytes(name: string): Buffer {
  let bytes = fixtureCache.get(name)
  if (!bytes) {
    bytes = readFileSync(`${FIXTURES_DIR}${name}`)
    fixtureCache.set(name, bytes)
  }
  return bytes
}

/** Builds `n` Vietnamese-titled books plus the special "Đấu Phá Thương Khung" book (n + 1 total). */
export function makeLibrary(n: number): MockFile[] {
  const books: MockFile[] = Array.from({ length: n }, (_, i) => ({
    id: `book-${i + 1}`,
    name: `Truyện số ${i + 1}.epub`,
    fixture: 'book-v1.epub',
  }))
  return [...books, { id: 'dpk', name: 'Đấu Phá Thương Khung.epub', fixture: 'book-v1.epub' }]
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
}

function fileBytes(file: MockFile): Buffer {
  return fixtureBytes(file.fixture ?? DEFAULT_FIXTURE)
}

function toDriveJson(file: MockFile) {
  return {
    id: file.id,
    name: file.name,
    size: String(fileBytes(file).length),
    modifiedTime: file.modifiedTime ?? DEFAULT_MODIFIED,
    md5Checksum: file.md5 ?? `md5-${file.id}`,
    mimeType: EPUB_MIME,
  }
}

async function answerPreflight(route: Route, request: Request): Promise<void> {
  const requested = request.headers()['access-control-request-headers'] ?? '*'
  await route.fulfill({
    status: 204,
    headers: {
      ...CORS_HEADERS,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': requested,
    },
  })
}

/**
 * Routes the Google Drive endpoints used by the app (list, media range reads, uc downloads)
 * for the given browser context. Call before navigating.
 */
export async function mockDrive(context: BrowserContext, files: MockFile[]): Promise<DriveMockController> {
  let current = [...files]
  const requests: string[] = []
  const counts = new Map<string, number>()
  const fullCounts = new Map<string, number>()
  const count = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1)
  const countFull = (id: string) => fullCounts.set(id, (fullCounts.get(id) ?? 0) + 1)

  // List endpoint: pages of PAGE_SIZE; the page token is the start index as a string.
  await context.route(
    (url) => url.hostname === API_HOST && url.pathname === LIST_PATH,
    async (route) => {
      const request = route.request()
      requests.push(request.url())
      if (request.method() === 'OPTIONS') return answerPreflight(route, request)

      const url = new URL(request.url())
      const start = Number(url.searchParams.get('pageToken') ?? '0') || 0
      const page = current.slice(start, start + PAGE_SIZE)
      const body: { files: ReturnType<typeof toDriveJson>[]; nextPageToken?: string } = {
        files: page.map(toDriveJson),
      }
      if (start + PAGE_SIZE < current.length) body.nextPageToken = String(start + PAGE_SIZE)
      await route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    },
  )

  // Media endpoint: alt=media with optional Range support.
  await context.route(
    (url) => url.hostname === API_HOST && url.pathname.startsWith(MEDIA_PREFIX) && url.searchParams.get('alt') === 'media',
    async (route) => {
      const request = route.request()
      requests.push(request.url())
      if (request.method() === 'OPTIONS') return answerPreflight(route, request)

      const id = decodeURIComponent(new URL(request.url()).pathname.slice(MEDIA_PREFIX.length))
      const file = current.find((f) => f.id === id)
      if (!file) {
        await route.fulfill({
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: { code: 404, message: 'File not found', status: 'NOT_FOUND' } }),
        })
        return
      }
      count(id)
      const range = request.headers()['range']
      if (!range) {
        countFull(id)
        if (file.delayMs) await sleep(file.delayMs)
      }

      const bytes = fileBytes(file)
      const total = bytes.length
      const match = range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null
      if (match) {
        const start = Number(match[1])
        const end = match[2] === '' ? total - 1 : Math.min(Number(match[2]), total - 1)
        await route.fulfill({
          status: 206,
          headers: {
            ...CORS_HEADERS,
            'Accept-Ranges': 'bytes',
            'Content-Type': EPUB_MIME,
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Content-Length': String(end - start + 1),
          },
          body: bytes.subarray(start, end + 1),
        })
        return
      }

      await route.fulfill({
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Accept-Ranges': 'bytes',
          'Content-Type': EPUB_MIME,
          'Content-Length': String(total),
        },
        body: bytes,
      })
    },
  )

  // Browser download endpoint (uc?export=download&id=...): full body with attachment name.
  await context.route(
    (url) => url.hostname === DOWNLOAD_HOST && url.pathname === '/uc',
    async (route) => {
      const request = route.request()
      requests.push(request.url())
      const id = new URL(request.url()).searchParams.get('id') ?? ''
      const file = current.find((f) => f.id === id)
      if (!file) {
        await route.fulfill({ status: 404, body: 'not found' })
        return
      }
      count(id)
      countFull(id)
      if (file.delayMs) await sleep(file.delayMs)
      const bytes = fileBytes(file)
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': EPUB_MIME,
          'Content-Length': String(bytes.length),
          'Content-Disposition': `attachment; filename="${file.name}"`,
        },
        body: bytes,
      })
    },
  )

  return {
    setFiles(next: MockFile[]) {
      current = [...next]
    },
    requests,
    mediaRequests(id: string) {
      return counts.get(id) ?? 0
    },
    fullMediaRequests(id: string) {
      return fullCounts.get(id) ?? 0
    },
  }
}
