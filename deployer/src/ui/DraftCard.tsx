import { useEffect, useState } from 'preact/hooks'
import { KNOWN_GENRES, canonicalGenre, genreKey } from '../../../src/domain/genre'
import { ProgressBar } from '../../../src/ui/ProgressBar'
import { IconButton, IconTextButton } from '../../../src/ui/icons/Icon'
import { conflictTitle, slugError, type Draft } from '../draft'
import { defaultStore, type DeployerStore } from './store-ref'

export interface DraftCardProps {
  draft: Draft
  store?: DeployerStore
}

const FIELD = 'min-h-11 w-full rounded-lg border border-ink-muted/40 bg-surface px-3 text-fluid-base text-ink disabled:opacity-60'
const PILL = 'inline-flex min-h-7 items-center rounded-full px-2 text-fluid-sm'
const DANGER = 'text-red-600 dark:text-red-400'

/** Object URL for a blob, revoked when the blob changes or the component unmounts. */
function useObjectUrl(blob: Blob): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (blob.size === 0) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

/** Status text for the pill. `done` wins over the catalog status; parse errors have no status. */
function statusLabel(draft: Draft): { text: string; tone: string } {
  if (draft.state === 'parsing') return { text: 'Đang đọc tệp…', tone: 'bg-surface text-ink-muted' }
  if (draft.state === 'done') return { text: 'Đã tải lên', tone: 'bg-accent text-surface' }
  if (draft.state === 'error') return { text: 'Lỗi', tone: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' }
  if (draft.status === 'new') return { text: 'Mới', tone: 'bg-surface text-ink' }
  if (draft.status === 'update') return { text: 'Cập nhật', tone: 'bg-surface text-ink' }
  return { text: 'Đã có', tone: 'bg-surface text-ink-muted' }
}

/** True when the draft failed during upload (it was parsed, so it has an md5) and can be retried. */
function isUploadError(draft: Draft): boolean {
  return draft.state === 'error' && draft.md5 !== ''
}

function isKnownGenre(name: string): boolean {
  return KNOWN_GENRES.some((k) => genreKey(k) === genreKey(name))
}

/** One EPUB in the upload list: cover, fields, genres, status, progress and error. */
export function DraftCard({ draft, store = defaultStore }: DraftCardProps) {
  const catalog = store.catalog.value
  const coverUrl = useObjectUrl(draft.cover)
  const [otherGenre, setOtherGenre] = useState('')
  /** Unique per card: ids must not repeat across the list. */
  const idPrefix = `draft-${draft.key}`

  const update = (patch: Partial<Draft>) => store.updateDraft(draft.key, patch)
  const showFields = draft.state !== 'parsing' && !(draft.state === 'error' && !isUploadError(draft))
  const editable = draft.state === 'ready' || isUploadError(draft)
  const conflict = draft.state === 'ready' ? conflictTitle(draft, catalog) : null
  const slugProblem = showFields ? slugError(draft.slug) : null
  const status = statusLabel(draft)
  const otherGenres = draft.genres.filter((g) => !isKnownGenre(g))

  const toggleGenre = (name: string) => {
    const on = draft.genres.some((g) => genreKey(g) === genreKey(name))
    update({
      genres: on
        ? draft.genres.filter((g) => genreKey(g) !== genreKey(name))
        : [...draft.genres, name],
    })
  }

  const addOtherGenre = () => {
    const name = canonicalGenre(otherGenre)
    setOtherGenre('')
    if (name === '' || draft.genres.some((g) => genreKey(g) === genreKey(name))) return
    update({ genres: [...draft.genres, name] })
  }

  return (
    <article
      aria-label={draft.title || draft.file.name}
      class="grid gap-3 rounded-xl bg-surface-2 p-3 text-ink sm:p-4"
    >
      <div class="flex items-start gap-3">
        <div class="h-36 w-24 shrink-0 overflow-hidden rounded-lg bg-surface">
          {coverUrl !== null && <img src={coverUrl} alt="" class="size-full object-cover" />}
        </div>
        <div class="grid min-w-0 flex-1 gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class={`${PILL} ${status.tone}`}>{status.text}</span>
            {draft.coverGenerated && <span class={`${PILL} bg-surface text-ink-muted`}>Bìa tự tạo</span>}
          </div>
          <p class="truncate text-fluid-sm text-ink-muted">{draft.file.name}</p>
          <div class="flex min-h-11 items-center gap-2 text-fluid-sm">
            <input
              id={`${idPrefix}-pick`}
              type="checkbox"
              class="size-5"
              checked={draft.selected}
              disabled={draft.state !== 'ready'}
              onChange={(e) => update({ selected: e.currentTarget.checked })}
            />
            <label for={`${idPrefix}-pick`}>Chọn</label>
          </div>
        </div>
      </div>

      {showFields && (
        <div class="grid gap-3">
          <div class="grid gap-1 text-fluid-sm">
            <label for={`${idPrefix}-title`}>Tên truyện</label>
            <input
              id={`${idPrefix}-title`}
              type="text"
              class={FIELD}
              value={draft.title}
              disabled={!editable}
              onInput={(e) => update({ title: e.currentTarget.value })}
            />
          </div>
          <div class="grid gap-1 text-fluid-sm">
            <label for={`${idPrefix}-author`}>Tác giả</label>
            <input
              id={`${idPrefix}-author`}
              type="text"
              class={FIELD}
              value={draft.author}
              disabled={!editable}
              onInput={(e) => update({ author: e.currentTarget.value })}
            />
          </div>
          <div class="grid gap-1 text-fluid-sm">
            <div class="grid gap-1">
              <label for={`${idPrefix}-slug`}>Thư mục (slug)</label>
              <input
                id={`${idPrefix}-slug`}
                type="text"
                class={FIELD}
                value={draft.slug}
                disabled={!editable}
                aria-invalid={slugProblem !== null}
                aria-describedby={slugProblem !== null ? `slug-error-${draft.key}` : undefined}
                onInput={(e) => update({ slug: e.currentTarget.value })}
              />
            </div>
            {slugProblem !== null && (
              <p id={`slug-error-${draft.key}`} class={DANGER}>
                {slugProblem}
              </p>
            )}
          </div>

          <div role="group" aria-label="Thể loại" class="grid gap-2">
            <div class="flex flex-wrap gap-2">
              {KNOWN_GENRES.map((name) => {
                const on = draft.genres.some((g) => genreKey(g) === genreKey(name))
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    disabled={!editable}
                    onClick={() => toggleGenre(name)}
                    class="min-h-11 rounded-full border border-ink-muted/40 px-3 text-fluid-sm transition-colors aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-surface disabled:opacity-60"
                  >
                    {name}
                  </button>
                )
              })}
            </div>
            {otherGenres.length > 0 && (
              <div class="flex flex-wrap gap-2">
                {otherGenres.map((name) => (
                  <span key={name} class="inline-flex items-center gap-1 rounded-full bg-surface pl-3 text-fluid-sm">
                    {name}
                    <IconButton
                      icon="close"
                      label={`Bỏ thể loại ${name}`}
                      disabled={!editable}
                      onClick={() => toggleGenre(name)}
                    />
                  </span>
                ))}
              </div>
            )}
            <div class="grid gap-1 text-fluid-sm">
              <label for={`${idPrefix}-other-genre`}>Thể loại khác</label>
              <input
                id={`${idPrefix}-other-genre`}
                type="text"
                class={FIELD}
                value={otherGenre}
                disabled={!editable}
                onInput={(e) => setOtherGenre(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  addOtherGenre()
                }}
              />
            </div>
          </div>
        </div>
      )}

      {conflict !== null && <p class={`text-fluid-sm font-medium ${DANGER}`}>{`Sẽ ghi đè «${conflict}»`}</p>}

      {draft.state === 'uploading' && <ProgressBar percent={draft.progress ?? 0} label="Đang tải lên" />}

      {draft.state === 'error' && (
        <div class="flex flex-wrap items-center gap-2">
          <p class={`text-fluid-sm ${DANGER}`}>{`Lỗi: ${draft.error ?? ''}`}</p>
          {isUploadError(draft) && (
            <IconTextButton icon="retry" label="Thử lại" variant="primary" onClick={() => void store.retry(draft.key)} />
          )}
        </div>
      )}

      {draft.state !== 'uploading' && (
        <div class="flex justify-end">
          <IconButton icon="close" label="Bỏ khỏi danh sách" onClick={() => store.removeDraft(draft.key)} />
        </div>
      )}
    </article>
  )
}

export interface DraftListProps {
  store?: DeployerStore
}

/** The list of draft cards: one column on narrow screens, two from 1024 px. */
export function DraftList({ store = defaultStore }: DraftListProps) {
  const drafts = store.drafts.value
  if (drafts.length === 0) return null
  return (
    <ul class="grid gap-4 lg:grid-cols-2">
      {drafts.map((draft) => (
        <li key={draft.key}>
          <DraftCard draft={draft} store={store} />
        </li>
      ))}
    </ul>
  )
}
