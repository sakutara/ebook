import { describe, it, expect, vi } from 'vitest'
import { restorePosition } from '../../src/reader/restore'
import type { ReaderAdapter } from '../../src/reader/adapter'
import { snippetKey, type RestoreStep } from '../../src/progress/anchor'

type GoTarget = string | { index: number; anchor: number }

interface FakeOptions {
  sections?: { href: string }[]
  goToOk?: (t: GoTarget) => boolean
  textAt?: (cfi: string) => string | null
  findInSection?: (index: number, keys: string[], nearFraction: number) => string | null
}

/** Records every call; behaviour is configurable per test. */
function fakeAdapter(opts: FakeOptions = {}) {
  const adapter = {
    open: vi.fn(async (_file: File) => {}),
    sections: vi.fn(() => opts.sections ?? [{ href: 'c0' }, { href: 'c1' }, { href: 'c2' }]),
    toc: vi.fn(() => []),
    goTo: vi.fn(async (t: GoTarget) => (opts.goToOk ? opts.goToOk(t) : true)),
    goToFraction: vi.fn(async (_f: number) => {}),
    textAt: vi.fn(async (cfi: string) => (opts.textAt ? opts.textAt(cfi) : null)),
    findInSection: vi.fn(async (index: number, keys: string[], nearFraction: number) =>
      opts.findInSection ? opts.findInSection(index, keys, nearFraction) : null,
    ),
    next: vi.fn(async () => {}),
    prev: vi.fn(async () => {}),
    setPrefs: vi.fn((_css: string) => {}),
    onRelocate: vi.fn((_cb: unknown) => () => {}),
    destroy: vi.fn(() => {}),
  }
  return adapter as typeof adapter & ReaderAdapter
}

const CFI = 'epubcfi(/6/4!/4/2)'
const SNIPPET = 'Some text here in the chapter'

