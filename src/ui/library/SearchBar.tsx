import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { effect } from '@preact/signals'
import { Icon, IconButton } from '../icons/Icon'
import { query } from './library-state'

const DEBOUNCE_MS = 150

/** Search field. Keeps its own text and publishes it to `query` after a short debounce. */
export function SearchBar() {
  const [text, setText] = useState(query.value)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // The query value this field last published or followed; anything else is an external change.
  const known = useRef(query.value)
  // Text typed but not yet published; committed on unmount so navigating away keeps it.
  const pending = useRef<string | undefined>(undefined)

  // Layout effects: the signal effect runs synchronously on each set, and the cleanup runs
  // synchronously on unmount, before the next navigation reads `query`.
  useLayoutEffect(() => {
    const stop = effect(() => {
      const external = query.value
      if (external === known.current) return
      // Changed from outside (e.g. clearFilters): drop typed-but-unpublished text and any pending publish.
      clearTimeout(timer.current)
      pending.current = undefined
      known.current = external
      setText(external)
    })
    return () => {
      stop()
      clearTimeout(timer.current)
      if (pending.current !== undefined) query.value = pending.current
    }
  }, [])

  const onInput = (e: Event) => {
    const next = (e.currentTarget as HTMLInputElement).value
    setText(next)
    clearTimeout(timer.current)
    pending.current = next
    timer.current = setTimeout(() => {
      pending.current = undefined
      known.current = next
      query.value = next
    }, DEBOUNCE_MS)
  }

  const clear = () => {
    clearTimeout(timer.current)
    pending.current = undefined
    known.current = ''
    setText('')
    query.value = ''
  }

  return (
    <div role="search" class="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-surface-2 pl-3">
      <Icon name="search" class="text-ink-muted" />
      <input
        type="search"
        aria-label="Tìm truyện"
        placeholder="Tìm truyện…"
        value={text}
        onInput={onInput}
        class="text-base min-h-11 min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-muted focus-visible:outline-none"
      />
      {text !== '' && <IconButton icon="close" label="Xoá tìm kiếm" onClick={clear} />}
    </div>
  )
}
