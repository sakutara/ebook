import { useEffect, useState } from 'preact/hooks'
import { IconTextButton } from '../../../src/ui/icons/Icon'
import { ProgressBar } from '../../../src/ui/ProgressBar'
import { canUpload } from '../draft'
import { defaultStore, type DeployerStore } from './store-ref'

/** navigator.onLine, kept current through the window online/offline events. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export interface UploadBarProps {
  store?: DeployerStore
}

/** Sticky bottom bar: "Tải lên N truyện", the overall progress while running, and "Dừng". */
export function UploadBar({ store = defaultStore }: UploadBarProps) {
  const online = useOnline()
  const drafts = store.drafts.value
  const up = store.uploading.value
  const connected = store.conn.value.state === 'ok'
  const uploadError = store.uploadError.value

  if (drafts.length === 0) return null

  const count = drafts.filter(canUpload).length
  const disabled = count === 0 || !connected || up.running || !online
  const overall = up.total > 0 ? Math.floor((up.done / up.total) * 100) : 0

  return (
    <div class="sticky bottom-0 z-10 grid gap-2 border-t border-ink-muted/20 bg-surface py-3">
      {uploadError !== null && (
        <p role="alert" class="text-fluid-sm font-medium text-red-600 dark:text-red-400">
          {uploadError}
        </p>
      )}
      {!online && uploadError === null && (
        <p class="text-fluid-sm font-medium text-red-600 dark:text-red-400">Cần kết nối mạng để tải lên</p>
      )}
      {up.running && <ProgressBar percent={overall} label="Tiến độ chung" />}
      <div class="flex flex-wrap items-center gap-2">
        <IconTextButton
          icon="import"
          label={`Tải lên ${count} truyện`}
          variant="primary"
          disabled={disabled}
          onClick={() => {
            // Guard in code too: a disabled control must never start an upload, whatever dispatched the click.
            if (!disabled) void store.startUpload()
          }}
        />
        {up.running && <IconTextButton icon="close" label="Dừng" onClick={() => store.stopUpload()} />}
      </div>
    </div>
  )
}
