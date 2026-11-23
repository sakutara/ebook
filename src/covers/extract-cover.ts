import { DriveRangeReader } from '../drive/range-reader'

// Minimal view of a zip.js entry; foliate-js ships untyped modules.
interface ZipEntry {
  filename: string
  uncompressedSize: number
  getData(writer: unknown, ...args: unknown[]): Promise<unknown>
}

// Extracts the EPUB cover image as a Blob, or null when the book declares none.
// Accepts a local Blob or a DriveRangeReader so only the zip directory and the
// cover entry need to be fetched from Drive.
export async function extractCover(input: Blob | DriveRangeReader): Promise<Blob | null> {
  const zip = await import('foliate-js/vendor/zip.js')
  const { EPUB } = await import('foliate-js/epub.js')
  zip.configure({ useWebWorkers: false })

  const reader = new zip.ZipReader(input instanceof Blob ? new zip.BlobReader(input) : input)
  const entries: ZipEntry[] = await reader.getEntries()
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

  const book = await new EPUB({ entries, loadText, loadBlob, getSize }).init()
  const cover: Blob | null = await book.getCover()
  await reader.close?.()
  return cover ?? null
}
