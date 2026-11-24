import { Icon, IconButton } from '../icons/Icon'
import { CoverImage } from './CoverImage'
import type { CardModel } from './library-model'

export interface BookCardProps {
  card: CardModel
  online: boolean
  /** Cover URL. Omitted: only the titled placeholder shows. The page decides this. */
  coverUrl?: string
  /** Percent while the file is fetched into the cache (null = unknown total); undefined when idle. */
  progress?: number | null
  /** Tapping the cover opens the action sheet (read or download). */
  onOpen: (card: CardModel) => void
  onCancel: () => void
}

const CORNER_PILL =
  'absolute start-1.5 top-1.5 max-w-[calc(100%-3.5rem)] truncate rounded-full bg-ink/80 px-2 py-0.5 text-[0.7rem] font-semibold text-surface backdrop-blur-sm'

/**
 * One book in the grid. Everything about the book's state sits on the cover (saved mark, update
 * and local-only pills, reading progress, download progress), so every card below the cover has
 * the same height: a two-line title and a one-line author.
 */
export function BookCard({ card, online, coverUrl, progress, onOpen, onCancel }: BookCardProps) {
  const { book, cached, stale, localOnly, fraction } = card
  const pct = fraction === undefined ? undefined : Math.round(fraction * 100)
  const dim = !cached && !online
  const fetching = progress !== undefined
  const saved = cached && !stale && !localOnly
  const known = typeof progress === 'number'

  return (
    <article aria-label={book.title} data-book-id={book.id} class={`flex flex-col gap-2 ${dim ? 'opacity-60' : ''}`}>
      <div class="relative">
        <button
          type="button"
          data-cover
          aria-haspopup="dialog"
          aria-label={`Mở ${book.title}`}
          disabled={fetching}
          onClick={() => onOpen(card)}
          class="group block w-full cursor-pointer rounded-md text-start transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-progress motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          <CoverImage book={{ title: book.title, normTitle: book.normTitle }} src={coverUrl} />
        </button>

        {saved && (
          <span
            role="img"
            aria-label="Đã lưu"
            title="Đã lưu trên máy"
            class="pointer-events-none absolute end-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-accent text-on-accent shadow-cover"
          >
            <Icon name="saved" class="size-4" />
          </span>
        )}
        {stale && <span class={`pointer-events-none ${CORNER_PILL}`}>Có bản mới</span>}
        {localOnly && <span class={`pointer-events-none ${CORNER_PILL}`}>Chỉ còn trên máy</span>}

        {pct !== undefined && !fetching && (
          <div class="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden rounded-b-md">
            <span class="absolute bottom-2 end-1.5 rounded-full bg-ink/80 px-1.5 text-[0.7rem] font-semibold tabular-nums text-surface">
              {pct}%
            </span>
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Tiến độ đọc"
              class="h-1 bg-black/35"
            >
              <div class="h-full bg-accent-on-ink" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {fetching && (
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-black/65 p-3 text-white backdrop-blur-[2px]">
            <span class="text-fluid-sm font-semibold tabular-nums">{known ? `Đang tải ${progress}%` : 'Đang tải…'}</span>
            <div
              role="progressbar"
              aria-label="Đang tải truyện"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={known ? progress : undefined}
              class="h-1.5 w-full overflow-hidden rounded-full bg-white/25"
            >
              {known ? (
                <div class="h-full rounded-full bg-white transition-[width] duration-300" style={{ width: `${progress}%` }} />
              ) : (
                <div class="h-full w-2/5 rounded-full bg-white animate-[progress-indeterminate_1.2s_ease-in-out_infinite] motion-reduce:animate-none" />
              )}
            </div>
            <IconButton icon="close" label="Huỷ tải" class="text-white hover:bg-white/15" onClick={onCancel} />
          </div>
        )}
      </div>

      {/* Fixed height for two title lines plus the author line: rows of cards stay aligned,
          and the author sits right under the title whether it takes one line or two. */}
      <div data-card-text class="flex min-h-[calc(2lh+1.375rem)] flex-col gap-0.5 text-fluid-base leading-snug">
        <h3 class="line-clamp-2 font-serif font-semibold text-ink">{book.title}</h3>
        {book.author !== '' && <p class="truncate text-fluid-sm text-ink-muted">{book.author}</p>}
      </div>
    </article>
  )
}
