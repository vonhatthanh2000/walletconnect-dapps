// ERC-20 / ERC-721 calldata builders for eth_sendTransaction (spec §4).
import { Interface } from 'ethers'

export const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function setApprovalForAll(address operator, bool approved)'
]

export const erc20 = new Interface(ERC20_ABI)
export const MAX_UINT256 = 2n ** 256n - 1n

export const transferData = (to: string, amount: bigint) => erc20.encodeFunctionData('transfer', [to, amount])
export const approveData = (spender: string, amount: bigint) => erc20.encodeFunctionData('approve', [spender, amount])
export const approveUnlimitedData = (spender: string) => approveData(spender, MAX_UINT256)
export const setApprovalForAllData = (operator: string) => erc20.encodeFunctionData('setApprovalForAll', [operator, true])
