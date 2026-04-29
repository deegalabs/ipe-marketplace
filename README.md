# ipê.city Marketplace

Onchain marketplace on **Base** for community merch (t-shirt, hoodie, cup, cap). Payment in **$IPE**, receipts as **ERC-1155**, with royalties (ERC-2981) and internal resale.

> See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full picture, PoC scope and roadmap.

## Layout

```
contracts/   Foundry — MockIPE + IpeMarket
shared/      zod schemas + ABIs + addresses (consumed by client + server)
server/      Express + Drizzle + viem indexer
client/      Vite + React + Privy + wagmi
```

## Prereqs

- Node 20+
- Postgres 14+ (or Docker)
- [Foundry](https://book.getfoundry.sh) (forge / cast / anvil)
- A funded deployer key on **Base Sepolia** (faucet: https://www.alchemy.com/faucets/base-sepolia)
- A [Privy](https://privy.io) app id (free tier)

## End-to-end run (Base Sepolia)

### 1. Install

```bash
npm install
cd contracts && forge install && cd ..
```

### 2. Configure

```bash
cp .env.example .env
cp client/.env.example client/.env
```

Fill in `.env`:
- `DEPLOYER_PRIVATE_KEY` — funded Base Sepolia EOA
- `BASE_SEPOLIA_RPC` — defaults to https://sepolia.base.org
- `DATABASE_URL` — postgres connection string
- `SHIPPING_ENCRYPTION_KEY` — generate with `openssl rand -hex 32`
- `BASESCAN_API_KEY` — optional (for `--verify`)

### 3. Build + test contracts

```bash
npm run contracts:build
npm run contracts:test
```

All 17 tests should pass.

### 4. Deploy to Base Sepolia

```bash
npm run contracts:deploy:sepolia
```

The script deploys `MockIPE` (since `IPE_TOKEN_ADDRESS` is empty) and `IpeMarket`. Copy the printed addresses into both `.env` and `client/.env`:

```
IPE_TOKEN_ADDRESS=0x…       # also as VITE_IPE_TOKEN_ADDRESS
IPE_MARKET_ADDRESS=0x…      # also as VITE_IPE_MARKET_ADDRESS
```

Sync the freshly compiled ABIs into the shared package:

```bash
node shared/scripts/sync-abi.mjs
```

### 5. Database + seed

```bash
npm run db:push    # creates tables
npm run seed       # inserts 4 placeholder products
```

### 6. Run

```bash
npm run dev   # server on :3001, client on :5173
```

## Happy path (manual smoke test)

1. **Faucet IPE for yourself.** Open Basescan, find `MockIPE`, call `faucet()` from your wallet — you get 1000 mIPE.
2. **Push a product onchain.** Visit `/admin`, click `Push onchain` next to "Ipê T-Shirt". Sign the tx; the tokenId is recorded.
3. **Buy.** Visit `/shop` → click the t-shirt → fill the shipping form → click `Buy`. Two txs (approve + buy).
4. **Watch the indexer.** Within ~15s the server logs `[indexer] order … marked paid`.
5. **Check `/orders`** — your purchase shows as `paid` and links to the tx on Basescan.
6. **Back in `/admin`** — mark the order as `shipped`, then `delivered`. The shipping address is decrypted server-side and surfaced only here.
7. **(Optional) Resale.** From a different wallet that holds a 1155, call `listForResale(tokenId, 1, price)` directly via Basescan — buyResale flow can be exercised the same way (UI lands in v0.2).

## What's deferred (see `ARCHITECTURE.md` for the full roadmap)

- Multicurrency (USDC/ETH via oracle)
- Multisig treasury (Safe)
- Discount tier for passport holders
- Refund/burn flow in admin
- Drops with Merkle allowlist
- Subgraph (TheGraph) replacing the polling indexer
- Farcaster Frame
- Mainnet deploy + audit

## Useful commands

```bash
npm run contracts:build         # forge build
npm run contracts:test          # forge test -vv
npm run contracts:deploy:sepolia
npm run db:push                 # drizzle-kit push
npm --workspace server run db:studio
npm run seed
npm run dev                     # server + client in parallel
```
