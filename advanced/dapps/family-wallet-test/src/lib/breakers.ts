// "Break the request" toggles (§7.10): pure functions that change one field of a panel-built request.
import { OTHER_BSC, OTHER_TON, wrongChainId } from './presets'
import { toQuantity } from './util'

export type Toggle = 'wrongFrom' | 'wrongNetwork' | 'expired' | 'fiveMessages' | 'extraCurrency'

export const TOGGLES: { id: Toggle; label: string; chains: ('ton' | 'bsc')[] }[] = [
  { id: 'wrongFrom', label: 'wrong from', chains: ['ton', 'bsc'] },
  { id: 'wrongNetwork', label: 'wrong network / chainId', chains: ['ton', 'bsc'] },
  { id: 'expired', label: 'expired valid_until', chains: ['ton'] },
  { id: 'fiveMessages', label: '5 messages', chains: ['ton'] },
  { id: 'extraCurrency', label: 'extra currency', chains: ['ton'] }
]

export interface BreakResult {
  params: unknown
  applied: Toggle[]
  skipped: Toggle[]
}

type Obj = Record<string, unknown>
type Msg = Obj
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

/** Returns a new params value with every applicable toggle applied; toggles that don't fit the method are skipped. */
export function applyBreakers(
  method: string,
  params: unknown,
  toggles: Iterable<Toggle>,
  ctx: { bscChainId: number; now: number }
): BreakResult {
  const p = clone(params)
  const applied: Toggle[] = []
  const skipped: Toggle[] = []
  const wrongHex = toQuantity(BigInt(wrongChainId(ctx.bscChainId)))

  for (const t of toggles) {
    let ok = false
    if (method === 'ton_sendMessage') {
      const o = (Array.isArray(p) ? p[0] : p) as Obj & { messages: Msg[] }
      ok = true
      if (t === 'wrongFrom') o.from = OTHER_TON
      else if (t === 'wrongNetwork') o.network = '-239'
      else if (t === 'expired') o.valid_until = ctx.now - 60
      else if (t === 'fiveMessages') while (o.messages.length < 5) o.messages.push(clone(o.messages[0]))
      else if (t === 'extraCurrency') o.messages[0] = { ...o.messages[0], extra_currency: { '100': '1' } }
      else ok = false
    } else if (method === 'ton_signData') {
      const o = (Array.isArray(p) ? p[0] : p) as Obj
      if (t === 'wrongFrom') (o.from = OTHER_TON), (ok = true)
      else if (t === 'wrongNetwork') (o.network = '-239'), (ok = true)
    } else if (method === 'personal_sign') {
      const a = p as unknown[]
      if (t === 'wrongFrom') (a[1] = OTHER_BSC), (ok = true)
    } else if (method === 'eth_signTypedData_v4') {
      const a = p as unknown[]
      if (t === 'wrongFrom') (a[0] = OTHER_BSC), (ok = true)
      else if (t === 'wrongNetwork') {
        const data = (typeof a[1] === 'string' ? JSON.parse(a[1]) : a[1]) as { domain: Obj }
        data.domain = { ...data.domain, chainId: wrongChainId(ctx.bscChainId) }
        a[1] = typeof a[1] === 'string' ? JSON.stringify(data) : data
        ok = true
      }
    } else if (method === 'eth_sendTransaction') {
      const tx = (p as Obj[])[0]
      if (t === 'wrongFrom') (tx.from = OTHER_BSC), (ok = true)
      else if (t === 'wrongNetwork') (tx.chainId = wrongHex), (ok = true)
    }
    ;(ok ? applied : skipped).push(t)
  }
  return { params: p, applied, skipped }
}
