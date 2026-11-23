import type { Catalog } from './types'

export type AdminErrorKind = 'auth' | 'origin' | 'conflict' | 'network' | 'http'

const MESSAGES: Record<Exclude<AdminErrorKind, 'http'>, string> = {
  auth: 'Sai mã quản trị',
  origin: 'Worker không cho phép trang này (ADMIN_ORIGINS)',
  conflict: 'Catalog vừa bị thay đổi',
  network: 'Không kết nối được Worker',
}

export class AdminError extends Error {
  readonly kind: AdminErrorKind
  readonly status?: number

  constructor(kind: AdminErrorKind, status?: number) {
    super(kind === 'http' ? `Lỗi Worker (${status ?? 0})` : MESSAGES[kind])
    this.name = 'AdminError'
    this.kind = kind
    this.status = status
  }
}

export interface PutOptions {
  contentType?: string
  /** Sent as If-Match when a string; omitted when null or absent. */
  ifMatch?: string | null
  onProgress?: (sent: number, total: number) => void
  signal?: AbortSignal
}

export interface AdminClient {
  /** GET /admin/list?prefix=books/&limit=1; 401 → AdminError('auth'). */
  check(): Promise<void>
  /** Public GET of catalog.json, cache 'no-store'. 404 → empty catalog with etag null. */
  getCatalog(): Promise<{ catalog: Catalog; etag: string | null }>
  /** XHR PUT for upload progress; 412 → AdminError('conflict'). */
  put(key: string, body: Blob | string, opts?: PutOptions): Promise<{ etag: string }>
  del(key: string): Promise<void>
  list(prefix: string, cursor?: string): Promise<{ objects: { key: string }[]; cursor?: string }>
}

export interface AdminDeps {
  fetch?: typeof fetch
  xhr?: () => XMLHttpRequest
}

function failFor(status: number): AdminError {
  if (status === 401) return new AdminError('auth', status)
  if (status === 403) return new AdminError('origin', status)
  if (status === 412) return new AdminError('conflict', status)
  return new AdminError('http', status)
}

function abortError(): Error {
  const err = new Error('Đã dừng tải lên')
  err.name = 'AbortError'
  return err
}

export function createAdminClient(baseUrl: string, token: string, deps: AdminDeps = {}): AdminClient {
  const base = baseUrl.replace(/\/+$/, '')
  const fetchFn: typeof fetch = deps.fetch ?? ((...args) => fetch(...args))
  const makeXhr = deps.xhr ?? (() => new XMLHttpRequest())
  const auth = { Authorization: `Bearer ${token}` }

  function objectUrl(key: string): string {
    return `${base}/admin/${key.split('/').map(encodeURIComponent).join('/')}`
  }

  async function send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetchFn(url, init)
    } catch {
      throw new AdminError('network')
    }
  }

  return {
    async check() {
      const res = await send(`${base}/admin/list?prefix=books/&limit=1`, { headers: auth })
      if (!res.ok) throw failFor(res.status)
    },

    async getCatalog() {
      const res = await send(`${base}/catalog.json`, { cache: 'no-store' })
      if (res.status === 404) {
        return { catalog: { schema: 1, generatedAt: '', books: [] }, etag: null }
      }
      if (!res.ok) throw failFor(res.status)
      const catalog = (await res.json()) as Catalog
      return { catalog, etag: res.headers.get('ETag') }
    },

    put(key, body, opts = {}) {
      const { contentType, ifMatch, onProgress, signal } = opts
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(abortError())
          return
        }
        const xhr = makeXhr()
        xhr.open('PUT', objectUrl(key))
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        if (contentType !== undefined) xhr.setRequestHeader('Content-Type', contentType)
        if (typeof ifMatch === 'string') xhr.setRequestHeader('If-Match', ifMatch)
        if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded, e.total)
        xhr.onload = () => {
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(failFor(xhr.status))
            return
          }
          try {
            const json = JSON.parse(xhr.responseText) as { etag?: unknown }
            if (typeof json.etag !== 'string') throw new Error('no etag')
            resolve({ etag: json.etag })
          } catch {
            reject(new AdminError('http', xhr.status))
          }
        }
        xhr.onerror = () => reject(new AdminError('network'))
        signal?.addEventListener(
          'abort',
          () => {
            xhr.abort()
            reject(abortError())
          },
          { once: true },
        )
        xhr.send(body)
      })
    },

    async del(key) {
      const res = await send(objectUrl(key), { method: 'DELETE', headers: auth })
      if (!res.ok) throw failFor(res.status)
    },

    async list(prefix, cursor) {
      const params = new URLSearchParams({ prefix })
      if (cursor) params.set('cursor', cursor)
      const res = await send(`${base}/admin/list?${params.toString()}`, { headers: auth })
      if (!res.ok) throw failFor(res.status)
      return (await res.json()) as { objects: { key: string }[]; cursor?: string }
    },
  }
}
