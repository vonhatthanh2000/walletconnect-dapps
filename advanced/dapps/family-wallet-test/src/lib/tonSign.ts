// Rebuilds the bytes Family Wallet signs for ton_signData (TON Connect signData format, spec §3) and verifies them.
import { sha256, signVerify } from '@ton/crypto'

export type SignDataPayload = { type: 'text'; text: string } | { type: 'binary'; bytes: string } | { type: string; [k: string]: unknown }

export interface SignDataResult {
  signature: string // base64
  address: string // "0:<64 hex>"
  publicKey?: string // hex
  timestamp: number // seconds
  domain: string
  payload: SignDataPayload
}

function uint32BE(n: number) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

/** 0xffff ‖ "ton-connect/sign-data/" ‖ wc ‖ hash ‖ domain len ‖ domain ‖ timestamp ‖ "txt"|"bin" ‖ data len ‖ data */
export function signDataBytes(result: Pick<SignDataResult, 'address' | 'timestamp' | 'domain' | 'payload'>): Buffer {
  const m = /^(-?\d+):([0-9a-fA-F]{64})$/.exec(result.address)
  if (!m) throw new Error(`Not a raw TON address: ${result.address}`)
  const wc = Buffer.alloc(4)
  wc.writeInt32BE(Number(m[1]))
  const hash = Buffer.from(m[2], 'hex')

  const p = result.payload
  let prefix: string
  let data: Buffer
  if (p.type === 'text') {
    prefix = 'txt'
    data = Buffer.from(String((p as { text: string }).text), 'utf8')
  } else if (p.type === 'binary') {
    prefix = 'bin'
    data = Buffer.from(String((p as { bytes: string }).bytes), 'base64')
  } else {
    throw new Error(`Cannot rebuild sign data of type "${p.type}"`)
  }

  const domain = Buffer.from(result.domain, 'utf8')
  const ts = Buffer.alloc(8)
  ts.writeBigUInt64BE(BigInt(result.timestamp))

  return Buffer.concat([
    Buffer.from([0xff, 0xff]),
    Buffer.from('ton-connect/sign-data/', 'utf8'),
    wc,
    hash,
    uint32BE(domain.length),
    domain,
    ts,
    Buffer.from(prefix, 'utf8'),
    uint32BE(data.length),
    data
  ])
}

/** sha256(bytes), then Ed25519 verify against the hex public key. */
export async function verifyTonSignData(result: SignDataResult, publicKeyHex: string): Promise<boolean> {
  const digest = await sha256(signDataBytes(result))
  return signVerify(digest, Buffer.from(result.signature, 'base64'), Buffer.from(publicKeyHex, 'hex'))
}
