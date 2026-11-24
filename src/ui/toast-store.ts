import { signal } from '@preact/signals'

export interface ToastAction {
  label: string
  run: () => void
}

export const toast = signal<{ id: number; text: string; action?: ToastAction } | null>(null)

let nextId = 1

/** Shows `text` for `ms`. An optional action (e.g. "Hoàn tác") shows as a text button. */
export function showToast(text: string, ms = 4000, action?: ToastAction): void {
  const id = nextId++
  toast.value = action ? { id, text, action } : { id, text }
  setTimeout(() => {
    if (toast.value?.id === id) toast.value = null
  }, ms)
}
