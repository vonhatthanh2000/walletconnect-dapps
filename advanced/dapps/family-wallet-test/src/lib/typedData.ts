// EIP-712 typed data for eth_signTypedData_v4 (spec §4), plus local verification.
import { verifyTypedData } from 'ethers'

type Field = { name: string; type: string }
export interface TypedData {
  types: Record<string, Field[]>
  primaryType: string
  domain: Record<string, unknown>
  message: Record<string, unknown>
}

const DOMAIN_FIELDS: Field[] = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' }
]

/** The EIP-712 "Ether Mail" example. */
export function mailTypedData(chainId: number): TypedData {
  return {
    types: {
      EIP712Domain: DOMAIN_FIELDS,
      Person: [
        { name: 'name', type: 'string' },
        { name: 'wallet', type: 'address' }
      ],
      Mail: [
        { name: 'from', type: 'Person' },
        { name: 'to', type: 'Person' },
        { name: 'contents', type: 'string' }
      ]
    },
    primaryType: 'Mail',
    domain: { name: 'Ether Mail', version: '1', chainId, verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC' },
    message: {
      from: { name: 'Cow', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
      to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
      contents: 'Hello, Bob!'
    }
  }
}

/** EIP-2612 Permit. Quantities as decimal strings so the data survives JSON. */
export function permitTypedData(o: {
  chainId: number
  token: string
  tokenName: string
  owner: string
  spender: string
  value: bigint
  nonce?: bigint
  deadline: bigint
}): TypedData {
  return {
    types: {
      EIP712Domain: DOMAIN_FIELDS,
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    },
    primaryType: 'Permit',
    domain: { name: o.tokenName, version: '1', chainId: o.chainId, verifyingContract: o.token },
    message: {
      owner: o.owner,
      spender: o.spender,
      value: o.value.toString(),
      nonce: (o.nonce ?? 0n).toString(),
      deadline: o.deadline.toString()
    }
  }
}

/** ethers wants the types without EIP712Domain (otherwise "ambiguous primary types"). */
export function typesWithoutDomain(types: TypedData['types']) {
  const { EIP712Domain: _omit, ...rest } = types
  return rest
}

/** Recovers the signer address of a typed-data signature. */
export const recoverTypedData = (data: TypedData, signature: string) =>
  verifyTypedData(data.domain, typesWithoutDomain(data.types), data.message, signature)
