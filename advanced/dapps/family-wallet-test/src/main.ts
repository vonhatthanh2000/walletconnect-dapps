import { createAppKit } from '@reown/appkit'
import { tonTestnet as tonTestnetChain, type AppKitNetwork } from '@reown/appkit/networks'
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
  : `Bridge: ${BRIDGE_LINK} · Bot: @${BOT} · Network: ${tonTestnet.name} (${tonTestnet.caipNetworkId})`

const appKit = createAppKit({
  adapters: [new TonAdapter()],
  networks: [tonTestnet as AppKitNetwork],
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

// ---- Account state ----
let address = ''
appKit.subscribeAccount(state => {
  address = state.isConnected ? state.address ?? '' : ''
  $('account').textContent = state.isConnected ? JSON.stringify(state, null, 2) : 'Not connected'
  ;($('sign') as HTMLButtonElement).disabled = !address
  ;($('send') as HTMLButtonElement).disabled = !address
  if (state.isConnected) log('Connected', { address: state.address, caipAddress: state.caipAddress })
}, 'ton')

// Raw requests through the universal provider so the page shows the wallet's full response.
async function request(method: string, params: object) {
  const provider = await appKit.getUniversalProvider()
  if (!provider) throw new Error('Universal provider not ready')
  log(`→ ${method}`, params)
  return provider.request({ method, params }, tonTestnet.caipNetworkId)
}

$('sign').onclick = async () => {
  try {
    const result = await request('ton_signData', [
      { type: 'text', text: `Family Wallet test ${new Date().toISOString()}`, from: address }
    ])
    log('✓ ton_signData', result)
  } catch (e) {
    log('✗ ton_signData', String((e as Error)?.message ?? e))
  }
}

$('send').onclick = async () => {
  try {
    const result = await request('ton_sendMessage', {
      valid_until: Math.floor(Date.now() / 1000) + 300,
      from: address,
      network: tonTestnet.id, // "-3"
      messages: [{ address: SEND_TO || address, amount: '10000000' }] // 0.01 TON in nanotons
    })
    log('✓ ton_sendMessage', result)
  } catch (e) {
    log('✗ ton_sendMessage', String((e as Error)?.message ?? e))
  }
}
