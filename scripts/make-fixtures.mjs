// Generates deterministic EPUB 3 fixtures into tests/fixtures/.
// Usage: node scripts/make-fixtures.mjs
// Zero dependencies: a minimal STORE-only ZIP writer is implemented below.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT_DIR = fileURLToPath(new URL('../tests/fixtures/', import.meta.url))

// Tiny baseline JPEG (1441 bytes), generated with macOS sips from a PNG.
const COVER_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAGQAZAAD/4QCARXhpZgAATU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAIdpAAQAAAABAAAATgAAAAAAAAAZAAAAAQAAABkAAAABAAOgAQADAAAAAQABAACgAgAEAAAAAQAAACCgAwAEAAAAAQAAACAAAAAA/+0AOFBob3Rvc2hvcCAzLjAAOEJJTQQEAAAAAAAAOEJJTQQlAAAAAAAQ1B2M2Y8AsgTpgAmY7PhCfv/AABEIACAAIAMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2wBDAAICAgICAgMCAgMFAwMDBQYFBQUFBggGBgYGBggKCAgICAgICgoKCgoKCgoMDAwMDAwODg4ODg8PDw8PDw8PDw//2wBDAQICAgQEBAcEBAcQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/3QAEAAL/2gAMAwEAAhEDEQA/AP3A+JnxM8FfB/wTqXxC+IWpJpWh6UgeaZgWJLEKiIigs7uxCqqgkk1+dcn/AAV6/ZhWRlTSPE8igkBhY2wBHrg3QP5ij/gr1JIn7MOkIrELJ4nsQwB4IFtdEZ/EA1+DXwT+CesfGfWLyzs7xNNsNNRHubl0MhBkJCIiAjczYJ5IAA+gr3coyiWKkqdNXk9kedj8fHDxdSo7RW7P3lj/AOCvX7MLSKr6R4njUkAsbG2IA9cC6J/IV+inwz+Jngr4weCdN+IXw91JNV0PVULwzKCpBUlXR0YBkdGBVlYAgiv5BvjZ8E9Y+DGsWdneXialYakjvbXKIYyTGQHR0JO1lyDwSCD9RX7y/wDBIWSR/wBmHV0ZiVj8T3wUE8AG2tScfiSaM3yiWFk6dRWkt0GAx8cRFVKbvF7M/9D6s/4K9RyP+zDpDqpKx+J7EsQOADbXQGfxIFfg18E/jZrHwY1i8vLOzTUrDUkRLm2dzGSYySjo4B2suSOQQQfoa/r5+Jnwz8FfGDwTqXw9+IWmpquh6qgSaFiVIKkMjo6kMjowDKykEEV+dcn/AASF/ZhaRmTV/E8akkhRfWxAHpk2pP5mvdyjN5YWSqU3aS2Z52PwEcRF06ivF7o/Br42fGzWPjPrFneXlmmm2Gmo6W1sjmQgyEF3dyBuZsAcAAAfU1+8v/BIWORP2YdXdlIWTxPfFSRwQLa1Bx+IIoj/AOCQv7MKyKz6v4nkUEEqb62AI9Mi1B/I1+inwz+Gfgr4P+CdN+Hvw901NK0PSkKQwqSxJYlnd3Ylnd2JZmYkkmjN83lipOpUd5PdhgMBHDxVOmrRWyP/2Q=='
const COVER_JPEG = Uint8Array.from(Buffer.from(COVER_JPEG_B64, 'base64'))

const enc = new TextEncoder()

