// TON panels: sign data (+ signature check) and multi-message / jetton send.
import { $, CHAINS, SEND_TO, input, log, onRender, provider, run, send, sessionNamespaces, state, tonTestnet } from './core'
import { verifyTonSignData, type SignDataResult } from './lib/tonSign'
import { commentPayload, jettonTransferPayload } from './lib/tonPayload'
import { accountAddress, isTonAddress, nowSeconds, parseUnits } from './lib/util'

const c = CHAINS.ton
const MAX_ROWS = 4
const CELL_SCHEMA = 'comment#00000000 text:SnakeData = InMsgBody;'

// ---- Sign data (§3 ton_signData) ----

async function checkSignature(result: unknown) {
  const r = result as SignDataResult
  if (!r || typeof r !== 'object' || !r.signature) return
  const props = (provider.session?.sessionProperties ?? {}) as Record<string, string>
  const key = props.ton_getPublicKey
  const account = sessionNamespaces()?.ton?.accounts[0]
  const checks: Record<string, unknown> = {
    publicKeyMatchesSession: key ? r.publicKey?.toLowerCase() === key.toLowerCase() : 'no ton_getPublicKey',
    addressMatchesSession: account ? r.address?.toLowerCase() === accountAddress(account) : 'no session account'
  }
  if (!key) {
    log('✗ signature check — cannot verify: no ton_getPublicKey', checks)
    return
  }
  try {
    const valid = await verifyTonSignData(r, key)
    log(valid ? '✓ signature valid' : '✗ signature invalid', checks)
  } catch (e) {
    log('✗ signature check failed', { error: String((e as Error)?.message ?? e), ...checks })
  }
}

async function signData(payload: Record<string, unknown>) {
  const result = await run('ton_signData', () => send('ton_signData', [{ ...payload, from: state.addresses.ton }], 'ton'))
  if (result !== undefined && payload.type !== 'cell') await checkSignature(result)
}

const utf8ToBase64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')

// ---- Send (§3 ton_sendMessage) ----

function addRow(values: { address?: string; amount?: string; comment?: string } = {}) {
  const rows = $('ton-rows')
  if (rows.children.length >= MAX_ROWS) return
  const row = document.createElement('div')
  row.className = 'msg-row'
  row.innerHTML = `
    <input class="r-to" placeholder="EQ… / UQ… / 0:… (empty → ${SEND_TO ? 'VITE_SEND_TO' : 'own address'})" autocomplete="off" spellcheck="false" />
    <input class="r-amount" inputmode="decimal" placeholder="TON" />
    <input class="r-comment" placeholder="comment (optional)" />
    <button type="button" class="r-remove" title="Remove">✕</button>`
  ;(row.querySelector('.r-to') as HTMLInputElement).value = values.address ?? ''
  ;(row.querySelector('.r-amount') as HTMLInputElement).value = values.amount ?? '0.01'
  ;(row.querySelector('.r-comment') as HTMLInputElement).value = values.comment ?? ''
  ;(row.querySelector('.r-remove') as HTMLButtonElement).onclick = () => {
    if (rows.children.length > 1) row.remove()
    updateRows()
  }
  rows.append(row)
  updateRows()
}

function updateRows() {
  ;($('ton-add-row') as HTMLButtonElement).disabled = $('ton-rows').children.length >= MAX_ROWS
}

/** Builds the messages from the rows (empty recipient falls back to VITE_SEND_TO, then own address). */
function buildMessages() {
  const from = state.addresses.ton
  return Array.from($('ton-rows').children).map((row, i) => {
    const get = (cls: string) => (row.querySelector(cls) as HTMLInputElement).value.trim()
    const address = get('.r-to') || SEND_TO || from
    if (!isTonAddress(address)) throw new Error(`Row ${i + 1}: not a TON address: ${address}`)
    const amount = parseUnits(get('.r-amount'), c.decimals)
    if (amount <= 0n) throw new Error(`Row ${i + 1}: amount must be greater than 0`)
    const comment = get('.r-comment')
    return { address, amount: amount.toString(), ...(comment ? { payload: commentPayload(comment) } : {}) }
  })
}

const sendParams = (messages: unknown[]) => ({
  valid_until: nowSeconds() + 300,
  from: state.addresses.ton,
  network: tonTestnet.id, // "-3"
  messages
})

async function sendRows() {
  await run('ton_sendMessage', async () => send('ton_sendMessage', sendParams(buildMessages()), 'ton'))
}

async function sendJetton() {
  await run('ton_sendMessage (jetton)', async () => {
    const from = state.addresses.ton
    const jettonWallet = input('jt-wallet').value.trim()
    const destination = input('jt-to').value.trim()
    if (!isTonAddress(jettonWallet)) throw new Error(`Not a TON address (jetton wallet): ${jettonWallet}`)
    if (!isTonAddress(destination)) throw new Error(`Not a TON address (destination): ${destination}`)
    const decimals = Number(input('jt-decimals').value)
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('Decimals must be an integer 0–255')
    const amount = parseUnits(input('jt-amount').value, decimals)
    if (amount <= 0n) throw new Error('Amount must be greater than 0')
    const payload = jettonTransferPayload({ amount, destination, responseDestination: from })
    return send('ton_sendMessage', sendParams([{ address: jettonWallet, amount: parseUnits('0.05', 9).toString(), payload }]), 'ton')
  })
}

export function initTon() {
  $('ton-sign-text').onclick = () => signData({ type: 'text', text: input('ton-text').value })
  $('ton-sign-binary').onclick = () => {
    const raw = input('ton-bytes').value.trim()
    signData({ type: 'binary', bytes: raw || utf8ToBase64(input('ton-binary-text').value) })
  }
  $('ton-sign-cell').onclick = () => signData({ type: 'cell', schema: CELL_SCHEMA, cell: commentPayload('Hello') })
  $('ton-add-row').onclick = () => addRow()
  $('ton-send').onclick = sendRows
  $('jt-send').onclick = sendJetton
  input('ton-text').value = `Family Wallet test ${new Date().toISOString()}`
  input('ton-binary-text').value = 'Hello'
  addRow()

  onRender(() => {
    const off = !state.addresses.ton
    document.querySelectorAll<HTMLButtonElement>('[data-chain="ton"] button[data-needs-account]').forEach(b => (b.disabled = off))
  })
}
