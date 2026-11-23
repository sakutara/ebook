import { describe, it, expect } from 'vitest'
import { slugify, isSlug } from '../../src/domain/slug'

describe('slug: slugify', () => {
  it('slug: converts a Vietnamese title to a dash-separated ascii slug', () => {
    expect(slugify('Đấu Phá Thương Khung')).toBe('dau-pha-thuong-khung')
  })

  it('slug: punctuation and repeated spaces collapse to a single dash', () => {
    expect(slugify('  Hello,   World!  ')).toBe('hello-world')
  })

  it('slug: empty or punctuation-only title becomes "truyen"', () => {
    expect(slugify('')).toBe('truyen')
    expect(slugify('   ')).toBe('truyen')
    expect(slugify('!!!')).toBe('truyen')
  })

  it('slug: result is at most 80 chars and never ends with a dash', () => {
    const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ')
    const slug = slugify(long)
    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug.endsWith('-')).toBe(false)
    expect(isSlug(slug)).toBe(true)
  })

  it('slug: long title is cut at the last dash before 80 chars', () => {
    const long = 'a'.repeat(70) + ' ' + 'b'.repeat(20)
    expect(slugify(long)).toBe('a'.repeat(70))
  })

  it('slug: long title without dashes is hard cut at 80 chars', () => {
    expect(slugify('x'.repeat(100))).toBe('x'.repeat(80))
  })
})

describe('slug: isSlug', () => {
  it('slug: accepts lowercase alphanumerics separated by single dashes', () => {
    expect(isSlug('dau-pha-thuong-khung')).toBe(true)
    expect(isSlug('abc123')).toBe(true)
  })

  it('slug: rejects uppercase, underscores, empty, and leading/trailing/double dashes', () => {
    expect(isSlug('1AbC_x')).toBe(false)
    expect(isSlug('')).toBe(false)
    expect(isSlug('-abc')).toBe(false)
    expect(isSlug('abc-')).toBe(false)
    expect(isSlug('abc--d')).toBe(false)
    expect(isSlug('a b')).toBe(false)
  })
})
