/** Derive a display title from a Drive file name: drop .epub, underscores to spaces, collapse whitespace. */
export function titleFromName(name: string): string {
  return name
    .replace(/\.epub$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Lowercase, strip diacritics, map đ/Đ to d, and reduce punctuation to single spaces. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** True when every query token (normalised) is a substring of the normalised title. */
export function matchesQuery(normTitle: string, query: string): boolean {
  const tokens = normalize(query).split(' ').filter(Boolean)
  if (tokens.length === 0) return true
  return tokens.every((token) => normTitle.includes(token))
}
