import { defaultStore, type DeployerStore } from './store-ref'

export interface ConnectPanelProps {
  store?: DeployerStore
}

const FIELD = 'min-h-11 rounded-lg border border-ink-muted/40 bg-surface px-3 text-fluid-base text-ink'

/** Worker URL, admin token and "Nhớ trên máy này"; connects through `store.connect()`. */
export function ConnectPanel({ store = defaultStore }: ConnectPanelProps) {
  const conn = store.conn.value
  const count = store.catalog.value.length
  const checking = conn.state === 'checking'

  const setConn = (patch: Partial<DeployerStore['conn']['value']>) => {
    store.conn.value = { ...store.conn.value, ...patch }
  }

  return (
    <section aria-labelledby="connect-heading" class="rounded-xl bg-surface-2 p-4">
      <h2 id="connect-heading" class="text-fluid-lg font-semibold">
        Kết nối
      </h2>
      <form
        class="mt-3 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void store.connect()
        }}
      >
        <div class="grid gap-1 text-fluid-sm">
          <label for="connect-url">Địa chỉ Worker</label>
          <input
            id="connect-url"
            type="url"
            class={FIELD}
            value={conn.baseUrl}
            onInput={(e) => setConn({ baseUrl: e.currentTarget.value })}
          />
        </div>
        <div class="grid gap-1 text-fluid-sm">
          <label for="connect-token">Mã quản trị</label>
          <input
            id="connect-token"
            type="password"
            autocomplete="off"
            class={FIELD}
            value={conn.token}
            onInput={(e) => setConn({ token: e.currentTarget.value })}
          />
        </div>
        <div class="flex min-h-11 items-center gap-2 text-fluid-sm">
          <input
            id="connect-remember"
            type="checkbox"
            class="size-5"
            checked={conn.remember}
            onChange={(e) => setConn({ remember: e.currentTarget.checked })}
          />
          <label for="connect-remember">Nhớ trên máy này</label>
        </div>
        <button
          type="submit"
          disabled={checking}
          class="min-h-11 rounded-xl bg-accent px-4 text-fluid-base font-medium text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Kết nối
        </button>
      </form>
      <div class="mt-3 text-fluid-sm">
        {checking && <p class="text-ink-muted">Đang kiểm tra…</p>}
        {conn.state === 'ok' && <p class="text-ink">{`Đã kết nối · ${count} truyện`}</p>}
        {conn.state === 'error' && (
          <p role="alert" class="text-red-600 dark:text-red-400">
            {conn.error}
          </p>
        )}
      </div>
    </section>
  )
}
