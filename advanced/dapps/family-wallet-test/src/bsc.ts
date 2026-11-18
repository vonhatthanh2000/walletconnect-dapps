// BSC panels: personal_sign / typed data (+ checks), native send, token actions, dApp-supplied tx fields.
import { JsonRpcProvider, Contract, verifyMessage } from 'ethers'
import { $, BSC_CHAIN_ID, BSC_RPC, BSC_SEND_TO, BSC_TOKEN, CHAINS, input, log, logError, onRender, run, send, state } from './core'
import { ERC20_ABI, approveData, approveUnlimitedData, setApprovalForAllData, transferData } from './lib/evm'
import { mailTypedData, permitTypedData, recoverTypedData, type TypedData } from './lib/typedData'
import { formatUnits, isEvmAddress, nowSeconds, parseUnits, toHex, toQuantity } from './lib/util'

const c = CHAINS.bsc

// Read-only RPC (the wallet has no read methods). staticNetwork: don't retry network detection forever.
let reader: JsonRpcProvider | undefined
const rpc = () => (reader ??= new JsonRpcProvider(BSC_RPC, BSC_CHAIN_ID, { staticNetwork: true }))

interface Token { address: string; name: string; symbol: string; decimals: number; balance: bigint }
let token: Token | undefined
/** The loaded token, for the raw panel's Permit preset. */
export const loadedToken = () => token

function logMatch(label: string, recovered: string, expected: string) {
  const match = recovered.toLowerCase() === expected.toLowerCase()
  log(`${match ? '✓' : '✗'} ${label}: ${match ? 'match' : 'mismatch'}`, { recovered, connected: expected })
}

// ---- Signing (§4 personal_sign, eth_signTypedData_v4) ----

async function personalSign() {
  const from = state.addresses.bsc
  const text = input('bsc-text').value
  const sig = await run('personal_sign', () => send('personal_sign', [toHex(text), from], 'bsc'))
  if (typeof sig !== 'string') return
  try {
    logMatch('personal_sign recovered address', verifyMessage(text, sig), from)
  } catch (e) {
    logError('verifyMessage', e)
  }
}

async function signTyped(label: string, build: () => TypedData) {
  const from = state.addresses.bsc
  let data: TypedData
  try {
    data = build()
  } catch (e) {
    logError(label, e)
    return
  }
  const sig = await run(`eth_signTypedData_v4 (${label})`, () => send('eth_signTypedData_v4', [from, JSON.stringify(data)], 'bsc'))
  if (typeof sig !== 'string') return
  try {
    logMatch(`${label} recovered address`, recoverTypedData(data, sig), from)
  } catch (e) {
    logError('verifyTypedData', e)
  }
}

const buildPermit = () => {
  if (!token) throw new Error('Load a token first')
  const spender = input('bsc-tk-spender').value.trim()
  if (!isEvmAddress(spender)) throw new Error(`Not a BSC address (spender): ${spender}`)
  return permitTypedData({
    chainId: BSC_CHAIN_ID,
    token: token.address,
    tokenName: token.name,
    owner: state.addresses.bsc,
    spender,
    value: parseUnits(input('bsc-tk-amount').value, token.decimals),
    deadline: BigInt(nowSeconds() + 3600)
  })
}

// ---- Transactions (§4 eth_sendTransaction) ----

/** Adds the dApp-supplied fields chosen in the checkboxes (§7.9). */
async function withExtras(tx: Record<string, string>) {
  const out = { ...tx }
  if (input('bsc-x-gas').checked) out.gas = '0x30d40'
  if (input('bsc-x-gasprice').checked) {
    const price = (await rpc().getFeeData()).gasPrice
    if (price == null) throw new Error('gasPrice: the RPC returned no gas price')
    out.gasPrice = toQuantity(price * 2n)
  }
  if (input('bsc-x-nonce').checked) out.nonce = '0x0'
  return out
}

async function sendTx(label: string, build: () => Record<string, string>) {
  await run(`eth_sendTransaction (${label})`, async () => send('eth_sendTransaction', [await withExtras(build())], 'bsc'))
}

