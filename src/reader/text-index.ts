/**
 * Pure text index over a DOM subtree, used to find a snippet inside a section.
 *
 * `text` is the body text normalised with the same rules as domain/title.ts normalize (strip
 * combining marks, đ/Đ to d, lowercase, every run of non-letter/non-digit characters to one
 * space, no leading space), built character by character so the text nodes can be joined
 * without a separator, exactly as Range.toString() joins them for a snippet.
 * `map[i]` is the source (text node, UTF-16 offset) of normalised character i.
 */

export interface TextSource {
  node: Text
  offset: number
}

export interface TextIndex {
  text: string
  map: TextSource[]
}

const MARK = /\p{M}/u
const WORD = /[\p{L}\p{N}]/u
const SKIPPED_PARENTS = 'script, style'

/** Normalised characters produced by one source character (may be none, e.g. a combining mark). */
function normalizeChar(ch: string): string[] {
  const out: string[] = []
  for (const c of ch.normalize('NFD')) {
    if (MARK.test(c)) continue
    const mapped = c === 'đ' ? 'd' : c === 'Đ' ? 'D' : c
    for (const lower of mapped.toLowerCase()) out.push(lower)
  }
  return out
}

export function buildTextIndex(root: Node): TextIndex {
  const doc = root.ownerDocument ?? (root as Document)
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let text = ''
  const map: TextSource[] = []
  let pendingSpace = false

  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (node.parentElement?.closest(SKIPPED_PARENTS)) continue
    const data = node.data
    let i = 0
    while (i < data.length) {
      const ch = String.fromCodePoint(data.codePointAt(i) ?? 0)
      const source: TextSource = { node, offset: i }
      i += ch.length
      for (const out of normalizeChar(ch)) {
        if (WORD.test(out)) {
          if (pendingSpace && text !== '') {
            text += ' '
            map.push(source)
          }
          pendingSpace = false
          text += out
          map.push(source)
        } else {
          pendingSpace = true
        }
      }
    }
  }
  return { text, map }
}

/**
 * Start offset in index.text of the occurrence nearest nearFraction (0..1 through the text), for
 * the first key that occurs at all. Keys are tried in order (callers pass longest first). Empty
 * keys are ignored. Null when no key occurs.
 */
export function findNearest(index: TextIndex, keys: string[], nearFraction: number): number | null {
  const len = index.text.length
  for (const key of keys) {
    if (key === '') continue
    let best: number | null = null
    let bestDistance = Infinity
    for (let at = index.text.indexOf(key); at !== -1; at = index.text.indexOf(key, at + 1)) {
      const distance = Math.abs(at / len - nearFraction)
      if (distance < bestDistance) {
        best = at
        bestDistance = distance
      }
    }
    if (best !== null) return best
  }
  return null
}
