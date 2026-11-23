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
  return (
    <>
      <header class="absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-[var(--reader-bg)] px-gutter py-1 text-[var(--reader-fg)] shadow-sm">
        <IconButton icon="back" label="Về thư viện" onClick={() => p.onBack()} />
        <h1 class="min-w-0 flex-1 truncate text-fluid-base font-semibold">{p.title}</h1>
        <IconButton icon="toc" label="Mục lục" class="lg:hidden" onClick={() => p.onToc()} />
        <IconButton icon="typography" label="Tuỳ chỉnh chữ" onClick={() => p.onPrefs()} />
      </header>
      <footer class="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-1 bg-[var(--reader-bg)] px-gutter py-2 text-[var(--reader-fg)] shadow-sm">
        <div class="flex items-center justify-between gap-2 text-fluid-sm">
          <span class="min-w-0 truncate">{p.sectionLabel}</span>
          <span class="shrink-0">{Math.round(p.fraction * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(p.fraction * 1000)}
          aria-label="Vị trí trong truyện"
          class="min-h-11 w-full accent-accent"
          onChange={(e) => p.onSeek(Number(e.currentTarget.value) / 1000)}
        />
      </footer>
    </>
  )
}
