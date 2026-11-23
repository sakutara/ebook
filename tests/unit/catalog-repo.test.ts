import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppDB } from '../../src/db/db'
import { reattach, reconcile, upsertCatalog } from '../../src/catalog/catalog-repo'
import { getProgress, saveProgress, type AnchorInput } from '../../src/progress/progress-repo'
import type { CatalogEntry } from '../../src/source/r2-source'

let db: AppDB

beforeEach(() => {
  db = new AppDB('t-' + crypto.randomUUID())
})

afterEach(async () => {
  db.close()
  await db.delete()
})

const entry = (id: string, overrides: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id,
  title: `Title ${id}`,
  epub: `${id}.epub`,
  size: 1024,
  md5: `md5-${id}`,
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...overrides,
})

const anchor = (bookId: string, overrides: Partial<AnchorInput> = {}): AnchorInput => ({
  id: bookId,
  bookId,
  normTitle: bookId,
  cfi: `epubcfi(/6/2!/4/${bookId})`,
  snippet: `snippet ${bookId}`,
  sectionIndex: 1,
  sectionHref: 'ch1.xhtml',
  sectionFraction: 0.5,
  fraction: 0.25,
  bookMd5: `md5-${bookId}`,
  ...overrides,
})

const cacheFile = (bookId: string, md5: string, at: number) =>
  db.bookFiles.put({
    bookId,
    blob: new Blob(['epub-bytes-' + md5]),
    size: 1,
    md5,
    modifiedTime: 0,
    cachedAt: at,
    lastOpenedAt: at,
  })

