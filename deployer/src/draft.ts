import { isSlug, slugify } from '../../src/domain/slug'
import { normalize } from '../../src/domain/title'
import type { Metadata } from './types'

export type DraftState = 'parsing' | 'ready' | 'error' | 'uploading' | 'done'
export type DraftStatus = 'new' | 'update' | 'exists'

/** One EPUB picked in the deployer, before and during upload. */
export interface Draft {
  key: string
  file: File
  state: DraftState
  error?: string
  title: string
  author: string
  genres: string[]
  description: string
  note: string
  language: string
  slug: string
  slugEdited: boolean
  size: number
  md5: string
  cover: Blob
  coverGenerated: boolean
  status: DraftStatus
  selected: boolean
  progress?: number
}

const SLUG_MESSAGE = 'Chỉ dùng a-z, 0-9 và dấu -'

/**
 * First free slug for a title. A catalog book with the candidate id and the same normalised
 * title keeps it (update); any other owner (catalog book with a different title, or another
 * draft in the batch, except `selfKey`) pushes the candidate to `-2`, `-3`, …
 */
export function suggestSlug(
  title: string,
  catalog: Metadata[],
  others: { key: string; slug: string }[],
  selfKey: string,
): string {
  const base = slugify(title)
  const titleKey = normalize(title)
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`
    const owner = catalog.find((b) => b.id === candidate)
    if (owner !== undefined && normalize(owner.title) !== titleKey) continue
    if (others.some((o) => o.key !== selfKey && o.slug === candidate)) continue
    return candidate
  }
}

/** "new" when the slug is absent from the catalog, "exists" when same slug and md5, else "update". */
export function computeStatus(draft: Pick<Draft, 'slug' | 'md5'>, catalog: Metadata[]): DraftStatus {
  const owner = catalog.find((b) => b.id === draft.slug)
  if (owner === undefined) return 'new'
  return owner.md5 === draft.md5 ? 'exists' : 'update'
}

/**
 * Overwrite guard: the title of the catalog book that owns this draft's slug, when that book has a
 * different normalised title. Null when the slug is free or the owner has the same title.
 */
export function conflictTitle(draft: Pick<Draft, 'title' | 'slug'>, catalog: Metadata[]): string | null {
  const owner = catalog.find((b) => b.id === draft.slug)
  if (owner === undefined || normalize(owner.title) === normalize(draft.title)) return null
  return owner.title
}

/**
 * Recomputes status, and sets the default selection: ticked unless already published, not ready,
 * or a conflict (a hand-typed slug that would overwrite another book starts unticked).
 */
export function reviewDraft(draft: Draft, catalog: Metadata[]): Draft {
  const status = computeStatus(draft, catalog)
  const conflict = conflictTitle(draft, catalog) !== null
  // Re-uploading a book keeps the note already published, unless one was typed.
  const note = draft.note === '' ? (catalog.find((b) => b.id === draft.slug)?.note ?? '') : draft.note
  return { ...draft, note, status, selected: status !== 'exists' && draft.state === 'ready' && !conflict }
}

export function slugError(slug: string): string | null {
  return isSlug(slug) ? null : SLUG_MESSAGE
}

/** New draft with the title changed; the slug follows the title unless it was edited by hand. */
export function applyTitleEdit(draft: Draft, title: string, catalog: Metadata[], drafts: Draft[]): Draft {
  const slug = draft.slugEdited
    ? draft.slug
    : suggestSlug(
        title,
        catalog,
        drafts.map((d) => ({ key: d.key, slug: d.slug })),
        draft.key,
      )
  const next = { ...draft, title, slug }
  return { ...next, status: computeStatus(next, catalog) }
}

export function toMetadata(draft: Draft, now: Date): Metadata {
  const note = draft.note.trim()
  return {
    schema: 1,
    id: draft.slug,
    title: draft.title,
    author: draft.author,
    genres: [...draft.genres],
    description: draft.description,
    ...(note !== '' ? { note } : {}),
    language: draft.language,
    epub: `${draft.slug}.epub`,
    size: draft.size,
    md5: draft.md5,
    updatedAt: now.toISOString(),
  }
}

export function canUpload(draft: Draft): boolean {
  return draft.state === 'ready' && draft.selected && slugError(draft.slug) === null
}
