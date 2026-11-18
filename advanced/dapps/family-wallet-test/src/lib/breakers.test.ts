import { describe, expect, it } from 'vitest'
import { applyBreakers, type Toggle } from './breakers'
import { OTHER_BSC, OTHER_TON } from './presets'
import { mailTypedData } from './typedData'

const ctx = { bscChainId: 97, now: 1_800_000_000 }
const TON = '0:' + 'ab'.repeat(32)
const BSC = '0x1111111111111111111111111111111111111111'
const tonSend = { valid_until: ctx.now + 300, from: TON, network: '-3', messages: [{ address: TON, amount: '1' }] }
const tonSign = [{ type: 'text', text: 'x', from: TON }]
const tx = [{ from: BSC, to: BSC, value: '0x0' }]
const ps = ['0x78', BSC]
const td = [BSC, JSON.stringify(mailTypedData(97))]

const one = (method: string, params: unknown, t: Toggle) => applyBreakers(method, params, [t], ctx)

describe('applyBreakers on ton_sendMessage', () => {
  it('each toggle changes exactly its field', () => {
    expect(one('ton_sendMessage', tonSend, 'wrongFrom').params).toEqual({ ...tonSend, from: OTHER_TON })
    expect(one('ton_sendMessage', tonSend, 'wrongNetwork').params).toEqual({ ...tonSend, network: '-239' })
    expect(one('ton_sendMessage', tonSend, 'expired').params).toEqual({ ...tonSend, valid_until: ctx.now - 60 })
    expect(one('ton_sendMessage', tonSend, 'fiveMessages').params).toEqual({ ...tonSend, messages: Array(5).fill(tonSend.messages[0]) })
    expect(one('ton_sendMessage', tonSend, 'extraCurrency').params).toEqual({
      ...tonSend,
      messages: [{ ...tonSend.messages[0], extra_currency: { '100': '1' } }]
    })
  })
  it('does not mutate the input', () => {
    const input = JSON.parse(JSON.stringify(tonSend))
    applyBreakers('ton_sendMessage', input, ['wrongFrom', 'fiveMessages'], ctx)
    expect(input).toEqual(tonSend)
  })
})

describe('applyBreakers on other methods', () => {
  it('ton_signData: from and network; others n/a', () => {
    expect(one('ton_signData', tonSign, 'wrongFrom').params).toEqual([{ ...tonSign[0], from: OTHER_TON }])
    expect(one('ton_signData', tonSign, 'wrongNetwork').params).toEqual([{ ...tonSign[0], network: '-239' }])
    for (const t of ['expired', 'fiveMessages', 'extraCurrency'] as Toggle[]) {
      const r = one('ton_signData', tonSign, t)
      expect(r.params).toEqual(tonSign)
      expect(r.skipped).toEqual([t])
    }
  })
  it('eth_sendTransaction: from and chainId', () => {
    expect(one('eth_sendTransaction', tx, 'wrongFrom').params).toEqual([{ ...tx[0], from: OTHER_BSC }])
    expect(one('eth_sendTransaction', tx, 'wrongNetwork').params).toEqual([{ ...tx[0], chainId: '0x38' }])
    expect(one('eth_sendTransaction', tx, 'expired').skipped).toEqual(['expired'])
  })
  it('personal_sign: only from', () => {
    expect(one('personal_sign', ps, 'wrongFrom').params).toEqual(['0x78', OTHER_BSC])
    const r = one('personal_sign', ps, 'wrongNetwork')
    expect(r.params).toEqual(ps)
    expect(r.skipped).toEqual(['wrongNetwork'])
  })
  it('eth_signTypedData_v4: address and domain.chainId', () => {
    expect((one('eth_signTypedData_v4', td, 'wrongFrom').params as unknown[])[0]).toBe(OTHER_BSC)
    const r = one('eth_signTypedData_v4', td, 'wrongNetwork').params as string[]
    const data = JSON.parse(r[1])
    expect(data.domain.chainId).toBe(56)
    expect({ ...data, domain: { ...data.domain, chainId: 97 } }).toEqual(JSON.parse(td[1]))
  })
  it('reports applied and skipped toggles', () => {
    const r = applyBreakers('personal_sign', ps, ['wrongFrom', 'expired'], ctx)
    expect(r.applied).toEqual(['wrongFrom'])
    expect(r.skipped).toEqual(['expired'])
  })
})
