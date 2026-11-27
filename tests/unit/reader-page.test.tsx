import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, waitFor, within } from '@testing-library/preact'
import { AppDB, type Book, type Progress } from '../../src/db/db'
import { ReaderPage, type ReaderDeps } from '../../src/ui/reader/ReaderPage'
import { CacheError, type CacheDeps, type GetResult } from '../../src/cache/book-cache'
import type { ReaderAdapter } from '../../src/reader/adapter'
import type { RelocateInfo } from '../../src/progress/anchor'
import { loadPrefs } from '../../src/reader/prefs'

type RelocateCb = (info: RelocateInfo & { tocLabel?: string }) => void
type SectionOpts = { onSectionLoad?: (doc: Document, index: number) => void }

let db: AppDB

beforeEach(() => {
  db = new AppDB(`reader-page-${crypto.randomUUID()}`)
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.useRealTimers()
  db.close()
})

function bookRow(id = 'b1'): Book {
  return {
    id,
    name: 'Sách.epub',
    title: 'Sách mẫu',
    normTitle: 'sach mau',
    size: 1,
    modifiedTime: 1,
    md5: 'm1',
    inDrive: 1,
    lastSeenAt: 1,
    updatedAt: 1,
  }
}

function progressRow(overrides: Partial<Progress> = {}): Progress {
  return {
    id: 'b1',
    bookId: 'b1',
    normTitle: 'sach mau',
    cfi: 'old-cfi',
    snippet: '',
    sectionIndex: 0,
    sectionHref: 'c1',
    sectionFraction: 0.5,
    fraction: 0.5,
    bookMd5: 'm1',
    updatedAt: 1,
    deleted: 0,
    ...overrides,
  }
}

function info(cfi: string, fraction = 0.1): RelocateInfo & { tocLabel?: string } {
  return {
    cfi,
    fraction,
    rangeText: 'đoạn văn',
    sectionIndex: 0,
    sectionHref: 'c1',
    sectionFraction: fraction,
    tocLabel: 'Chương 1',
  }
}

/** Test double for the reader engine. `emit` plays the role of foliate's relocate event. */
function fakeAdapter() {
  let cb: RelocateCb | null = null
  return {
    open: vi.fn(async (_file: File) => {}),
    sections: vi.fn((): { href: string }[] => [{ href: 'c1' }]),
    toc: vi.fn((): { label: string; href: string }[] => [{ label: 'Chương 1', href: 'c1' }]),
    goTo: vi.fn(async (_target: string | { index: number; anchor: number }) => true),
    goToFraction: vi.fn(async (_f: number) => {}),
    textAt: vi.fn(async (_cfi: string): Promise<string | null> => null),
    findInSection: vi.fn(async (_i: number, _key: string): Promise<string | null> => null),
    next: vi.fn(async () => {}),
    prev: vi.fn(async () => {}),
    setPrefs: vi.fn((_css: string) => {}),
    onRelocate: vi.fn((f: RelocateCb) => {
      cb = f
      return () => {
        cb = null
      }
    }),
    destroy: vi.fn(() => {}),
    emit(i: RelocateInfo & { tocLabel?: string }) {
      cb?.(i)
    },
  }
}

type FakeAdapter = ReturnType<typeof fakeAdapter>

function okFile(): GetResult {
  return { blob: new Blob(['x']), md5: 'm1', usedOld: false }
}

interface Harness {
  deps: ReaderDeps
  adapter: FakeAdapter
  createAdapter: ReturnType<typeof vi.fn>
  getFile: ReturnType<typeof vi.fn>
  onNotice: ReturnType<typeof vi.fn>
  onBack: ReturnType<typeof vi.fn>
  sectionOpts: () => SectionOpts
}

function harness(): Harness {
  const adapter = fakeAdapter()
  const createAdapter = vi.fn(async (_c: HTMLElement, _o?: SectionOpts) => adapter as unknown as ReaderAdapter)
  const getFile = vi.fn(async (_d: CacheDeps, _id: string, _o?: { onProgress?: (p: number) => void }) => okFile())
  const onNotice = vi.fn()
  const onBack = vi.fn()
  const cacheDeps: CacheDeps = { db, source: null }
  const deps: ReaderDeps = {
    db,
    cacheDeps,
    createAdapter: createAdapter as unknown as ReaderDeps['createAdapter'],
    getFile: getFile as unknown as ReaderDeps['getFile'],
    onNotice,
    onBack,
  }
  return {
    deps,
    adapter,
    createAdapter,
    getFile,
    onNotice,
    onBack,
    sectionOpts: () => createAdapter.mock.calls[0][1] as SectionOpts,
  }
}

