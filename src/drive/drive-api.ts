import type { DriveConfig } from '../config'

export type DriveErrorKind = 'config' | 'not-found' | 'rate-limit' | 'network' | 'http'

export const DRIVE_ERROR_MESSAGES: Record<DriveErrorKind, (status?: number) => string> = {
  config: () => 'Cấu hình Google Drive không hợp lệ',
  'not-found': () => 'Không tìm thấy thư mục Google Drive (thư mục cần được chia sẻ công khai)',
  'rate-limit': () => 'Google Drive đang giới hạn truy cập, thử lại sau',
  network: () => 'Không kết nối được Google Drive',
  http: (s) => `Lỗi Google Drive (${s})`,
}

export class DriveError extends Error {
  readonly kind: DriveErrorKind
  readonly status?: number

  constructor(kind: DriveErrorKind, status?: number) {
    super(DRIVE_ERROR_MESSAGES[kind](status))
    this.name = 'DriveError'
    this.kind = kind
    this.status = status
  }
}

export interface DriveFile {
  id: string
  name: string
  size?: string
  modifiedTime: string
  md5Checksum?: string
  mimeType: string
}

export interface DriveApi {
  listPage(pageToken?: string): Promise<{ files: DriveFile[]; nextPageToken?: string }>
  mediaUrl(id: string): string
  downloadUrl(id: string): string
  fetchRange(id: string, start: number, endInclusive: number): Promise<Uint8Array>
  fetchBook(
    id: string,
    opts: { size: number; onProgress?: (pct: number) => void; signal?: AbortSignal },
  ): Promise<Blob>
}

const API_BASE = 'https://www.googleapis.com/drive/v3/files'
const EPUB_MIME = 'application/epub+zip'
const CONFIG_REASONS = new Set([
  'keyInvalid',
  'API_KEY_HTTP_REFERRER_BLOCKED',
  'API_KEY_INVALID',
  'accessNotConfigured',
  'forbidden',
  'SERVICE_DISABLED',
])
const RATE_LIMIT_REASONS = new Set(['userRateLimitExceeded', 'rateLimitExceeded'])

interface ErrorBody {
  error?: {
    status?: unknown
    errors?: Array<{ reason?: unknown }>
    details?: Array<{ reason?: unknown }>
  }
}

function isAbortError(e: unknown): boolean {
  // DOMException is not always an Error instance across realms (jsdom, workers), so check by name.
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError'
}

async function readErrorBody(res: Response): Promise<ErrorBody> {
  try {
    const parsed: unknown = JSON.parse(await res.text())
    return parsed && typeof parsed === 'object' ? (parsed as ErrorBody) : {}
  } catch {
    return {}
  }
}

async function toDriveError(res: Response): Promise<DriveError> {
  const body = await readErrorBody(res)
  const err = body.error ?? {}
  const reasons: string[] = []
  for (const e of err.errors ?? []) {
    if (typeof e?.reason === 'string') reasons.push(e.reason)
  }
  for (const d of err.details ?? []) {
    if (typeof d?.reason === 'string') reasons.push(d.reason)
  }
  if (typeof err.status === 'string') reasons.push(err.status)

  const status = res.status
  if ((status === 400 || status === 403) && reasons.some((r) => CONFIG_REASONS.has(r))) {
    return new DriveError('config', status)
  }
  if (status === 404) return new DriveError('not-found', status)
  if (status === 429 || (status === 403 && reasons.some((r) => RATE_LIMIT_REASONS.has(r)))) {
    return new DriveError('rate-limit', status)
  }
  return new DriveError('http', status)
}

export function createDriveApi(
  cfg: DriveConfig,
  fetchFn: typeof fetch = (...a) => fetch(...a),
): DriveApi {
  const key = encodeURIComponent(cfg.apiKey)
  const fullBodies = new Map<string, Uint8Array>()

  /** Performs a fetch, mapping transport failures to DriveError (AbortError is rethrown). */
  async function send(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetchFn(url, init)
    } catch (e) {
      if (isAbortError(e)) throw e
      throw new DriveError('network')
    }
  }

  /** Sends a request and throws a mapped DriveError for non-ok responses. */
  async function request(url: string, init?: RequestInit): Promise<Response> {
    const res = await send(url, init)
    if (!res.ok) throw await toDriveError(res)
    return res
  }

  function mediaUrl(id: string): string {
    return `${API_BASE}/${encodeURIComponent(id)}?alt=media&key=${key}`
  }

  return {
    async listPage(pageToken?: string) {
      const params = new URLSearchParams({
        q: `'${cfg.folderId}' in parents and trashed = false`,
        fields: 'nextPageToken,files(id,name,size,modifiedTime,md5Checksum,mimeType)',
        pageSize: '200',
        orderBy: 'name',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        key: cfg.apiKey,
      })
      if (pageToken !== undefined) params.set('pageToken', pageToken)
      const res = await request(`${API_BASE}?${params.toString()}`)
      const json = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string }
      return { files: json.files ?? [], nextPageToken: json.nextPageToken }
    },

    mediaUrl,

    downloadUrl(id: string): string {
      return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`
    },

    async fetchRange(id, start, endInclusive) {
      const cached = fullBodies.get(id)
      if (cached) return cached.slice(start, endInclusive + 1)

      const res = await request(mediaUrl(id), {
        headers: { Range: `bytes=${start}-${endInclusive}` },
      })
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (res.status === 206) return bytes
      // Server ignored Range and sent the whole file: keep it for later ranges.
      fullBodies.set(id, bytes)
      return bytes.slice(start, endInclusive + 1)
    },

    async fetchBook(id, opts) {
      const { size, onProgress, signal } = opts
      const res = await request(mediaUrl(id), { signal })

      if (res.body === null) {
        const blob = await res.blob()
        onProgress?.(100)
        return new Blob([blob], { type: EPUB_MIME })
      }

      const reader = res.body.getReader()
      const chunks: Uint8Array<ArrayBuffer>[] = []
      let loaded = 0
      let lastPct = -1
      for (;;) {
        let step: ReadableStreamReadResult<Uint8Array<ArrayBuffer>>
        try {
          step = await reader.read()
        } catch (e) {
          // A connection drop mid-stream is a network failure; an abort is the caller's choice.
          if (isAbortError(e)) throw e
          throw new DriveError('network')
        }
        if (step.done) break
        const value = step.value
        chunks.push(value)
        loaded += value.byteLength
        const pct = size > 0 ? Math.min(100, Math.floor((loaded / size) * 100)) : 100
        if (onProgress && pct > lastPct) {
          lastPct = pct
          onProgress(pct)
        }
      }
      return new Blob(chunks, { type: EPUB_MIME })
    },
  }
}
