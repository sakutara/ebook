import { describe, it, expect, vi } from 'vitest'
import { createDriveApi, DriveError } from '../../src/drive/drive-api'

const cfg = { apiKey: 'KEY 1', folderId: 'FOLDER' }

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function fakeFetch(factory: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return factory(url, init)
  })
}

async function captureError(p: Promise<unknown>): Promise<DriveError> {
  try {
    await p
  } catch (e) {
    if (e instanceof DriveError) return e
    throw e
  }
  throw new Error('expected rejection')
}

describe('catalog.sync.paged', () => {
  it('catalog.sync.paged: listPage sends the exact query params and passes pageToken', async () => {
    const fetchFn = fakeFetch(() => jsonResponse(200, { files: [], nextPageToken: 'tok' }))
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)

    const first = await api.listPage()
    expect(first).toEqual({ files: [], nextPageToken: 'tok' })
    const firstUrl = new URL(fetchFn.mock.calls[0][0] as string)
    expect(firstUrl.origin + firstUrl.pathname).toBe('https://www.googleapis.com/drive/v3/files')
    expect(firstUrl.searchParams.get('q')).toBe("'FOLDER' in parents and trashed = false")
    expect(firstUrl.searchParams.get('fields')).toBe(
      'nextPageToken,files(id,name,size,modifiedTime,md5Checksum,mimeType)',
    )
    expect(firstUrl.searchParams.get('pageSize')).toBe('200')
    expect(firstUrl.searchParams.get('orderBy')).toBe('name')
    expect(firstUrl.searchParams.get('supportsAllDrives')).toBe('true')
    expect(firstUrl.searchParams.get('includeItemsFromAllDrives')).toBe('true')
    expect(firstUrl.searchParams.get('key')).toBe('KEY 1')
    expect(firstUrl.searchParams.has('pageToken')).toBe(false)

    await api.listPage('tok')
    const secondUrl = new URL(fetchFn.mock.calls[1][0] as string)
    expect(secondUrl.searchParams.get('pageToken')).toBe('tok')
  })

  it('catalog.sync.paged: listPage defaults files to an empty array', async () => {
    const fetchFn = fakeFetch(() => jsonResponse(200, {}))
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)
    expect(await api.listPage()).toEqual({ files: [], nextPageToken: undefined })
  })
})

describe('catalog.sync.config-error', () => {
  it('catalog.sync.config-error: 403 API_KEY_HTTP_REFERRER_BLOCKED in details maps to config with the Vietnamese message', async () => {
    const fetchFn = fakeFetch(() =>
      jsonResponse(403, {
        error: {
          code: 403,
          status: 'PERMISSION_DENIED',
          details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_HTTP_REFERRER_BLOCKED' }],
        },
      }),
    )
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)
    const err = await captureError(api.listPage())
    expect(err.kind).toBe('config')
    expect(err.message).toBe('Cấu hình Google Drive không hợp lệ')
  })
})

describe('drive-api error mapping', () => {
  it('drive-api: 403 accessNotConfigured in errors maps to config', async () => {
    const fetchFn = fakeFetch(() =>
      jsonResponse(403, { error: { errors: [{ reason: 'accessNotConfigured' }] } }),
    )
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)
    const err = await captureError(api.listPage())
    expect(err.kind).toBe('config')
    expect(err.status).toBe(403)
  })

  it('drive-api: 404 maps to not-found', async () => {
    const fetchFn = fakeFetch(() => jsonResponse(404, { error: { code: 404 } }))
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)
    const err = await captureError(api.listPage())
    expect(err.kind).toBe('not-found')
    expect(err.message).toBe(
      'Không tìm thấy thư mục Google Drive (thư mục cần được chia sẻ công khai)',
    )
  })

  it('drive-api: 429 maps to rate-limit', async () => {
    const fetchFn = fakeFetch(() => jsonResponse(429, { error: { code: 429 } }))
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)
    const err = await captureError(api.listPage())
    expect(err.kind).toBe('rate-limit')
  })

  it('drive-api: 403 userRateLimitExceeded maps to rate-limit', async () => {
    const fetchFn = fakeFetch(() =>
      jsonResponse(403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } }),
    )
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)
    const err = await captureError(api.listPage())
    expect(err.kind).toBe('rate-limit')
  })

  it('drive-api: 500 maps to http with status', async () => {
    const fetchFn = fakeFetch(() => jsonResponse(500, { error: { code: 500 } }))
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)
    const err = await captureError(api.listPage())
    expect(err.kind).toBe('http')
    expect(err.status).toBe(500)
    expect(err.message).toBe('Lỗi Google Drive (500)')
  })

  it('drive-api: fetch TypeError maps to network', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)
    const err = await captureError(api.listPage())
    expect(err.kind).toBe('network')
  })

  it('drive-api: AbortError is rethrown as is', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    const fetchFn = vi.fn(async () => {
      throw abort
    })
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)
    await expect(api.listPage()).rejects.toBe(abort)
  })

  it('drive-api: non-JSON error body is handled', async () => {
    const fetchFn = fakeFetch(() => new Response('<html>Bad Gateway</html>', { status: 502 }))
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)
    const err = await captureError(api.listPage())
    expect(err.kind).toBe('http')
    expect(err.status).toBe(502)
  })

  it('drive-api: empty error body is handled', async () => {
    const fetchFn = fakeFetch(() => new Response('', { status: 503 }))
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)
    const err = await captureError(api.listPage())
    expect(err.kind).toBe('http')
    expect(err.status).toBe(503)
  })
})

