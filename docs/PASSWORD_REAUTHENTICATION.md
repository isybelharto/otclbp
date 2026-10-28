# Password reauthentication

The local Management, Partner Desk and Corporate Client portals now link to `change-password.html`. Partner and Corporate recovery pages also request a reauthentication PIN before setting a new password.

Flow: verified signed-in email → `auth.reauthenticate()` → user supplies six-digit PIN and matching passwords → `auth.updateUser({password, nonce})` → global sign-out → sign in again. Passwords and PINs are never stored in browser storage or application tables. Supabase Auth stores and validates credentials. No user password was changed during implementation or tests.

## Hosted Auth configuration: pending activation

The connected Supabase tools support database operations but do not expose Auth configuration updates. This session has no Supabase Management API access token, so the hosted reauthentication setting and email template have **not** been changed or verified.

In the LBP dashboard, open Authentication → Sign In / Providers → Email and enable **Secure password change / Require reauthentication when changing password**. Keep the email OTP length at six digits. Open Authentication → Email Templates → Reauthentication and paste `supabase/email-templates/reauthentication.html`. The template must retain `{{ .Token }}`.

Alternatively run this from PowerShell in the repository:

```powershell
& ./tools/enable-password-reauthentication.ps1
```

The script prompts privately for a Supabase personal access token if `SUPABASE_ACCESS_TOKEN` is not set. It updates only the LBP project's reauthentication flag, PIN length, and reauthentication email subject/body, then reads the settings back to verify them. The token is never saved or printed. Do not paste a token in chat or add it to Git.

Supabase's native secure-password-change setting exempts sessions created within the last 24 hours. The LBP forms require the PIN every time, but the standard setting alone does not guarantee that direct API calls from recently authenticated sessions will require a PIN. See [Supabase password security](https://supabase.com/docs/guides/auth/password-security) and [Auth configuration API](https://supabase.com/docs/reference/api/v1-update-auth-service-config).

## Verification

`node tools/tests/password-security.cjs` passed: no update before a PIN challenge, six-digit validation, password rules, nonce forwarding, challenge consumption, account-switch rejection, server error handling and session sign-out. JavaScript syntax checks passed for all three modules. Hosted email delivery and a real password change remain to be tested after activation using an authorised test account. Browser interaction checks remain unavailable because local browser control is disabled.

This change has not been pushed to GitHub or deployed to the VPS.
