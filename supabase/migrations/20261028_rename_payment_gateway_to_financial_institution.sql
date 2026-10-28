begin;

alter table public.corporate_clients drop constraint if exists corporate_clients_tier_check;
update public.corporate_clients
set tier = 'Financial Institution'
where tier = 'Payment Gateway';
alter table public.corporate_clients add constraint corporate_clients_tier_check
check (tier in ('Corporate', 'Institutional Fund', 'Financial Institution'));

create or replace function private.bootstrap_corporate_client_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
 insert into public.corporate_client_onboarding(client_id,user_id,company_email,phone)
 values(v_client,new.id,lower(new.email),nullif(btrim(new.raw_user_meta_data->>'phone'),''));
 return new;
end;
$$;
revoke all on function private.bootstrap_corporate_client_signup() from public, anon, authenticated;

commit;
