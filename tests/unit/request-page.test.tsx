import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/preact'
import { AppDB, type Book } from '../../src/db/db'
import { submitRequest, markSent } from '../../src/requests/request-repo'
import { normalize } from '../../src/domain/title'
import type { RequestFormConfig } from '../../src/config'
import { toast } from '../../src/ui/toast-store'
import { query } from '../../src/ui/library/library-state'
import { RequestPage, type RequestPageProps } from '../../src/ui/request/RequestPage'
import { setOnline } from '../setup'

const CFG: RequestFormConfig = { formId: 'test-form', entryTitle: '111', entryAuthor: '222', entryKey: '333' }
const NO_ACCENT = 'Tên truyện chưa có dấu — hãy gõ tiếng Việt có dấu'

let db: AppDB

beforeEach(() => {
  // Fresh database per test: unique name, so fake-indexeddb state never leaks between tests.
  db = new AppDB(`request-page-test-${crypto.randomUUID()}`)
  setOnline(true)
  toast.value = null
  query.value = ''
})

afterEach(async () => {
  cleanup()
  db.close()
  await db.delete()
})

/** Stands in for the sync engine: marks every unsent row as sent. */
async function markPendingSent(d: AppDB): Promise<void> {
  const rows = await d.storyRequests.filter((r) => r.sentAt === null).toArray()
  for (const r of rows) await markSent(d, r.id)
}

function renderPage(overrides: Partial<RequestPageProps> = {}) {
  const flush = vi.fn(() => markPendingSent(db))
  const utils = render(<RequestPage db={db} formConfig={CFG} flush={flush} {...overrides} />)
  return { ...utils, flush }
}

function fill(label: string, value: string) {
  fireEvent.input(screen.getByLabelText(label), { target: { value } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }))
}

function book(id: string, title: string): Book {
  return {
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
  }
}

