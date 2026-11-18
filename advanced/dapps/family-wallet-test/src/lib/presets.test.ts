import { describe, expect, it } from 'vitest'
import { OTHER_BSC, SDK_LOCAL_METHODS, buildPresets, wrongChainId } from './presets'

const TON = '0:' + 'ab'.repeat(32)
const BSC = '0x1111111111111111111111111111111111111111'
const ctx = { tonFrom: TON, bscFrom: BSC, tonNetwork: '-3', bscChainId: 97, now: 1_800_000_000 }
const presets = buildPresets(ctx)
const byId = (id: string) => {
  const p = presets.find(x => x.id === id)
  if (!p) throw new Error(`missing preset ${id}`)
  return p
}

describe('buildPresets', () => {
  it('has one preset per catalogue row (59), unique ids, every field set', () => {
    expect(presets).toHaveLength(59)
    expect(new Set(presets.map(p => p.id)).size).toBe(presets.length)
    for (const p of presets) {
      expect(p.method).toBeTruthy()
      expect(p.expect).toBeTruthy()
      expect(JSON.parse(JSON.stringify(p.params))).toEqual(p.params)
    }
  })
  it('counts per method match the catalogue', () => {
    const count = (m: string) => presets.filter(p => p.method === m).length
    expect(count('ton_signData')).toBe(10)
    expect(count('ton_sendMessage')).toBe(13)
    expect(count('personal_sign')).toBe(6) // 5 BSC + 1 custom chain
    expect(count('eth_signTypedData_v4')).toBe(10)
    expect(count('eth_sendTransaction')).toBe(12)
    expect(count('wallet_switchEthereumChain')).toBe(2)
    for (const m of SDK_LOCAL_METHODS) expect(count(m)).toBe(1)
  })
  it('substitutes the connected addresses', () => {
    expect(byId('ton-sign-text').params).toMatchObject({ from: TON })
    expect(byId('ton-send').params).toMatchObject({ from: TON, network: '-3', messages: [{ address: TON }] })
    expect(byId('bsc-ps').params).toEqual(['0x48656c6c6f', BSC])
    expect((byId('bsc-tx').params as unknown[])[0]).toMatchObject({ from: BSC, to: BSC })
    expect((byId('bsc-td-mail').params as unknown[])[0]).toBe(BSC)
  })
  it('sets valid_until to now + 300, and now - 60 for the expired row', () => {
    expect(byId('ton-send').params).toMatchObject({ valid_until: ctx.now + 300 })
    expect(byId('ton-send-expired').params).toMatchObject({ valid_until: ctx.now - 60 })
  })
  it('changes only the listed field from the base payload', () => {
    const base = byId('ton-send').params as Record<string, unknown>
    expect(byId('ton-send-network').params).toEqual({ ...base, network: '-239' })
    expect((byId('ton-send-5').params as { messages: unknown[] }).messages).toHaveLength(5)
  })
  it('uses the other chain for chain-mismatch rows', () => {
    expect(wrongChainId(97)).toBe(56)
    expect(wrongChainId(56)).toBe(97)
    expect((byId('bsc-tx-chainid').params as Record<string, unknown>[])[0].chainId).toBe('0x38')
    const td = JSON.parse((byId('bsc-td-chain').params as string[])[1])
    expect(td.domain.chainId).toBe(56)
    expect(byId('bsc-switch-same').params).toEqual([{ chainId: '0x61' }])
  })
  it('Permit uses the loaded token, else a placeholder', () => {
    const p1 = JSON.parse((byId('bsc-td-permit').params as string[])[1])
    expect(p1.domain).toMatchObject({ name: 'Test Token', verifyingContract: OTHER_BSC })
    const withToken = buildPresets({ ...ctx, token: { address: BSC, name: 'Real' } }).find(p => p.id === 'bsc-td-permit')!
    expect(JSON.parse((withToken.params as string[])[1]).domain).toMatchObject({ name: 'Real', verifyingContract: BSC })
  })
  it('custom chain row targets eip155:1', () => {
    expect(byId('custom-eip155-1')).toMatchObject({ chain: 'custom', caip: 'eip155:1' })
  })
})
