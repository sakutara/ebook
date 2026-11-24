import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/preact'
import { DonateBanner } from '../../src/ui/donate/DonateBanner'

const CONFIG = { bin: '970436', bankName: 'Vietcombank', accountNo: '0123456789', accountName: 'A', note: 'x' }

afterEach(() => cleanup())

describe('donate.banner.permanent', () => {
  it('donate.banner.permanent: the banner has no close or hide control', () => {
    const { container } = render(<DonateBanner config={CONFIG} />)
    const banner = container.querySelector('[data-banner]')!
    expect(banner).not.toBeNull()
    const buttons = Array.from(banner.querySelectorAll('button'))
    expect(buttons).toHaveLength(1)
    expect(buttons[0].textContent?.trim()).toBe('Ủng hộ')
    expect(screen.queryByRole('button', { name: /ẩn|đóng/i })).toBeNull()
  })

  it('donate.banner.permanent: with a config the banner renders on every mount, nothing is remembered', () => {
    localStorage.setItem('donate.hiddenUntil', String(Date.now() + 1e9))
    const { container } = render(<DonateBanner config={CONFIG} />)
    expect(container.querySelector('[data-banner]')).not.toBeNull()
    localStorage.removeItem('donate.hiddenUntil')
  })

  it('donate.banner.permanent: without a config nothing renders', () => {
    const { container } = render(<DonateBanner config={null} />)
    expect(container.querySelector('[data-banner]')).toBeNull()
  })
})
