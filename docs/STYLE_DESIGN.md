# LBP OTC — Style Design System

## Purpose

This document defines the visual and interaction system for the PT Lintas Batas Pembayaran (LBP) OTC Brokerage platform. The product is designed as a high-trust institutional financial interface: light, precise, information-dense, and operationally clear.

## Brand palette

| Token | Value | Use |
| --- | --- | --- |
| Financial blue | `#1E40AF` | Primary actions, links, selected controls, reconciled status |
| Deep navy | `#0F1E36` | Management sidebar and controlled-operating context |
| Emerald | `#059669` / `#10B981` | Positive flow, verified/clear status, active indicators |
| Slate ink | `#0F172A` | Primary text and figures |
| Slate muted | `#64748B` | Supporting labels and metadata |
| Slate border | `#E2E8F0` | Table rules, card borders, controls |
| Alert amber | `#B45309` | Pending and review states |
| Alert red | `#B91C1C` / `#DC2626` | OUT flow, exceptions, holds, and destructive states |

The application surface uses near-white and white (`#F8FAFC` / `#FFFFFF`) with subtle shadows only. Do not use gradients, high-gloss effects, or visual decoration that competes with settlement data.

## Logo usage

- The approved LBP mark is the blue open-corner and diagonal-arrow symbol, using brand blue `#2F4EC8` on white. Its geometry must remain unchanged.
- Use `dist/landing-page/asset/mark.svg` as the canonical standalone mark and the approved dark/light lockups in the same asset folder for public-site headers and footers.
- Management and Partner Desk use the compact mark asset at `dist/management/assets/lbp-crypto-fiat-logo.png` beside the product name.
- Do not replace the approved mark with typed `LBP`, a currency symbol, emoji, landmark icon, or another graphic.
- Preserve the logo aspect ratio with `object-fit: contain`; never stretch, crop, recolor, rotate, or add effects.
- The full logo uses a minimum displayed width of 92px on compact screens and 112px on desktop surfaces.
- Use the white inverse lockup on deep navy surfaces. When the blue mark is used on a dark interface, place it on the approved white rounded-square carrier.
- Place the logo with adequate clear space. Supporting module text may appear beside it but must not overlap the mark.

## Typography and numbers

- **Manrope** is the primary interface typeface for headings, labels, controls, navigation, and narrative text across the public site, Management, Partner Desk, and role-based modules. Use weights 400, 500, 600, 700, and 800.
- **IBM Plex Mono** is reserved for financial values, transaction IDs, wallet addresses, bank references, blockchain hashes, and other machine-readable identifiers. Use weights 400, 500, and 600 together with `font-variant-numeric: tabular-nums`.
- Localized pages retain system-script fallbacks for Chinese, Japanese, Korean, and Devanagari glyph coverage when Manrope does not contain the required character.
- Financial tables use tabular figures and compact spacing to support comparison.
- Labels use uppercase, small-size, tracked lettering. Values remain larger, darker, and visually dominant.

## Layout

### Public site

The public landing page uses a calm white surface, blue institutional footer, compact service cards, and a formal corporate CTA. It is organized independently in `dist/landing-page/`.

### Management module

The Management / Super Admin module is self-contained in `dist/management/`:

```text
management/
├── index.html
├── assets/
├── css/
└── js/
```

The left navigation uses deep navy. Its default width is 256px; users can collapse it to an icon-only 72px rail. The selected item has a restrained white overlay and emerald edge marker. The collapse preference is retained only in the local browser.

### Partner Desk and access pages

- Partner Desk uses the same Manrope and IBM Plex Mono typography, blue/emerald/slate palette, approved LBP logo, borders, radii, and status colors as Management.
- Login, registration, forgot-password, and reset-password pages use a near-white page surface and one white bordered card. Avoid decorative gradients and heavy shadows.
- Form controls use 44px minimum height, visible labels, slate borders, 7px radius, and a blue focus ring.
- The primary submit action is financial blue. Links and secondary actions remain blue text or white bordered controls.
- Registration may use two columns on desktop but must become one column on narrow screens. Password requirements remain visible and turn emerald only when satisfied.
- Account and approval messages use the established status mapping: pending/review is amber, approved/active is emerald, and rejected/error is red.
- Authentication pages must not expose whether an unverified email exists. Recovery confirmation uses neutral wording.

