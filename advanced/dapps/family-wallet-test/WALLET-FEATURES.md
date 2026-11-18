# Family Wallet over WalletConnect: what the wallet does

This describes everything Family Wallet (Telegram Mini App, Reown WalletKit 1.6.0) does as a WalletConnect wallet:
the chains, what each method accepts and returns, every error it sends back, and how it behaves around the requests.
Use it as the spec when adding test features to this dApp. Ready-made test requests are in the raw panel's preset catalogue (`src/lib/presets.ts`).

## 1. Chains and accounts

| Namespace | Chains | Methods | Events |
| --------- | ------ | ------- | ------ |
| `ton`     | `ton:-3` (testnet) or `ton:-239` (mainnet) | `ton_sendMessage`, `ton_signData` | `chainChanged`, `accountsChanged` when the dApp asks for them (section 6.7) |
| `eip155`  | `eip155:97` (BSC testnet) or `eip155:56` (BSC mainnet) | `personal_sign`, `eth_signTypedData_v4`, `eth_sendTransaction`, `wallet_switchEthereumChain` | `chainChanged`, `accountsChanged`: sent when the wallet's account or chain changes (section 6.7) |

- The wallet offers **one chain per namespace**. Testnet or mainnet follows the wallet's TON environment: dev and
  staging are testnet (`ton:-3`, `eip155:97`), prod is mainnet. A dApp on the wrong network gets no account for it.
- **One account per namespace:** the user's personal wallet at the currently selected wallet index. The TON account is
  the raw address (`ton:-3:0:<64 hex>`); the BSC account is a `0x` address. Shared/family wallets are never offered.
- **One session can hold both namespaces.** The dApp asks for `ton` and `eip155` in the same proposal and gets both.
- **BSC is offered only when the wallet's backend returns a working BSC RPC.** Otherwise the session has `ton` only.
  The wallet retries the RPC every 60 s, but an existing session does not gain `eip155` later; reconnect for that.
- **TON session properties** (in `session.sessionProperties`):
  - `ton_getPublicKey`: the wallet's public key, hex.
  - `ton_getStateInit`: the wallet contract's stateInit, base64 BOC.

  Use them to verify `ton_signData` signatures and to know the wallet contract without an extra request.

## 2. Connecting

### Ways the wallet receives a pairing URI

