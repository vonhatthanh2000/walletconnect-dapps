import { createAppKit } from '@reown/appkit'
import {
  bsc as bscChain,
  bscTestnet as bscTestnetChain,
  tonTestnet as tonTestnetChain,
  type AppKitNetwork
} from '@reown/appkit/networks'
import { TonAdapter } from '@reown/appkit-adapter-ton'

// Cast: AppKit 1.8.24 pulls two viem versions, which makes the network type mismatch at compile time only.
const tonTestnet = tonTestnetChain as typeof tonTestnetChain & AppKitNetwork

const env = import.meta.env
const PROJECT_ID = env.VITE_PROJECT_ID as string
const BOT = env.VITE_BOT_USERNAME as string
// Accept "api.example.com" or "https://api.example.com/" — normalize to "https://api.example.com"
const toOrigin = (v?: string) => (v ? `https://${v.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')}` : '')
const API_ORIGIN = toOrigin(env.VITE_API_HOST as string)
const SEND_TO = (env.VITE_SEND_TO as string) || ''
const BSC_SEND_TO = (env.VITE_BSC_SEND_TO as string) || ''
// BSC testnet (97) by default, to match TON testnet. Set VITE_BSC_NETWORK=mainnet for BSC mainnet (56).
const BSC_MAINNET = (env.VITE_BSC_NETWORK as string)?.trim().toLowerCase() === 'mainnet'
const bscNet = (BSC_MAINNET ? bscChain : bscTestnetChain) as AppKitNetwork
const BSC_CAIP = `eip155:${bscNet.id}`

type Chain = 'ton' | 'bsc'
const CHAINS: Record<Chain, { network: AppKitNetwork; caip: string; namespace: 'ton' | 'eip155'; symbol: string; decimals: number }> = {
  ton: { network: tonTestnet, caip: tonTestnet.caipNetworkId, namespace: 'ton', symbol: 'TON', decimals: 9 },
  bsc: { network: bscNet, caip: BSC_CAIP, namespace: 'eip155', symbol: BSC_MAINNET ? 'BNB' : 'tBNB', decimals: 18 }
}

const missing = Object.entries({
  VITE_PROJECT_ID: PROJECT_ID,
  VITE_BOT_USERNAME: BOT,
  VITE_API_HOST: API_ORIGIN
})
  .filter(([, v]) => !v)
  .map(([k]) => k)

// Trailing slash matters: AppKit appends `wc?uri=<encoded wc: URI>`.
const BRIDGE_LINK = `${API_ORIGIN}/walletconnect-bridge/`
// Served by Vite from public/walletkit-icon.png
const ICON_URL = `${window.location.origin}/walletkit-icon.png`

const $ = (id: string) => document.getElementById(id)!
const log = (label: string, data: unknown) => {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  $('log').textContent = `[${new Date().toLocaleTimeString()}] ${label}\n${text}\n\n` + $('log').textContent
}

$('env').textContent = missing.length
  ? `Missing env: ${missing.join(', ')}. Copy .env.example to .env and fill it in.`
  : `Bridge: ${BRIDGE_LINK} · Bot: @${BOT} · Networks: ${tonTestnet.name} (${tonTestnet.caipNetworkId}), ${bscNet.name} (${BSC_CAIP})`

// No EVM adapter installed: AppKit uses its built-in UniversalAdapter for eip155,
// so BSC requests go straight through the WalletConnect universal provider.
const appKit = createAppKit({
  adapters: [new TonAdapter()],
  networks: [tonTestnet as AppKitNetwork, bscNet],
  defaultNetwork: tonTestnet as AppKitNetwork,
  projectId: PROJECT_ID,
  metadata: {
    name: 'Family Wallet Test dApp',
    description: 'Deep-link test for the Family Wallet bridge',
    url: window.location.origin,
    icons: [ICON_URL]
  },
  customWallets: [
    {
      id: 'family-wallet',
      name: 'Family Wallet',
      homepage: `https://t.me/${BOT}`,
      image_url: ICON_URL,
      // Phone browser: AppKit opens `${mobile_link}wc?uri=...`
      mobile_link: BRIDGE_LINK,
      // Desktop browser: AppKit opens `${desktop_link}wc?uri=...` in a new tab
      // instead of only showing a QR code. Same bridge route.
      desktop_link: BRIDGE_LINK
    }
  ],
  features: { analytics: false, email: false, socials: false }
})

// ---- Deep-link debug panel: capture the pairing URI AppKit generates ----
function showDeepLink(uri: string) {
  const link = `${BRIDGE_LINK}wc?uri=${encodeURIComponent(uri)}`
  const box = $('deeplink')
  box.innerHTML = ''
  const a = document.createElement('a')
  a.href = link
  a.target = '_blank'
  a.rel = 'noopener'
  a.textContent = link
  const open = document.createElement('button')
  open.textContent = 'Open bridge link'
  open.onclick = () => window.open(link, '_blank', 'noopener')
  const copy = document.createElement('button')
  copy.textContent = 'Copy'
  copy.onclick = () => navigator.clipboard.writeText(link).then(() => log('Copied bridge link', link))
  const raw = document.createElement('pre')
  raw.textContent = uri
  box.append(a, document.createElement('br'), open, copy, raw)
}

appKit.getUniversalProvider().then(provider => {
  provider?.on('display_uri', (uri: string) => {
    log('display_uri', uri)
    showDeepLink(uri)
  })
})

