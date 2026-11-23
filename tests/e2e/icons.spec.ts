import { test, expect, type Page } from '@playwright/test'
import { makeLibrary, mockR2 } from './r2-mock'
import { backToLibrary, bookCard, frameStyle, marker, openBook, openFromLibrary, showChrome } from './reader-helpers'

const READER_BOOK = { id: 'sach-mau', title: 'Sách Mẫu', fixture: 'book-v1.epub' }
const FILES = [...makeLibrary(3), READER_BOOK]
const DARK_BG = 'rgb(17, 24, 39)'

interface Audit {
  audited: number
  offenders: string[]
}

/**
 * Runs in the page. Every visible button outside the labelled exceptions (nav, radiogroup, dialog,
 * TOC list entries) must be icon-only: an svg, empty innerText, and aria-label equal to a non-empty title.
 * Self-contained on purpose: it is serialized into the page.
 */
function auditIconOnlyButtons(): Audit {
  const excluded = 'nav, [role="radiogroup"], dialog, [data-banner], form'
  const tocList = '[aria-label="Mục lục"] ul'
  const offenders: string[] = []
  let audited = 0
  for (const el of Array.from(document.querySelectorAll('button'))) {
    const b = el as HTMLElement
    if (b.offsetParent === null) continue
    if (b.closest(excluded) || b.closest(tocList)) continue
    audited++
    const reasons: string[] = []
    if (!b.querySelector('svg')) reasons.push('no svg')
    const text = b.innerText.trim()
    if (text !== '') reasons.push(`has text "${text}"`)
    const label = b.getAttribute('aria-label') ?? ''
    if (label === '') reasons.push('empty or missing aria-label')
    else if (label !== b.getAttribute('title')) reasons.push('aria-label differs from title')
    if (reasons.length > 0) offenders.push(`[${reasons.join('; ')}] ${b.outerHTML.slice(0, 240)}`)
  }
  return { audited, offenders }
}

/**
 * Runs in the page. Icon-only buttons inside the given scope must be at least 44x44 px, and two
 * buttons sharing a parent and a row must be at least 8 px apart.
 */
function layoutProblems(scopeSelector: string): string[] {
  const problems: string[] = []
  const buttons = Array.from(document.querySelectorAll(scopeSelector))
    .flatMap((s) => Array.from(s.querySelectorAll('button')))
    .filter((b) => {
      const el = b as HTMLElement
      return el.offsetParent !== null && el.querySelector('svg') !== null && el.innerText.trim() === ''
    })

  for (const b of buttons) {
    const r = b.getBoundingClientRect()
    if (r.width < 44 || r.height < 44) {
      problems.push(`small ${Math.round(r.width)}x${Math.round(r.height)}: ${b.outerHTML.slice(0, 200)}`)
    }
  }

  const groups = new Map<Element, Element[]>()
  for (const b of buttons) {
    const parent = b.parentElement
    if (!parent) continue
    groups.set(parent, [...(groups.get(parent) ?? []), b])
  }
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i].getBoundingClientRect()
      const b = sorted[i + 1].getBoundingClientRect()
      const sameRow = a.top < b.bottom && b.top < a.bottom
      if (sameRow && b.left - a.right < 8) {
        problems.push(`gap ${Math.round(b.left - a.right)}px: ${sorted[i + 1].outerHTML.slice(0, 200)}`)
      }
    }
  }
  return problems
}

async function expectIconOnly(page: Page, screen: string): Promise<void> {
  const { audited, offenders } = await page.evaluate(auditIconOnlyButtons)
  expect(audited, `${screen}: no icon-only buttons were audited`).toBeGreaterThan(0)
  expect(offenders, `${screen}: ${offenders.length} icon-only violation(s)\n${offenders.join('\n')}`).toEqual([])
}