describe('restore', () => {
  it('progress.resume.after-refresh: text mismatch at cfi falls through to snippet in the href-matched section', async () => {
    const key = snippetKey(SNIPPET)
    const adapter = fakeAdapter({
      sections: [{ href: 'c0' }, { href: 'c1' }, { href: 'chap3' }],
      textAt: () => 'completely different text',
      findInSection: () => 'epubcfi(/6/9!/4)',
      goToOk: (t) => t === 'epubcfi(/6/9!/4)',
    })
    const steps: RestoreStep[] = [
      { kind: 'cfi-if-text', cfi: CFI, key },
      { kind: 'snippet', keys: [key], sectionHref: 'chap3', sectionIndex: 1, sectionFraction: 0.5 },
      { kind: 'section', sectionHref: 'chap3', sectionIndex: 1, sectionFraction: 0.5 },
      { kind: 'fraction', fraction: 0.42 },
    ]

    const result = await restorePosition(adapter, steps)

    expect(result).toBe('snippet')
    expect(adapter.findInSection).toHaveBeenCalledWith(2, [key], 0.5)
    expect(adapter.goTo).not.toHaveBeenCalledWith(CFI)
    expect(adapter.goTo).toHaveBeenCalledWith('epubcfi(/6/9!/4)')
    expect(adapter.goToFraction).not.toHaveBeenCalled()
  })

  it('progress.resume.ambiguous-snippet: the snippet step passes every key, longest first, and the saved fraction', async () => {
    const keys = ['long key of the page', 'long key of the', 'long key']
    const adapter = fakeAdapter({
      sections: [{ href: 'c0' }, { href: 'c1' }, { href: 'chap3' }],
      findInSection: () => 'epubcfi(/6/9!/4)',
      goToOk: (t) => t === 'epubcfi(/6/9!/4)',
    })
    const steps: RestoreStep[] = [
      { kind: 'snippet', keys, sectionHref: 'chap3', sectionIndex: 2, sectionFraction: 0.37 },
      { kind: 'fraction', fraction: 0.42 },
    ]

    const result = await restorePosition(adapter, steps)

    expect(result).toBe('snippet')
    expect(adapter.findInSection).toHaveBeenCalledWith(2, keys, 0.37)
    expect(adapter.goTo).toHaveBeenCalledWith('epubcfi(/6/9!/4)')
  })

  it('progress.resume.snippet-gone: snippet not found goes to the section at its fraction', async () => {
    const key = snippetKey(SNIPPET)
    const adapter = fakeAdapter({
      sections: [{ href: 'c0' }, { href: 'c1' }, { href: 'chap3' }],
      textAt: () => 'other',
      findInSection: () => null,
    })
    const steps: RestoreStep[] = [
      { kind: 'cfi-if-text', cfi: CFI, key },
      { kind: 'snippet', keys: [key], sectionHref: 'chap3', sectionIndex: 2, sectionFraction: 0.5 },
      { kind: 'section', sectionHref: 'chap3', sectionIndex: 2, sectionFraction: 0.5 },
      { kind: 'fraction', fraction: 0.42 },
    ]

    const result = await restorePosition(adapter, steps)

    expect(result).toBe('section')
    expect(adapter.findInSection).toHaveBeenCalledWith(2, [key], 0.5)
    expect(adapter.goTo).toHaveBeenCalledWith({ index: 2, anchor: 0.5 })
    expect(adapter.goToFraction).not.toHaveBeenCalled()
  })

  it('progress.resume.section-gone: unknown href and out-of-range index go to the book fraction', async () => {
    const adapter = fakeAdapter({ sections: [{ href: 'c0' }, { href: 'c1' }, { href: 'c2' }] })
    const steps: RestoreStep[] = [
      { kind: 'section', sectionHref: 'removed.xhtml', sectionIndex: 7, sectionFraction: 0.5 },
      { kind: 'fraction', fraction: 0.42 },
    ]

    const result = await restorePosition(adapter, steps)

    expect(result).toBe('fraction')
    expect(adapter.goTo).not.toHaveBeenCalled()
    expect(adapter.goToFraction).toHaveBeenCalledWith(0.42)
  })

  it('restore: same-version cfi success returns cfi', async () => {
    const adapter = fakeAdapter()
    const steps: RestoreStep[] = [
      { kind: 'cfi', cfi: CFI },
      { kind: 'fraction', fraction: 0.42 },
    ]

    const result = await restorePosition(adapter, steps)

    expect(result).toBe('cfi')
    expect(adapter.goTo).toHaveBeenCalledWith(CFI)
    expect(adapter.goToFraction).not.toHaveBeenCalled()
  })

  it('restore: cfi-if-text with matching text returns cfi-if-text', async () => {
    const key = snippetKey(SNIPPET)
    const adapter = fakeAdapter({ textAt: () => 'Some text, here in the chapter!' })
    const steps: RestoreStep[] = [
      { kind: 'cfi-if-text', cfi: CFI, key },
      { kind: 'fraction', fraction: 0.42 },
    ]

    const result = await restorePosition(adapter, steps)

    expect(result).toBe('cfi-if-text')
    expect(adapter.textAt).toHaveBeenCalledWith(CFI)
    expect(adapter.goTo).toHaveBeenCalledWith(CFI)
    expect(adapter.goToFraction).not.toHaveBeenCalled()
  })

  it('restore: empty plan calls next and returns start', async () => {
    const adapter = fakeAdapter()

    const result = await restorePosition(adapter, [])

    expect(result).toBe('start')
    expect(adapter.next).toHaveBeenCalledTimes(1)
    expect(adapter.goTo).not.toHaveBeenCalled()
    expect(adapter.goToFraction).not.toHaveBeenCalled()
  })

  it('restore: a throwing step is skipped', async () => {
    const adapter = fakeAdapter()
    adapter.goTo.mockRejectedValueOnce(new Error('boom'))
    const steps: RestoreStep[] = [
      { kind: 'cfi', cfi: CFI },
      { kind: 'fraction', fraction: 0.42 },
    ]

    const result = await restorePosition(adapter, steps)

    expect(result).toBe('fraction')
    expect(adapter.goToFraction).toHaveBeenCalledWith(0.42)
    expect(adapter.next).not.toHaveBeenCalled()
  })

  it('restore: cfi-if-text with an empty key is treated as a failure', async () => {
    const adapter = fakeAdapter({ textAt: () => 'anything' })
    const steps: RestoreStep[] = [
      { kind: 'cfi-if-text', cfi: CFI, key: '' },
      { kind: 'fraction', fraction: 0.42 },
    ]

    const result = await restorePosition(adapter, steps)

    expect(result).toBe('fraction')
    expect(adapter.goTo).not.toHaveBeenCalled()
  })

  it('restore: all steps failing calls next and returns start', async () => {
    const adapter = fakeAdapter({ goToOk: () => false })
    const steps: RestoreStep[] = [{ kind: 'cfi', cfi: CFI }]

    const result = await restorePosition(adapter, steps)

    expect(result).toBe('start')
    expect(adapter.next).toHaveBeenCalledTimes(1)
  })
})
