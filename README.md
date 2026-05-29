<div align="center">

# Ipê Store

**Community merch for [ipê.city](https://ipe.city) — pay with PIX or any crypto, pickup at the next event. Onchain receipts coming soon on Base.**

[![CI](https://github.com/deegalabs/ipe-marketplace/actions/workflows/ci.yml/badge.svg)](https://github.com/deegalabs/ipe-marketplace/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Made for Base](https://img.shields.io/badge/Base-0052FF?logo=coinbase&logoColor=white)](https://base.org)

<sub>**Live:** <https://ipe-store.vercel.app> · **Docs:** [Architecture](./ARCHITECTURE.md) · [Deploy](./DEPLOY.md) · [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md)</sub>

</div>

---

## What it is

A mobile-first PWA where the ipê.city community can buy merch (t-shirts, hoodies, cups, caps) and pick it up at the next meetup. Buyers pay with **PIX** (Mercado Pago) or **any major crypto** (NOWPayments — BTC, ETH, USDC, USDT on multiple chains, etc.). Admins manage products, orders, events, and the team from a single dashboard.

The smart contracts (`IpeMarket` ERC-1155 + ERC-2981) are written and tested but **not yet active in production** — onchain receipts will land in a follow-up drop once the rest of the flow is battle-tested.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vite + React 19 + TypeScript + Tailwind + PWA (vite-plugin-pwa) |
| Auth + wallet | Privy + wagmi/viem |
| Backend | Express + Drizzle ORM + Postgres |
| Hosting | Vercel (frontend) + Railway (backend) + Supabase (Postgres + Storage) |
| Payments | Mercado Pago (PIX) + NOWPayments (crypto-gateway) |
| Email | Resend |
| Storage | Supabase Storage for product images |
| Contracts | Foundry (Solidity 0.8.24) — Base Sepolia / Base mainnet |

## Repo layout

```
contracts/   Foundry — IpeMarket + MockIPE + MockUSDC (+ Foundry tests)
shared/      zod schemas + ABIs + addresses (consumed by client + server)
server/      Express + Drizzle + payment gateways + Resend + chain indexer
client/      Vite + React + Privy + wagmi + PWA (mobile-first)
docs/        future home for design docs + ADRs
.github/     CI workflow + PR/issue templates
```

## Local dev

### Prereqs

- **Node 20+** with **pnpm** via corepack (`corepack enable`)
- **Postgres 14+** (Docker recipe below)
- [**Foundry**](https://book.getfoundry.sh) — only needed if you touch contracts
- A [**Privy**](https://privy.io) app id (free tier)

### 1. Database

```bash
docker run -d --name ipe-marketplace-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ipe_marketplace -p 55432:5432 postgres:16
```

(Port 55432 avoids clashes with other local Postgres.)

### 2. Install

```bash
corepack enable
pnpm install
cd contracts && forge install && cd ..   # only if you'll work on contracts
```

### 3. Configure

```bash
cp .env.example .env
cp client/.env.example client/.env
```

Generate the shipping-address encryption key:

```bash
openssl rand -hex 32      # → SHIPPING_ENCRYPTION_KEY
```

Minimum env to run gateway-only (without contracts):

- `DATABASE_URL` — your local Postgres
- `SHIPPING_ENCRYPTION_KEY` — from openssl above
- `PRIVY_APP_ID` + `PRIVY_APP_SECRET` — from <https://privy.io>
- `DISABLE_INDEXER=true` — skip the chain indexer

PIX, crypto-gateway, email, and image upload are optional — endpoints return 503 when their env is missing.

### 4. Schema + seed

```bash
pnpm db:push
pnpm seed                  # placeholder products
```

### 5. Run

```bash
pnpm dev                   # server :3005 + client :5173
```

### 6. Contracts (optional)

```bash
pnpm contracts:build
pnpm contracts:test        # Foundry tests, all green
```

## Production

Full walkthrough in [`DEPLOY.md`](./DEPLOY.md) — Supabase + Railway + Vercel, ~$5/mo at idle.

## Useful commands

```bash
pnpm dev                       # server + client in parallel
pnpm db:push                   # apply schema changes (drizzle-kit push)
pnpm seed                      # reset placeholder products
pnpm -F @ipe/client build      # production client bundle
pnpm -F @ipe/server build      # production server bundle
pnpm -F @ipe/server db:studio  # Drizzle Studio (DB browser)
pnpm contracts:build           # forge build
pnpm contracts:test            # forge test -vv
pnpm contracts:deploy:sepolia  # deploy + verify on Base Sepolia
pnpm push-onchain              # batch-list DB products onchain
```

## Contributing

PRs welcome — see [`CONTRIBUTING.md`](./CONTRIBUTING.md). Quick guidelines:
keep PRs scoped, add a screenshot for UI changes, make sure typecheck and
Foundry tests stay green, and read [`SECURITY.md`](./SECURITY.md) before
reporting anything sensitive.

## License

[MIT](./LICENSE) — fork it, ship it, run your own community merch store.
