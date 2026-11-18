// Pure helpers. No DOM, no AppKit, so they can be unit-tested.

/** "1.5" → 1500000000n for 9 decimals. String math, so no float rounding. */
export function parseUnits(value: string, decimals: number): bigint {
  const v = value.trim()
  if (!/^\d+(\.\d+)?$/.test(v)) throw new Error(`Invalid amount: "${value}"`)
  const [whole, frac = ''] = v.split('.')
  if (frac.length > decimals) throw new Error(`Too many decimals (max ${decimals})`)
  return BigInt(whole + frac.padEnd(decimals, '0'))
}

/** 1500000000n, 9 → "1.5" */
export function formatUnits(value: bigint, decimals: number): string {
  const neg = value < 0n
  const s = (neg ? -value : value).toString().padStart(decimals + 1, '0')
  const whole = s.slice(0, s.length - decimals)
  const frac = decimals ? s.slice(s.length - decimals).replace(/0+$/, '') : ''
  return (neg ? '-' : '') + whole + (frac ? '.' + frac : '')
}

export const isEvmAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a)
// Raw (0:<64 hex>) or user-friendly (48 base64/base64url chars). The wallet does the full check.
export const isTonAddress = (a: string) => /^-?\d+:[0-9a-fA-F]{64}$/.test(a) || /^[A-Za-z0-9_\-+/]{48}$/.test(a)

export const toHex = (s: string) => '0x' + Array.from(new TextEncoder().encode(s), b => b.toString(16).padStart(2, '0')).join('')

export const toQuantity = (n: bigint) => '0x' + n.toString(16)

/** JSON.stringify replacer: bigint → decimal string (JSON.stringify throws on bigint otherwise). */
export const jsonReplacer = (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value)

export const stringify = (data: unknown) => (typeof data === 'string' ? data : JSON.stringify(data, jsonReplacer, 2))

/** "ton:-3:0:abc…" → "0:abc…" (lowercase). "eip155:97:0xAb…" → "0xab…". */
export function accountAddress(caipAccount: string): string {
  return caipAccount.split(':').slice(2).join(':').toLowerCase()
}

export interface SessionNamespace {
  accounts: string[]
  methods: string[]
  events?: string[]
  chains?: string[]
}

/**
 * Returns why a request would not reach the wallet, or null if it is in the session.
 * The WalletConnect SDK would throw locally for these, so we don't send them.
 */
export function checkSession(namespaces: Record<string, SessionNamespace> | undefined, caip: string, method: string): string | null {
  if (!namespaces) return 'not in session: no session (connect first)'
  const namespace = caip.split(':')[0]
  const ns = namespaces[namespace]
  if (!ns) return `not in session: wallet would answer 5100 (namespace "${namespace}" not in session)`
  const chains = ns.chains?.length ? ns.chains : ns.accounts.map(a => a.split(':').slice(0, 2).join(':'))
  if (!chains.includes(caip)) return `not in session: wallet would answer 5100 (chain "${caip}" not in session)`
  if (!ns.methods.includes(method)) return `not in session: wallet would answer 5101 (method "${method}" not in session)`
  return null
}

export type ErrorKind = 'not-sent' | 'local' | 'timeout' | 'wallet'

export interface ClassifiedError {
  kind: ErrorKind
  label: string
  code?: number
  message: string
  data?: unknown
}

const LOCAL_PATTERNS = [/Missing or invalid\. request\(\)/, /Namespace .* is not configured/, /Please call connect\(\)/, /Cannot read properties of undefined/]

/** Tells a wallet answer apart from an error the SDK raised itself. */
export function classifyError(e: unknown): ClassifiedError {
  const err = (e ?? {}) as { message?: unknown; code?: unknown; data?: unknown; notSent?: boolean }
  const message = typeof err.message === 'string' ? err.message : typeof e === 'string' ? e : stringify(e)
  if (err.notSent) return { kind: 'not-sent', label: 'not sent', message }
  if (LOCAL_PATTERNS.some(p => p.test(message))) return { kind: 'local', label: 'local SDK error (not sent to wallet)', message }
  if (/Request expired/.test(message)) return { kind: 'timeout', label: 'no wallet answer (timeout)', message }
  return {
    kind: 'wallet',
    label: 'error',
    code: typeof err.code === 'number' ? err.code : undefined,
    message,
    data: err.data
  }
}

export const nowSeconds = () => Math.floor(Date.now() / 1000)
