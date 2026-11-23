import { toast } from './toast-store'
import { IconButton } from './icons/Icon'

/**
 * `raised` lifts the toast above the donate banner and tab bar stack when the banner is shown.
 * Tailwind classes are written out in full so the JIT scanner sees them.
 */
export function Toast({ raised = false }: { raised?: boolean }) {
  const t = toast.value
  if (!t) return null
  const offset = raised ? 'bottom-36 lg:bottom-20' : 'bottom-20 lg:bottom-6'
  return (
    <div
      role="status"
      aria-live="polite"
      class={`fixed inset-x-gutter ${offset} z-30 flex items-center justify-between gap-2 rounded-xl bg-ink p-3 text-surface lg:left-auto lg:w-96`}
    >
      <span class="text-fluid-sm">{t.text}</span>
      <IconButton icon="close" label="Đóng" onClick={() => (toast.value = null)} />
    </div>
  )
}
