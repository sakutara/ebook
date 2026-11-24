import { useEffect, useRef } from 'preact/hooks'
import { Icon, IconButton } from '../icons/Icon'
import { useBackClose } from '../useBackClose'
import { CoverImage } from './CoverImage'
import type { CardModel } from './library-model'

export interface BookSheetProps {
  card: CardModel
  /** False when the device is offline or no source is configured. */
  online: boolean
  coverUrl?: string
  onRead: () => void
  onDownload: () => void
  /** Removes the saved copy (with undo). Only offered for saved books. */
  onRemoveSaved: () => void
  onShare: () => void
  onClose: () => void
}

const MB_BYTES = 1048576

function sizeText(bytes: number): string {
  return `${(bytes / MB_BYTES).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`
}

const BIG_BTN =
  'inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-fluid-base font-semibold transition duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 motion-reduce:transition-none'

/**
 * The choice shown after tapping a cover: read the book, or download its EPUB file.
 * A bottom sheet on phones, a centred card from md. Back, Escape and the backdrop close it.
 */
export function BookSheet(p: BookSheetProps) {
  const { book, cached, stale, localOnly, fraction } = p.card
  const canRead = p.online || cached
  const canDownload = p.online || cached
  const pct = fraction === undefined ? undefined : Math.round(fraction * 100)
  const firstBtn = useRef<HTMLButtonElement>(null)

  useBackClose(true, p.onClose)

  useEffect(() => {
    firstBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') p.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const status = localOnly
    ? 'Chỉ còn trên máy · đã gỡ khỏi máy chủ'
    : stale
      ? 'Đã lưu · có bản mới trên máy chủ'
      : cached
        ? `Đã lưu trên máy · ${sizeText(book.size)}`
        : p.online
          ? `Chưa lưu · ${sizeText(book.size)}`
          : 'Chưa lưu · cần mạng để tải lần đầu'

  return (
    <div class="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="presentation">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-hidden="true" onClick={p.onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-sheet-title"
        class="relative w-full max-w-md rounded-t-3xl border border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink shadow-float md:rounded-3xl"
      >
        <div aria-hidden="true" class="mx-auto -mt-2 mb-3 h-1 w-10 rounded-full bg-line md:hidden" />
        <div class="flex gap-4">
          <CoverImage book={{ title: book.title, normTitle: book.normTitle }} src={p.coverUrl} class="w-24 shrink-0" />
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="book-sheet-title" class="line-clamp-3 font-serif text-fluid-lg font-semibold leading-snug">
              {book.title}
            </h2>
            {book.author !== '' && <p class="truncate text-fluid-sm text-ink-muted">{book.author}</p>}
            <p class="mt-auto flex items-center gap-1.5 text-fluid-sm text-ink-muted">
              {cached && <Icon name="saved" class="size-4 text-accent" />}
              {status}
            </p>
            {pct !== undefined && pct > 0 && <p class="text-fluid-sm text-ink-muted">{`Đã đọc ${pct}%`}</p>}
          </div>
          <IconButton icon="close" label="Đóng" class="-me-2 -mt-2 shrink-0 self-start" onClick={p.onClose} />
        </div>

        {book.note !== undefined && book.note !== '' && (
          <p
            aria-label="Ghi chú"
            class="mt-4 max-h-40 overflow-y-auto whitespace-pre-line rounded-xl border border-line bg-surface-2 px-3 py-2 text-fluid-sm text-ink-muted"
          >
            {book.note}
          </p>
        )}

        {book.description.trim() !== '' && (
          <p
            aria-label="Mô tả"
            class="mt-3 max-h-40 overflow-y-auto whitespace-pre-line text-fluid-sm leading-relaxed text-ink-muted"
          >
            {book.description.trim()}
          </p>
        )}

        <div class="mt-5 grid gap-2">
          <button
            ref={firstBtn}
            type="button"
            disabled={!canRead}
            onClick={p.onRead}
            class={`${BIG_BTN} bg-accent text-on-accent shadow-sm hover:brightness-110`}
          >
            <Icon name={canRead ? 'read' : 'cloud-off'} />
            {canRead ? (pct ? 'Đọc tiếp' : 'Đọc truyện') : 'Cần mạng để đọc'}
          </button>
          <button
            type="button"
            disabled={!canDownload}
            onClick={p.onDownload}
            class={`${BIG_BTN} border border-line bg-surface-2 text-ink hover:border-ink-muted`}
          >
            <Icon name={canDownload ? 'download' : 'cloud-off'} />
            {canDownload ? 'Tải tệp EPUB về máy' : 'Cần mạng để tải'}
          </button>
          <button
            type="button"
            onClick={p.onShare}
            class={`${BIG_BTN} border border-line bg-surface-2 text-ink hover:border-ink-muted`}
          >
            <Icon name="share" />
            Chia sẻ truyện
          </button>
          {cached && (
            <button
              type="button"
              onClick={p.onRemoveSaved}
              class="mx-auto mt-1 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-fluid-sm font-medium text-danger hover:bg-danger-soft"
            >
              <Icon name="trash" class="size-5" />
              Xoá bản lưu trên máy
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
