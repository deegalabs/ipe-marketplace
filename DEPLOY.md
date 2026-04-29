# Deploy guide — gateway-only launch

> Target: live in a few hours, accepting PIX (Mercado Pago) and crypto (NOWPayments).
> Direct onchain payments are gated behind a feature flag and not exposed in this build.

## Architecture

```
                           ┌──────────────────┐
   Browser ──────────────► │  Vercel          │  Static SPA + PWA
                           │  (frontend)      │  client/dist
                           └─────────┬────────┘
                                     │
                                     │ /api/* → REST
                                     ▼
                           ┌──────────────────┐
                           │  Render          │  Express + indexer-disabled
                           │  (backend)       │  Webhooks live here
                           └─────────┬────────┘
                                     │
              ┌──────────────────────┼─────────────────────┐
              ▼                      ▼                     ▼
       ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
       │ Neon         │      │ Mercado Pago │      │ NOWPayments  │
       │ (postgres)   │      │ webhooks     │      │ IPN          │
       └──────────────┘      └──────────────┘      └──────────────┘
                                     │                     │
                                     ▼                     ▼
                           ┌──────────────────────────────────┐
                           │  Resend (transactional email)    │
                           └──────────────────────────────────┘
```

Direct onchain (`buy()` on `IpeMarket`) still works — flip `DIRECT_PAYMENTS_ENABLED = true` in `client/src/pages/Product.tsx` to bring it back. The contract also stays deployable for future `mintTo` calls when a buyer attaches a wallet.

---

## 1. Provision the database (Neon)

1. https://console.neon.tech → **Create project** (name: `ipe-store`, region close to your users).
2. Copy the **pooled** connection string from the Connection details panel — looks like
   `postgres://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require`.
3. **Don't** use the unpooled string for the API; pooled is friendlier to serverless cold starts.

Save this URL, you'll paste it into Render later.

## 2. Deploy the backend (Render)

### a. From the dashboard (recommended)
1. https://dashboard.render.com/blueprints → **New Blueprint Instance** → connect this repo.
2. Render reads `render.yaml`, picks up the `ipe-store-api` service. Approve it.
3. In the service's **Environment** tab, paste the env vars listed below.
4. After first deploy, run the schema push from the **Shell** tab:
   ```bash
   DATABASE_URL=$DATABASE_URL npm run db:push
   ```
5. Note the public URL (e.g. `https://ipe-store-api.onrender.com`).

### b. Required env vars on Render

```bash
# Database
DATABASE_URL=<the Neon pooled URL from step 1>

# Admin auth
ADMIN_JWT_SECRET=<openssl rand -base64 48>
ADMIN_INITIAL_EMAIL=you@yourdomain.com
ADMIN_INITIAL_PASSWORD=<a strong password — change after first login>

# Encryption
SHIPPING_ENCRYPTION_KEY=<openssl rand -hex 32>

# Public URLs (used in webhook callbacks + email links)
PUBLIC_API_URL=https://ipe-store-api.onrender.com
PUBLIC_APP_URL=https://ipe-store.vercel.app

# Mercado Pago
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_WEBHOOK_SECRET=<from MP dashboard → Webhooks → Secret signature>

# NOWPayments
NOWPAYMENTS_API_KEY=<from account.nowpayments.io>
NOWPAYMENTS_IPN_SECRET=<from same dashboard, IPN section>

# Resend
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL="IPE Store <orders@yourdomain.com>"   # domain must be verified
ADMIN_NOTIFICATION_EMAIL=admin@yourdomain.com

# Optional
COINGECKO_IPE_ID=                # leave empty until $IPE has a CoinGecko id
DISABLE_INDEXER=true             # gateway-only — chain indexer is unused

# Onchain — leave as zeros until you deploy the real contract
IPE_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
USDC_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
IPE_MARKET_ADDRESS=0x0000000000000000000000000000000000000000
```

## 3. Deploy the frontend (Vercel)

