# Deploy guide — gateway-only launch

> Stack: **Supabase** (Postgres + Storage) → **Railway** (backend) → **Vercel** (frontend).
> Direct onchain payments are written and tested but disabled in this build.

## Architecture

```
                           ┌──────────────────┐
   Browser / PWA ────────► │  Vercel          │  Vite SPA + service worker
                           │  (frontend)      │  client/dist
                           └─────────┬────────┘
                                     │
                                     │ HTTPS → REST (JSON)
                                     ▼
                           ┌──────────────────┐
                           │  Railway         │  Express + Drizzle
                           │  (backend)       │  Webhooks land here
                           └─────────┬────────┘
                                     │
       ┌─────────────────────────────┼─────────────────────────────┐
       │                             │                             │
       ▼                             ▼                             ▼
┌──────────────┐            ┌──────────────┐            ┌──────────────┐
│ Supabase     │            │ Mercado Pago │            │ NOWPayments  │
│ Postgres +   │            │  webhook     │            │  IPN         │
│ Storage      │            └──────────────┘            └──────────────┘
└──────────────┘                     │                             │
                                     ▼                             ▼
                           ┌──────────────────────────────────────────┐
                           │  Resend (transactional email)            │
                           └──────────────────────────────────────────┘
```

Direct onchain (`buy()` on `IpeMarket`) still works in the contract — flip
`DIRECT_PAYMENTS_ENABLED = true` in `client/src/pages/Product.tsx`, deploy
the contracts, fill the chain env vars, and redeploy to bring it back.

---

## 1. Provision the database (Supabase)

1. <https://supabase.com/dashboard> → **New project**. Pick a region close to
   your users (São Paulo `sa-east-1` for a BR audience).
2. Wait ~1 min for provisioning.
3. **Settings → Database → Connection string**. Use the **session-mode**
   URL (port `5432`) — it works for both runtime and `drizzle-kit push`.

   ```
   postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

### 1a. Storage bucket for product images

1. **Storage → New bucket**, name `products`, **Public** ✓.
2. Set **Restrict file size** to 5 MB.
3. Set **Restrict MIME types** to `image/png, image/jpeg, image/webp, image/gif`.

### 1b. Push the schema

Locally, with the Supabase URL in `server/.env`:

```bash
pnpm db:push
```

Re-run this any time `schema.ts` changes.

---

## 2. Deploy the backend (Railway)

### 2a. Create the service

1. <https://railway.com/new> → **Deploy from GitHub repo** → pick this repo.
2. Railway reads `railway.json` at the repo root. Railpack detects pnpm,
   runs `pnpm install`, then `pnpm --filter @ipe/server start`.
3. The service spins up but will crash without env vars — set them next.

### 2b. Required env vars

Service → **Variables** → bulk add:

```bash
# ── Core ──────────────────────────────────────────────
DATABASE_URL=postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres
PORT=3005
NODE_ENV=production
SHIPPING_ENCRYPTION_KEY=<openssl rand -hex 32>
DISABLE_INDEXER=true            # gateway-only — indexer doesn't poll the chain

# ── Public URLs (used in webhook callbacks + email links) ──
PUBLIC_API_URL=https://<your-service>.up.railway.app
PUBLIC_APP_URL=https://<your-app>.vercel.app

# ── Auth (Privy) ──────────────────────────────────────
# Same Privy app you use for the client; secret comes from
# Privy dashboard → Settings → API keys (server-side secret).
PRIVY_APP_ID=<from privy dashboard>
PRIVY_APP_SECRET=<from privy dashboard>
ADMIN_INITIAL_EMAIL=you@yourdomain.com   # bootstrapped to admin allowlist on first boot

# ── Mercado Pago (PIX) ────────────────────────────────
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_WEBHOOK_SECRET=<MP dashboard → Webhooks → Secret signature>

# ── NOWPayments (crypto-gateway) ──────────────────────
NOWPAYMENTS_API_KEY=<account.nowpayments.io → API keys>
NOWPAYMENTS_IPN_SECRET=<same dashboard → Store settings → IPN>

# ── Resend (transactional email) ──────────────────────
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL="Ipê Store <orders@yourdomain.com>"
ADMIN_NOTIFICATION_EMAIL=admin@yourdomain.com   # admin alerts

# ── Supabase Storage (product image uploads) ──────────
SUPABASE_URL=https://<ref>.supabase.co         # Supabase → Settings → API → Project URL
SUPABASE_SERVICE_KEY=eyJ...                    # service_role secret (NOT the anon key)
SUPABASE_PRODUCTS_BUCKET=products              # optional, defaults to "products"

# ── Onchain — leave as zeros until you deploy contracts ──
IPE_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
USDC_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
IPE_MARKET_ADDRESS=0x0000000000000000000000000000000000000000
BASE_SEPOLIA_RPC=https://sepolia.base.org
CHAIN_ID=84532

# ── Safety ────────────────────────────────────────────
# Must NOT be true in prod — env.ts crashes the boot if it is.
ALLOW_UNVERIFIED_WEBHOOKS=false
```

> The server fails loud at boot if `NODE_ENV=production` and any of:
> `PRIVY_APP_ID`/`PRIVY_APP_SECRET` missing, `MERCADOPAGO_WEBHOOK_SECRET`
> missing when MP is enabled, `NOWPAYMENTS_IPN_SECRET` missing when
> NOWPayments is enabled, or `ALLOW_UNVERIFIED_WEBHOOKS=true`.

### 2c. Public domain

**Settings → Networking → Generate Domain**. Railway gives you
`https://<service>.up.railway.app`. Set `PUBLIC_API_URL` to this URL — the
next deploy picks it up.

