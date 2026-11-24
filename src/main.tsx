import './polyfills'
import { render } from 'preact'
import './styles/app.css'
import { App } from './app'
import { getDonateConfig, getRequestFormConfig } from './config'
import { db } from './db/db'
import { createFormAdapter, createRoutingAdapter } from './sync/form-adapter'
import { localOnlyAdapter } from './sync/adapters'
import { createSyncEngine } from './sync/sync-engine'
import { initPWA } from './pwa'
import { startRouter } from './router'
import { getServices } from './services'
import { ReaderPage } from './ui/reader/ReaderPage'
import { RequestPage } from './ui/request/RequestPage'
import { showToast } from './ui/toast-store'
import { goBack } from './router'
import { LibraryPage } from './ui/library/LibraryPage'
import { SettingsPage } from './ui/settings/SettingsPage'

initPWA()
const engine = createSyncEngine(
  db,
  createRoutingAdapter(
    { 'storyRequest.submit': createFormAdapter(db, getRequestFormConfig()) },
    localOnlyAdapter,
  ),
)
engine.start()
startRouter()
const services = getServices()
void services.catalogSync.start()
render(
  <App
    donate={getDonateConfig()}
    pages={{
      library: () => <LibraryPage services={services} />,
      reader: ({ id }: { id: string }) => (
        <ReaderPage
          id={id}
          db={services.db}
          cacheDeps={services.cacheDeps}
          onNotice={showToast}
          onBack={() => goBack('#/')}
        />
      ),
      request: () => (
        <RequestPage db={services.db} formConfig={getRequestFormConfig()} flush={engine.flush} />
      ),
      settings: () => (
        <SettingsPage db={services.db} />
      ),
    }}
  />,
  document.getElementById('app')!,
)
