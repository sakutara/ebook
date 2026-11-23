import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/preact'
import { ProgressBar } from '../../src/ui/ProgressBar'

afterEach(() => {
  cleanup()
})

describe('library.progress', () => {
  it('library.progress.shown: determinate bar exposes aria-valuenow and "Đang tải 25%"', () => {
    render(<ProgressBar percent={25} />)

    const bar = screen.getByRole('progressbar', { name: 'Đang tải truyện' })
    expect(bar.getAttribute('aria-valuenow')).toBe('25')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
    expect(screen.getByText('Đang tải 25%')).toBeInTheDocument()
  })

  it('library.progress.shown: inner fill width follows the percent', () => {
    render(<ProgressBar percent={25} />)

    const fill = screen.getByRole('progressbar').firstElementChild as HTMLElement
    expect(fill.getAttribute('style')).toContain('width: 25%')
    expect(fill.className).not.toContain('animate-')
  })

  it('library.progress.indeterminate: null percent has no aria-valuenow and shows "Đang tải…"', () => {
    render(<ProgressBar percent={null} />)

    const bar = screen.getByRole('progressbar', { name: 'Đang tải truyện' })
    expect(bar.hasAttribute('aria-valuenow')).toBe(false)
    expect(screen.getByText('Đang tải…')).toBeInTheDocument()
  })

  it('library.progress.indeterminate: null percent animates a sliding fill that respects reduced motion', () => {
    render(<ProgressBar percent={null} />)

    const fill = screen.getByRole('progressbar').firstElementChild as HTMLElement
    expect(fill.className).toContain('animate-[progress-indeterminate_1.2s_ease-in-out_infinite]')
    expect(fill.className).toContain('motion-reduce:animate-none')
  })

  it('library.progress.shown: custom label replaces the default aria-label', () => {
    render(<ProgressBar percent={0} label="Đang tải Dấu Phá" />)

    expect(screen.getByRole('progressbar', { name: 'Đang tải Dấu Phá' })).toBeInTheDocument()
    expect(screen.getByText('Đang tải 0%')).toBeInTheDocument()
  })
})
