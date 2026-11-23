import { useEffect, useState } from 'preact/hooks'
import { liveQuery } from 'dexie'

/** Subscribes to a Dexie liveQuery; re-subscribes when deps change, unsubscribes on cleanup. */
export function useLiveQuery<T>(query: () => T | Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial)
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: (v) => setValue(() => v as T),
      error: (e) => console.error(e),
    })
    return () => sub.unsubscribe()
  }, deps)
  return value
}
