import './polyfills'
import { $, BRIDGE_LINK, BOT, REDIRECT_URL, CHAINS, appKit, applyChainVisibility, initCore, log, logError, missingEnv, onRender, provider, render, state, type Chain } from './core'
import { initSession, renderSession } from './session'
import { initTon } from './ton'
import { initBsc } from './bsc'
import { initRaw } from './raw'
import { initBreakers } from './breakers'

$('env').textContent = missingEnv.length
  ? `Missing env: ${missingEnv.join(', ')}. Copy .env.example to .env and fill it in.`
  : `Bridge: ${BRIDGE_LINK} · Bot: @${BOT} · Networks: ${CHAINS.ton.network.name} (${CHAINS.ton.caip}), ${CHAINS.bsc.network.name} (${CHAINS.bsc.caip}) · Redirect: ${REDIRECT_URL} (works only over https on the same host as metadata.url)`

// Redirect back (§6.6): the wallet opens REDIRECT_URL after an answer.
if (new URLSearchParams(window.location.search).get('back') === '1') {
  log('Opened by wallet redirect', new Date().toISOString())
  const url = new URL(window.location.href)
  url.searchParams.delete('back')
  history.replaceState(null, '', url)
}

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

onRender(() => {
  $('account').textContent = state.accountState[state.chain]
    ? JSON.stringify(state.accountState[state.chain], null, 2)
    : `Not connected on ${CHAINS[state.chain].network.name}`
})
onRender(applyChainVisibility)

async function main() {
  await initCore()
  provider.on('display_uri', (uri: string) => {
    log('display_uri', uri)
    showDeepLink(uri)
  })

  initSession()

  document.querySelectorAll<HTMLInputElement>('input[name="chain"]').forEach(radio => {
    radio.onchange = async () => {
      if (!radio.checked) return
      state.chain = radio.value as Chain
      render()
      try {
        await appKit.switchNetwork(CHAINS[state.chain].network)
        log('Switched network', CHAINS[state.chain].caip)
      } catch (e) {
        logError('switchNetwork', e)
      }
    }
  })

  // Account state (one subscription per namespace)
  ;(Object.keys(CHAINS) as Chain[]).forEach(key => {
    appKit.subscribeAccount(s => {
      const was = state.addresses[key]
      state.addresses[key] = s.isConnected ? s.address ?? '' : ''
      state.accountState[key] = s.isConnected ? s : null
      if (state.addresses[key] && state.addresses[key] !== was) log(`Connected (${key.toUpperCase()})`, { address: s.address, caipAddress: s.caipAddress })
      renderSession()
      render()
    }, CHAINS[key].namespace)
  })

  initTon()
  initBsc()
  initRaw()
  initBreakers()
  render()
}

main().catch(e => logError('init', e))
