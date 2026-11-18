// TON message payload BOCs (base64), built with @ton/core.
import { Address, beginCell } from '@ton/core'

/** Text comment: op 0 + UTF-8 text (snake). */
export const commentPayload = (text: string) =>
  beginCell().storeUint(0, 32).storeStringTail(text).endCell().toBoc().toString('base64')

/** Jetton transfer (TEP-74), sent to the sender's jetton wallet. */
export function jettonTransferPayload(o: {
  amount: bigint
  destination: string
  responseDestination: string
  queryId?: bigint
}): string {
  return beginCell()
    .storeUint(0x0f8a7ea5, 32) // op: transfer
    .storeUint(o.queryId ?? BigInt(Date.now()), 64)
    .storeCoins(o.amount)
    .storeAddress(Address.parse(o.destination))
    .storeAddress(Address.parse(o.responseDestination))
    .storeBit(0) // no custom_payload
    .storeCoins(1n) // forward_ton_amount: 1 nanoton
    .storeBit(0) // forward_payload inline, empty
    .endCell()
    .toBoc()
    .toString('base64')
}
