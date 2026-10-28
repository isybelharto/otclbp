-- Edge Functions use the service role for database writes. In that context
-- auth.uid() is null, even when a Management user initiated the request.
-- Retain the Management reviewer already stored on the request as the audit actor.

begin;

create or replace function private.sync_partner_access_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' then
    update public.profiles set role = 'partner', is_active = true,
      partner_id = new.assigned_partner_id, updated_at = now() where id = new.user_id;
  elsif new.status in ('pending', 'rejected') then
    update public.profiles set role = 'partner', is_active = false,
      partner_id = null, updated_at = now() where id = new.user_id;
  end if;

  if new.status is distinct from old.status then
    insert into public.audit_events (actor_id, actor_role, action, entity_type, entity_id, old_value, new_value)
    values (
      coalesce((select auth.uid()), new.reviewed_by),
      'management',
      upper(new.status) || '_PARTNER_ACCESS',
      'partner_access_request',
      new.id::text,
      jsonb_build_object('status', old.status, 'assigned_partner_id', old.assigned_partner_id),
      jsonb_build_object('status', new.status, 'assigned_partner_id', new.assigned_partner_id, 'review_note', new.review_note)
    );
  end if;
  return new;
end;
$$;

commit;
