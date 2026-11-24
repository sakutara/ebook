import { useEffect, useState } from 'preact/hooks'
import { Icon, IconButton } from '../icons/Icon'
import { useBackClose } from '../useBackClose'
import { author, filter, genre } from './library-state'
import type { Option } from './library-model'

export interface FilterPanelProps {
  authors: Option[]
  authorValue: string
  genres: Option[]
  genreValue: string
  /** Books matching the current filters, shown on the drawer's confirm button. */
  resultCount: number
  /** Drawer state below xl. From xl the panel is always shown as a right column. */
  open: boolean
  onClose: () => void
}

const FILTERS = [
  { value: 'all', label: 'Tất cả', icon: 'filter-all' },
  { value: 'saved', label: 'Đã lưu', icon: 'filter-saved' },
] as const

const ROW =
  'flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 text-start text-fluid-sm transition-colors duration-150 hover:bg-surface-2 aria-checked:bg-accent aria-checked:font-semibold aria-checked:text-on-accent'

function Count(p: { n: number; on: boolean }) {
  return (
    <span
      class={`inline-flex min-w-6 shrink-0 justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${p.on ? 'bg-on-accent/20 text-on-accent' : 'bg-surface-2 text-ink-muted'}`}
    >
      {p.n}
    </span>
  )
}

/**
 * Library filters as a vertical list: shown / saved, author (a collapse) and genre.
 * From xl it is a sticky column at the right of the grid; below that it is a drawer that slides in
 * from the right. The drawer stays in the DOM but `invisible` while closed, so it is neither
 * focusable nor read by screen readers.
 */
export function FilterPanel(p: FilterPanelProps) {
  const f = filter.value
  // Open from the start when an author is already chosen, so the choice is visible.
  const [authorOpen, setAuthorOpen] = useState(p.authorValue !== '')
  const selectedAuthor = p.authors.find((o) => o.value === p.authorValue)

  useBackClose(p.open, p.onClose)

  useEffect(() => {
    if (!p.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') p.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p.open])

  return (
    <>
      {p.open && <div class="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] xl:hidden" aria-hidden="true" onClick={p.onClose} />}
      <aside
        aria-label="Bộ lọc truyện"
        class={`flex flex-col bg-surface text-ink max-xl:fixed max-xl:inset-y-0 max-xl:end-0 max-xl:z-50 max-xl:w-[min(20rem,88vw)] max-xl:border-s max-xl:border-line max-xl:pt-[env(safe-area-inset-top)] max-xl:pb-[env(safe-area-inset-bottom)] max-xl:shadow-float max-xl:transition-[transform,visibility] max-xl:duration-200 motion-reduce:transition-none xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:bg-transparent ${p.open ? 'max-xl:translate-x-0' : 'max-xl:invisible max-xl:translate-x-full'}`}
      >
        <div class="flex items-center justify-between gap-2 border-b border-line ps-4 pe-2 xl:hidden">
          <h2 class="py-3 font-serif text-fluid-lg font-semibold">Bộ lọc</h2>
          <IconButton icon="close" label="Đóng bộ lọc" onClick={p.onClose} />
        </div>

        <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain p-4 xl:rounded-card xl:border xl:border-line xl:bg-surface-2/40">
          <div
            role="radiogroup"
            aria-label="Bộ lọc"
            class="flex gap-0.5 rounded-full border border-line bg-surface-2 p-0.5"
          >
            {FILTERS.map((o) => {
              const on = f === o.value
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    filter.value = o.value
                  }}
                  class={`inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-fluid-sm font-medium transition-colors duration-150 aria-checked:bg-accent aria-checked:text-on-accent aria-checked:shadow-sm ${on ? '' : 'text-ink-muted hover:text-ink'}`}
                >
                  <Icon name={o.icon} class="size-5" />
                  {o.label}
                </button>
              )
            })}
          </div>

          <section class="flex flex-col gap-1">
            <button
              type="button"
              aria-expanded={authorOpen}
              aria-controls="filter-authors"
              onClick={() => setAuthorOpen((v) => !v)}
              class="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 text-start hover:bg-surface-2"
            >
              <span class="eyebrow">Tác giả</span>
              <span class="flex min-w-0 items-center gap-2">
                {selectedAuthor && (
                  <span class="truncate text-fluid-sm font-semibold text-accent">{selectedAuthor.label}</span>
                )}
                <span
                  aria-hidden="true"
                  class={`text-ink-muted transition-transform duration-150 motion-reduce:transition-none ${authorOpen ? 'rotate-180' : ''}`}
                >
                  ▾
                </span>
              </span>
            </button>
            {authorOpen && (
              <div
                id="filter-authors"
                role="radiogroup"
                aria-label="Tác giả"
                class="flex max-h-64 flex-col gap-0.5 overflow-y-auto overscroll-contain"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={p.authorValue === ''}
                  onClick={() => {
                    author.value = ''
                  }}
                  class={ROW}
                >
                  <span>Mọi tác giả</span>
                </button>
                {p.authors.map((o) => {
                  const on = p.authorValue === o.value
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        author.value = o.value
                      }}
                      class={ROW}
                    >
                      <span class="min-w-0 truncate">{o.label}</span> <Count n={o.count} on={on} />
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section class="flex flex-col gap-1">
            <h3 class="eyebrow px-3 py-1 font-sans">Thể loại</h3>
            <div role="radiogroup" aria-label="Thể loại" class="flex flex-col gap-0.5">
              <button
                type="button"
                role="radio"
                aria-checked={p.genreValue === ''}
                onClick={() => {
                  genre.value = ''
                }}
                class={ROW}
              >
                <span>Tất cả thể loại</span>
              </button>
              {p.genres.map((o) => {
                const on = p.genreValue === o.value
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      genre.value = o.value
                    }}
                    class={ROW}
                  >
                    <span class="min-w-0 truncate">{o.label}</span> <Count n={o.count} on={on} />
                  </button>
                )
              })}
            </div>
          </section>
        </div>

        <div class="border-t border-line p-3 xl:hidden">
          <button
            type="button"
            onClick={p.onClose}
            class="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-full bg-accent px-5 text-fluid-base font-semibold text-on-accent shadow-sm hover:brightness-110"
          >
            {`Xem ${p.resultCount} truyện`}
          </button>
        </div>
      </aside>
    </>
  )
}
