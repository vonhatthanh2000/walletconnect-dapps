# Family Wallet Test dApp

Test dApp for the Family Wallet WalletConnect bridge deep link. It uses AppKit `1.8.24` and the TON adapter, on TON testnet only.

It lists **Family Wallet** as a custom wallet with both `mobile_link` and `desktop_link` set to
`https://<API host>/walletconnect-bridge/`, so:

- **Phone browser:** AppKit opens `<mobile_link>wc?uri=<encoded wc: URI>`.
- **Desktop browser:** AppKit opens `<desktop_link>wc?uri=<encoded wc: URI>` in a new tab, so you don't need to scan a QR code.
  The bridge redirects to `t.me/<bot>?startapp=wc_<token>`, which opens the Mini App in Telegram Desktop.

The **Deep link (debug)** panel shows each pairing URI and the bridge link it maps to, with Open and Copy buttons.
Use it if the browser blocked the new tab, or to paste the link into another device.

## Setup

```bash
pnpm install
cp .env.example .env   # then fill in the values
```

The wallet and dApp icon is served from `public/walletkit-icon.png`.

In the WalletConnect Dashboard (this dApp's AppKit project), add the domain you serve the page from to **Allowed domains**.

## Run

```bash
pnpm dev               # http://localhost:5173, also reachable through an HTTPS tunnel
```

## Flow

1. Click **Connect Wallet**, then **Family Wallet**. A new tab opens `…/walletconnect-bridge/wc?uri=…`, which goes to Telegram.
2. In the Mini App, log in and enter the PIN. "Connecting to the app…" appears, then the connection sheet. Tap **Approve**.
3. Back in the browser, the Account box shows the connected testnet address.
4. **Sign data** sends `ton_signData` with a text payload. **Send 0.01 TON** sends `ton_sendMessage` to `VITE_SEND_TO`, or to your own address if that's empty.
   Approve each one in the Mini App. The raw result shows under **Results**.

Close the Mini App fully before each deep-link attempt, because the start param only arrives on a fresh launch.
