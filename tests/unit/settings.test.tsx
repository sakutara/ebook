import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/preact'
import { AppDB, type Book } from '../../src/db/db'
import { saveProgress, getProgress, listLiveProgress, type AnchorInput } from '../../src/progress/progress-repo'
import { exportData } from '../../src/data/backup'
import { SettingsPage, type SettingsProps } from '../../src/ui/settings/SettingsPage'
import { toast } from '../../src/ui/toast-store'

const MB = 1048576

let db: AppDB

beforeEach(() => {
  // Fresh database per test: unique name, so fake-indexeddb state never leaks between tests.
  db = new AppDB(`settings-test-${crypto.randomUUID()}`)
})

afterEach(async () => {
  toast.value = null
  cleanup()
  db.close()
  await db.delete()
})

function book(id: string, title: string): Book {
  return {
    id,
    name: `${title}.epub`,
    title,
    normTitle: title.toLowerCase(),
    size: 1,
    modifiedTime: 1,
    md5: `md5-${id}`,
    inDrive: 1,
    lastSeenAt: 1,
    updatedAt: 1,
  }
}

function anchor(bookId: string): AnchorInput {
  return {
    id: bookId,
    bookId,
    normTitle: bookId,
    cfi: 'epubcfi(/6/2)',
    snippet: '',
    sectionIndex: 0,
    sectionHref: '',
    sectionFraction: 0,
    fraction: 0.5,
    bookMd5: `md5-${bookId}`,
  }
}

// "a" is 1,0 MB, opened 5 Jan 2026. "b" is 0,5 MB, opened 9 Jan 2026 (so "b" sorts first).
const OPENED_A = new Date(2026, 0, 5).getTime()
const OPENED_B = new Date(2026, 0, 9).getTime()

async function seed(d: AppDB) {
  await d.books.bulkPut([book('a', 'A'), book('b', 'B')])
  await d.bookFiles.bulkPut([
    { bookId: 'a', blob: new Blob(['x']), size: MB, md5: 'md5-a', modifiedTime: 1, cachedAt: 1, lastOpenedAt: OPENED_A },
    { bookId: 'b', blob: new Blob(['x']), size: MB / 2, md5: 'md5-b', modifiedTime: 1, cachedAt: 1, lastOpenedAt: OPENED_B },
  ])
  await saveProgress(d, anchor('a'), 1000)
  await saveProgress(d, anchor('b'), 1000)
}

function renderPage(overrides: Partial<SettingsProps> = {}) {
  return render(<SettingsPage db={db} {...overrides} />)
}

describe('settings', () => {
  it('cache.clear.one: deleting one cached book removes it at once, offers undo and keeps the position', async () => {
    await seed(db)
    const before = await getProgress(db, 'a')
    renderPage()
    const [del] = await screen.findAllByRole('button', { name: 'Xoá bản lưu: A' })
    fireEvent.click(del)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Xoá bản lưu: A' })).toBeNull())
    expect(toast.value?.action?.label).toBe('Hoàn tác')
    expect((await db.bookFiles.toArray()).map((f) => f.bookId)).toEqual(['b'])
    expect(await getProgress(db, 'a')).toEqual(before)
  })

  it('cache.clear.undo: "Hoàn tác" keeps the saved copy', async () => {
    await seed(db)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Xoá bản lưu: A' }))
    await waitFor(() => expect(toast.value?.action).toBeDefined())
    toast.value?.action?.run()
    expect(await screen.findByRole('button', { name: 'Xoá bản lưu: A' })).toBeTruthy()
    expect(await db.bookFiles.count()).toBe(2)
  })

  it('cache.clear.selected: ticking rows deletes only those', async () => {
    await seed(db)
    renderPage()
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Chọn B' }))
    fireEvent.click(screen.getByRole('button', { name: 'Xoá 1 truyện đã chọn' }))
    await waitFor(async () => expect((await db.bookFiles.toArray()).map((f) => f.bookId)).toEqual(['a']))
  })

  it('cache.clear.all: confirm deletes every cached file but keeps positions', async () => {
    await seed(db)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Xoá tất cả bản lưu' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá' }))
    await waitFor(async () => {
      expect(await db.bookFiles.count()).toBe(0)
    })
    expect(await listLiveProgress(db)).toHaveLength(2)
    expect(await screen.findByText('0 truyện · 0,0 MB')).toBeTruthy()
  })

  it('cache.clear.cancel: cancelling the dialog deletes nothing', async () => {
    await seed(db)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Xoá tất cả bản lưu' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Huỷ' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await db.bookFiles.count()).toBe(2)
    expect(await listLiveProgress(db)).toHaveLength(2)
  })

  it('progress.clear.all: confirming clears all positions', async () => {
    await seed(db)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Xoá tiến độ đọc' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xoá' }))
    await waitFor(async () => {
      expect(await listLiveProgress(db)).toHaveLength(0)
    })
  })

  it('cache.layout: one list for every width, newest opened first, with size and date', async () => {
    await seed(db)
    const { container } = renderPage()
    await screen.findAllByRole('button', { name: 'Xoá bản lưu: B' })
    expect(container.querySelector('table')).toBeNull()
    const list = container.querySelector('ul')!
    expect(list.classList.contains('lg:hidden')).toBe(false)
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('B')
    expect(items[0].textContent).toContain('0,5 MB')
    expect(items[0].textContent).toContain('09/01/2026')
    expect(items[1].textContent).toContain('1,0 MB')
    expect(items[1].textContent).toContain('05/01/2026')
    const btn = within(items[0]).getByRole('button', { name: 'Xoá bản lưu: B' })
    expect(btn.className).toContain('min-h-11')
    expect(btn.className).toContain('min-w-11')
  })

  it('cache.layout.sort: sorting by size puts the largest first', async () => {
    await seed(db)
    const { container } = renderPage()
    await screen.findAllByRole('button', { name: 'Xoá bản lưu: B' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Sắp xếp truyện đã lưu' }), { target: { value: 'size' } })
    const items = within(container.querySelector('ul')!).getAllByRole('listitem')
    expect(items[0].textContent).toContain('1,0 MB')
  })

  it('settings.labels: actions outside the list are labelled buttons with visible text', async () => {
    await seed(db)
    renderPage()
    await screen.findAllByRole('button', { name: 'Xoá bản lưu: A' })
    for (const name of ['Xoá tất cả bản lưu', 'Xoá tiến độ đọc', 'Xuất dữ liệu', 'Nhập dữ liệu']) {
      const b = screen.getByRole('button', { name })
      expect(b.textContent?.trim()).toBe(name)
      expect(b.querySelector('svg')).not.toBeNull()
    }
  })

  it('settings: import shows the imported count', async () => {
    // Real round trip: export a seeded db (2 progress rows), then import the file through the input.
    await seed(db)
    const json = await (await exportData(db)).text()
    renderPage()
    const input = screen.getByLabelText('Chọn tệp sao lưu') as HTMLInputElement
    const file = new File([json], 'backup.json', { type: 'application/json' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('Đã nhập 2 mục')
    })
  })

  it('app-shell.config.settings: the page never shows the server address or a server section', () => {
    const { container } = render(<SettingsPage db={db} />)
    expect(screen.queryByRole('region', { name: 'Máy chủ truyện' })).toBeNull()
    expect(container.textContent).not.toMatch(/workers\.dev|https?:\/\/|Máy chủ/)
  })
})
