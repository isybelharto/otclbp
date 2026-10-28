# Corporate Client module

Local module: `dist/corporate-client/`. Entry point: `register.html`; the registered company email is the User ID. Registration, six-digit email verification, login and recovery use the same Supabase project as Partner Desk. Shared email templates now use the neutral LBP Institutional Access name.

## Current delivery status

The onboarding database was applied to the LBP Supabase project on 28 October 2026 using `supabase/corporate-client-onboarding.sql`. Four tables, private file storage, registration bootstrap and access policies are active. Transaction execution and Management review UI remain separate outstanding work. Browser interaction and visual QA are also pending because local browser control is disabled. The overall module is not yet ready for live transaction use.

Database checks passed: registration bootstrap, client isolation, owner editing, denial of client self-approval, rejection of incomplete submissions, and Management reviewer access. Disposable fixtures were rolled back; no test accounts or company records were retained. All four tables have RLS enabled and anonymous access denied. The `corporate-kyb` bucket is private and limited to PDF/JPEG/PNG, 10 MB each.

`supabase/drafts/corporate_client_full_module.sql` is an unapplied full-module draft, kept outside the runnable migrations directory. Do not run it over the active onboarding schema; its transaction portion must become a separate incremental migration.

The Supabase security advisor found no new warnings for the onboarding objects. Existing project warnings remain for [Partner Desk's public SECURITY DEFINER helper](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). These were not changed during onboarding setup.

## Tabs

Dashboard; New OTC Request; Request History; Company Profile; Directors; Beneficial Owners; Source & Purpose; Financial & Bank; Documents & Declaration.

The registration form is based on the supplied 2026 institutional registration form. KYB uploads cover Director ID, Beneficial Owner ID, establishment deed/decree, optional amendment deed/decree, NIB, NPWP, SPPKP, Statement Letter and NDA. Private file storage is active in `corporate-kyb` (PDF/JPEG/PNG, 10 MB per file).

## Pricing and capacity

- IDR → USDT: input IDR / Partner Desk sell price; deduct the quoted fee from the USDT result.
- USD → USDT: input USD / (Partner Desk sell price / USD-IDR reference); deduct the quoted fee.
- USDT → IDR: input USDT × Partner Desk buy price; deduct the quoted fee from the IDR result.
- The SQL submission function serialises requests per partner. USD and IDR purchases share one USDT output pool. Requests expire after 30 minutes unless approved/processing; settled output continues to reduce the pool until a later partner quote reports its updated balance.
- Client inputs are indicative. The server recalculates from the current quote and checks KYB, quote freshness and remaining output liquidity.

## Required completion before rollout

1. Onboarding schema and SQL role checks are complete. Verify the public registration/email flow and deploy the separate OTC request schema after its capacity checks are finalised.
2. Add `https://management.ptlbp.co.id/corporate-client/**` to Supabase Auth allowed redirect URLs. Confirm six-digit OTP and custom SMTP delivery.
3. Paste the updated shared email templates into Supabase Auth (local template edits do not update hosted Auth settings).
4. Complete Management KYB approval/request review integration, remaining form-field parity and live remaining-capacity display, and end-to-end concurrent reservation tests.
5. Verify all tab saves, upload ownership, recovery expiry, mobile layout, quote/fee calculations and rejection paths before GitHub/VPS rollout.

## VPS rollout

The static module is committed to GitHub with the onboarding schema. Direct VPS access from this workstation requires SSH authentication; the attempted connection to `ubuntu@43.134.65.107` was rejected with `Permission denied (publickey,password)`.

Run in the authenticated VPS terminal:

```bash
cd /opt/lbp-otc
git pull --ff-only github main
```

If the VPS remote is named `origin`, use `git pull --ff-only origin main` instead. In the existing `management.ptlbp.co.id` Caddy block, add this handler alongside the Partner Desk handler, before the Management fallback:

```caddyfile
handle /corporate-client/* {
    root * /opt/lbp-otc/dist
    file_server
}
```

Then validate and reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -I https://management.ptlbp.co.id/corporate-client/register.html
```

Registration URL: `https://management.ptlbp.co.id/corporate-client/register.html`. The portal preserves access to onboarding when OTC execution tables are not yet installed. OTC request submission stays disabled until activated.
