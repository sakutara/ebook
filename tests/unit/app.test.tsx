import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/preact'
import type { ComponentType } from 'preact'
import { App, type Pages } from '../../src/app'
import type { DonateConfig } from '../../src/config'
import { parseHash, route, startRouter, navigate, type Route } from '../../src/router'
import { useLiveQuery } from '../../src/ui/useLiveQuery'
import { toast, showToast } from '../../src/ui/toast-store'
import { Toast } from '../../src/ui/Toast'
import { updateAvailable } from '../../src/pwa'
import { createServices, getServices } from '../../src/services'
import { AppDB, type Book } from '../../src/db/db'

const fakePages: Pages = {
  library: (() => <div data-testid="lib">lib</div>) as ComponentType,
  reader: ((p: { id: string }) => <div data-testid="reader">{p.id}</div>) as ComponentType<{ id: string }>,
  settings: (() => <div data-testid="settings">settings</div>) as ComponentType,
  request: (() => <div data-testid="request">request</div>) as ComponentType,
}

const donateCfg: DonateConfig = {
  bin: '970436',
  bankName: 'Vietcombank',
  accountNo: '0123456789',
  accountName: 'NGUYEN VAN A',
  note: 'ung ho',
}

const BANNER_TEXT = 'Ủng hộ token dịch truyện'

beforeEach(() => {
  route.value = { name: 'library' }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  toast.value = null
  updateAvailable.value = false
})

describe('app-shell', () => {
  it('app-shell.routes.reader-fullscreen: the reader route renders without any navigation', () => {
    route.value = { name: 'read', id: 'a' }
    render(<App pages={fakePages} />)
    expect(screen.queryAllByRole('navigation')).toHaveLength(0)
    expect(screen.getByTestId('reader').textContent).toBe('a')
    expect(screen.queryByTestId('lib')).toBeNull()
  })

  it('app-shell.icons.labelled-exceptions: nav links show icon and Vietnamese text', () => {
    render(<App pages={fakePages} />)
    for (const name of ['Thư viện', 'Cài đặt']) {
      const links = screen.getAllByRole('link', { name })
      expect(links.length).toBeGreaterThan(0)
      for (const link of links) expect(link.querySelector('svg')).not.toBeNull()
    }
    const libLinks = screen.getAllByRole('link', { name: 'Thư viện' })
    for (const link of libLinks) expect(link.getAttribute('aria-current')).toBe('page')
    expect(screen.getByTestId('lib')).toBeTruthy()
  })

  it('app: update toast shows an icon button named "Cập nhật phiên bản mới" when an update is available', () => {
    updateAvailable.value = true
    render(<App pages={fakePages} />)
    const btn = screen.getByRole('button', { name: 'Cập nhật phiên bản mới' })
    expect(btn.querySelector('svg')).not.toBeNull()
    expect(screen.getByText('Có phiên bản mới')).toBeTruthy()
  })
})

