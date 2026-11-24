import { useState } from 'preact/hooks'
import { KNOWN_GENRES, canonicalGenre, genreKey } from '../../../src/domain/genre'
import { IconButton, IconTextButton } from '../../../src/ui/icons/Icon'
import type { Metadata } from '../types'

export interface EditBookDialogProps {
  book: Metadata
  onSave: (patch: Pick<Metadata, 'title' | 'author' | 'genres' | 'description'> & { note: string }) => Promise<void>
  onCancel: () => void
}

const FIELD = 'field text-fluid-base'

function isKnownGenre(name: string): boolean {
  return KNOWN_GENRES.some((k) => genreKey(k) === genreKey(name))
}

/** Modal form to edit the metadata of a published book (not its EPUB, cover or folder). */
export function EditBookDialog({ book, onSave, onCancel }: EditBookDialogProps) {
  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author)
  const [description, setDescription] = useState(book.description)
  const [note, setNote] = useState(book.note ?? '')
  const [genres, setGenres] = useState<string[]>(book.genres)
  const [otherGenre, setOtherGenre] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = `edit-${book.id}`

  const toggle = (name: string) =>
    setGenres((cur) =>
      cur.some((g) => genreKey(g) === genreKey(name))
        ? cur.filter((g) => genreKey(g) !== genreKey(name))
        : [...cur, name],
    )

  const addOther = () => {
    const name = canonicalGenre(otherGenre)
    setOtherGenre('')
    if (name === '' || genres.some((g) => genreKey(g) === genreKey(name))) return
    setGenres([...genres, name])
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await onSave({ title, author, genres, description, note })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định')
      setSaving(false)
    }
  }

  return (
    <dialog
      open
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-heading`}
      class="fixed inset-0 m-auto max-h-[90vh] w-[min(92vw,34rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-float backdrop:bg-black/50"
    >
      <h3 id={`${id}-heading`} class="font-serif text-fluid-lg font-semibold">
        Sửa thông tin truyện
      </h3>
      <p class="text-xs text-ink-muted">{`books/${book.id}/`}</p>
      <div class="mt-3 grid gap-3">
        <div class="grid gap-1 text-fluid-sm">
          <label for={`${id}-title`}>Tên truyện</label>
          <input id={`${id}-title`} type="text" class={FIELD} value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
        </div>
        <div class="grid gap-1 text-fluid-sm">
          <label for={`${id}-author`}>Tác giả</label>
          <input id={`${id}-author`} type="text" class={FIELD} value={author} onInput={(e) => setAuthor(e.currentTarget.value)} />
        </div>
        <div class="grid gap-1 text-fluid-sm">
          <label for={`${id}-description`}>Mô tả</label>
          <textarea id={`${id}-description`} rows={4} class={FIELD} value={description} onInput={(e) => setDescription(e.currentTarget.value)} />
        </div>
        <div class="grid gap-1 text-fluid-sm">
          <label for={`${id}-note`}>Ghi chú (hiện trong cửa sổ truyện)</label>
          <textarea id={`${id}-note`} rows={3} class={FIELD} value={note} onInput={(e) => setNote(e.currentTarget.value)} />
        </div>
        <div role="group" aria-label="Thể loại" class="grid gap-2">
          <div class="flex flex-wrap gap-2">
            {KNOWN_GENRES.map((name) => (
              <button
                key={name}
                type="button"
                class="chip text-fluid-sm"
                aria-pressed={genres.some((g) => genreKey(g) === genreKey(name))}
                onClick={() => toggle(name)}
              >
                {name}
              </button>
            ))}
          </div>
          {genres.filter((g) => !isKnownGenre(g)).length > 0 && (
            <div class="flex flex-wrap gap-2">
              {genres
                .filter((g) => !isKnownGenre(g))
                .map((name) => (
                  <span key={name} class="inline-flex items-center gap-1 rounded-full bg-surface-2 pl-3 text-fluid-sm">
                    {name}
                    <IconButton icon="close" label={`Bỏ thể loại ${name}`} onClick={() => toggle(name)} />
                  </span>
                ))}
            </div>
          )}
          <div class="grid gap-1 text-fluid-sm">
            <label for={`${id}-other`}>Thể loại khác</label>
            <input
              id={`${id}-other`}
              type="text"
              class={FIELD}
              value={otherGenre}
              onInput={(e) => setOtherGenre(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                addOther()
              }}
            />
          </div>
        </div>
      </div>
      {error !== null && (
        <p role="alert" class="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-fluid-sm text-danger">{`Lỗi: ${error}`}</p>
      )}
      <div class="mt-4 flex justify-end gap-2">
        <IconTextButton icon="close" label="Huỷ" disabled={saving} onClick={onCancel} />
        <IconTextButton
          icon="confirm"
          label={saving ? 'Đang lưu…' : 'Lưu'}
          variant="primary"
          disabled={saving || title.trim() === ''}
          onClick={() => void save()}
        />
      </div>
    </dialog>
  )
}
