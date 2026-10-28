param([string]$ProjectRef = 'biwwfxfpcsanszxrxhyw')
$ErrorActionPreference = 'Stop'
if ($ProjectRef -ne 'biwwfxfpcsanszxrxhyw') { throw 'This setup script is scoped to the LBP project.' }
$templatePath = Join-Path $PSScriptRoot '../supabase/email-templates/reauthentication.html'
if (-not (Test-Path -LiteralPath $templatePath)) { throw 'Reauthentication email template was not found.' }
$authToken = $env:SUPABASE_ACCESS_TOKEN
if (-not $authToken) {
    $secureToken = Read-Host 'Supabase personal access token (hidden; never saved)' -AsSecureString
    $authToken = (New-Object System.Net.NetworkCredential('', $secureToken)).Password
}
if (-not $authToken) { throw 'A Supabase Management API access token is required.' }
try {
    $headers = @{ Authorization = 'Bearer ' + $authToken }
    $uri = 'https://api.supabase.com/v1/projects/' + $ProjectRef + '/config/auth'
    $payload = @{
        security_update_password_require_reauthentication = $true
        mailer_otp_length = 6
        mailer_subjects_reauthentication = 'Konfirmasi Perubahan Password | PT Lintas Batas Pembayaran'
        mailer_templates_reauthentication_content = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $templatePath))
    } | ConvertTo-Json -Depth 3
    $null = Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($payload))
    $config = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
    if (-not $config.security_update_password_require_reauthentication) { throw 'Supabase did not confirm secure password change.' }
    if ($config.mailer_otp_length -ne 6) { throw 'Supabase did not confirm six-digit PINs.' }
    if ($config.mailer_templates_reauthentication_content -ne ([IO.File]::ReadAllText((Resolve-Path -LiteralPath $templatePath)))) { throw 'Supabase did not confirm the reauthentication template.' }
    Write-Output 'Verified: LBP secure password change enabled; 6-digit PIN; branded reauthentication email installed.'
} catch {
    throw 'Supabase Auth configuration could not be verified. Check Management API access and project permissions.'
} finally {
    $authToken = $null; $secureToken = $null; $headers = $null; $payload = $null; $config = $null
}
