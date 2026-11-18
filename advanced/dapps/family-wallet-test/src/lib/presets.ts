// Raw-panel presets: one per method / payload / error in WALLET-FEATURES.md §3–5.
import { commentPayload } from './tonPayload'
import { mailTypedData, permitTypedData } from './typedData'
import { toHex, toQuantity } from './util'

export type PresetChain = 'ton' | 'bsc' | 'custom'

export interface Preset {
  id: string
  label: string
  chain: PresetChain
  /** Only for chain "custom": the caip chain id to send to. */
  caip?: string
  method: string
  params: unknown
  expect: string
}

export interface PresetContext {
  tonFrom: string
  bscFrom: string
  tonNetwork: string // "-3"
  bscChainId: number // 97 or 56
  now: number // unix seconds
  /** Loaded BSC token, for the Permit preset. */
  token?: { address: string; name: string }
}

export const OTHER_TON = '0:' + '0'.repeat(64)
export const OTHER_BSC = '0x000000000000000000000000000000000000dEaD'
/** Empty contract init code (deploys a contract that reverts on every call). */
export const DEPLOY_CODE =
  '0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe6080604052600080fdfea164736f6c6343000818000a'

/** BSC chain id that is not the session chain: 56 when on 97, else 97. */
export const wrongChainId = (chainId: number) => (chainId === 97 ? 56 : 97)

export const SDK_LOCAL_METHODS = [
  'eth_sign',
  'eth_signTransaction',
  'eth_sendRawTransaction',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'wallet_addEthereumChain'
] as const

