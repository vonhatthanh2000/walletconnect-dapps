// "Break the request" panel: toggles that the TON/BSC panels apply to their next requests (sticky).
import { $, BSC_CHAIN_ID, hooks, log, onRender, state } from './core'
import { TOGGLES, applyBreakers, type Toggle } from './lib/breakers'
import { nowSeconds } from './lib/util'

const active = new Set<Toggle>()

export function initBreakers() {
  const box = $('breakers')
  for (const t of TOGGLES) {
    const label = document.createElement('label')
    label.dataset.toggleChains = t.chains.join(' ')
    label.innerHTML = `<input type="checkbox" /> ${t.label} `
    const cb = label.querySelector('input') as HTMLInputElement
    cb.onchange = () => (cb.checked ? active.add(t.id) : active.delete(t.id))
    box.append(label)
  }

  hooks.transform = (method, params, chain) => {
    // Only toggles shown for this chain count.
    const toggles = TOGGLES.filter(t => active.has(t.id) && t.chains.includes(chain)).map(t => t.id)
    if (!toggles.length) return params
    const r = applyBreakers(method, params, toggles, { bscChainId: BSC_CHAIN_ID, now: nowSeconds() })
    log(`Break the request: ${method}`, {
      applied: r.applied,
      ...(r.skipped.length ? { skipped: r.skipped.map(t => `${t}: n/a for ${method}`) } : {})
    })
    return r.params
  }

  onRender(() => {
    box.querySelectorAll<HTMLElement>('label').forEach(l => {
      l.hidden = !l.dataset.toggleChains!.split(' ').includes(state.chain)
    })
  })
}
