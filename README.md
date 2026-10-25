# PT Lintas Batas Pembayaran — OTC Brokerage Platform

Static front-end prototype of an institutional OTC brokerage and settlement operating interface for PT Lintas Batas Pembayaran (LBP).

> **Important:** This is not a production trading, custody, payments, KYC/AML, or settlement system. All figures, counterparties, wallet addresses, transaction hashes, roles, and reports are synthetic demonstration data. Do not use the interface or its output as financial, liquidity, compliance, or settlement evidence.

## What is included

- Public institutional landing page grouped in `dist/landing-page/`.
- Management / Super Admin console for dashboard, master ledger, Fiat Ledger, Crypto Ledger, desks, clients, AUM, reconciliation, compliance, exports, audit, and settings.
- One synthetic master transaction ledger powering the Management dashboard and ledger views.
- Clickable TX IDs that open a transaction-detail modal with settlement, compliance, bank, wallet, token/network, and operator data.
- Unified transaction treatment: IN is green, OUT is red, and settlement, KYC, and AML states are separate status badges.
- Collapsible Management sidebar with icon-only mode, browser-local preference storage, and Flaticon UIcons attribution.
- USD/IDR public reference-rate indicator with an indicative fallback. It is not an executable OTC quote.

## Technology

This version is deliberately buildless for simple static hosting:

- HTML, CSS, and browser JavaScript
- Browser JavaScript and local synthetic data
- Flaticon UIcons loaded through the CDN for Management navigation
- `localStorage` for Management sidebar display preference

There is no backend, real authentication, database, bank integration, blockchain connection, executable price feed, or server-side authorization.

## Repository layout

```text
.
├── .openai/hosting.json        # Existing Site configuration
├── docs/
│   ├── STYLE_DESIGN.md         # Design system and interaction guidance
│   └── UPDATE_TERAKHIR.md      # Latest implementation notes
├── dist/
│   ├── index.html              # Compatibility entry point to landing-page/
│   ├── landing-page/           # Public landing site and language variants
│   ├── management/             # Self-contained Management module
│   │   ├── index.html
│   │   ├── assets/
│   │   ├── css/
│   │   └── js/
│   ├── management.html         # Compatibility redirect to management/
│   ├── otc-desk.html           # OTC Desk Trader module
│   ├── treasury.html           # Finance / Treasury module
│   ├── compliance.html         # Compliance / AML module
│   └── corporate-client.html   # Corporate Client module
└── README.md
```

## Separate role modules

The public landing page is available through `dist/index.html` and is implemented in `dist/landing-page/`. The role modules are independent HTML entry points and are prepared for later DNS mapping to separate private subdomains:

- `dist/management/index.html` — Management / Super Admin
- `dist/otc-desk.html` — OTC Desk Trader
- `dist/treasury.html` — Finance / Treasury
- `dist/compliance.html` — Compliance / AML
- `dist/corporate-client.html` — Corporate Client

The Management module is self-contained in `dist/management/`, with all of its stylesheet, JavaScript, and image resources held under `css/`, `js/`, and `assets/`. The legacy `dist/management.html` path remains as a redirect. The modules do not share session state or production access controls.

## Local use

Open `dist/index.html` in a modern browser, or serve the `dist/` directory from any static file server. The application has no installation step and no environment variables. For example:

```bash
python -m http.server 4173 --directory dist
```

Then use `http://localhost:4173/` for the landing page or `http://localhost:4173/management/` for the Management console.

## Design and update notes

See [docs/STYLE_DESIGN.md](docs/STYLE_DESIGN.md) for the current design system and [docs/UPDATE_TERAKHIR.md](docs/UPDATE_TERAKHIR.md) for the implementation update. The Management navigation uses [Flaticon UIcons](https://www.flaticon.com/uicons/get-started); the UI retains an attribution link.

## Planned GitHub / Lovable workflow

GitHub is the canonical source of truth for the current static prototype:

1. Create a feature branch when practical.
2. Review static links, JavaScript syntax, and primary browser interactions.
3. Commit the implementation and documentation together.
4. Push the reviewed commit to `main`.
5. Deploy only the approved commit through the chosen hosting workflow.

An internet connection is required only for external resources such as Google Fonts, Flaticon UIcons, and the optional USD/IDR reference feed. The Management view continues to display local fallback data when the rate feed is unavailable.

## Production boundary

Before handling real funds or public users, replace all demo-only functionality with independently reviewed production services for identity, authorization, secure persistence, KYC/KYB/AML/KYT, sanctions screening, bank confirmation, wallet screening, reconciliation, audit retention, monitoring, incident response, and legal/regulatory controls.
