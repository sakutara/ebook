// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { handle, type Env } from '../../worker/src/handler'
import { FakeBucket, FakeCache, makeCtx } from './fake-bucket'

const ORIGIN = 'https://ebook.test'
const ALLOWED = 'http://localhost:5174'
const TOKEN = 'test-token'

function setup(adminOrigins = ALLOWED) {
  const bucket = new FakeBucket()
  const cache = new FakeCache()
  const { ctx } = makeCtx()
  const env: Env = { BOOKS: bucket, ADMIN_TOKEN: TOKEN, ADMIN_ORIGINS: adminOrigins }
  const send = (url: string, init?: RequestInit) =>
    handle(new Request(`${ORIGIN}${url}`, init), env, ctx, cache)
  return { bucket, send, env }
}

function auth(origin?: string, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}`, ...extra }
  if (origin) headers.Origin = origin
  return headers
}

describe('worker admin API', () => {
  it('worker.admin.unauthorized: PUT without a token answers 401 and leaves the bucket unchanged', async () => {
    const { bucket, send } = setup()

    const none = await send('/admin/catalog.json', { method: 'PUT', body: '{"schema":1}' })
    const wrong = await send('/admin/catalog.json', {
      method: 'PUT',
      body: '{"schema":1}',
      headers: { Authorization: 'Bearer nope' },
    })

    expect(none.status).toBe(401)
    expect(wrong.status).toBe(401)
    expect(bucket.peek('catalog.json')).toBeUndefined()
  })

  it('worker.admin.unauthorized: empty ADMIN_TOKEN rejects every token', async () => {
    const { bucket, env } = setup()
    env.ADMIN_TOKEN = ''
    const { ctx } = makeCtx()
    const res = await handle(
      new Request(`${ORIGIN}/admin/catalog.json`, {
        method: 'PUT',
        body: '{}',
        headers: { Authorization: 'Bearer ' },
      }),
      env,
      ctx,
      new FakeCache(),
    )

    expect(res.status).toBe(401)
    expect(bucket.peek('catalog.json')).toBeUndefined()
  })

  it('worker.admin.unauthorized: DELETE without a token answers 401 and keeps the object', async () => {
    const { bucket, send } = setup()
    await bucket.put('books/a/a.epub', 'x')

    const res = await send('/admin/books/a/a.epub', { method: 'DELETE' })

    expect(res.status).toBe(401)
    expect(bucket.peek('books/a/a.epub')).toBeDefined()
  })

  it('worker.admin.origin: valid token from a disallowed Origin answers 403', async () => {
    const { bucket, send } = setup()

    const res = await send('/admin/catalog.json', {
      method: 'PUT',
      body: '{}',
      headers: auth('https://evil.example'),
    })

    expect(res.status).toBe(403)
    expect(bucket.peek('catalog.json')).toBeUndefined()
  })

  it('worker.admin.origin: a request without an Origin header is allowed', async () => {
    const { send } = setup()

    const res = await send('/admin/catalog.json', { method: 'PUT', body: '{}', headers: auth() })

    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('worker.admin.put: PUT stores JSON with charset and answers { key, etag, size }', async () => {
    const { bucket, send } = setup()
    const body = JSON.stringify({ schema: 1, id: 'a', title: 'A' })

    const res = await send('/admin/books/a/metadata.json', {
      method: 'PUT',
      body,
      headers: auth(ALLOWED),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED)
    expect(res.headers.get('Vary')).toBe('Origin')
    const json = (await res.json()) as { key: string; etag: string; size: number }
    expect(json.key).toBe('books/a/metadata.json')
    expect(json.size).toBe(new TextEncoder().encode(body).byteLength)
    const head = await bucket.head('books/a/metadata.json')
    expect(head?.etag).toBe(json.etag)
    expect(head?.httpMetadata?.contentType).toBe('application/json; charset=utf-8')
  })

  it('worker.admin.put: DELETE of an allowed key answers 204 and removes it', async () => {
    const { bucket, send } = setup()
    await bucket.put('books/a/cover.jpg', 'jpg')

    const res = await send('/admin/books/a/cover.jpg', { method: 'DELETE', headers: auth(ALLOWED) })

    expect(res.status).toBe(204)
    expect(bucket.peek('books/a/cover.jpg')).toBeUndefined()
  })

  it('worker.admin.bad-key: PUT to a key with a space and .exe answers 400 and stores nothing', async () => {
    const { bucket, send } = setup()

    const res = await send('/admin/books/A%20B/x.exe', { method: 'PUT', body: 'evil', headers: auth(ALLOWED) })

    expect(res.status).toBe(400)
    expect(bucket.calls.filter((c) => c.startsWith('put'))).toEqual([])
  })

  it('worker.admin.bad-key: slug and file name must match the whitelist', async () => {
    const { bucket, send } = setup()

    const badSlug = await send('/admin/books/a/a.epub.bak', { method: 'PUT', body: 'x', headers: auth() })
    const mismatched = await send('/admin/books/a/b.epub', { method: 'PUT', body: 'x', headers: auth() })
    const other = await send('/admin/secret.txt', { method: 'PUT', body: 'x', headers: auth() })

    expect(badSlug.status).toBe(400)
    expect(mismatched.status).toBe(400)
    expect(other.status).toBe(400)
    expect(bucket.calls.filter((c) => c.startsWith('put'))).toEqual([])
  })

  it('worker.admin.if-match: stale If-Match answers 412 and leaves the object unchanged', async () => {
    const { bucket, send } = setup()
    await bucket.put('catalog.json', 'v1') // e1
    await bucket.put('catalog.json', 'v2') // e2

    const res = await send('/admin/catalog.json', {
      method: 'PUT',
      body: 'v3',
      headers: auth(undefined, { 'If-Match': '"e1"' }),
    })

    expect(res.status).toBe(412)
    expect(new TextDecoder().decode(bucket.peek('catalog.json'))).toBe('v2')
  })

  it('worker.admin.if-match: matching If-Match stores the new object', async () => {
    const { bucket, send } = setup()
    await bucket.put('catalog.json', 'v1') // e1

    const res = await send('/admin/catalog.json', {
      method: 'PUT',
      body: 'v2',
      headers: auth(undefined, { 'If-Match': '"e1"' }),
    })

    expect(res.status).toBe(200)
    expect(new TextDecoder().decode(bucket.peek('catalog.json'))).toBe('v2')
  })

  it('worker.admin.list: lists the keys under a prefix with size and etag', async () => {
    const { bucket, send } = setup()
    await bucket.put('books/a/a.epub', 'one')
    await bucket.put('books/a/cover.jpg', 'two')
    await bucket.put('books/a/metadata.json', 'three')
    await bucket.put('books/b/b.epub', 'four')

    const res = await send('/admin/list?prefix=books/a/', { headers: auth(ALLOWED) })

    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      objects: { key: string; size: number; etag: string; uploaded: string }[]
      cursor?: string
    }
    expect(json.objects.map((o) => o.key)).toEqual([
      'books/a/a.epub',
      'books/a/cover.jpg',
      'books/a/metadata.json',
    ])
    expect(json.objects[0]).toMatchObject({ size: 3 })
    expect(json.objects[0].etag).toMatch(/^e\d+$/)
    expect(new Date(json.objects[0].uploaded).toString()).not.toBe('Invalid Date')
    expect(json.cursor).toBeUndefined()
  })

  it('worker.admin.list: without a token answers 401', async () => {
    const { send } = setup()

    const res = await send('/admin/list?prefix=books/')

    expect(res.status).toBe(401)
  })

  it('worker.admin.preflight: OPTIONS from an allowed origin answers 204 with CORS', async () => {
    const { send } = setup()

    const res = await send('/admin/catalog.json', { method: 'OPTIONS', headers: { Origin: ALLOWED } })

    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED)
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, PUT, DELETE, OPTIONS')
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, Content-Type, If-Match')
  })

  it('worker.admin.preflight: OPTIONS from a disallowed origin answers 403', async () => {
    const { send } = setup()

    const res = await send('/admin/catalog.json', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })

    expect(res.status).toBe(403)
  })
})
