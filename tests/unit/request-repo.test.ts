import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDB, type Book } from '../../src/db/db'
import { normalize } from '../../src/domain/title'
import { exportData, importData } from '../../src/data/backup'
import { checkRequest, getRequest, listRequests, markSent, submitRequest } from '../../src/requests/request-repo'
import { setOnline } from '../setup'

let db: AppDB

const book = (id: string, title: string, overrides: Partial<Book> = {}): Book => ({
  id,
  name: `${title}.epub`,
  title,
  normTitle: normalize(title),
  size: 1,
  modifiedTime: 1,
  md5: `md5-${id}`,
  inDrive: 1,
  lastSeenAt: 1,
  updatedAt: 1,
  ...overrides,
})

beforeEach(async () => {
  db = new AppDB(`t-${crypto.randomUUID()}`)
  await db.open()
  setOnline(true)
})

afterEach(() => {
  vi.restoreAllMocks()
  db.close()
})

describe('request repo', () => {
  it('story-request.submit.offline: saves one row and queues one storyRequest.submit op', async () => {
    setOnline(false)
    const result = await submitRequest(db, { title: 'phàm nhân tu tiên', author: 'vong ngữ' })

    expect(result.kind).toBe('saved')
    const rows = await db.storyRequests.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      title: 'Phàm Nhân Tu Tiên',
      author: 'Vong Ngữ',
      key: 'pham nhan tu tien|vong ngu',
      sentAt: null,
      deleted: 0,
    })
    expect(typeof rows[0].id).toBe('string')
    expect(typeof rows[0].createdAt).toBe('number')
    expect(typeof rows[0].updatedAt).toBe('number')

    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({
      type: 'storyRequest.submit',
      entity: 'storyRequests',
      entityId: rows[0].id,
      payload: { title: 'Phàm Nhân Tu Tiên', author: 'Vong Ngữ', originalTitle: '', language: '', key: 'pham nhan tu tien|vong ngu' },
    })
  })

  it('story-request.submit.offline: throwing inside the transaction stores neither row nor op', async () => {
    vi.spyOn(db.outbox, 'add').mockRejectedValueOnce(new Error('boom'))

    await expect(submitRequest(db, { title: 'Phàm Nhân Tu Tiên', author: '' })).rejects.toThrow('boom')

    expect(await db.storyRequests.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('story-request.dedup.device: a normalised repeat is refused and adds nothing', async () => {
    const first = await submitRequest(db, { title: 'Phàm Nhân Tu Tiên', author: 'Vong Ngữ' })
    expect(first.kind).toBe('saved')
    await db.outbox.clear()

    const second = await submitRequest(db, { title: 'pham nhan tu tien!', author: 'VONG NGU' })

    expect(second.kind).toBe('duplicate')
    if (second.kind === 'duplicate' && first.kind === 'saved') {
      expect(second.existing.id).toBe(first.request.id)
    }
    expect(await db.storyRequests.count()).toBe(1)
    expect(await db.outbox.count()).toBe(0)
  })

  it('story-request.dedup.library: a title matching a catalog normTitle is refused', async () => {
    await db.books.put(book('b1', 'Đấu Phá Thương Khung'))

    const result = await submitRequest(db, { title: 'dau pha thuong khung', author: '' })

    expect(result).toEqual({ kind: 'in-library', bookTitle: 'Đấu Phá Thương Khung' })
    expect(await db.storyRequests.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('story-request.dedup.author-differs: same title with no author is accepted as a new request', async () => {
    const first = await submitRequest(db, { title: 'Tam Quốc', author: 'La Quán Trung' })
    expect(first.kind).toBe('saved')

    const second = await submitRequest(db, { title: 'Tam Quốc', author: '' })

    expect(second.kind).toBe('saved')
    expect(await db.storyRequests.count()).toBe(2)
  })

  it('story-request.form.required: empty or punctuation-only title adds nothing', async () => {
    expect(await submitRequest(db, { title: '', author: 'X' })).toEqual({ kind: 'empty' })
    expect(await submitRequest(db, { title: '   ', author: '' })).toEqual({ kind: 'empty' })
    expect(await submitRequest(db, { title: '"!!"', author: '' })).toEqual({ kind: 'empty' })

    expect(await db.storyRequests.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('story-request.backup.roundtrip: export then import into an empty db keeps both rows and refuses re-submit', async () => {
    await submitRequest(db, { title: 'Phàm Nhân Tu Tiên', author: 'Vong Ngữ' })
    await submitRequest(db, { title: 'Tam Quốc', author: '' })

    const json = await (await exportData(db)).text()

    const name = db.name
    db.close()
    await new AppDB(name).delete()
    db = new AppDB(name)
    await db.open()

    await importData(db, json)

    expect(await db.storyRequests.count()).toBe(2)
    const again = await submitRequest(db, { title: 'pham nhan tu tien', author: 'vong ngu' })
    expect(again.kind).toBe('duplicate')
  })

  it('listRequests: returns rows newest first by createdAt', async () => {
    const a = await submitRequest(db, { title: 'Truyện A', author: '' })
    const b = await submitRequest(db, { title: 'Truyện B', author: '' })
    const c = await submitRequest(db, { title: 'Truyện C', author: '' })
    if (a.kind !== 'saved' || b.kind !== 'saved' || c.kind !== 'saved') throw new Error('setup failed')
    await db.storyRequests.update(a.request.id, { createdAt: 100 })
    await db.storyRequests.update(b.request.id, { createdAt: 300 })
    await db.storyRequests.update(c.request.id, { createdAt: 200 })

    const list = await listRequests(db)

    expect(list.map((r) => r.title)).toEqual(['Truyện B', 'Truyện C', 'Truyện A'])
  })

  it('markSent: sets sentAt and updatedAt on the row', async () => {
    const saved = await submitRequest(db, { title: 'Truyện D', author: '' })
    if (saved.kind !== 'saved') throw new Error('setup failed')
    const id = saved.request.id

    await markSent(db, id, 5000)

    const row = await db.storyRequests.get(id)
    expect(row?.sentAt).toBe(5000)
    expect(row?.updatedAt).toBe(5000)
  })

  it('story-request.dedup.device: checkRequest reports a duplicate and writes nothing', async () => {
    await submitRequest(db, { title: 'Phàm Nhân Tu Tiên', author: 'Vong Ngữ' })
    await db.outbox.clear()

    const res = await checkRequest(db, { title: 'pham nhan tu tien!', author: 'VONG NGU' })

    expect(res.kind).toBe('duplicate')
    expect(await db.storyRequests.count()).toBe(1)
    expect(await db.outbox.count()).toBe(0)
  })

  it('story-request.dedup.library: checkRequest reports an in-library title and writes nothing', async () => {
    await db.books.put(book('b1', 'Đấu Phá Thương Khung'))

    const res = await checkRequest(db, { title: 'dau pha thuong khung', author: '' })

    expect(res).toEqual({ kind: 'in-library', bookTitle: 'Đấu Phá Thương Khung' })
    expect(await db.storyRequests.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('story-request.form.required: checkRequest reports empty for a punctuation-only title', async () => {
    expect(await checkRequest(db, { title: ' !!! ', author: 'X' })).toEqual({ kind: 'empty' })
    expect(await db.storyRequests.count()).toBe(0)
  })

  it('story-request.submit.online: checkRequest returns the normalised values when the request is new', async () => {
    const res = await checkRequest(db, { title: '  phàm nhân  tu tiên ', author: 'vong ngữ' })

    expect(res).toEqual({ kind: 'ok', title: 'Phàm Nhân Tu Tiên', author: 'Vong Ngữ' })
    expect(await db.storyRequests.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('story-request.submit.online: getRequest returns the row by id, or undefined', async () => {
    const saved = await submitRequest(db, { title: 'Truyện E', author: '' })
    if (saved.kind !== 'saved') throw new Error('setup failed')

    expect(await getRequest(db, saved.request.id)).toMatchObject({ title: 'Truyện E' })
    expect(await getRequest(db, 'missing-id')).toBeUndefined()
  })
})