// ---- Minimal STORE-only ZIP writer -------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(data) {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// entries: Array<[name, Uint8Array]>, written in insertion order, no compression.
function zipStored(entries) {
  const parts = []
  const central = []
  let offset = 0
  const DOS_TIME = 0
  const DOS_DATE = 0x21 // 1980-01-01

  for (const [name, data] of entries) {
    const nameBytes = enc.encode(name)
    const crc = crc32(data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true) // version needed
    local.setUint16(6, 0, true) // flags
    local.setUint16(8, 0, true) // method: STORE
    local.setUint16(10, DOS_TIME, true)
    local.setUint16(12, DOS_DATE, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true) // extra length
    parts.push(new Uint8Array(local.buffer), nameBytes, data)

    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true)
    cd.setUint16(4, 20, true) // version made by
    cd.setUint16(6, 20, true) // version needed
    cd.setUint16(8, 0, true)
    cd.setUint16(10, 0, true)
    cd.setUint16(12, DOS_TIME, true)
    cd.setUint16(14, DOS_DATE, true)
    cd.setUint32(16, crc, true)
    cd.setUint32(20, data.length, true)
    cd.setUint32(24, data.length, true)
    cd.setUint16(28, nameBytes.length, true)
    cd.setUint16(30, 0, true) // extra
    cd.setUint16(32, 0, true) // comment
    cd.setUint16(34, 0, true) // disk
    cd.setUint16(36, 0, true) // internal attrs
    cd.setUint32(38, 0, true) // external attrs
    cd.setUint32(42, offset, true)
    central.push(new Uint8Array(cd.buffer), nameBytes)

    offset += 30 + nameBytes.length + data.length
  }

  const cdStart = offset
  let cdSize = 0
  for (const p of central) {
    parts.push(p)
    cdSize += p.length
  }
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(4, 0, true)
  eocd.setUint16(6, 0, true)
  eocd.setUint16(8, entries.length, true)
  eocd.setUint16(10, entries.length, true)
  eocd.setUint32(12, cdSize, true)
  eocd.setUint32(16, cdStart, true)
  eocd.setUint16(20, 0, true)
  parts.push(new Uint8Array(eocd.buffer))

  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const p of parts) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}

// ---- EPUB content -------------------------------------------------------------

const WORDS = ['trời', 'đất', 'gió', 'mây', 'núi', 'sông', 'kiếm', 'đạo', 'tâm', 'người', 'đi', 'về', 'xa', 'gần', 'sáng', 'tối']
const WORDS_REVERSED = [...WORDS].reverse()
const SENTENCE_WORDS = 60

function sentence(words, c, n) {
  const out = []
  for (let i = 0; i < SENTENCE_WORDS; i++) out.push(words[(c * 131 + n * 17 + i) % words.length])
  return out.join(' ') + '.'
}

// Paragraph text for the original chapter content.
const para = (c, n) => `C${c}P${n} ${sentence(WORDS, c, n)}`
// Rewritten paragraph used by v3 (different marker and reversed word list).
const paraRewritten = (c, n) => `C${c}R${n} ${sentence(WORDS_REVERSED, c, n)}`

const CHAPTER_COUNT = 10
const PARAS_PER_CHAPTER = 40
const EXTRA_PARA_V2 = 'C5P0 Đoạn mới được thêm vào đầu chương.'

const pad3 = (n) => String(n).padStart(3, '0')
const chapHref = (c) => `chap${pad3(c)}.xhtml`

