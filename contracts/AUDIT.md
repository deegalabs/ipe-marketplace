# IpeMarket — Self-audit

> Status: **self-audit only**. This contract has Foundry unit tests but has
> not been formally audited by a third party. It is currently deferred —
> production runs the gateway-only flow with the contract dormant. Treat the
> findings below as a starting checklist for the external audit before
> mainnet deployment.
>
> Last reviewed: 2026-05.

## Scope

| File | LoC | Reviewed |
|---|---|---|
| `contracts/src/IpeMarket.sol` | 329 | ✅ |
| `contracts/src/MockIPE.sol` | 23 | ✅ (mock only — not deployed to mainnet) |
| `contracts/src/MockUSDC.sol` | 28 | ✅ (mock only — not deployed to mainnet) |

Tests: `contracts/test/IpeMarket.t.sol` (379 LoC, all passing).

## Tools used

- ✅ **Foundry** — `forge test -vv` (full suite green)
- ✅ **Manual review** — line by line
- ⏳ **Slither** — pending (no pip on dev machine at audit time; run before
  mainnet via `pipx install slither-analyzer && slither contracts/`)
- ⏳ **Mythril / Echidna** — pending
- ⏳ **External audit (Code4rena / Spearbit)** — required before mainnet

## Architecture summary

`IpeMarket` is an ERC-1155 + ERC-2981 contract where each `productId` is a
SKU. Owner whitelists payment tokens (ERC-20), sets per-product per-token
prices, and lists products with an optional `maxSupply` cap. Buyers can:

1. **Direct buy** — `buy(productId, qty, paymentToken)` — transfers ERC-20
   to `treasury`, mints the 1155 to `msg.sender`.
2. **Fiat-paid mint** — `mintTo(buyer, productId, qty, fiatRef)` —
   owner-only, mints without onchain payment, used by the gateway flow
   (PIX/crypto-gateway) when the off-chain payment confirms.
3. **Internal resale** — `listForResale` / `buyResale` / `cancelResale` —
   escrows the 1155 in the contract and routes royalty to `treasury` via
   ERC-2981 on each fill.

Owner can `withdraw` any ERC-20 from the contract balance (used after
resale royalties accumulate).

## Findings

### Severity legend

| Symbol | Meaning |
|---|---|
| 🔴 | Critical — must fix before any deploy |
| 🟠 | High — fix before mainnet |
| 🟡 | Medium — review and decide |
| 🔵 | Low — quality of life |
| 🟢 | Informational |

### 🟠 H-1: `mintTo` trusts the operator entirely

**Location:** `IpeMarket.sol:214-228`

`mintTo` is `onlyOwner` and mints the receipt without onchain payment
verification. Compromise of the operator key → unlimited mints up to
`maxSupply`.

**Recommendation (before mainnet):**

- Move ownership to a Gnosis Safe multisig.
- Add a per-day mint cap or a circuit breaker the multisig can flip if a
  rogue operator key triggers mass mints.
- Consider on-chain attestation of the payment ref (signed by an oracle)
  rather than blind trust in the caller.

### 🟠 H-2: Treasury is a single EOA

**Location:** `IpeMarket.sol:23`, `setTreasury` at `:177-181`

`treasury` receives primary-sale revenue and royalties. If it's an EOA whose
key is lost or compromised, funds are lost or stolen.

**Recommendation:** before mainnet, point `treasury` at a Gnosis Safe with
multiple signers. `setTreasury` already exists for rotation.

### 🟡 M-1: No per-tx cap on `buy` quantity

**Location:** `IpeMarket.sol:190-206`

`buy(productId, qty, paymentToken)` accepts any `qty` up to `maxSupply`. A
griefer could buy out the entire inventory of a popular drop in a single
tx (if they have the tokens).

**Recommendation:** add an optional `maxPerTx` (and/or `maxPerWallet`) per
product. Or implement a Merkle allowlist for drops where this matters.

### 🟡 M-2: `redeem` callable by owner

**Location:** `IpeMarket.sol:232-238`

`redeem(holder, productId, qty)` lets `owner` burn anyone's tokens. The
intent is "owner can mark a receipt as redeemed when the buyer picks up the
physical item," but the design lets owner burn without buyer consent.

**Recommendation:**

- Document this as **intentional operator power** (most likely outcome),
  add an event log audit trail, and put a multisig behind it.
- Or require the holder's signature (EIP-712) for owner to burn.

### 🔵 L-1: No `withdraw` cap or pause

**Location:** `IpeMarket.sol:183-186`

`withdraw(token, to, amount)` lets the owner drain any ERC-20 the contract
holds. Routine after resale royalties accumulate, but a compromised key →
full drain.

**Recommendation:**

- Multisig (covered by H-2).
- Consider `Pausable` so the multisig can freeze the contract on incident.

### 🔵 L-2: `_setPrice` doesn't validate `price > 0`

**Location:** `IpeMarket.sol:171-175`

`price = 0` is overloaded to mean "disable this token for this product."
That's documented (`@notice` on `setPrice`) but a typo on `listProduct`
would silently produce an unbuyable product.