// ---- Chain selection ----
let chain: Chain = 'ton'
const addresses: Record<Chain, string> = { ton: '', bsc: '' }
const accountState: Record<Chain, unknown> = { ton: null, bsc: null }

function render() {
  const c = CHAINS[chain]
  const address = addresses[chain]
  $('account').textContent = accountState[chain] ? JSON.stringify(accountState[chain], null, 2) : `Not connected on ${c.network.name}`
  ;($('sign') as HTMLButtonElement).disabled = !address
  ;($('send') as HTMLButtonElement).disabled = !address
  $('amount-unit').textContent = c.symbol
  const to = $('to') as HTMLInputElement
  to.placeholder = chain === 'ton' ? 'EQ… / UQ… / 0:… (TON address)' : '0x… (BSC address)'
  $('send-hint').textContent = chain === 'ton'
    ? `Sends ton_sendMessage on ${c.network.name}. Empty recipient → ${SEND_TO ? 'VITE_SEND_TO' : 'your own address'}.`
    : `Sends eth_sendTransaction on ${c.network.name} (${c.caip}). Empty recipient → ${BSC_SEND_TO ? 'VITE_BSC_SEND_TO' : 'your own address'}.`
}

document.querySelectorAll<HTMLInputElement>('input[name="chain"]').forEach(radio => {
  radio.onchange = async () => {
    if (!radio.checked) return
    chain = radio.value as Chain
    render()
    try {
      await appKit.switchNetwork(CHAINS[chain].network)
      log('Switched network', CHAINS[chain].caip)
    } catch (e) {
      log('✗ switchNetwork', String((e as Error)?.message ?? e))
    }
  }
})

// ---- Account state (one subscription per namespace) ----
;(Object.keys(CHAINS) as Chain[]).forEach(key => {
  appKit.subscribeAccount(state => {
    const was = addresses[key]
    addresses[key] = state.isConnected ? state.address ?? '' : ''
    accountState[key] = state.isConnected ? state : null
    if (addresses[key] && addresses[key] !== was) log(`Connected (${key.toUpperCase()})`, { address: state.address, caipAddress: state.caipAddress })
    render()
  }, CHAINS[key].namespace)
})
render()

// Raw requests through the universal provider so the page shows the wallet's full response.
async function request(method: string, params: unknown, caip: string) {
  const provider = await appKit.getUniversalProvider()
  if (!provider) throw new Error('Universal provider not ready')
  log(`→ ${method} (${caip})`, params)
  return provider.request({ method, params: params as object }, caip)
}

// "1.5" → 1500000000n for 9 decimals. String math, so no float rounding.
function parseUnits(value: string, decimals: number): bigint {
  const v = value.trim()
  if (!/^\d+(\.\d+)?$/.test(v)) throw new Error(`Invalid amount: "${value}"`)
  const [whole, frac = ''] = v.split('.')
  if (frac.length > decimals) throw new Error(`Too many decimals (max ${decimals})`)
  return BigInt(whole + frac.padEnd(decimals, '0'))
}

const isEvmAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a)
// Raw (0:<64 hex>) or user-friendly (48 base64/base64url chars). The wallet does the full check.
const isTonAddress = (a: string) => /^-?\d+:[0-9a-fA-F]{64}$/.test(a) || /^[A-Za-z0-9_\-+/]{48}$/.test(a)

const toHex = (s: string) => '0x' + Array.from(new TextEncoder().encode(s), b => b.toString(16).padStart(2, '0')).join('')

$('sign').onclick = async () => {
  const c = CHAINS[chain]
  const from = addresses[chain]
  const text = `Family Wallet test ${new Date().toISOString()}`
  const method = chain === 'ton' ? 'ton_signData' : 'personal_sign'
  try {
    const result = chain === 'ton'
      ? await request(method, [{ type: 'text', text, from }], c.caip)
      : await request(method, [toHex(text), from], c.caip)
    log(`✓ ${method}`, result)
  } catch (e) {
    log(`✗ ${method}`, String((e as Error)?.message ?? e))
  }
}

$('send-form').onsubmit = async ev => {
  ev.preventDefault()
  const c = CHAINS[chain]
  const from = addresses[chain]
  const toInput = ($('to') as HTMLInputElement).value.trim()
  const amountInput = ($('amount') as HTMLInputElement).value
  const method = chain === 'ton' ? 'ton_sendMessage' : 'eth_sendTransaction'
  try {
    const to = toInput || (chain === 'ton' ? SEND_TO : BSC_SEND_TO) || from
    if (chain === 'ton' && !isTonAddress(to)) throw new Error(`Not a TON address: ${to}`)
    if (chain === 'bsc' && !isEvmAddress(to)) throw new Error(`Not a BSC address: ${to}`)
    const amount = parseUnits(amountInput, c.decimals)
    if (amount <= 0n) throw new Error('Amount must be greater than 0')

    const result = chain === 'ton'
      ? await request(method, {
          valid_until: Math.floor(Date.now() / 1000) + 300,
          from,
          network: tonTestnet.id, // "-3"
          messages: [{ address: to, amount: amount.toString() }] // nanotons
        }, c.caip)
      : await request(method, [{ from, to, value: '0x' + amount.toString(16) }], c.caip) // wei
    log(`✓ ${method}`, result)
  } catch (e) {
    log(`✗ ${method}`, String((e as Error)?.message ?? e))
  }
}
