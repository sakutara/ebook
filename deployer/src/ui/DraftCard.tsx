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

const FIELD = 'field text-fluid-base'
const PILL = 'inline-flex min-h-7 items-center rounded-full border border-line px-2.5 text-xs font-semibold'
const DANGER = 'text-danger'

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
  if (draft.state === 'done') return { text: 'Đã tải lên', tone: 'border-accent bg-accent text-on-accent' }
  if (draft.state === 'error') return { text: 'Lỗi', tone: 'border-danger bg-danger-soft text-danger' }
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
  const [editing, setEditing] = useState(false)
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
      class="card grid gap-3 p-3 text-ink sm:p-4"
    >
      <div class="flex items-start gap-3">
        <div class="h-28 w-[4.75rem] shrink-0 overflow-hidden rounded-md bg-surface shadow-cover ring-1 ring-black/5">
          {coverUrl !== null && <img src={coverUrl} alt="" class="size-full object-cover" />}
        </div>
        <div class="grid min-w-0 flex-1 gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class={`${PILL} ${status.tone}`}>{status.text}</span>
            {draft.coverGenerated && <span class={`${PILL} bg-surface text-ink-muted`}>Bìa tự tạo</span>}
          </div>
          <p class="line-clamp-2 font-serif text-fluid-base font-semibold leading-snug">{draft.title || draft.file.name}</p>
          {draft.author !== '' && <p class="-mt-1 truncate text-fluid-sm text-ink-muted">{draft.author}</p>}
          <p class="truncate text-xs text-ink-muted">{`${draft.file.name}${draft.slug ? ` → ${draft.slug}/` : ''}`}</p>
          <div class="flex min-h-11 items-center gap-2 text-fluid-sm">
            <input
              id={`${idPrefix}-pick`}
              type="checkbox"
              class="size-5 accent-accent"
              checked={draft.selected}
              disabled={draft.state !== 'ready'}
              onChange={(e) => update({ selected: e.currentTarget.checked })}
            />
            <label for={`${idPrefix}-pick`}>Chọn</label>
          </div>
        </div>
      </div>

      {showFields && (
        <details
          open={editing || slugProblem !== null || isUploadError(draft)}
          onToggle={(e) => setEditing((e.currentTarget as HTMLDetailsElement).open)}
          class="group rounded-xl border border-line bg-surface open:bg-transparent open:border-transparent"
        >
          <summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 text-fluid-sm font-medium text-ink hover:bg-surface-2 group-open:px-0 group-open:hover:bg-transparent [&::-webkit-details-marker]:hidden">
            <span>{editable ? 'Sửa thông tin' : 'Thông tin'}</span>
            <span class="text-ink-muted">{`${draft.genres.length > 0 ? draft.genres.join(', ') : 'Chưa có thể loại'}`}</span>
          </summary>
        <div class="grid gap-3 pt-2">
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
                    class="chip text-fluid-sm"
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
        </details>
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
        <div class="-mb-1 -mt-2 flex justify-end">
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
  const ready = drafts.filter((d) => d.state === 'ready')
  const count = (st: Draft['status']) => ready.filter((d) => d.status === st).length
  const parts = [
    count('new') > 0 && `${count('new')} mới`,
    count('update') > 0 && `${count('update')} cập nhật`,
    ready.length - count('new') - count('update') > 0 && `${ready.length - count('new') - count('update')} đã có`,
    drafts.filter((d) => d.state === 'error').length > 0 && `${drafts.filter((d) => d.state === 'error').length} lỗi`,
    drafts.filter((d) => d.state === 'parsing').length > 0 && `${drafts.filter((d) => d.state === 'parsing').length} đang đọc`,
  ].filter((x): x is string => typeof x === 'string')
  const allOn = ready.length > 0 && ready.every((d) => d.selected)
  return (
    <div class="grid gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-fluid-sm text-ink-muted">
          <span class="font-semibold text-ink">{`${drafts.length} tệp`}</span>
          {parts.length > 0 && ` · ${parts.join(' · ')}`}
        </p>
        {ready.length > 1 && (
          <button
            type="button"
            onClick={() => ready.forEach((d) => store.updateDraft(d.key, { selected: !allOn }))}
            class="inline-flex min-h-11 cursor-pointer items-center rounded-full px-3 text-fluid-sm font-medium text-accent hover:bg-surface-2"
          >
            {allOn ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
          </button>
        )}
      </div>
    <ul class="grid gap-4 lg:grid-cols-2">
      {drafts.map((draft) => (
        <li key={draft.key}>
          <DraftCard draft={draft} store={store} />
        </li>
      ))}
    </ul>
    </div>
  )
}
