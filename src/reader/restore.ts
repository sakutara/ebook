import { snippetKey, type RestoreStep } from '../progress/anchor'
import type { ReaderAdapter } from './adapter'

export type RestoreResult = RestoreStep['kind'] | 'start'

/** Resolve a section by href first, then by saved index when it is in range. -1 when neither matches. */
function resolveSection(
  adapter: ReaderAdapter,
  sectionHref: string,
  sectionIndex: number,
): number {
  const sections = adapter.sections()
  const byHref = sections.findIndex((s) => s.href === sectionHref)
  if (byHref !== -1) return byHref
  if (sectionIndex >= 0 && sectionIndex < sections.length) return sectionIndex
  return -1
}

/** Try one restore step. Resolves true when the reader landed on the saved position. */
async function attempt(adapter: ReaderAdapter, step: RestoreStep): Promise<boolean> {
  switch (step.kind) {
    case 'cfi':
      return adapter.goTo(step.cfi)
    case 'cfi-if-text': {
      if (step.key === '') return false
      const text = await adapter.textAt(step.cfi)
      if (text === null || !snippetKey(text).startsWith(step.key)) return false
      return adapter.goTo(step.cfi)
    }
    case 'snippet': {
      const i = resolveSection(adapter, step.sectionHref, step.sectionIndex)
      if (i === -1) return false
      const cfi = await adapter.findInSection(i, step.keys, step.sectionFraction)
      if (!cfi) return false
      return adapter.goTo(cfi)
    }
    case 'section': {
      const i = resolveSection(adapter, step.sectionHref, step.sectionIndex)
      if (i === -1) return false
      return adapter.goTo({ index: i, anchor: step.sectionFraction })
    }
    case 'fraction':
      await adapter.goToFraction(step.fraction)
      return true
  }
}

/**
 * Try each restore step in order and report which one succeeded.
 * Steps that throw or fail are skipped. When nothing lands, the reader
 * advances to the next page and reports 'start'.
 */
export async function restorePosition(
  adapter: ReaderAdapter,
  steps: RestoreStep[],
): Promise<RestoreResult> {
  for (const step of steps) {
    try {
      if (await attempt(adapter, step)) return step.kind
    } catch {
      // A throwing step counts as failed; try the next one.
    }
  }
  await adapter.next()
  return 'start'
}
