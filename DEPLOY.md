# Deploy guide — gateway-only launch

> Stack: **Supabase** (Postgres) → **Railway** (backend) → **Vercel** (frontend).
> Direct onchain payments are gated behind a feature flag and not exposed in this build.

## Architecture

```
                           ┌──────────────────┐
   Browser ──────────────► │  Vercel          │  Static SPA + PWA
                           │  (frontend)      │  client/dist
                           └─────────┬────────┘
                                     │
                                     │ HTTPS → REST
                                     ▼
                           ┌──────────────────┐
                           │  Railway         │  Express + indexer disabled
                           │  (backend)       │  Webhooks live here
                           └─────────┬────────┘
                                     │
              ┌──────────────────────┼─────────────────────┐
              ▼                      ▼                     ▼
       ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
       │ Supabase     │      │ Mercado Pago │      │ NOWPayments  │
       │ Postgres     │      │ webhook      │      │ IPN          │
       └──────────────┘      └──────────────┘      └──────────────┘
                                     │                     │
                                     ▼                     ▼
                           ┌──────────────────────────────────┐
                           │  Resend (transactional email)    │
                           └──────────────────────────────────┘
```

Direct onchain (`buy()` on `IpeMarket`) still works in the contract — flip `DIRECT_PAYMENTS_ENABLED = true` in `client/src/pages/Product.tsx` and redeploy to bring it back.

---

## 1. Provision the database (Supabase)

1. https://supabase.com/dashboard → **New project**. Pick a region close to your users (São Paulo `sa-east-1` for BR audience).
2. Wait for the project to finish provisioning (~1 min).
3. Click **Connect** in the top bar. You'll see two relevant connection strings — both go through Supavisor (Supabase's pooler):

   ```bash
   # Session mode — port 5432 (recommended for our app: works for runtime AND migrations)
   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres

   # Transaction mode — port 6543 (alternative for high concurrency, but watch out for prepared
   # statements; drizzle-kit push needs session mode)
   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```

   **Use the session-mode URL (port 5432) as your `DATABASE_URL`.** It works for both runtime and migrations without any caveats.

4. Save the URL — you'll paste it into Railway and use it locally to push the schema.

### Push the schema once

From your local machine, with the Supabase URL in `server/.env`:

```bash
npm run db:push
```

This creates all tables on Supabase. You can re-run it any time after schema changes.

## 2. Deploy the backend (Railway)

### a. Create the service

1. https://railway.com/new → **Deploy from GitHub repo** → pick this repo.
2. Railway reads `railway.json` (in the repo root), uses Railpack to build. The default start command runs `npm --workspace server run start`.
3. The service spins up but will crash without env vars. That's expected — set them next.

### b. Required env vars on Railway

Go to your service → **Variables** → bulk add:

```bash
# Database (Supabase session-mode pooler URL)
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres

# Server
PORT=3005
SHIPPING_ENCRYPTION_KEY=<openssl rand -hex 32>
DISABLE_INDEXER=true                       # gateway-only deploy

# Admin auth
ADMIN_JWT_SECRET=<openssl rand -base64 48>
ADMIN_INITIAL_EMAIL=you@yourdomain.com
ADMIN_INITIAL_PASSWORD=<a strong password — change after first login>

# Public URLs (used in webhook callbacks + email links)
PUBLIC_API_URL=https://<your-service>.up.railway.app
PUBLIC_APP_URL=https://<your-app>.vercel.app

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

# Onchain — leave as zeros until you deploy the real contract
IPE_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
USDC_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
IPE_MARKET_ADDRESS=0x0000000000000000000000000000000000000000
BASE_SEPOLIA_RPC=https://sepolia.base.org
CHAIN_ID=84532
```

### c. Generate a public domain

In **Settings → Networking → Generate Domain**. Railway gives you `https://<service>.up.railway.app`. Update `PUBLIC_API_URL` to match this URL — redeploy picks it up.

### d. Verify

```bash
curl https://<service>.up.railway.app/health
# {"ok":true}
```

If you see `{"ok":true}`, the bootstrap admin was created on first boot — check the service logs for `[auth] bootstrap admin "..." created`.

## 3. Deploy the frontend (Vercel)

1. https://vercel.com/new → import the same repo.
2. **Root directory:** `client`. Vercel reads `client/vercel.json` automatically.
3. **Settings → Environment Variables**:

   ```bash
   VITE_PRIVY_APP_ID=cmojg1bqe01kk0cl3kbj33j1h
   VITE_API_URL=https://<service>.up.railway.app    # the Railway URL from step 2c
   VITE_CHAIN_ID=84532
   # Onchain placeholders — leave as zeros for gateway-only:
   VITE_IPE_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
   VITE_USDC_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
   VITE_IPE_MARKET_ADDRESS=0x0000000000000000000000000000000000000000
   ```
