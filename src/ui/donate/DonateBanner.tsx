import { useRef, useState } from 'preact/hooks'
import type { DonateConfig } from '../../config'
import { IconTextButton } from '../icons/Icon'
import { DonateDialog } from './DonateDialog'

/**
 * The donate banner is always shown when a donate account is configured. It has no close or hide
 * control and nothing stores a dismissal: it stays on every library, settings and request screen.
 */
export function DonateBanner({ config }: { config: DonateConfig | null }) {
  const [open, setOpen] = useState(false)
  const asideRef = useRef<HTMLElement>(null)

  if (config === null) return null

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
      </aside>
      {open && <DonateDialog config={config} onClose={close} />}
    </>
  )
}
