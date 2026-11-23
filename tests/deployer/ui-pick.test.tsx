import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact'
import { App } from '../../deployer/src/app'
import { fakeWorker, makeStore, epubFile, settle, installObjectUrl, removeObjectUrl } from './ui-fakes'

beforeEach(() => installObjectUrl())
afterEach(() => {
  cleanup()
  removeObjectUrl()
})

const PICKER = 'Chọn hoặc kéo thả tệp EPUB vào đây'

function batch(): File[] {
  const epubs = Array.from({ length: 12 }, (_, i) => epubFile(`Truyện ${i + 1}.epub`))
  const pdf = new File(['%PDF-1.4'], 'ghi-chu.pdf', { type: 'application/pdf' })
  return [...epubs, pdf]
}

describe('pick many', () => {
  it('deployer.pick.many: file input has an accessible name', () => {
    const store = makeStore(fakeWorker())
    const { container } = render(<App store={store} />)

    const input = container.querySelector('input[type="file"]')
    expect(input).not.toBeNull()
    expect(input!.getAttribute('id')).toBe('epub-files')
    expect(input!.getAttribute('aria-label')).toBe(PICKER)
  })

  it('deployer.pick.many: 12 EPUBs and 1 PDF make 12 book cards and the notice', async () => {
    const store = makeStore(fakeWorker())
    render(<App store={store} />)

    fireEvent.change(screen.getByLabelText(PICKER), { target: { files: batch() } })

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(12))
    expect(screen.getByText('Bỏ qua 1 tệp không phải EPUB')).toBeInTheDocument()
    await settle(store)
    expect(store.drafts.value).toHaveLength(12)
  })

  it('deployer.pick.many: dropping files on the zone adds them the same way', async () => {
    const store = makeStore(fakeWorker())
    render(<App store={store} />)

    fireEvent.drop(screen.getByLabelText(PICKER).closest('label')!, { dataTransfer: { files: batch() } })

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(12))
    expect(screen.getByText('Bỏ qua 1 tệp không phải EPUB')).toBeInTheDocument()
    await settle(store)
  })
})
