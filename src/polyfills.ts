/**
 * Minimal polyfills for older Chromium WebViews (e.g. the stock Boox browser).
 * foliate-js calls Object.groupBy / Map.groupBy (Chrome 117) when parsing EPUB metadata and
 * Array#findLastIndex (Chrome 97) in the paginator; without them every book fails to open.
 * Must be imported before anything that touches foliate-js.
 */
type Key = PropertyKey

if (!('groupBy' in Object)) {
  Object.defineProperty(Object, 'groupBy', {
    configurable: true,
    writable: true,
    value<T>(items: Iterable<T>, fn: (item: T, i: number) => Key) {
      const out: Record<Key, T[]> = Object.create(null)
      let i = 0
      for (const item of items) (out[fn(item, i++)] ??= []).push(item)
      return out
    },
  })
}

if (!('groupBy' in Map)) {
  Object.defineProperty(Map, 'groupBy', {
    configurable: true,
    writable: true,
    value<T, K>(items: Iterable<T>, fn: (item: T, i: number) => K) {
      const out = new Map<K, T[]>()
      let i = 0
      for (const item of items) {
        const k = fn(item, i++)
        const list = out.get(k)
        if (list) list.push(item)
        else out.set(k, [item])
      }
      return out
    },
  })
}

function define(proto: object, name: string, value: unknown) {
  if (!(name in proto)) Object.defineProperty(proto, name, { configurable: true, writable: true, value })
}

define(Array.prototype, 'at', function (this: unknown[], n: number) {
  const i = Math.trunc(n) || 0
  return this[i < 0 ? this.length + i : i]
})
define(Array.prototype, 'findLast', function (this: unknown[], fn: (v: unknown, i: number, a: unknown[]) => boolean) {
  for (let i = this.length - 1; i >= 0; i--) if (fn(this[i], i, this)) return this[i]
  return undefined
})
define(Array.prototype, 'findLastIndex', function (this: unknown[], fn: (v: unknown, i: number, a: unknown[]) => boolean) {
  for (let i = this.length - 1; i >= 0; i--) if (fn(this[i], i, this)) return i
  return -1
})
define(String.prototype, 'at', function (this: string, n: number) {
  const i = Math.trunc(n) || 0
  return this[i < 0 ? this.length + i : i]
})
define(String.prototype, 'replaceAll', function (this: string, search: string | RegExp, rep: string | ((...a: string[]) => string)) {
  if (search instanceof RegExp) {
    if (!search.global) throw new TypeError('replaceAll must be called with a global RegExp')
    return this.replace(search, rep as string)
  }
  return this.split(search).join(typeof rep === 'string' ? rep : String(rep))
})

if (!('withResolvers' in Promise)) {
  Object.defineProperty(Promise, 'withResolvers', {
    configurable: true,
    writable: true,
    value() {
      let resolve!: (v?: unknown) => void
      let reject!: (e?: unknown) => void
      const promise = new Promise((res, rej) => { resolve = res; reject = rej })
      return { promise, resolve, reject }
    },
  })
}

if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (v: unknown) => JSON.parse(JSON.stringify(v))
}

if (typeof globalThis.crypto?.randomUUID !== 'function' && typeof globalThis.crypto?.getRandomValues === 'function') {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value() {
      const b = crypto.getRandomValues(new Uint8Array(16))
      b[6] = (b[6] & 0x0f) | 0x40
      b[8] = (b[8] & 0x3f) | 0x80
      const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
    },
  })
}
