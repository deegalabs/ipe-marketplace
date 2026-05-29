# Ipê Store — Architecture

> Mobile-first PWA where the ipê.city community buys merch with PIX or crypto,
> picks up at the next event, and (soon) gets an ERC-1155 receipt on Base.
> This doc captures the **production** topology — the gateway-first PoC that's
> live at <https://ipe-store.vercel.app>.

The smart contracts are written and tested but **not yet active in
production**. The buy flow today goes through payment gateways; the onchain
mint will be re-enabled once the gateway flow is stable and the resale UX is
ready.

---

## Topology

```
                             ┌────────────────────────┐
   PWA / browser ───────────►│  Vercel                │  Vite SPA + service worker
                             │  (frontend)            │  ipe-store.vercel.app
                             └─────────┬──────────────┘
                                       │
                                       │ REST (JSON) over HTTPS
                                       ▼
                             ┌────────────────────────┐
                             │  Railway               │  Express + Drizzle
                             │  (backend)             │  ipeserver-production.up.railway.app
                             └────┬────────┬──────────┘
                                  │        │
              ┌───────────────────┘        └──────────────────┐
              ▼                                               ▼
       ┌──────────────┐                              ┌──────────────────┐
       │ Supabase     │                              │ Mercado Pago     │ PIX
       │ Postgres +   │                              │  (webhook)       │
       │ Storage      │                              └──────────────────┘
       └──────────────┘                              ┌──────────────────┐
              ▲                                      │ NOWPayments      │ Crypto
              │ images via                           │  (IPN webhook)   │
              │ public bucket                        └──────────────────┘
                                                     ┌──────────────────┐
                                                     │ Resend           │ Email
                                                     └──────────────────┘
                                       ▼
                             ┌────────────────────────┐
                             │  Base L2 (deferred)    │
                             │  IpeMarket ERC-1155    │
                             │  + ERC-2981 royalty    │
                             │  + internal resale     │
                             └────────────────────────┘
```

## Workspaces

```
client/      Vite + React 19 + TS + Tailwind + Privy + wagmi (PWA via vite-plugin-pwa)
server/      Express + Drizzle + zod + viem + Privy server SDK + Resend + multer
shared/      zod schemas + ABIs + addresses consumed by both sides
contracts/   Foundry (Solidity 0.8.24) — IpeMarket + MockIPE + MockUSDC
```

`shared/` keeps API contracts in sync — request/response zod schemas live there,
so the same validation runs on the client (before sending) and the server
(before persisting).

## Auth model

- **Buyer:** anonymous browse + buy via Privy (email magic link, Google OAuth,
  or external wallet). PIX requires an email on the Privy account (Mercado
  Pago needs `payer.email`).
- **Admin:** Privy access token in `Authorization: Bearer ...`. The server
  verifies the token, fetches the user from Privy, then checks the linked
  emails against the `admin_users` table allowlist. Emails reach `admin_users`
  via verified Privy flows only, so a non-verified email can't impersonate.

`ADMIN_INITIAL_EMAIL` bootstraps the first admin on boot. After that, admins
are managed in the dashboard.

## Buy flow (gateway)

### PIX

```
Buyer → /orders/gateway (POST) → server creates order { status: awaiting_payment }
                                       │
                                       ▼
                          Mercado Pago createPixCharge
                                       │
                                       ▼
                      QR + payload returned to buyer
                                       │
                                       ▼
                  Buyer pays in their bank app (any time within ~30min)
                                       │
                                       ▼
        MP fires webhook → /webhooks/mercadopago (HMAC-SHA256 verified)
                                       │
                                       ▼
              Server fetches payment, marks order paid (race-safe)
                                       │
                                       ▼
              Resend sends confirmation email to buyer + admin
```

### Crypto

Same shape but routed through NOWPayments — buyer picks a coin (BTC, ETH,
USDC on multiple chains, etc.), the server creates a direct payment, returns
a BIP-21 / EIP-681 / Solana Pay URI rendered in the modal as a QR. NOWPayments
fires the IPN webhook (HMAC-SHA512 verified) when funds land, and the order
flips to paid.

Both webhooks land in the same `markPaidAndMint(orderId)` path that updates
the row atomically (single `UPDATE ... WHERE status IN ('pending',
'awaiting_payment')`) so concurrent retries are idempotent.

## Refunds

PIX refunds are automatic — admin clicks Refund, server calls Mercado Pago's
refund API, order flips to `refunded`. Crypto refunds are **manual** (send
from treasury, then flip status) because onchain transfers are irreversible
and NOWPayments doesn't auto-refund.

The MP webhook also handles `refunded` / `charged_back` payloads so refunds
initiated from the MP dashboard sync back to us.

