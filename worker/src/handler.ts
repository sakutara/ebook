// Pure request logic for the book Worker. No Cloudflare globals: the binding and the
// edge cache are injected, so the same code runs under Vitest with in-memory fakes.

export interface BucketObject {
  key: string
  size: number
  etag: string
  httpEtag: string
  uploaded: Date
  httpMetadata?: { contentType?: string }
  range?: { offset: number; length: number }
}
export interface BucketObjectBody extends BucketObject {
  body: ReadableStream
  text(): Promise<string>
}
/** Structural subset of R2Bucket. */
export interface Bucket {
  get(
    key: string,
    opts?: { range?: { offset: number; length?: number }; onlyIf?: { etagDoesNotMatch?: string } },
  ): Promise<BucketObjectBody | BucketObject | null>
  head(key: string): Promise<BucketObject | null>
  put(
    key: string,
    body: ReadableStream | ArrayBuffer | string,
    opts?: { httpMetadata?: { contentType?: string }; onlyIf?: { etagMatches?: string } },
  ): Promise<BucketObject | null>
  delete(key: string): Promise<void>
  list(opts: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    objects: BucketObject[]
    truncated: boolean
    cursor?: string
  }>
}
export interface Env {
  BOOKS: Bucket
  ADMIN_TOKEN: string
  ADMIN_ORIGINS: string
}
export interface EdgeCache {
  match(req: Request): Promise<Response | undefined>
  put(req: Request, res: Response): Promise<void>
}

type ByteRange = { start: number; end: number } | 'unsatisfiable'

const CORS_PUBLIC = { 'Access-Control-Allow-Origin': '*' }
const PUBLIC_METHODS = 'GET, HEAD, OPTIONS'

export async function handle(
  req: Request,
  env: Env,
  ctx: { waitUntil(p: Promise<unknown>): void },
  cache: EdgeCache,
): Promise<Response> {
  const url = new URL(req.url)
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
    return handleAdmin(req, url, env)
  }
  const key = url.pathname.slice(1)

  if (isPublicKey(key)) {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...CORS_PUBLIC, 'Access-Control-Allow-Methods': PUBLIC_METHODS },
      })
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return textResponse(405, 'Method not allowed', { ...CORS_PUBLIC, Allow: PUBLIC_METHODS })
    }
    return publicGet(req, url, key, env, ctx, cache)
  }

  return textResponse(404, 'Not found', CORS_PUBLIC)
}

function isPublicKey(key: string): boolean {
  return key === 'catalog.json' || key.startsWith('books/')
}

async function publicGet(
  req: Request,
  url: URL,
  key: string,
  env: Env,
  ctx: { waitUntil(p: Promise<unknown>): void },
  cache: EdgeCache,
): Promise<Response> {
  const cacheable =
    req.method === 'GET' &&
    url.searchParams.has('v') &&
    !req.headers.has('Range') &&
    url.searchParams.get('download') !== '1'

  if (cacheable) {
    const hit = await cache.match(req)
    if (hit) return hit
  }

  const res = await serveObject(req, url, key, env.BOOKS)
  if (cacheable && res.status === 200) ctx.waitUntil(cache.put(req, res.clone()))
  return res
}

