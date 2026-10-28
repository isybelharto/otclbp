-- Disposable fixtures; all test users and data are rolled back.
begin;

do $test$
declare v_a uuid:=gen_random_uuid(); v_b uuid:=gen_random_uuid(); v_m uuid:=gen_random_uuid();
begin
 perform set_config('lbp.test_a',v_a::text,true); perform set_config('lbp.test_b',v_b::text,true); perform set_config('lbp.test_m',v_m::text,true);
 insert into auth.users(id,email,raw_user_meta_data) values
 (v_a,'onboarding-a-'||v_a||'@lbp-fixture.example',jsonb_build_object('registration_type','corporate_client','company_name','Rollback Fixture A','contact_name','Fixture A','tier','Corporate')),
 (v_b,'onboarding-b-'||v_b||'@lbp-fixture.example',jsonb_build_object('registration_type','corporate_client','company_name','Rollback Fixture B','contact_name','Fixture B','tier','Corporate')),
 (v_m,'onboarding-m-'||v_m||'@lbp-fixture.example','{}'::jsonb);
 insert into public.profiles(id,full_name,role,is_active) values(v_m,'Rollback reviewer','management',true);
 if (select count(*) from public.corporate_client_onboarding where user_id in(v_a,v_b))<>2 then raise exception 'Signup bootstrap test failed'; end if;
end $test$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('lbp.test_a'),'role','authenticated')::text,true);
do $test$
begin
 if (select count(*) from public.corporate_client_onboarding)<>1 then raise exception 'Client isolation failed'; end if;
 update public.corporate_client_onboarding set registered_address='Fixture address' where user_id=auth.uid();
 if not found then raise exception 'Own update failed'; end if;
 begin
   update public.corporate_client_onboarding set kyb_status='approved' where user_id=auth.uid();
   raise exception 'Unexpected self approval success';
 exception when raise_exception then
   if sqlerrm<>'KYB decisions require Management or Compliance review' then raise; end if;
 end;
 begin
   update public.corporate_client_onboarding set kyb_status='submitted' where user_id=auth.uid();
   raise exception 'Unexpected incomplete submission success';
 exception when raise_exception then
   if sqlerrm<>'Accept the declaration before submitting KYB' then raise; end if;
 end;
end $test$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('lbp.test_m'),'role','authenticated')::text,true);
do $test$
begin
 if (select count(*) from public.corporate_client_onboarding where user_id in(current_setting('lbp.test_a')::uuid,current_setting('lbp.test_b')::uuid))<>2 then raise exception 'Reviewer visibility failed'; end if;
 update public.corporate_client_onboarding set kyb_status='review' where user_id=current_setting('lbp.test_a')::uuid;
 if not found then raise exception 'Reviewer update failed'; end if;
end $test$;
reset role;
select 'PASS: signup bootstrap, tenant isolation, owner editing, self-approval denied, incomplete submission denied, reviewer visibility and update' as verification;
rollback;
