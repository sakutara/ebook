import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup, act } from '@testing-library/preact'
import { render as renderPreact } from 'preact'
import { AppDB, type Book, type Progress } from '../../src/db/db'
import { normalize } from '../../src/domain/title'
import { catalogStatus } from '../../src/catalog/catalog-sync'
import { syncStatus } from '../../src/sync/sync-engine'
import { Icon } from '../../src/ui/icons/Icon'
import { query, filter, genre, author, sort } from '../../src/ui/library/library-state'
import { LibraryPage } from '../../src/ui/library/LibraryPage'
import { SearchBar } from '../../src/ui/library/SearchBar'
import { toast } from '../../src/ui/toast-store'
import type { BookSource } from '../../src/source/r2-source'

let db: AppDB

beforeEach(() => {
  // Fresh database per test: unique name, so fake-indexeddb state never leaks between tests.
  db = new AppDB(`library-test-${crypto.randomUUID()}`)
  query.value = ''
  filter.value = 'all'
  genre.value = ''
  author.value = ''
  toast.value = null
  catalogStatus.value = { state: 'idle' }
  syncStatus.value = { ...syncStatus.value, online: true }
  location.hash = ''
  localStorage.clear()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  // jsdom has no object-URL support; the download test installs these, so remove them again.
  delete (URL as { createObjectURL?: unknown }).createObjectURL
  delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL
  db.close()
  await db.delete()
})

function book(id: string, title: string, over: Partial<Book> = {}): Book {
  return {
    id,
    name: `${title}.epub`,
    title,
    normTitle: normalize(title),
    author: '',
    normAuthor: '',
    genres: [],
    description: '',
    size: 10,
    modifiedTime: 100,
    md5: `md5-${id}`,
    inDrive: 1,
    lastSeenAt: 1,
    updatedAt: 1,
    ...over,
  }
}

const file = (bookId: string, md5 = `md5-${bookId}`, modifiedTime = 100) => ({
  bookId,
  blob: new Blob(['epub-bytes'], { type: 'application/epub+zip' }),
  size: 10,
  md5,
  modifiedTime,
  cachedAt: 1,
  lastOpenedAt: 1,
})

function progressRow(bookId: string, fraction: number): Progress {
  return {
    id: bookId,
    bookId,
    normTitle: bookId,
    cfi: 'epubcfi(/6/2)',
    snippet: '',
    sectionIndex: 0,
    sectionHref: '',
    sectionFraction: 0,
    fraction,
    bookMd5: `md5-${bookId}`,
    updatedAt: 1,
    deleted: 0,
  }
}

async function seed(books: Book[], files: ReturnType<typeof file>[] = [], progress: Progress[] = []) {
  await db.books.bulkPut(books)
  await db.bookFiles.bulkPut(files)
  await db.progress.bulkPut(progress)
}

/** A source whose fetchBook stays pending until the test settles it; reports progress and honours abort. */
interface HeldFetch {
  id: string
  signal: AbortSignal | undefined
  progress(pct: number | null): void
  resolve(blob: Blob): void
  reject(err: unknown): void
}

function heldSource() {
  const held: HeldFetch[] = []
  const source = {
    fetchCatalog: vi.fn(async () => []),
    coverUrl: (b: { id: string; md5: string }) => `https://r2.test/books/${b.id}/cover.jpg?v=${b.md5}`,
    epubUrl: (b: { id: string }) => `https://r2.test/books/${b.id}/${b.id}.epub`,
    fetchBook: vi.fn(
      (b: { id: string }, opts: { onProgress?: (pct: number | null) => void; signal?: AbortSignal } = {}) =>
        new Promise<Blob>((resolve, reject) => {
          const h: HeldFetch = {
            id: b.id,
            signal: opts.signal,
            progress: (pct) => opts.onProgress?.(pct),
            resolve,
            reject,
          }
          held.push(h)
          opts.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    ),
  }
  return { source: source as unknown as BookSource, held }
}

/** Stubs object URLs and anchor clicks; returns the saved file names (download attribute). */
function stubDownloads() {
  const saved: { name: string; blob: Blob }[] = []
  const blobs = new Map<string, Blob>()
  URL.createObjectURL = (b: Blob) => {
    const url = `blob:mock-${blobs.size}`
    blobs.set(url, b)
    return url
  }
  URL.revokeObjectURL = () => {}
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, blob: blobs.get(this.getAttribute('href') ?? '')! })
  })
  return saved
}

function servicesWith(source: BookSource | null, config = true) {
  return {
    db,
    source,
    config: config ? { baseUrl: 'https://r2.test' } : null,
    catalogSync: { sync: vi.fn(async () => {}) } as any,
  }
}

