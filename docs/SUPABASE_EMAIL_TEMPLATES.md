# Supabase Auth Email Templates

All templates use the same LBP institutional design, public company logo, inline email-safe CSS, and Supabase-supported Go template variables.

## Confirm Sign Up

- Dashboard location: **Authentication → Email Templates → Confirm sign up**
- Recommended subject: **Verifikasi Email Anda | LBP Partner Desk**
- Template source: `supabase/email-templates/confirm-sign-up.html`
- Verification method: six-digit `{{ .Token }}` PIN, matching the Partner Desk registration screen.

## Invite User

- Dashboard location: **Authentication → Email Templates → Invite user**
- Recommended subject: **Undangan Akses | LBP Partner Desk**
- Template source: `supabase/email-templates/invite-user.html`
- Required CTA: `<a href="{{ .ConfirmationURL }}">Terima Undangan</a>`

## Magic Link or OTP

- Dashboard location: **Authentication → Email Templates → Magic Link**
- Recommended subject: **Kode Akses Aman | LBP Partner Desk**
- Template source: `supabase/email-templates/magic-link-otp.html`
- Includes both the six-digit `{{ .Token }}` PIN and the Supabase `{{ .ConfirmationURL }}` magic link.

## Change Email Address

- Dashboard location: **Authentication → Email Templates → Change Email Address**
- Recommended subject: **Konfirmasi Perubahan Email | LBP Partner Desk**
- Template source: `supabase/email-templates/change-email-address.html`
- Uses `{{ .NewEmail }}` and `{{ .ConfirmationURL }}`.

## Reauthentication

- Dashboard location: **Authentication → Email Templates → Reauthentication**
- Recommended subject: **{{ .Token }} adalah PIN Verifikasi LBP Anda**
- Template source: `supabase/email-templates/reauthentication.html`
- Uses the six-digit `{{ .Token }}` PIN required for sensitive operations.

## Reset Password

- Dashboard location: **Authentication → Email Templates → Reset Password**
- Recommended subject: **Reset Password Anda | LBP Partner Desk**
- Template source: `supabase/email-templates/reset-password.html`
- Required CTA: `<a href="{{ .ConfirmationURL }}">Reset Password</a>`

The template deliberately uses `{{ .ConfirmationURL }}` so Supabase can validate the recovery token and then redirect the browser to the production recovery page requested by `resetPasswordForEmail()`.

## Password Changed Notification

- Dashboard location: **Authentication → Email Templates → Password changed notification**
- Recommended subject: **Konfirmasi Perubahan Password | LBP Partner Desk**
- Template source: `supabase/email-templates/password-changed.html`

Enable the password-changed security notification after installing the template.

## Required URL Configuration

- Site URL: `https://management.ptlbp.co.id/`
- Additional redirect URL: `https://management.ptlbp.co.id/partner-desk/**`

## Delivery Notes

- Custom authentication templates on current Supabase Free projects require a custom SMTP provider.
- Use `noreply@ptlbp.co.id` as the sender only after SPF, DKIM, and DMARC are correctly configured.
- Disable click tracking in the SMTP provider because link rewriting can break Supabase authentication links.
- The approved blue LBP logo is loaded from `https://ptlbp.co.id/landing-page/asset/logo.png`; keep this public asset available over HTTPS and replace it only with an approved brand export.
