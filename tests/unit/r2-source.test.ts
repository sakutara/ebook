import { describe, it, expect, vi } from 'vitest'
import { createR2Source, SourceError } from '../../src/source/r2-source'

const cfg = { baseUrl: 'https://books.example.workers.dev' }

const validEntry = {
  id: 'dau-pha',
  title: 'Đấu Phá',
  author: 'Thiên Tàm',
  genres: ['Huyền huyễn', ' '],
  epub: 'dau-pha.epub',
  size: 2048,
  md5: 'm1',
  updatedAt: '2026-11-01T10:00:00.000Z',
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function catalogResponse(books: unknown[]): Response {
  return jsonResponse(200, { schema: 1, books })
}

function fakeFetch(factory: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return factory(url, init)
  })
}

/** A body that yields the given chunks one by one, then closes. */
function chunkedBody(chunks: number[][]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(new Uint8Array(c))
      controller.close()
    },
  })
}

async function captureSourceError(p: Promise<unknown>): Promise<SourceError> {
  try {
    await p
  } catch (e) {
    if (e instanceof SourceError) return e
    throw e
  }
  throw new Error('expected rejection')
}

describe('catalog.sync.single-request', () => {
  it('catalog.sync.single-request: fetchCatalog makes exactly one request to <base>/catalog.json with cache no-cache', async () => {
    const fetchFn = fakeFetch(() => catalogResponse([]))
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)

    await source.fetchCatalog()

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0][0]).toBe('https://books.example.workers.dev/catalog.json')
    expect(fetchFn.mock.calls[0][1]).toEqual({ cache: 'no-cache' })
  })
})

describe('catalog.sync.fields', () => {
  it('catalog.sync.fields: fetchCatalog returns the valid entry unchanged and drops invalid ones', async () => {
    const badId = { ...validEntry, id: 'Bad Id' }
    const { md5: _md5, ...noMd5 } = validEntry
    void _md5
    const fetchFn = fakeFetch(() => catalogResponse([validEntry, badId, noMd5]))
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)

    const entries = await source.fetchCatalog()

    expect(entries).toEqual([validEntry])
    expect(entries[0]).toEqual(validEntry)
  })
})

describe('catalog.sync.invalid', () => {
  it('catalog.sync.invalid: non-JSON body rejects with kind invalid and the Vietnamese message', async () => {
    const fetchFn = fakeFetch(() => new Response('<html>oops</html>', { status: 200 }))
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)

    const err = await captureSourceError(source.fetchCatalog())

    expect(err.kind).toBe('invalid')
    expect(err.message).toBe('Dữ liệu thư viện không hợp lệ')
  })

  it('catalog.sync.invalid: schema other than 1 rejects with kind invalid', async () => {
    const fetchFn = fakeFetch(() => jsonResponse(200, { schema: 2, books: [validEntry] }))
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)

    const err = await captureSourceError(source.fetchCatalog())

    expect(err.kind).toBe('invalid')
  })

  it('catalog.sync.invalid: non-array books rejects with kind invalid', async () => {
    const fetchFn = fakeFetch(() => jsonResponse(200, { schema: 1, books: 'nope' }))
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)

    const err = await captureSourceError(source.fetchCatalog())

    expect(err.kind).toBe('invalid')
  })
})

describe('catalog.sync.missing', () => {
  it('catalog.sync.missing: catalog 404 resolves to an empty list', async () => {
    const fetchFn = fakeFetch(() => new Response('nope', { status: 404 }))
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)

    await expect(source.fetchCatalog()).resolves.toEqual([])
  })
})

describe('catalog.sync.server-error', () => {
  it('catalog.sync.server-error: 503 rejects with kind server and the busy-server message', async () => {
    const fetchFn = fakeFetch(() => new Response('busy', { status: 503 }))
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)

    const err = await captureSourceError(source.fetchCatalog())

    expect(err.kind).toBe('server')
    expect(err.message).toBe('Máy chủ truyện đang bận, thử lại sau')
    expect(err.status).toBe(503)
  })

  it('catalog.sync.server-error: 429 maps to kind server', async () => {
    const fetchFn = fakeFetch(() => new Response('slow down', { status: 429 }))
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)

    const err = await captureSourceError(source.fetchCatalog())

    expect(err.kind).toBe('server')
  })

  it('catalog.sync.server-error: other non-ok status maps to kind http with the status', async () => {
    const fetchFn = fakeFetch(() => new Response('bad', { status: 400 }))
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)

    const err = await captureSourceError(source.fetchCatalog())

    expect(err.kind).toBe('http')
    expect(err.status).toBe(400)
    expect(err.message).toBe('Lỗi máy chủ truyện')
  })
})

describe('catalog.sync.network', () => {
  it('catalog.sync.network: a thrown fetch rejects with kind network', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)

    const err = await captureSourceError(source.fetchCatalog())

    expect(err.kind).toBe('network')
    expect(err.message).toBe('Không kết nối được máy chủ truyện')
  })
})

describe('URLs', () => {
  const source = createR2Source(cfg)

  it('catalog.sync.fields: coverUrl and epubUrl encode each path segment and the md5', () => {
    expect(source.coverUrl({ id: 'dau-pha', md5: 'm1' })).toBe(
      'https://books.example.workers.dev/books/dau-pha/cover.jpg?v=m1',
    )
    expect(source.epubUrl({ id: 'dau-pha', name: 'Đấu Phá 1.epub', md5: 'm 1/x' })).toBe(
      'https://books.example.workers.dev/books/dau-pha/%C4%90%E1%BA%A5u%20Ph%C3%A1%201.epub?v=m%201%2Fx',
    )
    expect(source.coverUrl({ id: 'a b', md5: 'z' })).toBe(
      'https://books.example.workers.dev/books/a%20b/cover.jpg?v=z',
    )
  })
})

