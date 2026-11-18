import { describe, expect, it } from 'vitest'
import {
  accountAddress,
  checkSession,
  classifyError,
  formatUnits,
  isEvmAddress,
  isTonAddress,
  parseUnits,
  stringify,
  toHex
} from './util'

describe('parseUnits / formatUnits', () => {
  it('converts decimals without floats', () => {
    expect(parseUnits('1.5', 9)).toBe(1500000000n)
    expect(parseUnits('0.01', 18)).toBe(10000000000000000n)
    expect(parseUnits(' 2 ', 0)).toBe(2n)
  })
  it('rejects bad amounts', () => {
    expect(() => parseUnits('abc', 9)).toThrow('Invalid amount')
    expect(() => parseUnits('-1', 9)).toThrow('Invalid amount')
    expect(() => parseUnits('1.', 9)).toThrow('Invalid amount')
    expect(() => parseUnits('0.0000000001', 9)).toThrow('Too many decimals')
  })
  it('formats back', () => {
    expect(formatUnits(1500000000n, 9)).toBe('1.5')
    expect(formatUnits(0n, 18)).toBe('0')
    expect(formatUnits(5n, 0)).toBe('5')
  })
})

describe('address checks', () => {
  it('evm', () => {
    expect(isEvmAddress('0x000000000000000000000000000000000000dEaD')).toBe(true)
    expect(isEvmAddress('0x123')).toBe(false)
  })
  it('ton', () => {
    expect(isTonAddress('0:' + '0'.repeat(64))).toBe(true)
    expect(isTonAddress('-1:' + 'a'.repeat(64))).toBe(true)
    expect(isTonAddress('EQ' + 'A'.repeat(46))).toBe(true)
    expect(isTonAddress('nope')).toBe(false)
  })
  it('accountAddress strips the caip prefix', () => {
    expect(accountAddress('ton:-3:0:ABC')).toBe('0:abc')
    expect(accountAddress('eip155:97:0xAbC')).toBe('0xabc')
  })
})

describe('toHex / stringify', () => {
  it('hex-encodes UTF-8', () => {
    expect(toHex('Hello')).toBe('0x48656c6c6f')
    expect(toHex('')).toBe('0x')
  })
  it('prints bigint as decimal string', () => {
    expect(stringify({ a: 10n })).toBe('{\n  "a": "10"\n}')
  })
})

describe('checkSession', () => {
  const ns = {
    ton: { accounts: ['ton:-3:0:' + 'a'.repeat(64)], methods: ['ton_signData'] },
    eip155: { chains: ['eip155:97'], accounts: ['eip155:97:0xabc'], methods: ['personal_sign'] }
  }
  it('passes in-session requests', () => {
    expect(checkSession(ns, 'ton:-3', 'ton_signData')).toBeNull()
    expect(checkSession(ns, 'eip155:97', 'personal_sign')).toBeNull()
  })
  it('flags missing namespace, chain and method', () => {
    expect(checkSession(undefined, 'ton:-3', 'x')).toMatch('no session')
    expect(checkSession({ ton: ns.ton }, 'eip155:97', 'personal_sign')).toMatch('5100')
    expect(checkSession(ns, 'eip155:1', 'personal_sign')).toMatch('5100')
    expect(checkSession(ns, 'eip155:97', 'eth_sign')).toMatch('5101')
  })
})

describe('classifyError', () => {
  it('local SDK errors', () => {
    expect(classifyError(new Error('Missing or invalid. request() method: eth_sign')).kind).toBe('local')
  })
  it('timeouts', () => {
    expect(classifyError(new Error('Request expired. Please try again.')).kind).toBe('timeout')
  })
  it('wallet answers keep code and data', () => {
    expect(classifyError({ code: -32602, message: 'Invalid text', data: 1 })).toEqual({
      kind: 'wallet',
      label: 'error',
      code: -32602,
      message: 'Invalid text',
      data: 1
    })
  })
  it('not-sent flag', () => {
    expect(classifyError(Object.assign(new Error('x'), { notSent: true })).kind).toBe('not-sent')
  })
})