function makeServices(opts: { config?: boolean; source?: boolean } = {}) {
  const source = opts.source
    ? ({
        fetchBook: vi.fn(async () => new Blob(['epub'], { type: 'application/epub+zip' })),
        coverUrl: (b: { id: string; md5: string }) => `https://r2.test/books/${b.id}/cover.jpg?v=${b.md5}`,
      } as unknown as BookSource)
    : null
  return {
    db,
    source,
    config: opts.config ? { baseUrl: 'https://r2.test' } : null,
    catalogSync: { sync: vi.fn(async () => {}) } as any,
  }
}

/** Markup of an Icon, rendered in isolation, to compare against a button's icon. */
function iconMarkup(name: Parameters<typeof Icon>[0]['name']): string {
  const el = document.createElement('div')
  renderPreact(<Icon name={name} />, el)
  const html = el.firstElementChild!.innerHTML
  renderPreact(null, el)
  return html
}

const card = (title: string) => screen.getByRole('article', { name: title })

/** Taps the book's cover and returns the named button in the action sheet that opens. */
function sheetButton(title: string, name: string | RegExp): HTMLElement {
  fireEvent.click(within(card(title)).getByRole('button', { name: `Mở ${title}` }))
  return within(screen.getByRole('dialog', { name: title })).getByRole('button', { name })
}

const cover = (title: string) => within(card(title)).getByRole('button', { name: `Mở ${title}` })

describe('app-shell.config.missing', () => {
  it('app-shell.config.missing: shows the notice, makes no Drive request and shows the cached book', async () => {
    await seed([book('a', 'Sách A')], [file('a')])
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const services = makeServices({ config: false, source: false })
    render(<LibraryPage services={services as any} />)

    expect(await screen.findByRole('article', { name: 'Sách A' })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Chưa cấu hình máy chủ truyện')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(services.catalogSync.sync).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Làm mới' })).toBeNull()
  })
})

describe('library.grid.sorted (page)', () => {
  it('library.grid.sorted: renders cards in normTitle order', async () => {
    sort.value = 'az'
    await seed([book('1', 'Ánh Trăng'), book('2', 'Bạch Lộc'), book('3', 'an bình')])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'an bình' })
    sort.value = 'newest'
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual([
      'an bình',
      'Ánh Trăng',
      'Bạch Lộc',
    ])
  })
})

describe('library.search.diacritics', () => {
  it('library.search.diacritics: typing "dau pha" filters after a 150 ms debounce', async () => {
    await seed([book('1', 'Đấu Phá Thương Khung'), book('2', 'Đế Bá')])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Đế Bá' })

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.input(screen.getByRole('searchbox', { name: 'Tìm truyện' }), { target: { value: 'dau pha' } })

    await act(async () => {
      vi.advanceTimersByTime(149)
    })
    expect(screen.getAllByRole('article')).toHaveLength(2)

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual([
      'Đấu Phá Thương Khung',
    ])
  })

  it('library.search.diacritics: the clear button empties the search and restores every book', async () => {
    await seed([book('1', 'Đấu Phá Thương Khung'), book('2', 'Đế Bá')])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Đế Bá' })

    fireEvent.input(screen.getByRole('searchbox', { name: 'Tìm truyện' }), { target: { value: 'de ba' } })
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: 'Xoá tìm kiếm' }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    expect(screen.getByRole('searchbox', { name: 'Tìm truyện' })).toHaveValue('')
  })
})

describe('app-shell.routes.reader-fullscreen (scroll)', () => {
  it('app-shell.routes.reader-fullscreen: scroll position is saved while scrolling and restored after cards render', async () => {
    await seed([book('1', 'Đế Bá'), book('2', 'Bạch Lộc')])
    sessionStorage.clear()
    const scrollTo = vi.mocked(window.scrollTo)
    const cardCountAtScroll: number[] = []
    scrollTo.mockImplementation(() => {
      cardCountAtScroll.push(document.querySelectorAll('article').length)
    })
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true })

    const first = render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Đế Bá' })

    // Scrolling is saved (throttled to animation frames), not written on unmount.
    Object.defineProperty(window, 'scrollY', { value: 420, configurable: true, writable: true })
    window.dispatchEvent(new Event('scroll'))
    await waitFor(() => expect(sessionStorage.getItem('library.scrollY')).toBe('420'))
    first.unmount()
    expect(sessionStorage.getItem('library.scrollY')).toBe('420')

    scrollTo.mockClear()
    cardCountAtScroll.length = 0
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 420))
    // The restore must run only once cards are in the DOM.
    expect(cardCountAtScroll.length).toBeGreaterThan(0)
    expect(cardCountAtScroll.every((n) => n > 0)).toBe(true)

    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true })
  })
})

describe('library.search.diacritics (unmount)', () => {
  it('library.search.diacritics: text typed just before navigating away is kept', () => {
    const { unmount } = render(<SearchBar />)
    fireEvent.input(screen.getByRole('searchbox', { name: 'Tìm truyện' }), { target: { value: 'dau' } })
    unmount()
    expect(query.value).toBe('dau')
  })
})

