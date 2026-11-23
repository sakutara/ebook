import { describe, it, expect } from 'vitest'
import {
  buildAnchor,
  snippetKey,
  snippetKeys,
  planRestore,
  type RelocateInfo,
} from '../../src/progress/anchor'
import type { Progress } from '../../src/db/db'
import { normalize } from '../../src/domain/title'

const info: RelocateInfo = {
  cfi: 'epubcfi(/6/4!/4/2)',
  fraction: 0.42,
  rangeText: '  Hello   world\n\tthis is  text  ',
  sectionIndex: 3,
  sectionHref: 'chapter3.xhtml',
  sectionFraction: 0.5,
}
const book = { id: 'b1', normTitle: 'dau pha' }

function progress(over: Partial<Progress> = {}): Progress {
  return {
    id: 'b1',
    bookId: 'b1',
    normTitle: 'dau pha',
    cfi: 'epubcfi(/6/4!/4/2)',
    snippet: 'some text here',
    sectionIndex: 3,
    sectionHref: 'chapter3.xhtml',
    sectionFraction: 0.5,
    fraction: 0.42,
    bookMd5: 'md5-a',
    updatedAt: 1,
    deleted: 0,
    ...over,
  }
}

describe('anchor', () => {
  it('progress.resume.same-version: plans cfi then fraction', () => {
    const steps = planRestore(progress(), 'md5-a')
    expect(steps).toEqual([
      { kind: 'cfi', cfi: 'epubcfi(/6/4!/4/2)' },
      { kind: 'fraction', fraction: 0.42 },
    ])
  })

  it('progress.resume.after-refresh: plans cfi-if-text, snippet, section, fraction when md5 differs', () => {
    const steps = planRestore(progress({ snippet: 'Some Text, Here!' }), 'md5-b')
    expect(steps).toEqual([
      { kind: 'cfi-if-text', cfi: 'epubcfi(/6/4!/4/2)', key: snippetKey('Some Text, Here!') },
      {
        kind: 'snippet',
        keys: ['some text here'],
        sectionHref: 'chapter3.xhtml',
        sectionIndex: 3,
        sectionFraction: 0.5,
      },
      { kind: 'section', sectionHref: 'chapter3.xhtml', sectionIndex: 3, sectionFraction: 0.5 },
      { kind: 'fraction', fraction: 0.42 },
    ])
  })

  it('progress.resume.snippet-gone: snippet step omitted when the snippet is empty', () => {
    const steps = planRestore(progress({ snippet: '' }), 'md5-b')
    expect(steps.map((s) => s.kind)).toEqual(['cfi-if-text', 'section', 'fraction'])
    const first = steps[0]
    expect(first).toEqual({ kind: 'cfi-if-text', cfi: 'epubcfi(/6/4!/4/2)', key: '' })
  })

  it('anchor: no plan for missing or deleted progress', () => {
    expect(planRestore(undefined, 'md5-a')).toEqual([])
    expect(planRestore(progress({ deleted: 1 }), 'md5-a')).toEqual([])
    expect(planRestore(progress({ deleted: 1 }), 'md5-b')).toEqual([])
  })

  it('anchor: snippet collapses whitespace and is at most 120 chars', () => {
    const anchor = buildAnchor(info, book, 'md5-a')
    expect(anchor.snippet).toBe('Hello world this is text')
    const long = buildAnchor({ ...info, rangeText: 'word '.repeat(100) }, book, 'md5-a')
    expect(long.snippet.length).toBeLessThanOrEqual(120)
    expect(long.snippet.length).toBe(120)
    expect(long.snippet.startsWith('word word')).toBe(true)
  })

  it('progress.resume.ambiguous-snippet: snippetKeys are the full snippet, then 80 and 40 chars, longest first, distinct', () => {
    const text = 'ABCDEFGHIJ '.repeat(12)
    const full = normalize(text)
    expect(full.length).toBeGreaterThan(80)
    expect(snippetKeys(text)).toEqual([full, full.slice(0, 80), full.slice(0, 40)])
    expect(snippetKeys('short text')).toEqual(['short text'])
    expect(snippetKeys('')).toEqual([])
    expect(snippetKeys('  ,.!  ')).toEqual([])
  })

  it('anchor: snippetKey is normalised and at most 40 chars', () => {
    expect(snippetKey('  Đấu Phá, Thương Khung!  ')).toBe('dau pha thuong khung')
    const key = snippetKey('ABCDEFGHIJ '.repeat(10))
    expect(key.length).toBeLessThanOrEqual(40)
    expect(key).toBe(key.toLowerCase())
  })

  it('anchor: buildAnchor maps relocate info onto the progress fields', () => {
    expect(buildAnchor(info, book, 'md5-a')).toEqual({
      id: 'b1',
      bookId: 'b1',
      normTitle: 'dau pha',
      cfi: 'epubcfi(/6/4!/4/2)',
      snippet: 'Hello world this is text',
      sectionIndex: 3,
      sectionHref: 'chapter3.xhtml',
      sectionFraction: 0.5,
      fraction: 0.42,
      bookMd5: 'md5-a',
    })
  })
})