1. https://vercel.com/new → import this repo.
2. **Root directory:** `client`. Vercel reads `client/vercel.json` automatically.
3. Set the env vars under **Settings → Environment Variables**:

   ```bash
   VITE_PRIVY_APP_ID=cmojg1bqe01kk0cl3kbj33j1h
   VITE_API_URL=https://ipe-store-api.onrender.com    # the Render URL
   VITE_CHAIN_ID=84532
   # Onchain addresses — leave the placeholder zeros for gateway-only:
   VITE_IPE_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
   VITE_USDC_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
   VITE_IPE_MARKET_ADDRESS=0x0000000000000000000000000000000000000000
   ```
4. Deploy. Note the URL (e.g. `https://ipe-store.vercel.app`).
5. **Update Render's `PUBLIC_APP_URL`** to match this URL, redeploy the API.

## 4. Wire the webhooks

### Mercado Pago
1. https://www.mercadopago.com.br/developers → your application → **Webhooks**.
2. **Notification URL:** `https://ipe-store-api.onrender.com/webhooks/mercadopago`
3. Events: `payment` (only).
4. Copy the **Secret signature** into Render as `MERCADOPAGO_WEBHOOK_SECRET`.

### NOWPayments
1. https://account.nowpayments.io → **Store settings** → **IPN**.
2. **IPN URL:** `https://ipe-store-api.onrender.com/webhooks/nowpayments`
3. Set IPN secret, paste into Render as `NOWPAYMENTS_IPN_SECRET`.

### Resend
1. https://resend.com/domains → add the domain you'll send from.
2. Add SPF/DKIM records to DNS — propagation can take **up to 48h** but usually resolves in minutes.
3. Until verified, switch `RESEND_FROM_EMAIL` to `onboarding@resend.dev` (Resend's sandbox sender) so emails actually leave.

## 5. First admin login

1. Visit `https://ipe-store.vercel.app/admin/login`.
2. Email + password = `ADMIN_INITIAL_EMAIL` + `ADMIN_INITIAL_PASSWORD` from Render env.
3. Add products via the form. Paste a Google Drive share link as the image — backend rewrites to a `lh3.googleusercontent.com/d/{id}` URL on save.
4. **Change the bootstrap password** by editing the row in Neon, or running:
   ```sql
   UPDATE admin_users SET password_hash = crypt('new-pw', gen_salt('bf', 12))
     WHERE email = 'you@yourdomain.com';
   ```
   (Or just rotate `ADMIN_INITIAL_PASSWORD` in Render env and rebuild — the bootstrap path is a no-op when an admin with that email already exists, so you'd need to delete the row first.)

## 6. Test the happy path

1. Open `/` → pick a product.
2. **PIX:** click Checkout → enter email → "Generate PIX QR" → pay with any bank app.
3. Watch the order flip to `paid` within ~10s of payment confirmation.
4. **Crypto:** same flow, "Open crypto checkout" opens a NOWPayments hosted page. Pay with sandbox testnet coins.
5. `/admin` → see the order, mark shipped/delivered. Buyer gets emails.

## Common gotchas

- **Render free tier sleeps after 15min idle.** First request after a cold start can take ~30s and time out webhooks. Mitigation: bump to Starter ($7/mo) for production.
- **Neon free tier compute auto-scales to zero** — same first-request latency. Use the **pooled** URL (already noted above) and ideally keep one warm-up cron.
- **CORS on Vercel→Render.** Backend already has `cors()` open; if you need to restrict, set the origin to your Vercel URL.
- **Mercado Pago in production** requires a Verified business account (CNPJ). Sandbox works without this.
- **NOWPayments approval** can take ~24h for new accounts. Sandbox works immediately if you create a test app.

## When you're ready for direct onchain payments

1. Deploy contracts to Base Sepolia or mainnet (`npm run contracts:deploy:sepolia` after filling `.env`).
2. Run `npm run push-onchain` to list existing products onchain (calls `listProduct`).
3. Set `VITE_IPE_TOKEN_ADDRESS` / `VITE_USDC_TOKEN_ADDRESS` / `VITE_IPE_MARKET_ADDRESS` in Vercel.
4. Set the same on Render as `IPE_TOKEN_ADDRESS` etc.
5. Set `DISABLE_INDEXER=false` on Render so the chain indexer reconciles direct purchases.
6. Flip `DIRECT_PAYMENTS_ENABLED = true` in `client/src/pages/Product.tsx`. Redeploy.