describe('library.search.empty', () => {
  it('library.search.empty: no match shows "Không tìm thấy truyện nào"', async () => {
    await seed([book('2', 'Đế Bá')])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Đế Bá' })

    fireEvent.input(screen.getByRole('searchbox', { name: 'Tìm truyện' }), { target: { value: 'zzz' } })
    expect(await screen.findByText('Không tìm thấy truyện nào', {}, { timeout: 1000 })).toBeInTheDocument()
  })
})

describe('library.search.empty (empty catalog)', () => {
  it('library.search.empty: an empty catalog shows "Chưa có truyện nào"', async () => {
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    expect(await screen.findByText('Chưa có truyện nào')).toBeInTheDocument()
    expect(screen.queryByText('Không tìm thấy truyện nào')).toBeNull()
  })
})

describe('library.filter.cached (page)', () => {
  it('library.filter.cached: selecting "Đã lưu" shows only the 3 cached books, including the local-only one', async () => {
    const books = Array.from({ length: 10 }, (_, i) =>
      book(String(i + 1), `Truyện ${String(i + 1).padStart(2, '0')}`, i === 8 ? { inDrive: 0 } : {}),
    )
    await seed(books, [file('1'), file('5'), file('9')])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(10))

    fireEvent.click(screen.getByRole('radio', { name: 'Đã lưu' }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3))
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual([
      'Truyện 01',
      'Truyện 05',
      'Truyện 09',
    ])
  })
})

describe('library.badge.states (page)', () => {
  it('library.badge.states: shows Đã lưu, Có bản mới, Chỉ còn trên máy and the progress percentage', async () => {
    await seed(
      [
        book('a', 'Bản a'),
        book('b', 'Bản b', { md5: 'new-b', modifiedTime: 200 }),
        book('c', 'Bản c', { inDrive: 0 }),
        book('d', 'Bản d'),
      ],
      [file('a'), file('b', 'md5-b', 100), file('c')],
      [progressRow('d', 0.426)],
    )
    // A search keeps the book out of the "Đọc tiếp" row, so its grid card (and progress bar) renders.
    query.value = 'bản'
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Bản d' })
    await waitFor(() => expect(within(card('Bản a')).getByRole('img', { name: 'Đã lưu' })).toBeInTheDocument())
    expect(within(card('Bản b')).getByText('Có bản mới')).toBeInTheDocument()
    expect(within(card('Bản c')).getByText('Chỉ còn trên máy')).toBeInTheDocument()
    await waitFor(() => expect(within(card('Bản d')).getByText('43%')).toBeInTheDocument())
    const bar = within(card('Bản d')).getByRole('progressbar', { name: 'Tiến độ đọc' })
    expect(bar).toHaveAttribute('aria-valuenow', '43')
  })
})

describe('library.badge.states (first render)', () => {
  it('library.badge.states: badges are present on the first rendered cards', async () => {
    await seed([book('a', 'Bản a'), book('d', 'Bản d')], [file('a')], [progressRow('d', 0.426)])
    query.value = 'bản'
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Bản d' })
    // No waitFor: the grid must not render until every live query has delivered.
    expect(within(card('Bản a')).getByRole('img', { name: 'Đã lưu' })).toBeInTheDocument()
    expect(within(card('Bản d')).getByText('43%')).toBeInTheDocument()
  })
})

describe('library.download.cached', () => {
  it('library.download.cached: saves the cached blob via an object URL with the Drive file name, without network', async () => {
    await seed([book('a', 'Sách a')], [file('a')])
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const createObjectURL = vi.fn(() => 'blob:mock-a')
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = vi.fn()
    const clicked: { href: string; download: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.getAttribute('href') ?? '', download: this.download })
    })

    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await waitFor(() => expect(within(card('Sách a')).getByRole('img', { name: 'Đã lưu' })).toBeInTheDocument())
    fireEvent.click(sheetButton('Sách a', 'Tải tệp EPUB về máy'))

    await waitFor(() => expect(clicked).toHaveLength(1))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clicked[0]).toEqual({ href: 'blob:mock-a', download: 'Sách a.epub' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('library.download.remote', () => {
  it('library.download.remote: an uncached book online is fetched into the cache, then saved', async () => {
    await seed([book('d', 'Bản d')])
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign, hash: '' })
    const created: Blob[] = []
    ;(URL as any).createObjectURL = (b: Blob) => (created.push(b), 'blob:x')
    ;(URL as any).revokeObjectURL = () => {}
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const services = makeServices({ config: true, source: true }) as any
    render(<LibraryPage services={services} />)
    await screen.findByRole('article', { name: 'Bản d' })

    fireEvent.click(sheetButton('Bản d', 'Tải tệp EPUB về máy'))
    await waitFor(() => expect(created).toHaveLength(1))
    expect(assign).not.toHaveBeenCalled()
    expect(await db.bookFiles.get('d')).toBeDefined()
  })

  it('library.download.remote: without a source an uncached book is not fetched and nothing is saved', async () => {
    await seed([book('d', 'Bản d')])
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign, hash: '' })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    render(<LibraryPage services={makeServices({ config: false, source: false }) as any} />)
    await screen.findByRole('article', { name: 'Bản d' })

    // Without a source the download is disabled (cloud-off), so a tap cannot start a fetch.
    const off = sheetButton('Bản d', 'Cần mạng để tải')
    expect(off).toBeDisabled()
    fireEvent.click(off)
    await new Promise((r) => setTimeout(r, 0))
    expect(assign).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(await db.bookFiles.get('d')).toBeUndefined()
  })

  it('library.download.remote: the remote fetch is saved under the title-based file name', async () => {
    await seed([book('d', 'Bản d: tập 1')])
    const { source, held } = heldSource()
    const saved = stubDownloads()
    render(<LibraryPage services={servicesWith(source)} />)
    await screen.findByRole('article', { name: 'Bản d: tập 1' })

    fireEvent.click(sheetButton('Bản d: tập 1', 'Tải tệp EPUB về máy'))
    await waitFor(() => expect(held).toHaveLength(1))
    expect(within(card('Bản d: tập 1')).getByRole('progressbar', { name: 'Đang tải truyện' })).toBeInTheDocument()
    expect(saved).toHaveLength(0)

    act(() => held[0].resolve(new Blob(['epub'])))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].name).toBe('Bản d_ tập 1.epub')
    expect(await db.bookFiles.get('d')).toBeDefined()
  })
})

