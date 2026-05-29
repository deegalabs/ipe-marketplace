# Contributing to Ipê Store

Thanks for thinking about contributing! This is community merch for
[ipê.city](https://ipe.city), and the project lives or dies by the people
around it. Whether you're fixing a typo, suggesting a UX tweak, or hardening
the contract, there's room for you.

## Quick links

- 🐛 Bug? Open a [GitHub issue](https://github.com/deegalabs/ipe-marketplace/issues/new/choose).
- 💡 Idea? Start a [discussion](https://github.com/deegalabs/ipe-marketplace/discussions).
- 🔒 Security? See [SECURITY.md](./SECURITY.md) — please don't open public
  issues for vulnerabilities.
- 🛠 PR? Read on.

## Setup

The full local setup is in [README.md → Local dev](./README.md#local-dev).
Short version:

```bash
corepack enable
pnpm install
docker run -d --name ipe-marketplace-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ipe_marketplace -p 55432:5432 postgres:16
cp .env.example .env
cp client/.env.example client/.env
pnpm db:push
pnpm seed
pnpm dev
```

Server runs on `:3005`, client on `:5173`.

## Workflow

1. **Fork** the repo and create a branch from `main`. Branch names like
   `fix/checkout-totals` or `feat/event-cards` help.
2. **Write** the change. Keep PRs focused — one logical change per PR makes
   review easier and ships faster.
3. **Test** locally:
   - Frontend: `pnpm dev` and walk through the affected flow
   - Server: hit the endpoints with curl or the admin UI
   - Contracts: `pnpm contracts:test` (Foundry tests, must stay green)
   - Types: `pnpm -F @ipe/client exec tsc --noEmit` and `pnpm -F @ipe/server exec tsc --noEmit`
4. **Commit** with a clear message (see below).
5. **Push** and open a PR against `main`. Fill the PR template — the more
   context, the faster the review.

## Commit messages

We follow loose [Conventional Commits](https://www.conventionalcommits.org/).
Examples from the actual history:

```
add admin refund flow for pix orders + sync refund status from mp webhook
fix white screen — keep react in main bundle, only split privy + wagmi-viem
pwa update fix — remove skipWaiting/clientsClaim (conflicted with prompt mode)
```

Pattern: `area — what changed (+ optional why)`. Lowercase, no period.

Prefixes are optional but help when scanning git log. Common ones in this
repo: `fix`, `add`, `feat`, `refactor`, `docs`, `chore`.

## Code style

- **TypeScript everywhere** — no `any` unless absolutely necessary; type the
  boundaries (API requests, DB rows).
- **React:** functional components, hooks. No class components.
- **Tailwind** with the `ipe-*` palette. Avoid raw hex.
- **Server:** routes are thin (validate + delegate). Business logic in
  `services/`.
- **Comments:** explain **why**, not what. Match the tone of existing
  comments (`///` triple-slash for doc-style on exports).
- **No emoji** in code, comments, or commit messages unless the file is
  user-facing copy that already uses them.

## What we appreciate in a PR

- Small scope: easier to review, faster to merge
- Screenshot or screen recording for UI changes
- Note about backwards compatibility for schema / API changes
- Tests where it makes sense (especially server logic + contracts)
- Updated docs (`README.md`, `ARCHITECTURE.md`, `DEPLOY.md`) if behavior
  changed

## What blocks a PR

- Failing typecheck or Foundry tests
- Security regressions (see [SECURITY.md](./SECURITY.md) for what counts)
- Breaking changes to the public API without a migration note
- Adding heavy deps without justification (bundle size matters for the PWA)

## Areas with room to help

- **Frontend UX:** lots of small wins across mobile responsiveness, dark mode
  parity, microinteractions
- **Admin tools:** filters in Orders, CSV export, bulk actions
- **Smart contracts:** the `IpeMarket` contract has tests but no formal
  audit — second eyes welcome (especially on royalty math + resale book)
- **Internationalization:** strings are hardcoded in English right now
- **Accessibility:** ARIA pass on modals and dropdowns
- **Tests:** server-side integration tests are missing

## License

By contributing you agree your work is released under the same
[MIT License](./LICENSE) as the rest of the project.
