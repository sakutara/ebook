import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup, act } from '@testing-library/preact'
import { render as renderPreact } from 'preact'
import { AppDB, type Book, type Progress } from '../../src/db/db'
import { normalize } from '../../src/domain/title'
import { catalogStatus } from '../../src/catalog/catalog-sync'
import { syncStatus } from '../../src/sync/sync-engine'
import { Icon } from '../../src/ui/icons/Icon'
import { query, filter } from '../../src/ui/library/library-state'
import { LibraryPage } from '../../src/ui/library/LibraryPage'
import { SearchBar } from '../../src/ui/library/SearchBar'
import type { DriveApi } from '../../src/drive/drive-api'

let db: AppDB

beforeEach(() => {
  // Fresh database per test: unique name, so fake-indexeddb state never leaks between tests.
  db = new AppDB(`library-test-${crypto.randomUUID()}`)
  query.value = ''
  filter.value = 'all'
  catalogStatus.value = { state: 'idle' }
  syncStatus.value = { ...syncStatus.value, online: true }
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

function makeServices(opts: { config?: boolean; api?: boolean } = {}) {
  const api = opts.api
    ? ({
        downloadUrl: (id: string) => `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`,
      } as unknown as DriveApi)
    : null
  return {
    db,
    api,
    config: opts.config ? { apiKey: 'k', folderId: 'f' } : null,
    catalogSync: { sync: vi.fn(async () => {}) } as any,
    coverService: { get: vi.fn(async () => null) } as any,
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

describe('app-shell.config.missing', () => {
  it('app-shell.config.missing: shows the notice, makes no Drive request and shows the cached book', async () => {
    await seed([book('a', 'Sách A')], [file('a')])
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const services = makeServices({ config: false, api: false })
    render(<LibraryPage services={services as any} />)

    expect(await screen.findByRole('article', { name: 'Sách A' })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Chưa cấu hình thư mục Google Drive')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(services.catalogSync.sync).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Làm mới' })).toBeNull()
  })
})

describe('library.grid.sorted (page)', () => {
  it('library.grid.sorted: renders cards in normTitle order', async () => {
    await seed([book('1', 'Ánh Trăng'), book('2', 'Bạch Lộc'), book('3', 'an bình')])
    render(<LibraryPage services={makeServices({ config: true, api: true }) as any} />)
    await screen.findByRole('article', { name: 'an bình' })
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
    render(<LibraryPage services={makeServices({ config: true, api: true }) as any} />)
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
    render(<LibraryPage services={makeServices({ config: true, api: true }) as any} />)
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

    const first = render(<LibraryPage services={makeServices({ config: true, api: true }) as any} />)
    await screen.findByRole('article', { name: 'Đế Bá' })

    // Scrolling is saved (throttled to animation frames), not written on unmount.
    Object.defineProperty(window, 'scrollY', { value: 420, configurable: true, writable: true })
    window.dispatchEvent(new Event('scroll'))
    await waitFor(() => expect(sessionStorage.getItem('library.scrollY')).toBe('420'))
    first.unmount()
    expect(sessionStorage.getItem('library.scrollY')).toBe('420')

    scrollTo.mockClear()
    cardCountAtScroll.length = 0
    render(<LibraryPage services={makeServices({ config: true, api: true }) as any} />)
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
    render(<LibraryPage services={makeServices({ config: true, api: true }) as any} />)
    await screen.findByRole('article', { name: 'Đế Bá' })

    fireEvent.input(screen.getByRole('searchbox', { name: 'Tìm truyện' }), { target: { value: 'zzz' } })
    expect(await screen.findByText('Không tìm thấy truyện nào', {}, { timeout: 1000 })).toBeInTheDocument()
  })
})

describe('library.search.empty (empty catalog)', () => {
  it('library.search.empty: an empty catalog shows "Chưa có truyện nào"', async () => {
    render(<LibraryPage services={makeServices({ config: true, api: true }) as any} />)
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
    render(<LibraryPage services={makeServices({ config: true, api: true }) as any} />)
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
    render(<LibraryPage services={makeServices({ config: true, api: true }) as any} />)
    await screen.findByRole('article', { name: 'Bản d' })
    await waitFor(() => expect(within(card('Bản a')).getByText('Đã lưu')).toBeInTheDocument())
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
    render(<LibraryPage services={makeServices({ config: true, api: true }) as any} />)
    await screen.findByRole('article', { name: 'Bản d' })
    // No waitFor: the grid must not render until every live query has delivered.
    expect(within(card('Bản a')).getByText('Đã lưu')).toBeInTheDocument()
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

    render(<LibraryPage services={makeServices({ config: true, api: true }) as any} />)
    await waitFor(() => expect(within(card('Sách a')).getByText('Đã lưu')).toBeInTheDocument())
    fireEvent.click(within(card('Sách a')).getByRole('button', { name: 'Tải' }))

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
    const services = makeServices({ config: true, api: true }) as any
    services.api.fetchBook = vi.fn(async () => new Blob(['epub'], { type: 'application/epub+zip' }))
    render(<LibraryPage services={services} />)
    await screen.findByRole('article', { name: 'Bản d' })

    fireEvent.click(within(card('Bản d')).getByRole('button', { name: 'Tải' }))
    await waitFor(() => expect(created).toHaveLength(1))
    expect(assign).not.toHaveBeenCalled()
    expect(await db.bookFiles.get('d')).toBeDefined()
  })

  it('library.download.remote: builds the Drive URL inline when there is no api', async () => {
    await seed([book('d', 'Bản d')])
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign, hash: '' })
    render(<LibraryPage services={makeServices({ config: false, api: false }) as any} />)
    await screen.findByRole('article', { name: 'Bản d' })

    fireEvent.click(within(card('Bản d')).getByRole('button', { name: 'Tải' }))
    expect(assign).toHaveBeenCalledWith('https://drive.google.com/uc?export=download&id=d')
  })
})

