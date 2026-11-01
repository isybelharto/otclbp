# Landing Page via VPS IP

The complete public landing page is served from:

```text
/opt/lbp-otc/dist/landing-page
```

This includes the Indonesian home page, translated pages, CSS, JavaScript,
images, legal pages, sitemap and other public assets. Do not copy individual
files into the Management application folder.

## Caddy configuration

On the VPS, add the following **separate site block** to
`/etc/caddy/Caddyfile`. Put it outside the existing
`adm.ptlbp.co.id { ... }` block.

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
- The landing page canonical URLs remain `https://ptlbp.co.id/`; this protects
  the production domain's search and sharing metadata.
- When the domain is ready to point to this VPS, add a normal Caddy domain
  block for `ptlbp.co.id` using the same `root` path to enable automatic HTTPS.