describe('cache.fetch.not-found', () => {
  it('cache.fetch.not-found: fetchBook 404 rejects with kind not-found', async () => {
    const fetchFn = fakeFetch(() => new Response('nope', { status: 404 }))
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)

    const err = await captureSourceError(
      source.fetchBook({ id: 'dau-pha', name: 'dau-pha.epub', md5: 'm1', size: 10 }),
    )

    expect(err.kind).toBe('not-found')
    expect(err.message).toBe('Không tìm thấy truyện')
  })
})

describe('cache.fetch.content-length', () => {
  it('cache.fetch.content-length: Content-Length 400 with 100 bytes received reports 25', async () => {
    const fetchFn = fakeFetch(
      () =>
        new Response(chunkedBody([new Array(100).fill(1)]), {
          status: 200,
          headers: { 'Content-Length': '400' },
        }),
    )
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)
    const onProgress = vi.fn()

    await source.fetchBook(
      { id: 'a', name: 'a.epub', md5: 'm1', size: 0 },
      { onProgress },
    )

    expect(onProgress).toHaveBeenCalledWith(25)
    expect(onProgress.mock.calls[0][0]).toBe(25)
  })

  it('cache.fetch.content-length: falls back to catalog size when Content-Length is absent', async () => {
    const fetchFn = fakeFetch(() => new Response(chunkedBody([[1, 2], [3, 4]]), { status: 200 }))
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)
    const onProgress = vi.fn()

    await source.fetchBook({ id: 'a', name: 'a.epub', md5: 'm1', size: 4 }, { onProgress })

    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([50, 100])
  })

  it('cache.fetch.content-length: onProgress(null) once when the size is unknown', async () => {
    const fetchFn = fakeFetch(() => new Response(chunkedBody([[1], [2], [3]]), { status: 200 }))
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)
    const onProgress = vi.fn()

    const blob = await source.fetchBook(
      { id: 'a', name: 'a.epub', md5: 'm1', size: 0 },
      { onProgress },
    )

    expect(onProgress.mock.calls).toEqual([[null]])
    expect(blob.size).toBe(3)
    expect(blob.type).toBe('application/epub+zip')
  })

  it('cache.fetch.content-length: onProgress(100) at the end when the size is known', async () => {
    const fetchFn = fakeFetch(
      () =>
        new Response(chunkedBody([[1, 2], [3, 4]]), {
          status: 200,
          headers: { 'Content-Length': '4' },
        }),
    )
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)
    const onProgress = vi.fn()

    await source.fetchBook({ id: 'a', name: 'a.epub', md5: 'm1', size: 4 }, { onProgress })

    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([50, 100])
    expect(onProgress.mock.calls.at(-1)?.[0]).toBe(100)
  })

  it('cache.fetch.content-length: fetchBook requests the epub url with the signal', async () => {
    const fetchFn = fakeFetch(() => new Response(chunkedBody([[1]]), { status: 200 }))
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)
    const controller = new AbortController()

    await source.fetchBook(
      { id: 'a', name: 'a.epub', md5: 'm1', size: 1 },
      { signal: controller.signal },
    )

    expect(fetchFn.mock.calls[0][0]).toBe('https://books.example.workers.dev/books/a/a.epub?v=m1')
    expect(fetchFn.mock.calls[0][1]?.signal).toBe(controller.signal)
  })

  it('cache.fetch.content-length: a stream read error rejects with kind network', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]))
        controller.error(new TypeError('network dropped'))
      },
    })
    const fetchFn = fakeFetch(() => new Response(body, { status: 200 }))
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)

    const err = await captureSourceError(
      source.fetchBook({ id: 'a', name: 'a.epub', md5: 'm1', size: 4 }),
    )

    expect(err.kind).toBe('network')
  })

  it('cache.fetch.content-length: a thrown fetch rejects with kind network', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)

    const err = await captureSourceError(
      source.fetchBook({ id: 'a', name: 'a.epub', md5: 'm1', size: 4 }),
    )

    expect(err.kind).toBe('network')
  })
})

describe('cache.fetch.abort', () => {
  it('cache.fetch.abort: an AbortError from fetch is rethrown, not wrapped', async () => {
    const abortErr = new DOMException('The operation was aborted.', 'AbortError')
    const fetchFn = vi.fn(async () => {
      throw abortErr
    })
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)

    const caught = await source.fetchBook({ id: 'a', name: 'a.epub', md5: 'm1', size: 4 }).then(
      () => null,
      (e: unknown) => e,
    )

    expect(caught).toBe(abortErr)
    expect(caught).not.toBeInstanceOf(SourceError)
  })

  it('cache.fetch.abort: an AbortError while reading the stream is rethrown, not wrapped', async () => {
    const abortErr = new DOMException('aborted', 'AbortError')
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(abortErr)
      },
    })
    const fetchFn = fakeFetch(() => new Response(body, { status: 200 }))
    const source = createR2Source(cfg, fetchFn as unknown as typeof fetch)

    const caught = await source.fetchBook({ id: 'a', name: 'a.epub', md5: 'm1', size: 4 }).then(
      () => null,
      (e: unknown) => e,
    )

    expect((caught as { name?: string }).name).toBe('AbortError')
    expect(caught).not.toBeInstanceOf(SourceError)
  })
})