function chapterXhtml(c, paragraphs) {
  const body = paragraphs.map((t) => `<p>${t}</p>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="vi" lang="vi">
<head><meta charset="UTF-8"/><title>Chương ${c}</title></head>
<body>
<section epub:type="chapter">
<h1>Chương ${c}</h1>
${body}
</section>
</body>
</html>
`
}

function navXhtml(chapters) {
  const items = chapters.map((c) => `<li><a href="${chapHref(c)}">Chương ${c}</a></li>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="vi" lang="vi">
<head><meta charset="UTF-8"/><title>Mục lục</title></head>
<body>
<nav epub:type="toc"><ol>
${items}
</ol></nav>
</body>
</html>
`
}

// Default Dublin Core fields (title + language) for the generic fixtures.
const DEFAULT_DC = '<dc:title>Sách Mẫu</dc:title>\n<dc:language>vi</dc:language>'

function contentOpf({ uuid, chapters, hasCover, dc = DEFAULT_DC }) {
  const manifestChapters = chapters.map((c) => `<item id="c${c}" href="${chapHref(c)}" media-type="application/xhtml+xml"/>`).join('\n')
  const cover = hasCover
    ? '\n<item id="cover-img" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>'
    : ''
  const spine = chapters.map((c) => `<itemref idref="c${c}"/>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="vi">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier>
${dc}
<meta property="dcterms:modified">2026-11-01T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifestChapters}${cover}
</manifest>
<spine>
${spine}
</spine>
</package>
`
}

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
`

// Builds one book. Options:
//  uuid: fixed identifier; hasCover: include cover.jpg + manifest item;
//  omitChapters: chapter numbers to leave out entirely;
//  chapter5Paras: override the paragraphs of chapter 5.
//  dc: Dublin Core lines for the <metadata> block (default: title + language).
function buildBook({ uuid, hasCover = true, omitChapters = [], chapter5Paras = null, dc = undefined }) {
  const chapters = []
  for (let c = 1; c <= CHAPTER_COUNT; c++) if (!omitChapters.includes(c)) chapters.push(c)

  const files = [['mimetype', enc.encode('application/epub+zip')]]
  files.push(['META-INF/container.xml', enc.encode(CONTAINER_XML)])
  files.push(['OEBPS/content.opf', enc.encode(contentOpf({ uuid, chapters, hasCover, dc }))])
  files.push(['OEBPS/nav.xhtml', enc.encode(navXhtml(chapters))])
  for (const c of chapters) {
    let paras
    if (c === 5 && chapter5Paras) paras = chapter5Paras
    else paras = Array.from({ length: PARAS_PER_CHAPTER }, (_, i) => para(c, i + 1))
    files.push([`OEBPS/${chapHref(c)}`, enc.encode(chapterXhtml(c, paras))])
  }
  if (hasCover) files.push(['OEBPS/cover.jpg', COVER_JPEG])
  return zipStored(files)
}

const v1Paras = () => Array.from({ length: PARAS_PER_CHAPTER }, (_, i) => para(5, i + 1))

const BOOKS = {
  'book-v1.epub': { uuid: '0e6f1a20-0000-4000-8000-000000000001' },
  'book-v2.epub': {
    uuid: '0e6f1a20-0000-4000-8000-000000000002',
    chapter5Paras: [EXTRA_PARA_V2, ...v1Paras()],
  },
  'book-v3.epub': {
    uuid: '0e6f1a20-0000-4000-8000-000000000003',
    chapter5Paras: Array.from({ length: PARAS_PER_CHAPTER }, (_, i) => paraRewritten(5, i + 1)),
  },
  'book-v4.epub': { uuid: '0e6f1a20-0000-4000-8000-000000000004', omitChapters: [5] },
  'book-nocover.epub': { uuid: '0e6f1a20-0000-4000-8000-000000000005', hasCover: false },
  // Metadata fixture for the deployer: HTML description (escaped in the OPF), two subjects, one creator.
  'book-meta.epub': {
    uuid: '0e6f1a20-0000-4000-8000-000000000006',
    dc: [
      '<dc:title>Phàm Nhân Tu Tiên</dc:title>',
      '<dc:creator>Vong Ngữ</dc:creator>',
      '<dc:subject>Tiên Hiệp</dc:subject>',
      '<dc:subject>xianxia</dc:subject>',
      '<dc:description>&lt;p&gt;Một &lt;b&gt;phàm nhân&lt;/b&gt; bước vào con đường tu tiên.&lt;/p&gt;</dc:description>',
      '<dc:language>vi</dc:language>',
    ].join('\n'),
  },
}

mkdirSync(OUT_DIR, { recursive: true })
for (const [file, opts] of Object.entries(BOOKS)) {
  writeFileSync(`${OUT_DIR}${file}`, buildBook(opts))
}
writeFileSync(`${OUT_DIR}cover.jpg`, COVER_JPEG)
console.log(`Wrote ${Object.keys(BOOKS).length} EPUB fixtures and cover.jpg to ${OUT_DIR}`)
