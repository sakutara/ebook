import { IconButton } from '../icons/Icon'

export interface TocEntry {
  label: string
  href: string
  subitems?: TocEntry[]
}

export interface TocPanelProps {
  toc: TocEntry[]
  onSelect: (href: string) => void
  /** Sheet only: closes the overlay (after a selection too). */
  onClose?: () => void
  variant: 'sheet' | 'panel'
  /** Entries cannot be picked while the book is still opening (foliate drops navigation during restore). */
  disabled?: boolean
}

function TocList(p: { items: TocEntry[]; onPick: (href: string) => void; disabled?: boolean }) {
  return (
    <ul class="flex flex-col gap-1">
      {p.items.map((item) => (
        <li key={`${item.href}|${item.label}`}>
          <button
            type="button"
            class="flex min-h-11 w-full items-center rounded-lg px-2 text-start text-fluid-sm hover:bg-surface-2"
            disabled={p.disabled}
            onClick={(e) => {
              // Keep focus off the entry so the reader's arrow keys work straight after a pick.
              ;(e.currentTarget as HTMLElement).blur()
              p.onPick(item.href)
            }}
          >
            {item.label}
          </button>
          {item.subitems && item.subitems.length > 0 && (
            <div class="ps-4">
              <TocList items={item.subitems} onPick={p.onPick} disabled={p.disabled} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export function TocPanel(p: TocPanelProps) {
  const pick = (href: string): void => {
    p.onSelect(href)
    if (p.variant === 'sheet') p.onClose?.()
  }

  if (p.variant === 'panel') {
    return <TocList items={p.toc} onPick={pick} disabled={p.disabled} />
  }

  return (
    <div role="dialog" aria-label="Mục lục" class="fixed inset-0 z-30 flex flex-col bg-surface text-ink">
      <div class="flex items-center justify-between gap-2 px-gutter py-2">
        <h2 class="text-fluid-lg font-semibold">Mục lục</h2>
        <IconButton icon="close" label="Đóng" onClick={() => p.onClose?.()} />
      </div>
      <div class="flex-1 overflow-y-auto px-gutter pb-gutter">
        <TocList items={p.toc} onPick={pick} disabled={p.disabled} />
      </div>
    </div>
  )
}
