import { useEffect, useRef, useState } from 'preact/hooks'
import type { DonateConfig } from '../../config'
import { buildVietQr, formatVnd, parseAmount, PRESETS } from '../../donate/vietqr'
import { qrSvg } from '../../donate/qr-matrix'
import { pngFileName, renderQrPng, saveBlob } from '../../donate/qr-png'
import { IconButton, IconTextButton } from '../icons/Icon'
import { showToast } from '../toast-store'

type Choice = number | 'custom'

const HINT = 'Từ 1.000 đến 50.000.000 ₫'

/** Keeps digits only and re-formats with '.' thousands separators. */
function formatInput(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits === '' ? '' : formatVnd(Number(digits))
}

export interface DonateDialogProps {
  config: DonateConfig
  onClose: () => void
  renderPng?: typeof renderQrPng
  save?: typeof saveBlob
}

export function DonateDialog(p: DonateDialogProps) {
  const { config, onClose } = p
  const renderPng = p.renderPng ?? renderQrPng
  const save = p.save ?? saveBlob
  const [choice, setChoice] = useState<Choice>(20000)
  const [custom, setCustom] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLButtonElement>('button[aria-label="Đóng"]')?.focus()
  }, [])

  useEffect(() => {
    if (choice === 'custom') amountRef.current?.focus()
  }, [choice])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const amount = choice === 'custom' ? parseAmount(custom) : choice
  const payload =
    amount === null
      ? null
      : buildVietQr({ bin: config.bin, accountNo: config.accountNo, amount, note: config.note })

  async function onDownload() {
    if (amount === null || payload === null) return
    const blob = await renderPng({ payload, amount, cfg: config })
    save(blob, pngFileName(amount))
  }

  function copy(text: string, done: string) {
    navigator.clipboard.writeText(text).then(
      () => showToast(done),
      () => showToast('Không sao chép được'),
    )
  }

  const choices: Choice[] = [...PRESETS, 'custom']

  return (
    <>
      <div data-backdrop class="fixed inset-0 bg-black/40" onClick={onClose} />
      <dialog
        ref={dialogRef}
        open
        role="dialog"
        aria-modal="true"
        aria-labelledby="donate-dialog-title"
        class="fixed inset-0 m-auto max-h-[90dvh] w-[min(92vw,26rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-float"
      >
        <div class="flex items-start justify-between gap-2">
          <h2 id="donate-dialog-title" class="text-fluid-lg font-semibold">
            Ủng hộ token dịch truyện
          </h2>
          <IconButton icon="close" label="Đóng" onClick={onClose} />
        </div>

        <div role="radiogroup" aria-label="Số tiền" class="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {choices.map((c) => {
            const label = c === 'custom' ? 'Tuỳ chọn' : `${c / 1000}k`
            const checked = c === choice
            return (
              <button
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => setChoice(c)}
                class={`min-h-11 rounded-xl border px-2 text-fluid-sm transition-colors ${
                  checked ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-ink hover:border-ink-muted'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {choice === 'custom' && (
          <div class="mt-3">
            <input
              ref={amountRef}
              type="text"
              inputMode="numeric"
              placeholder="Nhập số tiền"
              aria-label="Số tiền tuỳ chọn"
              value={custom}
              onInput={(e) => setCustom(formatInput(e.currentTarget.value))}
              class="field text-fluid-base"
            />
            {amount === null && (
              <p role="alert" class="mt-1 text-fluid-sm text-ink-muted">
                {HINT}
              </p>
            )}
          </div>
        )}

        {amount !== null && payload !== null && (
          <div class="mt-4 flex flex-col items-center">
            <div
              role="img"
              aria-label="Mã QR chuyển khoản"
              data-payload={payload}
              class="w-[min(70vw,18rem)] rounded-xl bg-white p-3 text-black [&>svg]:size-full"
              dangerouslySetInnerHTML={{ __html: qrSvg(payload) }}
            />
            <p class="mt-2 text-fluid-lg font-semibold">{formatVnd(amount)} ₫</p>
          </div>
        )}

        <dl class="mt-4 divide-y divide-surface-2 text-fluid-sm">
          <div class="flex items-center justify-between gap-2 py-1">
            <dt class="text-ink-muted">Ngân hàng</dt>
            <dd class="text-right">{config.bankName}</dd>
          </div>
          <div class="flex items-center justify-between gap-2 py-1">
            <dt class="text-ink-muted">Chủ tài khoản</dt>
            <dd class="text-right">{config.accountName}</dd>
          </div>
          <div class="flex items-center justify-between gap-2 py-1">
            <dt class="text-ink-muted">Số tài khoản</dt>
            <dd class="flex items-center gap-1">
              <span>{config.accountNo}</span>
              <IconButton
                icon="copy"
                label="Sao chép số tài khoản"
                onClick={() => copy(config.accountNo, 'Đã sao chép số tài khoản')}
              />
            </dd>
          </div>
          <div class="flex items-center justify-between gap-2 py-1">
            <dt class="text-ink-muted">Nội dung</dt>
            <dd class="flex items-center gap-1">
              <span class="text-right">{config.note}</span>
              <IconButton icon="copy" label="Sao chép nội dung" onClick={() => copy(config.note, 'Đã sao chép nội dung')} />
            </dd>
          </div>
        </dl>

        <IconTextButton
          icon="download"
          label="Tải mã QR"
          variant="primary"
          class="mt-4 w-full"
          disabled={payload === null}
          onClick={() => void onDownload()}
        />
      </dialog>
    </>
  )
}
