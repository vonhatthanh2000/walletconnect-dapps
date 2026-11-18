// Shared state: env, chains, AppKit, the universal provider, logging and requests.
import { createAppKit } from '@reown/appkit'
import {
  bsc as bscChain,
  bscTestnet as bscTestnetChain,
  tonTestnet as tonTestnetChain,
  type AppKitNetwork
} from '@reown/appkit/networks'
import { TonAdapter } from '@reown/appkit-adapter-ton'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import UniversalProvider from '@walletconnect/universal-provider'
import { checkSession, classifyError, stringify, type SessionNamespace } from './lib/util'

// Cast: AppKit 1.8.24 pulls two viem versions, which makes the network type mismatch at compile time only.
export const tonTestnet = tonTestnetChain as typeof tonTestnetChain & AppKitNetwork

const env = import.meta.env
export const PROJECT_ID = env.VITE_PROJECT_ID as string
export const BOT = env.VITE_BOT_USERNAME as string
// Accept "api.example.com" or "https://api.example.com/" — normalize to "https://api.example.com"
const toOrigin = (v?: string) => (v ? `https://${v.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')}` : '')
export const API_ORIGIN = toOrigin(env.VITE_API_HOST as string)
export const SEND_TO = (env.VITE_SEND_TO as string) || ''
export const BSC_SEND_TO = (env.VITE_BSC_SEND_TO as string) || ''
// BSC testnet (97) by default, to match TON testnet. Set VITE_BSC_NETWORK=mainnet for BSC mainnet (56).
export const BSC_MAINNET = (env.VITE_BSC_NETWORK as string)?.trim().toLowerCase() === 'mainnet'
const bscNet = (BSC_MAINNET ? bscChain : bscTestnetChain) as AppKitNetwork
const BSC_CAIP = `eip155:${bscNet.id}`
export const BSC_CHAIN_ID = Number(bscNet.id)
export const BSC_RPC =
  (env.VITE_BSC_RPC as string)?.trim() ||
  (BSC_MAINNET ? 'https://bsc-dataseed.bnbchain.org' : 'https://data-seed-prebsc-1-s1.bnbchain.org:8545')
export const BSC_TOKEN = (env.VITE_BSC_TOKEN as string)?.trim() || ''

export type Chain = 'ton' | 'bsc'
export const CHAINS: Record<Chain, { network: AppKitNetwork; caip: string; namespace: 'ton' | 'eip155'; symbol: string; decimals: number }> = {
  ton: { network: tonTestnet, caip: tonTestnet.caipNetworkId, namespace: 'ton', symbol: 'TON', decimals: 9 },
  bsc: { network: bscNet, caip: BSC_CAIP, namespace: 'eip155', symbol: BSC_MAINNET ? 'BNB' : 'tBNB', decimals: 18 }
}

export const missingEnv = Object.entries({
  VITE_PROJECT_ID: PROJECT_ID,
  VITE_BOT_USERNAME: BOT,
  VITE_API_HOST: API_ORIGIN
})
  .filter(([, v]) => !v)
  .map(([k]) => k)

// Trailing slash matters: AppKit appends `wc?uri=<encoded wc: URI>`.
export const BRIDGE_LINK = `${API_ORIGIN}/walletconnect-bridge/`
// Served by Vite from public/walletkit-icon.png
export const ICON_URL = `${window.location.origin}/walletkit-icon.png`

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
export const input = (id: string) => $<HTMLInputElement>(id)

export function log(label: string, data?: unknown) {
  const text = data === undefined ? '' : stringify(data)
  $('log').textContent = `[${new Date().toLocaleTimeString()}] ${label}\n${text}\n\n` + $('log').textContent
}

/** Logs an error with its classification: wallet answer (code/message/data), local SDK error, timeout, not sent. */
export function logError(label: string, e: unknown) {
  const c = classifyError(e)
  if (c.kind === 'wallet') log(`✗ ${label}`, { code: c.code, message: c.message, data: c.data })
  else log(`✗ ${label} — ${c.label}`, c.message)
}

// ---- Chain + accounts ----
export const state = {
  chain: 'ton' as Chain,
  addresses: { ton: '', bsc: '' } as Record<Chain, string>,
  accountState: { ton: null, bsc: null } as Record<Chain, unknown>
}

const renderHooks: (() => void)[] = []
export const onRender = (fn: () => void) => renderHooks.push(fn)
export const render = () => renderHooks.forEach(fn => fn())

// ---- AppKit + provider ----
const metadata = {
  name: 'Family Wallet Test dApp',
  description: 'Deep-link test for the Family Wallet bridge',
  url: window.location.origin,
  icons: [ICON_URL]
}
// Where the wallet sends the user back after an answer (§6.6). Must be https on the same host as metadata.url.
export const REDIRECT_URL = `${window.location.origin}/?back=1`

export let appKit: ReturnType<typeof createAppKit>
export let provider: UniversalProvider

export async function initCore() {
  // Own provider: AppKit 1.8.24 rebuilds metadata from name/description/url/icons only, which drops `redirect`.
  provider = await UniversalProvider.init({
    projectId: PROJECT_ID,
    metadata: { ...metadata, redirect: { universal: REDIRECT_URL } }
  })
  // Every namespace needs an adapter: once `adapters` is set, AppKit only registers
  // those namespaces, so without an eip155 adapter connecting on BSC fails with
  // "Adapter not found". Requests below still go through the universal provider.
  appKit = createAppKit({
    adapters: [new TonAdapter(), new EthersAdapter()],
    networks: [tonTestnet as AppKitNetwork, bscNet],
    defaultNetwork: tonTestnet as AppKitNetwork,
    projectId: PROJECT_ID,
    metadata,
    universalProvider: provider,
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
}

export const sessionNamespaces = () => provider?.session?.namespaces as Record<string, SessionNamespace> | undefined

/**
 * Raw request through the universal provider so the log shows the wallet's full answer.
 * Requests outside the session are not sent (the SDK would answer them itself), unless `force` is set.
 */
export async function request(method: string, params: unknown, caip: string, opts: { force?: boolean } = {}) {
  if (!provider) throw new Error('Universal provider not ready')
  if (!opts.force) {
    const why = checkSession(sessionNamespaces(), caip, method)
    if (why) throw Object.assign(new Error(why), { notSent: true })
  }
  log(`→ ${method} (${caip})`, params)
  return provider.request({ method, params: params as object }, caip)
}

/** Hook for the "Break the request" panel: changes params built by the TON/BSC panels (not the raw panel). */
export const hooks = {
  transform: (_method: string, params: unknown, _chain: Chain): unknown => params
}

/** Request from a TON/BSC panel: applies the active wrong-input toggles, then sends. */
export function send(method: string, params: unknown, chain: Chain) {
  return request(method, hooks.transform(method, params, chain), CHAINS[chain].caip)
}

/** Runs a request-producing function and logs ✓ result or ✗ error. Returns the result or undefined. */
export async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const result = await fn()
    log(`✓ ${label}`, result)
    return result
  } catch (e) {
    logError(label, e)
    return undefined
  }
}

/** Show only elements for the selected chain; elements without data-chain always show. */
export function applyChainVisibility() {
  document.querySelectorAll<HTMLElement>('[data-chain]').forEach(el => {
    el.hidden = el.dataset.chain !== state.chain
  })
}
