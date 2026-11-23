// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { handle, type Env } from '../../worker/src/handler'
import { FakeBucket, FakeCache, makeCtx } from './fake-bucket'

const ORIGIN = 'https://ebook.test'

function setup() {
  const bucket = new FakeBucket()
  const cache = new FakeCache()
  const { ctx, flush } = makeCtx()
  const env: Env = { BOOKS: bucket, ADMIN_TOKEN: 'test-token', ADMIN_ORIGINS: 'http://localhost:5174' }
  const send = (url: string, init?: RequestInit) =>
    handle(new Request(`${ORIGIN}${url}`, init), env, ctx, cache)
  return { bucket, cache, flush, send }
}

const bytes = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i % 251))

describe('worker public routes', () => {
  it('worker.public.catalog: GET /catalog.json answers the object with JSON headers', async () => {
    const { bucket, send } = setup()
    const body = JSON.stringify({ schema: 1, generatedAt: 'x', books: [] })
    await bucket.put('catalog.json', body)

    const res = await send('/catalog.json')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
    expect(res.headers.get('ETag')).toMatch(/^"e\d+"$/)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Content-Length')).toBe(String(new TextEncoder().encode(body).byteLength))
    expect(await res.text()).toBe(body)
  })

  it('worker.public.catalog: POST /catalog.json answers 405 with CORS', async () => {
    const { bucket, send } = setup()
    await bucket.put('catalog.json', '{}')

    const res = await send('/catalog.json', { method: 'POST', body: 'x' })

    expect(res.status).toBe(405)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(bucket.calls.filter((c) => c.startsWith('put'))).toEqual(['put catalog.json'])
  })

  it('worker.public.catalog: HEAD returns headers without a body', async () => {
    const { bucket, send } = setup()
    await bucket.put('catalog.json', '{"schema":1}')

    const res = await send('/catalog.json', { method: 'HEAD' })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
    expect(res.headers.get('Content-Length')).toBe('12')
    expect(await res.text()).toBe('')
  })

  it('worker.public.catalog: OPTIONS preflight answers 204 with wildcard CORS', async () => {
    const { send } = setup()

    const res = await send('/catalog.json', { method: 'OPTIONS' })

    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('worker.public.immutable: GET cover with v answers image/jpeg with immutable caching', async () => {
    const { bucket, send } = setup()
    await bucket.put('books/a/cover.jpg', bytes(10))

    const res = await send('/books/a/cover.jpg?v=m1')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes(10))
  })

  it('worker.public.immutable: book object without v gets a short cache lifetime', async () => {
    const { bucket, send } = setup()
    await bucket.put('books/a/cover.jpg', bytes(10))

    const res = await send('/books/a/cover.jpg')

    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300')
  })

  it('worker.public.not-found: missing book object answers 404 with CORS', async () => {
    const { send } = setup()

    const res = await send('/books/missing/cover.jpg')

    expect(res.status).toBe(404)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('worker.public.not-found: path outside catalog and books answers 404 with CORS', async () => {
    const { bucket, send } = setup()
    await bucket.put('secret.txt', 'shh')

    const res = await send('/secret.txt')

    expect(res.status).toBe(404)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(await res.text()).not.toContain('shh')
  })

  it('worker.public.not-modified: matching If-None-Match answers 304 without body', async () => {
    const { bucket, send } = setup()
    await bucket.put('catalog.json', '{"schema":1}')
    const first = await send('/catalog.json')
    const etag = first.headers.get('ETag')!

    const res = await send('/catalog.json', { headers: { 'If-None-Match': etag } })

    expect(res.status).toBe(304)
    expect(res.headers.get('ETag')).toBe(etag)
    expect(await res.text()).toBe('')
  })
})

describe('worker range and download', () => {
  it('worker.range.partial: Range bytes=0-99 answers 206 with 100 bytes', async () => {
    const { bucket, send } = setup()
    await bucket.put('books/a/a.epub', bytes(1000))

    const res = await send('/books/a/a.epub', { headers: { Range: 'bytes=0-99' } })

    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 0-99/1000')
    expect(res.headers.get('Content-Length')).toBe('100')
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    expect(res.headers.get('Content-Type')).toBe('application/epub+zip')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes(1000).slice(0, 100))
  })

  it('worker.range.partial: open-ended and suffix ranges', async () => {
    const { bucket, send } = setup()
    await bucket.put('books/a/a.epub', bytes(1000))

    const open = await send('/books/a/a.epub', { headers: { Range: 'bytes=990-' } })
    expect(open.status).toBe(206)
    expect(open.headers.get('Content-Range')).toBe('bytes 990-999/1000')

    const suffix = await send('/books/a/a.epub', { headers: { Range: 'bytes=-10' } })
    expect(suffix.status).toBe(206)
    expect(suffix.headers.get('Content-Range')).toBe('bytes 990-999/1000')
    expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(bytes(1000).slice(990))
  })

  it('worker.range.partial: unsatisfiable range answers 416 with bytes */size', async () => {
    const { bucket, send } = setup()
    await bucket.put('books/a/a.epub', bytes(1000))

    const res = await send('/books/a/a.epub', { headers: { Range: 'bytes=5000-6000' } })

    expect(res.status).toBe(416)
    expect(res.headers.get('Content-Range')).toBe('bytes */1000')
  })

  it('worker.range.partial: full EPUB GET advertises Accept-Ranges and Content-Length', async () => {
    const { bucket, send } = setup()
    await bucket.put('books/a/a.epub', bytes(1000))

    const res = await send('/books/a/a.epub')

    expect(res.status).toBe(200)
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    expect(res.headers.get('Content-Length')).toBe('1000')
    expect(res.headers.get('Content-Disposition')).toBeNull()
  })

  it('worker.download.disposition: download=1 names the file after metadata title', async () => {
    const { bucket, send } = setup()
    await bucket.put('books/dau-pha/dau-pha.epub', bytes(10))
    await bucket.put('books/dau-pha/metadata.json', JSON.stringify({ schema: 1, title: 'Đấu Phá' }))

    const res = await send('/books/dau-pha/dau-pha.epub?download=1')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toBe(
      "attachment; filename*=UTF-8''%C4%90%E1%BA%A5u%20Ph%C3%A1.epub",
    )
  })

  it('worker.download.disposition: falls back to the object file name without metadata', async () => {
    const { bucket, send } = setup()
    await bucket.put('books/dau-pha/dau-pha.epub', bytes(10))

    const res = await send('/books/dau-pha/dau-pha.epub?download=1')

    expect(res.headers.get('Content-Disposition')).toBe("attachment; filename*=UTF-8''dau-pha.epub")
  })

  it('worker.download.disposition: falls back when metadata is not valid JSON', async () => {
    const { bucket, send } = setup()
    await bucket.put('books/dau-pha/dau-pha.epub', bytes(10))
    await bucket.put('books/dau-pha/metadata.json', '{not json')

    const res = await send('/books/dau-pha/dau-pha.epub?download=1')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toBe("attachment; filename*=UTF-8''dau-pha.epub")
  })
})

describe('worker edge cache', () => {
  it('worker.cache.hit: second GET with v comes from the cache without reading the bucket', async () => {
    const { bucket, cache, flush, send } = setup()
    await bucket.put('books/a/a.epub', bytes(64))

    const first = await send('/books/a/a.epub?v=m1')
    const firstBytes = new Uint8Array(await first.arrayBuffer())
    await flush()
    expect(cache.store.size).toBe(1)

    const callsBefore = bucket.calls.length
    const second = await send('/books/a/a.epub?v=m1')

    expect(bucket.calls.length).toBe(callsBefore)
    expect(second.status).toBe(200)
    expect(second.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(firstBytes)
  })

  it('worker.cache.hit: Range and download requests are not cached', async () => {
    const { bucket, cache, flush, send } = setup()
    await bucket.put('books/a/a.epub', bytes(64))
    await bucket.put('books/a/metadata.json', JSON.stringify({ title: 'A' }))

    await send('/books/a/a.epub?v=m1', { headers: { Range: 'bytes=0-9' } })
    await send('/books/a/a.epub?v=m1&download=1')
    await flush()

    expect(cache.store.size).toBe(0)
  })
})
