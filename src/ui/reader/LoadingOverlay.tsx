export function LoadingOverlay(p: { percent?: number }) {
  const text = p.percent === undefined ? 'Đang mở truyện…' : `Đang tải… ${Math.round(p.percent)}%`
  return (
    <div
      role="status"
      class="absolute inset-0 z-10 flex items-center justify-center bg-[var(--reader-bg)] p-gutter text-center text-fluid-base text-[var(--reader-fg)]"
    >
      {text}
    </div>
  )
}
