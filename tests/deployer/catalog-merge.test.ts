import { describe, expect, it, vi } from 'vitest'
import { AdminError, type AdminClient } from '../../deployer/src/admin-client'
import { mergeEntry, removeEntry, updateCatalog } from '../../deployer/src/catalog-merge'
import type { Catalog, Metadata } from '../../deployer/src/types'

const NOW = new Date('2026-11-24T10:00:00.000Z')

function meta(id: string, title = id.toUpperCase()): Metadata {
  return {
    schema: 1,
    id,
    title,
    author: '',
    genres: [],
    description: '',
    language: 'vi',
    epub: `${id}.epub`,
    size: 10,
    md5: `md5-${id}`,
    updatedAt: '2026-11-01T00:00:00.000Z',
  }
}

function catalogOf(...ids: string[]): Catalog {
  return { schema: 1, generatedAt: '2026-11-01T00:00:00.000Z', books: ids.map((id) => meta(id)) }
}

/** Fake client: getCatalog and put are scripted; the other methods are not used here. */
function fakeClient(opts: {
  catalog?: Catalog
  etag?: string | null
  putResults: (Error | { etag: string })[]
}) {
  const getCatalog = vi.fn(async () => ({
    catalog: opts.catalog ?? { schema: 1 as const, generatedAt: '', books: [] },
    etag: opts.etag === undefined ? '"e1"' : opts.etag,
  }))
  const queue = [...opts.putResults]
  const put = vi.fn(async () => {
    const next = queue.shift()
    if (next === undefined) throw new Error('unexpected put')
    if (next instanceof Error) throw next
    return next
  })
  const client = {
    check: vi.fn(),
    getCatalog,
    put,
    del: vi.fn(),
    list: vi.fn(),
  } as unknown as AdminClient
  return { client, getCatalog, put }
}

describe('deployer.catalog.merge: pure merge', () => {
  it('deployer.catalog.merge: mergeEntry adds a new id and keeps books sorted by id', () => {
    const merged = mergeEntry(catalogOf('a', 'c'), meta('b'), NOW)
    expect(merged.books.map((b) => b.id)).toEqual(['a', 'b', 'c'])
    expect(merged.generatedAt).toBe(NOW.toISOString())
    expect(merged.schema).toBe(1)
  })

  it('deployer.catalog.merge: mergeEntry replaces an existing id in place', () => {
    const merged = mergeEntry(catalogOf('a', 'b'), meta('b', 'Bản mới'), NOW)
    expect(merged.books.map((b) => b.id)).toEqual(['a', 'b'])
    expect(merged.books[1].title).toBe('Bản mới')
  })

  it('deployer.catalog.merge: mergeEntry does not mutate the input catalog', () => {
    const input = catalogOf('a', 'c')
    mergeEntry(input, meta('b'), NOW)
    expect(input.books.map((b) => b.id)).toEqual(['a', 'c'])
  })

  it('deployer.manage.delete: removeEntry drops the id and stamps generatedAt', () => {
    const removed = removeEntry(catalogOf('a', 'b', 'c'), 'b', NOW)
    expect(removed.books.map((b) => b.id)).toEqual(['a', 'c'])
    expect(removed.generatedAt).toBe(NOW.toISOString())
  })
})

describe('deployer.catalog.merge: updateCatalog', () => {
  it('deployer.catalog.merge: reads, changes and writes catalog.json with If-Match and JSON content type', async () => {
    const { client, put } = fakeClient({ catalog: catalogOf('a', 'c'), putResults: [{ etag: 'e2' }] })
    await updateCatalog(client, (c) => mergeEntry(c, meta('b'), NOW), () => NOW)
    expect(put).toHaveBeenCalledTimes(1)
    const [key, body, opts] = put.mock.calls[0] as unknown as [string, string, Record<string, unknown>]
    expect(key).toBe('catalog.json')
    expect(JSON.parse(body).books.map((b: Metadata) => b.id)).toEqual(['a', 'b', 'c'])
    expect(JSON.parse(body).generatedAt).toBe(NOW.toISOString())
    expect(opts).toMatchObject({ contentType: 'application/json; charset=utf-8', ifMatch: '"e1"' })
  })

  it('deployer.catalog.conflict: a 412 re-reads, merges again and the second PUT succeeds', async () => {
    const { client, getCatalog, put } = fakeClient({
      catalog: catalogOf('a', 'c'),
      putResults: [new AdminError('conflict', 412), { etag: 'e3' }],
    })
    await updateCatalog(client, (c) => mergeEntry(c, meta('b'), NOW), () => NOW)
    expect(getCatalog).toHaveBeenCalledTimes(2)
    expect(put).toHaveBeenCalledTimes(2)
    const lastBody = JSON.parse((put.mock.calls[1] as unknown as [string, string])[1])
    expect(lastBody.books.map((b: Metadata) => b.id)).toEqual(['a', 'b', 'c'])
  })

  it('deployer.catalog.conflict: five 412 answers in a row throw Không cập nhật được catalog', async () => {
    const conflicts = Array.from({ length: 5 }, () => new AdminError('conflict', 412))
    const { client, getCatalog, put } = fakeClient({ putResults: conflicts })
    await expect(updateCatalog(client, (c) => mergeEntry(c, meta('b'), NOW), () => NOW)).rejects.toThrow(
      'Không cập nhật được catalog',
    )
    expect(getCatalog).toHaveBeenCalledTimes(5)
    expect(put).toHaveBeenCalledTimes(5)
  })

  it('deployer.catalog.conflict: non-conflict errors are not retried', async () => {
    const { client, put } = fakeClient({ putResults: [new AdminError('network')] })
    await expect(updateCatalog(client, (c) => c)).rejects.toMatchObject({ kind: 'network' })
    expect(put).toHaveBeenCalledTimes(1)
  })

  it('deployer.catalog.merge: a 404 catalog is written with ifMatch null', async () => {
    const { client, put } = fakeClient({ catalog: undefined, etag: null, putResults: [{ etag: 'e1' }] })
    await updateCatalog(client, (c) => mergeEntry(c, meta('a'), NOW), () => NOW)
    const opts = (put.mock.calls[0] as unknown as [string, string, { ifMatch: unknown }])[2]
    expect(opts.ifMatch).toBeNull()
    const body = JSON.parse((put.mock.calls[0] as unknown as [string, string])[1])
    expect(body.books.map((b: Metadata) => b.id)).toEqual(['a'])
  })
})
