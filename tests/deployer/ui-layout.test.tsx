import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/preact'
import { App } from '../../deployer/src/app'
import { fakeWorker, makeStore, epubFile, settle, installObjectUrl, removeObjectUrl } from './ui-fakes'

beforeEach(() => installObjectUrl())
afterEach(() => {
  cleanup()
  removeObjectUrl()
})

/** Class tokens of the element, e.g. ["grid", "lg:grid-cols-2"]. */
const tokens = (el: Element): string[] => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

describe('deployer layout', () => {
  it('deployer.layout.wide: the connection panel sits beside the content from 1024 px', () => {
    const store = makeStore(fakeWorker())
    const { container } = render(<App store={store} />)

    const columns = container.querySelector('.lg\\:grid-cols-\\[20rem_1fr\\]')
    expect(columns).not.toBeNull()
    expect(columns!.firstElementChild).toContainElement(screen.getByRole('heading', { name: 'Kết nối' }))
    expect(columns!.lastElementChild).toContainElement(screen.getByRole('tablist'))
  })

  it('deployer.layout.wide: book cards are in two columns from 1024 px', async () => {
    const store = makeStore(fakeWorker())
    render(<App store={store} />)
    await store.addFiles([epubFile('Một.epub'), epubFile('Hai.epub')])
    await settle(store)

    const list = screen.getByRole('article', { name: 'Một' }).closest('ul')!
    expect(tokens(list)).toContain('lg:grid-cols-2')
    expect(within(list).getAllByRole('article')).toHaveLength(2)
  })

  it('deployer.layout.narrow: book cards are stacked one per row below 1024 px', async () => {
    const store = makeStore(fakeWorker())
    render(<App store={store} />)
    await store.addFiles([epubFile('Một.epub'), epubFile('Hai.epub')])
    await settle(store)

    const list = screen.getByRole('article', { name: 'Một' }).closest('ul')!
    // No unprefixed multi-column class: the base layout is one column.
    expect(tokens(list).some((t) => /^grid-cols-/.test(t))).toBe(false)
    expect(tokens(list)).toContain('grid')
  })
})
