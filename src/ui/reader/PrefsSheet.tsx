import type { ReaderPrefs } from '../../reader/prefs'
import { IconButton } from '../icons/Icon'

export interface PrefsSheetProps {
  prefs: ReaderPrefs
  onChange: (p: ReaderPrefs) => void
  onClose?: () => void
}

const NEXT_LINE_HEIGHT: Record<ReaderPrefs['lineHeight'], ReaderPrefs['lineHeight']> = {
  1.4: 1.6,
  1.6: 1.8,
  1.8: 1.4,
}

const THEME_BUTTONS: { theme: ReaderPrefs['theme']; icon: 'theme-light' | 'theme-sepia' | 'theme-dark'; label: string }[] = [
  { theme: 'light', icon: 'theme-light', label: 'Nền sáng' },
  { theme: 'sepia', icon: 'theme-sepia', label: 'Nền sepia' },
  { theme: 'dark', icon: 'theme-dark', label: 'Nền tối' },
]

export function PrefsSheet(p: PrefsSheetProps) {
  const { prefs } = p
  return (
    <div
      role="dialog"
      aria-label="Tuỳ chỉnh chữ"
      class="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-3 rounded-t-xl bg-surface p-gutter text-ink shadow-lg lg:inset-x-auto lg:right-4 lg:bottom-4 lg:w-96"
    >
      <div class="flex items-center justify-between gap-2">
        <span class="text-fluid-sm">Cỡ chữ {Math.round(prefs.fontScale * 100)}%</span>
        {p.onClose && <IconButton icon="close" label="Đóng" onClick={() => p.onClose?.()} />}
      </div>
      <div class="flex items-center justify-around gap-2">
        <IconButton
          icon="font-smaller"
          label="Chữ nhỏ hơn"
          onClick={() => p.onChange({ ...prefs, fontScale: prefs.fontScale - 0.1 })}
        />
        <IconButton
          icon="font-larger"
          label="Chữ lớn hơn"
          onClick={() => p.onChange({ ...prefs, fontScale: prefs.fontScale + 0.1 })}
        />
        <IconButton
          icon="line-height"
          label="Giãn dòng"
          onClick={() => p.onChange({ ...prefs, lineHeight: NEXT_LINE_HEIGHT[prefs.lineHeight] })}
        />
        <span class="text-fluid-sm">{prefs.lineHeight}</span>
      </div>
      <div class="flex items-center justify-around gap-2">
        {THEME_BUTTONS.map((t) => (
          <IconButton
            key={t.theme}
            icon={t.icon}
            label={t.label}
            pressed={prefs.theme === t.theme}
            variant={prefs.theme === t.theme ? 'primary' : 'plain'}
            onClick={() => p.onChange({ ...prefs, theme: t.theme })}
          />
        ))}
      </div>
    </div>
  )
}