function nativeTx() {
  const from = state.addresses.bsc
  const to = input('bsc-to').value.trim() || BSC_SEND_TO || from
  if (!isEvmAddress(to)) throw new Error(`Not a BSC address: ${to}`)
  const amount = parseUnits(input('bsc-amount').value, c.decimals)
  if (amount <= 0n) throw new Error('Amount must be greater than 0')
  return { from, to, value: toQuantity(amount) } // wei
}

const field = (id: string, what: string) => {
  const v = input(id).value.trim()
  if (!isEvmAddress(v)) throw new Error(`Not a BSC address (${what}): ${v}`)
  return v
}
const tokenAddress = () => field('bsc-token', 'token')
const tokenTx = (data: string) => ({ from: state.addresses.bsc, to: token?.address ?? tokenAddress(), data, value: '0x0' })
const tokenAmount = () => {
  if (!token) throw new Error('Load a token first')
  return parseUnits(input('bsc-tk-amount').value, token.decimals)
}

async function loadToken() {
  token = undefined
  render()
  try {
    const address = tokenAddress()
    const ct = new Contract(address, ERC20_ABI, rpc())
    const owner = state.addresses.bsc
    const [name, symbol, decimals, balance] = await Promise.all([
      ct.name() as Promise<string>,
      ct.symbol() as Promise<string>,
      ct.decimals() as Promise<bigint>,
      ct.balanceOf(owner) as Promise<bigint>
    ])
    token = { address, name, symbol, decimals: Number(decimals), balance }
    log('Token loaded', { ...token, balanceFormatted: formatUnits(balance, Number(decimals)) })
  } catch (e) {
    logError('Token load', e)
  }
  render()
}

function render() {
  const off = !state.addresses.bsc
  document.querySelectorAll<HTMLButtonElement>('[data-chain="bsc"] button[data-needs-account]').forEach(b => (b.disabled = off))
  document.querySelectorAll<HTMLButtonElement>('[data-chain="bsc"] button[data-needs-token]').forEach(b => (b.disabled = off || !token))
  $('bsc-token-info').textContent = token
    ? `${token.name} (${token.symbol}), ${token.decimals} decimals · balance ${formatUnits(token.balance, token.decimals)} ${token.symbol}`
    : 'Not loaded'
  $('bsc-amount-unit').textContent = c.symbol
}

export function initBsc() {
  input('bsc-text').value = `Family Wallet test ${new Date().toISOString()}`
  input('bsc-token').value = BSC_TOKEN
  input('bsc-token').oninput = () => {
    token = undefined
    render()
  }
  $('bsc-send-hint').textContent = `eth_sendTransaction on ${c.network.name} (${c.caip}). Empty recipient → ${BSC_SEND_TO ? 'VITE_BSC_SEND_TO' : 'your own address'}.`

  $('bsc-sign').onclick = personalSign
  $('bsc-typed-mail').onclick = () => signTyped('Mail', () => mailTypedData(BSC_CHAIN_ID))
  $('bsc-typed-permit').onclick = () => signTyped('Permit', buildPermit)
  $('bsc-send-form').onsubmit = ev => {
    ev.preventDefault()
    return sendTx('native', nativeTx)
  }
  $('bsc-token-load').onclick = loadToken
  $('bsc-tk-transfer').onclick = () => sendTx('transfer', () => tokenTx(transferData(field('bsc-tk-to', 'recipient'), tokenAmount())))
  $('bsc-tk-approve').onclick = () => sendTx('approve', () => tokenTx(approveData(field('bsc-tk-spender', 'spender'), tokenAmount())))
  $('bsc-tk-approve-max').onclick = () => sendTx('approve unlimited', () => tokenTx(approveUnlimitedData(field('bsc-tk-spender', 'spender'))))
  $('bsc-tk-approve-all').onclick = () => sendTx('setApprovalForAll', () => tokenTx(setApprovalForAllData(field('bsc-tk-spender', 'operator'))))
  $('bsc-tk-fail').onclick = () =>
    sendTx('transfer above balance', () => {
      if (!token) throw new Error('Load a token first')
      return tokenTx(transferData(field('bsc-tk-to', 'recipient'), token.balance + 1n))
    })
  onRender(render)
}
