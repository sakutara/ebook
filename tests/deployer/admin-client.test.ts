import { describe, expect, it, vi } from 'vitest'
import { AdminError, createAdminClient } from '../../deployer/src/admin-client'

const BASE = 'https://worker.example.dev/'
const TOKEN = 't0ken'

/** Minimal stand-in for XMLHttpRequest covering what createAdminClient uses. */
class FakeXHR {
  method = ''
  url = ''
  headers: Record<string, string> = {}
  body: unknown = undefined
  status = 0
  responseText = ''
  aborted = false
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null

  open(method: string, url: string): void {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value
  }
  send(body: unknown): void {
    this.body = body
  }
  abort(): void {
    this.aborted = true
  }
  respond(status: number, body = ''): void {
    this.status = status
    this.responseText = body
    this.onload?.()
  }
  fail(): void {
    this.onerror?.()
  }
  progress(loaded: number, total: number): void {
    this.upload.onprogress?.({ loaded, total, lengthComputable: true } as ProgressEvent)
  }
}

function setup(fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>) {
  const xhrs: FakeXHR[] = []
  const fetchMock = vi.fn(fetchImpl ?? (async () => new Response('{}', { status: 200 })))
  const client = createAdminClient(BASE, TOKEN, {
    fetch: fetchMock as unknown as typeof fetch,
    xhr: () => {
      const x = new FakeXHR()
      xhrs.push(x)
      return x as unknown as XMLHttpRequest
    },
  })
  return { client, fetchMock, xhrs }
}

async function errorOf(p: Promise<unknown>): Promise<AdminError> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(AdminError)
    return e as AdminError
  }
  throw new Error('expected rejection')
}

describe('deployer.connect.bad-token', () => {
  it('deployer.connect.bad-token: check() maps 401 to auth with the Vietnamese message', async () => {
    const { client, fetchMock } = setup(async () => new Response('Unauthorized', { status: 401 }))
    const err = await errorOf(client.check())
    expect(err.kind).toBe('auth')
    expect(err.status).toBe(401)
    expect(err.message).toBe('Sai mã quản trị')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://worker.example.dev/admin/list?prefix=books/&limit=1')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('deployer.connect.bad-token: check() resolves on 200', async () => {
    const { client } = setup()
    await expect(client.check()).resolves.toBeUndefined()
  })
})

describe('deployer.connect.ok: admin error kinds', () => {
  it('deployer.connect.ok: check() maps 403 to origin with the ADMIN_ORIGINS message', async () => {
    const { client } = setup(async () => new Response('Forbidden', { status: 403 }))
    const err = await errorOf(client.check())
    expect(err.kind).toBe('origin')
    expect(err.message).toBe('Worker không cho phép trang này (ADMIN_ORIGINS)')
  })

  it('deployer.connect.ok: check() maps a fetch rejection to network', async () => {
    const { client } = setup(async () => {
      throw new TypeError('Failed to fetch')
    })
    const err = await errorOf(client.check())
    expect(err.kind).toBe('network')
    expect(err.message).toBe('Không kết nối được Worker')
  })

  it('deployer.connect.ok: check() maps other statuses to http with the status in the message', async () => {
    const { client } = setup(async () => new Response('boom', { status: 500 }))
    const err = await errorOf(client.check())
    expect(err.kind).toBe('http')
    expect(err.status).toBe(500)
    expect(err.message).toBe('Lỗi Worker (500)')
  })

  it('deployer.connect.ok: put() maps XHR 412 to conflict', async () => {
    const { client, xhrs } = setup()
    const p = client.put('catalog.json', '{}', { ifMatch: '"e1"' })
    xhrs[0].respond(412, 'Precondition failed')
    const err = await errorOf(p)
    expect(err.kind).toBe('conflict')
    expect(err.message).toBe('Catalog vừa bị thay đổi')
  })

  it('deployer.connect.ok: put() maps XHR 401 to auth and 403 to origin', async () => {
    const { client, xhrs } = setup()
    const a = client.put('books/a/cover.jpg', new Blob(['x']))
    xhrs[0].respond(401)
    expect((await errorOf(a)).kind).toBe('auth')
    const b = client.put('books/a/cover.jpg', new Blob(['x']))
    xhrs[1].respond(403)
    expect((await errorOf(b)).kind).toBe('origin')
  })

  it('deployer.connect.ok: put() maps XHR network failure to network', async () => {
    const { client, xhrs } = setup()
    const p = client.put('books/a/a.epub', new Blob(['x']))
    xhrs[0].fail()
    const err = await errorOf(p)
    expect(err.kind).toBe('network')
    expect(err.message).toBe('Không kết nối được Worker')
  })

  it('deployer.connect.ok: put() maps XHR 500 to http', async () => {
    const { client, xhrs } = setup()
    const p = client.put('books/a/a.epub', new Blob(['x']))
    xhrs[0].respond(500)
    const err = await errorOf(p)
    expect(err.kind).toBe('http')
    expect(err.message).toBe('Lỗi Worker (500)')
  })

  it('deployer.connect.ok: del() maps 401 to auth and 500 to http', async () => {
    const { client } = setup(async () => new Response('x', { status: 401 }))
    expect((await errorOf(client.del('books/a/a.epub'))).kind).toBe('auth')
    const second = setup(async () => new Response('x', { status: 500 }))
    expect((await errorOf(second.client.del('books/a/a.epub'))).kind).toBe('http')
  })
})

