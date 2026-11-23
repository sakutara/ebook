import { describe, expect, it } from 'vitest'
import { AdminError, type AdminClient, type PutOptions } from '../../deployer/src/admin-client'
import { runUpload } from '../../deployer/src/upload-queue'
import { toMetadata, type Draft } from '../../deployer/src/draft'
import type { Catalog } from '../../deployer/src/types'

const NOW = new Date('2026-11-24T10:00:00.000Z')

function draft(slug: string, over: Partial<Draft> = {}): Draft {
  const base: Draft = {
    key: `k-${slug}`,
    file: new File(['epub-bytes'], `${slug}.epub`),
    state: 'ready',
    title: slug,
    author: 'Vong Ngữ',
    genres: ['Tiên hiệp'],
    description: '',
    language: 'vi',
    slug,
    slugEdited: false,
    size: 10,
    md5: `md5-${slug}`,
    cover: new Blob(['jpeg-bytes']),
    coverGenerated: false,
    status: 'new',
    selected: true,
  }
  return { ...base, ...over }
}

interface FakeOptions {
  /** Keys whose PUT rejects with an HTTP 500. */
  fail?: (key: string) => boolean
  /** Called with the PUT options; lets a test drive onProgress. */
  onPut?: (key: string, body: Blob | string, opts: PutOptions) => void
}

/**
 * In-memory bucket behind AdminClient. Records every PUT key in order and keeps a real
 * catalog.json with an ETag so the merge path runs unmodified.
 */
function fakeClient(opts: FakeOptions = {}) {
  const puts: string[] = []
  let catalog: Catalog = { schema: 1, generatedAt: '', books: [] }
  let etag: string | null = null
  let version = 0

  const client: AdminClient = {
    check: async () => undefined,
    getCatalog: async () => ({ catalog, etag }),
    put: async (key, body, putOpts = {}) => {
      puts.push(key)
      opts.onPut?.(key, body, putOpts)
      if (opts.fail?.(key)) throw new AdminError('http', 500)
      if (key === 'catalog.json') {
        if ((putOpts.ifMatch ?? null) !== etag) throw new AdminError('conflict', 412)
        catalog = JSON.parse(body as string) as Catalog
        etag = `"e${++version}"`
      }
      return { etag: `"x${++version}"` }
    },
    del: async () => undefined,
    list: async () => ({ objects: [] }),
  }
  return {
    client,
    puts,
    catalogIds: () => catalog.books.map((b) => b.id),
  }
}

/** Folds onDraft patches into one object per draft key, in call order. */
function recorder() {
  const states = new Map<string, Partial<Draft>>()
  const calls: { key: string; patch: Partial<Draft> }[] = []
  const onDraft = (key: string, patch: Partial<Draft>) => {
    calls.push({ key, patch })
    states.set(key, { ...states.get(key), ...patch })
  }
  return { onDraft, states, calls }
}

describe('deployer.upload.layout', () => {
  it('deployer.upload.layout: writes epub, cover, metadata in that order, then catalog.json last', async () => {
    const fake = fakeClient()
    const d = draft('pham-nhan-tu-tien', { title: 'Phàm Nhân Tu Tiên' })
    const rec = recorder()

    const result = await runUpload([d], { client: fake.client, onDraft: rec.onDraft, now: () => NOW })

    expect(fake.puts).toEqual([
      'books/pham-nhan-tu-tien/pham-nhan-tu-tien.epub',
      'books/pham-nhan-tu-tien/cover.jpg',
      'books/pham-nhan-tu-tien/metadata.json',
      'catalog.json',
    ])
    expect(result).toEqual({ done: 1, failed: 0, stopped: false })
    expect(fake.catalogIds()).toEqual(['pham-nhan-tu-tien'])
  })

  it('deployer.upload.layout: metadata.json carries the draft fields with updatedAt = now', async () => {
    let metaBody = ''
    const fake = fakeClient({
      onPut: (key, body) => {
        if (key.endsWith('/metadata.json')) metaBody = body as string
      },
    })
    const d = draft('pham', { title: 'Phàm Nhân' })

    await runUpload([d], { client: fake.client, onDraft: () => undefined, now: () => NOW })

    expect(JSON.parse(metaBody)).toEqual(toMetadata({ ...d }, NOW))
  })
})

