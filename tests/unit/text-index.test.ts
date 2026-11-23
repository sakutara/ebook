import { describe, it, expect } from 'vitest'
import { buildTextIndex, findNearest } from '../../src/reader/text-index'
import { normalize } from '../../src/domain/title'

/** Builds a body with one <p> per entry; returns the root element. */
function body(paragraphs: string[]): HTMLElement {
  const root = document.createElement('body')
  for (const text of paragraphs) {
    const p = document.createElement('p')
    p.textContent = text
    root.append(p)
  }
  return root
}

describe('text-index', () => {
  it('progress.resume.ambiguous-snippet: the index equals title normalisation of the concatenated text', () => {
    const root = body(['Đấu Phá, Thương Khung!', '  Chương   2: Ánh sáng  '])
    const index = buildTextIndex(root)
    expect(index.text).toBe(normalize('Đấu Phá, Thương Khung!' + '  Chương   2: Ánh sáng  '))
    expect(index.text.startsWith(' ')).toBe(false)
  })

  it('progress.resume.ambiguous-snippet: map points each normalised char back to its source text node and offset', () => {
    const root = body(['Xin chào', 'thế giới'])
    const index = buildTextIndex(root)
    for (let i = 0; i < index.text.length; i++) {
      const { node, offset } = index.map[i]
      expect(node.nodeType).toBe(Node.TEXT_NODE)
      expect(offset).toBeGreaterThanOrEqual(0)
      expect(offset).toBeLessThan(node.data.length)
    }
    // "gioi" starts in the second paragraph's "giới", whose 'g' is at offset 4 of its node.
    const at = index.text.indexOf('gioi')
    expect(at).toBeGreaterThan(-1)
    const source = index.map[at]
    expect(source.node.data[source.offset]).toBe('g')
    expect(source.node.data).toBe('thế giới')
  })

  it('progress.resume.ambiguous-snippet: picks the occurrence whose position is nearest the saved fraction', () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `đoạn văn số ${i} trời đất gió mây`)
    const index = buildTextIndex(body(paragraphs))
    const key = 'troi dat gio may'
    const starts: number[] = []
    let at = index.text.indexOf(key)
    while (at !== -1) {
      starts.push(at)
      at = index.text.indexOf(key, at + 1)
    }
    expect(starts.length).toBe(10)

    const len = index.text.length
    // Fraction of the 7th occurrence, nudged slightly, must pick exactly that occurrence.
    const target = starts[6] / len + 0.001
    expect(findNearest(index, [key], target)).toBe(starts[6])
    // Near the start of the section, the first occurrence wins.
    expect(findNearest(index, [key], 0)).toBe(starts[0])
    // Near the end, the last one wins.
    expect(findNearest(index, [key], 1)).toBe(starts[starts.length - 1])
  })

  it('progress.resume.ambiguous-snippet: a key that spans two paragraphs is found', () => {
    const index = buildTextIndex(body(['đi về phía.', 'đông bắc trời xa']))
    const pos = findNearest(index, ['di ve phia dong bac'], 0.5)
    expect(pos).not.toBeNull()
    expect(index.text.slice(pos!, pos! + 'di ve phia dong bac'.length)).toBe('di ve phia dong bac')
    // The map points at the source character (đ), not at its normalised form.
    const source = index.map[pos!]
    expect(source.node.data[source.offset]).toBe('đ')
  })

  it('progress.resume.ambiguous-snippet: diacritics and đ in the key match plain text in the book', () => {
    const index = buildTextIndex(body(['Thương Khung đại lục rộng lớn']))
    expect(findNearest(index, [normalize('thương khung đại lục')], 0)).toBe(0)
    expect(findNearest(index, [normalize('Đại Lục')], 0)).toBe(index.text.indexOf('dai luc'))
  })

  it('progress.resume.ambiguous-snippet: the first key with any occurrence wins, longest key first', () => {
    const index = buildTextIndex(body(['alpha beta gamma', 'alpha delta']))
    // The long key has no hit; the shorter one does, and the nearest hit to 0.9 is the second paragraph.
    const pos = findNearest(index, ['alpha beta gamma delta epsilon', 'alpha delta'], 0.9)
    expect(pos).toBe(index.text.indexOf('alpha delta'))
  })

  it('progress.resume.ambiguous-snippet: no match returns null; empty keys are ignored', () => {
    const index = buildTextIndex(body(['một hai ba']))
    expect(findNearest(index, ['bốn năm'], 0.5)).toBeNull()
    expect(findNearest(index, [], 0.5)).toBeNull()
    expect(findNearest(index, ['', ''], 0.5)).toBeNull()
  })
})
