// Shapes written by the deployer. They mirror knowledge/domain/r2-source.md.

/** `books/<slug>/metadata.json` and one entry of `catalog.json` `books`. */
export interface Metadata {
  schema: 1
  id: string
  title: string
  author: string
  genres: string[]
  description: string
  language: string
  epub: string
  size: number
  md5: string
  updatedAt: string
}

/** `catalog.json`. `books` is sorted by `id`. */
export interface Catalog {
  schema: 1
  generatedAt: string
  books: Metadata[]
}
