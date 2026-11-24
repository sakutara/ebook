import { useState } from 'preact/hooks'
import { IconButton } from '../icons/Icon'

export interface ReaderChromeProps {
  title: string
  sectionLabel: string
  fraction: number
  onBack: () => void
  onToc: () => void
  onPrefs: () => void
  onSeek: (fraction: number) => void
}

export function ReaderChrome(p: ReaderChromeProps) {
  // Position under the thumb while dragging; the book only moves when the thumb is released.
  const [drag, setDrag] = useState<number | null>(null)
  const shown = drag ?? p.fraction
  return (
    <>
      <header class="absolute inset-x-0 top-0 z-20 flex items-center gap-2 border-b border-current/10 bg-[var(--reader-bg)] px-2 py-1 pt-[max(0.25rem,env(safe-area-inset-top))] text-[var(--reader-fg)] sm:px-gutter">
        <IconButton icon="back" label="Về thư viện" onClick={() => p.onBack()} />
        <h1 class="min-w-0 flex-1 truncate font-serif text-fluid-base font-semibold">{p.title}</h1>
        <IconButton icon="toc" label="Mục lục" class="lg:hidden" onClick={() => p.onToc()} />
        <IconButton icon="typography" label="Tuỳ chỉnh chữ" onClick={() => p.onPrefs()} />
      </header>
      <footer class="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-1 border-t border-current/10 bg-[var(--reader-bg)] px-gutter py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[var(--reader-fg)]">
        <div class="flex items-center justify-between gap-2 text-fluid-sm opacity-75">
          <span class="min-w-0 truncate">{drag !== null ? 'Thả tay để đến vị trí này' : p.sectionLabel}</span>
          <span class={`shrink-0 tabular-nums ${drag !== null ? 'font-semibold opacity-100' : ''}`}>{Math.round(shown * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(shown * 1000)}
          aria-label="Vị trí trong truyện"
          aria-valuetext={`${Math.round(shown * 100)}%`}
          class="min-h-11 w-full cursor-pointer accent-accent"
          onInput={(e) => setDrag(Number(e.currentTarget.value) / 1000)}
          onChange={(e) => {
            setDrag(null)
            p.onSeek(Number(e.currentTarget.value) / 1000)
          }}
        />
      </footer>
    </>
  )
}
