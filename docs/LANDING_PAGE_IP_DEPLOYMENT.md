# Landing Page via VPS IP

The complete public landing page is served from:

```text
/opt/lbp-otc/dist/landing-page
```

This includes the Indonesian home page, translated pages, CSS, JavaScript,
images, legal pages, sitemap and other public assets. Do not copy individual
files into the Management application folder.

## Caddy configuration

The public domain serves the landing page plus the Partner Desk and Corporate
Client paths. Management remains isolated at `adm.ptlbp.co.id`.

Replace the relevant site blocks in `/etc/caddy/Caddyfile` with:

```caddyfile
ptlbp.co.id {
    encode zstd gzip

    @publicApps path /partner-desk /partner-desk/* /corporate-client /corporate-client/* /shared/*
    handle @publicApps {
        root * /opt/lbp-otc/dist
        file_server
    }

    handle {
        root * /opt/lbp-otc/dist/landing-page
        file_server
    }
}

adm.ptlbp.co.id {
    encode zstd gzip
    root * /opt/lbp-otc/dist/management
    file_server
}
```

The IP preview remains a separate HTTP-only block:

```caddyfile
http://43.134.65.107 {
    encode zstd gzip

    root * /opt/lbp-otc/dist/landing-page
    file_server
}
```

Then validate and reload Caddy:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

The public landing page will then be available at:

```text
http://43.134.65.107/
```

## Important

- An IP address does not receive a standard public TLS certificate, so this
  endpoint intentionally uses `http://`.
- `https://ptlbp.co.id/partner-desk/` serves Partner Desk.
- `https://ptlbp.co.id/corporate-client/` serves Corporate Client.
- `https://adm.ptlbp.co.id/` serves Management.
