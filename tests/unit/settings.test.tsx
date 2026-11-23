import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/preact'
import { AppDB, type Book } from '../../src/db/db'
import { saveProgress, getProgress, listLiveProgress, type AnchorInput } from '../../src/progress/progress-repo'
import { exportData } from '../../src/data/backup'
import { SettingsPage, type SettingsProps } from '../../src/ui/settings/SettingsPage'

const MB = 1048576

let db: AppDB

beforeEach(() => {
  // Fresh database per test: unique name, so fake-indexeddb state never leaks between tests.
  db = new AppDB(`settings-test-${crypto.randomUUID()}`)
})

afterEach(async () => {
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
  const onRefresh = vi.fn()
  const utils = render(<SettingsPage db={db} config={null} onRefresh={onRefresh} {...overrides} />)
  return { ...utils, onRefresh }
}

describe('settings', () => {
  it('cache.clear.one: deleting one cached book keeps the other and the position', async () => {
    await seed(db)
    const before = await getProgress(db, 'a')
    renderPage()
    const [del] = await screen.findAllByRole('button', { name: 'Xoá bản lưu: A' })
    fireEvent.click(del)
    await waitFor(async () => {
      expect((await db.bookFiles.toArray()).map((f) => f.bookId)).toEqual(['b'])
    })
    expect(await getProgress(db, 'a')).toEqual(before)
  })

  it('cache.clear.all: confirm deletes every cached file but keeps positions', async () => {
    await seed(db)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Xoá toàn bộ cache' }))
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
    fireEvent.click(await screen.findByRole('button', { name: 'Xoá toàn bộ cache' }))
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

  it('cache.layout.narrow: cached list renders as a list hidden on large screens', async () => {
    await seed(db)
    const { container } = renderPage()
    await screen.findAllByRole('button', { name: 'Xoá bản lưu: B' })
    const list = container.querySelector('ul')
    expect(list).not.toBeNull()
    expect(list!.classList.contains('lg:hidden')).toBe(true)
    const items = within(list!).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('B')
    expect(items[0].textContent).toContain('0,5 MB')
    expect(items[0].textContent).toContain('09/01/2026')
    expect(items[1].textContent).toContain('A')
    expect(items[1].textContent).toContain('1,0 MB')
    expect(items[1].textContent).toContain('05/01/2026')
    const btn = within(items[0]).getByRole('button', { name: 'Xoá bản lưu: B' })
    expect(btn.className).toContain('min-h-11')
    expect(btn.className).toContain('min-w-11')
  })

  it('cache.layout.wide: cached list renders as a table shown on large screens', async () => {
    await seed(db)
    const { container } = renderPage()
    await screen.findAllByRole('button', { name: 'Xoá bản lưu: B' })
    const table = container.querySelector('table')
    expect(table).not.toBeNull()
    expect(table!.classList.contains('hidden')).toBe(true)
    expect(table!.classList.contains('lg:table')).toBe(true)
    for (const h of ['Tên truyện', 'Dung lượng', 'Mở lần cuối']) {
      expect(within(table!).getByRole('columnheader', { name: h })).toBeTruthy()
    }
    const rows = within(table!).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('B')
    expect(rows[0].textContent).toContain('0,5 MB')
    expect(rows[0].textContent).toContain('09/01/2026')
    expect(rows[1].textContent).toContain('1,0 MB')
    const btn = within(rows[0]).getByRole('button', { name: 'Xoá bản lưu: B' })
    expect(btn.className).toContain('min-h-11')
    expect(btn.className).toContain('min-w-11')
  })

  it('app-shell.icons.icon-only: settings buttons outside dialogs have an svg, no text, and aria-label equals title', async () => {
    await seed(db)
    const { container } = renderPage()
    await screen.findAllByRole('button', { name: 'Xoá bản lưu: A' })
    const buttons = Array.from(container.querySelectorAll('button'))
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) {
      expect(b.querySelector('svg'), b.getAttribute('aria-label') ?? '').not.toBeNull()
      expect(b.textContent?.trim()).toBe('')
      expect(b.getAttribute('aria-label')).toBeTruthy()
      expect(b.getAttribute('aria-label')).toBe(b.getAttribute('title'))
    }
  })

  it('settings: refresh calls onRefresh', () => {
    const { onRefresh } = renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
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

  it('app-shell.config.settings: source section shows the worker host', () => {
    renderPage({ config: { baseUrl: 'https://tu-truyen.example.workers.dev' } })
    const section = screen.getByRole('region', { name: 'Máy chủ truyện' })
    expect(within(section).getByText('tu-truyen.example.workers.dev')).toBeTruthy()
    expect(screen.queryByText(/Google Drive/)).toBeNull()
  })

  it('app-shell.config.settings: source section says not configured when config is null', () => {
    renderPage({ config: null })
    const section = screen.getByRole('region', { name: 'Máy chủ truyện' })
    expect(within(section).getByText('Chưa cấu hình')).toBeTruthy()
  })
})
