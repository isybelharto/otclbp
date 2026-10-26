# Management deployment — Sumopod VPS

This application is deployed as one private Docker container. Caddy remains on the VPS host and is the only public web entrypoint. Caddy provides HTTPS and forwards traffic to the application on `127.0.0.1:3000`.

## One-time setup on the VPS

1. Connect by SSH, then create an application directory:

   ```bash
   sudo mkdir -p /opt/lbp-otc
   sudo chown -R "$USER":"$USER" /opt/lbp-otc
   git clone https://github.com/isybelharto/otclbp.git /opt/lbp-otc
   cd /opt/lbp-otc/management-next
   ```

2. Create the production environment file. Use the Supabase project URL and **publishable** key. Do not use a service-role key.

   ```bash
   cp env.production.example .env.production
   nano .env.production
   ```

3. Start the private application container:

   ```bash
   docker compose up -d --build
   docker compose ps
   ```

4. Add the contents of `ops/Caddyfile.management` to `/etc/caddy/Caddyfile`, keeping every existing site block intact. Then validate and reload Caddy:

   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

5. In Cloudflare, keep the `management` A record pointed at the VPS. Set **SSL/TLS encryption mode** to **Full (strict)** after Caddy has obtained its certificate.

## Validate deployment

```bash
curl -I http://127.0.0.1:3000
curl -I https://management.ptlbp.co.id
docker compose logs --tail=100 management
```

## Deploy a newer GitHub revision

```bash
cd /opt/lbp-otc
git pull origin main
cd management-next
docker compose up -d --build
```

## Notes

- Docker exposes port `3000` only to the VPS itself; do not open it in the firewall.
- Caddy should remain the service that listens on ports `80` and `443`.
- The GitHub repository must contain this deployment configuration before the initial clone.
