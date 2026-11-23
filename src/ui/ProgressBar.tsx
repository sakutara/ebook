export interface ProgressBarProps {
  /** 0..100 when known; `null` shows an indeterminate sliding bar. */
  percent: number | null
  label?: string
}

/** Progress for a book download. Indeterminate when `percent` is `null` (no aria-valuenow). */
export function ProgressBar({ percent, label = 'Đang tải truyện' }: ProgressBarProps) {
  const known = percent !== null
  return (
    <div class="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        class="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
      >
        {known ? (
          <div class="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
        ) : (
          <div class="h-full w-2/5 bg-accent animate-[progress-indeterminate_1.2s_ease-in-out_infinite] motion-reduce:animate-none" />
        )}
      </div>
      <span class="text-fluid-sm tabular-nums text-ink-muted">
        {known ? `Đang tải ${percent}%` : 'Đang tải…'}
      </span>
    </div>
  )
}
