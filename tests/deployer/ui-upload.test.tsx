import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/preact'
import { App } from '../../deployer/src/app'
import { AdminError } from '../../deployer/src/admin-client'
import {
  fakeWorker,
  makeStore,
  epubFile,
  settle,
  installObjectUrl,
  removeObjectUrl,
  setOnline,
  restoreOnline,
} from './ui-fakes'

beforeEach(() => installObjectUrl())
afterEach(() => {
  cleanup()
  removeObjectUrl()
  restoreOnline()
})

/** Store connected to a fresh fake Worker with three parsed EPUBs: Một, Hai, Ba. */
async function readyStore(worker = fakeWorker({ books: [] })) {
  const store = makeStore(worker)
  await store.connect()
  await store.addFiles([epubFile('Một.epub'), epubFile('Hai.epub'), epubFile('Ba.epub')])
  await settle(store)
  return store
}

describe('UploadBar', () => {
  it('deployer.upload.progress: a book at 50 % shows 50 % and the overall bar counts finished books', async () => {
    const store = await readyStore()
    const [one, two, three] = store.drafts.value
    store.drafts.value = [
      { ...one, state: 'done', progress: 100, status: 'update' },
      { ...two, state: 'uploading', progress: 50 },
      three,
    ]
    store.uploading.value = { running: true, stopRequested: false, done: 1, total: 3 }
    render(<App store={store} />)

    expect(screen.getByRole('progressbar', { name: 'Đang tải lên' })).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByRole('progressbar', { name: 'Tiến độ chung' })).toHaveAttribute('aria-valuenow', '33')
    expect(screen.getByText('Đã tải lên')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tải lên 1 truyện' })).toBeDisabled()
  })

  it('deployer.upload.progress: Dừng is shown while running and asks the queue to stop', async () => {
    const store = await readyStore()
    store.uploading.value = { running: true, stopRequested: false, done: 0, total: 3 }
    render(<App store={store} />)

    fireEvent.click(screen.getByRole('button', { name: 'Dừng' }))

    expect(store.uploading.value.stopRequested).toBe(true)
  })

  it('deployer.upload.partial-failure: the failed book shows "Lỗi" and "Thử lại" while the others upload', async () => {
    const worker = fakeWorker({ books: [] })
    worker.failing.add('books/hai/hai.epub')
    const store = await readyStore(worker)
    render(<App store={store} />)

    fireEvent.click(screen.getByRole('button', { name: 'Tải lên 3 truyện' }))

    await waitFor(() => expect(store.uploading.value.running).toBe(false))
    const hai = screen.getByRole('article', { name: 'Hai' })
    expect(within(hai).getByText('Lỗi')).toBeInTheDocument()
    expect(within(hai).getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Một' })).getByText('Đã tải lên')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Ba' })).getByText('Đã tải lên')).toBeInTheDocument()
    expect(store.catalog.value.map((b) => b.id)).toEqual(['ba', 'mot'])

    // Retry after the fault is gone: the same book goes through and joins the catalog.
    worker.failing.delete('books/hai/hai.epub')
    fireEvent.click(within(hai).getByRole('button', { name: 'Thử lại' }))

    await waitFor(() => expect(within(screen.getByRole('article', { name: 'Hai' })).getByText('Đã tải lên')).toBeInTheDocument())
    expect(store.catalog.value.map((b) => b.id)).toEqual(['ba', 'hai', 'mot'])
  })

  it('deployer.upload.offline: offline sends nothing, disables the button and shows the offline text', async () => {
    const worker = fakeWorker({ books: [] })
    const store = await readyStore(worker)
    setOnline(false)
    render(<App store={store} />)

    const button = screen.getByRole('button', { name: 'Tải lên 3 truyện' })
    expect(button).toBeDisabled()
    expect(screen.getByText('Cần kết nối mạng để tải lên')).toBeInTheDocument()

    fireEvent.click(button)
    expect(worker.puts).toEqual([])

    // Back online: the button is usable again.
    restoreOnline()
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tải lên 3 truyện' })).toBeEnabled())
    expect(screen.queryByText('Cần kết nối mạng để tải lên')).toBeNull()
  })

  it('deployer.review.invalid-slug: a book with an invalid slug is not counted and blocks its upload', async () => {
    const store = await readyStore()
    render(<App store={store} />)
    const mot = screen.getByRole('article', { name: 'Một' })

    fireEvent.input(within(mot).getByLabelText('Thư mục (slug)'), { target: { value: 'Đấu Phá' } })

    expect(await within(mot).findByText('Chỉ dùng a-z, 0-9 và dấu -')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tải lên 2 truyện' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Tải lên 2 truyện' }))
    await waitFor(() => expect(store.uploading.value.running).toBe(false))
    expect(store.drafts.value.find((d) => d.file.name === 'Một.epub')?.state).toBe('ready')
  })

  it('deployer.upload.offline: an offline upload error shows as an alert in the upload bar, not as the pick notice', async () => {
    const worker = fakeWorker({ books: [] })
    const store = await readyStore(worker)
    setOnline(false)
    await store.startUpload()
    render(<App store={store} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Cần kết nối mạng để tải lên')
    expect(store.notice.value).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()

    restoreOnline()
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('deployer.connect.bad-token: upload stays disabled when the Worker rejects the token', async () => {
    const worker = fakeWorker({ checkError: new AdminError('auth', 401) })
    const store = makeStore(worker)
    await store.connect()
    await store.addFiles([epubFile('Một.epub')])
    await settle(store)
    render(<App store={store} />)

    expect(screen.getByRole('button', { name: 'Tải lên 1 truyện' })).toBeDisabled()
  })
})
