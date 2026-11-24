import { vi } from 'vitest'
import { AdminError, type AdminClient } from '../../deployer/src/admin-client'
import { createStore, type StoreDeps } from '../../deployer/src/store'
import type { EpubMeta } from '../../deployer/src/epub-meta'
import type { Catalog, Metadata } from '../../deployer/src/types'
import { titleFromName } from '../../src/domain/title'

export const BASE = 'https://worker.example'

export function metadata(id: string, title = id.toUpperCase(), over: Partial<Metadata> = {}): Metadata {
  return {
    schema: 1,
    id,
    title,
    author: 'Vong Ngữ',
    genres: [],
    description: '',
    note: '',
    language: 'vi',
    epub: `${id}.epub`,
    size: 10,
    md5: `md5-${id}`,
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...over,
  }
}

export function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    has: (k: string) => data.has(k),
  }
}

/** A File whose bytes are `size` zeros; `md5` in the fake store is derived from the name. */
export function epubFile(name: string, size = 10): File {
  return new File([new Uint8Array(size)], name, { type: 'application/epub+zip' })
}

export interface FakeWorkerOptions {
  books?: Metadata[]
  /** Extra objects (key → text) present in the bucket before the test starts. */
  objects?: Record<string, string>
  /** Page size of `list`; small values exercise paging. */
  pageSize?: number
  /** When set, `check()` rejects with this error. */
  checkError?: AdminError
  /** Metadata fetch gate: awaited before a public GET of `key` answers. */
  fetchGate?: (key: string) => Promise<void> | undefined
}

export interface FakeWorker {
  client: AdminClient
  objects: Map<string, string>
  /** Keys whose PUT fails with an HTTP 500 while present in this set. */
  failing: Set<string>
  puts: string[]
  dels: string[]
  fetch: typeof fetch
}

/** In-memory Worker behind AdminClient plus a public fetch over the same object map. */
export function fakeWorker(opts: FakeWorkerOptions = {}): FakeWorker {
  const objects = new Map<string, string>(Object.entries(opts.objects ?? {}))
  if (opts.books) {
    const catalog: Catalog = { schema: 1, generatedAt: '2026-11-01T00:00:00.000Z', books: opts.books }
    objects.set('catalog.json', JSON.stringify(catalog))
  }
  const failing = new Set<string>()
  const puts: string[] = []
  const dels: string[] = []
  const pageSize = opts.pageSize ?? 100

  const client: AdminClient = {
    check: vi.fn(async () => {
      if (opts.checkError) throw opts.checkError
    }),
    getCatalog: vi.fn(async () => {
      const raw = objects.get('catalog.json')
      if (raw === undefined) return { catalog: { schema: 1 as const, generatedAt: '', books: [] }, etag: null }
      return { catalog: JSON.parse(raw) as Catalog, etag: '"e"' }
    }),
    put: vi.fn(async (key, body) => {
      if (failing.has(key)) throw new AdminError('http', 500)
      const text = typeof body === 'string' ? body : await body.text()
      objects.set(key, text)
      puts.push(key)
      return { etag: '"x"' }
    }),
    del: vi.fn(async (key) => {
      dels.push(key)
      objects.delete(key)
    }),
    list: vi.fn(async (prefix, cursor) => {
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort()
      const start = cursor ? Number(cursor) : 0
      const next = start + pageSize
      return {
        objects: keys.slice(start, next).map((key) => ({ key })),
        ...(next < keys.length ? { cursor: String(next) } : {}),
      }
    }),
  }

  const fetch = vi.fn(async (url: string | URL) => {
    const key = decodeURIComponent(new URL(String(url)).pathname.slice(1))
    await opts.fetchGate?.(key)
    const body = objects.get(key)
    if (body === undefined) return new Response('', { status: 404 })
    return new Response(body, { status: 200 })
  })

  return { client, objects, failing, puts, dels, fetch: fetch as unknown as typeof globalThis.fetch }
}

/** Store wired to a fake Worker, a memory token storage and stub EPUB/cover/md5 functions. */
export function makeStore(
  worker: FakeWorker,
  deps: Partial<StoreDeps> & { storage?: StoreDeps['storage'] } = {},
) {
  return createStore({
    createClient: () => worker.client,
    readMeta: async (file: File): Promise<EpubMeta> => ({
      title: titleFromName(file.name),
      author: 'Vong Ngữ',
      genres: [],
      description: '',
      language: 'vi',
      cover: null,
    }),
    md5: async (blob: Blob) => `md5:${(blob as File).name ?? blob.size}`,
    makeCover: async (cover) => ({ blob: new Blob(['jpg'], { type: 'image/jpeg' }), generated: cover === null }),
    storage: memoryStorage(),
    env: { VITE_R2_BASE_URL: BASE },
    fetch: worker.fetch,
    ...deps,
  })
}

/** Drafts from the store, after every queued parse has finished. */
export async function settle(store: ReturnType<typeof makeStore>): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (store.drafts.value.every((d) => d.state !== 'parsing')) return
    await new Promise((r) => setTimeout(r, 0))
  }
  throw new Error('drafts did not settle')
}

/** jsdom has no object URLs; give the cards something to call. */
export function installObjectUrl(): void {
  URL.createObjectURL = vi.fn(() => 'blob:fake')
  URL.revokeObjectURL = vi.fn()
}

export function removeObjectUrl(): void {
  delete (URL as { createObjectURL?: unknown }).createObjectURL
  delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL
}

/** Overrides navigator.onLine for the test; `restoreOnline` puts the jsdom default back. */
export function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
}

export function restoreOnline(): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
}
