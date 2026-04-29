# ipê.city Marketplace — Architecture

> Onchain marketplace on **Base** where each physical item (t-shirt, hoodie, cup, cap) is tokenized as an **ERC-1155**. Payment in **$IPE**. The onchain receipt is both the right to redeem the physical item **and** a resellable asset.

---

## Stack

Aligned with `ganutf/ipecityapp` so components can be reused and merged in later.

| Layer             | Tech                                                |
| ----------------- | --------------------------------------------------- |
| Frontend          | Vite + React 18 + TS + Tailwind + shadcn/ui         |
| Auth + Wallet     | Privy + wagmi/viem                                  |
| Backend           | Express + Drizzle + Postgres                        |
| Contracts         | Foundry (Solidity 0.8.24)                           |
| Network           | Base Sepolia → Base mainnet                         |
| Media storage     | IPFS via Pinata (ERC-1155 metadata URIs)            |
| Indexer           | viem polling → DB (subgraph deferred)               |

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Client (Vite/React)                                        │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────┐  │
│  │   /shop    │  │  /product  │  │  /orders   │  │/admin│  │
│  └────────────┘  └────────────┘  └────────────┘  └──────┘  │
│         │                                                   │
│         ▼ Privy (Auth) + wagmi (sign/tx)                    │
└─────────┬─────────────────────────────────────┬────────────┘
          │                                     │
          │ REST (catalog, orders)              │ RPC
          ▼                                     ▼
┌────────────────────────┐         ┌──────────────────────────┐
│  Server (Express)      │         │  Base L2                 │
│  - /products           │         │  ┌────────────────────┐  │
│  - /orders             │         │  │  IpeMarket (1155)  │  │
│  - /webhooks/onchain   │ ◄─────  │  │  Purchased event   │  │
│  - admin endpoints     │ Indexer │  │  Resale event      │  │
└────────┬───────────────┘         │  └────────────────────┘  │
         │                         │  ┌────────────────────┐  │
         ▼                         │  │  $IPE (ERC-20)     │  │
┌────────────────────┐             │  └────────────────────┘  │
│ Postgres (Drizzle) │             └──────────────────────────┘
│  - products        │
│  - orders (PII enc)│
│  - shipments       │
└────────────────────┘
```

### Buy flow

1. Buyer connects via Privy (email / passkey / wallet).
2. UI lists the catalog (off-chain), each product mapped to a `tokenId`.
3. Buyer calls `approve(IPE, market)` → `buy(productId, qty)` → contract pulls IPE into the treasury and mints the 1155.
4. Buyer fills the shipping address → server encrypts and stores the order linked to the `txHash`.
5. Indexer listens for `Purchased`, marks the order as `paid`.
6. Admin updates status to `shipped` / `delivered`.

---

## Contracts

### `IpeMarket.sol` (ERC-1155 + ERC-2981)

```
listProduct(price, supply, uri, royaltyBps)   // owner only
buy(productId, qty)                            // requires prior approve(IPE)
listForResale(tokenId, qty, price)             // any holder
buyResale(listingId)                           // pays seller + royalty to treasury
redeem(productId, qty)                         // burn upon physical delivery (optional)
withdraw(token, to, amount)                    // owner → treasury
```

### `MockIPE.sol`

Plain ERC-20 used on Base Sepolia only. Replaced with the real $IPE address via env once available.

---

## Admin panel — what's different

Vs. a traditional Shopify-style admin:

**Dual inventory**
- Onchain stock (`supply` in the contract)
- Physical stock (DB)
- Alert when they diverge (e.g. sold onchain but warehouse is empty)

**Payment via event, not webhook**
- No Stripe. The indexer listens for `Purchased(buyer, tokenId, qty, price, txHash)` on Base.
- Off-chain order is reconciled by `txHash`.

**Operations cost gas**
- "Add product" = onchain tx
- "Refund" = burn 1155 + transfer IPE (tx)
- UI surfaces gas estimate before confirming

**Treasury**
- Contract IPE balance visible on the dashboard
- `withdraw` button (ideally pointing to a multisig Safe)
- Withdrawal history

**Discount token-gating**
- Holders of a `*.ipecity.eth` passport get X% off
- Detected client-side via wagmi/Privy at checkout
- Validated server-side before generating the quote

**Indexer / health**
- Panel shows "last indexed tx" — alert if it falls behind
- Manual re-sync from a specific block

---

## Royalties & Resale

### Royalties (ERC-2981)

Each product has `royaltyBps` (e.g. `500` = 5%). External marketplaces (OpenSea on Base) read the standard and route royalties to the treasury automatically on secondary sales.

### Internal resale

`IpeMarket` keeps its own book:

```
seller:  listForResale(tokenId, qty, price_in_IPE)
buyer:   buyResale(listingId)
         → IPE: buyer → seller (price - royalty)
         → IPE: buyer → treasury (royalty)
         → 1155: seller → buyer