describe('donate banner and request route', () => {
  it('donate.banner.shown: text and Ủng hộ button show on library, settings and request routes', () => {
    const routes: Route[] = [{ name: 'library' }, { name: 'settings' }, { name: 'request' }]
    for (const r of routes) {
      route.value = r
      const { unmount } = render(<App pages={fakePages} donate={donateCfg} />)
      expect(screen.getByText(BANNER_TEXT)).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Ủng hộ' }).querySelector('svg')).not.toBeNull()
      expect(document.querySelector('[data-banner]')).not.toBeNull()
      unmount()
    }
  })

  it('donate.banner.reader-hidden: the banner is not rendered on the reader route', () => {
    route.value = { name: 'read', id: 'a' }
    render(<App pages={fakePages} donate={donateCfg} />)
    expect(document.querySelector('[data-banner]')).toBeNull()
    expect(screen.queryByText(BANNER_TEXT)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ủng hộ' })).toBeNull()
  })

  it('donate.banner.config-missing: no banner when donate is null or absent on any screen', () => {
    const routes: Route[] = [{ name: 'library' }, { name: 'settings' }, { name: 'request' }]
    for (const r of routes) {
      route.value = r
      const { unmount: u1 } = render(<App pages={fakePages} donate={null} />)
      expect(document.querySelector('[data-banner]')).toBeNull()
      expect(screen.queryByText(BANNER_TEXT)).toBeNull()
      u1()
      const { unmount: u2 } = render(<App pages={fakePages} />)
      expect(document.querySelector('[data-banner]')).toBeNull()
      u2()
    }
  })

  it('donate.banner.shown: clicking Ủng hộ opens the dialog and closing returns focus to the button', () => {
    render(<App pages={fakePages} donate={donateCfg} />)
    const btn = screen.getByRole('button', { name: 'Ủng hộ' })
    fireEvent.click(btn)
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ủng hộ' }))
  })

  it('donate.layout.narrow: toast sits above the banner when the banner is shown, and at the default offset without it', () => {
    toast.value = { id: 1, text: 'Đã lưu' }
    const { unmount } = render(<App pages={fakePages} donate={donateCfg} />)
    const withBanner = document.querySelector('[role="status"][aria-live="polite"]')!
    expect(withBanner.classList.contains('bottom-36')).toBe(true)
    expect(withBanner.classList.contains('bottom-20')).toBe(false)
    unmount()

    render(<App pages={fakePages} donate={null} />)
    const withoutBanner = document.querySelector('[role="status"][aria-live="polite"]')!
    expect(withoutBanner.classList.contains('bottom-20')).toBe(true)
    expect(withoutBanner.classList.contains('bottom-36')).toBe(false)
  })

  it('donate.banner.shown: main reserves pb-36 with the banner and pb-24 without', () => {
    const { unmount } = render(<App pages={fakePages} donate={donateCfg} />)
    expect(document.querySelector('main')!.className).toContain('pb-36')
    expect(document.querySelector('main')!.className).not.toContain('pb-24')
    unmount()
    render(<App pages={fakePages} donate={null} />)
    expect(document.querySelector('main')!.className).toContain('pb-24')
    expect(document.querySelector('main')!.className).not.toContain('pb-36')
  })

  it('donate.banner.shown: update alert sits above the banner', () => {
    updateAvailable.value = true
    render(<App pages={fakePages} donate={donateCfg} />)
    const alert = screen.getByRole('alert')
    expect(alert.className).toContain('bottom-36')
    expect(alert.classList.contains('lg:bottom-20')).toBe(true)
    expect(alert.classList.contains('bottom-20')).toBe(false)
    expect(alert.classList.contains('lg:bottom-6')).toBe(false)
  })
})

describe('request route', () => {
  it('app-shell.routes.request: nav order is Thư viện, Yêu cầu, Cài đặt and #/request is aria-current', () => {
    route.value = { name: 'request' }
    render(<App pages={fakePages} />)
    const nav = screen.getByRole('navigation', { name: 'Thanh điều hướng' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => a.textContent?.trim())).toEqual(['Thư viện', 'Yêu cầu', 'Cài đặt'])
    expect(links[1].getAttribute('href')).toBe('#/request')
    expect(links[1].getAttribute('aria-current')).toBe('page')
    expect(links[0].getAttribute('aria-current')).toBeNull()
    expect(screen.getByTestId('request')).toBeTruthy()
  })

  it('app-shell.routes.request: the request page renders for #/request', () => {
    route.value = { name: 'request' }
    render(<App pages={fakePages} />)
    expect(screen.getByTestId('request').textContent).toBe('request')
    expect(screen.queryByTestId('lib')).toBeNull()
  })
})

describe('router', () => {
  it('app-shell.routes.request: parseHash maps #/request to the request route', () => {
    expect(parseHash('#/request')).toEqual({ name: 'request' })
  })

  it('router: parseHash handles library, settings, read and unknown', () => {
    expect(parseHash('#/')).toEqual({ name: 'library' })
    expect(parseHash('')).toEqual({ name: 'library' })
    expect(parseHash('#/settings')).toEqual({ name: 'settings' })
    expect(parseHash('#/read/abc-1')).toEqual({ name: 'read', id: 'abc-1' })
    expect(parseHash('#/read/a%20b')).toEqual({ name: 'read', id: 'a b' })
    expect(parseHash('#/nope/x')).toEqual({ name: 'library' })
  })

  it('router: hashchange updates the route', () => {
    const stop = startRouter()
    try {
      window.location.hash = '#/read/b'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
      expect(route.value).toEqual({ name: 'read', id: 'b' })
      window.location.hash = '#/settings'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
      expect(route.value).toEqual({ name: 'settings' })
    } finally {
      stop()
    }
  })

  it('router: navigate sets location.hash', () => {
    navigate('#/settings')
    expect(window.location.hash).toBe('#/settings')
  })
})

describe('toast', () => {
  it('toast: showToast shows the text and clears after the timeout', () => {
    vi.useFakeTimers()
    render(<Toast />)
    expect(screen.queryByRole('status')).toBeNull()
    act(() => showToast('Đã lưu', 4000))
    expect(screen.getByRole('status').textContent).toContain('Đã lưu')
    act(() => vi.advanceTimersByTime(3999))
    expect(screen.getByText('Đã lưu')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('Đã lưu')).toBeNull()
  })

  it('toast: a newer toast is not cleared by the older timer', () => {
    vi.useFakeTimers()
    render(<Toast />)
    act(() => showToast('cũ', 1000))
    act(() => showToast('mới', 4000))
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByText('mới')).toBeTruthy()
    expect(screen.queryByText('cũ')).toBeNull()
  })

  it('toast: close button dismisses the toast', () => {
    render(<Toast />)
    act(() => showToast('Xong', 4000))
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    expect(screen.queryByText('Xong')).toBeNull()
  })
})

describe('services', () => {
  it('services: getServices returns null api when config is missing', () => {
    vi.stubEnv('VITE_GD_API_KEY', '')
    vi.stubEnv('VITE_GD_FOLDER_ID', '')
    const db = new AppDB('svc-test-' + Math.random())
    const s = createServices(db)
    expect(s.config).toBeNull()
    expect(s.api).toBeNull()
    expect(s.cacheDeps.db).toBe(db)
    expect(s.cacheDeps.api).toBeNull()
    expect(typeof s.catalogSync.sync).toBe('function')
    expect(getServices()).toBe(getServices())
  })
})

describe('useLiveQuery', () => {
  it('useLiveQuery: re-renders when the table changes', async () => {
    const db = new AppDB('live-test-' + Math.random())
    function Count() {
      const n = useLiveQuery(() => db.books.count(), [], 0)
      return <p>Số sách: {n}</p>
    }
    render(<Count />)
    expect(await screen.findByText('Số sách: 0')).toBeTruthy()
    const book: Book = {
      id: crypto.randomUUID(),
      name: 'a.epub',
      title: 'A',
      normTitle: 'a',
      size: 1,
      modifiedTime: 1,
      md5: 'x',
      inDrive: 1,
      lastSeenAt: 1,
      updatedAt: 1,
    }
    await db.books.add(book)
    expect(await screen.findByText('Số sách: 1')).toBeTruthy()
    db.close()
  })
})