describe('request page', () => {
  it('story-request.form.required: empty title shows the message and saves nothing', async () => {
    renderPage()
    fill('Tên truyện', ' !!! ')
    fill('Tác giả (tùy chọn)', 'Vong Ngữ')
    submit()
    expect(await screen.findByText('Nhập tên truyện')).toBeTruthy()
    expect(await db.storyRequests.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('story-request.normalize.title-case: preview shows the normalised values and the list stores them', async () => {
    renderPage()
    fill('Tên truyện', 'phàm nhân TU TIÊN truyện')
    fill('Tác giả (tùy chọn)', 'vong ngữ')
    expect(screen.getByText('Sẽ gửi: Phàm Nhân Tu Tiên Truyện — Vong Ngữ')).toBeTruthy()
    submit()
    const list = await screen.findByRole('region', { name: 'Đã yêu cầu' })
    expect(await within(list).findByText('Phàm Nhân Tu Tiên Truyện')).toBeTruthy()
    expect(within(list).getByText('Vong Ngữ')).toBeTruthy()
    await waitFor(() => {
      expect(toast.value?.text).toBe('Đã gửi yêu cầu')
    })
  })

  it('story-request.normalize.no-accent-warning: first submit only warns, second submit saves', async () => {
    renderPage()
    fill('Tên truyện', 'pham nhan tu tien')
    fill('Tác giả (tùy chọn)', 'vong ngu')
    submit()
    expect(await screen.findByText(NO_ACCENT)).toBeTruthy()
    expect(await db.storyRequests.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)

    submit()
    await waitFor(() => {
      expect(toast.value?.text).toBe('Đã gửi yêu cầu')
    })
    expect(await db.storyRequests.count()).toBe(1)
    expect((await db.storyRequests.toArray())[0].title).toBe('Pham Nhan Tu Tien')
    expect(await db.outbox.count()).toBe(1)
  })

  it('story-request.dedup.device: a repeated request shows the duplicate message and adds nothing', async () => {
    await submitRequest(db, { title: 'Phàm Nhân Tu Tiên', author: 'Vong Ngữ' })
    renderPage()
    // Wait for the live list to load so no query is still open when the database closes.
    await within(await screen.findByRole('region', { name: 'Đã yêu cầu' })).findByText('Phàm Nhân Tu Tiên')
    fill('Tên truyện', 'pham nhan tu tien!')
    fill('Tác giả (tùy chọn)', 'VONG NGU')
    submit()
    expect(await screen.findByText('Bạn đã yêu cầu truyện này')).toBeTruthy()
    expect(screen.queryByText(NO_ACCENT)).toBeNull()
    expect(await db.storyRequests.count()).toBe(1)
    expect(await db.outbox.count()).toBe(1)
  })

  it('story-request.dedup.library: the in-library message links to a library search for the title', async () => {
    await db.books.put(book('b1', 'Đấu Phá Thương Khung'))
    renderPage()
    fill('Tên truyện', 'dau pha thuong khung')
    submit()
    expect(await screen.findByText('Truyện đã có trong thư viện')).toBeTruthy()
    expect(screen.queryByText(NO_ACCENT)).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Xem trong thư viện' }))
    expect(query.value).toBe('Đấu Phá Thương Khung')
    expect(location.hash).toBe('#/')
    expect(await db.storyRequests.count()).toBe(0)
  })

  it('story-request.submit.online: a sent request shows the toast and the Đã gửi badge', async () => {
    const { flush } = renderPage()
    fill('Tên truyện', 'phàm nhân tu tiên')
    fill('Tác giả (tùy chọn)', 'vong ngữ')
    submit()
    await waitFor(() => {
      expect(toast.value?.text).toBe('Đã gửi yêu cầu')
    })
    expect(flush).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Đã gửi')).toBeTruthy()
    expect(screen.queryByText('Chờ gửi')).toBeNull()
  })

  it('story-request.submit.offline: a queued request shows the offline toast and the Chờ gửi badge', async () => {
    setOnline(false)
    const flush = vi.fn(async () => {})
    renderPage({ flush })
    fill('Tên truyện', 'phàm nhân tu tiên')
    fill('Tác giả (tùy chọn)', 'vong ngữ')
    submit()
    await waitFor(() => {
      expect(toast.value?.text).toBe('Đã lưu, sẽ gửi khi có mạng')
    })
    expect(flush).not.toHaveBeenCalled()
    expect(await screen.findByText('Chờ gửi')).toBeTruthy()
    expect(await db.storyRequests.count()).toBe(1)
    expect(await db.outbox.count()).toBe(1)
  })

  it('story-request.config.missing: the notice is shown and submit is disabled', () => {
    renderPage({ formConfig: null })
    expect(screen.getByRole('status').textContent).toBe('Chưa cấu hình Google Form')
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu' })).toBeDisabled()
  })

  it('story-request.layout.wide: two columns only from xl', () => {
    const { container } = renderPage()
    const root = container.firstElementChild as HTMLElement
    const classes = root.className.split(/\s+/)
    expect(classes).toContain('xl:grid')
    expect(classes).toContain('xl:grid-cols-[minmax(0,40rem)_minmax(0,1fr)]')
    expect(classes.some((c) => c.startsWith('lg:grid'))).toBe(false)
    expect(classes).not.toContain('p-4')
    const form = container.querySelector('form') as HTMLElement
    expect(form.className.split(/\s+/)).toContain('w-full')
  })

  it('story-request.language.dropdown: offers 9 common languages and "Ngôn ngữ khác", never Vietnamese', () => {
    renderPage()
    const select = screen.getByLabelText('Ngôn ngữ (tùy chọn)') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    const values = Array.from(select.options).map((o) => o.value).filter((v) => v !== '')
    expect(values).toHaveLength(10)
    expect(values).toContain('Ngôn ngữ khác')
    expect(values).not.toContain('Tiếng Việt')
    expect(values).not.toContain('Việt')
  })

  it('story-request.language.dropdown: the picked language is stored on the request', async () => {
    renderPage()
    fill('Tên truyện', 'Đấu Phá Thương Khung')
    fireEvent.change(screen.getByLabelText('Ngôn ngữ (tùy chọn)'), { target: { value: 'Ngôn ngữ khác' } })
    submit()
    // Wait for the whole save-and-send chain to finish before afterEach closes the database.
    await screen.findByText('Đã gửi')
    const [row] = await db.storyRequests.toArray()
    expect(row.language).toBe('Ngôn ngữ khác')
  })
})
