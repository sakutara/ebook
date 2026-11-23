import type { RelocateInfo } from '../progress/anchor'

/** Reader engine boundary. Type-only: foliate-js implements it later. */
export interface ReaderAdapter {
  open(file: File): Promise<void>
  sections(): { href: string }[]
  toc(): { label: string; href: string; subitems?: { label: string; href: string }[] }[]
  /** Resolves false when the target could not be resolved. */
  goTo(target: string | { index: number; anchor: number }): Promise<boolean>
  goToFraction(f: number): Promise<void>
  textAt(cfi: string): Promise<string | null>
  /**
   * Returns a CFI for the occurrence of the first key that has any match in section index,
   * choosing the occurrence nearest nearFraction (0..1 through the section), or null.
   */
  findInSection(index: number, keys: string[], nearFraction: number): Promise<string | null>
  next(): Promise<void>
  prev(): Promise<void>
  setPrefs(css: string): void
  onRelocate(cb: (info: RelocateInfo & { tocLabel?: string }) => void): () => void
  destroy(): void
}