/** A section document whose window is 1000 px wide, as foliate would hand us. */
function sectionDoc(width = 1000): Document {
  const doc = document.implementation.createHTMLDocument('section')
  Object.defineProperty(doc, 'defaultView', { value: { innerWidth: width } })
  return doc
}

/** Tap the middle of the section to toggle the chrome. */
function tapCenter(h: Harness): void {
  const doc = sectionDoc()
  h.sectionOpts().onSectionLoad?.(doc, 0)
  act(() => {
    doc.dispatchEvent(new MouseEvent('click', { clientX: 500, bubbles: true }))
  })
}

async function waitReady(h: Harness): Promise<void> {
  await waitFor(() => expect(h.adapter.onRelocate).toHaveBeenCalled())
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
}

// Captured before any fake timers are installed; fake-indexeddb schedules work with it.
const realSetImmediate = (globalThis as unknown as { setImmediate: (cb: () => void) => void }).setImmediate

/** Let pending IndexedDB work run without advancing fake timers. */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i++) await new Promise<void>((r) => realSetImmediate(r))
}

describe('reader page', () => {
  it('reader.open.unknown: unknown id shows the not-found message and a back link', async () => {
    const h = harness()
    render(<ReaderPage id="zzz" {...h.deps} />)
    expect(await screen.findByText('Không tìm thấy truyện')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Về thư viện' })
    expect(link.getAttribute('href')).toBe('#/')
    expect(h.getFile).not.toHaveBeenCalled()
  })

  it('cache.fetch.offline: offline error shows the first-download message', async () => {
    await db.books.put(bookRow())
    const h = harness()
    h.getFile.mockRejectedValueOnce(new CacheError('offline'))
    render(<ReaderPage id="b1" {...h.deps} />)
    expect(await screen.findByText('Cần kết nối mạng để tải truyện này lần đầu')).toBeTruthy()
  })

  it('cache.fetch.interrupted: network error shows the retry icon button which retries', async () => {
    await db.books.put(bookRow())
    const h = harness()
    h.getFile.mockRejectedValueOnce(new CacheError('network'))
    render(<ReaderPage id="b1" {...h.deps} />)
    expect(await screen.findByText('Không tải được truyện')).toBeTruthy()
    expect(screen.getByText('Không tải được truyện, thử lại sau')).toBeTruthy()
    const retry = screen.getByRole('button', { name: 'Thử lại' })
    expect(retry.querySelector('svg')).not.toBeNull()
    fireEvent.click(retry)
    await waitFor(() => expect(h.adapter.open).toHaveBeenCalledTimes(1))
    expect(h.getFile).toHaveBeenCalledTimes(2)
  })

  it('cache.fetch.quota: quota error links to settings', async () => {
    await db.books.put(bookRow())
    const h = harness()
    h.getFile.mockRejectedValueOnce(new CacheError('quota'))
    render(<ReaderPage id="b1" {...h.deps} />)
    expect(await screen.findByText('Bộ nhớ đầy — hãy xoá bớt truyện đã lưu')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Mở Cài đặt' })
    expect(link.getAttribute('href')).toBe('#/settings')
  })

  it('reader.open.progress: loading shows a progressbar with the reported percent', async () => {
    await db.books.put(bookRow())
    const h = harness()
    h.getFile.mockImplementationOnce(async (_d: CacheDeps, _id: string, o?: { onProgress?: (p: number) => void }) => {
      o?.onProgress?.(40)
      return new Promise<GetResult>(() => {})
    })
    render(<ReaderPage id="b1" {...h.deps} />)
    // The bar is mounted from the first render (0 %), so wait for the reported value.
    await waitFor(() =>
      expect(screen.getByRole('progressbar', { name: 'Đang tải truyện' }).getAttribute('aria-valuenow')).toBe('40'),
    )
    expect(screen.getByText('Đang tải 40%')).toBeTruthy()
  })

  it('reader.open.progress: indeterminate progress (null) has no aria-valuenow', async () => {
    await db.books.put(bookRow())
    const h = harness()
    h.getFile.mockImplementationOnce(async (_d: CacheDeps, _id: string, o?: { onProgress?: (p: number | null) => void }) => {
      o?.onProgress?.(null)
      return new Promise<GetResult>(() => {})
    })
    render(<ReaderPage id="b1" {...h.deps} />)
    await waitFor(() =>
      expect(
        screen.getByRole('progressbar', { name: 'Đang tải truyện' }).hasAttribute('aria-valuenow'),
      ).toBe(false),
    )
  })

  it('cache.stale.offline: usedOld triggers the old-copy notice', async () => {
    await db.books.put(bookRow())
    const h = harness()
    h.getFile.mockResolvedValueOnce({ blob: new Blob(['x']), md5: 'm1', usedOld: true })
    render(<ReaderPage id="b1" {...h.deps} />)
    await waitFor(() =>
      expect(h.onNotice).toHaveBeenCalledWith('Đang đọc bản cũ — sẽ cập nhật khi có mạng'),
    )
  })

  it('progress.save.relocate: relocate events are saved after the debounce', async () => {
    await db.books.put(bookRow())
    const h = harness()
    render(<ReaderPage id="b1" {...h.deps} />)
    await waitReady(h)

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    act(() => {
      h.adapter.emit(info('c1'))
      h.adapter.emit(info('c2'))
      h.adapter.emit(info('c3', 0.4))
    })
    await settle()
    expect(await db.progress.get('b1')).toBeUndefined()

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    await vi.waitFor(async () => {
      expect((await db.progress.get('b1'))?.cfi).toBe('c3')
    })
  })

  it('progress.save.hidden: pagehide flushes the pending position immediately', async () => {
    await db.books.put(bookRow())
    const h = harness()
    render(<ReaderPage id="b1" {...h.deps} />)
    await waitReady(h)

    act(() => h.adapter.emit(info('c9', 0.9)))
    expect(await db.progress.get('b1')).toBeUndefined()

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    await waitFor(async () => {
      expect((await db.progress.get('b1'))?.cfi).toBe('c9')
    })
  })

  it('progress.save.hidden: visibilitychange to hidden flushes the pending position', async () => {
    await db.books.put(bookRow())
    const h = harness()
    render(<ReaderPage id="b1" {...h.deps} />)
    await waitReady(h)

    act(() => h.adapter.emit(info('c5', 0.5)))
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await waitFor(async () => {
      expect((await db.progress.get('b1'))?.cfi).toBe('c5')
    })
  })

  it('reader: a non-cfi restore saves the first anchor immediately', async () => {
    await db.books.put(bookRow())
    // Saved under an older book version, so restore cannot use the exact CFI.
    await db.progress.put(progressRow({ bookMd5: 'old', cfi: 'old-cfi', snippet: '' }))
    const h = harness()
    render(<ReaderPage id="b1" {...h.deps} />)
    await waitReady(h)
    expect(h.adapter.goTo).toHaveBeenCalledWith({ index: 0, anchor: 0.5 })

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    act(() => h.adapter.emit(info('c-new', 0.3)))
    await settle()
    const saved = await db.progress.get('b1')
    expect(saved?.cfi).toBe('c-new')
    expect(saved?.bookMd5).toBe('m1')
  })

  it('app-shell.icons.icon-only: reader chrome buttons are icon-only with aria-label equal to title', async () => {
    await db.books.put(bookRow())
    const h = harness()
    render(<ReaderPage id="b1" {...h.deps} />)
    await waitReady(h)
    // Chrome is hidden once ready; a centre tap in the text reveals it.
    expect(document.querySelector('header')).toBeNull()
    tapCenter(h)

    const header = document.querySelector('header')
    expect(header).not.toBeNull()
    const buttons = Array.from(header!.querySelectorAll('button'))
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Về thư viện',
      'Mục lục',
      'Ẩn mục lục',
      'Tuỳ chỉnh chữ',
    ])
    for (const b of buttons) {
      expect(b.textContent?.trim()).toBe('')
      expect(b.querySelector('svg')).not.toBeNull()
      expect(b.getAttribute('title')).toBe(b.getAttribute('aria-label'))
    }
  })

  it('reader.prefs.persist: choosing a larger font saves prefs and calls setPrefs', async () => {
    await db.books.put(bookRow())
    const h = harness()
    render(<ReaderPage id="b1" {...h.deps} />)
    await waitReady(h)
    tapCenter(h)

    fireEvent.click(screen.getByRole('button', { name: 'Tuỳ chỉnh chữ' }))
    fireEvent.click(screen.getByRole('button', { name: 'Chữ lớn hơn' }))

    await waitFor(async () => {
      expect((await loadPrefs(db)).fontScale).toBe(1.1)
    })
    expect(h.adapter.setPrefs).toHaveBeenCalledWith(expect.stringContaining('110%'))
  })

  it('reader.toc.collapse: the side panel hides from its close button and comes back from the top bar', async () => {
    await db.books.put(bookRow())
    const h = harness()
    render(<ReaderPage id="b1" {...h.deps} />)
    await waitReady(h)

    fireEvent.click(screen.getByRole('button', { name: 'Đóng mục lục' }))
    expect(screen.queryByRole('complementary', { name: 'Mục lục' })).toBeNull()

    // The intro controls may or may not be up yet; make sure they are.
    if (!document.querySelector('header')) tapCenter(h)
    fireEvent.click(await screen.findByRole('button', { name: 'Hiện mục lục' }))
    expect(screen.getByRole('complementary', { name: 'Mục lục' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn mục lục' }))
    expect(screen.queryByRole('complementary', { name: 'Mục lục' })).toBeNull()
  })

  it('reader.toc.remember: a hidden side panel stays hidden the next time a book opens', async () => {
    await db.books.put(bookRow())
    const first = harness()
    render(<ReaderPage id="b1" {...first.deps} />)
    await waitReady(first)
    fireEvent.click(screen.getByRole('button', { name: 'Đóng mục lục' }))
    cleanup()

    const second = harness()
    render(<ReaderPage id="b1" {...second.deps} />)
    await waitReady(second)
    expect(screen.queryByRole('complementary', { name: 'Mục lục' })).toBeNull()
  })

  it('reader.toc.go: selecting a TOC entry calls goTo with its href', async () => {
    await db.books.put(bookRow())
    const h = harness()
    render(<ReaderPage id="b1" {...h.deps} />)
    await waitReady(h)

    fireEvent.click(screen.getByRole('button', { name: 'Chương 1' }))
    expect(h.adapter.goTo).toHaveBeenCalledWith('c1')
  })

  it('reader.nav.keys: arrow keys page right after a TOC pick', async () => {
    await db.books.put(bookRow())
    const h = harness()
    render(<ReaderPage id="b1" {...h.deps} />)
    await waitReady(h)

    // A real pick focuses the button first; the key must then reach the reader, not the button.
    const entry = screen.getByRole('button', { name: 'Chương 1' })
    entry.focus()
    fireEvent.click(entry)
    expect(h.adapter.goTo).toHaveBeenCalledWith('c1')

    // Restore with no saved position already called next() once; count from here.
    const nextBefore = h.adapter.next.mock.calls.length
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'ArrowRight' })
    expect(h.adapter.next.mock.calls.length).toBe(nextBefore + 1)
  })

  it('reader.toc.go: TOC entries are disabled until the book is ready', async () => {
    await db.books.put(bookRow())
    // A saved position makes restore call goTo first; holding that call keeps the overlay up
    // while the TOC is already rendered.
    await db.progress.put(progressRow({ cfi: 'old-cfi' }))
    const h = harness()
    let finishRestore: (landed: boolean) => void = () => {}
    h.adapter.goTo.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => { finishRestore = resolve }),
    )
    render(<ReaderPage id="b1" {...h.deps} />)

    await waitFor(() => expect(h.adapter.goTo).toHaveBeenCalledWith('old-cfi'))
    const aside = screen.getByRole('complementary', { name: 'Mục lục' })
    await waitFor(() => expect(within(aside).getByRole('button', { name: 'Chương 1' })).toBeTruthy())
    expect(screen.getByRole('status')).toBeTruthy()
    expect((within(aside).getByRole('button', { name: 'Chương 1' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Mục lục' }))
    const sheet = screen.getByRole('dialog', { name: 'Mục lục' })
    expect((within(sheet).getByRole('button', { name: 'Chương 1' }) as HTMLButtonElement).disabled).toBe(true)

    finishRestore(true)
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect((within(aside).getByRole('button', { name: 'Chương 1' }) as HTMLButtonElement).disabled).toBe(false)
    expect((within(sheet).getByRole('button', { name: 'Chương 1' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
