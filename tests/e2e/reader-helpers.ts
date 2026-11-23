import { expect, type Locator, type Page } from '@playwright/test'

export const BOOK_ID = 'b1'
export const TITLE = 'Sách Mẫu'

/**
 * The loading overlay covers the text area until the book is open and the position restored.
 * The toast is also a role=status region but carries aria-live, and it must not hold this wait.
 */
export async function waitForReady(page: Page): Promise<void> {
  await expect(page.locator('[role="status"]:not([aria-live])')).toHaveCount(0)
  await expect.poll(() => marker(page)).not.toBeNull()
}

/** Library: the card for a title (defaults to the first card named TITLE). */
export function bookCard(page: Page, title = TITLE): Locator {
  return page.getByRole('article', { name: title })
}

/** Opens the book from a fresh library load. */
export async function openFromLibrary(page: Page, card: Locator = bookCard(page), bookId = BOOK_ID): Promise<void> {
  await page.goto('./')
  await openBook(page, card, bookId)
}

/** Taps "Đọc" on a library card that is already on screen, then waits for the reader to be ready. */
export async function openBook(page: Page, card: Locator = bookCard(page), bookId = BOOK_ID): Promise<void> {
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Đọc', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`#/read/${bookId}$`))
  await waitForReady(page)
}

/** Text area = the foliate-view element that hosts the paginator. */
export async function tapTextArea(page: Page, fx: number): Promise<void> {
  const box = await page.locator('foliate-view').boundingBox()
  if (!box) throw new Error('foliate-view has no bounding box')
  await page.mouse.click(box.x + box.width * fx, box.y + box.height / 2)
}

export function backButton(page: Page) {
  return page.getByRole('button', { name: 'Về thư viện' })
}

export async function chromeVisible(page: Page): Promise<boolean> {
  return backButton(page).isVisible()
}

export async function toggleChrome(page: Page): Promise<void> {
  await tapTextArea(page, 0.5)
}

export async function showChrome(page: Page): Promise<void> {
  if (!(await chromeVisible(page))) {
    await toggleChrome(page)
    await expect(backButton(page)).toBeVisible()
  }
}

/** Reads the bottom-bar percentage, showing the chrome for the read and restoring its state. */
export async function percent(page: Page): Promise<number> {
  const wasVisible = await chromeVisible(page)
  if (!wasVisible) await showChrome(page)
  const text = (await page.getByText(/^\d+%$/).textContent()) ?? ''
  if (!wasVisible) await toggleChrome(page)
  return Number(text.replace('%', ''))
}

export interface Marker {
  chapter: number
  /** P for the original text, R for rewritten text (fixture v3). */
  kind: 'P' | 'R'
  para: number
}

/** First C<c>[PR]<n> marker in the current page's visible range, or null. */
export async function marker(page: Page): Promise<Marker | null> {
  return page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as { lastLocation?: { range?: Range } } | null
    const text = view?.lastLocation?.range?.toString() ?? ''
    const m = /C(\d+)([PR])(\d+)/.exec(text)
    return m ? { chapter: Number(m[1]), kind: m[2] as 'P' | 'R', para: Number(m[3]) } : null
  })
}

/** The marker as text, e.g. "C5P18", or null. */
export async function markerKey(page: Page): Promise<string | null> {
  const m = await marker(page)
  return m ? `C${m.chapter}${m.kind}${m.para}` : null
}

export async function chapterOf(page: Page): Promise<number | null> {
  return (await marker(page))?.chapter ?? null
}

export async function frameStyle(page: Page): Promise<{ fontSize: number; bg: string }> {
  return page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer: { getContents(): { doc: Document }[] }
    }
    const doc = view.renderer.getContents()[0].doc
    const cs = doc.defaultView!.getComputedStyle(doc.documentElement)
    return { fontSize: parseFloat(cs.fontSize), bg: cs.backgroundColor }
  })
}

/**
 * Picks a TOC entry. The desktop aside is always visible on wide screens; on narrow screens the
 * entry lives in the full-screen sheet opened from the chrome.
 */
export async function goToTocEntry(page: Page, label: string): Promise<void> {
  const aside = page.getByRole('complementary', { name: 'Mục lục' })
  if (await aside.isVisible()) {
    await aside.getByRole('button', { name: label, exact: true }).click()
    return
  }
  await showChrome(page)
  await page.getByRole('button', { name: 'Mục lục', exact: true }).click()
  await page.getByRole('dialog', { name: 'Mục lục' }).getByRole('button', { name: label, exact: true }).click()
}

/**
 * One ArrowRight page turn; waits until the visible marker changes. foliate keeps a 100 ms
 * navigation lock after each turn (it starts after the relocate event), so the next press waits
 * for that lock to release; a press inside it is dropped.
 */
export async function pressNext(page: Page): Promise<void> {
  const before = await markerKey(page)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => markerKey(page)).not.toBe(before)
  await page.waitForTimeout(150)
}

/** Leaves the reader through its back button. */
export async function backToLibrary(page: Page): Promise<void> {
  await showChrome(page)
  await backButton(page).click()
  await expect(page).toHaveURL(/#\/$/)
}
