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
    onOpen: vi.fn(),
    onCancel: vi.fn(),
  }
  const utils = render(
    <BookCard card={model()} online={true} onOpen={handlers.onOpen} onCancel={handlers.onCancel} {...props} />,
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
const cover = () => within(article()).getByRole('button', { name: 'Mở Bản d' })

describe('library.progress.shown', () => {
  it('library.progress.shown: a progress value shows a progressbar over the cover with aria-valuenow and "Đang tải 25%"', () => {
    renderCard({ progress: 25 })

    const bar = within(article()).getByRole('progressbar', { name: 'Đang tải truyện' })
    expect(bar).toHaveAttribute('aria-valuenow', '25')
    expect(within(article()).getByText('Đang tải 25%')).toBeInTheDocument()
    // Overlay on the cover: it shares the cover's positioned box, no extra row below.
    expect(bar.closest('.absolute')?.parentElement).toBe(cover().parentElement)
  })

  it('library.progress.shown: while fetching, the cover cannot be tapped again', () => {
    renderCard({ progress: 25 })

    expect(cover()).toBeDisabled()
  })

  it('library.progress.hidden: once idle (saved), no download bar is shown', () => {
    renderCard({ card: model({ cached: true }) })

    expect(within(article()).queryByRole('progressbar', { name: 'Đang tải truyện' })).toBeNull()
    expect(within(article()).queryByText(/Đang tải/)).toBeNull()
  })

  it('library.progress.shown: the reading-progress bar is hidden while a download runs and shown otherwise', () => {
    const { rerender } = renderCard({ card: model({ fraction: 0.5 }), progress: 25 })
    expect(within(article()).queryByRole('progressbar', { name: 'Tiến độ đọc' })).toBeNull()

    rerender(<BookCard card={model({ fraction: 0.5 })} online={true} onOpen={vi.fn()} onCancel={vi.fn()} />)
    expect(within(article()).getByRole('progressbar', { name: 'Tiến độ đọc' })).toHaveAttribute('aria-valuenow', '50')
    expect(within(article()).getByText('50%')).toBeInTheDocument()
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
})

describe('library.cover.open', () => {
  it('library.cover.open: tapping the cover asks to open the action sheet with the card', () => {
    const { onOpen } = renderCard({ card: model({ cached: true }) })

    fireEvent.click(cover())
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ book: expect.objectContaining({ id: 'd' }) }))
    expect(cover()).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('library.cover.open: the card itself has no Đọc or Tải buttons', () => {
    renderCard()

    expect(within(article()).queryByRole('button', { name: 'Đọc' })).toBeNull()
    expect(within(article()).queryByRole('button', { name: 'Tải' })).toBeNull()
  })
})

describe('library.read.offline-disabled', () => {
  it('library.read.offline-disabled: offline and uncached, the card is dimmed', () => {
    renderCard({ online: false })

    expect(article()).toHaveClass('opacity-60')
  })

  it('library.read.offline-disabled: offline but cached, the card is not dimmed', () => {
    renderCard({ online: false, card: model({ cached: true }) })

    expect(article()).not.toHaveClass('opacity-60')
  })
})

describe('library.badge.states (card)', () => {
  it('library.badge.states: cached and not stale shows the "Đã lưu" icon on the cover corner', () => {
    renderCard({ card: model({ cached: true }) })

    const mark = within(article()).getByRole('img', { name: 'Đã lưu' })
    expect(mark).toHaveClass('absolute', 'top-1.5', 'end-1.5')
    expect(mark.querySelector('svg')).not.toBeNull()
    expect(within(article()).queryByText('Có bản mới')).toBeNull()
    expect(within(article()).queryByText('Chỉ còn trên máy')).toBeNull()
  })

  it('library.badge.states: stale shows "Có bản mới" and no "Đã lưu"', () => {
    renderCard({ card: model({ cached: true, stale: true }) })

    expect(within(article()).getByText('Có bản mới')).toBeInTheDocument()
    expect(within(article()).queryByRole('img', { name: 'Đã lưu' })).toBeNull()
  })

  it('library.badge.states: local-only shows "Chỉ còn trên máy" and no "Đã lưu"', () => {
    renderCard({ card: model({ cached: true, localOnly: true }) })

    expect(within(article()).getByText('Chỉ còn trên máy')).toBeInTheDocument()
    expect(within(article()).queryByRole('img', { name: 'Đã lưu' })).toBeNull()
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

  it('library.card.align: title and author share a block that always reserves two title lines and the author line', () => {
    renderCard()

    const heading = within(article()).getByRole('heading', { name: 'Bản d' })
    expect(heading).toHaveClass('line-clamp-2')
    expect(heading.parentElement).toHaveClass('min-h-[calc(2lh+1.375rem)]')
  })
})