```

**Pro:** native IPE-denominated resale, same UX as primary purchase, royalty enforcement guaranteed (doesn't depend on OpenSea honoring 2981).
**Con:** liquidity is fragmented vs. OpenSea — but the two coexist; it's the seller's choice.

---

## Multicurrency (what it is, why deferred)

**What:** accept payment in multiple tokens (IPE, USDC on Base, ETH) with prices quoted in USD via a price oracle (Chainlink) and on-the-fly swap if the buyer pays in a different token.

**Why deferred:**
- Adds an oracle dependency (risk + complexity)
- Slippage and failed txs become more common
- $IPE needs real utility first — accepting USDC dilutes that
- The PoC validates the IPE-only flow with less surface area for bugs

---

## PoC scope (ships now)

| Item                                                     | Status |
| -------------------------------------------------------- | ------ |
| `MockIPE` + `IpeMarket` (ERC-1155 + ERC-2981)            | ✅     |
| Foundry tests (buy, resale, royalty, withdraw)           | ✅     |
| Base Sepolia deploy script                               | ✅     |
| Catalog seed: t-shirt, hoodie, cup, cap                  | ✅     |
| Privy + wagmi connection                                 | ✅     |
| Buy in IPE (approve + buy)                               | ✅     |
| "My receipts" page (owned 1155s)                         | ✅     |
| Internal resale (list + buy)                             | ✅     |
| Admin: create product                                    | ✅     |
| Admin: list orders + mark `shipped`                      | ✅     |
| Admin: view treasury + withdraw                          | ✅     |
| Encrypted shipping address capture (server-side)         | ✅     |
| Simple indexer (poll events every N seconds)             | ✅     |

---

## Roadmap (post-PoC)

| Phase | Item                                                              |
| ----- | ----------------------------------------------------------------- |
| v0.2  | Multicurrency (USDC/ETH on Base via Chainlink oracle)             |
| v0.2  | Multisig treasury (Gnosis Safe)                                   |
| v0.3  | Discount tier based on $IPE / passport holding                    |
| v0.3  | Refund/burn flow in admin (with reason + audit log)               |
| v0.4  | Drop mechanism — Merkle allowlist, mint queue                     |
| v0.4  | Subgraph (TheGraph) replacing the polling indexer                 |
| v0.4  | Shopify/carrier webhook to flip `shipped` automatically           |
| v0.5  | Farcaster Frame to buy from inside the feed                       |
| v0.5  | Contract audit (Code4rena / Spearbit)                             |
| v0.5  | Mainnet deploy                                                     |
| v1.0  | Merge into `ipecityapp` as the `marketplace` module               |

---

## Assumed decisions (correct me if wrong)

- Shipping address captured **off-chain** (privacy) — encrypted at rest.
- No cumulative royalties (royalty applies only to the sale price, not recursively).
- No royalty splits (100% to the treasury). Splits land in v0.3 if artists/collabs join.
- No multisig on the PoC treasury — owner is an EOA. Switch to Safe before mainnet.

---

## Next steps

1. You hand over the **$IPE** address when ready (using `MockIPE` until then).
2. Confirm the scope above.
3. Hand over images/specs for the 4 products (or I'll use placeholders).
4. I scaffold the monorepo + contracts with tests.
