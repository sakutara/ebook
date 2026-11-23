import { useState } from 'preact/hooks'
import { defaultStore, type DeployerStore } from './store-ref'

export interface DropZoneProps {
  store?: DeployerStore
}

/** File picker and drop target for EPUB files. Non-EPUB files are skipped; the store explains why. */
export function DropZone({ store = defaultStore }: DropZoneProps) {
  const [over, setOver] = useState(false)
  const notice = store.notice.value

  return (
    <div class="grid gap-2">
      <label
        class={`flex min-h-24 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed p-4 text-center text-fluid-base transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
          over ? 'border-accent bg-surface-2' : 'border-ink-muted/50'
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void store.addFiles(e.dataTransfer?.files ?? [])
        }}
      >
        <input
          id="epub-files"
          type="file"
          aria-label="Chọn hoặc kéo thả tệp EPUB vào đây"
          multiple
          accept=".epub,application/epub+zip"
          class="sr-only"
          onChange={(e) => {
            const input = e.currentTarget
            // Copy the list first: clearing the input empties it, so the same files can be picked again.
            const files = Array.from(input.files ?? [])
            input.value = ''
            void store.addFiles(files)
          }}
        />
        <span>Chọn hoặc kéo thả tệp EPUB vào đây</span>
      </label>
      {notice !== null && (
        <p role="status" class="text-fluid-sm text-ink-muted">
          {notice}
        </p>
      )}
    </div>
  )
}
