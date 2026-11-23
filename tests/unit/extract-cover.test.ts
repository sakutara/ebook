// @vitest-environment jsdom
import { beforeAll, describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DriveRangeReader } from '../../src/drive/range-reader'
import { extractCover } from '../../src/covers/extract-cover'

// Vitest runs from the project root; jsdom's import.meta.url is not a file URL.
const FIXTURES = resolve(process.cwd(), 'tests/fixtures') + '/'

let epub: Uint8Array
let nocover: Uint8Array
let coverJpg: Uint8Array

beforeAll(() => {
  const r = spawnSync(process.execPath, ['scripts/make-fixtures.mjs'], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`make-fixtures failed: ${r.stderr}`)
  epub = new Uint8Array(readFileSync(FIXTURES + 'book-v1.epub'))
  nocover = new Uint8Array(readFileSync(FIXTURES + 'book-nocover.epub'))
  coverJpg = new Uint8Array(readFileSync(FIXTURES + 'cover.jpg'))
})

function fakeApi(bytes: Uint8Array) {
  return {
    fetchRange: async (_id: string, s: number, e: number) => bytes.slice(s, e + 1),
  }
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

describe('covers.extract', () => {
  it('library.cover.range: extracts the cover through Range reads using under half of the file', async () => {
    const reader = new DriveRangeReader(fakeApi(epub), 'a', epub.length)
    const cover = await extractCover(reader)
    expect(cover).not.toBeNull()
    expect(await bytesOf(cover!)).toEqual(coverJpg)
    expect(reader.bytesRequested).toBeLessThan(epub.length / 2)
  })

  it('library.cover.range: extracts the same cover from a Blob', async () => {
    const cover = await extractCover(new Blob([epub]))
    expect(cover).not.toBeNull()
    expect(await bytesOf(cover!)).toEqual(coverJpg)
  })

  it('library.cover.none: a book without a cover returns null', async () => {
    const cover = await extractCover(new Blob([nocover]))
    expect(cover).toBeNull()
  })

  it('range-reader: readUint8Array requests offset..offset+length-1', async () => {
    const calls: Array<[string, number, number]> = []
    const api = {
      fetchRange: async (id: string, s: number, e: number) => {
        calls.push([id, s, e])
        return new Uint8Array(e - s + 1)
      },
    }
    const reader = new DriveRangeReader(api, 'a', 100)
    const out = await reader.readUint8Array(10, 5)
    expect(calls).toEqual([['a', 10, 14]])
    expect(out.length).toBe(5)
    expect(reader.bytesRequested).toBe(5)
    expect(reader.size).toBe(100)
  })
})
