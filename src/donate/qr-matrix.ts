import qrcode from 'qrcode-generator'

const QUIET_ZONE = 4

/** typeNumber 0 (auto), error level 'M'. Returns modules[row][col] booleans. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  const modules: boolean[][] = []
  for (let r = 0; r < n; r++) {
    const row: boolean[] = []
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c))
    modules.push(row)
  }
  return modules
}

/** One <path> with a 'M x y h1v1h-1z' run per dark module, viewBox incl. 4-module quiet zone. */
export function qrSvg(text: string): string {
  const modules = qrMatrix(text)
  const n = modules.length
  const size = n + QUIET_ZONE * 2
  let d = ''
  modules.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (dark) d += `M${c + QUIET_ZONE} ${r + QUIET_ZONE}h1v1h-1z`
    })
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path fill="currentColor" d="${d}"/></svg>`
}
