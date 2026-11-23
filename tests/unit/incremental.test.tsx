import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/preact'
import { ioInstances, triggerIntersect } from '../setup'
import { useIncrementalList } from '../../src/ui/library/useIncrementalList'
import { CoverImage, placeholderHue, type CoverBook } from '../../src/ui/library/CoverImage'

function Grid({ items }: { items: number[] }) {
  const { visible, sentinelRef } = useIncrementalList(items)
  return (
    <div>
      <ul>
        {visible.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <div data-testid="sentinel" ref={sentinelRef} />
    </div>
  )
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

// Let pending promise callbacks (cover fetches) settle and Preact re-render.
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)))

beforeEach(() => {
  ioInstances.length = 0
})

afterEach(() => {
  cleanup()
  ioInstances.length = 0
})

describe('library.grid.incremental', () => {
  it('library.grid.incremental: 130 items render 40, 80, 120, 130 as the sentinel intersects', () => {
    const items = range(130)
    const { container } = render(<Grid items={items} />)
    const sentinel = screen.getByTestId('sentinel')
    expect(container.querySelectorAll('li')).toHaveLength(40)

    act(() => triggerIntersect(sentinel))
    expect(container.querySelectorAll('li')).toHaveLength(80)

    act(() => triggerIntersect(sentinel))
    expect(container.querySelectorAll('li')).toHaveLength(120)

    act(() => triggerIntersect(sentinel))
    expect(container.querySelectorAll('li')).toHaveLength(130)

    // Nothing more to reveal: stays at 130.
    act(() => triggerIntersect(sentinel))
    expect(container.querySelectorAll('li')).toHaveLength(130)
  })

  it('library.grid.incremental: count resets to 40 when items change', () => {
    const items = range(130)
    const { container, rerender } = render(<Grid items={items} />)
    const sentinel = screen.getByTestId('sentinel')

    act(() => triggerIntersect(sentinel))
    expect(container.querySelectorAll('li')).toHaveLength(80)

    rerender(<Grid items={[...items]} />)
    expect(container.querySelectorAll('li')).toHaveLength(40)
  })

  it('library.grid.incremental: observes the sentinel with a 600px rootMargin', () => {
    render(<Grid items={range(50)} />)
    const sentinel = screen.getByTestId('sentinel')
    const entry = ioInstances.find((i) => i.els.has(sentinel))
    expect(entry).toBeDefined()
    expect(entry?.options?.rootMargin).toBe('600px')
  })
})

describe('library.cover.lazy', () => {
  const books: CoverBook[] = [
    { id: 'a', title: 'Sách A', normTitle: 'sach a', md5: 'm1' },
    { id: 'b', title: 'Sách B', normTitle: 'sach b', md5: 'm2' },
    { id: 'c', title: 'Sách C', normTitle: 'sach c', md5: 'm3' },
  ]

  function Shelf({ get }: { get: (b: CoverBook) => Promise<Blob | null | undefined> }) {
    return (
      <div>
        {books.map((b) => (
          <CoverImage key={b.id} book={b} get={get} />
        ))}
      </div>
    )
  }

  // The wrapper is the parent of the placeholder labelled with the title.
  const wrapperFor = (title: string) => screen.getByRole('img', { name: title }).parentElement as HTMLElement

  it('library.cover.lazy: get is called only after the cover intersects', async () => {
    const get = vi.fn(async () => null)
    render(<Shelf get={get} />)
    expect(get).not.toHaveBeenCalled()

    const wrapA = wrapperFor('Sách A')
    const entry = ioInstances.find((i) => i.els.has(wrapA))
    expect(entry?.options?.rootMargin).toBe('300px')

    act(() => {
      triggerIntersect(wrapperFor('Sách A'))
      triggerIntersect(wrapperFor('Sách C'))
    })
    await flush()

    expect(get).toHaveBeenCalledTimes(2)
    expect(get).toHaveBeenNthCalledWith(1, books[0])
    expect(get).toHaveBeenNthCalledWith(2, books[2])
  })

  it('library.cover.lazy: null shows the placeholder labelled with the title', async () => {
    const get = vi.fn(async () => null)
    render(<Shelf get={get} />)

    act(() => triggerIntersect(wrapperFor('Sách B')))
    await flush()

    const placeholder = screen.getByRole('img', { name: 'Sách B' })
    expect(placeholder.textContent).toBe('Sách B')
    expect(placeholder.getAttribute('style')).toContain('background')
    expect(placeholder.parentElement?.querySelector('img')).toBeNull()
  })

  it('library.cover.lazy: a blob shows an img and the object URL is revoked on unmount', async () => {
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    const createObjectURL = vi.fn(() => 'blob:cover-1')
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    try {
      const blob = new Blob(['png'], { type: 'image/png' })
      const get = vi.fn(async () => blob)
      const { container, unmount } = render(
        <CoverImage book={books[0]} get={get} />,
      )

      act(() => triggerIntersect(container.firstElementChild as HTMLElement))
      await flush()

      const img = container.querySelector('img')
      expect(img).not.toBeNull()
      expect(img?.getAttribute('src')).toBe('blob:cover-1')
      expect(img?.getAttribute('alt')).toBe('')
      expect(img?.getAttribute('loading')).toBe('lazy')
      expect(createObjectURL).toHaveBeenCalledWith(blob)
      await flush()

      unmount()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:cover-1')
    } finally {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
    }
  })

  it('library.cover.lazy: placeholderHue is stable and within 0..359', () => {
    const samples = ['sach a', 'truyen kieu', 'doraemon', '', 'x'.repeat(200), 'Tủ Truyện']
    for (const s of samples) {
      const h = placeholderHue(s)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(359)
      expect(placeholderHue(s)).toBe(h)
    }
  })
})
