/** Safe .epub file name for a book title: reserved characters become '_', empty title becomes 'truyen'. */
export function epubFileName(title: string): string {
  const base = title.trim().replace(/[\\/:*?"<>|]/g, '_') || 'truyen'
  return `${base}.epub`
}
