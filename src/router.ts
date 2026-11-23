import { signal } from '@preact/signals'

export type Route =
  | { name: 'library' }
  | { name: 'read'; id: string }
  | { name: 'settings' }
  | { name: 'request' }

export function parseHash(hash: string): Route {
  const h = hash.startsWith('#') ? hash.slice(1) : hash
  if (h === '' || h === '/') return { name: 'library' }
  if (h === '/settings') return { name: 'settings' }
  if (h === '/request') return { name: 'request' }
  const m = /^\/read\/(.+)$/.exec(h)
  if (m) return { name: 'read', id: decodeURIComponent(m[1]) }
  return { name: 'library' }
}

export const route = signal<Route>(parseHash(typeof location === 'undefined' ? '' : location.hash))

export function startRouter(): () => void {
  const onChange = () => {
    route.value = parseHash(location.hash)
  }
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function navigate(hash: string): void {
  location.hash = hash
}