/** Caches the reader book by opening it, then lands on the settings page. */
async function cacheBookAndOpenSettings(page: Page): Promise<void> {
  await openFromLibrary(page)
  await expect.poll(() => marker(page)).not.toBeNull()
  await backToLibrary(page)
  await page.locator('nav a', { hasText: 'Cài đặt' }).filter({ visible: true }).click()
  await expect(page).toHaveURL(/#\/settings$/)
}

test('app-shell.icons.icon-only: library, reader sheet and settings action buttons carry no visible text', async ({ page, context }) => {
  await mockR2(context, { books: FILES })
  await page.goto('./')
  await expect(bookCard(page)).toBeVisible()
  await expectIconOnly(page, 'library')

  await openBook(page)
  await showChrome(page)
  await page.getByRole('button', { name: 'Tuỳ chỉnh chữ', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Tuỳ chỉnh chữ' })).toBeVisible()
  await expectIconOnly(page, 'reader with typography sheet')

  await page.getByRole('button', { name: 'Đóng', exact: true }).click()
  await backToLibrary(page)
  await page.locator('nav a', { hasText: 'Cài đặt' }).filter({ visible: true }).click()
  await expect(page).toHaveURL(/#\/settings$/)
  await expect(page.getByRole('button', { name: 'Xoá bản lưu: Sách Mẫu', exact: true }).first()).toBeVisible()
  await expectIconOnly(page, 'settings')
})

test('app-shell.icons.labelled-exceptions: nav links, filter radios and the confirm dialog keep icon and text', async ({ page, context }) => {
  await mockR2(context, { books: FILES })
  await page.goto('./')
  await expect(bookCard(page)).toBeVisible()

  for (const label of ['Thư viện', 'Cài đặt']) {
    const link = page.locator('nav a', { hasText: label }).filter({ visible: true })
    await expect(link).toHaveCount(1)
    await expect(link.locator('svg')).toHaveCount(1)
    await expect(link).toContainText(label)
  }

  for (const label of ['Tất cả', 'Đã lưu']) {
    const radio = page.getByRole('radio', { name: label, exact: true })
    await expect(radio).toHaveCount(1)
    await expect(radio.locator('svg')).toHaveCount(1)
    await expect(radio).toContainText(label)
  }

  await cacheBookAndOpenSettings(page)
  await page.getByRole('button', { name: 'Xoá toàn bộ cache', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  for (const label of ['Xoá', 'Huỷ']) {
    const button = dialog.getByRole('button', { name: label, exact: true })
    await expect(button).toHaveCount(1)
    await expect(button.locator('svg')).toHaveCount(1)
    await expect(button).toContainText(label)
  }
  await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click()
  await expect(dialog).toBeHidden()
})

test('app-shell.icons.offline: nav icons render offline and no svg file is requested', async ({ page, context }) => {
  await mockR2(context, { books: FILES })
  await page.goto('./')
  await expect(bookCard(page)).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForLoadState('networkidle')

  const paths: string[] = []
  page.on('request', (request) => paths.push(new URL(request.url()).pathname))
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // Three nav items (Thư viện, Yêu cầu, Cài đặt) per app-shell.routes; one visible nav at a time.
  await expect(page.locator('nav svg').filter({ visible: true })).toHaveCount(3)
  expect(paths.filter((p) => p.endsWith('.svg')), `requests during offline reload: ${paths.join(', ')}`).toEqual([])
})

test('app-shell.icons.theme: in the dark reader the top bar icon uses the same colour as the title', async ({ page, context }) => {
  await mockR2(context, { books: FILES })
  await openFromLibrary(page)
  await expect.poll(() => marker(page)).not.toBeNull()
  await showChrome(page)

  await page.getByRole('button', { name: 'Tuỳ chỉnh chữ', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Tuỳ chỉnh chữ' })
  await sheet.getByRole('button', { name: 'Nền tối', exact: true }).click()
  await expect.poll(async () => (await frameStyle(page)).bg).toBe(DARK_BG)

  const header = page.locator('header')
  const icon = header.locator('svg').first()
  const title = header.locator('h1')
  await expect(title).toHaveText('Sách Mẫu')

  // Icon buttons transition their colour (transition-colors), so wait for the computed colours to settle.
  const colors = async () => ({
    icon: await icon.evaluate((el) => getComputedStyle(el).color),
    title: await title.evaluate((el) => getComputedStyle(el).color),
  })
  await expect.poll(async () => {
    const c = await colors()
    return c.icon === c.title
  }).toBe(true)
  const settled = await colors()
  expect(settled.icon, 'top bar icon colour should inherit the title colour').toBe(settled.title)
})

test('app-shell.icons.layout.narrow: icon-only buttons are at least 44 px and 8 px apart on mobile', async ({ page, context }, testInfo) => {
  if (testInfo.project.name === 'mobile') {
    await mockR2(context, { books: FILES })
    await page.goto('./')
    await expect(bookCard(page)).toBeVisible()
    expect(await page.evaluate(layoutProblems, 'article'), 'library card actions').toEqual([])

    await openBook(page)
    await showChrome(page)
    expect(await page.evaluate(layoutProblems, 'header'), 'reader top bar').toEqual([])
  }
})

test('app-shell.icons.layout.wide: labels are native tooltips and the focused icon button shows an outline', async ({ page, context }, testInfo) => {
  if (testInfo.project.name === 'desktop') {
    await mockR2(context, { books: FILES })
    await page.goto('./')
    await expect(bookCard(page)).toBeVisible()

    for (const name of ['Làm mới', 'Đọc', 'Tải']) {
      const button = page.getByRole('button', { name, exact: true }).first()
      await expect(button).toBeVisible()
      expect(await button.getAttribute('title')).toBe(name)
    }

    const refresh = page.getByRole('button', { name: 'Làm mới', exact: true })
    let focused = false
    for (let i = 0; i < 30 && !focused; i++) {
      await page.keyboard.press('Tab')
      focused = await refresh.evaluate((el) => el === document.activeElement)
    }
    expect(focused, 'Tab should reach "Làm mới" within 30 presses').toBe(true)

    const outline = await refresh.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { focusVisible: el.matches(':focus-visible'), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) }
    })
    expect(outline.focusVisible).toBe(true)
    expect(outline.style).not.toBe('none')
    expect(outline.width).toBeGreaterThanOrEqual(2)
  }
})
