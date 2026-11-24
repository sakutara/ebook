import { useState } from 'preact/hooks'
import type { AppDB, StoryRequest } from '../../db/db'
import type { RequestFormConfig } from '../../config'
import { REQUEST_LANGUAGE_OPTIONS } from '../../domain/request-languages'
import { lacksDiacritics, normalizeRequestText } from '../../domain/request-text'
import { normalize } from '../../domain/title'
import { checkRequest, getRequest, listRequests, submitRequest } from '../../requests/request-repo'
import { navigate } from '../../router'
import { IconTextButton } from '../icons/Icon'
import { query } from '../library/library-state'
import { useLiveQuery } from '../useLiveQuery'
import { showToast } from '../toast-store'

export interface RequestPageProps {
  db: AppDB
  formConfig: RequestFormConfig | null
  flush: () => Promise<void>
}

interface Message {
  text: string
  bookTitle?: string
}

const NO_ACCENT = 'Tên truyện chưa có dấu — hãy gõ tiếng Việt có dấu'
const INPUT =
  'field py-2 text-fluid-base'

export function RequestPage({ db, formConfig, flush }: RequestPageProps) {
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [originalTitle, setOriginalTitle] = useState('')
  const [language, setLanguage] = useState('')
  const [confirmedNoAccent, setConfirmedNoAccent] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const requests = useLiveQuery(() => listRequests(db), [db], [] as StoryRequest[])

  const previewTitle = normalizeRequestText(title)
  const previewAuthor = normalizeRequestText(author)
  const hasPreview = normalize(previewTitle) !== ''

  async function onSubmit(): Promise<void> {
    if (formConfig === null) return
    const input = { title, author, originalTitle, language }
    const checked = await checkRequest(db, input)
    if (checked.kind === 'empty') {
      setMessage({ text: 'Nhập tên truyện' })
      return
    }
    if (checked.kind === 'duplicate') {
      setMessage({ text: 'Bạn đã yêu cầu truyện này' })
      return
    }
    if (checked.kind === 'in-library') {
      setMessage({ text: 'Truyện đã có trong thư viện', bookTitle: checked.bookTitle })
      return
    }
    if (!confirmedNoAccent && lacksDiacritics(checked.title)) {
      setConfirmedNoAccent(true)
      setMessage({ text: NO_ACCENT })
      return
    }

    const result = await submitRequest(db, input)
    if (result.kind !== 'saved') {
      // Raced with another save between the check and the transaction.
      setMessage({ text: result.kind === 'duplicate' ? 'Bạn đã yêu cầu truyện này' : 'Truyện đã có trong thư viện' })
      return
    }

    setTitle('')
    setAuthor('')
    setOriginalTitle('')
    setLanguage('')
    setConfirmedNoAccent(false)
    setMessage(null)
    if (navigator.onLine) {
      try {
        await flush()
      } catch {
        // The row stays unsent; the re-read below reports it as pending.
      }
    }
    const row = await getRequest(db, result.request.id)
    if (row?.sentAt) showToast('Đã gửi yêu cầu')
    else if (!navigator.onLine) showToast('Đã lưu, sẽ gửi khi có mạng')
    else showToast('Đã lưu, sẽ thử gửi lại')
  }

  return (
    <div class="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,40rem)_minmax(0,1fr)] xl:items-start">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void onSubmit()
        }}
        class="card flex w-full flex-col gap-4 p-4 sm:p-5"
      >
        {formConfig === null && (
          <p role="status" class="text-fluid-sm">
            Chưa cấu hình Google Form
          </p>
        )}

        <div class="flex flex-col gap-1">
          <label for="request-title" class="text-fluid-sm font-semibold">
            Tên truyện
          </label>
          <input
            id="request-title"
            type="text"
            required
            aria-required="true"
            maxLength={200}
            value={title}
            class={INPUT}
            onInput={(e) => {
              setTitle(e.currentTarget.value)
              setConfirmedNoAccent(false)
              setMessage(null)
            }}
          />
        </div>

        <div class="flex flex-col gap-1">
          <label for="request-author" class="text-fluid-sm font-semibold">
            Tác giả (tùy chọn)
          </label>
          <input
            id="request-author"
            type="text"
            maxLength={100}
            value={author}
            class={INPUT}
            onInput={(e) => setAuthor(e.currentTarget.value)}
          />
        </div>

        <div class="flex flex-col gap-1">
          <label for="request-original-title" class="text-fluid-sm font-semibold">
            Tên gốc (tùy chọn)
          </label>
          <input
            id="request-original-title"
            type="text"
            maxLength={200}
            value={originalTitle}
            class={INPUT}
            onInput={(e) => setOriginalTitle(e.currentTarget.value)}
          />
        </div>

        <div class="flex flex-col gap-1">
          <label for="request-language" class="text-fluid-sm font-semibold">
            Ngôn ngữ (tùy chọn)
          </label>
          <select
            id="request-language"
            value={language}
            class={INPUT}
            onChange={(e) => setLanguage(e.currentTarget.value)}
          >
            <option value="">Chọn ngôn ngữ</option>
            {REQUEST_LANGUAGE_OPTIONS.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        {hasPreview && (
          <p aria-live="polite" class="text-fluid-sm text-ink/70">
            {`Sẽ gửi: ${previewTitle}${previewAuthor ? ` — ${previewAuthor}` : ''}`}
          </p>
        )}

        {message !== null && (
          <div role="alert" class="flex flex-col gap-2 text-fluid-sm">
            <p>{message.text}</p>
            {message.bookTitle !== undefined && (
              <a
                href="#/"
                class="inline-flex min-h-11 items-center underline"
                onClick={(e) => {
                  e.preventDefault()
                  query.value = message.bookTitle ?? ''
                  navigate('#/')
                }}
              >
                Xem trong thư viện
              </a>
            )}
          </div>
        )}

        <IconTextButton
          type="submit"
          icon="send"
          label="Gửi yêu cầu"
          variant="primary"
          disabled={formConfig === null}
          class="self-end"
        />
      </form>

      <section aria-label="Đã yêu cầu" class="flex flex-col gap-3">
        <h2 class="text-fluid-lg font-semibold">Đã yêu cầu</h2>
        <ul class="flex flex-col divide-y divide-surface-2">
          {requests.map((r) => (
            <li key={r.id} class="flex items-center justify-between gap-2 py-2">
              <div class="min-w-0">
                <p class="truncate text-fluid-base">{r.title}</p>
                {r.author !== '' && <p class="text-fluid-sm text-ink/70">{r.author}</p>}
              </div>
              <span class="shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-fluid-sm">
                {r.sentAt === null ? 'Chờ gửi' : 'Đã gửi'}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