describe('deployer.upload.progress', () => {
  it('deployer.upload.progress: half of the book bytes sent shows 50 %', async () => {
    // The metadata JSON is part of the book total, so the epub is sized to exactly half of it:
    // cover is empty and epub bytes == metadata bytes, so a finished epub is 50 % of the book.
    const cover = new Blob([])
    const meta = JSON.stringify(toMetadata(draft('pham', { size: 10, cover }), NOW))
    const metaBytes = new Blob([meta]).size
    const epub = new File([new Uint8Array(metaBytes)], 'pham.epub')
    const d = draft('pham', { file: epub, cover, size: 10 })

    const fake = fakeClient({
      onPut: (key, _body, opts) => {
        if (key.endsWith('.epub')) opts.onProgress?.(epub.size, epub.size)
      },
    })
    const rec = recorder()

    await runUpload([d], { client: fake.client, onDraft: rec.onDraft, now: () => NOW })

    const progress = rec.calls.map((c) => c.patch.progress).filter((p): p is number => p !== undefined)
    expect(progress).toContain(50)
  })

  it('deployer.upload.progress: a finished book reports progress 100 and state done', async () => {
    const fake = fakeClient()
    const rec = recorder()

    await runUpload([draft('a')], { client: fake.client, onDraft: rec.onDraft, now: () => NOW })

    expect(rec.states.get('k-a')).toMatchObject({ state: 'done', progress: 100 })
  })
})

describe('deployer.upload.partial-failure', () => {
  it('deployer.upload.partial-failure: a failed EPUB put marks that book error and the others still upload', async () => {
    const fake = fakeClient({ fail: (key) => key === 'books/b-book/b-book.epub' })
    const rec = recorder()
    const drafts = [draft('a-book'), draft('b-book'), draft('c-book')]

    const result = await runUpload(drafts, { client: fake.client, onDraft: rec.onDraft, now: () => NOW })

    expect(result).toEqual({ done: 2, failed: 1, stopped: false })
    expect(rec.states.get('k-a-book')).toMatchObject({ state: 'done' })
    expect(rec.states.get('k-b-book')).toMatchObject({ state: 'error', progress: undefined })
    expect(rec.states.get('k-b-book')?.error).toBe('Lỗi Worker (500)')
    expect(rec.states.get('k-c-book')).toMatchObject({ state: 'done' })
    expect(fake.catalogIds()).toEqual(['a-book', 'c-book'])
  })

  it('deployer.upload.partial-failure: the failed book never reaches its cover, metadata or catalog write', async () => {
    const fake = fakeClient({ fail: (key) => key === 'books/b-book/b-book.epub' })

    await runUpload([draft('a-book'), draft('b-book'), draft('c-book')], {
      client: fake.client,
      onDraft: () => undefined,
      now: () => NOW,
    })

    expect(fake.puts).not.toContain('books/b-book/cover.jpg')
    expect(fake.puts).not.toContain('books/b-book/metadata.json')
    expect(fake.puts.filter((k) => k === 'catalog.json')).toHaveLength(2)
  })

  it('deployer.upload.partial-failure: a draft that is not ready or not ticked is skipped', async () => {
    const fake = fakeClient()

    const result = await runUpload([draft('a'), draft('b', { selected: false }), draft('c', { state: 'error' })], {
      client: fake.client,
      onDraft: () => undefined,
      now: () => NOW,
    })

    expect(result).toEqual({ done: 1, failed: 0, stopped: false })
    expect(fake.puts.some((k) => k.startsWith('books/b/'))).toBe(false)
    expect(fake.puts.some((k) => k.startsWith('books/c/'))).toBe(false)
  })
})

describe('deployer.upload.offline', () => {
  it('deployer.upload.offline: offline at start rejects with the Vietnamese message and sends nothing', async () => {
    const fake = fakeClient()
    const rec = recorder()

    await expect(
      runUpload([draft('a')], { client: fake.client, onDraft: rec.onDraft, now: () => NOW, online: () => false }),
    ).rejects.toThrow('Cần kết nối mạng để tải lên')

    expect(fake.puts).toEqual([])
    expect(rec.calls).toEqual([])
  })
})

describe('deployer.upload: stop', () => {
  it('deployer.upload.stop: stop requested after the first book stops before the second', async () => {
    const fake = fakeClient()
    let finished = 0
    const result = await runUpload([draft('a'), draft('b'), draft('c')], {
      client: fake.client,
      now: () => NOW,
      shouldStop: () => finished >= 1,
      onDraft: (_key, patch) => {
        if (patch.state === 'done') finished++
      },
    })

    expect(result).toEqual({ done: 1, failed: 0, stopped: true })
    expect(fake.puts.some((k) => k.startsWith('books/b/'))).toBe(false)
    expect(fake.puts.some((k) => k.startsWith('books/c/'))).toBe(false)
  })
})