4. Deploy. Note the URL (e.g. `https://ipe-store.vercel.app`).
5. **Update Railway's `PUBLIC_APP_URL`** to match this URL, redeploy the API.

## 4. Wire the webhooks

### Mercado Pago
1. https://www.mercadopago.com.br/developers → your application → **Webhooks**.
2. **URL de notificação:** `https://<service>.up.railway.app/webhooks/mercadopago`
3. Eventos: `payment` (only).
4. Copy the **Secret signature** into Railway as `MERCADOPAGO_WEBHOOK_SECRET`.

### NOWPayments
1. https://account.nowpayments.io → **Store settings → Notifications (IPN)**.
2. **IPN URL:** `https://<service>.up.railway.app/webhooks/nowpayments`
3. Set IPN secret, paste into Railway as `NOWPAYMENTS_IPN_SECRET`.

### Resend
1. https://resend.com/domains → add the domain you'll send from.
2. Add SPF/DKIM records in your DNS panel — propagation usually takes minutes but can be up to 48h.
3. While waiting, switch `RESEND_FROM_EMAIL` to `onboarding@resend.dev` (Resend's sandbox sender) so emails actually leave during testing.

## 5. First admin login

1. Visit `https://<your-app>.vercel.app/admin/login`.
2. Email + password = `ADMIN_INITIAL_EMAIL` + `ADMIN_INITIAL_PASSWORD` from Railway env.
3. Add products via **+ New product**. Paste a Google Drive share link as the image — backend rewrites to a `lh3.googleusercontent.com/d/{id}` URL on save (the Drive file must be set to **anyone with the link can view**).
4. **Change the bootstrap password.** In Supabase SQL Editor:
   ```sql
   -- Hash a new password locally first; psql + pgcrypto is easiest if you enable the extension
   -- Or just run this script from your laptop:
   --   node -e "console.log(require('bcryptjs').hashSync('new-pw', 12))"
   UPDATE admin_users
   SET password_hash = '<bcrypt-hash>'
   WHERE email = 'you@yourdomain.com';
   ```

   You can also disable the bootstrap by clearing `ADMIN_INITIAL_PASSWORD` on Railway — the upsert is idempotent so it'll do nothing on subsequent boots.

## 6. Test the happy path

1. Open `/` → pick a product.
2. **PIX:** click Checkout → enter email → "Generate PIX QR" → pay with any bank app (sandbox Mercado Pago QR works).
3. Watch the order flip to `paid` within ~10s of payment confirmation.
4. **Crypto:** same flow, "Open crypto checkout" opens a NOWPayments hosted page. Pay with sandbox testnet coins.
5. `/admin` → see the order, mark shipped/delivered. Buyer gets emails.

## Common gotchas

- **Supabase compute pauses on free tier** after 1 week of inactivity. First request after pause takes ~10s. Mitigation: $25/mo Pro tier or a keepalive cron.
- **Railway has no free tier** — minimum is $5/mo (Hobby plan). The trial credit covers the first month.
- **Mercado Pago in production** requires a verified business account (CNPJ). Sandbox works without verification.
- **NOWPayments approval** can take ~24h for new accounts. Sandbox IPN works immediately on a test app.
- **Double-mint protection.** Webhook handlers no-op if order is already `paid|shipped|delivered`, but in extreme races (MP retry while we're processing) you might want a row-level lock. Not added for v0.3 since it hasn't bitten.
- **CORS** is open in the Express app — fine for now, lock down to your Vercel origin before public launch:
  ```ts
  app.use(cors({ origin: env.PUBLIC_APP_URL }));
  ```

## When you're ready for direct onchain payments

1. Deploy contracts to Base Sepolia or mainnet (`npm run contracts:deploy:sepolia` after filling `.env` locally).
2. Run `npm run push-onchain` to list existing products onchain (calls `IpeMarket.listProduct`).
3. Set `VITE_IPE_TOKEN_ADDRESS` / `VITE_USDC_TOKEN_ADDRESS` / `VITE_IPE_MARKET_ADDRESS` in Vercel.
4. Set the same on Railway as `IPE_TOKEN_ADDRESS` etc.
5. Set `DISABLE_INDEXER=false` on Railway so chain events reconcile direct purchases.
6. Flip `DIRECT_PAYMENTS_ENABLED = true` in `client/src/pages/Product.tsx`. Redeploy Vercel.

## Cost summary (tomorrow's launch)

| Service | Plan | Cost |
|---|---|---|
| Supabase | Free | $0 (500 MB DB, paused after 1wk idle) |
| Railway | Hobby | ~$5/mo (usage-based, mostly idle) |
| Vercel | Hobby | $0 (personal use) |
| Resend | Free | $0 (3000 emails/mo) |
| Mercado Pago | — | ~0.99% per PIX transaction |
| NOWPayments | — | 0.5% per crypto transaction |

Total fixed: **~$5/mo**. Transactional fees scale with revenue.
