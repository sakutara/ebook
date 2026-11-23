import type { DriveApi } from './drive-api'

// Chunk size for entry streaming; each request is clamped to the entry size, so
// no bytes beyond the entry are ever fetched.
const CHUNK_SIZE = 64 * 1024

// Duck-typed random-access reader for zip.js, backed by Drive Range requests.
// zip.js reads entry data through `readable` (a ReadableStream that pulls via
// readUint8Array), so that getter mirrors zip.js's internal base Reader class.
export class DriveRangeReader {
  size: number
  bytesRequested = 0
  private readonly api: Pick<DriveApi, 'fetchRange'>
  private readonly id: string

  constructor(api: Pick<DriveApi, 'fetchRange'>, id: string, size: number) {
    this.api = api
    this.id = id
    this.size = size
  }

  async init(): Promise<void> {}

  async readUint8Array(offset: number, length: number): Promise<Uint8Array> {
    this.bytesRequested += length
    return this.api.fetchRange(this.id, offset, offset + length - 1)
  }

  get readable(): ReadableStream<Uint8Array> {
    const reader = this
    // zip.js assigns offset/size onto the returned stream before reading it.
    const stream: ReadableStream<Uint8Array> & { offset?: number; size?: number } =
      new ReadableStream<Uint8Array>({
        start() {
          ;(this as { chunkOffset: number }).chunkOffset = 0
        },
        async pull(controller) {
          const source = this as { chunkOffset: number }
          const offset = stream.offset ?? 0
          const size = stream.size ?? reader.size
          const start = source.chunkOffset
          const length = Math.min(CHUNK_SIZE, size - start)
          const data = await reader.readUint8Array(offset + start, length)
          controller.enqueue(data)
          if (start + CHUNK_SIZE >= size) controller.close()
          else source.chunkOffset = start + CHUNK_SIZE
        },
      })
    return stream
  }
}
