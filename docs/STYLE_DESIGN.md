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

## Typography and numbers

- **Manrope** is the UI typeface for labels, controls, headings, and narrative text.
- **IBM Plex Mono** is used for amounts, exchange rates, transaction IDs, wallet addresses, bank references, and blockchain hashes.
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

## Navigation icons

Management navigation uses Flaticon UIcons (regular rounded style) through the Flaticon CDN. Each item includes an accessible name and a native tooltip in collapsed mode. The side navigation displays an `Icons by Flaticon` attribution link.

## Data presentation

### KPI cards

KPI cards use white panels, fine slate borders, and mono values:

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

## Production boundaries

This implementation is a front-end operating prototype. Production use requires authenticated identity, enforced role permissions, governed market data, real compliance controls, immutable audit evidence, and approved banking/custody integrations.
