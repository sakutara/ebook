import type { Bucket, BucketObject, BucketObjectBody, EdgeCache } from '../../worker/src/handler'

interface Stored {
  bytes: Uint8Array
  etag: string
  uploaded: Date
  contentType?: string
}

function unquote(etag: string): string {
  return etag.replace(/^"|"$/g, '')
}

/** In-memory stand-in for the R2 binding. Etags are `e1`, `e2`, … in write order. */
export class FakeBucket implements Bucket {
  /** Every bucket call, e.g. `get books/a/a.epub`. Used to assert the bucket was not read. */
  readonly calls: string[] = []
  private readonly items = new Map<string, Stored>()
  private counter = 0

  private describe(key: string, s: Stored): BucketObject {
    return {
      key,
      size: s.bytes.byteLength,
      etag: s.etag,
      httpEtag: `"${s.etag}"`,
      uploaded: s.uploaded,
      httpMetadata: s.contentType ? { contentType: s.contentType } : undefined,
    }
  }

  async get(
    key: string,
    opts?: { range?: { offset: number; length?: number }; onlyIf?: { etagDoesNotMatch?: string } },
  ): Promise<BucketObjectBody | BucketObject | null> {
    this.calls.push(`get ${key}`)
    const s = this.items.get(key)
    if (!s) return null
    const meta = this.describe(key, s)
    if (opts?.onlyIf?.etagDoesNotMatch !== undefined && unquote(opts.onlyIf.etagDoesNotMatch) === s.etag) {
      return meta
    }
    const offset = opts?.range?.offset ?? 0
    const end = opts?.range?.length === undefined ? s.bytes.byteLength : offset + opts.range.length
    const bytes = s.bytes.slice(offset, end)
    return {
      ...meta,
      size: bytes.byteLength,
      range: opts?.range ? { offset, length: bytes.byteLength } : undefined,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes)
          controller.close()
        },
      }),
      text: async () => new TextDecoder().decode(bytes),
    }
  }

  async head(key: string): Promise<BucketObject | null> {
    this.calls.push(`head ${key}`)
    const s = this.items.get(key)
    return s ? this.describe(key, s) : null
  }

  async put(
    key: string,
    body: ReadableStream | ArrayBuffer | ArrayBufferView | string,
    opts?: { httpMetadata?: { contentType?: string }; onlyIf?: { etagMatches?: string } },
  ): Promise<BucketObject | null> {
    this.calls.push(`put ${key}`)
    const existing = this.items.get(key)
    if (opts?.onlyIf?.etagMatches !== undefined) {
      if (!existing || unquote(opts.onlyIf.etagMatches) !== existing.etag) return null
    }
    const bytes = new Uint8Array(await new Response(body as BodyInit).arrayBuffer())
    this.counter += 1
    const stored: Stored = {
      bytes,
      etag: `e${this.counter}`,
      uploaded: new Date(),
      contentType: opts?.httpMetadata?.contentType,
    }
    this.items.set(key, stored)
    return this.describe(key, stored)
  }

  async delete(key: string): Promise<void> {
    this.calls.push(`delete ${key}`)
    this.items.delete(key)
  }

  async list(opts: { prefix?: string; cursor?: string; limit?: number }) {
    this.calls.push(`list ${opts.prefix ?? ''}`)
    const prefix = opts.prefix ?? ''
    const limit = opts.limit ?? 1000
    const start = opts.cursor ? Number(opts.cursor) : 0
    const keys = [...this.items.keys()].filter((k) => k.startsWith(prefix)).sort()
    const page = keys.slice(start, start + limit)
    const truncated = start + limit < keys.length
    return {
      objects: page.map((k) => this.describe(k, this.items.get(k)!)),
      truncated,
      cursor: truncated ? String(start + limit) : undefined,
    }
  }

  /** Test-only peek at the stored bytes, without recording a call. */
  peek(key: string): Uint8Array | undefined {
    return this.items.get(key)?.bytes
  }
}

/** Edge cache keyed by full request URL. Stores the responses it is given. */
export class FakeCache implements EdgeCache {
  readonly store = new Map<string, Response>()

  async match(req: Request): Promise<Response | undefined> {
    return this.store.get(req.url)?.clone()
  }

  async put(req: Request, res: Response): Promise<void> {
    this.store.set(req.url, res)
  }
}

/** Collects waitUntil promises so a test can await them before asserting. */
export function makeCtx() {
  const pending: Promise<unknown>[] = []
  return {
    ctx: {
      waitUntil(p: Promise<unknown>) {
        pending.push(p)
      },
    },
    flush: () => Promise.all(pending),
  }
}
