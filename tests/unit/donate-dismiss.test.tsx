import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/preact'
import { DonateBanner, donateHidden, HIDE_MS } from '../../src/ui/donate/DonateBanner'

const CONFIG = { bank: 'VCB', account: '0123456789', accountName: 'A', note: 'x' } as never

beforeEach(() => {
  localStorage.clear()
  donateHidden.value = false
})
afterEach(() => cleanup())

describe('donate.banner.dismiss', () => {
  it('donate.banner.dismiss: the close button hides the banner and remembers it for 7 days', () => {
    const { container } = render(<DonateBanner config={CONFIG} />)
    expect(container.querySelector('[data-banner]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Ẩn lời nhắn ủng hộ 7 ngày' }))

    expect(container.querySelector('[data-banner]')).toBeNull()
    const until = Number(localStorage.getItem('donate.hiddenUntil'))
    expect(until - Date.now()).toBeGreaterThan(HIDE_MS - 60_000)
  })

  it('donate.banner.dismiss: a stored hide that is still in the future keeps the banner away on load', () => {
    localStorage.setItem('donate.hiddenUntil', String(Date.now() + HIDE_MS))
    donateHidden.value = Number(localStorage.getItem('donate.hiddenUntil')) > Date.now()
    const { container } = render(<DonateBanner config={CONFIG} />)
    expect(container.querySelector('[data-banner]')).toBeNull()
  })
})
