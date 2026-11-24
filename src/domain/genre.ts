import { normalize } from './title'

export const KNOWN_GENRES = ['Tiên hiệp', 'Huyền huyễn', 'Khoa huyễn'] as const

/** Alias key (normalised) → known display name. */
const ALIASES: Record<string, string> = {
  'tien hiep': 'Tiên hiệp',
  xianxia: 'Tiên hiệp',
  'tu tien': 'Tiên hiệp',
  'huyen huyen': 'Huyền huyễn',
  xuanhuan: 'Huyền huyễn',
  fantasy: 'Huyền huyễn',
  'khoa huyen': 'Khoa huyễn',
  'sci fi': 'Khoa huyễn',
  'science fiction': 'Khoa huyễn',
  scifi: 'Khoa huyễn',
}

/** Matching key for a genre name: normalised, so case, diacritics and đ do not matter. */
export function genreKey(name: string): string {
  return normalize(name)
}

/** Title Case: first letter of each word upper-cased, the rest lower-cased, whitespace collapsed. */
function titleCase(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase('vi') + word.slice(1).toLocaleLowerCase('vi'))
    .join(' ')
}

/** Known display name for an alias or known genre; otherwise the Title Cased name ('' stays ''). */
export function canonicalGenre(name: string): string {
  const alias = ALIASES[genreKey(name)]
  if (alias !== undefined) return alias
  return titleCase(name)
}

/** Canonical genres from EPUB subjects (each may hold several, separated by , ; / |): empties dropped, deduped by key, first-seen order kept. */
export function genresFromSubjects(subjects: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  // Some EPUBs pack every genre into one <dc:subject> ("A, B, C"), so split on , ; / |.
  const parts = subjects.flatMap((subject) => subject.split(/[,;/|]/))
  for (const subject of parts) {
    const canonical = canonicalGenre(subject)
    if (canonical === '') continue
    const key = genreKey(canonical)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(canonical)
  }
  return result
}
