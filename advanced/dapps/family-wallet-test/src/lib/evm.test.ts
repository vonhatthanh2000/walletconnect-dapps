import { describe, expect, it } from 'vitest'
import { MAX_UINT256, approveData, approveUnlimitedData, erc20, setApprovalForAllData, transferData } from './evm'

const A = '0x000000000000000000000000000000000000dEaD'

describe('calldata', () => {
  it('transfer', () => {
    const [to, amount] = erc20.decodeFunctionData('transfer', transferData(A, 123n))
    expect(to).toBe(A)
    expect(amount).toBe(123n)
  })
  it('approve and approve unlimited', () => {
    expect(erc20.decodeFunctionData('approve', approveData(A, 5n))[1]).toBe(5n)
    const [spender, amount] = erc20.decodeFunctionData('approve', approveUnlimitedData(A))
    expect(spender).toBe(A)
    expect(amount).toBe(MAX_UINT256)
  })
  it('setApprovalForAll(operator, true)', () => {
    const [op, approved] = erc20.decodeFunctionData('setApprovalForAll', setApprovalForAllData(A))
    expect(op).toBe(A)
    expect(approved).toBe(true)
  })
})
