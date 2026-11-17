# Family Wallet Test dApp

Test dApp for the Family Wallet WalletConnect bridge deep link. It uses AppKit `1.8.24` with the TON adapter for TON testnet, plus BSC (testnet by default) through the Ethers (EVM) adapter. Pick the chain with the **TON / BSC** selector.

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
4. Pick **TON** or **BSC** in the chain selector. The account box, signing and sending all use the selected chain.
5. **Sign data** sends `ton_signData` (TON) or `personal_sign` (BSC) with a text payload.
6. In **Send transaction**, enter a recipient address and an amount, then click **Send**:
   - TON: `ton_sendMessage`, amount in TON, converted to nanotons.
   - BSC: `eth_sendTransaction` on `eip155:97` (or `eip155:56` with `VITE_BSC_NETWORK=mainnet`), amount in BNB, converted to wei.

   If you leave the recipient empty, it falls back to `VITE_SEND_TO` / `VITE_BSC_SEND_TO`, then to your own address.
   Approve each one in the Mini App. The raw result shows under **Results**.

Close the Mini App fully before each deep-link attempt, because the start param only arrives on a fresh launch.
