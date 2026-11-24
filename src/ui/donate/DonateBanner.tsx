import { useRef, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import type { DonateConfig } from '../../config'
import { IconButton, IconTextButton } from '../icons/Icon'
import { DonateDialog } from './DonateDialog'

const HIDE_KEY = 'donate.hiddenUntil'
/** How long "Ẩn" keeps the banner away. */
export const HIDE_MS = 7 * 24 * 60 * 60 * 1000

function readHidden(): boolean {
  try {
    return Number(localStorage.getItem(HIDE_KEY) ?? 0) > Date.now()
  } catch {
    return false
  }
}

/** True while the user has hidden the banner (for HIDE_MS). The shell reads it for its offsets. */
export const donateHidden = signal(typeof window === 'undefined' ? false : readHidden())

export function hideDonateBanner(now = Date.now()): void {
  try {
    localStorage.setItem(HIDE_KEY, String(now + HIDE_MS))
  } catch {
    // Storage unavailable: hidden for this session only.
  }
  donateHidden.value = true
}

export function DonateBanner({ config }: { config: DonateConfig | null }) {
  const [open, setOpen] = useState(false)
  const asideRef = useRef<HTMLElement>(null)

  if (config === null || donateHidden.value) return null

  const close = () => {
    setOpen(false)
    // Return focus to the banner button (ref is on the aside; IconTextButton does not forward refs).
    asideRef.current?.querySelector('button')?.focus()
  }

  return (
    <>
      <aside
        ref={asideRef}
        data-banner
        aria-label="Ủng hộ"
        class="flex items-center gap-2 border-t border-line bg-surface-2 px-gutter py-1.5"
      >
        <p class="min-w-0 flex-1 text-fluid-sm">Ủng hộ token dịch truyện</p>
        <IconTextButton icon="donate" label="Ủng hộ" variant="primary" onClick={() => setOpen(true)} />
        <IconButton icon="close" label="Ẩn lời nhắn ủng hộ 7 ngày" class="-me-2 text-ink-muted" onClick={() => hideDonateBanner()} />
      </aside>
      {open && <DonateDialog config={config} onClose={close} />}
    </>
  )
}
