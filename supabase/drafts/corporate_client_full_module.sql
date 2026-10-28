-- UNAPPLIED FULL-MODULE DRAFT: onboarding is already active via
-- supabase/corporate-client-onboarding.sql. Do not apply this draft over it.
-- Extract the OTC request functionality into an incremental migration first.
begin;

create table if not exists public.corporate_client_onboarding (
  client_id uuid primary key references public.corporate_clients(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  registered_address text, business_type text, incorporation_country text default 'Indonesia',
  business_identification_number text, phone text, company_email text,
  source_of_funds text[], transaction_purpose text[], annual_income_bracket text,
  wealth_sources text[], bankruptcy_status boolean, bank_name text,
  bank_account_name text, bank_account_number text, bank_address text,
  kyb_status text not null default 'draft' check (kyb_status in ('draft','submitted','review','approved','rejected')),
  declaration_accepted boolean not null default false, submitted_at timestamptz,
  reviewed_at timestamptz, review_note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.corporate_client_directors (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.corporate_clients(id) on delete cascade,
  position_no smallint not null check (position_no between 1 and 4), full_name text not null,
  date_of_birth date, place_of_birth text, nationality text, identity_type text,
  identity_number text, residential_address text, is_pep boolean not null default false,
  created_at timestamptz not null default now(), unique(client_id, position_no)
);
create table if not exists public.corporate_client_beneficial_owners (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.corporate_clients(id) on delete cascade,
  full_name text not null, date_of_birth date, place_of_birth text, nationality text,
  identity_type text, identity_number text, residential_address text, is_pep boolean not null default false,
  ownership_percentage numeric(7,4), control_criteria smallint[] not null default '{}', is_representative boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.corporate_client_kyb_documents (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.corporate_clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, document_type text not null,
  storage_path text not null, original_filename text not null, mime_type text, size_bytes bigint,
  status text not null default 'uploaded' check (status in ('uploaded','review','approved','rejected')),
  review_note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(client_id, document_type)
);
create table if not exists public.corporate_otc_requests (
  id uuid primary key default gen_random_uuid(), request_code text not null unique default ('REQ-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  client_id uuid not null references public.corporate_clients(id), requested_by uuid not null references auth.users(id),
  partner_id text not null references public.partner_desks(id), route text not null check (route in ('USD_USDT','IDR_USDT','USDT_IDR')),
  input_asset text not null, input_amount numeric(30,8) not null check (input_amount > 0), output_asset text not null,
  quoted_rate numeric(30,8) not null, fee_percent numeric(12,6) not null default 0,
  gross_output numeric(30,8) not null, fee_amount numeric(30,8) not null, estimated_output numeric(30,8) not null,
  quote_id uuid references public.partner_desk_quotes(id), status text not null default 'submitted' check (status in ('submitted','review','quoted','approved','processing','settled','rejected','cancelled','expired')),
  expires_at timestamptz not null default (now() + interval '30 minutes'), note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists corporate_otc_requests_partner_route_status_idx on public.corporate_otc_requests(partner_id, route, status);
create index if not exists corporate_otc_requests_client_created_idx on public.corporate_otc_requests(client_id, created_at desc);

alter table public.corporate_client_onboarding enable row level security;
alter table public.corporate_client_directors enable row level security;
alter table public.corporate_client_beneficial_owners enable row level security;
alter table public.corporate_client_kyb_documents enable row level security;
alter table public.corporate_otc_requests enable row level security;

create or replace function private.is_active_corporate_user(target_client uuid) returns boolean language sql stable security definer set search_path=public,private as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='corporate_client' and is_active and client_id=target_client)
$$;
create or replace function private.is_internal_kyb_user() returns boolean language sql stable security definer set search_path=public,private as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role in ('management','compliance') and is_active)
$$;

create policy corporate_onboarding_own_select on public.corporate_client_onboarding for select to authenticated using (private.is_active_corporate_user(client_id) or private.is_internal_kyb_user());
create policy corporate_onboarding_own_update on public.corporate_client_onboarding for update to authenticated using (private.is_active_corporate_user(client_id) or private.is_internal_kyb_user()) with check (private.is_active_corporate_user(client_id) or private.is_internal_kyb_user());
create policy corporate_directors_access on public.corporate_client_directors for all to authenticated using (private.is_active_corporate_user(client_id) or private.is_internal_kyb_user()) with check (private.is_active_corporate_user(client_id) or private.is_internal_kyb_user());
create policy corporate_bos_access on public.corporate_client_beneficial_owners for all to authenticated using (private.is_active_corporate_user(client_id) or private.is_internal_kyb_user()) with check (private.is_active_corporate_user(client_id) or private.is_internal_kyb_user());
create policy corporate_docs_access on public.corporate_client_kyb_documents for all to authenticated using (private.is_active_corporate_user(client_id) or private.is_internal_kyb_user()) with check (private.is_active_corporate_user(client_id) or private.is_internal_kyb_user());
create policy corporate_requests_own_select on public.corporate_otc_requests for select to authenticated using (private.is_active_corporate_user(client_id) or private.is_internal_kyb_user());
create policy corporate_requests_internal_update on public.corporate_otc_requests for update to authenticated using (private.is_internal_kyb_user()) with check (private.is_internal_kyb_user());
create policy corporate_partner_desks_read on public.partner_desks for select to authenticated using (exists(select 1 from public.profiles where id=auth.uid() and role='corporate_client' and is_active));
create policy corporate_partner_quotes_read on public.partner_desk_quotes for select to authenticated using (exists(select 1 from public.profiles where id=auth.uid() and role='corporate_client' and is_active));

create or replace function public.submit_corporate_otc_request(p_partner_id text,p_route text,p_input_amount numeric,p_note text default null)
returns public.corporate_otc_requests language plpgsql security definer set search_path=public,private as $$
declare v_profile public.profiles; v_client public.corporate_clients; v_onboarding public.corporate_client_onboarding;
 v_quote public.partner_desk_quotes; v_usd numeric; v_reserved numeric:=0; v_rate numeric; v_gross numeric; v_fee numeric; v_net numeric; v_available numeric; v_result public.corporate_otc_requests;
begin
 select * into v_profile from public.profiles where id=auth.uid() and role='corporate_client' and is_active;
 if v_profile.id is null then raise exception 'Active Corporate Client access is required'; end if;
 select * into v_client from public.corporate_clients where id=v_profile.client_id;
 select * into v_onboarding from public.corporate_client_onboarding where client_id=v_profile.client_id;
 if coalesce(v_onboarding.kyb_status,'draft') <> 'approved' or v_client.kyc_status::text <> 'verified' then raise exception 'KYB approval is required before submitting a transaction'; end if;
 if p_route is null or p_route not in ('USD_USDT','IDR_USDT','USDT_IDR') or p_input_amount is null or p_input_amount<=0 or p_input_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid transaction request'; end if;
 perform pg_advisory_xact_lock(hashtext(p_partner_id));
 select * into v_quote from public.partner_desk_quotes where partner_id=p_partner_id order by quoted_at desc limit 1;
 if v_quote.id is null or not exists(select 1 from public.partner_desks where id=p_partner_id and lower(status)='active') then raise exception 'Partner quote is unavailable'; end if;
 if v_quote.buy_price<=0 or v_quote.sell_price<=0 or v_quote.fee_percent<0 or v_quote.fee_percent>=100 then raise exception 'Partner quote is invalid'; end if;
 if v_quote.quoted_at < now()-interval '24 hours' then raise exception 'Partner quote has expired'; end if;
 if p_route='IDR_USDT' then v_rate:=v_quote.sell_price; v_gross:=p_input_amount/v_rate; v_available:=v_quote.available_usdt;
 elsif p_route='USD_USDT' then select idr_rate into v_usd from public.asset_rates where asset_code='USD'; if coalesce(v_usd,0)<=0 then raise exception 'USD/IDR reference is unavailable'; end if; v_rate:=v_quote.sell_price/v_usd; v_gross:=p_input_amount/v_rate; v_available:=v_quote.available_usdt;
 else v_rate:=v_quote.buy_price; v_gross:=p_input_amount*v_rate; v_available:=v_quote.available_idr; end if;
 v_fee:=v_gross*(coalesce(v_quote.fee_percent,0)/100); v_net:=v_gross-v_fee;
 select coalesce(sum(estimated_output),0) into v_reserved from public.corporate_otc_requests where partner_id=p_partner_id and output_asset=case when p_route='USDT_IDR' then 'IDR' else 'USDT' end and ((status in ('submitted','review','quoted') and expires_at>now()) or status in ('approved','processing') or (status='settled' and updated_at>=v_quote.quoted_at));
 if v_reserved + v_net > coalesce(v_available,0) then raise exception 'Requested amount exceeds currently available Partner Desk liquidity'; end if;
 insert into public.corporate_otc_requests(client_id,requested_by,partner_id,route,input_asset,input_amount,output_asset,quoted_rate,fee_percent,gross_output,fee_amount,estimated_output,quote_id,note)
 values(v_profile.client_id,auth.uid(),p_partner_id,p_route,case when p_route='IDR_USDT' then 'IDR' when p_route='USD_USDT' then 'USD' else 'USDT' end,p_input_amount,case when p_route='USDT_IDR' then 'IDR' else 'USDT' end,v_rate,coalesce(v_quote.fee_percent,0),v_gross,v_fee,v_net,v_quote.id,p_note) returning * into v_result;
 return v_result;
end $$;
revoke all on function public.submit_corporate_otc_request(text,text,numeric,text) from public,anon;
grant execute on function public.submit_corporate_otc_request(text,text,numeric,text) to authenticated;

create or replace function public.bootstrap_corporate_client_signup() returns trigger language plpgsql security definer set search_path=public as $$
declare v_client uuid; v_code text;
begin
 if new.raw_user_meta_data->>'registration_type' is distinct from 'corporate_client' then return new; end if;
 v_code:='CC-'||upper(substr(replace(new.id::text,'-',''),1,8));
 insert into public.corporate_clients(client_code,legal_name,tier,country_code,tax_id,kyc_status,aml_status,client_status)
 values(v_code,new.raw_user_meta_data->>'company_name',coalesce(new.raw_user_meta_data->>'tier','Corporate'),'ID',null,'pending','review','review') returning id into v_client;
 insert into public.profiles(id,full_name,role,client_id,is_active) values(new.id,new.raw_user_meta_data->>'contact_name','corporate_client',v_client,true)
 on conflict(id) do update set full_name=excluded.full_name,role=excluded.role,client_id=excluded.client_id,is_active=true;
 insert into public.corporate_client_onboarding(client_id,user_id,company_email,phone,incorporation_country) values(v_client,new.id,new.email,new.raw_user_meta_data->>'phone','Indonesia');
 return new;
end $$;
drop trigger if exists on_corporate_client_signup on auth.users;
create trigger on_corporate_client_signup after insert on auth.users for each row execute function public.bootstrap_corporate_client_signup();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('corporate-kyb','corporate-kyb',false,10485760,array['application/pdf','image/jpeg','image/png']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy corporate_kyb_upload_own on storage.objects for insert to authenticated with check (bucket_id='corporate-kyb' and (storage.foldername(name))[1]=auth.uid()::text);
create policy corporate_kyb_read_own_internal on storage.objects for select to authenticated using (bucket_id='corporate-kyb' and ((storage.foldername(name))[1]=auth.uid()::text or private.is_internal_kyb_user()));
create policy corporate_kyb_update_own on storage.objects for update to authenticated using (bucket_id='corporate-kyb' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='corporate-kyb' and (storage.foldername(name))[1]=auth.uid()::text);

grant select,update on public.corporate_client_onboarding to authenticated;
grant select,insert,update,delete on public.corporate_client_directors,public.corporate_client_beneficial_owners to authenticated;
grant select,insert,update on public.corporate_client_kyb_documents to authenticated;
grant select on public.corporate_otc_requests,public.partner_desks,public.partner_desk_quotes,public.asset_rates to authenticated;
-- Client writes cannot approve their own KYB or document review.
create or replace function private.guard_corporate_review() returns trigger language plpgsql security definer set search_path=public,private as $$
begin
 if private.is_internal_kyb_user() then return new; end if;
 if tg_table_name='corporate_client_onboarding' then
   if new.client_id is distinct from old.client_id or new.user_id is distinct from old.user_id or new.reviewed_at is distinct from old.reviewed_at or new.review_note is distinct from old.review_note then raise exception 'Review fields are restricted'; end if;
   if old.kyb_status in ('approved','review','submitted') then raise exception 'Contact LBP to amend an application already under review or approved'; end if;
   if new.kyb_status is distinct from old.kyb_status and new.kyb_status not in ('draft','submitted') then raise exception 'KYB decisions require an authorised reviewer'; end if;
   if new.kyb_status='submitted' then
     if not new.declaration_accepted then raise exception 'Accept the declaration'; end if;
     if not exists(select 1 from public.corporate_client_directors where client_id=new.client_id) or not exists(select 1 from public.corporate_client_beneficial_owners where client_id=new.client_id) then raise exception 'Complete directors and beneficial owners'; end if;
     if (select count(distinct document_type) from public.corporate_client_kyb_documents where client_id=new.client_id and document_type in ('director_id','beneficial_owner_id','deed_establishment','nib','npwp','sppkp','statement_letter','nda'))<8 then raise exception 'Upload all required KYB documents'; end if;
   end if;
 elsif new.status <> 'uploaded' or new.review_note is not null then raise exception 'Document review requires an authorised reviewer';
 end if;
 return new;
end $$;
create trigger corporate_onboarding_review_guard before update on public.corporate_client_onboarding for each row execute function private.guard_corporate_review();
create trigger corporate_document_review_guard before insert or update on public.corporate_client_kyb_documents for each row execute function private.guard_corporate_review();
revoke all on function public.bootstrap_corporate_client_signup() from public,anon,authenticated;
revoke all on function private.guard_corporate_review() from public,anon,authenticated;
commit;
