import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppDB } from '../../src/db/db'
import {
  reattachProgress,
  reconcile,
  upsertPage,
  type DriveFileLike,
} from '../../src/catalog/catalog-repo'
import { getProgress, saveProgress, type AnchorInput } from '../../src/progress/progress-repo'

let db: AppDB

beforeEach(() => {
  db = new AppDB('t-' + crypto.randomUUID())
})

afterEach(async () => {
  db.close()
  await db.delete()
})

const file = (id: string, name: string, extra: Partial<DriveFileLike> = {}): DriveFileLike => ({
  id,
  name,
  size: '1024',
  modifiedTime: '2026-11-01T10:00:00.000Z',
  md5Checksum: `md5-${id}`,
  ...extra,
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

describe('catalog-repo', () => {
  it('catalog.sync.fields: stores a Drive page as book rows', async () => {
    const t1 = 1_000
    await upsertPage(
      db,
      [
        {
          id: 'a',
          name: 'Đấu_Phá  Thương Khung.EPUB',
          size: '2048',
          modifiedTime: '2026-11-01T10:00:00.000Z',
          md5Checksum: 'm1',
        },
      ],
      t1,
    )
    const row = await db.books.get('a')
    expect(row).toEqual({
      id: 'a',
      name: 'Đấu_Phá  Thương Khung.EPUB',
      title: 'Đấu Phá Thương Khung',
      normTitle: 'dau pha thuong khung',
      size: 2048,
      modifiedTime: 1793527200000,
      md5: 'm1',
      inDrive: 1,
      lastSeenAt: t1,
      updatedAt: t1,
    })
  })

  it('catalog-repo: non-epub files are ignored', async () => {
    await upsertPage(db, [file('a', 'Book.epub'), file('x', 'cover.jpg'), file('y', 'notes.pdf')], 1_000)
    expect(await db.books.toArray()).toHaveLength(1)
    expect(await db.books.get('x')).toBeUndefined()
    expect(await db.books.get('y')).toBeUndefined()
  })

  it('catalog-repo: upsertPage returns only genuinely new ids', async () => {
    const first = await upsertPage(db, [file('a', 'A.epub'), file('b', 'B.epub')], 1_000)
    expect(first.newIds.sort()).toEqual(['a', 'b'])
    const second = await upsertPage(db, [file('a', 'A.epub'), file('b', 'B.epub')], 2_000)
    expect(second.newIds).toEqual([])
  })

  it('catalog.reconcile.keep-cached: keeps cached books, deletes uncached ones with their covers', async () => {
    const t1 = 1_000
    const t2 = 2_000
    await upsertPage(db, [file('a', 'A.epub'), file('b', 'B.epub'), file('c', 'C.epub')], t1)
    await db.bookFiles.put({
      bookId: 'a',
      blob: new Blob(['x']),
      size: 1,
      md5: 'md5-a',
      modifiedTime: 0,
      cachedAt: t1,
      lastOpenedAt: t1,
    })
    await db.covers.put({ bookId: 'b', blob: null, md5: 'md5-b', fetchedAt: t1 })

    await reconcile(db, t2)

    const a = await db.books.get('a')
    expect(a).toBeDefined()
    expect(a?.inDrive).toBe(0)
    expect(await db.books.get('b')).toBeUndefined()
    expect(await db.covers.get('b')).toBeUndefined()
  })

  it('catalog.reconcile.keep-progress: keeps a book with a position but marks it gone', async () => {
    const t1 = 1_000
    const t2 = 2_000
    await upsertPage(db, [file('c', 'C.epub')], t1)
    await saveProgress(db, anchor('c'), t1)

    await reconcile(db, t2)

    const c = await db.books.get('c')
    expect(c).toBeDefined()
    expect(c?.inDrive).toBe(0)
  })

  it('catalog.reconcile.reappear: a listed book with inDrive 0 comes back with inDrive 1', async () => {
    const t1 = 1_000
    const t2 = 2_000
    const t3 = 3_000
    await upsertPage(db, [file('a', 'A.epub')], t1)
    await db.bookFiles.put({
      bookId: 'a',
      blob: new Blob(['x']),
      size: 1,
      md5: 'md5-a',
      modifiedTime: 0,
      cachedAt: t1,
      lastOpenedAt: t1,
    })
    await reconcile(db, t2)
    expect((await db.books.get('a'))?.inDrive).toBe(0)

    await upsertPage(db, [file('a', 'A.epub')], t3)
    expect((await db.books.get('a'))?.inDrive).toBe(1)
  })

  it('catalog.reattach.same-title: moves a position from a vanished book to a new file with the same title', async () => {
    const t1 = 1_000
    const t2 = 2_000
    await upsertPage(db, [file('old', 'Phàm Nhân Tu Tiên.epub')], t1)
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

    // "old" disappears from Drive; "new" appears with an ASCII file name.
    const page = await upsertPage(db, [file('new', 'Pham Nhan Tu Tien.epub')], t2)
    await reconcile(db, t2)
    expect(page.newIds).toEqual(['new'])
    await reattachProgress(db, page.newIds)

    const moved = await getProgress(db, 'new')
    expect(moved).toBeDefined()
    expect(moved?.cfi).toBe(original.cfi)
    expect(moved?.snippet).toBe(original.snippet)
    expect(moved?.sectionIndex).toBe(original.sectionIndex)
    expect(moved?.sectionHref).toBe(original.sectionHref)
    expect(moved?.sectionFraction).toBe(original.sectionFraction)
    expect(moved?.fraction).toBe(original.fraction)
  })

  it('catalog-repo: reattach is skipped when the old book is still in Drive', async () => {
    const t1 = 1_000
    const t2 = 2_000
    await upsertPage(db, [file('old', 'Pham Nhan Tu Tien.epub')], t1)
    await saveProgress(db, anchor('old', { normTitle: 'pham nhan tu tien' }), t1)

    // "old" is still listed alongside the new file.
    const page = await upsertPage(
      db,
      [file('old', 'Pham Nhan Tu Tien.epub'), file('new', 'Pham Nhan Tu Tien.epub')],
      t2,
    )
    await reconcile(db, t2)
    expect(page.newIds).toEqual(['new'])
    await reattachProgress(db, page.newIds)

    expect(await getProgress(db, 'new')).toBeUndefined()
    expect((await db.books.get('old'))?.inDrive).toBe(1)
  })
})
