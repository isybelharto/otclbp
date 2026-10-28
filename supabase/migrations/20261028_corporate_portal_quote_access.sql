-- Permit an active Corporate Client to view currently available Partner Desk
-- listings and the corresponding quote feed. Management and partner policies
-- remain in place; this adds the client-facing read path only.
begin;

drop policy if exists corporate_clients_read_partner_desks on public.partner_desks;
create policy corporate_clients_read_partner_desks
on public.partner_desks
for select
to authenticated
using (
  status = 'active'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'corporate_client'
      and p.is_active
  )
);

drop policy if exists corporate_clients_read_partner_quotes on public.partner_desk_quotes;
create policy corporate_clients_read_partner_quotes
on public.partner_desk_quotes
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'corporate_client'
      and p.is_active
  )
);

commit;
