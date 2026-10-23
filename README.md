# PT Lintas Batas Pembayaran — OTC Brokerage Platform

Private, browser-only demonstration of an institutional OTC brokerage and settlement operating interface for PT Lintas Batas Pembayaran (LBP).

> **Important:** This is not a production trading, custody, payments, KYC/AML, or settlement system. All figures, counterparties, wallet addresses, transaction hashes, roles, and reports are synthetic demonstration data. Do not use the interface or its output as financial, liquidity, compliance, or settlement evidence.

## What is included

- Public institutional landing page with a corporate access-request demonstration modal.
- Role-switchable portal for management, OTC desk, finance/treasury, compliance/AML, and corporate-client views.
- One synthetic master transaction ledger powering dashboard KPIs, fiat and crypto ledgers, AUM, reconciliation, reports, exports, and audit views.
- Five editable OTC desk configurations. Edits create browser-local demo audit entries only.
- Client-side CSV and XLSX export, printable report view, language toggle, and responsive layouts.
- Institutional light design system using CSS design tokens, Manrope for UI text, IBM Plex Mono for values, and Lucide icons.

## Technology

This version is deliberately buildless for simple private hosting:

- HTML, CSS, and browser JavaScript
- SheetJS loaded in the browser for XLSX exports
- Lucide loaded in the browser for icons
- `localStorage` for the language, role switcher, and browser-local desk edit history

There is no backend, real authentication, database, bank integration, blockchain connection, price feed, or server-side authorization.

## Repository layout

```text
.
├── .openai/hosting.json        # Private hosting configuration
├── dist/
│   ├── index.html              # Application entry point
│   ├── app-v2.css              # Token-based institutional design system
│   └── app-v2.js               # Demo data, state, UI, exports, and interactions
└── README.md
```

## Separate role modules

The public landing page is `dist/index.html`. Five role modules are independent HTML entry points and are designed for later DNS mapping to separate private subdomains:

- `dist/management.html` — Management / Super Admin
- `dist/otc-desk.html` — OTC Desk Trader
- `dist/treasury.html` — Finance / Treasury
- `dist/compliance.html` — Compliance / AML
- `dist/corporate-client.html` — Corporate Client

They share `dist/modules.css` and `dist/modules.js` only for a consistent visual system and synthetic demo data. They do not share session state or production access controls.

## Local use

Open `dist/index.html` in a modern browser, or serve the `dist/` directory from any static file server. The application has no installation step and no environment variables.

## Deployment and access

The active Site is intentionally owner-private. Keep it private until the separate production-readiness findings—real authentication, RBAC enforcement, immutable audit logging, data governance, secure server-side exports, and compliance controls—have been addressed.

## Planned GitHub / Lovable workflow

When the correct GitHub account is connected, make the GitHub repository the canonical source of truth:

1. Create or select a private GitHub repository owned by the correct account or organization.
2. Push this source to `main` as the initial baseline.
3. Connect the same repository in Lovable for visual and full-stack iteration.
4. Create feature branches and pull requests for all changes.
5. Merge reviewed changes to `main`, then deploy the exact merged commit.

Until that migration is complete, the current private hosting repository remains the deployment source.

## Production boundary

Before handling real funds or public users, replace all demo-only functionality with independently reviewed production services for identity, authorization, secure persistence, KYC/KYB/AML/KYT, sanctions screening, bank confirmation, wallet screening, reconciliation, audit retention, monitoring, incident response, and legal/regulatory controls.
