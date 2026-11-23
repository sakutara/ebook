import { useState } from 'preact/hooks'
import { ConnectPanel } from './ui/ConnectPanel'
import { DraftList } from './ui/DraftCard'
import { DropZone } from './ui/DropZone'
import { PublishedTab } from './ui/PublishedTab'
import { UploadBar } from './ui/UploadBar'
import { defaultStore, type DeployerStore } from './ui/store-ref'

type Tab = 'upload' | 'published'

const TABS: { id: Tab; label: string }[] = [
  { id: 'upload', label: 'Tải lên' },
  { id: 'published', label: 'Đã đăng' },
]

export interface AppProps {
  store?: DeployerStore
}

/** Deployer page: connection panel beside (wide) or above (narrow) the upload and published tabs. */
export function App({ store = defaultStore }: AppProps) {
  const [tab, setTab] = useState<Tab>('upload')

  return (
    <main class="min-h-dvh bg-surface text-ink">
      <header class="border-b border-ink-muted/20 px-4 py-3">
        <h1 class="text-fluid-xl font-semibold">R2 Deployer</h1>
      </header>
      <div class="mx-auto grid max-w-7xl gap-6 p-4 lg:grid-cols-[20rem_1fr]">
        <ConnectPanel store={store} />
        <div class="grid min-w-0 content-start gap-4">
          <div role="tablist" aria-label="Chế độ" class="flex gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                class={`min-h-11 rounded-xl px-4 text-fluid-base font-medium transition-colors ${
                  tab === t.id ? 'bg-accent text-surface' : 'bg-surface-2 text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'upload' && (
            <section role="tabpanel" id="panel-upload" aria-labelledby="tab-upload" class="grid gap-4">
              <DropZone store={store} />
              <DraftList store={store} />
              <UploadBar store={store} />
            </section>
          )}
          {tab === 'published' && (
            <section role="tabpanel" id="panel-published" aria-labelledby="tab-published">
              <PublishedTab store={store} />
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
