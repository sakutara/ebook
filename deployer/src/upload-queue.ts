import type { AdminClient } from './admin-client'
import { mergeEntry, updateCatalog } from './catalog-merge'
import { canUpload, toMetadata, type Draft } from './draft'

export interface QueueDeps {
  client: AdminClient
  now?: () => Date
  /** Checked before each book; true leaves the remaining books untouched. */
  shouldStop?: () => boolean
  onDraft: (key: string, patch: Partial<Draft>) => void
  /** Default: navigator.onLine. */
  online?: () => boolean
}

export interface QueueResult {
  done: number
  failed: number
  stopped: boolean
}

const OFFLINE_MESSAGE = 'Cần kết nối mạng để tải lên'

/** The three object keys of a book, in upload order. */
export function bookKeys(slug: string): { epub: string; cover: string; metadata: string } {
  const dir = `books/${slug}`
  return { epub: `${dir}/${slug}.epub`, cover: `${dir}/cover.jpg`, metadata: `${dir}/metadata.json` }
}

function defaultOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : 'Lỗi không xác định'
}

async function uploadBook(draft: Draft, deps: QueueDeps, now: () => Date): Promise<void> {
  const { client } = deps
  const keys = bookKeys(draft.slug)
  // One metadata value for both metadata.json and the catalog entry, so their updatedAt match.
  const meta = toMetadata(draft, now())
  const metaBody = JSON.stringify(meta)
  const metaSize = new Blob([metaBody]).size
  const total = draft.file.size + draft.cover.size + metaSize

  let sentBefore = 0
  const report = (sent: number) =>
    deps.onDraft(draft.key, { progress: Math.floor(((sentBefore + sent) / total) * 100) })

  const send = async (key: string, body: Blob | string, size: number, contentType: string) => {
    await client.put(key, body, { contentType, onProgress: (sent) => report(sent) })
    sentBefore += size
  }

  await send(keys.epub, draft.file, draft.file.size, 'application/epub+zip')
  await send(keys.cover, draft.cover, draft.cover.size, 'image/jpeg')
  await send(keys.metadata, metaBody, metaSize, 'application/json; charset=utf-8')
  await updateCatalog(client, (c) => mergeEntry(c, meta, now()), now)
}

/**
 * Uploads the ticked, valid drafts one book at a time, in order. Each book goes epub → cover →
 * metadata, then catalog.json. A failing book is marked as an error and the queue continues.
 */
export async function runUpload(drafts: Draft[], deps: QueueDeps): Promise<QueueResult> {
  const online = deps.online ?? defaultOnline
  if (!online()) throw new Error(OFFLINE_MESSAGE)

  const now = deps.now ?? (() => new Date())
  const result: QueueResult = { done: 0, failed: 0, stopped: false }

  for (const draft of drafts.filter(canUpload)) {
    if (deps.shouldStop?.()) {
      result.stopped = true
      break
    }
    deps.onDraft(draft.key, { state: 'uploading', progress: 0, error: undefined })
    try {
      await uploadBook(draft, deps, now)
      deps.onDraft(draft.key, { state: 'done', progress: 100, status: 'update' })
      result.done++
    } catch (e) {
      deps.onDraft(draft.key, { state: 'error', error: messageOf(e), progress: undefined })
      result.failed++
    }
  }
  return result
}
