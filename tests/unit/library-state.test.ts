import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as state from '../../src/ui/library/library-state'

const { query, filter, genre, author, clearFilters } = state

afterEach(() => {
  query.value = ''
  filter.value = 'all'
  genre.value = ''
  author.value = ''
  localStorage.clear()
})

describe('library.grid.only', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('library.grid.only: module exports no layout and a stored "list" choice has no effect', async () => {
    localStorage.setItem('library.layout', 'list')
    const fresh = await import('../../src/ui/library/library-state')
    expect(fresh).not.toHaveProperty('layout')
    expect(fresh).not.toHaveProperty('setLayout')
    expect(localStorage.getItem('library.layout')).toBe('list')
  })
})

describe('library.filter.persist', () => {
  it('library.filter.persist: genre and author keep their values when the module is imported again', async () => {
    const first = await import('../../src/ui/library/library-state')
    first.genre.value = 'huyen huyen'
    first.author.value = 'nhi can'
    const again = await import('../../src/ui/library/library-state')
    expect(again).toBe(first)
    expect(again.genre.value).toBe('huyen huyen')
    expect(again.author.value).toBe('nhi can')
  })

  it('library.filter.persist: clearFilters resets query, genre and author but keeps the saved filter', () => {
    query.value = 'khung'
    genre.value = 'tien hiep'
    author.value = 'nhi can'
    filter.value = 'saved'
    clearFilters()
    expect(query.value).toBe('')
    expect(genre.value).toBe('')
    expect(author.value).toBe('')
    expect(filter.value).toBe('saved')
  })
})
