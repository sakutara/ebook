import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/preact'
import { ConnectPanel } from '../../deployer/src/ui/ConnectPanel'
import { AdminError } from '../../deployer/src/admin-client'
import { BASE, fakeWorker, makeStore, memoryStorage, metadata } from './ui-fakes'

afterEach(() => cleanup())

describe('ConnectPanel', () => {
  it('deployer.connect.labels: each field is named by its label and linked with for/id', () => {
    const store = makeStore(fakeWorker())
    render(<ConnectPanel store={store} />)

    const url = screen.getByRole('textbox', { name: 'Địa chỉ Worker' })
    expect(url).toHaveValue(BASE)
    expect(document.querySelector(`label[for="${url.id}"]`)).toHaveTextContent('Địa chỉ Worker')

    const token = screen.getByLabelText('Mã quản trị')
    expect(token.tagName).toBe('INPUT')
    expect(token).toHaveAttribute('type', 'password')
    expect(document.querySelector(`label[for="${token.id}"]`)).toHaveTextContent('Mã quản trị')

    const remember = screen.getByRole('checkbox', { name: 'Nhớ trên máy này' })
    expect(document.querySelector(`label[for="${remember.id}"]`)).toHaveTextContent('Nhớ trên máy này')
  })

  it('deployer.connect.ok: shows "Đã kết nối" and the number of books in catalog.json', async () => {
    const worker = fakeWorker({ books: [metadata('a'), metadata('b')] })
    const store = makeStore(worker)
    render(<ConnectPanel store={store} />)

    expect(screen.getByLabelText('Địa chỉ Worker')).toHaveValue(BASE)
    fireEvent.input(screen.getByLabelText('Mã quản trị'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối' }))

    expect(await screen.findByText('Đã kết nối · 2 truyện')).toBeInTheDocument()
    expect(store.conn.value.state).toBe('ok')
  })

  it('deployer.connect.bad-token: shows "Sai mã quản trị" and leaves the store not connected', async () => {
    const worker = fakeWorker({ checkError: new AdminError('auth', 401) })
    const store = makeStore(worker)
    render(<ConnectPanel store={store} />)

    fireEvent.input(screen.getByLabelText('Mã quản trị'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sai mã quản trị')
    expect(store.conn.value.state).toBe('error')
  })

  it('deployer.connect.forget: the token is kept only when "Nhớ trên máy này" is ticked', async () => {
    const worker = fakeWorker({ books: [] })
    const storage = memoryStorage()

    const first = makeStore(worker, { storage })
    const { unmount } = render(<ConnectPanel store={first} />)
    fireEvent.input(screen.getByLabelText('Mã quản trị'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối' }))
    await screen.findByText('Đã kết nối · 0 truyện')
    expect(storage.has('deployer.token')).toBe(false)
    unmount()

    // "Reload": a new store over the same storage must start with an empty token field.
    const reloaded = makeStore(worker, { storage })
    render(<ConnectPanel store={reloaded} />)
    expect(screen.getByLabelText('Mã quản trị')).toHaveValue('')
    cleanup()

    // With the box ticked, the token is remembered.
    const remembering = makeStore(worker, { storage })
    render(<ConnectPanel store={remembering} />)
    fireEvent.input(screen.getByLabelText('Mã quản trị'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByLabelText('Nhớ trên máy này'))
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối' }))
    await screen.findByText('Đã kết nối · 0 truyện')
    expect(storage.has('deployer.token')).toBe(true)
  })
})