## Database

Schema lives in `server/src/db/schema.ts`. Drizzle generates types and the
migration with `pnpm db:push`. Notable tables:

| Table | Purpose |
|---|---|
| `products` | catalog (USD price, stock, category, image URL) |
| `orders` | every purchase, status machine + payment + delivery details |
| `events` | admin-curated list of pickup events (shown as dropdown to buyers) |
| `admin_users` | email allowlist for `/admin` access |
| `indexer_state` | last block scanned by the chain indexer (currently disabled in prod) |

Sensitive shipping addresses are AES-256-GCM encrypted at rest with
`SHIPPING_ENCRYPTION_KEY`. The server decrypts on demand for admin views;
the column is never exposed in plain text in API responses.

## Image storage

Admins upload product images through the form — the server forwards the
multipart payload to **Supabase Storage** (`products` bucket, public read),
saves the public URL on the row, and the storefront serves it through
Supabase's CDN. Validation runs on both the bucket (5 MB cap + allowed MIME
types) and the server (`uploadProductImage` in `services/storage.ts`).

A "Paste URL" mode is kept as fallback for external links (Google Drive,
direct URLs). Drive share links are auto-rewritten to the thumbnail endpoint.

## PWA

The client ships as an installable PWA via `vite-plugin-pwa`. Notable
choices:

- **`registerType: 'prompt'`** — when a new SW is detected, the
  `UpdatePrompt` banner offers the user a Refresh button. No silent reloads
  mid-checkout.
- The hook polls `/sw.js` every 60s while the app is open, so updates land
  within a minute of deploy.
- Manifest icon updates require reinstalling the PWA (OS-owned); code
  updates don't.

## Live polling

`useIsFetching()` powers a thin gold progress bar at the top of the viewport
so users get feedback during background refetches. The admin tabs (orders,
products) poll every 30s so new gateway orders coming in via webhook appear
without manual refresh.

## Smart contracts (deferred)

The `IpeMarket` contract is ERC-1155 + ERC-2981 with an internal resale
book. It's tested but not deployed to mainnet yet — the gateway-first launch
shipped first to validate the buyer flow without forcing wallet onboarding.

```solidity
listProduct(maxSupply, royaltyBps, uri, tokens[], prices[])  // owner
buy(productId, qty, payToken)                                // any wallet
mintTo(to, productId, qty)                                    // owner (gateway path)
setPrice(productId, payToken, newPrice)                       // owner
listForResale(tokenId, qty, price)                            // any holder
buyResale(listingId)                                          // pays seller + royalty
redeem(productId, qty)                                        // burns on physical delivery
withdraw(token, to, amount)                                   // owner → treasury
```

Once active, the gateway flow snapshots the buyer's wallet on each order so
admin can mint the receipt later via `mintTo`. The `buyerAddress` field is
already captured at checkout for this.

See [contracts/AUDIT.md](./contracts/AUDIT.md) (when present) for the
self-audit + Slither findings.

## Indexer

A polling indexer in `server/src/services/onchain.ts` watches `Purchased`
events on the `IpeMarket` contract to reconcile direct onchain purchases
back to the DB. It's gated by `DISABLE_INDEXER=true` in production until
contracts are live.

## What's not built (intentionally)

- **Multicurrency at checkout** — keeping the UX simple. Coins are listed by
  NOWPayments at fill time.
- **Carrier integration** — admins flip `shipped` manually for now. Shopify
  fulfillment webhook is on the roadmap.
- **Subgraph** — polling indexer is fine until volume justifies the move to
  TheGraph.
- **MFA** — Privy controls auth; we don't add a second layer.
- **i18n** — strings are hardcoded in English (with selective Portuguese on
  buyer-facing flows). Will move to i18n once a second language is needed.

## Sizing assumptions

| Constraint | Assumed |
|---|---|
| Concurrent buyers | 10s, occasional spikes during a drop |
| Active products | <100 |
| Orders per month | <1k |
| Database size | <500 MB (Supabase free tier) |
| Image storage | <1 GB (Supabase free tier) |

When these blow out, the obvious upgrades are: Supabase Pro ($25/mo) and a
Railway resource bump. Nothing in the architecture needs to change.

## Roadmap (rough)

| Phase | Item |
|---|---|
| v0.x | Polish admin (size variants, filters, CSV export, audit log) |
| v0.x | Carrier webhook to auto-flip `shipped` |
| v0.x | i18n (pt-BR full) |
| v0.x | Slither + manual audit + Base Sepolia redeploy of contracts |
| v0.x | Activate onchain mint on order paid (via `mintTo`) |
| v0.x | Resale UI for buyers (browse → list → buy) |
| v1.0  | Mainnet deploy + onchain payments live |
