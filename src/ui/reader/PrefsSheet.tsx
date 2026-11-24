import type { ReaderPrefs } from '../../reader/prefs'
import { THEMES } from '../../reader/prefs'
import { IconButton } from '../icons/Icon'

export interface PrefsSheetProps {
  prefs: ReaderPrefs
  onChange: (p: ReaderPrefs) => void
  onClose?: () => void
}

const LINE_HEIGHTS: ReaderPrefs['lineHeight'][] = [1.4, 1.6, 1.8]
const LINE_LABEL: Record<ReaderPrefs['lineHeight'], string> = { 1.4: 'Hẹp', 1.6: 'Vừa', 1.8: 'Rộng' }

const THEME_BUTTONS: { theme: ReaderPrefs['theme']; label: string }[] = [
  { theme: 'light', label: 'Nền sáng' },
  { theme: 'sepia', label: 'Nền sepia' },
  { theme: 'dark', label: 'Nền tối' },
]

const ROW = 'flex items-center gap-3'
const ROW_LABEL = 'w-20 shrink-0 text-fluid-sm text-ink-muted'

export function PrefsSheet(p: PrefsSheetProps) {
  const { prefs } = p
  const set = (patch: Partial<ReaderPrefs>) => p.onChange({ ...prefs, ...patch })
  const pct = Math.round(prefs.fontScale * 100)
  const theme = THEMES[prefs.theme]
  return (
    <div
      role="dialog"
      aria-label="Tuỳ chỉnh chữ"
      class="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-4 rounded-t-3xl border border-line bg-surface p-gutter pb-[max(1rem,env(safe-area-inset-bottom))] text-ink shadow-float lg:inset-x-auto lg:right-4 lg:bottom-4 lg:w-96 lg:rounded-3xl"
    >
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-fluid-lg font-semibold">Tuỳ chỉnh chữ</h2>
        {p.onClose && <IconButton icon="close" label="Đóng" onClick={() => p.onClose?.()} />}
      </div>

      <p
        aria-hidden="true"
        class="rounded-xl border border-line px-4 py-3 font-serif"
        style={{ background: theme.bg, color: theme.fg, fontSize: `${prefs.fontScale}rem`, lineHeight: prefs.lineHeight }}
      >
        Gió lặng, trăng treo đầu núi. Một trang sách mở ra.
      </p>

      <div class={ROW}>
        <span class={ROW_LABEL}>Cỡ chữ {pct}%</span>
        <IconButton icon="font-smaller" label="Chữ nhỏ hơn" disabled={pct <= 80} onClick={() => set({ fontScale: prefs.fontScale - 0.1 })} />
        <input
          type="range"
          min={80}
          max={160}
          step={10}
          value={pct}
          aria-label="Cỡ chữ"
          aria-valuetext={`${pct}%`}
          class="min-h-11 min-w-0 flex-1 cursor-pointer accent-accent"
          onInput={(e) => set({ fontScale: Number(e.currentTarget.value) / 100 })}
        />
        <IconButton icon="font-larger" label="Chữ lớn hơn" disabled={pct >= 160} onClick={() => set({ fontScale: prefs.fontScale + 0.1 })} />
      </div>

      <div class={ROW}>
        <span class={ROW_LABEL}>Giãn dòng</span>
        <div role="radiogroup" aria-label="Giãn dòng" class="flex flex-1 gap-0.5 rounded-full border border-line bg-surface-2 p-0.5">
          {LINE_HEIGHTS.map((lh) => (
            <button
              key={lh}
              type="button"
              role="radio"
              aria-checked={prefs.lineHeight === lh}
              onClick={() => set({ lineHeight: lh })}
              class="min-h-10 flex-1 cursor-pointer rounded-full text-fluid-sm font-medium text-ink-muted transition-colors aria-checked:bg-accent aria-checked:text-on-accent"
            >
              {LINE_LABEL[lh]}
            </button>
          ))}
        </div>
      </div>

      <div class={ROW}>
        <span class={ROW_LABEL}>Màu nền</span>
        <div class="flex flex-1 gap-2">
          {THEME_BUTTONS.map((t) => {
            const on = prefs.theme === t.theme
            const c = THEMES[t.theme]
            return (
              <button
                key={t.theme}
                type="button"
                aria-label={t.label}
                title={t.label}
                aria-pressed={on}
                onClick={() => set({ theme: t.theme })}
                style={{ background: c.bg, color: c.fg }}
                class={`min-h-11 flex-1 cursor-pointer rounded-xl border-2 font-serif text-fluid-base font-semibold transition ${on ? 'border-accent shadow-sm' : 'border-line'}`}
              >
                Aa
              </button>
            )
          })}
        </div>
      </div>

      <div class={ROW}>
        <span class={ROW_LABEL}>Nút media</span>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.mediaKeys}
          aria-label="Lật trang bằng nút tai nghe, remote và màn hình khoá"
          onClick={() => set({ mediaKeys: !prefs.mediaKeys })}
          class="min-h-11 flex-1 cursor-pointer rounded-full border border-line bg-surface-2 text-fluid-sm font-medium text-ink-muted transition-colors aria-checked:border-accent aria-checked:bg-accent aria-checked:text-on-accent"
        >
          {prefs.mediaKeys ? 'Bật: tai nghe / remote' : 'Tắt'}
        </button>
      </div>
    </div>
  )
}
