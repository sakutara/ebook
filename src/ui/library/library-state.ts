import { signal } from '@preact/signals'

/** Module-level so the search text and filters survive navigating to the reader and back. */
export const query = signal('')
export const filter = signal<'all' | 'saved'>('all')
/** Genre key (see genreKey); '' = all genres. */
export const genre = signal('')
/** normAuthor; '' = all authors. */
export const author = signal('')

/** Resets search, genre and author. The "Tất cả"/"Đã lưu" choice is kept. */
export function clearFilters(): void {
  query.value = ''
  genre.value = ''
  author.value = ''
}
