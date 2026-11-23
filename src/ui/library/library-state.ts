import { signal } from '@preact/signals'

/** Module-level so the search text and filter survive navigating to the reader and back. */
export const query = signal('')
export const filter = signal<'all' | 'saved'>('all')

export type Layout = 'grid' | 'list'
const LAYOUT_KEY = 'library.layout'

function readLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

/** Grid with covers or a plain list. Remembered per viewer; storage failures fall back to grid. */
export const layout = signal<Layout>(readLayout())

export function setLayout(next: Layout): void {
  layout.value = next
  try {
    localStorage.setItem(LAYOUT_KEY, next)
  } catch {
    // Storage unavailable: the choice lasts for this session only.
  }
}
