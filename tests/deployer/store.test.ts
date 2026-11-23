import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminError, type AdminClient } from '../../deployer/src/admin-client'
import { createStore, type StoreDeps } from '../../deployer/src/store'
import { restoreOnline, setOnline } from './ui-fakes'
import type { EpubMeta } from '../../deployer/src/epub-meta'
import type { Catalog, Metadata } from '../../deployer/src/types'

afterEach(() => restoreOnline())

const TOKEN_KEY = 'deployer.token'
const BASE = 'https://worker.example'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

function metadata(id: string, title = id.toUpperCase()): Metadata {
  return {
    schema: 1,
    id,
    title,
    author: 'Vong Ngữ',
    genres: [],
    description: '',
    language: 'vi',
    epub: `${id}.epub`,
    size: 10,
    md5: `md5-${id}`,
    updatedAt: '2026-11-01T00:00:00.000Z',
  }
}

function catalogJson(ids: string[]): string {
  const catalog: Catalog = { schema: 1, generatedAt: '2026-11-01T00:00:00.000Z', books: ids.map((id) => metadata(id)) }
  return JSON.stringify(catalog)
}

/**
 * In-memory Worker: an object map behind AdminClient (with ETag-checked catalog.json, paged
 * list, delete) and a public fetch over the same map. Records deletes.
 */
