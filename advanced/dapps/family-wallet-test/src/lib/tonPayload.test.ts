import { describe, expect, it } from 'vitest'
import { Address, Cell } from '@ton/core'
import { commentPayload, jettonTransferPayload } from './tonPayload'

const A = '0:' + '11'.repeat(32)
const B = '0:' + '22'.repeat(32)

describe('commentPayload', () => {
  it('decodes back to the text', () => {
    for (const text of ['Hello', 'Xin chào 👋', 'x'.repeat(300)]) {
      const s = Cell.fromBase64(commentPayload(text)).beginParse()
      expect(s.loadUint(32)).toBe(0)
      expect(s.loadStringTail()).toBe(text)
    }
  })
})

describe('jettonTransferPayload', () => {
  it('has op, query_id, amount, destination, response destination', () => {
    const s = Cell.fromBase64(jettonTransferPayload({ amount: 1234n, destination: A, responseDestination: B, queryId: 42n })).beginParse()
    expect(s.loadUint(32)).toBe(0x0f8a7ea5)
    expect(s.loadUintBig(64)).toBe(42n)
    expect(s.loadCoins()).toBe(1234n)
    expect(s.loadAddress().equals(Address.parse(A))).toBe(true)
    expect(s.loadAddress().equals(Address.parse(B))).toBe(true)
    expect(s.loadBit()).toBe(false)
    expect(s.loadCoins()).toBe(1n)
    expect(s.loadBit()).toBe(false)
    expect(s.remainingBits).toBe(0)
  })
})