describe('catalog-repo', () => {
  it('catalog.sync.fields: stores a catalog entry as a book row', async () => {
    const t1 = 1_000
    await upsertCatalog(
      db,
      [
        {
          id: 'dau-pha',
          title: 'Đấu Phá',
          author: 'Thiên Tàm',
          genres: ['Huyền huyễn', ' '],
          epub: 'dau-pha.epub',
          size: 2048,
          md5: 'm1',
          updatedAt: '2026-11-01T10:00:00.000Z',
        },
      ],
      t1,
    )
    expect(await db.books.get('dau-pha')).toEqual({
      id: 'dau-pha',
      name: 'dau-pha.epub',
      title: 'Đấu Phá',
      normTitle: 'dau pha',
      author: 'Thiên Tàm',
      normAuthor: 'thien tam',
      genres: ['Huyền huyễn'],
      description: '',
      size: 2048,
      modifiedTime: 1793527200000,
      md5: 'm1',
      inDrive: 1,
      lastSeenAt: t1,
      updatedAt: t1,
    })
  })

  it('catalog.sync.fields: sanitises optional fields the source returns unchecked', async () => {
    const raw = {
      id: 'x1',
      title: '  Tiêu đề  ',
      epub: 'x1.epub',
      size: 5,
      md5: 'm',
      author: 42,
      genres: ['  Tiên hiệp ', '', 3, ' '],
      description: null,
      updatedAt: 'not a date',
    } as unknown as CatalogEntry
    const padded = entry('x2', { author: '  Thiên Tàm  ', description: 'Mô tả' })

    await upsertCatalog(db, [raw, padded], 1_000)

    expect(await db.books.get('x1')).toMatchObject({
      title: 'Tiêu đề',
      author: '',
      normAuthor: '',
      genres: ['Tiên hiệp'],
      description: '',
      modifiedTime: 0,
    })
    expect(await db.books.get('x2')).toMatchObject({
      author: 'Thiên Tàm',
      normAuthor: 'thien tam',
      description: 'Mô tả',
    })
  })

  it('catalog-repo: upsertCatalog returns only genuinely new ids', async () => {
    const first = await upsertCatalog(db, [entry('a'), entry('b')], 1_000)
    expect(first.newIds.sort()).toEqual(['a', 'b'])
    const second = await upsertCatalog(db, [entry('a'), entry('b')], 2_000)
    expect(second.newIds).toEqual([])
  })

  it('catalog.reconcile.keep-cached: keeps cached books, deletes uncached ones', async () => {
    const t1 = 1_000
    const t2 = 2_000
    await upsertCatalog(db, [entry('a'), entry('b'), entry('c')], t1)
    await cacheFile('a', 'md5-a', t1)

    await upsertCatalog(db, [entry('c')], t2)
    await reconcile(db, t2)

    const a = await db.books.get('a')
    expect(a).toBeDefined()
    expect(a?.inDrive).toBe(0)
    expect(await db.books.get('b')).toBeUndefined()
    expect((await db.books.get('c'))?.inDrive).toBe(1)
  })

  it('catalog.reconcile.keep-progress: keeps a book with a position but marks it gone', async () => {
    const t1 = 1_000
    const t2 = 2_000
    await upsertCatalog(db, [entry('c')], t1)
    await saveProgress(db, anchor('c'), t1)

    await upsertCatalog(db, [], t2)
    await reconcile(db, t2)

    const c = await db.books.get('c')
    expect(c).toBeDefined()
    expect(c?.inDrive).toBe(0)
  })

  it('catalog.reconcile.reappear: a listed book with inDrive 0 comes back with inDrive 1', async () => {
    const t1 = 1_000
    const t2 = 2_000
    const t3 = 3_000
    await upsertCatalog(db, [entry('a')], t1)
    await cacheFile('a', 'md5-a', t1)
    await upsertCatalog(db, [], t2)
    await reconcile(db, t2)
    expect((await db.books.get('a'))?.inDrive).toBe(0)

    await upsertCatalog(db, [entry('a')], t3)
    expect((await db.books.get('a'))?.inDrive).toBe(1)
  })

  it('catalog.reattach.same-title: moves a position from a vanished book to a new file with the same title', async () => {
    const t1 = 1_000
    const t2 = 2_000
    await upsertCatalog(db, [entry('old', { title: 'Phàm Nhân Tu Tiên' })], t1)
    const original = await saveProgress(
      db,
      anchor('old', {
        normTitle: 'pham nhan tu tien',
        cfi: 'epubcfi(/6/8!/4/2)',
        snippet: 'Một đoạn trích',
        sectionIndex: 3,
        sectionHref: 'ch3.xhtml',
        sectionFraction: 0.42,
        fraction: 0.17,
      }),
      t1,
    )

    // "old" disappears from the catalog; "new" appears with another md5.
    const { newIds } = await upsertCatalog(
      db,
      [entry('pham-nhan-tu-tien', { title: 'Phàm Nhân Tu Tiên', md5: 'm-new' })],
      t2,
    )
    await reconcile(db, t2)
    expect(newIds).toEqual(['pham-nhan-tu-tien'])
    await reattach(db, newIds, t2)

    const moved = await getProgress(db, 'pham-nhan-tu-tien')
    expect(moved).toBeDefined()
    expect(moved?.cfi).toBe(original.cfi)
    expect(moved?.snippet).toBe(original.snippet)
    expect(moved?.sectionIndex).toBe(original.sectionIndex)
    expect(moved?.sectionHref).toBe(original.sectionHref)
    expect(moved?.sectionFraction).toBe(original.sectionFraction)
    expect(moved?.fraction).toBe(original.fraction)
  })

  it('catalog.reattach.same-file: moves the cached file, position and row of a gone book with equal md5', async () => {
    const t1 = 1_000
    const t2 = 2_000
    await upsertCatalog(db, [entry('1AbC', { title: 'Đấu Phá Thương Khung', md5: 'm1' })], t1)
    await cacheFile('1AbC', 'm1', t1)
    await saveProgress(
      db,
      anchor('1AbC', { normTitle: 'dau pha thuong khung', fraction: 0.4 }),
      t1,
    )

    // The R2 catalog lists the same epub under a slug id with a different title.
    const { newIds } = await upsertCatalog(
      db,
      [entry('dau-pha', { title: 'Đấu Phá', md5: 'm1', updatedAt: '2026-11-05T00:00:00.000Z' })],
      t2,
    )
    await reconcile(db, t2)
    expect(newIds).toEqual(['dau-pha'])
    await db.outbox.clear() // only ops written by reattach are checked below
    await reattach(db, newIds, t2)

    const moved = await db.bookFiles.get('dau-pha')
    expect(moved).toBeDefined()
    expect(moved).toMatchObject({ bookId: 'dau-pha', md5: 'm1', size: 1, cachedAt: t1, lastOpenedAt: t1 })
    expect(moved?.blob).toBeDefined()
    expect(await db.bookFiles.get('1AbC')).toBeUndefined()

    expect((await getProgress(db, 'dau-pha'))?.fraction).toBe(0.4)
    expect(await db.progress.get('1AbC')).toBeUndefined()

    expect(await db.books.get('1AbC')).toBeUndefined()
    expect((await db.books.get('dau-pha'))?.inDrive).toBe(1)
    expect(await db.books.count()).toBe(1)

    // The local id rename is not synced: no outbox op refers to the old id.
    const ops = await db.outbox.toArray()
    expect(ops.some((op) => op.entityId === '1AbC')).toBe(false)
    expect(ops.some((op) => op.entityId === 'dau-pha')).toBe(true)
  })

  it('catalog.reattach.same-file: empty md5 never matches', async () => {
    const t1 = 1_000
    const t2 = 2_000
    await upsertCatalog(db, [entry('old', { md5: '' })], t1)
    await cacheFile('old', '', t1)

    const { newIds } = await upsertCatalog(db, [entry('new', { md5: '' })], t2)
    await reconcile(db, t2)
    expect(newIds).toEqual(['new'])
    await reattach(db, newIds, t2)

    expect(await db.bookFiles.get('new')).toBeUndefined()
    expect((await db.bookFiles.get('old'))?.bookId).toBe('old')
    expect(await db.books.get('old')).toBeDefined()
  })

  it('catalog-repo: reattach is skipped when the old book is still in the catalog', async () => {
    const t1 = 1_000
    const t2 = 2_000
    await upsertCatalog(db, [entry('old', { title: 'Phàm Nhân Tu Tiên' })], t1)
    await saveProgress(db, anchor('old', { normTitle: 'pham nhan tu tien' }), t1)

    // "old" is still listed alongside the new book.
    const { newIds } = await upsertCatalog(
      db,
      [entry('old', { title: 'Phàm Nhân Tu Tiên' }), entry('new', { title: 'Phàm Nhân Tu Tiên' })],
      t2,
    )
    await reconcile(db, t2)
    expect(newIds).toEqual(['new'])
    await reattach(db, newIds, t2)

    expect(await getProgress(db, 'new')).toBeUndefined()
    expect((await db.books.get('old'))?.inDrive).toBe(1)
  })
})
