// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readEpubMeta, EpubError } from '../../deployer/src/epub-meta'
import { slugify } from '../../src/domain/slug'

const fixtures = resolve(__dirname, '../fixtures') + '/'

function loadFixture(name: string): File {
  const bytes = readFileSync(`${fixtures}${name}`)
  return new File([new Uint8Array(bytes)], name, { type: 'application/epub+zip' })
}

describe('deployer.extract.metadata', () => {
  it('deployer.extract.metadata: reads title, author, genres, description, language and cover', async () => {
    const meta = await readEpubMeta(loadFixture('book-meta.epub'))
    expect(meta.title).toBe('Phàm Nhân Tu Tiên')
    expect(meta.author).toBe('Vong Ngữ')
    expect(meta.genres).toEqual(['Tiên hiệp'])
    expect(meta.description).toBe('Một phàm nhân bước vào con đường tu tiên.')
    expect(meta.language).toBe('vi')
    expect(meta.cover).not.toBeNull()
    expect(meta.cover?.size).toBeGreaterThan(0)
  })

  it('deployer.extract.metadata: title slugs to pham-nhan-tu-tien', async () => {
    const meta = await readEpubMeta(loadFixture('book-meta.epub'))
    expect(slugify(meta.title)).toBe('pham-nhan-tu-tien')
  })

  it('deployer.extract.metadata: book without cover gives cover null and keeps metadata title', async () => {
    const meta = await readEpubMeta(loadFixture('book-nocover.epub'))
    expect(meta.cover).toBeNull()
    expect(meta.title).toBe('Sách Mẫu')
    expect(meta.language).toBe('vi')
  })
})

describe('deployer.extract.broken', () => {
  it('deployer.extract.broken: random bytes named x.epub throw EpubError', async () => {
    const bytes = new Uint8Array(4096)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 2654435761) >>> 24
    const file = new File([bytes], 'x.epub')
    const err = await readEpubMeta(file).then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(EpubError)
    expect((err as Error).message).toBe('không đọc được EPUB')
  })
})
