import { newId, now, type AppDB, type StoryRequest } from '../db/db'
import { normalizeRequestText, requestKey } from '../domain/request-text'
import { normalize } from '../domain/title'
import { enqueue } from '../sync/outbox'

export type SubmitResult =
  | { kind: 'saved'; request: StoryRequest }
  | { kind: 'empty' }
  | { kind: 'duplicate'; existing: StoryRequest }
  | { kind: 'in-library'; bookTitle: string }

export interface RequestInput {
  title: string
  author: string
  originalTitle?: string
  language?: string
}

export type CheckResult =
  | Exclude<SubmitResult, { kind: 'saved' }>
  | { kind: 'ok'; title: string; author: string }

/**
 * Read-only validation: normalise, then refuse empty, in-library and already-requested titles.
 * Writes nothing. submitRequest uses it before its transaction.
 */
export async function checkRequest(
  db: AppDB,
  input: RequestInput,
): Promise<CheckResult> {
  const title = normalizeRequestText(input.title)
  if (normalize(title) === '') return { kind: 'empty' }
  const author = normalizeRequestText(input.author)

  const book = await db.books.where('normTitle').equals(normalize(title)).first()
  if (book) return { kind: 'in-library', bookTitle: book.title }

  const existing = await db.storyRequests.where('key').equals(requestKey(title, author)).first()
  if (existing) return { kind: 'duplicate', existing }
  return { kind: 'ok', title, author }
}

/**
 * Validate, de-duplicate and store a story request. The row and its storyRequest.submit op are
 * written in one transaction; a duplicate or empty title writes nothing.
 */
export async function submitRequest(
  db: AppDB,
  input: RequestInput,
): Promise<SubmitResult> {
  const checked = await checkRequest(db, input)
  if (checked.kind !== 'ok') return checked
  const { title, author } = checked
  const originalTitle = normalizeRequestText(input.originalTitle ?? '')
  // Picked from a fixed list (REQUEST_LANGUAGE_OPTIONS), so stored as-is, not title-cased.
  const language = (input.language ?? '').trim()
  const key = requestKey(title, author)
  return db.transaction('rw', db.storyRequests, db.outbox, async (): Promise<SubmitResult> => {
    // Re-check inside the transaction so two concurrent submits cannot both save.
    const existing = await db.storyRequests.where('key').equals(key).first()
    if (existing) return { kind: 'duplicate', existing }
    const at = now()
    const request: StoryRequest = {
      id: newId(),
      key,
      title,
      author,
      originalTitle,
      language,
      createdAt: at,
      sentAt: null,
      updatedAt: at,
      deleted: 0,
    }
    await db.storyRequests.add(request)
    await enqueue(db, {
      type: 'storyRequest.submit',
      entity: 'storyRequests',
      entityId: request.id,
      payload: { title, author, originalTitle, language, key },
    })
    return { kind: 'saved', request }
  })
}

/** One request row by id, or undefined. */
export function getRequest(db: AppDB, id: string): Promise<StoryRequest | undefined> {
  return db.storyRequests.get(id)
}

/** This device's requests, newest first. */
export function listRequests(db: AppDB): Promise<StoryRequest[]> {
  return db.storyRequests.orderBy('createdAt').reverse().toArray()
}

/** Record that the form accepted the request. Local feedback only: no outbox op is queued. */
export async function markSent(db: AppDB, id: string, at = now()): Promise<void> {
  await db.storyRequests.update(id, { sentAt: at, updatedAt: at })
}

/**
 * Remove a sent request from this device only. No outbox op is queued: the Google Form keeps
 * its response, so deleting here does not undo the request. Pending requests are refused.
 */
export async function deleteSentRequest(db: AppDB, id: string): Promise<boolean> {
  return db.transaction('rw', db.storyRequests, async () => {
    const row = await db.storyRequests.get(id)
    if (!row || row.sentAt === null) return false
    await db.storyRequests.delete(id)
    return true
  })
}

/**
 * Ids of requests whose storyRequest.submit op is still queued after a failed POST (the sync
 * engine sets lastError and keeps the op). Empty when every request is sent or never attempted.
 */
export async function listFailedRequestIds(db: AppDB): Promise<string[]> {
  const ops = await db.outbox
    .filter((op) => op.type === 'storyRequest.submit' && op.lastError !== undefined)
    .toArray()
  return ops.map((op) => op.entityId)
}
