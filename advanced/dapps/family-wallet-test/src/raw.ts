// Raw request panel (§7.1): any method / chain / params, plus presets for every documented error.
import { $, BSC_CHAIN_ID, CHAINS, input, onRender, request, run, sessionNamespaces, state, tonTestnet } from './core'
import { loadedToken } from './bsc'
import { buildPresets, type Preset } from './lib/presets'
import { nowSeconds, stringify } from './lib/util'

const select = (id: string) => $<HTMLSelectElement>(id)
const textarea = (id: string) => $<HTMLTextAreaElement>(id)

const currentPresets = () =>
  buildPresets({
    tonFrom: state.addresses.ton,
    bscFrom: state.addresses.bsc,
    tonNetwork: tonTestnet.id as string,
    bscChainId: BSC_CHAIN_ID,
    now: nowSeconds(),
    token: loadedToken()
  })

/** Why a preset can't be used right now, or '' if it can. */
function blocked(p: Preset) {
  if (p.chain === 'ton') return state.addresses.ton ? '' : 'not connected on TON'
  if (!state.addresses.bsc) return 'not connected on BSC'
  if (sessionNamespaces() && !sessionNamespaces()?.eip155) return 'BSC not in session'
  return ''
}

const caipOf = () => (select('raw-chain').value === 'custom' ? input('raw-caip').value.trim() : select('raw-chain').value)

function renderPresetOptions() {
  const sel = select('raw-preset')
  const keep = sel.value
  sel.innerHTML = '<option value="">— choose a preset —</option>'
  const groups = new Map<string, HTMLOptGroupElement>()
  for (const p of currentPresets()) {
    const name = p.chain === 'custom' ? `custom chain · ${p.method}` : `${p.chain.toUpperCase()} · ${p.method}`
    let g = groups.get(name)
    if (!g) {
      g = document.createElement('optgroup')
      g.label = name
      groups.set(name, g)
      sel.append(g)
    }
    const o = document.createElement('option')
    const why = blocked(p)
    o.value = p.id
    o.textContent = `${p.label} → ${p.expect}${why ? ` (${why})` : ''}`
    o.disabled = Boolean(why)
    g.append(o)
  }
  sel.value = keep
}

function applyPreset(id: string) {
  // Rebuild now, so addresses and valid_until are fresh.
  const p = currentPresets().find(x => x.id === id)
  if (!p) return
  input('raw-method').value = p.method
  if (p.chain === 'custom') {
    select('raw-chain').value = 'custom'
    input('raw-caip').value = p.caip ?? ''
  } else {
    select('raw-chain').value = CHAINS[p.chain].caip
  }
  textarea('raw-params').value = stringify(p.params)
  $('raw-expect').textContent = `Expect: ${p.expect}`
  updateCaipField()
}

function updateCaipField() {
  input('raw-caip').hidden = select('raw-chain').value !== 'custom'
}

async function sendRaw() {
  const method = input('raw-method').value.trim()
  const caip = caipOf()
  let params: unknown
  try {
    params = JSON.parse(textarea('raw-params').value || 'null')
    $('raw-error').textContent = ''
  } catch (e) {
    $('raw-error').textContent = `Invalid JSON: ${(e as Error).message}`
    return
  }
  if (!method || !caip) {
    $('raw-error').textContent = 'Method and chain are required'
    return
  }
  // force: send even if outside the session, so the SDK's own answer shows.
  await run(`${method} (raw)`, () => request(method, params, caip, { force: true }))
}

export function initRaw() {
  select('raw-chain').innerHTML = `
    <option value="${CHAINS.ton.caip}">${CHAINS.ton.caip} (TON)</option>
    <option value="${CHAINS.bsc.caip}">${CHAINS.bsc.caip} (BSC)</option>
    <option value="custom">custom…</option>`
  select('raw-chain').onchange = updateCaipField
  select('raw-preset').onfocus = renderPresetOptions
  select('raw-preset').onchange = () => applyPreset(select('raw-preset').value)
  $('raw-send').onclick = sendRaw
  updateCaipField()
  renderPresetOptions()
  onRender(renderPresetOptions)
}