### 2d. Verify

```bash
curl https://<service>.up.railway.app/health
# {"ok":true}
```

If the bootstrap admin was provisioned, the service logs show
`[auth] bootstrap admin "you@yourdomain.com" already in allowlist`
(or `added` on the very first boot).

---

## 3. Deploy the frontend (Vercel)

1. <https://vercel.com/new> → import the same repo.
2. **Root directory:** `client`. Vercel reads `client/vercel.json`
   automatically (framework: vite, install runs at the workspace root).
3. **Settings → Environment Variables:**

   ```bash
   VITE_PRIVY_APP_ID=<same as PRIVY_APP_ID on Railway>
   VITE_API_URL=https://<service>.up.railway.app   # Railway URL
   VITE_CHAIN_ID=84532

   # Onchain placeholders — leave as zeros for gateway-only:
   VITE_IPE_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
   VITE_USDC_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
   VITE_IPE_MARKET_ADDRESS=0x0000000000000000000000000000000000000000
   ```

4. Deploy. Note the URL (e.g. `https://ipe-store.vercel.app`).
5. **Update Railway's `PUBLIC_APP_URL`** to match — redeploy the API.

---

## 4. Wire the webhooks

### Mercado Pago

1. <https://www.mercadopago.com.br/developers> → your app → **Webhooks**.
2. **URL de notificação:** `https://<service>.up.railway.app/webhooks/mercadopago`
3. Eventos: **Pagamentos** (`payment`) only.
4. Copy the **Secret signature** into Railway as `MERCADOPAGO_WEBHOOK_SECRET`.

### NOWPayments

1. <https://account.nowpayments.io> → **Store settings → IPN settings**.
2. **IPN URL:** `https://<service>.up.railway.app/webhooks/nowpayments`
3. Set an IPN secret, paste into Railway as `NOWPAYMENTS_IPN_SECRET`.

### Resend

1. <https://resend.com/domains> → add the domain you'll send from.
2. Add SPF/DKIM records in your DNS panel — propagation usually takes
   minutes but can be up to 48h.
3. While waiting, switch `RESEND_FROM_EMAIL` to `onboarding@resend.dev` so
   emails actually leave during testing.

---

## 5. First admin login

1. Visit `https://<your-app>.vercel.app/admin`.
2. Sign in with Privy (the **same email** you set as `ADMIN_INITIAL_EMAIL`).
3. The server verifies the Privy token, sees your email in the allowlist,
   and grants access.

Add more admins from `/admin → Admins`. Privy must have verified the email
on the new admin's account (email login or Google OAuth) — wallet-only
sign-ins don't have an email.

---

## 6. Smoke test the happy path

1. Open `/` → pick a product.
2. **PIX:** Checkout → confirm email → "Generate PIX QR" → pay in any bank
   app (sandbox MP QR works).
3. Order flips to `paid` within seconds of webhook delivery.
4. **Crypto:** same flow, pick a coin → in-app QR or hosted page
   (depending on coin support).
5. `/admin → Orders` → mark `shipped`/`delivered`. Buyer gets emails.
6. `/admin → Events` → create the next pickup event. It appears as a
   dropdown in the buyer's checkout.

---

## Common gotchas

- **Supabase free tier pauses** after 1 week of inactivity. First request
  after pause takes ~10s. Mitigation: $25/mo Pro tier or a 6-hour keepalive
  cron pinging `/health`.
- **Railway has no free tier** — minimum is $5/mo. Trial credit covers
  about the first month.
- **Mercado Pago production** needs a verified CNPJ account. Sandbox works
  without that for testing.
- **NOWPayments approval** can take ~24h for new accounts. The sandbox app
  is immediate.
- **CORS** is locked to `PUBLIC_APP_URL` (+ Vite dev origins in
  non-prod). Update both URLs if you swap domains.
- **PWA updates** — the client shows a "New version available" banner on
  every deploy. Manifest changes (icon, name) still require reinstalling
  the PWA (OS controls those).

---

## When you're ready for direct onchain payments

1. Deploy contracts (`pnpm contracts:deploy:sepolia` with `.env` filled).
2. `pnpm push-onchain` — batch-list existing DB products onchain
   (`IpeMarket.listProduct`).
3. Set chain envs on Vercel (`VITE_IPE_TOKEN_ADDRESS`, `VITE_USDC_TOKEN_ADDRESS`,
   `VITE_IPE_MARKET_ADDRESS`) and Railway (same names without the `VITE_`
   prefix).
4. Set `DISABLE_INDEXER=false` on Railway so chain events reconcile direct
   purchases back to the DB.
5. Flip `DIRECT_PAYMENTS_ENABLED = true` in
   `client/src/pages/Product.tsx`. Redeploy Vercel.

---

## Cost summary

| Service | Plan | Cost |
|---|---|---|
| Supabase | Free | $0 (500 MB DB + 1 GB storage, paused after 1wk idle) |
| Railway | Hobby | ~$5/mo (usage-based, mostly idle) |
| Vercel | Hobby | $0 (personal use) |
| Resend | Free | $0 (3 000 emails/mo) |
| Mercado Pago | — | ~0.99% per PIX transaction |
| NOWPayments | — | 0.5% per crypto transaction |

Total fixed: **~$5/mo**. Transactional fees scale with revenue.
