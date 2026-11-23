import { genresFromSubjects } from '../../src/domain/genre'
import { titleFromName } from '../../src/domain/title'

export interface EpubMeta {
  title: string
  author: string
  genres: string[]
  description: string
  language: string
  cover: Blob | null
}

export class EpubError extends Error {
  constructor() {
    super('không đọc được EPUB')
    this.name = 'EpubError'
  }
}

const MAX_DESCRIPTION = 1000

// Minimal view of a zip.js entry and of the foliate-js book object (both untyped modules).
interface ZipEntry {
  filename: string
  uncompressedSize: number
  getData(writer: unknown, ...args: unknown[]): Promise<unknown>
}
interface FoliateMetadata {
  title?: unknown
  author?: unknown
  subject?: unknown
  description?: unknown
  language?: unknown
}
interface ZipReader {
  getEntries(): Promise<ZipEntry[]>
  close?: () => Promise<unknown>
}
interface FoliateBook {
  metadata?: FoliateMetadata
  getCover(): Promise<Blob | null>
}

// foliate-js collapses single-element arrays and returns language maps for localised fields.
// Reduce any of those shapes to one string.
function text(x: unknown): string {
  if (typeof x === 'string') return x
  if (Array.isArray(x)) return text(x[0])
  if (x && typeof x === 'object') {
    const rec = x as Record<string, unknown>
    if ('name' in rec) return text(rec.name)
    const first = Object.values(rec)[0]
    return text(first)
  }
  return ''
}

function list(x: unknown): unknown[] {
  if (x === undefined || x === null) return []
  return Array.isArray(x) ? x : [x]
}

function plainDescription(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const plain = (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
  return plain.slice(0, MAX_DESCRIPTION).trim()
}

/** Reads OPF metadata and cover from an EPUB file. Any zip or parse failure throws EpubError. */
export async function readEpubMeta(file: File): Promise<EpubMeta> {
  let reader: ZipReader | null = null
  try {
    const zip = await import('foliate-js/vendor/zip.js')
    const { EPUB } = await import('foliate-js/epub.js')
    zip.configure({ useWebWorkers: false })

    const zipReader: ZipReader = new zip.ZipReader(new zip.BlobReader(file))
    reader = zipReader
    const entries: ZipEntry[] = await zipReader.getEntries()
    const map = new Map(entries.map((entry) => [entry.filename, entry]))
    const load =
      (f: (entry: ZipEntry, ...args: unknown[]) => unknown) =>
      (name: string, ...args: unknown[]) => {
        const entry = map.get(name)
        return entry ? f(entry, ...args) : null
      }
    const loadText = load((entry) => entry.getData(new zip.TextWriter()))
    const loadBlob = load((entry, type) => entry.getData(new zip.BlobWriter(type as string)))
    const getSize = (name: string): number => map.get(name)?.uncompressedSize ?? 0

    const book = (await new EPUB({ entries, loadText, loadBlob, getSize }).init()) as FoliateBook
    const m = book.metadata ?? {}

    const title = text(m.title).trim() || titleFromName(file.name)
    const author = list(m.author)
      .map(text)
      .filter(Boolean)
      .join(', ')
    const genres = genresFromSubjects(list(m.subject).map(text))
    const description = plainDescription(text(m.description))
    const language = text(list(m.language)[0]).trim() || 'vi'
    const cover = (await book.getCover()) ?? null

    return { title, author, genres, description, language, cover }
  } catch {
    throw new EpubError()
  } finally {
    await reader?.close?.().catch(() => undefined)
  }
}
