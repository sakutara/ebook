import { normalize } from './title'

const MAX_LENGTH = 80

/** Dash-separated ascii slug of a title, at most 80 chars; '' becomes 'truyen'. */
export function slugify(title: string): string {
  const raw = normalize(title).replace(/ /g, '-')
  let slug = raw
  if (raw.length > MAX_LENGTH) {
    const head = raw.slice(0, MAX_LENGTH)
    const lastDash = head.lastIndexOf('-')
    slug = lastDash > 0 ? head.slice(0, lastDash) : head
  }
  slug = slug.replace(/-+$/, '')
  return slug === '' ? 'truyen' : slug
}

/** True for lowercase ascii alphanumerics separated by single dashes. */
export function isSlug(s: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)
}
