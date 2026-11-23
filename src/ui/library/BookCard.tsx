import type { Book } from '../../db/db'
import { IconButton } from '../icons/Icon'
import { CoverImage } from './CoverImage'
import type { CardModel } from './library-model'

export interface BookCardProps {
  card: CardModel
  online: boolean
  getCover: (b: Book) => Promise<Blob | null | undefined>
  onRead: (id: string) => void
  onDownload: (card: CardModel) => void
}

const PILL = 'rounded-full bg-surface-2 px-2 py-0.5 text-fluid-sm text-ink'

export function BookCard({ card, online, getCover, onRead, onDownload }: BookCardProps) {
  const { book, cached, stale, localOnly, fraction } = card
  const pct = fraction === undefined ? undefined : Math.round(fraction * 100)
  const canRead = online || cached
  const canDownload = cached || online
  const dim = !cached && !online
  const badges = [
    cached && !stale && !localOnly && 'Đã lưu',
    stale && 'Có bản mới',
    localOnly && 'Chỉ còn trên máy',
  ].filter((b): b is string => typeof b === 'string')

  return (
    <article
      aria-label={book.title}
      class={`@container flex flex-col gap-2 ${dim ? 'opacity-60' : ''}`}
    >
      <CoverImage
        book={{ id: book.id, title: book.title, normTitle: book.normTitle, md5: book.md5 }}
        get={() => getCover(book)}
      />
      <h3 class="line-clamp-2 text-fluid-sm font-medium text-ink">{book.title}</h3>

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

      <div class="flex gap-2">
        {canRead ? (
          <IconButton icon="read" label="Đọc" variant="primary" onClick={() => onRead(book.id)} />
        ) : (
          <IconButton icon="cloud-off" label="Cần mạng để đọc" disabled />
        )}
        {canDownload ? (
          <IconButton icon="download" label="Tải" onClick={() => onDownload(card)} />
        ) : (
          <IconButton icon="cloud-off" label="Cần mạng để tải" disabled />
        )}
      </div>
    </article>
  )
}
