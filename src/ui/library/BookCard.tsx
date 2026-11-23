import type { Book } from '../../db/db'
import { IconButton } from '../icons/Icon'
import { CoverImage } from './CoverImage'
import type { CardModel } from './library-model'

export interface BookCardProps {
  card: CardModel
  online: boolean
  getCover: (b: Book) => Promise<Blob | null | undefined>
  /** Look up the cover (from the local cache). False shows the file-name title only. */
  showCover?: boolean
  /** Percent while the file is being fetched into the cache before reading; undefined otherwise. */
  preparing?: number
  /** 'list' drops the cover and shows the row compactly. */
  layout?: 'grid' | 'list'
  onRead: () => void
  onDownload: (card: CardModel) => void
}

const PILL = 'rounded-full bg-surface-2 px-2 py-0.5 text-fluid-sm text-ink'

export function BookCard({ card, online, getCover, showCover = false, preparing, layout = 'grid', onRead, onDownload }: BookCardProps) {
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

  const list = layout === 'list'
  return (
    <article
      aria-label={book.title}
      class={`@container flex ${list ? 'flex-row items-center gap-3 py-2' : 'flex-col gap-2'} ${dim ? 'opacity-60' : ''}`}
    >
      {!list && (
        <div
          class={canRead ? 'cursor-pointer' : undefined}
          onClick={canRead ? onRead : undefined}
        >
          <CoverImage
            book={{ id: book.id, title: book.title, normTitle: book.normTitle, md5: book.md5 }}
            get={showCover ? () => getCover(book) : undefined}
          />
        </div>
      )}
      <div class={list ? 'flex min-w-0 flex-1 flex-col gap-1' : 'contents'}>
      <h3 class={`line-clamp-2 text-fluid-sm font-medium text-ink ${list ? 'truncate' : ''}`}>{book.title}</h3>

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
        {preparing !== undefined ? (
          <IconButton icon="download" label={`Đang tải ${preparing}%`} disabled />
        ) : canRead ? (
          <IconButton icon="read" label="Đọc" variant="primary" onClick={onRead} />
        ) : (
          <IconButton icon="cloud-off" label="Cần mạng để đọc" disabled />
        )}
        {preparing !== undefined ? null : canDownload ? (
          <IconButton icon="download" label="Tải" onClick={() => onDownload(card)} />
        ) : (
          <IconButton icon="cloud-off" label="Cần mạng để tải" disabled />
        )}
      </div>
      </div>
    </article>
  )
}
