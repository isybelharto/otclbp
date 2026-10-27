# Supabase Auth Email Templates

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
- The logo is loaded from `https://ptlbp.co.id/landing-page/asset/logo.png`; keep this public asset available over HTTPS.
