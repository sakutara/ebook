import { IconButton } from '../icons/Icon'
import { ProgressBar } from '../ProgressBar'
import { CoverImage } from './CoverImage'
import type { CardModel } from './library-model'

export interface BookCardProps {
  card: CardModel
  online: boolean
  /** Cover URL. Omitted: only the titled placeholder shows. The page decides this. */
  coverUrl?: string
  /** Percent while the file is fetched into the cache (null = unknown total); undefined when idle. */
  progress?: number | null
  onRead: () => void
  onDownload: (card: CardModel) => void
  onCancel: () => void
}

const PILL = 'rounded-full bg-surface-2 px-2 py-0.5 text-fluid-sm text-ink'

export function BookCard({ card, online, coverUrl, progress, onRead, onDownload, onCancel }: BookCardProps) {
  const { book, cached, stale, localOnly, fraction } = card
  const pct = fraction === undefined ? undefined : Math.round(fraction * 100)
  const canRead = online || cached
  const canDownload = cached || online
  const dim = !cached && !online
  const fetching = progress !== undefined
  const badges = [
    cached && !stale && !localOnly && 'Đã lưu',
    stale && 'Có bản mới',
    localOnly && 'Chỉ còn trên máy',
  ].filter((b): b is string => typeof b === 'string')

  return (
    <article aria-label={book.title} class={`@container flex flex-col gap-2 ${dim ? 'opacity-60' : ''}`}>
      <div
        class={canRead ? 'cursor-pointer' : undefined}
        onClick={canRead ? onRead : undefined}
      >
        <CoverImage book={{ title: book.title, normTitle: book.normTitle }} src={coverUrl} />
      </div>
      <div class="contents">
        <h3 class="line-clamp-2 text-fluid-sm font-medium text-ink">{book.title}</h3>

        {book.author !== '' && (
          <p class="truncate text-fluid-sm text-ink-muted">{book.author}</p>
        )}

        {badges.length > 0 && (
          <div class="flex flex-wrap gap-1">
            {badges.map((label) => (
              <span key={label} class={PILL}>{label}</span>
            ))}
          </div>
        )}

        {pct !== undefined && (
          <div class="flex items-center gap-2">
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Tiến độ đọc"
              class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
            >
              <div class="h-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <span class="text-fluid-sm tabular-nums text-ink-muted">{pct}%</span>
          </div>
        )}

        {fetching ? (
          <div class="flex items-center gap-2">
            <div class="flex-1">
              <ProgressBar percent={progress} />
            </div>
            <IconButton icon="close" label="Huỷ tải" onClick={onCancel} />
          </div>
        ) : (
          <div class="flex gap-2">
            {canRead ? (
              <IconButton icon="read" label="Đọc" variant="primary" onClick={onRead} />
            ) : (
              <IconButton icon="cloud-off" label="Cần mạng để đọc" disabled />
            )}
            {canDownload ? (
              <IconButton icon="download" label="Tải" onClick={() => onDownload(card)} />
            ) : (
              <IconButton icon="cloud-off" label="Cần mạng để tải" disabled />
            )}
          </div>
        )}
      </div>
    </article>
  )
}
