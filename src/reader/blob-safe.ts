/**
 * MIME types whose Blob body is parsed as markup by some browser extensions.
 * Compared case-insensitively.
 */
export const MARKUP_TYPES: readonly string[] = [
  'text/html',
  'application/xhtml+xml',
  'text/xml',
  'application/xml',
  'image/svg+xml',
]

/**
 * Converts a markup string into UTF-8 bytes so that the Blob built from it is not a string-backed
 * markup Blob. Extensions such as ExpressVPN wrap the Blob constructor and inject <script> into
 * string-backed markup Blobs; for XHTML that throws a SyntaxError and the chapter never loads.
 * The UTF-8 bytes are identical to what `new Blob([str])` would encode, so content is unchanged.
 *
 * Non-markup values are returned as-is. Rejections from `data` propagate unchanged.
 */
export async function toBytesIfMarkup(data: unknown, type: unknown): Promise<unknown> {
  const value = await data
  const resolvedType = await type
  if (
    typeof value === 'string' &&
    typeof resolvedType === 'string' &&
    MARKUP_TYPES.includes(resolvedType.toLowerCase())
  ) {
    return new TextEncoder().encode(value)
  }
  return value
}

/**
 * Listens for foliate-js 'data' events on `target` (book.transformTarget) and rewrites markup
 * payloads with toBytesIfMarkup. Returns a function that removes the listener.
 */
export function installBlobSafeTransform(target: EventTarget): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail
    if (!detail || typeof detail !== 'object') return
    detail.data = toBytesIfMarkup(detail.data, detail.type)
  }
  target.addEventListener('data', listener)
  return () => target.removeEventListener('data', listener)
}