| Way | How | Notes |
| --- | --- | ----- |
| Deep link | dApp opens `https://<API host>/walletconnect-bridge/wc?uri=<encoded wc: URI>` (this dApp's custom wallet `mobile_link` / `desktop_link`). The bridge stores the URI and redirects to `t.me/<bot>?startapp=wc_<token>` | Works from phone and desktop browsers. The Mini App must be closed first: the start param only arrives on a fresh launch. The token expires; the wallet then shows "This link has expired" |
| QR scan | User taps the QR icon on the wallet's home screen and scans the dApp's QR | `wc:` links are recognised before addresses |
| Paste | Wallet → Settings → Connected apps → paste the `wc:` link | |

Pairing errors the user sees: expired QR, already used QR, no internet, not a WalletConnect link, and a 15 s timeout.

### What the wallet reads from the proposal

- `requiredNamespaces` and `optionalNamespaces`. A **required** chain or method the wallet doesn't support makes the
  whole proposal unsupported. **Optional** unsupported chains or methods are dropped. If nothing is left, the user sees
  "This app needs networks Family Wallet doesn't support" and the dApp gets `UNSUPPORTED_CHAINS` (5100).
  AppKit puts everything in `optionalNamespaces`, so with AppKit an Ethereum + BSC dApp still connects on BSC.
- `metadata.name`, `metadata.url`, `metadata.icons[0]`: shown on the connection sheet and in Connected apps.
- `metadata.redirect.universal`: used for redirect back (section 6.6). This dApp sets it to `<origin>/?back=1`.
- The Verify context: the sheet shows verified domain, unverified, mismatch (warning) or threat (red; Approve needs two
  taps, and later requests from that session are blocked).

### Answers

| User action | dApp receives |
| ----------- | ------------- |
| Approve | A session with the namespaces above |
| Reject | Proposal rejected, `USER_REJECTED` (5000) |
| Unsupported proposal | `UNSUPPORTED_CHAINS` (5100) |
| Ignores it | Proposal expires (5 min); the wallet shows "This connection request has expired" |

## 3. TON methods

`params` may be the object itself or a one-item array `[object]`. Both work.

### `ton_signData`

Request:

```jsonc
{ "type": "text",   "text": "Hello",          "from": "<optional, own address>", "network": "<optional, -3 or -239>" }
{ "type": "binary", "bytes": "<base64>",      "from": "...", "network": "..." }
{ "type": "cell",   "schema": "...", "cell": "<boc>" }   // always refused
```

Checks, in order: `network` (if set) must match → `cell` refused → `from` (if set) must be the session account →
`text` must be a string / `bytes` must be non-empty valid base64.

The sheet shows the text, or a warning for binary data. After **Sign** and the PIN, the result is:

```jsonc
{
  "signature": "<base64 Ed25519 signature>",
  "address":   "0:<64 hex>",          // raw address
  "publicKey": "<hex>",
  "timestamp": 1763450000,            // seconds
  "domain":    "app.example.com",     // Verify origin's host, else metadata.url's host (keeps the port)
  "payload":   { "type": "text", "text": "Hello" }   // the request params without "from"
}
```

The signed bytes follow the TON Connect `signData` format:
`0xffff ‖ "ton-connect/sign-data/" ‖ wc (int32 BE) ‖ address hash (32 B) ‖ domain length (uint32 BE) ‖ domain ‖
timestamp (uint64 BE) ‖ "txt" or "bin" ‖ data length (uint32 BE) ‖ data`, then SHA-256, then Ed25519. The dApp can
check it with `ton_getPublicKey`.

### `ton_sendMessage`

Request:

```jsonc
{
  "valid_until": 1763450300,          // seconds; optional
  "from": "<optional, own address>",
  "network": "-3",                    // optional
  "messages": [                       // 1 to 4
    { "address": "<TON address>", "amount": "10000000", "payload": "<optional base64 BOC>", "stateInit": "<optional base64 BOC>" }
  ]
}
```

Checks: 1–4 messages; `valid_until` not passed; `network` and `from` match if set; each message has a valid address,
an integer `amount` in nanotons (string or number), valid BOCs; no `extra_currency`.

The sheet shows every recipient, amount and decoded payload (comment, jetton transfer, or "contract call"), the total,
the fee and the balance. After **Confirm** and the PIN, the wallet signs, broadcasts and returns:

```jsonc
"<base64 BOC of the signed external message>"
```

## 4. BSC methods

### `personal_sign`

Request: `["<0x hex message>", "<own address>"]`. The address check ignores case.

The sheet shows the message as text when it is printable UTF-8, otherwise the raw hex with a warning. Result: the
`0x` signature (65 bytes). `ethers.verifyMessage(bytes, signature)` recovers the address.

### `eth_signTypedData_v4`

Request: `["<own address>", "<typed data as a JSON string, or an object>"]`.

Checks: address is the session account; `types`, `primaryType`, `domain` and `message` are present and consistent;
`domain.chainId`, if set, equals the session chain.

The sheet shows the domain, primary type and the message fields. `Permit` (EIP-2612) and Permit2 types show a
"this lets the app spend your tokens" warning. Result: the `0x` signature.

### `eth_sendTransaction`

Request: `[{ from, to, value, data, gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas, nonce, chainId }]`. Only
`from` is required, plus `to` or `data`. Quantities are hex (`"0x…"`) or decimal.

Checks: `from` is the session account; `to` is a valid address (or absent for a contract deploy with `data`);
`chainId`, if set, equals the session chain; not both `gasPrice` and EIP-1559 fees; `maxPriorityFeePerGas` ≤
`maxFeePerGas`.

What the wallet builds and signs (this is also what the sheet shows):

| Field | Rule |
| ----- | ---- |
| Gas limit | `max(dApp gas, wallet estimate)` |
| Fee | Legacy (type 0) `gasPrice × 1.1` from the network, unless the dApp gives a fee |
| Nonce | **The dApp's nonce is ignored.** Wallet uses `max(pending count, last nonce it used + 1)`; its memory of the last nonce expires after 10 minutes |
| Chain | The session chain |

The sheet decodes these calls:

| Call | Shown as | Warning |
| ---- | -------- | ------- |
| Native value only | Send `<amount>` BNB to `<to>` | |
| ERC-20 `transfer(to, amount)` | Send `<amount> <symbol>` to `<to>` | |
| ERC-20 `approve(spender, amount)` / `increaseAllowance` | Allow `<spender>` to spend `<amount> <symbol>` | Unlimited approval when amount ≥ 2^255 |
| Permit2 `approve(token, spender, amount, expiration)` | Same as above | Unlimited when amount ≥ 2^159 |
| ERC-721/1155 `setApprovalForAll(operator, true)` | Allow access to all your NFTs | Always |
| Any other call | Contract call with the raw data | |
| No `to` | Contract deploy | |

More warnings: **high fee** (fee well above the network price) and **likely to fail** (gas estimate reverted). If
there is no usable gas limit, fee or nonce, Confirm is blocked.

After **Confirm** and the PIN, the wallet broadcasts and returns the tx hash `"0x…"`. If another tx took the nonce
between showing and confirming, the wallet rebuilds the tx and asks the user to check it again ("Another transaction
used this nonce").

### `wallet_switchEthereumChain`

Request: `[{ "chainId": "0x61" }]`. No sheet. The session chain → `null`. Any other chain → `4902 Unrecognized chain`.

## 5. Errors the wallet sends back

| When | Code | Message |
| ---- | ---- | ------- |
| User taps Reject (request) | 5000 | `USER_REJECTED` (WalletConnect SDK error) |
| Bad params (every check above) | -32602 | One of: `Invalid params`, `Network mismatch`, `Unknown from address`, `Unknown address`, `No messages`, `At most 4 messages per transaction`, `Request has expired`, `Extra currencies are not supported`, `Invalid message address`, `Invalid message amount`, `Invalid message payload`, `Invalid message stateInit`, `Invalid text`, `Invalid bytes`, `Unsupported sign data type`, `Empty message`, `Invalid typed data`, `Invalid primaryType`, `primaryType mismatch`, `Invalid domain`, `Invalid types`, `Invalid domain chainId`, `Chain mismatch`, `Invalid to`, `Invalid data`, `Missing to`, `Invalid <field>`, `Both gasPrice and EIP-1559 fees`, `maxPriorityFeePerGas above maxFeePerGas`, `Invalid chainId`, `Unknown app domain` |
| TON `cell` sign data | -32602 | `cell sign data not supported` |
| Send above the balance (user taps the only button, Reject) | -32000 | `Insufficient balance` |
| Broadcast failed | -32000 | `Broadcast failed` or the node's message |
| Switch to another EVM chain | 4902 | `Unrecognized chain` |
| Method not supported | 5101 | `UNSUPPORTED_METHODS` |
| Chain not in the session, or BSC unavailable | 5100 | `UNSUPPORTED_CHAINS` |
| Session account doesn't match at confirm | -32602 | `Account mismatch` |

Validation errors are answered automatically, without a sheet.

### Refused methods (5101)

`eth_sign`, `eth_signTransaction`, `eth_sendRawTransaction`, `eth_signTypedData` (v1), `eth_signTypedData_v3`,
`wallet_addEthereumChain`, and anything not listed in section 1.

## 6. Behaviour around requests

1. **PIN** is asked for signing and sending, not for connecting.
2. **App closed.** The Mini App has no background process. Requests sent while it is closed appear when the user opens
   it. Requests that expired meanwhile show "This request has expired".
3. **Queue.** One sheet at a time, oldest first: proposals first, then requests. Sheets wait while another wallet
   sheet or the PIN screen is open.
4. **Never sends twice.** The signed tx is saved before broadcasting. If the app closes mid-send, on reopening the
   request shows only **Retry**: it rebroadcasts the same tx and answers the result, or `-32000` if it did not go out. Retry never signs a new tx, and there is no Reject, because the tx may already be on chain.
5. **Insufficient balance.** The send sheet shows only **Reject**, which answers `-32000 Insufficient balance`.
6. **Redirect back.** After an answer the user caused (Approve, Reject, Sign, Confirm), the wallet returns to the dApp
   only if all of these hold: the session came from a **deep link**, Telegram runs on **iOS or Android**,
   `metadata.redirect.universal` is `https:` on the **same host** as `metadata.url`, and Verify is not threat.
   `t.me` links open inside Telegram. Otherwise the user stays in the wallet.
7. **Account and chain changes.** On a wallet index switch, a recovery to another wallet or a testnet ↔ mainnet switch:
   - **Every session is updated in place**, TON and BSC alike: one `session_update` with the new accounts (and chains on
     a testnet ↔ mainnet switch), then, per namespace that declared them, `chainChanged` (BSC: chain number; TON: `-3` /
     `-239`, only when the chain moved) and `accountsChanged` (`[address]`). TON sessions approved before this change
     declared no events and get `session_update` only.
   - If WalletConnect refuses the update (e.g. the dApp *required* the old chain), that session is disconnected.
   - `ton_getPublicKey` / `ton_getStateInit` can't be updated and keep their values from the approval. Verify
     `ton_signData` with the result's own `publicKey`.
   - Requests still waiting for the old account of an updated session get `4100 Account changed`; a send already
     signed keeps its Retry.
   - A TON-only session is untouched when only the BSC account changes. The home network picker changes nothing.
8. **Connected apps** (Settings) lists each session with every account (`network · address`), with Disconnect and
   Disconnect all. A dApp-side disconnect removes the entry.
9. **Offline.** Sheets show an offline notice; nothing half-sends.
10. **Relay timeout.** If WalletConnect doesn't confirm an answer within 10 s, the wallet shows "No response from
    WalletConnect, try again".
11. **Sessions are stored on the device only** (IndexedDB). Another device or a cleared Telegram cache starts empty.

## 7. What this dApp has

Today: chain selector (TON / BSC), connect through the bridge deep link or the AppKit QR, the deep-link debug panel,
**Sign data** (text `ton_signData` / text `personal_sign`), **Send** (native TON / tBNB), and a results log.

Added to cover every feature above (items 1–12 are done; 13 is not built):

1. **Raw request panel.** Method field, JSON params textarea and Send, using the existing
   `request(method, params, CHAINS[chain].caip)`. Plus a dropdown of presets that fill the textarea with the payloads
   in the raw panel's preset catalogue (`src/lib/presets.ts`), with the connected address and `valid_until` = now + 300.
   This covers every validation error and the switch to another chain. Refused methods (5101), chains outside the
   session (5100) and the switch to the session chain are answered by the WalletConnect SDK itself, not the wallet.
2. **TON sign data types:** text and binary buttons; a cell button (expect the refusal).
3. **TON multi-message send:** up to 4 recipient rows, optional comment per row (build the payload BOC with
   `@ton/core`: `beginCell().storeUint(0, 32).storeStringTail(text).endCell().toBoc().toString('base64')`), and a
   jetton transfer form (jetton wallet address, amount, destination; op `0x0f8a7ea5`).
4. **TON signature check:** verify the `ton_signData` result with `ton_getPublicKey` from
   `session.sessionProperties`, rebuilding the bytes from section 3, and show "valid" or "invalid".
5. **BSC typed data:** buttons for a plain typed-data message (`Mail`) and an EIP-2612 `Permit`, with `chainId` from
   the selected network. Verify with `ethers.verifyTypedData`.
6. **BSC signature check:** `ethers.verifyMessage` for `personal_sign`; show the recovered address against the
   connected one.
7. **BSC token actions:** a token address field (a testnet ERC-20), then **Transfer**, **Approve (amount)**,
   **Approve unlimited**, and **setApprovalForAll** buttons, built with `ethers.Interface(...).encodeFunctionData`.
   Show the token's symbol and balance.
8. **BSC failing call:** a button that sends a `transfer` larger than the token balance (expect "likely to fail").
9. **BSC dApp-supplied fields:** checkboxes to add `gas`, `gasPrice` and a stale `nonce` to the send.
10. **Wrong-input toggles:** wrong `from`, wrong `network` / `chainId`, expired `valid_until`, 5 messages, extra currency.
11. **Redirect back:** set `metadata.redirect.universal` to the page's own https URL (e.g. `${origin}/?back=1`), and
    log when the page is opened with that parameter.
12. **Session panel:** show the session topic, namespaces, accounts, `sessionProperties`, expiry, and log
    `session_delete` / `session_update` / `session_event` events, so the account-guard disconnect (section 6.7) is
    visible.
13. **Optional: unsupported-only proposal.** A second AppKit config with only Ethereum mainnet, to see the "doesn't
    support" screen.

Keep the dApp's existing rules: amounts as strings or `bigint`, never floats; everything goes through the universal
provider so the log shows the wallet's raw answer.
