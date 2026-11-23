import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/preact'
import { DraftList } from '../../deployer/src/ui/DraftCard'
import { fakeWorker, makeStore, epubFile, settle, installObjectUrl, removeObjectUrl, metadata } from './ui-fakes'

beforeEach(() => installObjectUrl())
afterEach(() => {
  cleanup()
  removeObjectUrl()
})

async function seed(store: ReturnType<typeof makeStore>, names: string[]) {
  await store.addFiles(names.map((n) => epubFile(n)))
  await settle(store)
}

describe('DraftCard review', () => {
  it('deployer.review.edit: changing an unedited title moves the slug and recomputes the status', async () => {
    // The fake md5 is "md5:<file name>". The catalog has dau-pha with this file's md5, so once the
    // title (and so the slug) changes to Đấu Phá, the draft is "Đã có" (same content, already published).
    const worker = fakeWorker({ books: [metadata('dau-pha', 'Đấu Phá', { md5: 'md5:Phàm Nhân.epub' })] })
    const store = makeStore(worker)
    await store.connect()
    await seed(store, ['Phàm Nhân.epub'])
    render(<DraftList store={store} />)

    const card = screen.getByRole('article', { name: 'Phàm Nhân' })
    expect(within(card).getByLabelText('Thư mục (slug)')).toHaveValue('pham-nhan')
    expect(within(card).getByText('Mới')).toBeInTheDocument()
    expect(within(card).getByLabelText('Chọn')).toBeChecked()

    fireEvent.input(within(card).getByLabelText('Tên truyện'), { target: { value: 'Đấu Phá' } })

    await waitFor(() => expect(within(card).getByLabelText('Thư mục (slug)')).toHaveValue('dau-pha'))
    expect(within(card).getByText('Đã có')).toBeInTheDocument()
    expect(within(card).getByLabelText('Chọn')).not.toBeChecked()
  })

  it('deployer.review.labels: the card fields and "Chọn" are named by their labels', async () => {
    const store = makeStore(fakeWorker())
    await seed(store, ['Phàm Nhân.epub'])
    render(<DraftList store={store} />)
    const card = screen.getByRole('article', { name: 'Phàm Nhân' })

    for (const name of ['Tên truyện', 'Tác giả', 'Thư mục (slug)', 'Thể loại khác']) {
      const input = within(card).getByRole('textbox', { name })
      expect(card.querySelector(`label[for="${input.id}"]`)).toHaveTextContent(name)
    }
    const pick = within(card).getByRole('checkbox', { name: 'Chọn' })
    expect(card.querySelector(`label[for="${pick.id}"]`)).toHaveTextContent('Chọn')
  })

  it('deployer.review.edit: genre toggles and the free-text genre field', async () => {
    const store = makeStore(fakeWorker())
    await seed(store, ['Phàm Nhân.epub'])
    render(<DraftList store={store} />)
    const card = screen.getByRole('article', { name: 'Phàm Nhân' })

    fireEvent.click(within(card).getByRole('button', { name: 'Tiên hiệp' }))
    expect(within(card).getByRole('button', { name: 'Tiên hiệp' })).toHaveAttribute('aria-pressed', 'true')
    expect(store.drafts.value[0].genres).toEqual(['Tiên hiệp'])

    const other = within(card).getByLabelText('Thể loại khác')
    fireEvent.input(other, { target: { value: 'kiếm hiệp' } })
    fireEvent.keyDown(other, { key: 'Enter' })
    expect(store.drafts.value[0].genres).toEqual(['Tiên hiệp', 'Kiếm Hiệp'])
    expect(within(card).getByRole('button', { name: 'Bỏ thể loại Kiếm Hiệp' })).toBeInTheDocument()
  })

  it('deployer.review.invalid-slug: a slug with capitals or spaces shows the slug error', async () => {
    const store = makeStore(fakeWorker())
    await seed(store, ['Phàm Nhân.epub'])
    render(<DraftList store={store} />)
    const card = screen.getByRole('article', { name: 'Phàm Nhân' })

    fireEvent.input(within(card).getByLabelText('Thư mục (slug)'), { target: { value: 'Đấu Phá' } })

    expect(await within(card).findByText('Chỉ dùng a-z, 0-9 và dấu -')).toBeInTheDocument()
    expect(within(card).getByLabelText('Thư mục (slug)')).toHaveAttribute('aria-invalid', 'true')
  })

  it('deployer.review.status: a slug owned by another title shows "Sẽ ghi đè «…»" and unticks the draft', async () => {
    const worker = fakeWorker({ books: [metadata('pham-nhan', 'Phàm Nhân Cũ', { md5: 'md5:other' })] })
    const store = makeStore(worker)
    await store.connect()
    await seed(store, ['Phàm Nhân.epub'])
    render(<DraftList store={store} />)
    const card = screen.getByRole('article', { name: 'Phàm Nhân' })

    // Suggested slug avoids the other book, so the draft starts ticked.
    expect(within(card).getByLabelText('Thư mục (slug)')).toHaveValue('pham-nhan-2')
    expect(within(card).getByLabelText('Chọn')).toBeChecked()

    fireEvent.input(within(card).getByLabelText('Thư mục (slug)'), { target: { value: 'pham-nhan' } })

    expect(await within(card).findByText('Sẽ ghi đè «Phàm Nhân Cũ»')).toBeInTheDocument()
    expect(within(card).getByLabelText('Chọn')).not.toBeChecked()
  })

  it('deployer.cover.generated: a draft without an EPUB cover shows "Bìa tự tạo"', async () => {
    const store = makeStore(fakeWorker())
    await seed(store, ['Phàm Nhân.epub'])
    render(<DraftList store={store} />)
    const card = screen.getByRole('article', { name: 'Phàm Nhân' })
    expect(within(card).getByText('Bìa tự tạo')).toBeInTheDocument()
  })
})
