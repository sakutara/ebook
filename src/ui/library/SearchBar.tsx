import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { Icon, IconButton } from '../icons/Icon'
import { query } from './library-state'

const DEBOUNCE_MS = 150

/** Search field. Keeps its own text and publishes it to `query` after a short debounce. */
export function SearchBar() {
  const [text, setText] = useState(query.value)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Text typed but not yet published; committed on unmount so navigating away keeps it.
  const pending = useRef<string | undefined>(undefined)

  // Layout effect: its cleanup runs synchronously on unmount, before the next navigation reads `query`.
  useLayoutEffect(
    () => () => {
      clearTimeout(timer.current)
      if (pending.current !== undefined) query.value = pending.current
    },
    [],
  )

  const onInput = (e: Event) => {
    const next = (e.currentTarget as HTMLInputElement).value
    setText(next)
    clearTimeout(timer.current)
    pending.current = next
    timer.current = setTimeout(() => {
      pending.current = undefined
      query.value = next
    }, DEBOUNCE_MS)
  }

  const clear = () => {
    clearTimeout(timer.current)
    pending.current = undefined
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