function fakeWorker(initial: Record<string, string> = {}, pageSize = 100) {
  const objects = new Map(Object.entries(initial))
  const dels: string[] = []
  let etag: string | null = objects.has('catalog.json') ? '"e0"' : null
  let version = 0

  const client: AdminClient = {
    check: vi.fn(async () => undefined),
    getCatalog: vi.fn(async () => {
      const raw = objects.get('catalog.json')
      if (raw === undefined) return { catalog: { schema: 1 as const, generatedAt: '', books: [] }, etag: null }
      return { catalog: JSON.parse(raw) as Catalog, etag }
    }),
    put: vi.fn(async (key, body, opts = {}) => {
      if (key === 'catalog.json' && (opts.ifMatch ?? null) !== etag) throw new AdminError('conflict', 412)
      const text = typeof body === 'string' ? body : await body.text()
      objects.set(key, text)
      if (key === 'catalog.json') etag = `"e${++version}"`
      return { etag: `"x${++version}"` }
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
    const raw = objects.get(key)
    return raw === undefined ? new Response(null, { status: 404 }) : new Response(raw, { status: 200 })
  }) as unknown as typeof globalThis.fetch

  return { client, objects, dels, fetch }
}

function epubFile(name: string): File {
  return new File(['PK'], name, { type: 'application/epub+zip' })
}

function fakeMeta(title: string): EpubMeta {
  return { title, author: 'Vong Ngữ', genres: [], description: '', language: 'vi', cover: null }
}

/** Store wired to a fake Worker; md5 and cover are constant, readMeta uses the file name. */
function storeWith(worker: ReturnType<typeof fakeWorker>, storage = memoryStorage(), readMeta?: (f: File) => Promise<EpubMeta>) {
  return createStore({
    createClient: () => worker.client,
    readMeta: readMeta ?? (async (f) => fakeMeta(f.name.replace(/\.epub$/, ''))),
    md5: async () => 'hash',
    makeCover: async (cover) => ({ blob: new Blob(['jpg']), generated: cover === null }),
    storage,
    env: { VITE_R2_BASE_URL: BASE },
    fetch: worker.fetch,
  })
}

describe('deployer.connect.ok', () => {
  it('deployer.connect.ok: a valid URL and token give state ok and the catalog book count', async () => {
    const worker = fakeWorker({ 'catalog.json': catalogJson(['a', 'b', 'c']) })
    const s = storeWith(worker)
    s.conn.value = { ...s.conn.value, token: 'secret', remember: false }

    await s.connect()

    expect(s.conn.value.state).toBe('ok')
    expect(s.conn.value.error).toBeUndefined()
    expect(worker.client.check).toHaveBeenCalledTimes(1)
    expect(s.catalog.value.map((b) => b.id)).toEqual(['a', 'b', 'c'])
  })

  it('deployer.connect.ok: the URL pre-filled from VITE_R2_BASE_URL and the token reach the client factory', async () => {
    const createClient = vi.fn(() => fakeWorker().client)
    const s = createStore({ createClient, storage: memoryStorage(), env: { VITE_R2_BASE_URL: BASE } })
    expect(s.conn.value.baseUrl).toBe(BASE)
    s.conn.value = { ...s.conn.value, token: 'secret' }

    await s.connect()

    expect(createClient).toHaveBeenCalledWith(BASE, 'secret')
  })
})

describe('deployer.connect.bad-token', () => {
  it('deployer.connect.bad-token: a 401 gives state error with "Sai mã quản trị"', async () => {
    const worker = fakeWorker({ 'catalog.json': catalogJson(['a']) })
    worker.client.check = vi.fn(async () => {
      throw new AdminError('auth', 401)
    })
    const s = storeWith(worker)
    s.conn.value = { ...s.conn.value, token: 'wrong', remember: false }

    await s.connect()

    expect(s.conn.value.state).toBe('error')
    expect(s.conn.value.error).toBe('Sai mã quản trị')
  })
})

describe('deployer.connect.forget', () => {
  it('deployer.connect.forget: remember unticked leaves no token in storage', async () => {
    const storage = memoryStorage({ [TOKEN_KEY]: 'old' })
    const worker = fakeWorker({ 'catalog.json': catalogJson([]) })
    const s = storeWith(worker, storage)
    s.conn.value = { ...s.conn.value, token: 'secret', remember: false }

    await s.connect()

    expect(storage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('deployer.connect.forget: after a reload without remember the token field is empty', async () => {
    const storage = memoryStorage()
    const worker = fakeWorker({ 'catalog.json': catalogJson([]) })
    const first = storeWith(worker, storage)
    first.conn.value = { ...first.conn.value, token: 'secret', remember: false }
    await first.connect()

    const reloaded = storeWith(worker, storage)

    expect(reloaded.conn.value.token).toBe('')
    expect(reloaded.conn.value.remember).toBe(false)
  })

  it('deployer.connect.forget: remember ticked stores the token and restores it on reload', async () => {
    const storage = memoryStorage()
    const worker = fakeWorker({ 'catalog.json': catalogJson([]) })
    const first = storeWith(worker, storage)
    first.conn.value = { ...first.conn.value, token: 'secret', remember: true }

    await first.connect()

    expect(storage.getItem(TOKEN_KEY)).toBe('secret')
    const reloaded = storeWith(worker, storage)
    expect(reloaded.conn.value.token).toBe('secret')
    expect(reloaded.conn.value.remember).toBe(true)
  })
})

describe('deployer.pick.many', () => {
  it('deployer.pick.many: 12 EPUBs and 1 PDF give 12 drafts and the skip notice', async () => {
    const worker = fakeWorker({ 'catalog.json': catalogJson([]) })
    const s = storeWith(worker)
    const files = [
      ...Array.from({ length: 12 }, (_, i) => epubFile(`truyen-${i + 1}.epub`)),
      new File(['%PDF'], 'sach.pdf', { type: 'application/pdf' }),
    ]

    await s.addFiles(files)

    expect(s.drafts.value).toHaveLength(12)
    expect(s.drafts.value.every((d) => d.state === 'ready')).toBe(true)
    expect(s.notice.value).toBe('Bỏ qua 1 tệp không phải EPUB')
  })

  it('deployer.pick.many: at most 2 files are parsed at the same time', async () => {
    const worker = fakeWorker({ 'catalog.json': catalogJson([]) })
    let active = 0
    let peak = 0
    const readMeta = async (f: File) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      active--
      return fakeMeta(f.name.replace(/\.epub$/, ''))
    }
    const s = storeWith(worker, memoryStorage(), readMeta)

    await s.addFiles(Array.from({ length: 12 }, (_, i) => epubFile(`truyen-${i + 1}.epub`)))

    expect(peak).toBe(2)
    expect(s.drafts.value).toHaveLength(12)
  })

  it('deployer.pick.many: an unreadable EPUB becomes an error draft and is not selected', async () => {
    const worker = fakeWorker({ 'catalog.json': catalogJson([]) })
    const readMeta = async (): Promise<EpubMeta> => {
      throw new Error('không đọc được EPUB')
    }
    const s = storeWith(worker, memoryStorage(), readMeta)

    await s.addFiles([epubFile('hong.epub')])

    expect(s.drafts.value[0]).toMatchObject({ state: 'error', error: 'không đọc được EPUB', selected: false })
  })
})

describe('deployer.review.edit', () => {
  it('deployer.review.edit: editing the title of a draft moves its slug when the slug was not hand-edited', async () => {
    const worker = fakeWorker({ 'catalog.json': catalogJson([]) })
    const s = storeWith(worker)
    await s.addFiles([epubFile('dau.epub')])
    const key = s.drafts.value[0].key

    s.updateDraft(key, { title: 'Đấu Phá Thương Khung' })

    expect(s.drafts.value[0].slug).toBe('dau-pha-thuong-khung')
    expect(s.drafts.value[0].slugEdited).toBe(false)
  })

  it('deployer.review.edit: a hand-typed slug of another book unticks the draft', async () => {
    const worker = fakeWorker({ 'catalog.json': catalogJson(['dau-pha']) })
    const s = storeWith(worker)
    await s.connect()
    await s.addFiles([epubFile('phàm.epub')])
    const key = s.drafts.value[0].key
    s.updateDraft(key, { title: 'Phàm Nhân' })
    expect(s.drafts.value[0].selected).toBe(true)

    s.updateDraft(key, { slug: 'dau-pha' })

    expect(s.drafts.value[0].slugEdited).toBe(true)
    expect(s.drafts.value[0].selected).toBe(false)
  })
})

describe('deployer.review.edit: selection follows status', () => {
  it('deployer.review.edit: an edit that makes the draft "Đã có" unticks it', async () => {
    // Catalog book dau-pha has the same md5 (the stub md5 is "hash") as the draft.
    const worker = fakeWorker({
      'catalog.json': JSON.stringify({
        schema: 1,
        generatedAt: '2026-11-01T00:00:00.000Z',
        books: [{ ...metadata('dau-pha', 'Đấu Phá'), md5: 'hash' }],
      } satisfies Catalog),
    })
    const s = storeWith(worker)
    await s.connect()
    await s.addFiles([epubFile('Phàm Nhân.epub')])
    const key = s.drafts.value[0].key
    expect(s.drafts.value[0]).toMatchObject({ status: 'new', selected: true })

    s.updateDraft(key, { title: 'Đấu Phá' })

    expect(s.drafts.value[0]).toMatchObject({ slug: 'dau-pha', status: 'exists', selected: false })

    s.updateDraft(key, { title: 'Phàm Nhân' })

    expect(s.drafts.value[0]).toMatchObject({ slug: 'pham-nhan', status: 'new', selected: true })
  })

  it('deployer.review.edit: an edit that keeps the status keeps the owner choice', async () => {
    const worker = fakeWorker({ 'catalog.json': catalogJson([]) })
    const s = storeWith(worker)
    await s.addFiles([epubFile('dau.epub')])
    const key = s.drafts.value[0].key
    s.updateDraft(key, { selected: false })

    s.updateDraft(key, { title: 'Đấu Phá Thương Khung' })

    expect(s.drafts.value[0]).toMatchObject({ status: 'new', selected: false })
  })
})

describe('deployer.upload.offline: store signal', () => {
  /** Window stand-in that keeps the 'online' listener so a test can fire it. */
  function fakeWin() {
    const listeners = new Map<string, () => void>()
    return {
      win: { addEventListener: (type: string, fn: () => void) => void listeners.set(type, fn) },
      fire: (type: string) => listeners.get(type)?.(),
    }
  }

  it('deployer.upload.offline: an offline upload sets uploadError, not notice, and sends nothing', async () => {
    const worker = fakeWorker({ 'catalog.json': catalogJson([]) })
    const w = fakeWin()
    const s = createStore({
      createClient: () => worker.client,
      readMeta: async (f) => fakeMeta(f.name.replace(/\.epub$/, '')),
      md5: async () => 'hash',
      makeCover: async (cover) => ({ blob: new Blob(['jpg']), generated: cover === null }),
      storage: memoryStorage(),
      env: { VITE_R2_BASE_URL: BASE },
      fetch: worker.fetch,
      win: w.win,
    })
    await s.connect()
    await s.addFiles([epubFile('pham.epub')])
    setOnline(false)

    await s.startUpload()

    expect(s.uploadError.value).toBe('Cần kết nối mạng để tải lên')
    expect(s.notice.value).toBeNull()
    expect(worker.client.put).not.toHaveBeenCalled()
    expect(s.drafts.value[0].state).toBe('ready')

    // Starting an upload clears it; a failing start sets it again.
    s.uploadError.value = null
    s.uploadError.value = 'x'
    await s.startUpload()
    expect(s.uploadError.value).toBe('Cần kết nối mạng để tải lên')

    // Coming back online clears it through the window 'online' listener.
    restoreOnline()
    w.fire('online')
    expect(s.uploadError.value).toBeNull()
  })

  it('deployer.upload.offline: starting an upload clears a previous uploadError', async () => {
    const worker = fakeWorker({ 'catalog.json': catalogJson([]) })
    const s = storeWith(worker)
    await s.connect()
    await s.addFiles([epubFile('pham.epub')])
    s.uploadError.value = 'Cần kết nối mạng để tải lên'

    await s.startUpload()

    expect(s.uploadError.value).toBeNull()
    expect(s.drafts.value[0].state).toBe('done')
  })
})

describe('deployer.upload.layout: store wiring', () => {
  it('deployer.upload.layout: startUpload writes the three files and the catalog, then refreshes the catalog', async () => {
    const worker = fakeWorker({ 'catalog.json': catalogJson([]) })
    const s = storeWith(worker)
    await s.connect()
    await s.addFiles([epubFile('pham.epub')])

    await s.startUpload()

    expect(worker.objects.has('books/pham/pham.epub')).toBe(true)
    expect(worker.objects.has('books/pham/cover.jpg')).toBe(true)
    expect(worker.objects.has('books/pham/metadata.json')).toBe(true)
    expect(s.drafts.value[0].state).toBe('done')
    expect(s.catalog.value.map((b) => b.id)).toEqual(['pham'])
  })
})

describe('deployer.upload.partial-failure: store retry', () => {
  it('deployer.upload.partial-failure: retry re-uploads the failed book only', async () => {
    const worker = fakeWorker({ 'catalog.json': catalogJson([]) })
    const s = storeWith(worker)
    await s.connect()
    await s.addFiles([epubFile('a.epub'), epubFile('b.epub')])
    const failing = worker.client.put
    worker.client.put = vi.fn(async (key, body, opts) => {
      if (key === 'books/b/b.epub') throw new AdminError('http', 500)
      return failing(key, body, opts)
    })
    await s.startUpload()
    const bKey = s.drafts.value.find((d) => d.slug === 'b')!.key
    expect(s.drafts.value.find((d) => d.key === bKey)?.state).toBe('error')

    worker.client.put = failing
    await s.retry(bKey)

    expect(s.drafts.value.find((d) => d.key === bKey)?.state).toBe('done')
    expect(s.catalog.value.map((b) => b.id).sort()).toEqual(['a', 'b'])
  })
})

describe('deployer.manage.delete', () => {
  it('deployer.manage.delete: deletes the 3 objects of the book and removes it from the catalog', async () => {
    const worker = fakeWorker({
      'catalog.json': catalogJson(['a', 'b', 'c']),
      'books/b/b.epub': 'x',
      'books/b/cover.jpg': 'x',
      'books/b/metadata.json': 'x',
    })
    const s = storeWith(worker)
    await s.connect()

    await s.deleteBook('b')

    expect(worker.dels).toEqual(['books/b/b.epub', 'books/b/cover.jpg', 'books/b/metadata.json'])
    expect(s.catalog.value.map((b) => b.id)).toEqual(['a', 'c'])
    expect(JSON.parse(worker.objects.get('catalog.json')!).books.map((b: Metadata) => b.id)).toEqual(['a', 'c'])
  })
})

describe('deployer.manage.rebuild', () => {
  it('deployer.manage.rebuild: the catalog lists every book whose metadata.json exists, across pages', async () => {
    const worker = fakeWorker(
      {
        'catalog.json': catalogJson(['a', 'b']),
        'books/a/metadata.json': JSON.stringify(metadata('a')),
        'books/a/a.epub': 'x',
        'books/a/cover.jpg': 'x',
        'books/b/metadata.json': JSON.stringify(metadata('b')),
        'books/b/b.epub': 'x',
        'books/b/cover.jpg': 'x',
        'books/c/metadata.json': JSON.stringify(metadata('c')),
        'books/c/c.epub': 'x',
        'books/c/cover.jpg': 'x',
      },
      2,
    )
    const s = storeWith(worker)
    await s.connect()

    await s.rebuildCatalog()

    const written = JSON.parse(worker.objects.get('catalog.json')!) as Catalog
    expect(written.books.map((b) => b.id)).toEqual(['a', 'b', 'c'])
    expect(s.catalog.value.map((b) => b.id)).toEqual(['a', 'b', 'c'])
    expect(worker.fetch).toHaveBeenCalledTimes(3)
  })
})

describe('deployer.upload.progress: store', () => {
  it('deployer.upload.progress: the overall counter reaches the number of ticked books', async () => {
    const worker = fakeWorker({ 'catalog.json': catalogJson([]) })
    const s = storeWith(worker)
    await s.connect()
    await s.addFiles([epubFile('a.epub'), epubFile('b.epub')])

    await s.startUpload()

    expect(s.uploading.value).toMatchObject({ running: false, done: 2, total: 2 })
  })
})

describe('deployer.cover.generated: redraw on edit', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /** Store whose makeCover is a spy; each call returns a fresh Blob tagged with its title. */
  function coverStore(makeCover: StoreDeps['makeCover'], readMeta?: (f: File) => Promise<EpubMeta>) {
    const worker = fakeWorker({ 'catalog.json': catalogJson([]) })
    return createStore({
      createClient: () => worker.client,
      readMeta: readMeta ?? (async (f) => fakeMeta(f.name.replace(/\.epub$/, ''))),
      md5: async () => 'hash',
      makeCover,
      storage: memoryStorage(),
      env: { VITE_R2_BASE_URL: BASE },
      fetch: worker.fetch,
    })
  }

  function tagged(): NonNullable<StoreDeps['makeCover']> {
    return vi.fn(async (_cover, title) => ({ blob: new Blob([`cover:${title}`]), generated: true }))
  }

  it('deployer.cover.generated: editing the title redraws a generated cover', async () => {
    const makeCover = tagged()
    const s = coverStore(makeCover)
    await s.addFiles([epubFile('dau.epub')])
    const key = s.drafts.value[0].key
    const first = s.drafts.value[0].cover

    s.updateDraft(key, { title: 'Đấu Phá Thương Khung' })
    await vi.advanceTimersByTimeAsync(300)

    expect(makeCover).toHaveBeenLastCalledWith(null, 'Đấu Phá Thương Khung', 'Vong Ngữ')
    expect(s.drafts.value[0].cover).not.toBe(first)
    expect(s.drafts.value[0].coverGenerated).toBe(true)
  })

  it('deployer.cover.generated: editing the author redraws a generated cover', async () => {
    const makeCover = tagged()
    const s = coverStore(makeCover)
    await s.addFiles([epubFile('dau.epub')])
    const key = s.drafts.value[0].key

    s.updateDraft(key, { author: 'Thiên Tàm' })
    await vi.advanceTimersByTimeAsync(300)

    expect(makeCover).toHaveBeenLastCalledWith(null, 'dau', 'Thiên Tàm')
  })

  it('deployer.cover.generated: a burst of edits is debounced to one redraw with the latest title', async () => {
    const makeCover = tagged()
    const s = coverStore(makeCover)
    await s.addFiles([epubFile('dau.epub')])
    const key = s.drafts.value[0].key
    const parses = makeCover.mock.calls.length

    s.updateDraft(key, { title: 'A' })
    await vi.advanceTimersByTimeAsync(200)
    s.updateDraft(key, { title: 'AB' })
    await vi.advanceTimersByTimeAsync(200)
    expect(makeCover).toHaveBeenCalledTimes(parses)

    await vi.advanceTimersByTimeAsync(100)
    expect(makeCover).toHaveBeenCalledTimes(parses + 1)
    expect(makeCover).toHaveBeenLastCalledWith(null, 'AB', 'Vong Ngữ')
  })

  it('deployer.cover.generated: a redraw that finishes after a newer edit is ignored', async () => {
    const resolvers: Array<(v: { blob: Blob; generated: boolean }) => void> = []
    const makeCover = vi.fn((_cover: Blob | null, title: string) => {
      if (title === 'dau') return Promise.resolve({ blob: new Blob(['parse']), generated: true })
      return new Promise<{ blob: Blob; generated: boolean }>((resolve) => resolvers.push(resolve))
    })
    const s = coverStore(makeCover)
    await s.addFiles([epubFile('dau.epub')])
    const key = s.drafts.value[0].key
    const original = s.drafts.value[0].cover
    const forA = new Blob(['A'])
    const forB = new Blob(['B'])

    s.updateDraft(key, { title: 'A' })
    await vi.advanceTimersByTimeAsync(300)
    s.updateDraft(key, { title: 'B' })
    // The redraw for 'A' finishes after the owner has already typed 'B': it must not land.
    resolvers[0]({ blob: forA, generated: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(s.drafts.value[0].cover).toBe(original)

    await vi.advanceTimersByTimeAsync(300)
    resolvers[1]({ blob: forB, generated: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(s.drafts.value[0].cover).toBe(forB)
  })

  it('deployer.cover.epub: an EPUB cover is never regenerated on a title or author edit', async () => {
    const makeCover = vi.fn(async () => ({ blob: new Blob(['epub-cover']), generated: false }))
    const s = coverStore(makeCover, async (f) => ({ ...fakeMeta(f.name.replace(/\.epub$/, '')), cover: new Blob(['img']) }))
    await s.addFiles([epubFile('dau.epub')])
    const key = s.drafts.value[0].key
    const epubCover = s.drafts.value[0].cover

    s.updateDraft(key, { title: 'Đấu Phá' })
    s.updateDraft(key, { author: 'Thiên Tàm' })
    await vi.advanceTimersByTimeAsync(1000)

    expect(makeCover).toHaveBeenCalledTimes(1)
    expect(s.drafts.value[0].cover).toBe(epubCover)
    expect(s.drafts.value[0].coverGenerated).toBe(false)
  })
})
