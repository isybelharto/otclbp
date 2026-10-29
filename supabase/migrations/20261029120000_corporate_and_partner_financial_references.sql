-- Financial references for Corporate Client and Partner Desk workspaces.
-- Raw account and wallet values are intentionally protected by RLS; the UI
-- displays masked values by default.

alter table public.partner_desk_bank_accounts
  add column if not exists bank_country text,
  add column if not exists bank_address text,
  add column if not exists beneficiary_address text,
  add column if not exists swift_bic text,
  add column if not exists iban text,
  add column if not exists account_number text,
  add column if not exists is_primary boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.partner_desk_wallets
  add column if not exists address text,
  add column if not exists wallet_label text,
  add column if not exists is_primary boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.corporate_client_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.corporate_clients(id) on delete cascade,
  account_label text not null check (char_length(trim(account_label)) between 2 and 80),
  bank_name text not null check (char_length(trim(bank_name)) between 2 and 160),
  bank_country text not null check (char_length(trim(bank_country)) between 2 and 100),
  bank_address text,
  beneficiary_name text not null check (char_length(trim(beneficiary_name)) between 2 and 160),
  beneficiary_address text,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  account_number text not null check (char_length(trim(account_number)) between 4 and 80),
  iban text,
  swift_bic text,
  intermediary_bank_name text,
  intermediary_swift_bic text,
  is_primary boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'verified', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, currency, account_number)
);

create table if not exists public.corporate_client_wallets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.corporate_clients(id) on delete cascade,
  wallet_label text not null check (char_length(trim(wallet_label)) between 2 and 80),
  asset text not null check (asset in ('USDT', 'USDC', 'BTC', 'ETH', 'OTHER')),
  network text not null check (char_length(trim(network)) between 2 and 80),
  address text not null check (char_length(trim(address)) between 8 and 160),
  wallet_use text not null default 'settlement' check (wallet_use in ('settlement', 'withdrawal', 'deposit', 'treasury')),
  is_primary boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'verified', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, network, address)
);

create index if not exists partner_desk_bank_accounts_partner_id_idx
  on public.partner_desk_bank_accounts(partner_id);
create index if not exists partner_desk_wallets_partner_id_idx
  on public.partner_desk_wallets(partner_id);
create index if not exists corporate_client_bank_accounts_client_id_idx
  on public.corporate_client_bank_accounts(client_id);
create index if not exists corporate_client_wallets_client_id_idx
  on public.corporate_client_wallets(client_id);

create unique index if not exists partner_desk_bank_accounts_one_primary_idx
  on public.partner_desk_bank_accounts(partner_id) where is_primary;
create unique index if not exists partner_desk_wallets_one_primary_idx
  on public.partner_desk_wallets(partner_id) where is_primary;
create unique index if not exists corporate_client_bank_accounts_one_primary_idx
  on public.corporate_client_bank_accounts(client_id) where is_primary;
create unique index if not exists corporate_client_wallets_one_primary_idx
  on public.corporate_client_wallets(client_id) where is_primary;

alter table public.corporate_client_bank_accounts enable row level security;
alter table public.corporate_client_wallets enable row level security;

grant select, insert, update, delete on public.corporate_client_bank_accounts to authenticated;
grant select, insert, update, delete on public.corporate_client_wallets to authenticated;
grant select, insert, update, delete on public.partner_desk_bank_accounts to authenticated;
grant select, insert, update, delete on public.partner_desk_wallets to authenticated;

drop policy if exists corporate_bank_accounts_read on public.corporate_client_bank_accounts;
drop policy if exists corporate_bank_accounts_write on public.corporate_client_bank_accounts;
drop policy if exists corporate_wallets_read on public.corporate_client_wallets;
drop policy if exists corporate_wallets_write on public.corporate_client_wallets;

create policy corporate_bank_accounts_read on public.corporate_client_bank_accounts
  for select to authenticated
  using (private.is_active_corporate_user(client_id) or (select private.is_internal_kyb_user()));
create policy corporate_bank_accounts_write on public.corporate_client_bank_accounts
  for all to authenticated
  using (private.can_edit_corporate_onboarding(client_id) or (select private.is_internal_kyb_user()))
  with check (private.can_edit_corporate_onboarding(client_id) or (select private.is_internal_kyb_user()));

create policy corporate_wallets_read on public.corporate_client_wallets
  for select to authenticated
  using (private.is_active_corporate_user(client_id) or (select private.is_internal_kyb_user()));
create policy corporate_wallets_write on public.corporate_client_wallets
  for all to authenticated
  using (private.can_edit_corporate_onboarding(client_id) or (select private.is_internal_kyb_user()))
  with check (private.can_edit_corporate_onboarding(client_id) or (select private.is_internal_kyb_user()));

drop policy if exists "accounts updated by authorised party" on public.partner_desk_bank_accounts;
drop policy if exists "accounts deleted by authorised party" on public.partner_desk_bank_accounts;
drop policy if exists "wallets updated by authorised party" on public.partner_desk_wallets;
drop policy if exists "wallets deleted by authorised party" on public.partner_desk_wallets;

create policy "accounts updated by authorised party" on public.partner_desk_bank_accounts
  for update to authenticated
  using ((select public.can_access_partner_desk(partner_id)))
  with check ((select public.can_access_partner_desk(partner_id)));
create policy "accounts deleted by authorised party" on public.partner_desk_bank_accounts
  for delete to authenticated
  using ((select public.can_access_partner_desk(partner_id)));
create policy "wallets updated by authorised party" on public.partner_desk_wallets
  for update to authenticated
  using ((select public.can_access_partner_desk(partner_id)))
  with check ((select public.can_access_partner_desk(partner_id)));
create policy "wallets deleted by authorised party" on public.partner_desk_wallets
  for delete to authenticated
  using ((select public.can_access_partner_desk(partner_id)));
