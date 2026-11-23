// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const fixtures = fileURLToPath(new URL('../../tests/fixtures/', import.meta.url))

type ZipEntryLike = { filename: string; getData: (w: unknown) => Promise<string> }

async function openZip(path: string) {
  const { configure, ZipReader, BlobReader } = await import('foliate-js/vendor/zip.js')
  configure({ useWebWorkers: false })
  const reader = new ZipReader(new BlobReader(new Blob([readFileSync(path)])))
  const entries = (await reader.getEntries()) as ZipEntryLike[]
  return { entries, close: () => reader.close() }
}

async function readEntry(path: string, name: string): Promise<string> {
  const { TextWriter } = await import('foliate-js/vendor/zip.js')
  const { entries, close } = await openZip(path)
  try {
    const entry = entries.find((e) => e.filename === name)
    if (!entry) throw new Error(`missing entry ${name} in ${path}`)
    return await entry.getData(new TextWriter())
  } finally {
    await close()
  }
}

async function entryNames(path: string): Promise<string[]> {
  const { entries, close } = await openZip(path)
  try {
    return entries.map((e) => e.filename)
  } finally {
    await close()
  }
}

function paragraphsOf(xhtml: string): string[] {
  return [...xhtml.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1])
}

beforeAll(() => {
  const res = spawnSync(process.execPath, ['scripts/make-fixtures.mjs'], { cwd: root, encoding: 'utf-8' })
  if (res.status !== 0) throw new Error(`make-fixtures failed: ${res.stderr}`)
}, 60_000)

describe('fixtures', () => {
  it('fixtures: mimetype is the first entry and stored', () => {
    const bytes = readFileSync(`${fixtures}book-v1.epub`)
    expect(bytes.subarray(30, 38).toString('utf-8')).toBe('mimetype')
    expect(bytes.readUInt16LE(8)).toBe(0)
  })

  it('fixtures: v1 has 10 chapters and a cover-image item', async () => {
    const path = `${fixtures}book-v1.epub`
    const names = await entryNames(path)
    for (let c = 1; c <= 10; c++) {
      expect(names).toContain(`OEBPS/chap${String(c).padStart(3, '0')}.xhtml`)
    }
    const opf = await readEntry(path, 'OEBPS/content.opf')
    expect(opf.match(/href="chap\d{3}\.xhtml"/g)?.length).toBe(10)
    expect(opf).toContain('properties="cover-image"')
  })

  it('fixtures: v2 chapter 5 has 41 paragraphs starting with C5P0', async () => {
    const ch5 = await readEntry(`${fixtures}book-v2.epub`, 'OEBPS/chap005.xhtml')
    const paras = paragraphsOf(ch5)
    expect(paras.length).toBe(41)
    expect(paras[0].startsWith('C5P0')).toBe(true)
  })

  it('fixtures: v3 chapter 5 has no C5P marker', async () => {
    const ch5 = await readEntry(`${fixtures}book-v3.epub`, 'OEBPS/chap005.xhtml')
    expect(ch5).not.toContain('C5P')
    expect(ch5).toContain('C5R')
  })

  it('fixtures: v4 has 9 chapters and no chap005.xhtml', async () => {
    const path = `${fixtures}book-v4.epub`
    const names = await entryNames(path)
    expect(names).not.toContain('OEBPS/chap005.xhtml')
    const chapters = names.filter((n) => /^OEBPS\/chap\d{3}\.xhtml$/.test(n))
    expect(chapters.length).toBe(9)
    const opf = await readEntry(path, 'OEBPS/content.opf')
    expect(opf).not.toContain('chap005.xhtml')
    expect(opf.match(/href="chap\d{3}\.xhtml"/g)?.length).toBe(9)
  })

  it('fixtures: nocover has no cover-image item', async () => {
    const path = `${fixtures}book-nocover.epub`
    const opf = await readEntry(path, 'OEBPS/content.opf')
    expect(opf).not.toContain('cover-image')
    expect(await entryNames(path)).not.toContain('OEBPS/cover.jpg')
  })

  it('fixtures: cover.jpg is a JPEG', () => {
    const bytes = readFileSync(`${fixtures}cover.jpg`)
    expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff')
    expect(bytes.subarray(bytes.length - 2).toString('hex')).toBe('ffd9')
  })
})
