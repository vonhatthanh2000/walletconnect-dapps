// Session panel: what the wallet approved, and session events (incl. the wallet-side disconnect, §6.7).
import { $, log, provider, sessionNamespaces } from './core'
import { stringify } from './lib/util'

type Session = NonNullable<typeof provider.session>
let cached: Session | undefined
let disconnectedAt: string | undefined

function view(s: Session) {
  const props = (s.sessionProperties ?? {}) as Record<string, string>
  return {
    topic: s.topic,
    expiry: new Date(s.expiry * 1000).toLocaleString(),
    namespaces: s.namespaces,
    sessionProperties: {
      ton_getPublicKey: props.ton_getPublicKey ?? 'missing',
      ton_getStateInit: props.ton_getStateInit ?? 'missing',
      ...props
    },
    peer: s.peer?.metadata,
    self: s.self?.metadata
  }
}

export function renderSession() {
  const s = provider?.session
  if (s) {
    cached = s
    disconnectedAt = undefined
  }
  const shown = s ?? cached
  $('session-status').textContent = s
    ? 'Connected'
    : disconnectedAt
      ? `Disconnected by wallet at ${disconnectedAt}`
      : cached
        ? 'Disconnected'
        : 'No session'
  $('session-bsc').hidden = !s || Boolean(sessionNamespaces()?.eip155)
  $('session').textContent = shown ? stringify(view(shown)) : 'No session'
}

export function initSession() {
  provider.on('session_update', (e: unknown) => {
    log('session_update', e)
    renderSession()
  })
  provider.on('session_event', (e: unknown) => log('session_event', e))
  provider.on('session_delete', (e: unknown) => {
    // The provider has already cleared provider.session here; render from the cached copy.
    disconnectedAt = new Date().toLocaleTimeString()
    log('session_delete', e)
    $('session-status').textContent = `Disconnected by wallet at ${disconnectedAt}`
    $('session').textContent = cached ? stringify(view(cached)) : 'No session'
    $('session-bsc').hidden = true
  })
  provider.client.on('session_expire', (e: unknown) => {
    log('session_expire', e)
    renderSession()
  })
  renderSession()
}
