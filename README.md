# IPE Store

Onchain merch marketplace on **Base** for the ipê.city community. Payment in **$IPE**, **USDC**, **PIX** (Mercado Pago) or any **crypto** (NOWPayments). Receipts as **ERC-1155** with royalties (ERC-2981) and an internal resale book.

> See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full picture, [`DEPLOY.md`](./DEPLOY.md) for the production setup.

## Layout

```
contracts/   Foundry — IpeMarket + MockIPE + MockUSDC
shared/      zod schemas + ABIs + addresses (consumed by client + server)
server/      Express + Drizzle + Resend + Mercado Pago + NOWPayments + chain indexer
client/      Vite + React + Privy + wagmi + PWA (mobile-first)
```

## Prereqs

- **Node 20+** with **pnpm** (auto-installed via corepack: `corepack enable`)
- **Postgres 14+** (or Docker — see step 1 below)
- [**Foundry**](https://book.getfoundry.sh) for contract dev (forge / cast / anvil)
- A [**Privy**](https://privy.io) app id (free tier)

## Local dev

### 1. Database

```bash
docker run -d --name ipe-marketplace-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ipe_marketplace -p 55432:5432 postgres:16
```

(Use 55432 to avoid clashing with other local Postgres on 5432.)

### 2. Install

```bash
corepack enable          # one-time, picks up the pnpm version pinned in package.json
pnpm install
cd contracts && forge install && cd ..
```

### 3. Configure

```bash
cp .env.example .env
cp client/.env.example client/.env
```

Fill `.env` (see `.env.example` — the deploy keys are optional for dev). Generate the encryption key with:

```bash
openssl rand -hex 32      # → SHIPPING_ENCRYPTION_KEY
```

### 4. Contracts (optional for gateway-only flow)

```bash
pnpm contracts:build
pnpm contracts:test       # 27 tests
```

For local chain dev:

```bash
anvil --chain-id 84532 --port 8545 &
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  pnpm contracts:deploy:sepolia
node shared/scripts/sync-abi.mjs
```

Then paste the printed addresses into `.env` + `client/.env`.

### 5. Database schema + seed

```bash
pnpm db:push
pnpm seed                 # 4 placeholder products
```

### 6. Run

```bash
pnpm dev                  # server :3005 + client :5173
```

## Production

See [`DEPLOY.md`](./DEPLOY.md) for the full Supabase + Railway + Vercel walkthrough.

## Useful commands

```bash
pnpm contracts:build          # forge build
pnpm contracts:test           # forge test -vv
pnpm contracts:deploy:sepolia
pnpm db:push                  # drizzle-kit push
pnpm --filter @ipe/server db:studio
pnpm seed
pnpm push-onchain             # batch list off-chain products onchain
pnpm dev                      # server + client in parallel
```
