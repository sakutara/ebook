import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDB } from '../../src/db/db'
import { enqueue } from '../../src/sync/outbox'
import { createSyncEngine } from '../../src/sync/sync-engine'
import { localOnlyAdapter, type SyncAdapter } from '../../src/sync/adapters'
import { createFormAdapter, createRoutingAdapter } from '../../src/sync/form-adapter'
import { submitRequest } from '../../src/requests/request-repo'
import type { RequestFormConfig } from '../../src/config'
import { setOnline } from '../setup'

const cfg: RequestFormConfig = { formId: 'test-form', entryTitle: '111', entryAuthor: '222', entryKey: '333' }
const URL_EXPECTED = 'https://docs.google.com/forms/d/e/test-form/formResponse'

let db: AppDB
beforeEach(async () => {
  db = new AppDB(`test-${crypto.randomUUID()}`)
  await db.open()
  setOnline(true)
})

const okFetch = () => vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 200 }))

describe('form adapter', () => {
  it('story-request.submit.online: POSTs urlencoded entries, marks the row sent and acks the op', async () => {
    const saved = await submitRequest(db, { title: 'Phàm Nhân Tu Tiên', author: 'Vong Ngữ' })
    if (saved.kind !== 'saved') throw new Error('expected a saved request')
    const request = saved.request
    const [op] = await db.outbox.toArray()
    const fetchFn = okFetch()

    const result = await createFormAdapter(db, cfg, fetchFn).push([op])

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(URL_EXPECTED)
    expect(init.method).toBe('POST')
    expect(init.mode).toBe('no-cors')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
      'entry.111': 'Phàm Nhân Tu Tiên',
      'entry.222': 'Vong Ngữ',
      'entry.333': 'pham nhan tu tien',
    })
    expect(result).toEqual({ ok: [op.id], failed: [] })
    const row = await db.storyRequests.get(request.id)
    expect(row?.sentAt).not.toBeNull()
  })

  it('story-request.submit.network-error: rejected fetch fails that op and leaves later ops untouched', async () => {
    await enqueue(db, { type: 'storyRequest.submit', entity: 'storyRequests', entityId: 'a', payload: { title: 'A', author: '', key: 'a|' } })
    await enqueue(db, { type: 'storyRequest.submit', entity: 'storyRequests', entityId: 'b', payload: { title: 'B', author: '', key: 'b|' } })
    const ops = await db.outbox.orderBy('createdAt').toArray()
    const fetchFn = vi.fn(async () => { throw new TypeError('Failed to fetch') })

    const result = await createFormAdapter(db, cfg, fetchFn).push(ops)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(result.ok).toEqual([])
    expect(result.failed).toEqual([{ id: ops[0].id, error: 'Failed to fetch' }])
  })

  it('story-request.config.missing: cfg null fails with form-not-configured and never fetches', async () => {
    await enqueue(db, { type: 'storyRequest.submit', entity: 'storyRequests', entityId: 'a', payload: { title: 'A', author: '', key: 'a|' } })
    const ops = await db.outbox.toArray()
    const fetchFn = okFetch()

    const result = await createFormAdapter(db, null, fetchFn).push(ops)

    expect(fetchFn).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: [], failed: [{ id: ops[0].id, error: 'form-not-configured' }] })
  })

  it('story-request.submit.online: routing adapter sends progress.upsert to fallback and storyRequest.submit to the form adapter', async () => {
    await enqueue(db, { type: 'progress.upsert', entity: 'progress', entityId: 'p1', payload: {} })
    await enqueue(db, { type: 'storyRequest.submit', entity: 'storyRequests', entityId: 's1', payload: { title: 'A', author: '', key: 'a|' } })
    const ops = await db.outbox.orderBy('createdAt').toArray()
    const fallbackPush = vi.fn(localOnlyAdapter.push)
    const formPush = vi.fn(async (batch: { id: string }[]) => ({ ok: batch.map((o) => o.id), failed: [] }))
    const router = createRoutingAdapter(
      { 'storyRequest.submit': { name: 'form', push: formPush } },
      { name: 'fallback', push: fallbackPush },
    )

    const result = await router.push(ops)

    expect(fallbackPush.mock.calls[0][0].map((o) => o.type)).toEqual(['progress.upsert'])
    expect(formPush.mock.calls[0][0].map((o) => o.type)).toEqual(['storyRequest.submit'])
    expect(result.ok.sort()).toEqual(ops.map((o) => o.id).sort())
    expect(result.failed).toEqual([])
  })

  it('routing adapter preserves op order within each sub-adapter and concatenates failures', async () => {
    const mk = (type: string, n: number) => ({
      id: `${type}-${n}`, type, entity: 'e', entityId: `${n}`, payload: {}, createdAt: n, attempts: 0,
    })
    const ops = [mk('x', 1), mk('y', 2), mk('x', 3), mk('y', 4)]
    const seen: string[][] = []
    const routeAdapter = (name: string): SyncAdapter => ({
      name,
      push: async (batch) => {
        seen.push(batch.map((o) => o.id))
        return { ok: [], failed: batch.map((o) => ({ id: o.id, error: name })) }
      },
    })
    const router = createRoutingAdapter({ x: routeAdapter('X') }, routeAdapter('Y'))

    const result = await router.push(ops)

    expect(seen).toEqual([['x-1', 'x-3'], ['y-2', 'y-4']])
    expect(result.failed.map((f) => f.id)).toEqual(['x-1', 'x-3', 'y-2', 'y-4'])
  })

  it('story-request.submit.resync: with the real engine an op queued offline is POSTed once after going online', async () => {
    setOnline(false)
    await submitRequest(db, { title: 'Phàm Nhân Tu Tiên', author: 'Vong Ngữ' })
    const fetchFn = okFetch()
    const engine = createSyncEngine(
      db,
      createRoutingAdapter({ 'storyRequest.submit': createFormAdapter(db, cfg, fetchFn) }, localOnlyAdapter),
    )
    engine.start()
    setOnline(true)
    await vi.waitFor(async () => expect(await db.outbox.count()).toBe(0))
    expect(fetchFn).toHaveBeenCalledTimes(1)
    engine.stop()
  })

  it('story-request.submit.optional-fields: original title and language are posted only when configured and filled', async () => {
    const full: RequestFormConfig = { ...cfg, entryOriginalTitle: '555', entryLanguage: '666' }
    await submitRequest(db, { title: 'Phàm Nhân Tu Tiên', author: '', originalTitle: '凡人修仙传', language: 'Trung' }, 1_000)
    await submitRequest(db, { title: 'Đấu Phá', author: '' }, 20_000)
    const [withExtras, withoutExtras] = await db.outbox.orderBy('createdAt').toArray()
    const fetchFn = okFetch()

    await createFormAdapter(db, full, fetchFn).push([withExtras, withoutExtras])

    const bodies = fetchFn.mock.calls.map(([, init]) =>
      Object.fromEntries(new URLSearchParams((init as RequestInit).body as string)),
    )
    expect(bodies[0]).toMatchObject({ 'entry.555': '凡人修仙传', 'entry.666': 'Trung' })
    expect(bodies[1]).not.toHaveProperty('entry.555')
    expect(bodies[1]).not.toHaveProperty('entry.666')
  })
})
