import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/preact'
import { useState } from 'preact/hooks'
import { goBack, navigate, route } from '../../src/router'
import { useBackClose } from '../../src/ui/useBackClose'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  history.replaceState(null, '', '#/')
})

describe('app-shell.back', () => {
  it('app-shell.back: after navigate, goBack steps back in history instead of pushing the library', () => {
    history.replaceState(null, '', '#/')
    navigate('#/read/a')
    expect(route.value).toEqual({ name: 'read', id: 'a' })
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    const before = history.length
    goBack('#/')
    expect(back).toHaveBeenCalledTimes(1)
    expect(history.length).toBe(before)
  })

  it('app-shell.back: opened directly (no in-app entry), goBack replaces the entry with the library', () => {
    history.replaceState(null, '', '#/read/a')
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    const before = history.length
    goBack('#/')
    expect(back).not.toHaveBeenCalled()
    expect(location.hash).toBe('#/')
    expect(route.value).toEqual({ name: 'library' })
    expect(history.length).toBe(before)
  })

  it('app-shell.back: navigating while an overlay is open replaces the overlay entry', () => {
    history.replaceState({ overlay: true }, '', '#/')
    const before = history.length
    navigate('#/read/b')
    expect(history.length).toBe(before)
    expect(history.state).toEqual({ inApp: true })
  })
})

function Sheet() {
  const [open, setOpen] = useState(true)
  useBackClose(open, () => setOpen(false))
  return open ? <div role="dialog">sheet</div> : null
}

describe('app-shell.back.overlay', () => {
  it('app-shell.back.overlay: an open overlay pushes an entry and the back button closes it', () => {
    history.replaceState(null, '', '#/')
    const before = history.length
    const { queryByRole } = render(<Sheet />)
    expect(history.length).toBe(before + 1)
    expect(history.state).toMatchObject({ overlay: true })
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(queryByRole('dialog')).toBeNull()
  })
})
