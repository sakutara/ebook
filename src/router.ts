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

/** History entry state written by this app. */
interface AppState {
  /** Pushed by `navigate`: the entry before it belongs to this app, so `goBack` may step back. */
  inApp?: boolean
  /** Pushed by `useBackClose` while an overlay (sheet, dialog) is open. */
  overlay?: boolean
}

function currentState(): AppState {
  const s: unknown = typeof history === 'undefined' ? null : history.state
  return typeof s === 'object' && s !== null ? (s as AppState) : {}
}

export function startRouter(): () => void {
  const onChange = () => {
    route.value = parseHash(location.hash)
  }
  // pushState entries only fire popstate when traversed, so listen to both.
  window.addEventListener('hashchange', onChange)
  window.addEventListener('popstate', onChange)
  return () => {
    window.removeEventListener('hashchange', onChange)
    window.removeEventListener('popstate', onChange)
  }
}

/**
 * Goes to `hash`. Pushes a history entry marked as in-app, so the system back button (and
 * `goBack`) return to the page the user came from. While an overlay entry is on top, that entry
 * is replaced instead, so closing the overlay never undoes the navigation.
 */
export function navigate(hash: string, opts: { replace?: boolean } = {}): void {
  const replace = opts.replace === true || currentState().overlay === true
  const state: AppState = { inApp: true }
  if (replace) history.replaceState(state, '', hash)
  else history.pushState(state, '', hash)
  route.value = parseHash(hash)
}

/**
 * Steps back when the previous entry is this app's (the user navigated here), so the browser's
 * own back button never bounces into the page just left. Opened from a link or a reload, it
 * replaces the current entry with `fallback` instead.
 */
export function goBack(fallback = '#/'): void {
  if (currentState().inApp === true) history.back()
  else navigate(fallback, { replace: true })
}
