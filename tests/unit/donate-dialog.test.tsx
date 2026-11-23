import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact'
import { DonateDialog } from '../../src/ui/donate/DonateDialog'
import { pngFileName } from '../../src/donate/qr-png'
import { toast } from '../../src/ui/toast-store'
import type { DonateConfig } from '../../src/config'

const cfg: DonateConfig = {
  bin: '970436',
  bankName: 'Vietcombank',
  accountNo: '0123456789',
  accountName: 'NGUYEN VAN A',
  note: 'donate token dich truyen',
}

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  toast.value = null
})

afterEach(() => {
  cleanup()
})

function payload(): string | null {
  return document.querySelector('[data-payload]')?.getAttribute('data-payload') ?? null
}

function renderDialog() {
  const onClose = vi.fn()
  const renderPng = vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
  const save = vi.fn()
  render(<DonateDialog config={cfg} onClose={onClose} renderPng={renderPng} save={save} />)
  return { onClose, renderPng, save }
}

function amountInput(): HTMLInputElement {
  return screen.getByLabelText('Số tiền tuỳ chọn') as HTMLInputElement
}

describe('DonateDialog', () => {
  it('donate.amount.preset: 20k is selected by default and the QR encodes 20000', () => {
    renderDialog()
    expect(screen.getByRole('radio', { name: '20k' })).toHaveAttribute('aria-checked', 'true')
    expect(payload()).toContain('540520000')
    expect(screen.getByText('20.000 ₫')).toBeInTheDocument()
  })

  it('donate.amount.preset: picking 50k regenerates the QR and caption shows 50.000 ₫', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('radio', { name: '50k' }))
    expect(screen.getByRole('radio', { name: '50k' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: '20k' })).toHaveAttribute('aria-checked', 'false')
    expect(payload()).toContain('540550000')
    expect(screen.getByText('50.000 ₫')).toBeInTheDocument()
  })

  it('donate.amount.custom: typing 35000 shows 35.000 and the QR encodes 35000', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('radio', { name: 'Tuỳ chọn' }))
    fireEvent.input(amountInput(), { target: { value: '35000' } })
    expect(amountInput().value).toBe('35.000')
    expect(payload()).toContain('540535000')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('donate.amount.custom: selecting Tuỳ chọn focuses the amount input', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('radio', { name: 'Tuỳ chọn' }))
    expect(document.activeElement).toBe(amountInput())
    expect(amountInput()).toHaveAttribute('placeholder', 'Nhập số tiền')
  })

  it('donate.amount.invalid: empty, below 1.000 or above 50.000.000 shows the hint, no QR, download disabled', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('radio', { name: 'Tuỳ chọn' }))
    const download = screen.getByRole('button', { name: 'Tải mã QR' })

    for (const value of ['', '500', '50000001']) {
      fireEvent.input(amountInput(), { target: { value } })
      expect(screen.getByRole('alert')).toHaveTextContent('Từ 1.000 đến 50.000.000 ₫')
      expect(payload()).toBeNull()
      expect(download).toBeDisabled()
    }

    fireEvent.input(amountInput(), { target: { value: '1000' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(payload()).toContain('54041000')
    expect(download).not.toBeDisabled()
  })

  it('donate.qr.copy: copy buttons write the account number and note and set the toast', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép số tài khoản' }))
    expect(writeText).toHaveBeenLastCalledWith('0123456789')
    await waitFor(() => expect(toast.value?.text).toBe('Đã sao chép số tài khoản'))

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép nội dung' }))
    expect(writeText).toHaveBeenLastCalledWith('donate token dich truyen')
    await waitFor(() => expect(toast.value?.text).toBe('Đã sao chép nội dung'))
  })

  it('donate.qr.copy: shows an error toast when the clipboard is denied', async () => {
    writeText.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép số tài khoản' }))
    await waitFor(() => expect(toast.value?.text).toBe('Không sao chép được'))
  })

  it('donate.dialog.close: focuses the close button on open', () => {
    renderDialog()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Đóng' }))
  })

  it('donate.qr.copy: bank name, account name, account number and note are visible', () => {
    renderDialog()
    expect(screen.getByText('Vietcombank')).toBeInTheDocument()
    expect(screen.getByText('NGUYEN VAN A')).toBeInTheDocument()
    expect(screen.getByText('0123456789')).toBeInTheDocument()
    expect(screen.getByText('donate token dich truyen')).toBeInTheDocument()
  })

  it('donate.download.png: renders the PNG for 50000 and saves it as ung-ho-50000.png', async () => {
    const { renderPng, save } = renderDialog()
    fireEvent.click(screen.getByRole('radio', { name: '50k' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tải mã QR' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(renderPng).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 50000, cfg, payload: expect.stringContaining('540550000') }),
    )
    const [blob, name] = save.mock.calls[0]
    expect(blob).toBeInstanceOf(Blob)
    expect(name).toBe('ung-ho-50000.png')
  })

  it('donate.download.png: pngFileName names the file by amount', () => {
    expect(pngFileName(50000)).toBe('ung-ho-50000.png')
  })

  it('donate.dialog.close: close button, Escape and backdrop each call onClose', () => {
    const { onClose } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)

    fireEvent.click(document.querySelector('[data-backdrop]') as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
