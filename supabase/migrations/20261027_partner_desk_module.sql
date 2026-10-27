-- LBP OTC Partner Desk module. Run once in the Supabase SQL Editor.
-- This schema stores partner-submitted information only; it does not execute
-- payments, custody movements, exchange orders, or blockchain transfers.

create table if not exists public.partner_desks (
  id text primary key,
  display_name text not null,
  legal_name text,
  jurisdiction text,
  operator_name text,
  status text not null default 'active' check (status in ('active','review','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists partner_id text references public.partner_desks(id);

create table if not exists public.partner_desk_quotes (
  id uuid primary key default gen_random_uuid(),
  partner_id text not null references public.partner_desks(id) on delete cascade,
  quoted_at timestamptz not null default now(),
  buy_price numeric(20,4) not null check (buy_price > 0),
  sell_price numeric(20,4) not null check (sell_price > 0),
  spread_percent numeric(10,4) not null default 0 check (spread_percent >= 0),
  fee_percent numeric(10,4) not null default 0 check (fee_percent >= 0),
  available_usdt numeric(28,8) not null default 0 check (available_usdt >= 0),
  available_usdc numeric(28,8) not null default 0 check (available_usdc >= 0),
  available_btc numeric(28,8) not null default 0 check (available_btc >= 0),
  available_idr numeric(28,2) not null default 0 check (available_idr >= 0),
  submitted_by uuid references auth.users(id),
  note text
);
create index if not exists partner_desk_quotes_partner_quoted_at_idx on public.partner_desk_quotes (partner_id, quoted_at desc);

create table if not exists public.partner_desk_bank_accounts (
  id uuid primary key default gen_random_uuid(), partner_id text not null references public.partner_desks(id) on delete cascade,
  bank_name text not null, account_name text not null, account_number_masked text not null,
  currency text not null, status text not null default 'pending', created_at timestamptz not null default now()
);
create table if not exists public.partner_desk_wallets (
  id uuid primary key default gen_random_uuid(), partner_id text not null references public.partner_desks(id) on delete cascade,
  asset text not null, network text not null, address_masked text not null,
  wallet_use text not null default 'settlement', status text not null default 'pending', created_at timestamptz not null default now()
);
create table if not exists public.partner_desk_fiat_settlements (
  id uuid primary key default gen_random_uuid(), partner_id text not null references public.partner_desks(id) on delete cascade,
  settled_at timestamptz not null default now(), direction text not null check (direction in ('in','out')),
  currency text not null, amount numeric(28,2) not null check (amount > 0), bank_name text, bank_reference text, status text not null default 'pending'
);
create table if not exists public.partner_desk_crypto_settlements (
  id uuid primary key default gen_random_uuid(), partner_id text not null references public.partner_desks(id) on delete cascade,
  settled_at timestamptz not null default now(), direction text not null check (direction in ('in','out')),
  asset text not null, amount numeric(28,8) not null check (amount > 0), network text, txid text, confirmations integer not null default 0, status text not null default 'pending'
);
create table if not exists public.partner_desk_audit_events (
  id uuid primary key default gen_random_uuid(), partner_id text not null references public.partner_desks(id) on delete cascade,
  created_at timestamptz not null default now(), actor_id uuid references auth.users(id), action text not null,
  old_value jsonb, new_value jsonb
);

create or replace function public.can_access_partner_desk(target_partner_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active
    and (p.role = 'management' or (p.role = 'partner' and p.partner_id = target_partner_id)));
$$;

grant execute on function public.can_access_partner_desk(text) to authenticated;

alter table public.partner_desks enable row level security;
alter table public.partner_desk_quotes enable row level security;
alter table public.partner_desk_bank_accounts enable row level security;
alter table public.partner_desk_wallets enable row level security;
alter table public.partner_desk_fiat_settlements enable row level security;
alter table public.partner_desk_crypto_settlements enable row level security;
alter table public.partner_desk_audit_events enable row level security;

create policy "partner desks readable by authorised party" on public.partner_desks for select to authenticated using (public.can_access_partner_desk(id));
create policy "quotes readable by authorised party" on public.partner_desk_quotes for select to authenticated using (public.can_access_partner_desk(partner_id));
create policy "quotes inserted by authorised party" on public.partner_desk_quotes for insert to authenticated with check (public.can_access_partner_desk(partner_id) and submitted_by = auth.uid());
create policy "accounts readable by authorised party" on public.partner_desk_bank_accounts for select to authenticated using (public.can_access_partner_desk(partner_id));
create policy "accounts inserted by authorised party" on public.partner_desk_bank_accounts for insert to authenticated with check (public.can_access_partner_desk(partner_id));
create policy "wallets readable by authorised party" on public.partner_desk_wallets for select to authenticated using (public.can_access_partner_desk(partner_id));
create policy "wallets inserted by authorised party" on public.partner_desk_wallets for insert to authenticated with check (public.can_access_partner_desk(partner_id));
create policy "fiat readable by authorised party" on public.partner_desk_fiat_settlements for select to authenticated using (public.can_access_partner_desk(partner_id));
create policy "crypto readable by authorised party" on public.partner_desk_crypto_settlements for select to authenticated using (public.can_access_partner_desk(partner_id));
create policy "audit readable by authorised party" on public.partner_desk_audit_events for select to authenticated using (public.can_access_partner_desk(partner_id));

insert into public.partner_desks (id, display_name, jurisdiction, status) values
 ('idrx','IDRX','Indonesia','active'), ('btse','BTSE','Global','active'), ('ajaib','Ajaib','Indonesia','active'),
 ('reku','Reku','Indonesia','active'), ('indodax','Indodax','Indonesia','active'), ('osl','OSL','Hong Kong','active'),
 ('nanovest','Nanovest','Indonesia','active'), ('samuel-kripto','Samuel Kripto','Indonesia','active'),
 ('mobee','Mobee','Indonesia','active'), ('tokocrypto','Tokocrypto','Indonesia','active')
on conflict (id) do nothing;
