import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/preact'
import { ioInstances, triggerIntersect } from '../setup'
import { useIncrementalList } from '../../src/ui/library/useIncrementalList'

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
