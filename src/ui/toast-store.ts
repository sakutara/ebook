import { signal } from '@preact/signals'

export const toast = signal<{ id: number; text: string } | null>(null)

let nextId = 1

export function showToast(text: string, ms = 4000): void {
  const id = nextId++
  toast.value = { id, text }
  setTimeout(() => {
    if (toast.value?.id === id) toast.value = null
  }, ms)
}
