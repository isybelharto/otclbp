begin;

-- Management approval is the only route from a submitted KYB file to an
-- active Corporate Client.  The applicant may still sign in to complete or
-- amend KYB while the request is in draft / rejected status.
create or replace function private.sync_corporate_onboarding_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kyb_status is distinct from old.kyb_status then
    if new.kyb_status = 'approved' then
      update public.corporate_clients
      set kyc_status = 'verified',
          aml_status = 'clear',
          client_status = 'active',
          onboarded_at = coalesce(onboarded_at, now()),
          updated_at = now()
      where id = new.client_id;
    elsif new.kyb_status in ('draft', 'submitted', 'review') then
      update public.corporate_clients
      set kyc_status = 'pending',
          aml_status = 'review',
          client_status = 'review',
          updated_at = now()
      where id = new.client_id;
    elsif new.kyb_status = 'rejected' then
      update public.corporate_clients
      set kyc_status = 'review',
          aml_status = 'review',
          client_status = 'hold',
          updated_at = now()
      where id = new.client_id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_corporate_onboarding_decision() from public, anon, authenticated;

drop trigger if exists corporate_onboarding_sync_client_status on public.corporate_client_onboarding;
create trigger corporate_onboarding_sync_client_status
after update of kyb_status on public.corporate_client_onboarding
for each row execute function private.sync_corporate_onboarding_decision();

-- Registration-created records always await KYB review; they are never
-- represented as an operationally active counterparty before approval.
update public.corporate_clients c
set client_status = case o.kyb_status
  when 'approved' then 'active'
  when 'rejected' then 'hold'
  else 'review'
end,
kyc_status = case o.kyb_status
  when 'approved' then 'verified'::public.screening_status
  when 'rejected' then 'review'::public.screening_status
  else 'pending'::public.screening_status
end,
aml_status = case o.kyb_status
  when 'approved' then 'clear'::public.screening_status
  else 'review'::public.screening_status
end,
updated_at = now()
from public.corporate_client_onboarding o
where c.id = o.client_id;

commit;
