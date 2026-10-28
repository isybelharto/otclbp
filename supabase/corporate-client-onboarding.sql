-- Corporate Client onboarding only; OTC execution is deployed separately.
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

create index corporate_client_bo_client_idx on public.corporate_client_beneficial_owners(client_id);
create index corporate_client_documents_user_idx on public.corporate_client_kyb_documents(user_id);
create index corporate_client_onboarding_status_idx on public.corporate_client_onboarding(kyb_status,created_at);
alter table public.corporate_client_beneficial_owners add constraint corporate_bo_percentage_check check(ownership_percentage between 0 and 100);
alter table public.corporate_client_beneficial_owners add constraint corporate_bo_criteria_check check(control_criteria <@ array[1,2,3,4,5,6,7]::smallint[]);
alter table public.corporate_client_kyb_documents add constraint corporate_document_type_check check(document_type in ('director_id','beneficial_owner_id','deed_establishment','deed_amendment','nib','npwp','sppkp','statement_letter','nda'));
alter table public.corporate_client_kyb_documents add constraint corporate_document_size_check check(size_bytes between 1 and 10485760);
alter table public.corporate_client_kyb_documents add constraint corporate_document_mime_check check(mime_type in ('application/pdf','image/jpeg','image/png'));
create or replace function private.is_active_corporate_user(target_client uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and role='corporate_client' and is_active and client_id=target_client)
$$;
create or replace function private.is_internal_kyb_user() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and role in ('management','compliance') and is_active)
$$;
create or replace function private.can_edit_corporate_onboarding(target_client uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_corporate_user(target_client) and exists(select 1 from public.corporate_client_onboarding where client_id=target_client and kyb_status in ('draft','rejected'))
$$;
revoke all on function private.is_active_corporate_user(uuid),private.is_internal_kyb_user(),private.can_edit_corporate_onboarding(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.is_active_corporate_user(uuid),private.is_internal_kyb_user(),private.can_edit_corporate_onboarding(uuid) to authenticated;
alter table public.corporate_client_onboarding enable row level security;
alter table public.corporate_client_directors enable row level security;
alter table public.corporate_client_beneficial_owners enable row level security;
alter table public.corporate_client_kyb_documents enable row level security;
create policy corporate_onboarding_read on public.corporate_client_onboarding for select to authenticated using(private.is_active_corporate_user(client_id) or (select private.is_internal_kyb_user()));
create policy corporate_onboarding_update on public.corporate_client_onboarding for update to authenticated using(private.can_edit_corporate_onboarding(client_id) or (select private.is_internal_kyb_user())) with check(private.is_active_corporate_user(client_id) or (select private.is_internal_kyb_user()));
create policy corporate_directors_read on public.corporate_client_directors for select to authenticated using(private.is_active_corporate_user(client_id) or (select private.is_internal_kyb_user()));
create policy corporate_directors_insert on public.corporate_client_directors for insert to authenticated with check(private.can_edit_corporate_onboarding(client_id) or (select private.is_internal_kyb_user()));
create policy corporate_directors_update on public.corporate_client_directors for update to authenticated using(private.can_edit_corporate_onboarding(client_id) or (select private.is_internal_kyb_user())) with check(private.can_edit_corporate_onboarding(client_id) or (select private.is_internal_kyb_user()));
create policy corporate_bo_read on public.corporate_client_beneficial_owners for select to authenticated using(private.is_active_corporate_user(client_id) or (select private.is_internal_kyb_user()));
create policy corporate_bo_insert on public.corporate_client_beneficial_owners for insert to authenticated with check(private.can_edit_corporate_onboarding(client_id) or (select private.is_internal_kyb_user()));
create policy corporate_bo_update on public.corporate_client_beneficial_owners for update to authenticated using(private.can_edit_corporate_onboarding(client_id) or (select private.is_internal_kyb_user())) with check(private.can_edit_corporate_onboarding(client_id) or (select private.is_internal_kyb_user()));
create policy corporate_documents_read on public.corporate_client_kyb_documents for select to authenticated using(private.is_active_corporate_user(client_id) or (select private.is_internal_kyb_user()));
create policy corporate_documents_insert on public.corporate_client_kyb_documents for insert to authenticated with check((private.can_edit_corporate_onboarding(client_id) and user_id=(select auth.uid()) and split_part(storage_path,'/',1)=(select auth.uid())::text) or (select private.is_internal_kyb_user()));
create policy corporate_documents_update on public.corporate_client_kyb_documents for update to authenticated using(private.can_edit_corporate_onboarding(client_id) or (select private.is_internal_kyb_user())) with check((private.can_edit_corporate_onboarding(client_id) and user_id=(select auth.uid()) and split_part(storage_path,'/',1)=(select auth.uid())::text) or (select private.is_internal_kyb_user()));
revoke all on public.corporate_client_onboarding,public.corporate_client_directors,public.corporate_client_beneficial_owners,public.corporate_client_kyb_documents from anon,authenticated;
grant select,update on public.corporate_client_onboarding to authenticated;
grant select,insert,update on public.corporate_client_directors,public.corporate_client_beneficial_owners,public.corporate_client_kyb_documents to authenticated;
grant all on public.corporate_client_onboarding,public.corporate_client_directors,public.corporate_client_beneficial_owners,public.corporate_client_kyb_documents to service_role;

create or replace function private.guard_corporate_onboarding_write() returns trigger language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_type text;
begin
 new.updated_at:=now();
 if v_actor is null and current_setting('role',true) in ('none','postgres','service_role') then return new; end if;
 if private.is_internal_kyb_user() then
   if tg_table_name='corporate_client_onboarding' and new.kyb_status is distinct from old.kyb_status and new.kyb_status in ('approved','rejected','review') then new.reviewed_at:=now(); end if;
   return new;
 end if;
 if tg_table_name='corporate_client_onboarding' then
   if new.client_id is distinct from old.client_id or new.user_id is distinct from old.user_id or new.company_email is distinct from old.company_email or new.created_at is distinct from old.created_at or new.reviewed_at is distinct from old.reviewed_at or new.review_note is distinct from old.review_note then raise exception 'Protected onboarding fields cannot be changed'; end if;
   if old.kyb_status not in ('draft','rejected') or new.kyb_status not in ('draft','submitted') then raise exception 'KYB decisions require Management or Compliance review'; end if;
   if new.kyb_status='submitted' then
     if not new.declaration_accepted then raise exception 'Accept the declaration before submitting KYB'; end if;
     if nullif(btrim(new.registered_address),'') is null or nullif(btrim(new.business_identification_number),'') is null or nullif(btrim(new.bank_account_number),'') is null then raise exception 'Complete the company address, NIB, and bank account'; end if;
     if not exists(select 1 from public.corporate_client_directors where client_id=new.client_id) or not exists(select 1 from public.corporate_client_beneficial_owners where client_id=new.client_id) then raise exception 'Complete directors and beneficial owners'; end if;
     if (select count(distinct document_type) from public.corporate_client_kyb_documents where client_id=new.client_id and status<>'rejected' and document_type in ('director_id','beneficial_owner_id','deed_establishment','nib','npwp','sppkp','statement_letter','nda'))<8 then raise exception 'Upload all eight mandatory KYB documents'; end if;
     new.submitted_at:=now();
   end if;
 else
   if new.status<>'uploaded' or new.review_note is not null then raise exception 'Document review requires Management or Compliance'; end if;
   if tg_op='UPDATE' and (new.client_id is distinct from old.client_id or new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at) then raise exception 'Document ownership cannot be changed'; end if;
   if not exists(select 1 from storage.objects where bucket_id='corporate-kyb' and name=new.storage_path) then raise exception 'Upload the document before saving its metadata'; end if;
 end if;
 return new;
end $$;
create trigger corporate_onboarding_write_guard before update on public.corporate_client_onboarding for each row execute function private.guard_corporate_onboarding_write();
create trigger corporate_document_write_guard before insert or update on public.corporate_client_kyb_documents for each row execute function private.guard_corporate_onboarding_write();
revoke all on function private.guard_corporate_onboarding_write() from public,anon,authenticated;

create or replace function private.bootstrap_corporate_client_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare v_client uuid; v_company text; v_contact text; v_tier text; v_domain text;
begin
 if new.raw_user_meta_data->>'registration_type' is distinct from 'corporate_client' then return new; end if;
 v_company:=nullif(btrim(new.raw_user_meta_data->>'company_name'),'');
 v_contact:=nullif(btrim(new.raw_user_meta_data->>'contact_name'),'');
 v_tier:=coalesce(new.raw_user_meta_data->>'tier','Corporate');
 v_domain:=lower(split_part(new.email,'@',2));
 if v_company is null or v_contact is null then raise exception 'Company and representative names are required'; end if;
 if v_tier not in ('Corporate','Institutional Fund','Financial Institution') then raise exception 'Invalid corporate client tier'; end if;
 if coalesce(v_domain,'')='' or v_domain in ('gmail.com','googlemail.com','yahoo.com','yahoo.co.id','outlook.com','hotmail.com','live.com','icloud.com','me.com','aol.com','mail.com','gmx.com','proton.me','protonmail.com') then raise exception 'Use an authorised company email'; end if;
 insert into public.corporate_clients(client_code,legal_name,tier,country_code,kyc_status,aml_status,client_status)
 values('CC-'||replace(new.id::text,'-',''),v_company,v_tier,'ID','pending','review','review') returning id into v_client;
 insert into public.profiles(id,full_name,role,client_id,is_active) values(new.id,v_contact,'corporate_client',v_client,true);
 insert into public.corporate_client_onboarding(client_id,user_id,company_email,phone) values(v_client,new.id,lower(new.email),nullif(btrim(new.raw_user_meta_data->>'phone'),''));
 return new;
end $$;
revoke all on function private.bootstrap_corporate_client_signup() from public,anon,authenticated;
create trigger on_corporate_client_signup after insert on auth.users for each row execute function private.bootstrap_corporate_client_signup();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('corporate-kyb','corporate-kyb',false,10485760,array['application/pdf','image/jpeg','image/png']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy corporate_kyb_upload on storage.objects for insert to authenticated with check(bucket_id='corporate-kyb' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and private.can_edit_corporate_onboarding(p.client_id)));
create policy corporate_kyb_read on storage.objects for select to authenticated using(bucket_id='corporate-kyb' and (((storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.profiles where id=(select auth.uid()) and role='corporate_client' and is_active)) or (select private.is_internal_kyb_user())));
commit;