## Navigation icons

Management navigation uses Flaticon UIcons (regular rounded style) through the Flaticon CDN. Each item includes an accessible name and a native tooltip in collapsed mode. The side navigation displays an `Icons by Flaticon` attribution link.

## Data presentation

### KPI cards

KPI cards use white panels, fine slate borders, and tabular numeric values:

- Total volume: financial blue
- Fiat / Crypto IN: emerald
- Fiat / Crypto OUT: red
- Transaction count: slate ink

### Transaction tables

All Transaction Ledger, Fiat Ledger, and Crypto Ledger rows follow the same conventions:

- **IN** amounts and directions are emerald.
- **OUT** amounts and directions are red.
- TX IDs are blue interactive links that open the transaction detail modal.
- BUY is a green badge; SELL is a blue badge.
- Settlement, KYC, and AML are displayed as separate bordered badges.

### Status badge mapping

| Status | Treatment |
| --- | --- |
| Settled, Verified, Clear, Active | Emerald text and pale emerald surface |
| Reconciled, Sell | Financial blue text and pale blue surface |
| Processing | Sky-blue text and pale blue surface |
| Pending, Review | Amber text and pale amber surface |
| Exception, Hold | Red text and pale red surface |

## Transaction detail modal

Selecting a TX ID opens an accessible overlay with sticky header and footer. The modal contains:

- Fiat and crypto settlement legs
- Client code, counterparty, desk, liquidity provider, and operator
- Rate, spread, fee, and revenue
- Bank and bank reference
- Network, token contract, full wallet address, blockchain TXID and explorer link
- Confirmations, finality, wallet screening, KYC, and AML
- Close and local voucher-download controls

The modal must preserve compact line-by-line settlement evidence and must not expose operational treasury wallet information.

## USD / IDR header indicator

The Management header includes a `1 USD = Rp …` reference-rate component. It refreshes from a public reference feed every 60 seconds and falls back to an indicative value when unavailable. It is explicitly an indicative reference and never an executable OTC quote.

## Accessibility and responsiveness

- Every interactive control has visible focus behavior, a readable label, and a usable target size.
- Collapsed navigation keeps accessible labels and hover titles for each icon.
- Wide ledgers remain horizontally scrollable rather than compressing financial values.
- Management becomes a compact top navigation on small screens; the primary data tables retain their column integrity.

### Mobile navigation and tabs

- At widths of 760px and below, a horizontal tab bar must never remain a horizontally scrolling control.
- Every module with tab navigation uses an off-canvas sidebar instead. Management uses its primary navigation drawer; Partner Desk and Corporate Client use a module-navigation drawer.
- The drawer toggle is a three-line menu button aligned to the upper-right of the mobile header. It opens and closes the drawer; its accessible label and `aria-expanded` state must update accordingly.
- Opening a drawer shows a dimmed backdrop, prevents background scrolling, and allows dismissal by selecting a destination, tapping the backdrop, or pressing Escape.
- Drawer items are full-width, have a minimum 40px target height, retain the active-state treatment, and never require horizontal scrolling to reveal a destination.

## Production boundaries

### Corporate Client module

The separate `dist/corporate-client/` module uses the same approved LBP logo, Manrope interface text, IBM Plex Mono financial values, blue/emerald palette, white cards and slate borders as Partner Desk. Desktop uses left navigation with onboarding and transaction tabs; on mobile this navigation is an off-canvas drawer opened from the three-line control at the upper-right. Authentication and recovery screens share one institutional brand treatment. KYB uploads are grouped into nine document cards with required markers.

This implementation is a front-end operating prototype. Production use requires authenticated identity, enforced role permissions, governed market data, real compliance controls, immutable audit evidence, and approved banking/custody integrations.