describe('deployer.connect.ok: put()', () => {
  it('deployer.connect.ok: sends PUT with bearer, content type and no If-Match when ifMatch is absent', async () => {
    const { client, xhrs } = setup()
    const p = client.put('books/a/metadata.json', '{"x":1}', { contentType: 'application/json; charset=utf-8' })
    const x = xhrs[0]
    expect(x.method).toBe('PUT')
    expect(x.url).toBe('https://worker.example.dev/admin/books/a/metadata.json')
    expect(x.headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(x.headers['Content-Type']).toBe('application/json; charset=utf-8')
    expect(x.headers['If-Match']).toBeUndefined()
    expect(x.body).toBe('{"x":1}')
    x.respond(200, JSON.stringify({ key: 'books/a/metadata.json', etag: 'abc', size: 7 }))
    await expect(p).resolves.toEqual({ etag: 'abc' })
  })

  it('deployer.connect.ok: put() sends If-Match when ifMatch is a string', async () => {
    const { client, xhrs } = setup()
    const p = client.put('catalog.json', '{}', { ifMatch: '"e1"' })
    expect(xhrs[0].headers['If-Match']).toBe('"e1"')
    xhrs[0].respond(200, JSON.stringify({ etag: 'e2' }))
    await p
  })

  it('deployer.connect.ok: put() omits If-Match when ifMatch is null', async () => {
    const { client, xhrs } = setup()
    const p = client.put('catalog.json', '{}', { ifMatch: null })
    expect('If-Match' in xhrs[0].headers).toBe(false)
    xhrs[0].respond(200, JSON.stringify({ etag: 'e2' }))
    await p
  })

  it('deployer.upload.progress: put() reports onProgress(loaded, total) from XHR upload events', async () => {
    const { client, xhrs } = setup()
    const onProgress = vi.fn()
    const p = client.put('books/a/a.epub', new Blob(['x']), { onProgress })
    xhrs[0].progress(50, 100)
    xhrs[0].progress(100, 100)
    expect(onProgress.mock.calls).toEqual([
      [50, 100],
      [100, 100],
    ])
    xhrs[0].respond(200, JSON.stringify({ etag: 'e' }))
    await p
  })

  it('deployer.connect.ok: put() aborts the XHR when the signal fires and rejects with AbortError', async () => {
    const { client, xhrs } = setup()
    const ctrl = new AbortController()
    const p = client.put('books/a/a.epub', new Blob(['x']), { signal: ctrl.signal })
    ctrl.abort()
    expect(xhrs[0].aborted).toBe(true)
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('deployer.connect.ok: getCatalog()', () => {
  it('deployer.connect.ok: reads catalog with cache no-store and returns the ETag header', async () => {
    const body = { schema: 1, generatedAt: 'g', books: [] }
    const { client, fetchMock } = setup(
      async () => new Response(JSON.stringify(body), { status: 200, headers: { ETag: '"e9"' } }),
    )
    const res = await client.getCatalog()
    expect(res).toEqual({ catalog: body, etag: '"e9"' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://worker.example.dev/catalog.json')
    expect(init.cache).toBe('no-store')
  })

  it('deployer.connect.ok: 404 catalog is an empty catalog with etag null', async () => {
    const { client } = setup(async () => new Response('Not found', { status: 404 }))
    await expect(client.getCatalog()).resolves.toEqual({
      catalog: { schema: 1, generatedAt: '', books: [] },
      etag: null,
    })
  })
})

describe('deployer.connect.ok: del() and list()', () => {
  it('deployer.connect.ok: del() sends DELETE with bearer to the admin key', async () => {
    const { client, fetchMock } = setup(async () => new Response(null, { status: 204 }))
    await client.del('books/a/cover.jpg')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://worker.example.dev/admin/books/a/cover.jpg')
    expect(init.method).toBe('DELETE')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('deployer.manage.rebuild: list() passes prefix and cursor and returns the page', async () => {
    const page = { objects: [{ key: 'books/a/metadata.json' }], cursor: 'next' }
    const { client, fetchMock } = setup(async () => new Response(JSON.stringify(page), { status: 200 }))
    await expect(client.list('books/', 'c1')).resolves.toEqual(page)
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://worker.example.dev/admin/list?prefix=books%2F&cursor=c1')
  })
})
