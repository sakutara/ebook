import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/preact'
import { ioInstances } from '../setup'
import { CoverImage, placeholderHue, type CoverBook } from '../../src/ui/library/CoverImage'

const book: CoverBook = { title: 'Đấu Phá Thương Khung', normTitle: 'dau pha thuong khung' }

afterEach(() => {
  cleanup()
  ioInstances.length = 0
})

describe('library.cover.remote', () => {
  it('library.cover.remote: placeholder is always rendered with the title', () => {
    render(<CoverImage book={book} src="https://cdn.example/books/dau-pha/cover.jpg?v=m1" />)

    const placeholder = screen.getByRole('img', { name: book.title })
    expect(placeholder.textContent).toBe(book.title)
    expect(placeholder.getAttribute('style')).toContain('background')
  })

  it('library.cover.remote: src layers an img on top, hidden until load', () => {
    const src = 'https://cdn.example/books/dau-pha/cover.jpg?v=m1'
    const { container } = render(<CoverImage book={book} src={src} />)

    const img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.getAttribute('src')).toBe(src)
    expect(img.getAttribute('alt')).toBe('')
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('decoding')).toBe('async')
    expect(img.className).toContain('absolute inset-0 size-full object-cover')
    expect(img.className).toContain('invisible')
  })

  it('library.cover.remote: load reveals the img and keeps the placeholder underneath', () => {
    const { container } = render(<CoverImage book={book} src="https://cdn.example/c.jpg" />)
    const img = container.querySelector('img') as HTMLImageElement

    fireEvent.load(img)

    expect(container.querySelector('img')).not.toBeNull()
    expect(container.querySelector('img')?.className).not.toContain('invisible')
    expect(screen.getByRole('img', { name: book.title })).toBeInTheDocument()
  })

  it('library.cover.remote: no src renders the placeholder only, with no image and no observer', () => {
    const { container } = render(<CoverImage book={book} />)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('img', { name: book.title })).toBeInTheDocument()
    expect(ioInstances).toHaveLength(0)
  })

  it('library.cover.remote: changing src resets to hidden until the new image loads', () => {
    const { container, rerender } = render(<CoverImage book={book} src="https://cdn.example/a.jpg" />)
    fireEvent.load(container.querySelector('img') as HTMLImageElement)
    expect(container.querySelector('img')?.className).not.toContain('invisible')

    rerender(<CoverImage book={book} src="https://cdn.example/b.jpg" />)

    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('https://cdn.example/b.jpg')
    expect(img.className).toContain('invisible')
  })

  it('library.cover.remote: class prop is appended to the wrapper', () => {
    const { container } = render(<CoverImage book={book} class="w-24" />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.className).toContain('aspect-[2/3]')
    expect(wrapper.className).toContain('w-24')
  })

  it('library.cover.remote: no IntersectionObserver is created', () => {
    render(<CoverImage book={book} src="https://cdn.example/c.jpg" />)
    expect(ioInstances).toHaveLength(0)
  })
})

describe('library.cover.fallback', () => {
  it('library.cover.fallback: error removes the broken img and keeps the placeholder', () => {
    const { container } = render(<CoverImage book={book} src="https://cdn.example/missing.jpg" />)

    fireEvent.error(container.querySelector('img') as HTMLImageElement)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('img', { name: book.title }).textContent).toBe(book.title)
  })

  it('library.cover.fallback: a new src after an error tries the image again', () => {
    const { container, rerender } = render(<CoverImage book={book} src="https://cdn.example/bad.jpg" />)
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()

    rerender(<CoverImage book={book} src="https://cdn.example/good.jpg" />)

    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('https://cdn.example/good.jpg')
    expect(img.className).toContain('invisible')
  })
})

describe('library.cover.placeholder', () => {
  it('library.cover.placeholder: placeholderHue is stable and within 0..359', () => {
    const samples = ['sach a', 'truyen kieu', 'doraemon', '', 'x'.repeat(200), 'Tủ Truyện']
    for (const s of samples) {
      const h = placeholderHue(s)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(359)
      expect(placeholderHue(s)).toBe(h)
    }
  })
})
