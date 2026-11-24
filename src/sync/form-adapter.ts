import type { RequestFormConfig } from '../config'
import type { AppDB } from '../db/db'
import { markSent } from '../requests/request-repo'
import type { PushResult, SyncAdapter } from './adapters'
import type { OutboxOp } from './outbox'

interface StoryRequestPayload {
  title: string
  author: string
  originalTitle?: string
  language?: string
  key: string
}

/**
 * Posts `storyRequest.submit` ops to a Google Form. Ops are sent one at a time; the first
 * rejected fetch stops the batch and the remaining ops are left queued (neither ok nor failed).
 */
export function createFormAdapter(
  db: AppDB,
  cfg: RequestFormConfig | null,
  fetchFn: typeof fetch = fetch,
): SyncAdapter {
  return {
    name: 'google-form',
    async push(ops: OutboxOp[]): Promise<PushResult> {
      if (cfg === null) {
        return { ok: [], failed: ops.map((op) => ({ id: op.id, error: 'form-not-configured' })) }
      }
      const ok: string[] = []
      for (const op of ops) {
        const payload = op.payload as StoryRequestPayload
        const fields: Record<string, string> = { [`entry.${cfg.entryTitle}`]: payload.title }
        if (cfg.entryAuthor) fields[`entry.${cfg.entryAuthor}`] = payload.author
        if (cfg.entryKey) fields[`entry.${cfg.entryKey}`] = payload.key
        if (cfg.entryOriginalTitle && payload.originalTitle) {
          fields[`entry.${cfg.entryOriginalTitle}`] = payload.originalTitle
        }
        if (cfg.entryLanguage && payload.language) fields[`entry.${cfg.entryLanguage}`] = payload.language
        try {
          await fetchFn(`https://docs.google.com/forms/d/e/${cfg.formId}/formResponse`, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(fields).toString(),
          })
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          return { ok, failed: [{ id: op.id, error }] }
        }
        await markSent(db, op.entityId)
        ok.push(op.id)
      }
      return { ok, failed: [] }
    },
  }
}

/** Splits ops by `type` and delegates each group to its adapter, preserving order within a group. */
export function createRoutingAdapter(
  routes: Record<string, SyncAdapter>,
  fallback: SyncAdapter,
): SyncAdapter {
  return {
    name: 'routing',
    async push(ops: OutboxOp[]): Promise<PushResult> {
      const groups = new Map<SyncAdapter, OutboxOp[]>()
      for (const op of ops) {
        const target = Object.prototype.hasOwnProperty.call(routes, op.type) ? routes[op.type] : fallback
        const group = groups.get(target)
        if (group) group.push(op)
        else groups.set(target, [op])
      }
      const result: PushResult = { ok: [], failed: [] }
      for (const [adapter, batch] of groups) {
        const r = await adapter.push(batch)
        result.ok.push(...r.ok)
        result.failed.push(...r.failed)
      }
      return result
    },
  }
}