export function buildPresets(ctx: PresetContext): Preset[] {
  const { tonFrom, bscFrom, tonNetwork, bscChainId, now } = ctx
  const wrongHex = toQuantity(BigInt(wrongChainId(bscChainId)))
  const out: Preset[] = []
  const add = (chain: PresetChain, method: string, id: string, label: string, params: unknown, expect: string, caip?: string) =>
    out.push({ id, label, chain, method, params, expect, ...(caip ? { caip } : {}) })

  // ---- TON ton_signData ----
  const sign = { type: 'text', text: 'Hello', from: tonFrom }
  const tonSign = (id: string, label: string, params: unknown, expect: string) => add('ton', 'ton_signData', id, label, params, expect)
  tonSign('ton-sign-text', 'text', sign, 'sheet → signature')
  tonSign('ton-sign-array', 'text, params as [object]', [sign], 'sheet → signature')
  tonSign('ton-sign-binary', 'binary', { type: 'binary', bytes: 'SGVsbG8=', from: tonFrom }, 'sheet with binary warning → signature')
  tonSign(
    'ton-sign-cell',
    'cell',
    { type: 'cell', schema: 'comment#00000000 text:SnakeData = InMsgBody;', cell: commentPayload('Hello'), from: tonFrom },
    '-32602 cell sign data not supported'
  )
  tonSign('ton-sign-bad-text', 'text is a number', { ...sign, text: 123 }, '-32602 Invalid text')
  tonSign('ton-sign-empty-bytes', 'empty bytes', { type: 'binary', bytes: '', from: tonFrom }, '-32602 Invalid bytes')
  tonSign('ton-sign-type', 'unknown type', { ...sign, type: 'foo' }, '-32602 Unsupported sign data type')
  tonSign('ton-sign-network', 'wrong network', { ...sign, network: '-239' }, '-32602 Network mismatch')
  tonSign('ton-sign-from', 'wrong from', { ...sign, from: OTHER_TON }, '-32602 Unknown from address')
  tonSign('ton-sign-params', 'params is a string', 'Hello', '-32602 Invalid params')

  // ---- TON ton_sendMessage ----
  const msg = { address: tonFrom, amount: '10000000' }
  const base = { valid_until: now + 300, from: tonFrom, network: tonNetwork, messages: [msg] }
  const tonSend = (id: string, label: string, params: unknown, expect: string) => add('ton', 'ton_sendMessage', id, label, params, expect)
  tonSend('ton-send', '1 message, 0.01 TON to self', base, 'sheet → base64 BOC')
  tonSend('ton-send-array', 'params as [object]', [base], 'sheet → base64 BOC')
  tonSend('ton-send-empty', 'no messages', { ...base, messages: [] }, '-32602 No messages')
  tonSend('ton-send-5', '5 messages', { ...base, messages: Array(5).fill(msg) }, '-32602 At most 4 messages per transaction')
  tonSend('ton-send-expired', 'expired valid_until', { ...base, valid_until: now - 60 }, '-32602 Request has expired')
  tonSend('ton-send-ec', 'extra_currency', { ...base, messages: [{ ...msg, extra_currency: { '100': '1' } }] }, '-32602 Extra currencies are not supported')
  tonSend('ton-send-address', 'bad address', { ...base, messages: [{ ...msg, address: 'nope' }] }, '-32602 Invalid message address')
  tonSend('ton-send-amount', 'fractional amount', { ...base, messages: [{ ...msg, amount: '1.5' }] }, '-32602 Invalid message amount')
  tonSend('ton-send-payload', 'bad payload BOC', { ...base, messages: [{ ...msg, payload: '!!notboc' }] }, '-32602 Invalid message payload')
  tonSend('ton-send-stateinit', 'bad stateInit BOC', { ...base, messages: [{ ...msg, stateInit: '!!notboc' }] }, '-32602 Invalid message stateInit')
  tonSend('ton-send-network', 'wrong network', { ...base, network: '-239' }, '-32602 Network mismatch')
  tonSend('ton-send-from', 'wrong from', { ...base, from: OTHER_TON }, '-32602 Unknown from address')
  tonSend(
    'ton-send-balance',
    'above balance (1,000,000 TON)',
    { ...base, messages: [{ ...msg, amount: '1000000000000000' }] },
    'sheet with only Reject → -32000 Insufficient balance'
  )

  // ---- BSC personal_sign ----
  const ps = (id: string, label: string, params: unknown, expect: string) => add('bsc', 'personal_sign', id, label, params, expect)
  ps('bsc-ps', 'text', [toHex('Hello'), bscFrom], 'sheet → signature')
  ps('bsc-ps-hex', 'non-UTF-8 bytes', ['0xff00fe', bscFrom], 'sheet with raw hex warning → signature')
  ps('bsc-ps-empty', 'empty message', ['0x', bscFrom], '-32602 Empty message')
  ps('bsc-ps-address', 'wrong address', [toHex('x'), OTHER_BSC], '-32602 Unknown address')
  ps('bsc-ps-params', 'no params', [], '-32602 Invalid params')

  // ---- BSC eth_signTypedData_v4 ----
  const mail = mailTypedData(bscChainId)
  const permit = permitTypedData({
    chainId: bscChainId,
    token: ctx.token?.address ?? OTHER_BSC,
    tokenName: ctx.token?.name ?? 'Test Token',
    owner: bscFrom,
    spender: OTHER_BSC,
    value: 10n ** 18n,
    deadline: BigInt(now + 3600)
  })
  const { types: _t, ...mailNoTypes } = mail
  const { primaryType: _p, ...mailNoPrimary } = mail
  const td = (id: string, label: string, params: unknown, expect: string) => add('bsc', 'eth_signTypedData_v4', id, label, params, expect)
  const j = (v: unknown) => JSON.stringify(v)
  td('bsc-td-mail', 'Mail', [bscFrom, j(mail)], 'sheet → signature')
  td('bsc-td-permit', 'Permit (EIP-2612)', [bscFrom, j(permit)], 'sheet with "lets the app spend your tokens" warning')
  td('bsc-td-address', 'wrong address', [OTHER_BSC, j(mail)], '-32602 one of: Unknown address, Unknown from address')
  td('bsc-td-json', 'not JSON', [bscFrom, 'not json'], '-32602 Invalid typed data')
  td('bsc-td-no-types', 'no types', [bscFrom, j(mailNoTypes)], '-32602 one of: Invalid types, Invalid typed data')
  td('bsc-td-bad-types', 'types.Mail not an array', [bscFrom, j({ ...mail, types: { ...mail.types, Mail: 'x' } })], '-32602 Invalid types')
  td('bsc-td-no-primary', 'no primaryType', [bscFrom, j(mailNoPrimary)], '-32602 Invalid primaryType')
  td('bsc-td-primary', 'primaryType Person, message is Mail', [bscFrom, j({ ...mail, primaryType: 'Person' })], '-32602 one of: primaryType mismatch, Invalid typed data')
  td('bsc-td-domain', 'domain is a string', [bscFrom, j({ ...mail, domain: 'x' })], '-32602 Invalid domain')
  td(
    'bsc-td-chain',
    'domain.chainId of another chain',
    [bscFrom, j({ ...mail, domain: { ...mail.domain, chainId: wrongChainId(bscChainId) } })],
    '-32602 Invalid domain chainId'
  )

  // ---- BSC eth_sendTransaction ----
  const tx = { from: bscFrom, to: bscFrom, value: '0x0' }
  const { to: _to, ...txNoTo } = tx
  const st = (id: string, label: string, t: unknown, expect: string) => add('bsc', 'eth_sendTransaction', id, label, [t], expect)
  st('bsc-tx', '0 to self', tx, 'sheet → tx hash')
  st('bsc-tx-no-to', 'no to, no data', txNoTo, '-32602 Missing to')
  st('bsc-tx-bad-to', 'bad to', { ...tx, to: '0x123' }, '-32602 Invalid to')
  st('bsc-tx-deploy', 'contract deploy (data, no to)', { ...txNoTo, data: DEPLOY_CODE }, 'sheet: Contract deploy')
  st('bsc-tx-data', 'bad data', { ...tx, data: '0xzz' }, '-32602 Invalid data')
  st('bsc-tx-gas', 'bad gas', { ...tx, gas: 'zz' }, '-32602 Invalid gas')
  st('bsc-tx-chainid-bad', 'bad chainId', { ...tx, chainId: 'zz' }, '-32602 Invalid chainId')
  st('bsc-tx-chainid', 'chainId of another chain', { ...tx, chainId: wrongHex }, '-32602 Chain mismatch')
  st('bsc-tx-fees', 'gasPrice and maxFeePerGas', { ...tx, gasPrice: '0x3b9aca00', maxFeePerGas: '0x3b9aca00' }, '-32602 Both gasPrice and EIP-1559 fees')
  st('bsc-tx-priority', 'priority above max fee', { ...tx, maxFeePerGas: '0x1', maxPriorityFeePerGas: '0x2' }, '-32602 maxPriorityFeePerGas above maxFeePerGas')
  st('bsc-tx-from', 'wrong from', { ...tx, from: OTHER_BSC }, '-32602 Unknown from address')
  st('bsc-tx-balance', 'value above balance (1e27 wei)', { ...tx, value: toQuantity(10n ** 27n) }, 'sheet with only Reject → -32000 Insufficient balance')

  // ---- BSC wallet_switchEthereumChain ----
  add('bsc', 'wallet_switchEthereumChain', 'bsc-switch-same', 'session chain', [{ chainId: toQuantity(BigInt(bscChainId)) }], 'null (answered locally by the SDK, not the wallet)')
  add('bsc', 'wallet_switchEthereumChain', 'bsc-switch-other', 'Ethereum (0x1)', [{ chainId: '0x1' }], '4902 Unrecognized chain')

  // ---- Refused methods (the SDK answers these itself) ----
  const refused: Record<(typeof SDK_LOCAL_METHODS)[number], unknown> = {
    eth_sign: [bscFrom, toHex('Hello')],
    eth_signTransaction: [tx],
    eth_sendRawTransaction: ['0x00'],
    eth_signTypedData: [[{ type: 'string', name: 'message', value: 'Hello' }], bscFrom],
    eth_signTypedData_v3: [bscFrom, j(mail)],
    wallet_addEthereumChain: [
      { chainId: '0x1', chainName: 'Ethereum', rpcUrls: ['https://ethereum-rpc.publicnode.com'], nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } }
    ]
  }
  for (const m of SDK_LOCAL_METHODS) add('bsc', m, `bsc-refused-${m}`, 'refused method', refused[m], 'local SDK error (wallet would answer 5101)')

  // ---- Chain not in the session ----
  add('custom', 'personal_sign', 'custom-eip155-1', 'chain eip155:1 (not in session)', [toHex('x'), bscFrom], 'local SDK error (wallet would answer 5100)', 'eip155:1')

  return out
}