describe('library.read.fetch-first', () => {
  it('library.read.fetch-first: an uncached book shows the progress bar until stored, then navigates to the reader', async () => {
    await seed([book('d', 'Bản d')])
    const { source, held } = heldSource()
    render(<LibraryPage services={servicesWith(source)} />)
    await screen.findByRole('article', { name: 'Bản d' })

    fireEvent.click(sheetButton('Bản d', /^Đọc/))
    await waitFor(() => expect(held).toHaveLength(1))
    expect(within(card('Bản d')).getByRole('progressbar', { name: 'Đang tải truyện' })).toBeInTheDocument()
    expect(location.hash).not.toBe('#/read/d')

    act(() => held[0].resolve(new Blob(['epub'])))
    await waitFor(() => expect(location.hash).toBe('#/read/d'))
    expect(await db.bookFiles.get('d')).toBeDefined()
  })
})

describe('library.progress.shown', () => {
  it('library.progress.shown: the card shows a progressbar with aria-valuenow and "Đang tải 25%", without Đọc and Tải', async () => {
    await seed([book('d', 'Bản d')])
    const { source, held } = heldSource()
    render(<LibraryPage services={servicesWith(source)} />)
    await screen.findByRole('article', { name: 'Bản d' })

    fireEvent.click(sheetButton('Bản d', /^Đọc/))
    await waitFor(() => expect(held).toHaveLength(1))
    act(() => held[0].progress(25))

    const bar = within(card('Bản d')).getByRole('progressbar', { name: 'Đang tải truyện' })
    expect(bar).toHaveAttribute('aria-valuenow', '25')
    expect(within(card('Bản d')).getByText('Đang tải 25%')).toBeInTheDocument()
    expect(cover('Bản d')).toBeDisabled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('library.progress.shown: an unknown total shows an indeterminate bar with "Đang tải…"', async () => {
    await seed([book('d', 'Bản d')])
    const { source, held } = heldSource()
    render(<LibraryPage services={servicesWith(source)} />)
    await screen.findByRole('article', { name: 'Bản d' })

    fireEvent.click(sheetButton('Bản d', 'Tải tệp EPUB về máy'))
    await waitFor(() => expect(held).toHaveLength(1))
    act(() => held[0].progress(null))

    const bar = within(card('Bản d')).getByRole('progressbar', { name: 'Đang tải truyện' })
    expect(bar).not.toHaveAttribute('aria-valuenow')
    expect(within(card('Bản d')).getByText('Đang tải…')).toBeInTheDocument()
  })
})

describe('library.progress.cancel', () => {
  it('library.progress.cancel: "Huỷ tải" aborts the request, stores nothing and restores Đọc and Tải', async () => {
    await seed([book('d', 'Bản d')])
    const { source, held } = heldSource()
    render(<LibraryPage services={servicesWith(source)} />)
    await screen.findByRole('article', { name: 'Bản d' })

    fireEvent.click(sheetButton('Bản d', /^Đọc/))
    await waitFor(() => expect(held).toHaveLength(1))
    const cancel = within(card('Bản d')).getByRole('button', { name: 'Huỷ tải' })
    fireEvent.click(cancel)

    await waitFor(() => expect(cover('Bản d')).toBeEnabled())
    expect(within(card('Bản d')).queryByRole('progressbar', { name: 'Đang tải truyện' })).toBeNull()
    expect(held[0].signal?.aborted).toBe(true)
    expect(await db.bookFiles.get('d')).toBeUndefined()
    expect(location.hash).not.toBe('#/read/d')
    expect(toast.value).toBeNull()
  })
})

describe('library.progress.error', () => {
  it('library.progress.error: a network failure mid-way shows the toast and restores the buttons', async () => {
    await seed([book('d', 'Bản d')])
    const { source, held } = heldSource()
    render(<LibraryPage services={servicesWith(source)} />)
    await screen.findByRole('article', { name: 'Bản d' })

    fireEvent.click(sheetButton('Bản d', 'Tải tệp EPUB về máy'))
    await waitFor(() => expect(held).toHaveLength(1))
    act(() => held[0].reject(new TypeError('network down')))

    await waitFor(() => expect(toast.value?.text).toBe('Không tải được truyện, thử lại sau'))
    expect(cover('Bản d')).toBeEnabled()
    expect(await db.bookFiles.get('d')).toBeUndefined()
  })
})

describe('library.filter.genre', () => {
  it('library.filter.genre: selecting a genre chip shows its books and the chip reads "<name> <count>"', async () => {
    await seed([
      book('1', 'Truyện 1', { genres: ['Tiên hiệp'] }),
      book('2', 'Truyện 2', { genres: ['Tiên hiệp'] }),
      book('3', 'Truyện 3', { genres: ['Huyền huyễn'] }),
      book('4', 'Truyện 4', { genres: ['Huyền huyễn'] }),
      book('5', 'Truyện 5', { genres: ['Khoa huyễn', 'Tiên hiệp'] }),
    ])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Truyện 1' })

    const group = screen.getByRole('radiogroup', { name: 'Thể loại' })
    fireEvent.click(within(group).getByRole('radio', { name: 'Tiên hiệp 3' }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3))
    expect(within(group).getByRole('radio', { name: 'Tiên hiệp 3' })).toHaveAttribute('aria-checked', 'true')
    expect(within(group).getByRole('radio', { name: 'Tất cả thể loại' })).toHaveAttribute('aria-checked', 'false')
    expect(within(group).queryByRole('radio', { name: /Đô thị/ })).toBeNull()
  })
})

describe('library.filter.author', () => {
  it('library.filter.author: picking an author shows only that author\'s books', async () => {
    const nc = { author: 'Nhĩ Căn', normAuthor: normalize('Nhĩ Căn') }
    await seed([
      book('1', 'Truyện 1', nc),
      book('2', 'Truyện 2', nc),
      book('3', 'Truyện 3', { author: 'Vong Ngữ', normAuthor: normalize('Vong Ngữ') }),
    ])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Truyện 1' })

    // The author list is a collapse: closed until its header is clicked.
    const toggle = screen.getByRole('button', { name: 'Tác giả' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('radiogroup', { name: 'Tác giả' })).toBeNull()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const list = screen.getByRole('radiogroup', { name: 'Tác giả' })
    expect(within(list).getByRole('radio', { name: 'Mọi tác giả' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(list).getByRole('radio', { name: 'Nhĩ Căn 2' }))

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Truyện 1', 'Truyện 2'])
  })
})

describe('library.filter.clear', () => {
  it('library.filter.clear: "Xoá bộ lọc" resets search, genre and author and shows the full list', async () => {
    await seed([
      book('1', 'Đế Bá', { genres: ['Tiên hiệp'], author: 'Nhĩ Căn', normAuthor: normalize('Nhĩ Căn') }),
      book('2', 'Bạch Lộc', { genres: ['Huyền huyễn'] }),
    ])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Đế Bá' })
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: 'Tiên hiệp 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tác giả' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Nhĩ Căn 1' }))
    fireEvent.input(screen.getByRole('searchbox', { name: 'Tìm truyện' }), { target: { value: 'de' } })
    // Wait for the 150 ms search debounce to publish, so all three filters are active.
    await waitFor(() => expect(query.value).toBe('de'))
    expect(screen.getAllByRole('article')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    expect(query.value).toBe('')
    expect(genre.value).toBe('')
    expect(author.value).toBe('')
    expect(screen.getByRole('radio', { name: 'Tất cả thể loại' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Mọi tác giả' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('searchbox', { name: 'Tìm truyện' })).toHaveValue('')
  })
})

describe('library.filter.clear (debounce)', () => {
  it('library.filter.clear: clearing during debounce keeps the query empty', async () => {
    await seed([book('1', 'Đấu Phá Thương Khung'), book('2', 'Đế Bá')])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Đế Bá' })

    // Publish a query first so "Xoá bộ lọc" is shown.
    fireEvent.input(screen.getByRole('searchbox', { name: 'Tìm truyện' }), { target: { value: 'de' } })
    await waitFor(() => expect(query.value).toBe('de'))

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.input(screen.getByRole('searchbox', { name: 'Tìm truyện' }), { target: { value: 'dea' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }))

    await act(async () => {
      vi.advanceTimersByTime(150)
    })
    expect(query.value).toBe('')
    expect(screen.getByRole('searchbox', { name: 'Tìm truyện' })).toHaveValue('')
  })
})

describe('library.filter.a11y', () => {
  it('library.filter.a11y: genre chips are radios in the "Thể loại" radiogroup and authors are a "Tác giả" collapse', async () => {
    await seed([book('1', 'Truyện 1', { genres: ['Tiên hiệp'], author: 'A', normAuthor: 'a' })])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Truyện 1' })

    const group = screen.getByRole('radiogroup', { name: 'Thể loại' })
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'Tất cả thể loại',
      'Tiên hiệp 1',
    ])
    expect(screen.getByRole('button', { name: 'Tác giả' })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('library.filter.genre-quick', () => {
  it('library.filter.genre-quick: typing narrows the genre list, ignoring diacritics', async () => {
    await seed([
      book('1', 'Truyện 1', { genres: ['Tiên hiệp'] }),
      book('2', 'Truyện 2', { genres: ['Huyền huyễn'] }),
    ])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Truyện 1' })

    fireEvent.input(screen.getByRole('searchbox', { name: 'Lọc thể loại' }), { target: { value: 'huyen' } })
    const group = screen.getByRole('radiogroup', { name: 'Thể loại' })
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'Tất cả thể loại',
      'Huyền huyễn 1',
    ])
  })
})

describe('library.filter.author-quick', () => {
  it('library.filter.author-quick: typing narrows the author list, ignoring diacritics', async () => {
    await seed([
      book('1', 'Truyện 1', { author: 'Nhĩ Căn', normAuthor: 'nhi can' }),
      book('2', 'Truyện 2', { author: 'Vong Ngữ', normAuthor: 'vong ngu' }),
    ])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Truyện 1' })

    fireEvent.click(screen.getByRole('button', { name: 'Tác giả' }))
    fireEvent.input(screen.getByRole('searchbox', { name: 'Lọc tác giả' }), { target: { value: 'vong' } })
    const group = screen.getByRole('radiogroup', { name: 'Tác giả' })
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Mọi tác giả', 'Vong Ngữ 1'])
  })
})

describe('library.filter.offline', () => {
  it('library.filter.offline: changing genre and author offline updates the list with no request', async () => {
    await seed([
      book('1', 'Truyện 1', { genres: ['Tiên hiệp'], author: 'A', normAuthor: 'a' }),
      book('2', 'Truyện 2', { genres: ['Huyền huyễn'], author: 'B', normAuthor: 'b' }),
    ], [file('1')])
    syncStatus.value = { ...syncStatus.value, online: false }
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Truyện 1' })

    fireEvent.click(screen.getByRole('radio', { name: 'Huyền huyễn 1' }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1))
    fireEvent.click(screen.getByRole('radio', { name: 'Tất cả thể loại' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tác giả' }))
    fireEvent.click(screen.getByRole('radio', { name: 'A 1' }))
    await waitFor(() => expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Truyện 1']))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('library.grid.only', () => {
  it('library.grid.only: a stored list layout is ignored: cards stay in the grid and no layout control exists', async () => {
    localStorage.setItem('library.layout', 'list')
    await seed([book('a', 'Bản a'), book('b', 'Bản b')], [file('a')])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Bản a' })

    expect(screen.queryByRole('radiogroup', { name: 'Kiểu hiển thị' })).toBeNull()
    expect(card('Bản a').parentElement).toHaveClass('grid')
    expect(card('Bản b').parentElement).toBe(card('Bản a').parentElement)
  })
})

describe('library.layout (classes only)', () => {
  it('library.layout.narrow: filters live in a right-hand aside (drawer below xl), genres are a vertical list and the grid has 2 columns', async () => {
    await seed([book('1', 'Truyện 1', { genres: ['Tiên hiệp'], author: 'A', normAuthor: 'a' })])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Truyện 1' })

    const aside = screen.getByRole('complementary', { name: 'Bộ lọc truyện' })
    expect(aside).toHaveClass('max-xl:fixed', 'max-xl:end-0', 'xl:sticky', 'max-xl:invisible')
    const group = screen.getByRole('radiogroup', { name: 'Thể loại' })
    expect(aside.contains(group)).toBe(true)
    expect(group).toHaveClass('flex-col')
    expect(aside.contains(screen.getByRole('radiogroup', { name: 'Bộ lọc' }))).toBe(true)
    expect(card('Truyện 1').parentElement).toHaveClass('grid', 'grid-cols-2')
  })

  it('library.filter.drawer: the toggle button opens the drawer and the close button, backdrop and Escape close it', async () => {
    await seed([book('1', 'Truyện 1', { genres: ['Tiên hiệp'] })])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Truyện 1' })

    const aside = screen.getByRole('complementary', { name: 'Bộ lọc truyện' })
    expect(aside).toHaveClass('max-xl:invisible')
    fireEvent.click(screen.getByRole('button', { name: 'Mở bộ lọc' }))
    expect(aside).not.toHaveClass('max-xl:invisible')
    expect(aside).toHaveClass('max-xl:translate-x-0')

    fireEvent.click(screen.getByRole('button', { name: 'Đóng bộ lọc' }))
    expect(aside).toHaveClass('max-xl:invisible')

    fireEvent.click(screen.getByRole('button', { name: 'Mở bộ lọc' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(aside).toHaveClass('max-xl:invisible')
  })

  it('library.filter.counts: a genre count is a separate badge inside its chip', async () => {
    await seed([book('1', 'Truyện 1', { genres: ['Tiên hiệp'] }), book('2', 'Truyện 2', { genres: ['Tiên hiệp'] })])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Truyện 1' })

    const chip = screen.getByRole('radio', { name: 'Tiên hiệp 2' })
    const badge = Array.from(chip.querySelectorAll('span')).find((el) => el.textContent === '2')
    expect(badge).toBeDefined()
    expect(badge).toHaveClass('rounded-full', 'tabular-nums')
  })
})

describe('library.sheet', () => {
  it('library.sheet: tapping a cover opens a sheet with Đọc and Tải; it does not open the book', async () => {
    await seed([book('a', 'Bản a')], [file('a')])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Bản a' })

    fireEvent.click(cover('Bản a'))
    expect(location.hash).not.toBe('#/read/a')
    const dialog = screen.getByRole('dialog', { name: 'Bản a' })
    expect(within(dialog).getByRole('button', { name: 'Đọc truyện' })).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: 'Tải tệp EPUB về máy' })).toBeEnabled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('library.sheet: a saved book can have its copy removed, with undo', async () => {
    await seed([book('a', 'Bản a')], [file('a')])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await waitFor(() => expect(within(card('Bản a')).getByRole('img', { name: 'Đã lưu' })).toBeInTheDocument())

    fireEvent.click(sheetButton('Bản a', 'Xoá bản lưu trên máy'))
    await waitFor(() => expect(within(card('Bản a')).queryByRole('img', { name: 'Đã lưu' })).toBeNull())
    expect(await db.bookFiles.get('a')).toBeUndefined()
    expect(toast.value?.action?.label).toBe('Hoàn tác')

    act(() => toast.value?.action?.run())
    await waitFor(() => expect(within(card('Bản a')).getByRole('img', { name: 'Đã lưu' })).toBeInTheDocument())
    expect(await db.bookFiles.get('a')).toBeDefined()
  })
})

describe('library.continue', () => {
  it('library.continue: started books show in "Đọc tiếp", newest first; tapping one opens the reader', async () => {
    await seed(
      [book('a', 'Bản a'), book('b', 'Bản b'), book('c', 'Bản c')],
      [file('a'), file('b')],
      [{ ...progressRow('a', 0.2), updatedAt: 10 }, { ...progressRow('b', 0.5), updatedAt: 20 }, progressRow('c', 1)],
    )
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    const region = await screen.findByRole('region', { name: 'Đọc tiếp (2)' })
    const items = within(region).getAllByRole('button', { name: /^Đọc tiếp/ })
    expect(items.map((b) => b.getAttribute('aria-label'))).toEqual(['Đọc tiếp Bản b', 'Đọc tiếp Bản a'])

    fireEvent.click(items[0])
    expect(screen.getByRole('dialog')).toHaveTextContent('Bản b')
    expect(location.hash).not.toBe('#/read/b')
  })

  it('library.continue: the popup clear-history button clears only that book history, with undo', async () => {
    await seed(
      [book('a', 'Bản a'), book('b', 'Bản b')],
      [file('a'), file('b')],
      [{ ...progressRow('a', 0.2), updatedAt: 10 }, { ...progressRow('b', 0.5), updatedAt: 20 }],
    )
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    const region = await screen.findByRole('region', { name: 'Đọc tiếp (2)' })
    fireEvent.click(within(region).getByRole('button', { name: 'Đọc tiếp Bản b' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xoá lịch sử đọc' }))

    await waitFor(() => expect(within(region).queryByRole('button', { name: 'Đọc tiếp Bản b' })).toBeNull())
    expect(within(region).getByRole('button', { name: 'Đọc tiếp Bản a' })).toBeInTheDocument()
    expect((await db.progress.get('a'))?.deleted).toBe(0)
    expect((await db.progress.get('b'))?.deleted).toBe(1)

    act(() => toast.value?.action?.run())
    await waitFor(() => expect(within(region).getByRole('button', { name: 'Đọc tiếp Bản b' })).toBeInTheDocument())
  })
})

describe('library.continue.dedupe', () => {
  it('library.continue.dedupe: books in "Đọc tiếp" are not repeated in the recent rows or the main list', async () => {
    const now = Date.now()
    await seed(
      [
        book('a', 'Bản a', { modifiedTime: now - 1000 }),
        book('b', 'Bản b', { modifiedTime: now - 2000 }),
        book('c', 'Bản c', { modifiedTime: 100 }),
        book('d', 'Bản d', { modifiedTime: 100 }),
      ],
      [],
      [progressRow('a', 0.4), progressRow('c', 0.3)],
    )
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('region', { name: 'Đọc tiếp (2)' })

    expect(screen.queryByRole('region', { name: /^Truyện mới trong tuần/ })).toBeNull()
    const day = screen.getByRole('region', { name: 'Truyện mới trong ngày (1)' })
    expect(within(day).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Bản b'])
    expect(screen.getAllByRole('article').map((el) => el.getAttribute('data-book-id'))).toEqual(['d'])
  })
})

describe('library.recent.fallback', () => {
  const DAY = 24 * 60 * 60 * 1000
  const ids = (els: HTMLElement[]) => els.map((el) => el.getAttribute('data-book-id'))
  const row = (name: RegExp) => screen.queryByRole('region', { name })
  const show = async (ages: Record<string, number>) => {
    const now = Date.now()
    await seed(Object.entries(ages).map(([id, age]) => book(id, `Bản ${id}`, { modifiedTime: now - age })))
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await waitFor(() => expect(screen.queryAllByRole('article').length).toBeGreaterThan(0))
  }

  it('library.recent.fallback: both rows show while older books remain for the main list', async () => {
    await show({ a: 1000, b: 2 * DAY, c: 30 * DAY })
    expect(row(/^Truyện mới trong ngày/)).not.toBeNull()
    expect(row(/^Truyện mới trong tuần/)).not.toBeNull()
    expect(ids(screen.getAllByRole('article'))).toEqual(['c'])
  })

  it('library.recent.fallback: an empty main list drops the week row and lists its books', async () => {
    await show({ a: 1000, b: 3 * DAY, c: 2 * DAY })
    expect(row(/^Truyện mới trong ngày/)).not.toBeNull()
    expect(row(/^Truyện mới trong tuần/)).toBeNull()
    expect(ids(screen.getAllByRole('article'))).toEqual(['c', 'b'])
  })

  it('library.recent.fallback: still empty without the week row, so the day row is dropped too', async () => {
    await show({ a: 2000, b: 1000 })
    expect(row(/^Truyện mới trong/)).toBeNull()
    expect(ids(screen.getAllByRole('article'))).toEqual(['b', 'a'])
  })
})

describe('library.download.offline', () => {
  it('library.download.offline: uncached cards get a disabled cloud-off download button, cached cards stay enabled', async () => {
    await seed([book('a', 'Bản a'), book('d', 'Bản d')], [file('a')])
    syncStatus.value = { ...syncStatus.value, online: false }
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Bản d' })
    await waitFor(() => expect(within(card('Bản a')).getByRole('img', { name: 'Đã lưu' })).toBeInTheDocument())

    const off = sheetButton('Bản d', 'Cần mạng để tải')
    expect(off).toBeDisabled()
    expect(off.querySelector('[aria-hidden="true"]')?.innerHTML).toBe(iconMarkup('cloud-off'))
    expect(card('Bản d')).toHaveClass('opacity-60')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đóng' }))

    expect(sheetButton('Bản a', 'Tải tệp EPUB về máy')).toBeEnabled()
    expect(card('Bản a')).not.toHaveClass('opacity-60')
  })
})

describe('library.read.navigate', () => {
  it('library.read.navigate: tapping "Đọc" sets the hash to #/read/a', async () => {
    await seed([book('a', 'Bản a')], [file('a')])
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Bản a' })

    fireEvent.click(sheetButton('Bản a', /^Đọc/))
    expect(location.hash).toBe('#/read/a')
  })
})

describe('library.read.offline-disabled', () => {
  it('library.read.offline-disabled: offline and uncached, the read button is disabled with a cloud-off icon', async () => {
    await seed([book('d', 'Bản d')])
    syncStatus.value = { ...syncStatus.value, online: false }
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Bản d' })

    const read = sheetButton('Bản d', 'Cần mạng để đọc')
    expect(read).toBeDisabled()
    expect(read.querySelector('[aria-hidden="true"]')?.innerHTML).toBe(iconMarkup('cloud-off'))
  })
})

describe('app-shell.icons.icon-only (library part)', () => {
  it('app-shell.icons.icon-only: every button outside nav, radiogroup and dialog is icon-only with aria-label === title', async () => {
    await seed([book('a', 'Bản a'), book('d', 'Bản d')], [file('a')])
    catalogStatus.value = { state: 'error', error: 'Không kết nối được Google Drive' }
    render(<LibraryPage services={makeServices({ config: true, source: true }) as any} />)
    await screen.findByRole('article', { name: 'Bản a' })

    const buttons = Array.from(document.querySelectorAll('button')).filter(
      (b) => !b.closest('nav, aside, [role="radiogroup"], [role="radio"], [role="dialog"]') && !b.hasAttribute('data-cover'),
    )
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) {
      expect(b.getAttribute('aria-label')).toBeTruthy()
      expect(b.getAttribute('aria-label')).toBe(b.getAttribute('title'))
      expect(b.textContent?.trim()).toBe('')
    }
  })
})