describe('drive-api URLs', () => {
  it('drive-api: downloadUrl and mediaUrl formats', () => {
    const api = createDriveApi(cfg, vi.fn() as unknown as typeof fetch)
    expect(api.mediaUrl('a/b c')).toBe(
      'https://www.googleapis.com/drive/v3/files/a%2Fb%20c?alt=media&key=KEY%201',
    )
    expect(api.downloadUrl('a/b c')).toBe('https://drive.google.com/uc?export=download&id=a%2Fb%20c')
  })
})

describe('drive-api fetchBook', () => {
  it('drive-api: fetchBook reports increasing integer percentages and returns a blob of the right size', async () => {
    const chunk = new Uint8Array(250)
    const fetchFn = fakeFetch(() => {
      let i = 0
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (i < 4) {
            controller.enqueue(chunk)
            i++
          } else {
            controller.close()
          }
        },
      })
      return new Response(stream, { status: 200 })
    })
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)
    const progress: number[] = []
    const blob = await api.fetchBook('id1', { size: 1000, onProgress: (p) => progress.push(p) })
    expect(progress).toEqual([25, 50, 75, 100])
    expect(blob.size).toBe(1000)
    expect(blob.type).toBe('application/epub+zip')
    expect((fetchFn.mock.calls[0][0] as string)).toContain('alt=media')
  })

  it('drive-api: a mid-stream read error in fetchBook maps to network', async () => {
    const fetchFn = fakeFetch(() => {
      let sent = false
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!sent) {
            sent = true
            controller.enqueue(new Uint8Array(100))
          } else {
            controller.error(new TypeError('network dropped'))
          }
        },
      })
      return new Response(stream, { status: 200 })
    })
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)
    const err = await captureError(api.fetchBook('id1', { size: 1000 }))
    expect(err.kind).toBe('network')
  })

  it('drive-api: an AbortError during fetchBook streaming is rethrown as is', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    const fetchFn = fakeFetch(() => {
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(abort)
        },
      })
      return new Response(stream, { status: 200 })
    })
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)
    await expect(api.fetchBook('id1', { size: 1000 })).rejects.toBe(abort)
  })

  it('drive-api: fetchBook passes the abort signal to fetch', async () => {
    const fetchFn = fakeFetch(() => new Response(new Uint8Array(10), { status: 200 }))
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)
    const ctrl = new AbortController()
    await api.fetchBook('id1', { size: 10, signal: ctrl.signal })
    expect((fetchFn.mock.calls[0][1] as RequestInit).signal).toBe(ctrl.signal)
  })
})

describe('drive-api fetchRange', () => {
  it('drive-api: fetchRange sends a Range header and returns the 206 body', async () => {
    const fetchFn = fakeFetch(
      () => new Response(new Uint8Array([1, 2, 3]), { status: 206 }),
    )
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)
    const bytes = await api.fetchRange('id1', 10, 12)
    expect(Array.from(bytes)).toEqual([1, 2, 3])
    const init = fetchFn.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get('Range')).toBe('bytes=10-12')
    expect(fetchFn.mock.calls[0][0] as string).toContain('/drive/v3/files/id1?alt=media')
  })

  it('drive-api: fetchRange slices a 200 full body and reuses it for the next range', async () => {
    const full = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    const fetchFn = fakeFetch(() => new Response(full.slice(), { status: 200 }))
    const api = createDriveApi(cfg, fetchFn as unknown as typeof fetch)
    const a = await api.fetchRange('id1', 2, 4)
    const b = await api.fetchRange('id1', 7, 9)
    expect(Array.from(a)).toEqual([2, 3, 4])
    expect(Array.from(b)).toEqual([7, 8, 9])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
