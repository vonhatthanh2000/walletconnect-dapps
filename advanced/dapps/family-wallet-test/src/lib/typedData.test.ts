import { describe, expect, it } from 'vitest'
import { Wallet } from 'ethers'
import { mailTypedData, permitTypedData, recoverTypedData, typesWithoutDomain } from './typedData'

const wallet = new Wallet('0x' + '11'.repeat(32))

describe('typed data', () => {
  it('Mail follows the chainId argument', () => {
    const d = mailTypedData(97)
    expect(d.primaryType).toBe('Mail')
    expect(d.domain.chainId).toBe(97)
    expect(d.types.EIP712Domain.map(f => f.name)).toEqual(Object.keys(d.domain))
  })
  it('Permit shape', () => {
    const d = permitTypedData({ chainId: 56, token: wallet.address, tokenName: 'T', owner: wallet.address, spender: wallet.address, value: 5n, deadline: 100n })
    expect(d.primaryType).toBe('Permit')
    expect(d.domain).toEqual({ name: 'T', version: '1', chainId: 56, verifyingContract: wallet.address })
    expect(d.message).toEqual({ owner: wallet.address, spender: wallet.address, value: '5', nonce: '0', deadline: '100' })
    expect(JSON.parse(JSON.stringify(d))).toEqual(d)
  })
  it('round-trips a signature for Mail and Permit', async () => {
    for (const d of [
      mailTypedData(97),
      permitTypedData({ chainId: 97, token: '0x000000000000000000000000000000000000dEaD', tokenName: 'Test Token', owner: wallet.address, spender: wallet.address, value: 10n ** 18n, deadline: 2000000000n })
    ]) {
      const sig = await wallet.signTypedData(d.domain, typesWithoutDomain(d.types), d.message)
      expect(recoverTypedData(d, sig)).toBe(wallet.address)
    }
  })
})
