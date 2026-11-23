import { normalize } from '../domain/title'
import type { Progress } from '../db/db'

export interface RelocateInfo {
  cfi: string
  fraction: number
  rangeText: string
  sectionIndex: number
  sectionHref: string
  sectionFraction: number
}

export type Anchor = Omit<Progress, 'updatedAt' | 'deleted'>

const SNIPPET_MAX = 120
const KEY_MAX = 40
const KEY_LONG = 80

/** Build the progress payload (without sync metadata) from a reader relocate event. */
export function buildAnchor(
  info: RelocateInfo,
  book: { id: string; normTitle: string },
  md5: string,
): Anchor {
  return {
    id: book.id,
    bookId: book.id,
    normTitle: book.normTitle,
    cfi: info.cfi,
    snippet: info.rangeText.replace(/\s+/g, ' ').trim().slice(0, SNIPPET_MAX),
    sectionIndex: info.sectionIndex,
    sectionHref: info.sectionHref,
    sectionFraction: info.sectionFraction,
    fraction: info.fraction,
    bookMd5: md5,
  }
}

/** Normalised, length-capped key used to compare text across book versions. */
export function snippetKey(text: string): string {
  return normalize(text).slice(0, KEY_MAX)
}

/**
 * Search keys for locating a snippet inside a section, longest first: the whole normalised
 * snippet, then its first 80 and first 40 characters. Distinct and non-empty only.
 */
export function snippetKeys(text: string): string[] {
  const full = normalize(text)
  if (full === '') return []
  const candidates = [full, full.slice(0, KEY_LONG), full.slice(0, KEY_MAX)]
  return candidates.filter((k, i) => k !== '' && candidates.indexOf(k) === i)
}

export type RestoreStep =
  | { kind: 'cfi'; cfi: string }
  | { kind: 'cfi-if-text'; cfi: string; key: string }
  | {
      kind: 'snippet'
      keys: string[]
      sectionHref: string
      sectionIndex: number
      sectionFraction: number
    }
  | { kind: 'section'; sectionHref: string; sectionIndex: number; sectionFraction: number }
  | { kind: 'fraction'; fraction: number }

/** Ordered restore strategies for a saved position, most precise first. */
export function planRestore(p: Progress | undefined, md5: string): RestoreStep[] {
  if (!p || p.deleted === 1) return []
  if (p.bookMd5 === md5) {
    return [
      { kind: 'cfi', cfi: p.cfi },
      { kind: 'fraction', fraction: p.fraction },
    ]
  }
  const key = snippetKey(p.snippet)
  const steps: RestoreStep[] = [{ kind: 'cfi-if-text', cfi: p.cfi, key }]
  const keys = snippetKeys(p.snippet)
  if (keys.length > 0) {
    steps.push({
      kind: 'snippet',
      keys,
      sectionHref: p.sectionHref,
      sectionIndex: p.sectionIndex,
      sectionFraction: p.sectionFraction,
    })
  }
  steps.push({
    kind: 'section',
    sectionHref: p.sectionHref,
    sectionIndex: p.sectionIndex,
    sectionFraction: p.sectionFraction,
  })
  steps.push({ kind: 'fraction', fraction: p.fraction })
  return steps
}
