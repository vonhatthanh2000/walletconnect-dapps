import { describe, expect, it } from 'vitest'
import { keyPairFromSeed, sha256, sign } from '@ton/crypto'
import { signDataBytes, verifyTonSignData, type SignDataResult } from './tonSign'

const keys = keyPairFromSeed(Buffer.alloc(32, 7))
const base: Omit<SignDataResult, 'signature'> = {
  address: '0:' + 'ab'.repeat(32),
  publicKey: keys.publicKey.toString('hex'),
  timestamp: 1763450000,
  domain: 'app.example.com:8443',
  payload: { type: 'text', text: 'Hello' }
}

async function signed(r: Omit<SignDataResult, 'signature'>): Promise<SignDataResult> {
  const signature = sign(await sha256(signDataBytes(r)), keys.secretKey).toString('base64')
  return { ...r, signature }
}

describe('signDataBytes', () => {
  it('follows the layout', () => {
    const b = signDataBytes(base)
    expect(b.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xff]))
    expect(b.subarray(2, 24).toString()).toBe('ton-connect/sign-data/')
    expect(b.readInt32BE(24)).toBe(0)
    expect(b.subarray(28, 60).toString('hex')).toBe('ab'.repeat(32))
    expect(b.readUInt32BE(60)).toBe(20)
    expect(b.subarray(64, 84).toString()).toBe('app.example.com:8443')
    expect(b.readBigUInt64BE(84)).toBe(1763450000n)
    expect(b.subarray(92, 95).toString()).toBe('txt')
    expect(b.readUInt32BE(95)).toBe(5)
    expect(b.subarray(99).toString()).toBe('Hello')
  })
  it('uses bin for binary and decodes base64', () => {
    const b = signDataBytes({ ...base, payload: { type: 'binary', bytes: Buffer.from([1, 2, 3]).toString('base64') } })
    expect(b.subarray(92, 95).toString()).toBe('bin')
    expect([...b.subarray(99)]).toEqual([1, 2, 3])
  })
  it('handles a negative workchain', () => {
    expect(signDataBytes({ ...base, address: '-1:' + '00'.repeat(32) }).readInt32BE(24)).toBe(-1)
  })
  it('throws for other types', () => {
    expect(() => signDataBytes({ ...base, payload: { type: 'cell', cell: 'x' } })).toThrow('cell')
  })
})

describe('verifyTonSignData', () => {
  const pk = keys.publicKey.toString('hex')
  it('accepts a valid text and binary signature', async () => {
    expect(await verifyTonSignData(await signed(base), pk)).toBe(true)
    expect(await verifyTonSignData(await signed({ ...base, payload: { type: 'binary', bytes: 'SGVsbG8=' } }), pk)).toBe(true)
  })
  it('rejects a changed domain, timestamp or data byte', async () => {
    const s = await signed(base)
    expect(await verifyTonSignData({ ...s, domain: 'evil.com' }, pk)).toBe(false)
    expect(await verifyTonSignData({ ...s, timestamp: s.timestamp + 1 }, pk)).toBe(false)
    expect(await verifyTonSignData({ ...s, payload: { type: 'text', text: 'Hellp' } }, pk)).toBe(false)
  })
  it('rejects another key', async () => {
    const other = keyPairFromSeed(Buffer.alloc(32, 9)).publicKey.toString('hex')
    expect(await verifyTonSignData(await signed(base), other)).toBe(false)
  })
})
