# LBP OTC Next.js Framework

New Next.js App Router foundation for PT Lintas Batas Pembayaran Management.

- `/login` — Supabase email/password sign-in.
- `/management` — protected Management shell and dashboard route.
- `.env.example` — public Supabase configuration placeholders only.

Run locally with `npm run dev`. Copy `.env.example` to `.env.local` and add the project URL plus publishable key. The legacy static build remains in `../dist` as a design reference while the Next.js application is built.
