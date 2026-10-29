-- Partner quote liquidity is now restricted to the execution currencies used
-- by the portal: USD, USDT, and IDR. Legacy USDC/BTC values remain retained
-- for existing history, while new partner submissions include USD capacity.
alter table public.partner_desk_quotes
  add column if not exists available_usd numeric(28, 2) not null default 0
  check (available_usd >= 0);
