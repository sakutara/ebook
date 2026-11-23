import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, fireEvent, cleanup } from '@testing-library/preact'
import { render as renderPreact } from 'preact'
import type { Book } from '../../src/db/db'
import { normalize } from '../../src/domain/title'
import { Icon } from '../../src/ui/icons/Icon'
import { BookCard, type BookCardProps } from '../../src/ui/library/BookCard'
import type { CardModel } from '../../src/ui/library/library-model'

afterEach(() => {
  cleanup()
})

function book(title: string, over: Partial<Book> = {}): Book {
  return {
    id: 'd',
    name: `${title}.epub`,
    title,
    normTitle: normalize(title),
    author: '',
    normAuthor: '',
    genres: [],
    description: '',
    size: 2_000_000,
    modifiedTime: 100,
    md5: 'md5-d',
    inDrive: 1,
    lastSeenAt: 1,
    updatedAt: 1,
    ...over,
  }
}

function model(over: Partial<CardModel> = {}, bookOver: Partial<Book> = {}): CardModel {
  return { book: book('Bản d', bookOver), cached: false, stale: false, localOnly: false, ...over }
}

function renderCard(props: Partial<BookCardProps> = {}) {
  const handlers = {
    onRead: vi.fn(),
    onDownload: vi.fn(),
    onCancel: vi.fn(),
  }
  const utils = render(
    <BookCard card={model()} online={true} onRead={handlers.onRead} onDownload={handlers.onDownload} onCancel={handlers.onCancel} {...props} />,
  )
  return { ...utils, ...handlers }
}

/** Markup of an Icon, rendered in isolation, to compare against a button's icon. */
function iconMarkup(name: Parameters<typeof Icon>[0]['name']): string {
  const el = document.createElement('div')
  renderPreact(<Icon name={name} />, el)
  const html = el.firstElementChild!.innerHTML
  renderPreact(null, el)
  return html
}

const article = () => screen.getByRole('article', { name: 'Bản d' })

describe('library.progress.shown', () => {
  it('library.progress.shown: a progress value shows a progressbar with aria-valuenow and "Đang tải 25%"', () => {
    renderCard({ progress: 25 })

    const bar = within(article()).getByRole('progressbar', { name: 'Đang tải truyện' })
    expect(bar).toHaveAttribute('aria-valuenow', '25')
    expect(within(article()).getByText('Đang tải 25%')).toBeInTheDocument()
  })

  it('library.progress.shown: while fetching, the Đọc and Tải buttons are not shown', () => {
    renderCard({ progress: 25 })

    expect(within(article()).queryByRole('button', { name: 'Đọc' })).toBeNull()
    expect(within(article()).queryByRole('button', { name: 'Tải' })).toBeNull()
    expect(within(article()).queryByRole('button', { name: 'Cần mạng để đọc' })).toBeNull()
  })

  it('library.progress.shown: the reading-progress bar stays visible while a download runs', () => {
    renderCard({ card: model({ fraction: 0.5 }), progress: 25 })

    expect(within(article()).getByRole('progressbar', { name: 'Tiến độ đọc' })).toHaveAttribute('aria-valuenow', '50')
  })
})

describe('library.progress.indeterminate', () => {
  it('library.progress.indeterminate: progress null has no aria-valuenow and shows "Đang tải…"', () => {
    renderCard({ progress: null })

    const bar = within(article()).getByRole('progressbar', { name: 'Đang tải truyện' })
    expect(bar).not.toHaveAttribute('aria-valuenow')
    expect(within(article()).getByText('Đang tải…')).toBeInTheDocument()
  })
})

