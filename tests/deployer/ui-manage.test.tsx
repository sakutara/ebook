import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/preact'
import { App } from '../../deployer/src/app'
import { fakeWorker, makeStore, metadata, installObjectUrl, removeObjectUrl } from './ui-fakes'
import type { Catalog } from '../../deployer/src/types'

beforeEach(() => installObjectUrl())
afterEach(() => {
  cleanup()
  removeObjectUrl()
})

const catalogText = (books: ReturnType<typeof metadata>[]): string =>
  JSON.stringify({ schema: 1, generatedAt: '2026-11-01T00:00:00.000Z', books } satisfies Catalog)

function openPublished() {
  fireEvent.click(screen.getByRole('tab', { name: 'Đã đăng' }))
}

describe('PublishedTab', () => {
  it('deployer.manage.delete: confirming deletes the 3 objects of the book and the catalog drops it', async () => {
    const worker = fakeWorker({
      books: [metadata('a', 'Truyện A'), metadata('b', 'Truyện B')],
      objects: {
        'books/b/b.epub': 'epub',
        'books/b/cover.jpg': 'jpg',
        'books/b/metadata.json': 'meta',
      },
    })
    const store = makeStore(worker)
    await store.connect()
    render(<App store={store} />)
    openPublished()

    const row = screen.getByText('Truyện B').closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: 'Xoá' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Xoá «Truyện B» khỏi R2?')).toBeInTheDocument()
    // Cancelling first leaves everything in place.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(worker.dels).toEqual([])

    fireEvent.click(within(screen.getByText('Truyện B').closest('li')!).getByRole('button', { name: 'Xoá' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xoá' }))

    await waitFor(() => expect(screen.queryByText('Truyện B')).toBeNull())
    expect(worker.dels.sort()).toEqual(['books/b/b.epub', 'books/b/cover.jpg', 'books/b/metadata.json'])
    expect(store.catalog.value.map((b) => b.id)).toEqual(['a'])
  })

  it('deployer.manage.rebuild: "Dựng lại catalog" shows "Đang đọc N/M…" and then the rebuilt count', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    // catalog.json lists only a and b; the bucket also holds c.
    const worker = fakeWorker({
      books: [metadata('a', 'Truyện A'), metadata('b', 'Truyện B')],
      objects: {
        'books/a/metadata.json': JSON.stringify(metadata('a', 'Truyện A')),
        'books/a/a.epub': 'epub',
        'books/b/metadata.json': JSON.stringify(metadata('b', 'Truyện B')),
        'books/c/metadata.json': JSON.stringify(metadata('c', 'Truyện C')),
        'books/c/c.epub': 'epub',
        'books/c/cover.jpg': 'jpg',
      },
      pageSize: 2,
      fetchGate: (key) => (key === 'books/c/metadata.json' ? gate : undefined),
    })
    const store = makeStore(worker)
    await store.connect()
    render(<App store={store} />)
    openPublished()

    fireEvent.click(screen.getByRole('button', { name: 'Dựng lại catalog' }))

    expect(await screen.findByText('Đang đọc 2/3…')).toBeInTheDocument()
    release()

    expect(await screen.findByText('Đã dựng lại catalog · 3 truyện')).toBeInTheDocument()
    expect(store.catalog.value.map((b) => b.id)).toEqual(['a', 'b', 'c'])
    expect(JSON.parse(worker.objects.get('catalog.json') ?? '{}').books).toHaveLength(3)
  })

  it('deployer.manage: without a connection the tab asks to connect first', () => {
    const store = makeStore(fakeWorker())
    render(<App store={store} />)
    openPublished()

    expect(screen.getByText('Hãy kết nối trước')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dựng lại catalog' })).toBeDisabled()
  })

  it('deployer.manage.labels: the search field is named by its label and linked with for/id', async () => {
    const store = makeStore(fakeWorker({ books: [metadata('a', 'Đấu Phá')] }))
    await store.connect()
    render(<App store={store} />)
    openPublished()

    const search = screen.getByRole('searchbox', { name: 'Tìm truyện đã đăng' })
    expect(document.querySelector(`label[for="${search.id}"]`)).toHaveTextContent('Tìm truyện đã đăng')
  })

  it('deployer.manage: search filters the list by title or author', async () => {
    const worker = fakeWorker({
      books: [metadata('a', 'Đấu Phá', { author: 'Thiên Tàm' }), metadata('b', 'Phàm Nhân', { author: 'Vong Ngữ' })],
    })
    const store = makeStore(worker)
    await store.connect()
    render(<App store={store} />)
    openPublished()

    const search = screen.getByRole('searchbox', { name: 'Tìm truyện đã đăng' })
    fireEvent.input(search, { target: { value: 'vong' } })
    expect(screen.queryByText('Đấu Phá')).toBeNull()
    expect(screen.getByText('Phàm Nhân')).toBeInTheDocument()

    fireEvent.input(search, { target: { value: '' } })
    expect(screen.getByText('Đấu Phá')).toBeInTheDocument()
  })

  it('deployer.manage: each book shows its cover, author, genres and size', async () => {
    const worker = fakeWorker({
      books: [metadata('a', 'Đấu Phá', { author: 'Thiên Tàm', genres: ['Huyền huyễn'], size: 2 * 1048576 })],
    })
    const store = makeStore(worker)
    await store.connect()
    const { container } = render(<App store={store} />)
    openPublished()

    const row = screen.getByText('Đấu Phá').closest('li')!
    expect(within(row).getByText('Thiên Tàm')).toBeInTheDocument()
    expect(within(row).getByText('Huyền huyễn')).toBeInTheDocument()
    expect(within(row).getByText('2,0 MB')).toBeInTheDocument()
    expect(container.querySelector('img[src$="/books/a/cover.jpg?v=md5-a"]')).not.toBeNull()
  })
})
