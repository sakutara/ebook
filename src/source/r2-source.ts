import type { R2Config } from '../config'
import type { Book } from '../db/db'
import { isSlug } from '../domain/slug'

export type SourceErrorKind = 'invalid' | 'not-found' | 'server' | 'network' | 'http'

export const SOURCE_ERROR_MESSAGES: Record<SourceErrorKind, string> = {
  invalid: 'Dữ liệu thư viện không hợp lệ',
  'not-found': 'Không tìm thấy truyện',
  server: 'Máy chủ truyện đang bận, thử lại sau',
  network: 'Không kết nối được máy chủ truyện',
  http: 'Lỗi máy chủ truyện',
}

export class SourceError extends Error {
  readonly kind: SourceErrorKind
  readonly status?: number

  constructor(kind: SourceErrorKind, status?: number) {
    super(SOURCE_ERROR_MESSAGES[kind])
    this.name = 'SourceError'
    this.kind = kind
    this.status = status
  }
}

export interface CatalogEntry {
  id: string
  title: string
  author?: string
  genres?: string[]
  description?: string
  chapters?: number
  note?: string
  epub: string
  size: number
  md5: string
  updatedAt?: string
}

export interface BookSource {
  /** 404 → []; bad JSON or schema → SourceError('invalid'). */
  fetchCatalog(): Promise<CatalogEntry[]>
  coverUrl(b: Pick<Book, 'id' | 'md5'>): string
  epubUrl(b: Pick<Book, 'id' | 'name' | 'md5'>): string
  fetchBook(
    b: Pick<Book, 'id' | 'name' | 'md5' | 'size'>,
    opts?: { onProgress?: (pct: number | null) => void; signal?: AbortSignal },
  ): Promise<Blob>
}

const EPUB_MIME = 'application/epub+zip'

function isAbortError(e: unknown): boolean {
  // DOMException is not always an Error instance across realms, so check by name.
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError'
}

function isEntry(x: unknown): x is CatalogEntry {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false
  const e = x as Record<string, unknown>
  return (
    typeof e.id === 'string' &&
    isSlug(e.id) &&
    typeof e.title === 'string' &&
    e.title.trim() !== '' &&
    typeof e.epub === 'string' &&
    typeof e.md5 === 'string' &&
    typeof e.size === 'number' &&
    Number.isFinite(e.size) &&
    e.size >= 0
  )
}

/** Maps a non-ok HTTP status to a SourceError (404 is handled by the caller). */
function statusError(status: number): SourceError {
  if (status === 429 || status >= 500) return new SourceError('server', status)
  return new SourceError('http', status)
}

export function createR2Source(
  cfg: R2Config,
  fetchFn: typeof fetch = (...a) => fetch(...a),
): BookSource {
  const base = cfg.baseUrl

  /** Performs a fetch, mapping transport failures to SourceError (AbortError is rethrown). */
  async function send(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetchFn(url, init)
    } catch (e) {
      if (isAbortError(e)) throw e
      throw new SourceError('network')
    }
  }

  function coverUrl(b: Pick<Book, 'id' | 'md5'>): string {
    return `${base}/books/${encodeURIComponent(b.id)}/cover.jpg?v=${encodeURIComponent(b.md5)}`
  }

  function epubUrl(b: Pick<Book, 'id' | 'name' | 'md5'>): string {
    return (
      `${base}/books/${encodeURIComponent(b.id)}/${encodeURIComponent(b.name)}` +
      `?v=${encodeURIComponent(b.md5)}`
    )
  }

  return {
    async fetchCatalog() {
      const res = await send(`${base}/catalog.json`, { cache: 'no-cache' })
      if (res.status === 404) return []
      if (!res.ok) throw statusError(res.status)

      let parsed: unknown
      try {
        parsed = JSON.parse(await res.text())
      } catch (e) {
        if (isAbortError(e)) throw e
        throw new SourceError('invalid')
      }
      if (typeof parsed !== 'object' || parsed === null) throw new SourceError('invalid')
      const doc = parsed as { schema?: unknown; books?: unknown }
      if (doc.schema !== 1 || !Array.isArray(doc.books)) throw new SourceError('invalid')

      return doc.books.filter(isEntry)
    },

    coverUrl,
    epubUrl,

    async fetchBook(b, opts = {}) {
      const { onProgress, signal } = opts
      const res = await send(epubUrl(b), { signal })
      if (res.status === 404) throw new SourceError('not-found', 404)
      if (!res.ok) throw statusError(res.status)

      const headerLen = Number(res.headers.get('Content-Length'))
      const total = headerLen > 0 ? headerLen : b.size > 0 ? b.size : 0
      const known = total > 0

      const chunks: Uint8Array<ArrayBuffer>[] = []
      let loaded = 0
      let lastPct = -1
      let nullReported = false
      const report = (): void => {
        if (!onProgress) return
        if (known) {
          const pct = Math.min(100, Math.floor((loaded / total) * 100))
          if (pct > lastPct) {
            lastPct = pct
            onProgress(pct)
          }
        } else if (!nullReported) {
          nullReported = true
          onProgress(null)
        }
      }

      if (res.body === null) {
        const buf = new Uint8Array(await res.arrayBuffer())
        if (buf.byteLength > 0) {
          chunks.push(buf)
          loaded += buf.byteLength
          report()
        }
      } else {
        const reader = res.body.getReader()
        for (;;) {
          let step: ReadableStreamReadResult<Uint8Array<ArrayBuffer>>
          try {
            step = await reader.read()
          } catch (e) {
            // A connection drop mid-stream is a network failure; an abort is the caller's choice.
            if (isAbortError(e)) throw e
            throw new SourceError('network')
          }
          if (step.done) break
          chunks.push(step.value)
          loaded += step.value.byteLength
          report()
        }
      }

      if (onProgress && known && lastPct < 100) {
        lastPct = 100
        onProgress(100)
      }
      return new Blob(chunks, { type: EPUB_MIME })
    },
  }
}
