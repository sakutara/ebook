import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'

export function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

// Controllable IntersectionObserver mock. Tests call triggerIntersect(el) to simulate
// an element entering the viewport.
type IOEntry = { cb: IntersectionObserverCallback; els: Set<Element>; options?: IntersectionObserverInit; obs: IntersectionObserver }
export const ioInstances: IOEntry[] = []

class MockIO {
  root: Element | Document | null = null
  rootMargin = ''
  thresholds: number[] = []
  private entry: IOEntry

  constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.entry = { cb, els: new Set(), options, obs: this as unknown as IntersectionObserver }
    ioInstances.push(this.entry)
  }
  observe(el: Element) {
    this.entry.els.add(el)
  }
  unobserve(el: Element) {
    this.entry.els.delete(el)
  }
  disconnect() {
    this.entry.els.clear()
    const i = ioInstances.indexOf(this.entry)
    if (i >= 0) ioInstances.splice(i, 1)
  }
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

export function triggerIntersect(el: Element, isIntersecting = true) {
  for (const inst of [...ioInstances]) {
    if (!inst.els.has(el)) continue
    inst.cb(
      [{ target: el, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 } as IntersectionObserverEntry],
      inst.obs,
    )
  }
}

globalThis.IntersectionObserver = MockIO as unknown as typeof IntersectionObserver
