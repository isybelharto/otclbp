begin;

create table if not exists public.partner_registration_codes (
  partner_id text primary key references public.partner_desks(id) on delete cascade,
  registration_code char(6) not null unique check (registration_code ~ '^[0-9]{6}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.partner_registration_codes enable row level security;
revoke all on public.partner_registration_codes from anon, authenticated;
grant select on public.partner_registration_codes to authenticated;

drop policy if exists "management reads partner registration codes" on public.partner_registration_codes;
create policy "management reads partner registration codes"
on public.partner_registration_codes for select to authenticated
using ((select private.is_management_user()));

-- Invitation codes are deliberately not seeded in source control. Generate and
-- manage them only from the protected Management console or a secure database
-- session; they are credentials that must never be published in Git history.

-- This trigger runs alphabetically before validate_partner_signup.  It resolves
-- the private invitation code server-side and overwrites any forged partner id.
create or replace function private.assign_partner_from_registration_code()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_partner_id text;
  v_registration_code text;
begin
  if coalesce(new.raw_user_meta_data ->> 'registration_type','') = 'partner' then
    v_registration_code := nullif(btrim(new.raw_user_meta_data ->> 'partner_registration_code'),'');
    if v_registration_code is null or v_registration_code !~ '^[0-9]{6}$' then
      raise exception 'Enter the six-digit Partner Desk invitation code provided by LBP';
    end if;
    select partner_id into v_partner_id
    from public.partner_registration_codes
    where partner_registration_codes.registration_code = v_registration_code::char(6)
      and is_active;
    if v_partner_id is null then
      raise exception 'The Partner Desk invitation code is invalid or inactive';
    end if;
    new.raw_user_meta_data := jsonb_set(
      coalesce(new.raw_user_meta_data, '{}'::jsonb),
      '{requested_partner_id}', to_jsonb(v_partner_id), true
    );
  end if;
  return new;
end;
$$;
revoke all on function private.assign_partner_from_registration_code() from public, anon, authenticated;

drop trigger if exists a_assign_partner_from_registration_code on auth.users;
create trigger a_assign_partner_from_registration_code before insert on auth.users
for each row execute function private.assign_partner_from_registration_code();

commit;
