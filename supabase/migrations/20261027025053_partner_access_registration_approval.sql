begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.partner_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  corporate_email text not null unique,
  company_name text not null,
  contact_name text not null,
  position_title text not null,
  phone text,
  requested_partner_id text references public.partner_desks(id),
  assigned_partner_id text references public.partner_desks(id),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_access_approval_assignment check (status <> 'approved' or assigned_partner_id is not null)
);

alter table public.partner_access_requests enable row level security;
revoke all on public.partner_access_requests from anon, authenticated;
grant select on public.partner_access_requests to authenticated;
grant update (status, assigned_partner_id, review_note) on public.partner_access_requests to authenticated;

create or replace function private.is_management_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role::text = 'management' and is_active = true
  );
$$;
revoke all on function private.is_management_user() from public, anon;
grant execute on function private.is_management_user() to authenticated;

drop policy if exists "partner access applicant reads own request" on public.partner_access_requests;
create policy "partner access applicant reads own request" on public.partner_access_requests
for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "management reads partner access requests" on public.partner_access_requests;
create policy "management reads partner access requests" on public.partner_access_requests
for select to authenticated using ((select private.is_management_user()));
drop policy if exists "management reviews partner access requests" on public.partner_access_requests;
create policy "management reviews partner access requests" on public.partner_access_requests
for update to authenticated using ((select private.is_management_user()))
with check ((select private.is_management_user()));

create or replace function private.validate_partner_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  domain_name text;
  blocked_domains constant text[] := array[
    'gmail.com','googlemail.com','yahoo.com','yahoo.co.id','outlook.com','hotmail.com',
    'live.com','icloud.com','me.com','aol.com','mail.com','gmx.com','gmx.net',
    'proton.me','protonmail.com','zoho.com','yandex.com','yandex.ru'
  ];
begin
  if coalesce(new.raw_user_meta_data ->> 'registration_type','') = 'partner' then
    domain_name := lower(split_part(coalesce(new.email,''),'@',2));
    if domain_name = '' or domain_name = any(blocked_domains) then
      raise exception 'A valid company email address is required';
    end if;
    if nullif(btrim(new.raw_user_meta_data ->> 'company_name'),'') is null
       or nullif(btrim(new.raw_user_meta_data ->> 'contact_name'),'') is null
       or nullif(btrim(new.raw_user_meta_data ->> 'position_title'),'') is null
       or nullif(btrim(new.raw_user_meta_data ->> 'requested_partner_id'),'') is null then
      raise exception 'Partner registration data is incomplete';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_partner_signup() from public, anon, authenticated;

create or replace function private.create_partner_access_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'registration_type','') = 'partner' then
    insert into public.profiles (id, full_name, role, client_id, is_active, partner_id)
    values (new.id, btrim(new.raw_user_meta_data ->> 'contact_name'), 'partner', null, false, null)
    on conflict (id) do update set
      full_name = excluded.full_name, role = 'partner', client_id = null,
      is_active = false, partner_id = null, updated_at = now();

    insert into public.partner_access_requests (
      user_id, corporate_email, company_name, contact_name, position_title, phone,
      requested_partner_id, status
    ) values (
      new.id, lower(new.email), btrim(new.raw_user_meta_data ->> 'company_name'),
      btrim(new.raw_user_meta_data ->> 'contact_name'),
      btrim(new.raw_user_meta_data ->> 'position_title'),
      nullif(btrim(new.raw_user_meta_data ->> 'phone'),''),
      btrim(new.raw_user_meta_data ->> 'requested_partner_id'), 'pending'
    ) on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.create_partner_access_request() from public, anon, authenticated;

create or replace function private.review_partner_access_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;
revoke all on function private.review_partner_access_request() from public, anon, authenticated;

create or replace function private.sync_partner_access_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' then
    update public.profiles set role='partner', is_active=true,
      partner_id=new.assigned_partner_id, updated_at=now() where id=new.user_id;
  elsif new.status in ('pending','rejected') then
    update public.profiles set role='partner', is_active=false,
      partner_id=null, updated_at=now() where id=new.user_id;
  end if;
  if new.status is distinct from old.status then
    insert into public.audit_events (actor_id,actor_role,action,entity_type,entity_id,old_value,new_value)
    values ((select auth.uid()),'management',upper(new.status)||'_PARTNER_ACCESS',
      'partner_access_request',new.id::text,
      jsonb_build_object('status',old.status,'assigned_partner_id',old.assigned_partner_id),
      jsonb_build_object('status',new.status,'assigned_partner_id',new.assigned_partner_id,'review_note',new.review_note));
  end if;
  return new;
end;
$$;
revoke all on function private.sync_partner_access_profile() from public, anon, authenticated;

drop trigger if exists validate_partner_signup on auth.users;
create trigger validate_partner_signup before insert on auth.users
for each row execute function private.validate_partner_signup();
drop trigger if exists create_partner_access_request on auth.users;
create trigger create_partner_access_request after insert on auth.users
for each row execute function private.create_partner_access_request();
drop trigger if exists partner_access_request_review_stamp on public.partner_access_requests;
create trigger partner_access_request_review_stamp before update on public.partner_access_requests
for each row execute function private.review_partner_access_request();
drop trigger if exists partner_access_request_sync_profile on public.partner_access_requests;
create trigger partner_access_request_sync_profile after update on public.partner_access_requests
for each row execute function private.sync_partner_access_profile();

commit;
