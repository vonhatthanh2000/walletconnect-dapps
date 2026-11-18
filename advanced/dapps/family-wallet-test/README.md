# Family Wallet Test dApp

Test dApp for Family Wallet over WalletConnect: the bridge deep link, plus a panel for every method, payload type,
error and session behaviour in [`WALLET-FEATURES.md`](WALLET-FEATURES.md). It uses AppKit `1.8.24` with the TON
adapter (TON testnet) and the Ethers adapter (BSC, testnet by default). Pick the chain with the **TON / BSC** selector;
only that chain's panels show.

It lists **Family Wallet** as a custom wallet with both `mobile_link` and `desktop_link` set to
`https://<API host>/walletconnect-bridge/`, so:

- **Phone browser:** AppKit opens `<mobile_link>wc?uri=<encoded wc: URI>`.
- **Desktop browser:** AppKit opens `<desktop_link>wc?uri=<encoded wc: URI>` in a new tab, so you don't need to scan a QR code.
  The bridge redirects to `t.me/<bot>?startapp=wc_<token>`, which opens the Mini App in Telegram Desktop.

## Setup

```bash
pnpm install
cp .env.example .env   # then fill in the values
```

| Variable | Required | Meaning |
| --- | --- | --- |
| `VITE_PROJECT_ID` | yes | Reown / WalletConnect project id |
| `VITE_BOT_USERNAME` | yes | Telegram bot of the Mini App |
| `VITE_API_HOST` | yes | Host serving `/walletconnect-bridge/` |
| `VITE_SEND_TO`, `VITE_BSC_SEND_TO` | no | Default recipients (else your own address) |
| `VITE_BSC_NETWORK` | no | `testnet` (97, default) or `mainnet` (56) |
| `VITE_BSC_TOKEN` | no | Default ERC-20 address for the token panel |
| `VITE_BSC_RPC` | no | BSC read RPC for token info and gas price (default: public BNB Chain RPC) |

Icons are served from `public/`: `dapp-icon.png` is the dApp's own icon (shown by the wallet on its connect and request screens), `walletkit-icon.png` is Family Wallet's icon in the dApp's wallet list. The wallet must reach the dApp icon over http(s) from the phone, so test through the HTTPS tunnel, not `localhost`.
In the WalletConnect Dashboard (this dApp's project), add the domain you serve the page from to **Allowed domains**.

## Run and test

```bash
pnpm dev     # http://localhost:30142, also reachable through an HTTPS tunnel
pnpm test    # vitest: payload builders, signature checks, presets, toggles
pnpm build   # tsc + vite build
```

Close the Mini App fully before each deep-link attempt, because the start param only arrives on a fresh launch.

## Panels

- **Connect** / **Deep link (debug)**: AppKit modal, and the latest pairing URI with its bridge link (Open / Copy).
- **Session**: topic, namespaces, accounts, `sessionProperties` (`ton_getPublicKey`, `ton_getStateInit`), expiry, and
  `session_delete` / `session_update` / `session_event` / `session_expire` in the log. A wallet-side disconnect shows
  "Disconnected by wallet". Shows "BSC not in session" when the wallet offered TON only.
- **TON · Sign data**: text, binary and cell `ton_signData`. Signatures are rebuilt and verified with `ton_getPublicKey`.
- **TON · Send**: 1–4 messages with optional comments in one `ton_sendMessage`.
- **TON · Jetton transfer**: a transfer payload (op `0x0f8a7ea5`) to your jetton wallet with 0.05 TON.
- **BSC · Sign**: `personal_sign`, typed data `Mail` and EIP-2612 `Permit`, each checked against the connected address.
- **BSC · Send native**: `eth_sendTransaction` with a value.
- **BSC · Token actions**: Load a token (name, symbol, balance), then Transfer, Approve, Approve unlimited,
  setApprovalForAll and a transfer above the balance (expect "likely to fail").
- **BSC · dApp-supplied tx fields**: add `gas`, `gasPrice` (×2) and a stale `nonce` to every BSC send.
- **Break the request**: wrong `from`, wrong network / `chainId`, expired `valid_until`, 5 messages, extra currency.
  Applied to the panels above until unchecked.
- **Raw request**: any method / chain / JSON params, plus presets for every documented answer and error, each with its
  expected result. Sent as-is, so answers the WalletConnect SDK gives itself (refused methods, chains outside the
  session) show as "local SDK error (not sent to wallet)".
- **Results**: every request and the raw answer. Errors show `{ code, message, data }`, or say whether the SDK
  answered locally or the wallet timed out.

## Redirect back

The proposal carries `metadata.redirect.universal = <origin>/?back=1`. When the wallet sends you back, the page logs
"Opened by wallet redirect". The wallet redirects only for deep-link sessions on iOS/Android, and only when the page is
served over https on the same host as `metadata.url` (so not on localhost).
