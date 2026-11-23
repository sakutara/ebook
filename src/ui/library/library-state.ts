import { signal } from '@preact/signals'

/** Module-level so the search text and filter survive navigating to the reader and back. */
export const query = signal('')
export const filter = signal<'all' | 'saved'>('all')