describe('library.download.offline', () => {
  it('library.download.offline: uncached cards get a disabled cloud-off download button, cached cards stay enabled', async () => {
    await seed([book('a', 'Bản a'), book('d', 'Bản d')], [file('a')])
    syncStatus.value = { ...syncStatus.value, online: false }
    render(<LibraryPage services={makeServices({ config: true, api: true }) as any} />)
    await screen.findByRole('article', { name: 'Bản d' })
    await waitFor(() => expect(within(card('Bản a')).getByText('Đã lưu')).toBeInTheDocument())

    const off = within(card('Bản d')).getByRole('button', { name: 'Cần mạng để tải' })
    expect(off).toBeDisabled()
    expect(off.querySelector('[aria-hidden="true"]')?.innerHTML).toBe(iconMarkup('cloud-off'))
    expect(card('Bản d')).toHaveClass('opacity-60')

    expect(within(card('Bản a')).getByRole('button', { name: 'Tải' })).toBeEnabled()
    expect(card('Bản a')).not.toHaveClass('opacity-60')
  })
})

describe('library.read.navigate', () => {
  it('library.read.navigate: tapping "Đọc" sets the hash to #/read/a', async () => {
    await seed([book('a', 'Bản a')], [file('a')])
    render(<LibraryPage services={makeServices({ config: true, api: true }) as any} />)
    await screen.findByRole('article', { name: 'Bản a' })

    fireEvent.click(within(card('Bản a')).getByRole('button', { name: 'Đọc' }))
    expect(location.hash).toBe('#/read/a')
  })
})

describe('library.read.offline-disabled', () => {
  it('library.read.offline-disabled: offline and uncached, the read button is disabled with a cloud-off icon', async () => {
    await seed([book('d', 'Bản d')])
    syncStatus.value = { ...syncStatus.value, online: false }
    render(<LibraryPage services={makeServices({ config: true, api: true }) as any} />)
    await screen.findByRole('article', { name: 'Bản d' })

    const read = within(card('Bản d')).getByRole('button', { name: 'Cần mạng để đọc' })
    expect(read).toBeDisabled()
    expect(read.querySelector('[aria-hidden="true"]')?.innerHTML).toBe(iconMarkup('cloud-off'))
  })
})

describe('app-shell.icons.icon-only (library part)', () => {
  it('app-shell.icons.icon-only: every button outside nav, radiogroup and dialog is icon-only with aria-label === title', async () => {
    await seed([book('a', 'Bản a'), book('d', 'Bản d')], [file('a')])
    catalogStatus.value = { state: 'error', error: 'Không kết nối được Google Drive' }
    render(<LibraryPage services={makeServices({ config: true, api: true }) as any} />)
    await screen.findByRole('article', { name: 'Bản a' })

    const buttons = Array.from(document.querySelectorAll('button')).filter(
      (b) => !b.closest('nav, [role="radiogroup"], [role="radio"], [role="dialog"]'),
    )
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) {
      expect(b.getAttribute('aria-label')).toBeTruthy()
      expect(b.getAttribute('aria-label')).toBe(b.getAttribute('title'))
      expect(b.textContent?.trim()).toBe('')
    }
  })
})

describe('library.layout.list', () => {
  it('library.layout.list: list layout shows no cover image and the toggle switches the layout', async () => {
    await seed([book('a', 'Bản a')], [file('a')])
    render(<LibraryPage services={makeServices({ config: true, api: true }) as any} />)
    await screen.findByRole('article', { name: 'Bản a' })
    expect(within(card('Bản a')).getByRole('img', { name: 'Bản a' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Danh sách' }))
    expect(screen.getByRole('radio', { name: 'Danh sách' })).toHaveAttribute('aria-checked', 'true')
    expect(within(card('Bản a')).queryByRole('img', { name: 'Bản a' })).toBeNull()
    expect(localStorage.getItem('library.layout')).toBe('list')

    fireEvent.click(screen.getByRole('radio', { name: 'Lưới' }))
    expect(within(card('Bản a')).getByRole('img', { name: 'Bản a' })).toBeInTheDocument()
    localStorage.removeItem('library.layout')
  })
})
