import { signal } from '@preact/signals'
import { titleFromName } from '../../src/domain/title'
import { AdminError, createAdminClient, type AdminClient } from './admin-client'
import { mergeEntry, removeEntry, updateCatalog } from './catalog-merge'
import { applyTitleEdit, canUpload, computeStatus, conflictTitle, reviewDraft, suggestSlug, type Draft } from './draft'
import { EpubError, readEpubChapters, readEpubMeta, type EpubMeta } from './epub-meta'
import { makeCover as defaultMakeCover } from './cover-jpeg'
import { md5Hex } from './md5'
import { bookKeys, runUpload } from './upload-queue'
import type { Metadata } from './types'

const TOKEN_KEY = 'deployer.token'
const PARSE_CONCURRENCY = 2
/** Quiet time after the last title or author edit before a generated cover is redrawn. */
const REDRAW_DELAY_MS = 300

export interface ConnState {
  baseUrl: string
  token: string
  remember: boolean
  state: 'idle' | 'checking' | 'ok' | 'error'
  error?: string
}

export interface UploadState {
  running: boolean
  stopRequested: boolean
  done: number
  total: number
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface StoreDeps {
  createClient?: (baseUrl: string, token: string) => AdminClient
  readMeta?: (file: File) => Promise<EpubMeta>
  /** Chapter count of a downloaded EPUB, for the backfill. */
  countChapters?: (epub: Blob) => Promise<number>
  md5?: (blob: Blob) => Promise<string>
  makeCover?: (cover: Blob | null, title: string, author: string) => Promise<{ blob: Blob; generated: boolean }>
  storage?: KeyValueStorage
  env?: { VITE_R2_BASE_URL?: string; R2_SECRET?: string }
  /** Public GET for metadata.json during rebuild. */
  fetch?: typeof fetch
  /** Window for the 'online' event that clears uploadError. Default: the global window. */
  win?: Pick<Window, 'addEventListener'>
}

function defaultStorage(): KeyValueStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function messageOf(e: unknown): string {
  if (e instanceof AdminError) return e.message
  if (e instanceof EpubError) return e.message
  return e instanceof Error ? e.message : 'Lỗi không xác định'
}

function isEpub(file: File): boolean {
  return /\.epub$/i.test(file.name)
}

function newDraft(file: File): Draft {
  return {
    key: globalThis.crypto.randomUUID(),
    file,
    state: 'parsing',
    title: titleFromName(file.name),
    author: '',
    genres: [],
    description: '',
    chapters: 0,
    note: '',
    language: 'vi',
    slug: '',
    slugEdited: false,
    size: file.size,
    md5: '',
    cover: new Blob(),
    coverGenerated: false,
    status: 'new',
    selected: false,
  }
}

/** Runs `work` over `items` with at most `limit` in flight. */
async function runPool<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  const iter = items[Symbol.iterator]()
  const worker = async () => {
    for (let next = iter.next(); !next.done; next = iter.next()) await work(next.value)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

/**
 * Deployer state (module signals) and actions. Pass deps to swap the Worker, EPUB parsing and
 * storage in tests; the app uses the `store` singleton below.
 */
export function createStore(deps: StoreDeps = {}) {
  const createClient = deps.createClient ?? ((baseUrl, token) => createAdminClient(baseUrl, token))
  const readMeta = deps.readMeta ?? readEpubMeta
  const countEpub = deps.countChapters ?? readEpubChapters
  const md5 = deps.md5 ?? ((blob: Blob) => md5Hex(blob))
  const makeCover = deps.makeCover ?? ((cover, title, author) => defaultMakeCover(cover, title, author))
  const storage = deps.storage ?? defaultStorage()
  const env: { VITE_R2_BASE_URL?: string; R2_SECRET?: string } = deps.env ?? import.meta.env
  const fetchFn: typeof fetch = deps.fetch ?? ((input, init) => fetch(input, init))

  const savedToken = storage?.getItem(TOKEN_KEY) ?? null
  // The admin code comes from R2_SECRET when it is set, so the owner never types it;
  // a remembered token is only the fallback. Env-supplied codes are not written to storage
  // unless "Nhớ trên máy này" is ticked, the same as a typed one.
  const envToken = env.R2_SECRET?.trim() ?? ''
  const conn = signal<ConnState>({
    baseUrl: env.VITE_R2_BASE_URL ?? '',
    token: envToken || (savedToken ?? ''),
    remember: savedToken !== null,
    state: 'idle',
  })
  const catalog = signal<Metadata[]>([])
  const drafts = signal<Draft[]>([])
  const notice = signal<string | null>(null)
  /** Why the last upload could not start (offline). Shown in the upload bar, not with the pick notice. */
  const uploadError = signal<string | null>(null)
  const uploading = signal<UploadState>({ running: false, stopRequested: false, done: 0, total: 0 })

  const win = deps.win ?? (typeof window === 'undefined' ? undefined : window)
  win?.addEventListener('online', () => {
    uploadError.value = null
  })

  /** Set by a successful connect(); null means upload and delete are disabled. */
  let client: AdminClient | null = null

  /** Pending cover redraw per draft key; a newer edit replaces it. */
  const redrawTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** Bumped by every edit and removal; a redraw result lands only if its generation is still current. */
  const generations = new Map<string, number>()

  function nextGeneration(key: string): number {
    const gen = (generations.get(key) ?? 0) + 1
    generations.set(key, gen)
    return gen
  }

  function scheduleRedraw(key: string): void {
    const gen = nextGeneration(key)
    clearTimeout(redrawTimers.get(key))
    redrawTimers.set(
      key,
      setTimeout(() => {
        redrawTimers.delete(key)
        void redrawCover(key, gen)
      }, REDRAW_DELAY_MS),
    )
  }

  function cancelRedraw(key: string): void {
    clearTimeout(redrawTimers.get(key))
    redrawTimers.delete(key)
    nextGeneration(key)
  }

  /** Redraws a generated cover with the draft's current title and author; the old cover stays on failure. */
  async function redrawCover(key: string, gen: number): Promise<void> {
    const d = drafts.value.find((x) => x.key === key)
    if (d === undefined || !d.coverGenerated) return
    try {
      const { blob } = await makeCover(null, d.title, d.author)
      if (generations.get(key) !== gen) return
      patchDraft(key, { cover: blob })
    } catch {
      // Keep the previous cover: the upload still works, only its title text is stale.
    }
  }

  function requireClient(): AdminClient {
    if (client === null) throw new Error('Chưa kết nối Worker')
    return client
  }

  function setConn(patch: Partial<ConnState>): void {
    conn.value = { ...conn.value, ...patch }
  }

  function patchDraft(key: string, patch: Partial<Draft>): void {
    drafts.value = drafts.value.map((d) => (d.key === key ? { ...d, ...patch } : d))
  }

  async function refreshCatalog(): Promise<void> {
    if (client === null) return
    const res = await client.getCatalog()
    catalog.value = res.catalog.books
  }

  async function connect(): Promise<void> {
    const { baseUrl, token, remember } = conn.value
    if (!remember) storage?.removeItem(TOKEN_KEY)
    setConn({ state: 'checking', error: undefined })
    const next = createClient(baseUrl, token)
    try {
      await next.check()
      const res = await next.getCatalog()
      client = next
      catalog.value = res.catalog.books
      if (remember) storage?.setItem(TOKEN_KEY, token)
      setConn({ state: 'ok' })
    } catch (e) {
      client = null
      setConn({ state: 'error', error: messageOf(e) })
    }
  }

  async function parseDraft(key: string, file: File): Promise<void> {
    try {
      const hash = await md5(file)
      const meta = await readMeta(file)
      if (!(meta.chapters > 0)) throw new Error('Không đếm được số chương trong EPUB')
      const { blob, generated } = await makeCover(meta.cover, meta.title, meta.author)
      // Synchronous from here to the write, so two drafts parsed together cannot pick one slug.
      const current = drafts.value.find((d) => d.key === key)
      if (current === undefined) return
      const slug = suggestSlug(
        meta.title,
        catalog.value,
        drafts.value.map((d) => ({ key: d.key, slug: d.slug })),
        key,
      )
      const parsed: Draft = {
        ...current,
        state: 'ready',
        title: meta.title,
        author: meta.author,
        genres: meta.genres,
        description: meta.description,
        chapters: meta.chapters,
        language: meta.language,
        slug,
        slugEdited: false,
        md5: hash,
        cover: blob,
        coverGenerated: generated,
      }
      patchDraft(key, reviewDraft(parsed, catalog.value))
    } catch (e) {
      patchDraft(key, { state: 'error', error: messageOf(e) })
    }
  }

  async function addFiles(files: ArrayLike<File>): Promise<void> {
    const all = Array.from(files)
    const epubs = all.filter(isEpub)
    const skipped = all.length - epubs.length
    notice.value = skipped > 0 ? `Bỏ qua ${skipped} tệp không phải EPUB` : null
    const fresh = epubs.map(newDraft)
    drafts.value = [...drafts.value, ...fresh]
    await runPool(fresh, PARSE_CONCURRENCY, (d) => parseDraft(d.key, d.file))
  }

  function updateDraft(key: string, patch: Partial<Draft>): void {
    const current = drafts.value.find((d) => d.key === key)
    if (current === undefined) return
    const { title, slug, ...rest } = patch
    let next: Draft = { ...current, ...rest }
    if (title !== undefined && title !== current.title) {
      next = applyTitleEdit(next, title, catalog.value, drafts.value)
    }
    if (slug !== undefined) {
      const edited = { ...next, slug, slugEdited: true }
      next = { ...edited, status: computeStatus(edited, catalog.value) }
    }
    if (title !== undefined || slug !== undefined) {
      let selected = next.selected
      // A status change re-decides the default, as reviewDraft does: "Đã có" is unticked, and a
      // draft leaving "Đã có" is ticked again when ready. Edits that keep the status keep the choice.
      if (next.status !== current.status) {
        if (next.status === 'exists') selected = false
        else if (current.status === 'exists') selected = next.state === 'ready'
      }
      // A title or slug edit that now points at another book unticks the draft again.
      if (conflictTitle(next, catalog.value) !== null) selected = false
      next = { ...next, selected }
    }
    patchDraft(key, next)
    if (next.coverGenerated && (next.title !== current.title || next.author !== current.author)) {
      scheduleRedraw(key)
    }
  }

  function removeDraft(key: string): void {
    cancelRedraw(key)
    drafts.value = drafts.value.filter((d) => d.key !== key)
  }

  async function runDrafts(list: Draft[]): Promise<void> {
    if (client === null || uploading.value.running || list.length === 0) return
    const c = client
    uploading.value = { running: true, stopRequested: false, done: 0, total: list.length }
    notice.value = null
    uploadError.value = null
    let ok = true
    try {
      await runUpload(list, {
        client: c,
        shouldStop: () => uploading.value.stopRequested,
        onDraft: (key, patch) => {
          patchDraft(key, patch)
          if (patch.state === 'done') uploading.value = { ...uploading.value, done: uploading.value.done + 1 }
        },
      })
    } catch (e) {
      // runUpload throws only when offline; that message goes to the upload bar.
      ok = false
      uploadError.value = messageOf(e)
    } finally {
      uploading.value = { ...uploading.value, running: false, stopRequested: false }
    }
    if (ok) await refreshCatalog()
  }

  async function startUpload(): Promise<void> {
    await runDrafts(drafts.value.filter(canUpload))
  }

  function stopUpload(): void {
    uploading.value = { ...uploading.value, stopRequested: true }
  }

  async function retry(key: string): Promise<void> {
    const d = drafts.value.find((x) => x.key === key)
    if (d === undefined) return
    const ready: Draft = { ...d, state: 'ready', selected: true, error: undefined }
    patchDraft(key, { state: 'ready', selected: true, error: undefined })
    await runDrafts([ready])
  }

  async function deleteBook(id: string): Promise<void> {
    const c = requireClient()
    const keys = bookKeys(id)
    // Every object under books/<id>/, plus the three known keys in case the listing misses one.
    const found = new Set<string>([keys.epub, keys.cover, keys.metadata])
    const prefix = `books/${id}/`
    let cursor: string | undefined
    do {
      const page = await c.list(prefix, cursor)
      for (const o of page.objects) if (o.key.startsWith(prefix)) found.add(o.key)
      cursor = page.cursor || undefined
    } while (cursor !== undefined)
    for (const key of found) await c.del(key)
    await updateCatalog(c, (cat) => removeEntry(cat, id, new Date()))
    await refreshCatalog()
  }

  /** Rewrites metadata.json and the catalog entry of a published book; EPUB and cover are untouched. */
  async function updateBook(
    id: string,
    patch: Pick<Metadata, 'title' | 'author' | 'genres' | 'description'> & { note: string },
  ): Promise<void> {
    const c = requireClient()
    const current = catalog.value.find((b) => b.id === id)
    if (current === undefined) throw new Error('Không tìm thấy truyện trong catalog')
    const title = patch.title.trim()
    if (title === '') throw new Error('Tên truyện không được để trống')
    const { note: _oldNote, ...rest } = current
    const note = patch.note.trim()
    const next: Metadata = {
      ...rest,
      title,
      author: patch.author.trim(),
      genres: [...patch.genres],
      description: patch.description,
      ...(note !== '' ? { note } : {}),
      // updatedAt stays the EPUB's upload time: the viewer sorts by it, and a metadata edit must not reorder.
    }
    await c.put(bookKeys(id).metadata, JSON.stringify(next), { contentType: 'application/json; charset=utf-8' })
    await updateCatalog(c, (cat) => mergeEntry(cat, next, new Date()))
    await refreshCatalog()
  }

  /**
   * Downloads the EPUB of every published book without a chapter count, counts its chapters and
   * rewrites its metadata.json. The catalog is updated once at the end. Returns the number updated.
   */
  async function backfillChapters(onProgress?: (done: number, total: number) => void): Promise<number> {
    const c = requireClient()
    const base = conn.value.baseUrl.replace(/\/+$/, '')
    const todo = catalog.value.filter((b) => typeof b.chapters !== 'number' || b.chapters <= 0)
    const updated: Metadata[] = []
    for (const [i, book] of todo.entries()) {
      const epubUrl = `${base}/${bookKeys(book.id).epub.split('/').map(encodeURIComponent).join('/')}`
      const res = await fetchFn(epubUrl, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Không tải được ${book.id} (${res.status})`)
      const chapters = await countEpub(await res.blob())
      if (chapters > 0) {
        const next: Metadata = { ...book, chapters }
        await c.put(bookKeys(book.id).metadata, JSON.stringify(next), { contentType: 'application/json; charset=utf-8' })
        updated.push(next)
      }
      onProgress?.(i + 1, todo.length)
    }
    if (updated.length > 0) {
      await updateCatalog(c, (cat) => updated.reduce((acc, m) => mergeEntry(acc, m, new Date()), cat))
      await refreshCatalog()
    }
    return updated.length
  }

  async function rebuildCatalog(onProgress?: (done: number, total: number) => void): Promise<void> {
    const c = requireClient()
    const metaKeys: string[] = []
    let cursor: string | undefined
    do {
      const page = await c.list('books/', cursor)
      for (const o of page.objects) if (o.key.endsWith('/metadata.json')) metaKeys.push(o.key)
      cursor = page.cursor || undefined
    } while (cursor !== undefined)

    const base = conn.value.baseUrl.replace(/\/+$/, '')
    const books: Metadata[] = []
    for (const [i, key] of metaKeys.entries()) {
      const res = await fetchFn(`${base}/${key.split('/').map(encodeURIComponent).join('/')}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Không đọc được ${key} (${res.status})`)
      books.push((await res.json()) as Metadata)
      onProgress?.(i + 1, metaKeys.length)
    }
    books.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    await updateCatalog(c, (cat) => ({ ...cat, books }), () => new Date())
    await refreshCatalog()
  }

  return {
    conn,
    catalog,
    drafts,
    notice,
    uploadError,
    uploading,
    connect,
    addFiles,
    updateDraft,
    removeDraft,
    startUpload,
    stopUpload,
    retry,
    deleteBook,
    updateBook,
    rebuildCatalog,
    backfillChapters,
  }
}

/** App singleton. */
export const store = createStore()
