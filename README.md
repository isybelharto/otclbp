# PT Lintas Batas Pembayaran — OTC Brokerage Platform

Institutional OTC brokerage and settlement interface for PT Lintas Batas Pembayaran (LBP). The public site remains static; the Management console can use Supabase Authentication and database reads when its browser configuration is present.

> **Important:** This is not a production trading, custody, payments, KYC/AML, or settlement system. All figures, counterparties, wallet addresses, transaction hashes, roles, and reports are synthetic demonstration data. Do not use the interface or its output as financial, liquidity, compliance, or settlement evidence.

## What is included

- Public institutional landing page grouped in `dist/landing-page/`.
- Management / Super Admin console for dashboard, master ledger, Fiat Ledger, Crypto Ledger, desks, clients, AUM, reconciliation, compliance, exports, audit, and settings.
- A Management data adapter that reads the transaction ledger and operational modules from Supabase while preserving the established HTML design.
- Clickable TX IDs that open a transaction-detail modal with settlement, compliance, bank, wallet, token/network, and operator data.
- Unified transaction treatment: IN is green, OUT is red, and settlement, KYC, and AML states are separate status badges.
- Collapsible Management sidebar with icon-only mode, browser-local preference storage, and Flaticon UIcons attribution.
- USD/IDR public reference-rate indicator with an indicative fallback. It is not an executable OTC quote.
- A separate authenticated Partner Desk module at `dist/partner-desk/` for partner quote submissions, available liquidity, settlement-account and wallet registers, and fiat/crypto settlement history.
- A company-email Partner Desk registration and recovery flow with Management approval before desk access is activated.

## Technology

The public site and Management console are deliberately buildless for simple static hosting:

- HTML, CSS, and browser JavaScript
- Browser JavaScript, Supabase JS client, and seeded data during the migration phase
- Flaticon UIcons loaded through the CDN for Management navigation
- `localStorage` for Management sidebar display preference

The static Management console supports Supabase email/password authentication and management-role checks. It does not provide bank integration, blockchain execution, an executable price feed, or server-side trading/settlement controls.

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
│   │   └── js/                 # Auth and Supabase data adapters
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

The Management module is self-contained in `dist/management/`, with all of its stylesheet, JavaScript, and image resources held under `css/`, `js/`, and `assets/`. The legacy `dist/management.html` path remains as a redirect. Management authenticates users through Supabase when `supabase-config.js` is configured; other role modules remain static prototypes until their access controls are implemented.

## Supabase-backed Management data

`dist/management/js/supabase-auth.js` limits access to active `management` profiles. `dist/management/js/supabase-data.js` reads the following tables and maps them into the existing Management UI without changing its visual design:

- `transactions` → Dashboard, Transaction Ledger, Reports
- `fiat_legs` → Fiat Ledger
- `crypto_legs` → Crypto Ledger
- `clients` → B2B / Corporate Clients and KYC register
- `partner_quotes` → OTC Partner Desk
- `partner_desks` and `partner_desk_quotes` → authenticated Partner Desk module and Management OTC Partner Desk overview
- `partner_access_requests` → Management approval queue for Partner Desk registrations
- `bank_accounts`, `crypto_wallets`, `asset_rates` → AUM / Managed Assets
- `reconciliation_entries` → Reconciliation
- `aml_alerts` → KYC / AML monitoring
- `audit_events` → Audit Trail

This is currently a read integration. Price edits, reconciliation actions, export actions, and settlement actions must not be treated as production writes or execution instructions until governed server-side workflows are implemented.

## Partner Desk database setup

The Partner Desk is a separate module, but uses the same Supabase project and authorised user profiles as Management. Its database migrations create the partner desk tables, initialise the ten partner desks, add `profiles.partner_id`, and apply Row Level Security so an exchange partner can only see its own desk while Management can oversee every desk.

New partners register at `/partner-desk/register.html` using a company email and confirm the address with a six-digit email PIN. The account remains inactive until a Management user opens **OTC Partner Desk → Access Requests**, assigns the correct exchange desk, and approves it. Partner overview and access governance share one dashboard rather than separate sidebar modules. Approval activates the partner profile; rejection keeps the profile disabled and records the decision in the audit trail. Password recovery starts at `/partner-desk/forgot-password.html` and completes at `/partner-desk/reset-password.html`.

### Six-digit email verification PIN

Supabase sends a six-digit OTP when the **Confirm signup** email template uses the token variable instead of the confirmation-link variable:

1. Open **Supabase Dashboard → Authentication → Email Templates → Confirm signup**.
2. Set the subject to `Your LBP Partner Desk verification PIN`.
3. Use `{{ .Token }}` in the email body to display the PIN. Do not use `{{ .ConfirmationURL }}` in this template, because that produces a verification link instead.
4. Under **Authentication → Sign In / Providers → Email**, set **Email OTP Length** to `6`. The application deliberately accepts exactly six digits, so this project setting must not remain at `8`.
5. Set **Email OTP Expiration** to the desired validity period; `600` seconds is recommended.
6. Save the settings and test with a new company-email registration. Existing unverified registrations can request another PIN from the registration screen.

Minimal template body:

```html
<h2>Verify your LBP Partner Desk email</h2>
<p>Enter this six-digit PIN on the registration screen:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px">{{ .Token }}</p>
<p>This PIN expires shortly. Do not share it with anyone.</p>
```

The registration screen verifies the PIN with Supabase Auth and then signs the temporary session out. Email verification does not grant Partner Desk access; Management approval remains mandatory.

Supabase Authentication must allow these production redirect URLs:

- `https://management.ptlbp.co.id/partner-desk/login.html`
- `https://management.ptlbp.co.id/partner-desk/reset-password.html`

Set the Supabase Authentication **Site URL** to `https://management.ptlbp.co.id/`. The Partner Desk client deliberately uses production redirect URLs even when its registration form is previewed locally, preventing confirmation emails from falling back to a local development address.

## Local use

Open `dist/index.html` in a modern browser, or serve the `dist/` directory from any static file server. For local static preview:

```bash
python -m http.server 4173 --directory dist
```

Then use `http://localhost:4173/` for the landing page or `http://localhost:4173/management/` for the Management console. For authenticated Management access, serve the configured `dist/management/` files over HTTPS and configure Supabase Authentication with the corresponding site URL and redirect URL.

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
