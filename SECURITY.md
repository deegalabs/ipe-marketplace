# Security Policy

Ipê Store handles real money (PIX, crypto payments) and will eventually mint
ERC-1155 receipts onchain. Security reports are taken seriously and we'll
respond fast.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security bugs.**

Use one of these channels instead:

- **GitHub Security Advisories** (preferred) — open a private advisory at
  <https://github.com/deegalabs/ipe-marketplace/security/advisories/new>.
- **Email** — `security@deegalabs.com.br`. Encrypt with our PGP key if you
  consider the finding sensitive (request the key in your first message).

Include:

- A clear description of the issue + impact
- Steps to reproduce (PoC if possible)
- Affected component (`client/`, `server/`, `contracts/`, infra/CI)
- Your suggested fix, if any

We'll acknowledge within **48 hours** and aim to land a fix within **7 days**
for high-severity issues, **30 days** for lower severity. We'll credit you in
the release notes unless you ask to remain anonymous.

## Scope

In scope:

- Payment flows (PIX via Mercado Pago, crypto via NOWPayments)
- Order data integrity (status transitions, race conditions)
- Admin auth + access control (Privy + email allowlist)
- Smart contracts in `contracts/src/`
- Server endpoints in `server/src/routes/`
- Image upload + storage handling
- Webhook signature verification

Out of scope:

- Findings that require physical access to a user's device
- Self-XSS / clickjacking on pages without auth state
- Issues in third-party services we depend on (Privy, Mercado Pago,
  NOWPayments, Supabase, Vercel, Railway) — please report those upstream
- Rate-limit bypasses below our published limits

## Known assumptions

- Admin auth trusts Privy's email verification. If Privy is compromised, our
  allowlist is too.
- We currently do not require MFA for admin sign-in beyond what Privy
  provides.
- Webhook handlers verify signatures (HMAC-SHA256 for Mercado Pago,
  HMAC-SHA512 for NOWPayments). The `ALLOW_UNVERIFIED_WEBHOOKS` escape hatch
  is gated to non-production environments by `env.ts`.

## Supported versions

We only patch the latest `main`. Older deploys aren't backported.
