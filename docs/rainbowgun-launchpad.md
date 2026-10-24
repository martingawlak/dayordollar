# RainbowGun launchpad (design handoff)

Summary of the design from the "Base ecosystem ideas" session. The master copy is
`Base-Business-Launchpad-Design.md` on Martin's desktop; replace this file with it
when it's added to the repo.

## What it is

- A **business** launchpad on Base, not a memecoin launchpad: "Launch your own $Coin
  in 60 seconds and trade it for anything on Base." Every coin launches with a
  working machine that earns from the start.
- **$GAWLAK** (the existing, tested project) is the bank that owns the launchpad.
  Same site and dashboard; no separate launchpad token.
- Each launched coin gets its own instance of the audited contracts and keeper:
  separate money and keys, non-custodial throughout. "Family" is a brand, not a
  shared wallet.

## Launch flow

Connect wallet → name coin → fund (any coin zapped to USDC) → its Aerodrome pool is
created automatically, **paired with USDC only** (not WETH or GAWLAK, to isolate
risk). About $200 recommended to start, split between pool and reserve. The reserve
trades deep pairs (ETH/BTC/AERO) like GAWLAK's bot. One multi-tenant keeper serves
every vault through a registry.

## Graduation and caps

- Vault power is capped to a share of live, time-weighted pool depth (on-chain).
  Adding liquidity raises the cap, which deepens pools.
- Every coin starts with a small machine; graduating makes it bigger.
- Graduating is paid by **buying GAWLAK** (never by selling the launch coin).
- RainbowGun co-stakes first liquidity into graduated coins' pools from the
  pot/treasury only, never from GAWLAK's reserve, sized conservatively.
- Holders hold a backed GAWLAK seat, not equity.

## Money model

- No fee on creators. 1% of a machine's profit buys the core family, buy-only:
  0.5% GAWLAK, 0.5% split across $dayordollar, $bandturo, $bci, $babyzoragawlak,
  $martingawlak.
- Each machine also buys the graduated-launchpad index (one basket, one buy).
- Cross-support: ~80% to the coin's own holders, ~20% to a pot (GAWLAK reserve or a
  treasury Safe, never a personal wallet).
- Owner income: paid upgrades, GAWLAK's arbitrage across new pools, the pot.
  GAWLAK's reserve never funds launched coins.

## Buying (the flagship experience)

Shareable per-coin page → pay by card (Coinbase Onramp) → instant embedded wallet
(Privy, email/social login) → gas sponsored on Base → swap in the page. About 30
seconds for a first-time buyer; only first-time KYC (handled by Coinbase) remains.
Pre-audited contract, auto-locked liquidity, free to launch.

## Per-coin pages

- One live template at `/<coin-name>` reading on-chain and market data by address
  (DexScreener API, Aerodrome subgraph, RPC; Basescan only for verification links).
- Stored per coin: only the owner's custom headline and logo (small backend or IPFS).
- Hosted on RainbowGun's **own domain**, not martingawlakcompany.com.
- Owner editing: if the connected (Privy) wallet is the coin's on-chain owner, the page
  is editable inline. The headline draft autosaves locally and publishes on a wallet
  signature; the logo can be added after launch (identicon until then). Moderation
  filter and revoke.
- Shared sound layer on every page (the "Our War" album plus interaction sounds):
  never autoplay with sound, start on interaction, remembered mute toggle, small
  lazy-loaded files, respect reduced motion.

## Wallets and custody

Privy (login + embedded wallet) and Coinbase Onramp, both already in use. No Safe at
launch; coins sit in the user's connected wallet. At graduation, harden with a smart
account (Coinbase Smart Wallet passkey / EIP-7702). GAWLAK holds no keys on launched
coins.

## Modules

Standard: the machine. Paid add-ons: visibility boost, custom branding, anti-snipe,
bigger-vault graduation. Later: escrow, payment rails, revenue split.

## Open questions

Where the pot lives (reserve vs treasury Safe); exact numbers (1%, 80/20, graduation
threshold, co-stake size); index mechanics; paid tiers; Aerodrome gauge thresholds;
the product name (RainbowGun also names a GAWLAK component).

## How it fits this platform

- Its own app and domain in `apps/`, sharing `@mgc/brands` and the accounts service.
- The accounts service already supports Privy sign-in; wallet addresses from Privy are
  stored on the linked account, which the owner-editing check can use.
- Keep each business's codebase separate; the coins supporting each other is by design.
