import { defaultStore, type DeployerStore } from './store-ref'

export interface ConnectPanelProps {
  store?: DeployerStore
}

const FIELD = 'field text-fluid-base'

/** Worker URL, admin token and "Nhớ trên máy này"; connects through `store.connect()`. */
export function ConnectPanel({ store = defaultStore }: ConnectPanelProps) {
  const conn = store.conn.value
  const count = store.catalog.value.length
  const checking = conn.state === 'checking'

  const setConn = (patch: Partial<DeployerStore['conn']['value']>) => {
    // Editing the address or code drops the "connected" state so the button comes back.
    store.conn.value = { ...store.conn.value, ...patch, ...(store.conn.value.state === 'ok' ? { state: 'idle' as const } : {}) }
  }

  return (
    <section aria-labelledby="connect-heading" class="card h-fit p-4 sm:p-5 lg:sticky lg:top-20">
      <h2 id="connect-heading" class="font-serif text-fluid-lg font-semibold">
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
            class="size-5 accent-accent"
            checked={conn.remember}
            onChange={(e) => setConn({ remember: e.currentTarget.checked })}
          />
          <label for="connect-remember">Nhớ trên máy này</label>
        </div>
        {conn.state !== 'ok' && (
        <button
          type="submit"
          disabled={checking}
          class="min-h-11 cursor-pointer rounded-full bg-accent px-4 text-fluid-base font-medium text-on-accent shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Kết nối
        </button>
        )}
      </form>
      <div class="mt-3 text-fluid-sm">
        {checking && <p class="text-ink-muted">Đang kiểm tra…</p>}
        {conn.state === 'ok' && <p class="flex items-center gap-2 font-medium text-ink"><span aria-hidden="true" class="size-2 rounded-full bg-accent" />{`Đã kết nối · ${count} truyện`}</p>}
        {conn.state === 'error' && (
          <p role="alert" class="rounded-lg bg-danger-soft px-3 py-2 text-danger">
            {conn.error}
          </p>
        )}
      </div>
    </section>
  )
}
