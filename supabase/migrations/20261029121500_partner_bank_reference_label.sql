-- Preserve a human-readable label for each Partner Desk settlement account.
alter table public.partner_desk_bank_accounts
  add column if not exists account_label text;

