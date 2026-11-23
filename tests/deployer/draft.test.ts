import { describe, expect, it } from 'vitest'
import {
  applyTitleEdit,
  canUpload,
  computeStatus,
  conflictTitle,
  reviewDraft,
  slugError,
  suggestSlug,
  toMetadata,
  type Draft,
} from '../../deployer/src/draft'
import type { Metadata } from '../../deployer/src/types'

const NOW = new Date('2026-11-24T10:00:00.000Z')

function meta(over: Partial<Metadata> & { id: string }): Metadata {
  return {
    schema: 1,
    title: 'Đấu Phá',
    author: 'Thiên Tàm Thổ Đậu',
    genres: ['Huyền huyễn'],
    description: '',
    language: 'vi',
    epub: `${over.id}.epub`,
    size: 100,
    md5: 'm1',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...over,
  }
}

function draft(over: Partial<Draft> = {}): Draft {
  return {
    key: 'k1',
    file: new File(['x'], 'x.epub'),
    state: 'ready',
    title: 'Đấu Phá',
    author: 'Thiên Tàm Thổ Đậu',
    genres: ['Huyền huyễn'],
    description: 'Mô tả',
    language: 'vi',
    slug: 'dau-pha',
    slugEdited: false,
    size: 100,
    md5: 'm2',
    cover: new Blob(['c']),
    coverGenerated: false,
    status: 'new',
    selected: true,
    ...over,
  }
}

describe('deployer.review.status', () => {
  const catalog = [meta({ id: 'dau-pha', md5: 'm1' })]

  it('deployer.review.status: same slug and same md5 is "exists" and unselected by default', () => {
    const d = draft({ slug: 'dau-pha', md5: 'm1' })
    expect(computeStatus(d, catalog)).toBe('exists')
    expect(reviewDraft(d, catalog).selected).toBe(false)
    expect(reviewDraft(d, catalog).status).toBe('exists')
  })

  it('deployer.review.status: same slug and different md5 is "update" and selected by default', () => {
    const d = draft({ slug: 'dau-pha', md5: 'm2' })
    expect(computeStatus(d, catalog)).toBe('update')
    expect(reviewDraft(d, catalog).selected).toBe(true)
  })

  it('deployer.review.status: slug absent from the catalog is "new"', () => {
    expect(computeStatus(draft({ slug: 'other' }), catalog)).toBe('new')
  })

  it('deployer.review.status: a draft that is not ready is never selected by default', () => {
    const d = draft({ slug: 'other', state: 'parsing' })
    expect(reviewDraft(d, catalog).selected).toBe(false)
  })

  it('deployer.review.status: same title as a catalog book keeps its slug (update)', () => {
    expect(suggestSlug('Đấu Phá', catalog, [], 'k1')).toBe('dau-pha')
  })

  it('deployer.review.status: catalog book with the base slug but a different title pushes the draft to dau-pha-2', () => {
    const cat = [meta({ id: 'dau-pha', title: 'Đấu Phá Cũ', md5: 'm1' })]
    const slug = suggestSlug('Đấu Phá', cat, [], 'k1')
    expect(slug).toBe('dau-pha-2')
    expect(computeStatus(draft({ slug, md5: 'm2' }), cat)).toBe('new')
  })

  it('deployer.review.status: second draft with the same title in the batch gets dau-pha-2 and is "new"', () => {
    const first = draft({ key: 'a', slug: 'dau-pha', md5: 'm1' })
    const second = draft({ key: 'b', slug: 'dau-pha', md5: 'm2' })
    const slug = suggestSlug('Đấu Phá', catalog, [first, second].map((d) => ({ key: d.key, slug: d.slug })), 'b')
    expect(slug).toBe('dau-pha-2')
    expect(computeStatus({ ...second, slug }, catalog)).toBe('new')
  })

  it('deployer.review.status: the first of two same-title drafts keeps the catalog slug and stays "exists"', () => {
    const first = draft({ key: 'a', slug: 'dau-pha', md5: 'm1' })
    expect(computeStatus(first, catalog)).toBe('exists')
  })
})

describe('deployer.review.status: overwrite guard', () => {
  const catalog = [meta({ id: 'dau-pha', title: 'Đấu Phá', md5: 'm1' })]

  it('deployer.review.status: hand-typed slug of another book is a conflict', () => {
    const d = draft({ title: 'Phàm Nhân', slug: 'dau-pha', slugEdited: true, md5: 'm2' })
    expect(conflictTitle(d, catalog)).toBe('Đấu Phá')
    const reviewed = reviewDraft(d, catalog)
    expect(reviewed.status).toBe('update')
    expect(reviewed.selected).toBe(false)
  })

  it('deployer.review.status: a conflict stays unselected even when the md5 is new', () => {
    const d = draft({ title: 'Phàm Nhân', slug: 'dau-pha', md5: 'm9' })
    expect(reviewDraft(d, catalog).selected).toBe(false)
  })

  it('deployer.review.status: same title as the catalog book is not a conflict', () => {
    const d = draft({ slug: 'dau-pha', md5: 'm2' })
    expect(conflictTitle(d, catalog)).toBeNull()
    expect(reviewDraft(d, catalog).selected).toBe(true)
  })

  it('deployer.review.status: a slug absent from the catalog is not a conflict', () => {
    expect(conflictTitle(draft({ slug: 'other', title: 'Khác' }), catalog)).toBeNull()
  })
})

