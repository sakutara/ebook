import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/preact'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Icon, IconButton, IconTextButton, ICON_NAMES } from '../../src/ui/icons/Icon'

const SVG_DIR = resolve(process.cwd(), 'src/ui/icons/svg')

describe('icons', () => {
  it('app-shell.icons.icon-only: IconButton has an svg, no text, and aria-label equals title', () => {
    render(<IconButton icon="read" label="Đọc" />)
    const btn = screen.getByRole('button', { name: 'Đọc' })
    expect(btn.querySelector('svg')).not.toBeNull()
    expect(btn.textContent?.trim()).toBe('')
    expect(btn.getAttribute('aria-label')).toBe('Đọc')
    expect(btn.getAttribute('title')).toBe(btn.getAttribute('aria-label'))
    expect(btn.className).toContain('min-h-11')
    expect(btn.className).toContain('min-w-11')
  })

  it('app-shell.icons.labelled-exceptions: IconTextButton shows icon and text', () => {
    render(<IconTextButton icon="trash-all" label="Xoá" variant="danger" />)
    const btn = screen.getByRole('button', { name: 'Xoá' })
    expect(btn.querySelector('svg')).not.toBeNull()
    expect(btn.textContent?.trim()).toBe('Xoá')
    expect(btn.getAttribute('title')).toBeNull()
    expect(btn.getAttribute('aria-label')).toBeNull()
  })

  it('app-shell.icons.labelled-exceptions: radio IconTextButton exposes aria-checked and no aria-pressed', () => {
    render(<IconTextButton icon="filter-saved" label="Đã lưu" role="radio" checked />)
    const btn = screen.getByRole('radio', { name: 'Đã lưu' })
    expect(btn.getAttribute('aria-checked')).toBe('true')
    expect(btn.hasAttribute('aria-pressed')).toBe(false)
  })

  it('icons: every IconName has an svg file and every file is in ICON_NAMES', () => {
    const files = readdirSync(SVG_DIR)
      .filter((f) => f.endsWith('.svg'))
      .map((f) => f.replace(/\.svg$/, ''))
      .sort()
    expect([...ICON_NAMES].sort()).toEqual(files)
  })

  it('icons: every svg uses a 24x24 viewBox and currentColor stroke', () => {
    for (const f of readdirSync(SVG_DIR).filter((f) => f.endsWith('.svg'))) {
      const src = readFileSync(`${SVG_DIR}/${f}`, 'utf-8')
      expect(src, f).toContain('viewBox="0 0 24 24"')
      expect(src, f).toContain('stroke="currentColor"')
    }
  })

  it('icons: Icon renders an aria-hidden svg span', () => {
    const { container } = render(<Icon name="search" />)
    const span = container.querySelector('span')
    expect(span?.getAttribute('aria-hidden')).toBe('true')
    expect(span?.querySelector('svg')).not.toBeNull()
  })

  it('icons: pressed sets aria-pressed; disabled sets disabled; onClick fires', () => {
    const onClick = vi.fn()
    const { unmount } = render(
      <IconButton icon="theme-dark" label="Tối" pressed onClick={onClick} />,
    )
    const btn = screen.getByRole('button', { name: 'Tối' })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
    unmount()

    render(<IconButton icon="close" label="Đóng" disabled />)
    const off = screen.getByRole('button', { name: 'Đóng' }) as HTMLButtonElement
    expect(off.disabled).toBe(true)
    expect(off.hasAttribute('aria-pressed')).toBe(false)
  })
})
