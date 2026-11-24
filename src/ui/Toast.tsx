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
      class={`fixed inset-x-gutter ${offset} z-40 flex items-center justify-between gap-2 rounded-2xl bg-ink py-2 pe-2 ps-4 text-surface shadow-float lg:left-auto lg:w-96`}
    >
      <span class="min-w-0 flex-1 text-fluid-sm">{t.text}</span>
      {t.action && (
        <button
          type="button"
          class="min-h-11 shrink-0 cursor-pointer rounded-full px-3 text-fluid-sm font-semibold text-accent-on-ink hover:bg-surface/10"
          onClick={() => {
            t.action?.run()
            toast.value = null
          }}
        >
          {t.action.label}
        </button>
      )}
      <IconButton icon="close" label="Đóng" class="hover:bg-surface/10" onClick={() => (toast.value = null)} />
    </div>
  )
}