describe('deployer.review.invalid-slug', () => {
  it('deployer.review.invalid-slug: a slug with spaces or diacritics shows the Vietnamese message', () => {
    expect(slugError('Đấu Phá')).toBe('Chỉ dùng a-z, 0-9 và dấu -')
    expect(slugError('dau pha')).toBe('Chỉ dùng a-z, 0-9 và dấu -')
  })

  it('deployer.review.invalid-slug: empty, leading/trailing or doubled dashes are invalid', () => {
    expect(slugError('')).not.toBeNull()
    expect(slugError('-dau')).not.toBeNull()
    expect(slugError('dau-')).not.toBeNull()
    expect(slugError('dau--pha')).not.toBeNull()
  })

  it('deployer.review.invalid-slug: a valid slug gives null', () => {
    expect(slugError('dau-pha-2')).toBeNull()
  })

  it('deployer.review.invalid-slug: an invalid slug blocks upload even when ready and selected', () => {
    expect(canUpload(draft({ slug: 'Đấu Phá' }))).toBe(false)
    expect(canUpload(draft({ slug: 'dau-pha' }))).toBe(true)
  })

  it('deployer.review.invalid-slug: canUpload needs state ready and selected', () => {
    expect(canUpload(draft({ state: 'uploading' }))).toBe(false)
    expect(canUpload(draft({ state: 'error' }))).toBe(false)
    expect(canUpload(draft({ selected: false }))).toBe(false)
  })
})

describe('deployer.review.edit', () => {
  const catalog = [meta({ id: 'dau-pha', md5: 'm1' })]

  it('deployer.review.edit: changing the title of a draft whose slug was not edited moves the slug and recomputes status', () => {
    const d = draft({ title: 'Đấu Phá', slug: 'dau-pha', slugEdited: false, md5: 'm1', status: 'exists', selected: false })
    const edited = applyTitleEdit(d, 'Đấu Phá Thương Khung', catalog, [d])
    expect(edited.title).toBe('Đấu Phá Thương Khung')
    expect(edited.slug).toBe('dau-pha-thuong-khung')
    expect(edited.status).toBe('new')
    expect(edited.slugEdited).toBe(false)
  })

  it('deployer.review.edit: a hand-edited slug is kept when the title changes', () => {
    const d = draft({ slug: 'custom', slugEdited: true })
    const edited = applyTitleEdit(d, 'Đấu Phá Thương Khung', catalog, [d])
    expect(edited.slug).toBe('custom')
    expect(edited.status).toBe('new')
  })

  it('deployer.review.edit: re-titling to a title that matches the catalog recomputes to "exists"', () => {
    const d = draft({ title: 'Khác', slug: 'khac', md5: 'm1' })
    const edited = applyTitleEdit(d, 'Đấu Phá', catalog, [d])
    expect(edited.slug).toBe('dau-pha')
    expect(edited.status).toBe('exists')
  })
})

describe('deployer.review.edit: batch slugs', () => {
  it('deployer.review.edit: two drafts in a batch never share a slug', () => {
    const drafts = [draft({ key: 'a', title: '', slug: 'truyen' }), draft({ key: 'b', title: '', slug: 'truyen' }), draft({ key: 'c', title: '', slug: 'truyen' })]
    let current = drafts
    for (const target of ['a', 'b', 'c']) {
      const d = current.find((x) => x.key === target)!
      const updated = applyTitleEdit(d, 'Phàm Nhân', [], current)
      current = current.map((x) => (x.key === target ? updated : x))
    }
    const slugs = current.map((d) => d.slug)
    expect(slugs).toEqual(['pham-nhan', 'pham-nhan-2', 'pham-nhan-3'])
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('deployer.review.edit: a draft does not collide with its own previous slug', () => {
    const d = draft({ key: 'a', slug: 'pham-nhan' })
    const updated = applyTitleEdit(d, 'Phàm Nhân', [], [d])
    expect(updated.slug).toBe('pham-nhan')
  })
})

describe('deployer.review: toMetadata', () => {
  it('deployer.review.edit: builds metadata with id = slug, epub = slug.epub and updatedAt = now', () => {
    const m = toMetadata(draft({ slug: 'dau-pha', title: 'Đấu Phá', md5: 'm2', size: 42 }), NOW)
    expect(m).toEqual({
      schema: 1,
      id: 'dau-pha',
      title: 'Đấu Phá',
      author: 'Thiên Tàm Thổ Đậu',
      genres: ['Huyền huyễn'],
      description: 'Mô tả',
      language: 'vi',
      epub: 'dau-pha.epub',
      size: 42,
      md5: 'm2',
      updatedAt: NOW.toISOString(),
    })
  })
})