async function serveObject(req: Request, url: URL, key: string, bucket: Bucket): Promise<Response> {
  const head = await bucket.head(key)
  if (!head) return textResponse(404, 'Not found', CORS_PUBLIC)

  const isEpub = key.endsWith('.epub')
  const headers: Record<string, string> = {
    ...CORS_PUBLIC,
    ETag: head.httpEtag,
    'Content-Type': contentTypeFor(key),
    'Cache-Control': cacheControlFor(key, url),
  }

  const ifNoneMatch = req.headers.get('If-None-Match')
  if (ifNoneMatch !== null && ifNoneMatch.split(',').map((s) => s.trim()).includes(head.httpEtag)) {
    return new Response(null, { status: 304, headers })
  }

  let status = 200
  let offset = 0
  let length = head.size
  if (isEpub) {
    headers['Accept-Ranges'] = 'bytes'
    const range = parseRange(req.headers.get('Range'), head.size)
    if (range === 'unsatisfiable') {
      return textResponse(416, 'Range not satisfiable', { ...headers, 'Content-Range': `bytes */${head.size}` })
    }
    if (range) {
      status = 206
      offset = range.start
      length = range.end - range.start + 1
      headers['Content-Range'] = `bytes ${range.start}-${range.end}/${head.size}`
    }
  }
  headers['Content-Length'] = String(length)

  if (isEpub && url.searchParams.get('download') === '1') {
    const name = await downloadName(bucket, key)
    headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(name)}`
  }

  if (req.method === 'HEAD') return new Response(null, { status, headers })

  const obj = await bucket.get(key, status === 206 ? { range: { offset, length } } : undefined)
  if (!obj || !('body' in obj)) return textResponse(404, 'Not found', CORS_PUBLIC)
  return new Response(obj.body, { status, headers })
}

/** Parses a single `bytes=a-b`, `bytes=a-` or `bytes=-n` range. Other syntax is ignored (null). */
function parseRange(header: string | null, size: number): ByteRange | null | 'unsatisfiable' {
  if (header === null) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  const [, a, b] = m
  if (a === '' && b === '') return null
  if (size === 0) return 'unsatisfiable'

  if (a === '') {
    const suffix = Number(b)
    if (suffix === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }

  const start = Number(a)
  if (start >= size) return 'unsatisfiable'
  if (b === '') return { start, end: size - 1 }

  const end = Number(b)
  if (end < start) return null
  return { start, end: Math.min(end, size - 1) }
}

/** Title from `books/<slug>/metadata.json` + `.epub`, else the object's own file name. */
async function downloadName(bucket: Bucket, key: string): Promise<string> {
  const fileName = key.slice(key.lastIndexOf('/') + 1)
  const slug = key.split('/')[1]
  try {
    const meta = await bucket.get(`books/${slug}/metadata.json`)
    if (meta && 'text' in meta) {
      const json: unknown = JSON.parse(await meta.text())
      if (typeof json === 'object' && json !== null && 'title' in json) {
        const title = json.title
        if (typeof title === 'string' && title.trim() !== '') return `${title.trim()}.epub`
      }
    }
  } catch {
    // unreadable or malformed metadata: fall through to the file name
  }
  return fileName
}

function contentTypeFor(key: string): string {
  if (key.endsWith('.json')) return 'application/json; charset=utf-8'
  if (key.endsWith('.jpg')) return 'image/jpeg'
  if (key.endsWith('.epub')) return 'application/epub+zip'
  return 'application/octet-stream'
}

function cacheControlFor(key: string, url: URL): string {
  if (key === 'catalog.json') return 'public, max-age=60'
  if (url.searchParams.has('v')) return 'public, max-age=31536000, immutable'
  return 'public, max-age=300'
}

const ADMIN_KEY = /^(catalog\.json|books\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(cover\.jpg|metadata\.json|\2\.epub))$/
const ADMIN_METHODS = 'GET, PUT, DELETE, OPTIONS'
const ADMIN_ALLOWED_HEADERS = 'Authorization, Content-Type, If-Match'

async function handleAdmin(req: Request, url: URL, env: Env): Promise<Response> {
  const origin = req.headers.get('Origin')
  const allowed = env.ADMIN_ORIGINS.split(',').map((o) => o.trim()).filter((o) => o !== '')
  if (origin !== null && !allowed.includes(origin)) {
    return textResponse(403, 'Forbidden', { Vary: 'Origin' })
  }
  const cors: Record<string, string> = origin !== null ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'Access-Control-Allow-Methods': ADMIN_METHODS,
        'Access-Control-Allow-Headers': ADMIN_ALLOWED_HEADERS,
      },
    })
  }

  if (!isAuthorized(req, env.ADMIN_TOKEN)) {
    return textResponse(401, 'Unauthorized', { ...cors, 'WWW-Authenticate': 'Bearer' })
  }

  if (url.pathname === '/admin/list') {
    if (req.method !== 'GET') return textResponse(405, 'Method not allowed', { ...cors, Allow: 'GET, OPTIONS' })
    return listObjects(url, env.BOOKS, cors)
  }

  let key: string
  try {
    key = decodeURIComponent(url.pathname.slice('/admin/'.length))
  } catch {
    return textResponse(400, 'Bad key', cors)
  }
  if (!ADMIN_KEY.test(key)) return textResponse(400, 'Bad key', cors)

  if (req.method === 'PUT') return putObject(req, key, env.BOOKS, cors)
  if (req.method === 'DELETE') {
    await env.BOOKS.delete(key)
    return new Response(null, { status: 204, headers: cors })
  }
  return textResponse(405, 'Method not allowed', { ...cors, Allow: ADMIN_METHODS })
}

async function putObject(req: Request, key: string, bucket: Bucket, cors: Record<string, string>): Promise<Response> {
  const ifMatch = req.headers.get('If-Match')
  const obj = await bucket.put(key, req.body ?? '', {
    httpMetadata: { contentType: contentTypeFor(key) },
    onlyIf: ifMatch === null ? undefined : { etagMatches: stripQuotes(ifMatch) },
  })
  if (!obj) return textResponse(412, 'Precondition failed', cors)
  return jsonResponse(200, { key, etag: obj.etag, size: obj.size }, cors)
}

async function listObjects(url: URL, bucket: Bucket, cors: Record<string, string>): Promise<Response> {
  const prefix = url.searchParams.get('prefix') ?? undefined
  const cursor = url.searchParams.get('cursor') || undefined
  const page = await bucket.list({ prefix, cursor, limit: 1000 })
  const body: {
    objects: { key: string; size: number; etag: string; uploaded: string }[]
    cursor?: string
  } = {
    objects: page.objects.map((o) => ({
      key: o.key,
      size: o.size,
      etag: o.etag,
      uploaded: o.uploaded.toISOString(),
    })),
  }
  if (page.truncated && page.cursor) body.cursor = page.cursor
  return jsonResponse(200, body, cors)
}

/** Constant-time comparison of `Bearer <token>`. An empty configured token never matches. */
function isAuthorized(req: Request, token: string): boolean {
  if (token === '') return false
  const header = req.headers.get('Authorization') ?? ''
  const expected = `Bearer ${token}`
  let diff = header.length ^ expected.length
  const n = Math.max(header.length, expected.length)
  for (let i = 0; i < n; i++) {
    diff |= (header.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0)
  }
  return diff === 0
}

function stripQuotes(etag: string): string {
  return etag.replace(/^"|"$/g, '')
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function textResponse(status: number, text: string, headers: Record<string, string>): Response {
  return new Response(text, { status, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } })
}
