import { normalize } from '../domain/title'

export interface Bank {
  bin: string
  code: string
  name: string
  aliases: string[]
}

export const BANKS: Bank[] = [
  { bin: '970436', code: 'VCB', name: 'Vietcombank', aliases: [] },
  { bin: '970407', code: 'TCB', name: 'Techcombank', aliases: [] },
  { bin: '970422', code: 'MB', name: 'MBBank', aliases: ['mbbank', 'mb bank', 'quan doi'] },
  { bin: '970418', code: 'BIDV', name: 'BIDV', aliases: [] },
  { bin: '970415', code: 'ICB', name: 'VietinBank', aliases: ['ctg', 'vietin'] },
  { bin: '970405', code: 'VBA', name: 'Agribank', aliases: [] },
  { bin: '970416', code: 'ACB', name: 'ACB', aliases: [] },
  { bin: '970432', code: 'VPB', name: 'VPBank', aliases: [] },
  { bin: '970423', code: 'TPB', name: 'TPBank', aliases: [] },
  { bin: '970403', code: 'STB', name: 'Sacombank', aliases: [] },
  { bin: '970441', code: 'VIB', name: 'VIB', aliases: [] },
  { bin: '970443', code: 'SHB', name: 'SHB', aliases: [] },
  { bin: '970437', code: 'HDB', name: 'HDBank', aliases: [] },
  { bin: '970448', code: 'OCB', name: 'OCB', aliases: [] },
  { bin: '970426', code: 'MSB', name: 'MSB', aliases: ['maritime'] },
  { bin: '970440', code: 'SEAB', name: 'SeABank', aliases: [] },
  { bin: '970431', code: 'EIB', name: 'Eximbank', aliases: [] },
  { bin: '970449', code: 'LPB', name: 'LPBank', aliases: ['lienvietpostbank'] },
  { bin: '970428', code: 'NAB', name: 'Nam A Bank', aliases: [] },
  { bin: '970454', code: 'VCCB', name: 'BVBank', aliases: ['viet capital'] },
  { bin: '970412', code: 'PVCB', name: 'PVcomBank', aliases: [] },
  { bin: '970429', code: 'SCB', name: 'SCB', aliases: [] },
  { bin: '970425', code: 'ABB', name: 'ABBANK', aliases: [] },
  { bin: '970409', code: 'BAB', name: 'Bac A Bank', aliases: [] },
  { bin: '970427', code: 'VAB', name: 'VietABank', aliases: [] },
  { bin: '970452', code: 'KLB', name: 'KienlongBank', aliases: [] },
  { bin: '970419', code: 'NCB', name: 'NCB', aliases: [] },
  { bin: '970400', code: 'SGICB', name: 'Saigonbank', aliases: [] },
  { bin: '963388', code: 'TIMO', name: 'Timo', aliases: [] },
  { bin: '546034', code: 'CAKE', name: 'CAKE', aliases: [] },
  { bin: '546035', code: 'UBANK', name: 'Ubank', aliases: [] },
]

/** Lowercase, accent-free, with all whitespace removed, for loose comparison. */
function key(s: string): string {
  return normalize(s).replace(/\s+/g, '')
}

/** Case/accent/space-insensitive match on bin, code, name or alias. */
export function resolveBank(input: string): Bank | null {
  const wanted = key(input)
  if (wanted === '') return null
  for (const bank of BANKS) {
    const candidates = [bank.bin, bank.code, bank.name, ...bank.aliases]
    if (candidates.some((c) => key(c) === wanted)) return bank
  }
  return null
}