describe('library.progress.a11y', () => {
  it('library.progress.a11y: the cancel button has role button and accessible name "Huỷ tải"', () => {
    renderCard({ progress: 10 })

    const cancel = within(article()).getByRole('button', { name: 'Huỷ tải' })
    expect(cancel.querySelector('[aria-hidden="true"]')?.innerHTML).toBe(iconMarkup('close'))
  })

  it('library.progress.a11y: tapping "Huỷ tải" calls onCancel', () => {
    const { onCancel } = renderCard({ progress: 10 })

    fireEvent.click(within(article()).getByRole('button', { name: 'Huỷ tải' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('library.progress.a11y: idle (progress undefined) shows no cancel button', () => {
    renderCard()

    expect(within(article()).queryByRole('button', { name: 'Huỷ tải' })).toBeNull()
  })
})

describe('library.cover.local-only', () => {
  it('library.cover.local-only: without coverUrl the placeholder is shown and no image is rendered', () => {
    renderCard({ card: model({ localOnly: true, cached: true }) })

    expect(article().querySelector('img')).toBeNull()
    expect(within(article()).getByRole('img', { name: 'Bản d' })).toBeInTheDocument()
  })

  it('library.cover.local-only: with coverUrl an image with that src is rendered', () => {
    renderCard({ coverUrl: 'https://r2.test/books/d/cover.jpg' })

    expect(article().querySelector('img')).toHaveAttribute('src', 'https://r2.test/books/d/cover.jpg')
  })

  it('library.cover.local-only: tapping the cover opens the book when it can be read', () => {
    const { onRead } = renderCard({ card: model({ cached: true }) })

    fireEvent.click(article().querySelector('[role="img"]')!)
    expect(onRead).toHaveBeenCalledTimes(1)
  })
})

describe('library.read.offline-disabled', () => {
  it('library.read.offline-disabled: offline and uncached, the read button is disabled with a cloud-off icon', () => {
    renderCard({ online: false })

    const read = within(article()).getByRole('button', { name: 'Cần mạng để đọc' })
    expect(read).toBeDisabled()
    expect(read.querySelector('[aria-hidden="true"]')?.innerHTML).toBe(iconMarkup('cloud-off'))
    expect(article()).toHaveClass('opacity-60')
  })

  it('library.read.offline-disabled: offline and uncached, the download button is disabled and named "Cần mạng để tải"', () => {
    renderCard({ online: false })

    expect(within(article()).getByRole('button', { name: 'Cần mạng để tải' })).toBeDisabled()
  })

  it('library.read.offline-disabled: offline but cached, reading stays enabled and the card is not dimmed', () => {
    const { onRead } = renderCard({ online: false, card: model({ cached: true }) })

    const read = within(article()).getByRole('button', { name: 'Đọc' })
    expect(read).toBeEnabled()
    expect(article()).not.toHaveClass('opacity-60')
    fireEvent.click(read)
    expect(onRead).toHaveBeenCalledTimes(1)
  })
})

describe('library.read.fetch-first (card)', () => {
  it('library.read.fetch-first: online and uncached, tapping "Đọc" calls onRead and the Tải button is present', () => {
    const { onRead, onDownload } = renderCard()

    fireEvent.click(within(article()).getByRole('button', { name: 'Đọc' }))
    expect(onRead).toHaveBeenCalledTimes(1)

    fireEvent.click(within(article()).getByRole('button', { name: 'Tải' }))
    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ book: expect.objectContaining({ id: 'd' }) }))
  })
})

describe('library.badge.states (card)', () => {
  it('library.badge.states: cached and not stale shows "Đã lưu" only', () => {
    renderCard({ card: model({ cached: true }) })

    expect(within(article()).getByText('Đã lưu')).toBeInTheDocument()
    expect(within(article()).queryByText('Có bản mới')).toBeNull()
    expect(within(article()).queryByText('Chỉ còn trên máy')).toBeNull()
  })

  it('library.badge.states: stale shows "Có bản mới" and no "Đã lưu"', () => {
    renderCard({ card: model({ cached: true, stale: true }) })

    expect(within(article()).getByText('Có bản mới')).toBeInTheDocument()
    expect(within(article()).queryByText('Đã lưu')).toBeNull()
  })

  it('library.badge.states: local-only shows "Chỉ còn trên máy" and no "Đã lưu"', () => {
    renderCard({ card: model({ cached: true, localOnly: true }) })

    expect(within(article()).getByText('Chỉ còn trên máy')).toBeInTheDocument()
    expect(within(article()).queryByText('Đã lưu')).toBeNull()
  })
})

describe('library.card.author', () => {
  it('library.card.author: a non-empty author is shown under the title', () => {
    renderCard({ card: model({}, { author: 'Tác giả A', normAuthor: 'tac gia a' }) })

    const author = within(article()).getByText('Tác giả A')
    expect(author).toHaveClass('truncate', 'text-ink-muted')
  })

  it('library.card.author: an empty author renders no author line', () => {
    renderCard()

    expect(article().querySelector('.text-ink-muted.truncate')).toBeNull()
  })
})
