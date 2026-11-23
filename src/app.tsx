import type { ComponentType } from 'preact'
import { syncStatus } from './sync/sync-engine'
import { updateAvailable, applyUpdate } from './pwa'
import { route, type Route } from './router'
import type { DonateConfig } from './config'
import { Icon, IconButton, type IconName } from './ui/icons/Icon'
import { Toast } from './ui/Toast'
import { DonateBanner } from './ui/donate/DonateBanner'

export interface Pages {
  library: ComponentType
  reader: ComponentType<{ id: string }>
  settings: ComponentType
  request: ComponentType
}

const NAV: { href: string; label: string; icon: IconName; name: Route['name'] }[] = [
  { href: '#/', label: 'Thư viện', icon: 'library', name: 'library' },
  { href: '#/request', label: 'Yêu cầu', icon: 'request', name: 'request' },
  { href: '#/settings', label: 'Cài đặt', icon: 'settings', name: 'settings' },
]

export function SyncBadge() {
  const s = syncStatus.value
  const text = s.online
    ? s.pending
      ? `Đang đồng bộ ${s.pending}…`
      : 'Đã đồng bộ'
    : `Ngoại tuyến${s.pending ? ` · ${s.pending} chờ` : ''}`
  return (
    <span role="status" aria-label="Sync status" class="text-fluid-sm text-ink-muted">
      {text}
    </span>
  )
}

function NavLinks({ current, class: cls }: { current: Route['name']; class: string }) {
  return (
    <>
      {NAV.map((n) => {
        const active = n.name === current
        return (
          <a
            href={n.href}
            aria-current={active ? 'page' : undefined}
            class={`${cls} min-h-11 items-center gap-2 rounded-lg px-3 text-fluid-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${active ? 'bg-surface-2 font-semibold text-accent' : 'text-ink hover:bg-surface-2'}`}
          >
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </a>
        )
      })}
    </>
  )
}

export function App({ pages, donate = null }: { pages: Pages; donate?: DonateConfig | null }) {
  const r = route.value
  const showBanner = donate !== null

  if (r.name === 'read') {
    return (
      <>
        <pages.reader id={r.id} />
        <Toast />
      </>
    )
  }

  const Page = r.name === 'settings' ? pages.settings : r.name === 'request' ? pages.request : pages.library

  return (
    <div class="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <nav aria-label="Điều hướng chính" class="hidden lg:flex lg:flex-col lg:gap-1 lg:border-r lg:border-surface-2 lg:p-gutter">
        <NavLinks current={r.name} class="flex" />
      </nav>

      <div class="flex min-h-dvh flex-col">
        <header class="sticky top-0 z-10 flex items-center justify-between bg-surface/90 px-gutter pt-[env(safe-area-inset-top)] backdrop-blur">
          <h1 class="py-3 text-fluid-lg font-semibold">Tủ Truyện</h1>
          <SyncBadge />
        </header>

        <main class={`mx-auto w-full max-w-3xl flex-1 px-gutter ${showBanner ? 'pb-36' : 'pb-24'} lg:max-w-7xl lg:pb-8`}>
          <Page />
        </main>

        {updateAvailable.value && (
          <div role="alert" class={`fixed inset-x-gutter ${showBanner ? 'bottom-36' : 'bottom-20'} z-20 flex items-center justify-between gap-2 rounded-xl bg-ink p-3 text-surface ${showBanner ? 'lg:bottom-20' : 'lg:bottom-6'} lg:left-auto lg:w-96`}>
            <span class="text-fluid-sm">Có phiên bản mới</span>
            <IconButton icon="update" label="Cập nhật phiên bản mới" variant="primary" onClick={() => applyUpdate()} />
          </div>
        )}

        <Toast raised={showBanner} />

        <div class="fixed inset-x-0 bottom-0 z-10 lg:sticky lg:bottom-0 lg:inset-x-auto">
          <DonateBanner config={donate} />
          <nav aria-label="Thanh điều hướng" class="flex border-t border-surface-2 bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
            <NavLinks current={r.name} class="flex flex-1 flex-col justify-center" />
          </nav>
        </div>
      </div>
    </div>
  )
}