**Recommendation:** revert with `InvalidPrice` when listing a brand-new
product with all `tokenPrices[i] == 0`. Setting one to 0 later (to disable)
remains valid.

### 🔵 L-3: Resale royalty math is integer-truncated

**Location:** `IpeMarket.sol:283`

`royaltyInfo` uses integer division. For tiny prices (e.g. 1 wei resale at
5% royalty), royalty rounds to 0. Not a security issue but admin should
know.

**Recommendation:** no code change. Document in user-facing docs that small
resales below the royalty rounding threshold pay 0 royalty.

### 🟢 I-1: `onERC1155Received` always accepts batches

**Location:** `IpeMarket.sol:314-328`

Anyone can send arbitrary ERC-1155s to the contract; they're accepted but
not tracked. Not exploitable (we only `_safeTransferFrom` from `address(this)`
when fulfilling a resale), but it adds dust in storage.

**Recommendation:** optional `nonReentrant` on the hooks, or restrict to
`msg.sender == address(this)` to refuse external deposits. Cosmetic.

### 🟢 I-2: `nonReentrant` on every state-changing fn

**Location:** throughout

The contract is liberally guarded with `nonReentrant`, including on
`mintTo` and `withdraw` which don't make external calls to untrusted code.
Mild gas overhead but very safe — leave as is.

### 🟢 I-3: No "pause" mechanism

Adding `Pausable` would let the multisig freeze `buy`/`listForResale`/
`buyResale` if a vuln is discovered, without needing to upgrade the
contract.

**Recommendation:** add before mainnet.

## Things checked that are OK

- ✅ **Reentrancy** — `nonReentrant` on all external state-changing fns
  that touch ERC-20 / ERC-1155 transfers. Even the gateway-style `mintTo`
  has it. State updates happen before external calls in `buy` and
  `buyResale` (CEI pattern).
- ✅ **SafeERC20** — used consistently. No raw `transfer`/`transferFrom`
  that could silently fail on non-conforming tokens (USDT, etc).
- ✅ **Integer overflow** — Solidity 0.8.24 auto-checks. No `unchecked` blocks.
- ✅ **Royalty cap** — `royaltyBps` capped at `1_000` (10%) on
  `listProduct`. Prevents 100% royalty griefing.
- ✅ **Zero address checks** — `treasury_`, `setTreasury`, `mintTo.buyer`,
  `setAcceptedToken.token` all revert on zero address.
- ✅ **maxSupply** — enforced in both `buy` and `mintTo`. `0` means
  unlimited, which matches the off-chain inventory model.
- ✅ **`uri(productId)`** — returns the stored URI, doesn't follow the
  ERC-1155 default of templating `{id}`. Matches our metadata model
  (per-product URI, not per-token-instance).
- ✅ **`supportsInterface`** — covers both ERC1155 and ERC2981.
- ✅ **Tokens used** — `acceptedTokens` whitelist gates which ERC-20s
  buyers can pay with. Rogue tokens (fee-on-transfer, rebasing) can be
  added by mistake — the audit checklist should ensure $IPE and USDC are
  vanilla ERC-20s before whitelisting.

## Test coverage

Foundry tests (`contracts/test/IpeMarket.t.sol`) cover:

- `listProduct` + `buy` happy path + accounting (treasury receives funds,
  buyer receives 1155)
- `maxSupply` enforcement
- Multi-token pricing (same product priced in IPE and USDC)
- `mintTo` (fiat-paid mint)
- Resale list/cancel/buy + royalty math
- Royalty cap rejection
- Token whitelist rejection
- Active/inactive product gating

Missing test coverage to add before mainnet:

- ❌ Fuzz testing on price arithmetic (multi-decimal tokens, near
  `type(uint256).max`)
- ❌ Fee-on-transfer token behavior (USDT mainnet sometimes adds, sometimes
  doesn't — `safeTransferFrom` doesn't detect)
- ❌ Front-running scenarios on `setPrice` then `buy`
- ❌ Reorg behavior on `mintTo` (the gateway should be idempotent if
  retried)

## Pre-mainnet checklist

- [ ] Run Slither — fix any HIGH/MEDIUM findings
- [ ] Run Echidna with invariants (e.g. `treasury` balance ≥ sum of
      `Purchased.totalPaid`)
- [ ] Add `Pausable` and put it behind multisig
- [ ] Switch `owner` and `treasury` to Gnosis Safe (3-of-5 or similar)
- [ ] External audit (Code4rena, Spearbit, or ChainSecurity)
- [ ] Add fuzz tests + mainnet-like fork tests against the real $IPE and
      USDC contracts
- [ ] Decide on `mintTo` access model — keep owner-only, or move to
      oracle-signed proof of off-chain payment
- [ ] Document operator runbook for the multisig (who signs what, in what
      circumstances)
- [ ] Bug bounty program (Immunefi or similar)

## Out of scope

- **Mock tokens** (`MockIPE`, `MockUSDC`) — these are test-only and will
  not be deployed to mainnet. Real $IPE address will be substituted.
- **Frontend / backend security** — see [`../SECURITY.md`](../SECURITY.md)
  for the rest of the system's posture.
