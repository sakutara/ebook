import { normalize } from './title'

const LEADING_QUOTES = /^["'“”‘’«»]+/u
const TRAILING_PUNCT = /["'“”‘’«».,!?;:…~]+$/u
const ROMAN_NUMERAL = /^(ii|iii|iv|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx)$/i
const OPEN_TO_CLOSE: Record<string, string> = { '(': ')', '[': ']', '{': '}' }

/**
 * NFC, collapse whitespace, drop control/format characters, trim; strip wrapping quotes and
 * trailing punctuation, and a matching pair of brackets, until stable.
 */
export function cleanText(raw: string): string {
  let s = raw
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()

  let previous: string
  do {
    previous = s
    s = s.replace(LEADING_QUOTES, '').replace(TRAILING_PUNCT, '').trim()
    const close = OPEN_TO_CLOSE[s.charAt(0)]
    if (close !== undefined && s.length >= 2 && s.endsWith(close)) {
      s = s.slice(1, -1).trim()
    }
  } while (s !== previous)

  return s
}

/** Title-case each word and each hyphen part; Roman numerals II–XX are kept upper-case. */
export function titleCaseVi(s: string): string {
  return s.replace(/[^\s-]+/gu, (part) => {
    if (ROMAN_NUMERAL.test(part)) return part.toLocaleUpperCase('vi')
    return part.replace(/^(\P{L}*)(\p{L})?(.*)$/su, (_match, pre: string, first: string | undefined, rest: string) =>
      pre + (first ? first.toLocaleUpperCase('vi') : '') + rest.toLocaleLowerCase('vi'),
    )
  })
}

export function normalizeRequestText(raw: string): string {
  return titleCaseVi(cleanText(raw))
}

/** Accent/case/punctuation-insensitive identity of a request: the title only. */
export function requestKey(title: string): string {
  return normalize(title)
}

/** True when s has a letter and no character above U+007F. */
export function lacksDiacritics(s: string): boolean {
  if (!/\p{L}/u.test(s)) return false
  for (const ch of s) {
    if ((ch.codePointAt(0) ?? 0) > 0x7f) return false
  }
  return true
}
