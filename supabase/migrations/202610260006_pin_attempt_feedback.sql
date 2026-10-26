begin;
-- Failure metadata is computed under the same PIN row lock as the attempt counter.
create or replace function public.issue_operation_approval(p_request_id uuid,p_approver uuid,p_pin text,p_quote jsonb,p_binding text) returns jsonb language plpgsql security definer set search_path='' as $$
declare quote jsonb;pin public.approver_pins;policy public.approval_policy;prior public.approval_attempts;authorization_id uuid;result jsonb;blocked boolean;eligible boolean;
begin
 quote:=p_quote;
 if p_request_id is null or quote->>'binding' is distinct from p_binding then raise exception 'Stale operation' using errcode='23514';end if;
 if p_approver=auth.uid() then raise exception 'Self approval is forbidden; approvers use their own authority' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,7128));
 select * into prior from public.approval_attempts where request_id=p_request_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.approver_id is distinct from p_approver or prior.binding<>p_binding then raise exception 'Approval request key changed' using errcode='22023';end if;
  return prior.result;
 end if;
 if not public.approval_budget() then return jsonb_build_object('ok',false,'code','limited','retry_after_seconds',(select greatest(1,ceil(extract(epoch from (window_start+interval '1 minute'-clock_timestamp()))))::integer from public.approval_actor_limits where actor_id=auth.uid()));end if;
 select * into policy from public.approval_policy where id;
 perform 1 from public.profiles where id=p_approver and is_active and role in ('admin','supervisor') for share;
 eligible:=found;
 select * into pin from public.approver_pins where user_id=p_approver for update;
 if not eligible or pin.user_id is null then perform public.append_audit('pin_failed','profile',p_approver,0,'{}','{}');result:=jsonb_build_object('ok',false,'code','unavailable');
 elsif pin.blocked_until>clock_timestamp() then
  perform public.append_audit('pin_blocked_attempt','profile',p_approver,0,'{}','{}');result:=jsonb_build_object('ok',false,'code','locked','attempts_remaining',0,'blocked_until',pin.blocked_until,'retry_after_seconds',greatest(1,ceil(extract(epoch from(pin.blocked_until-clock_timestamp()))))::integer);
 elsif p_pin is null or p_pin!~'^[0-9]{4,6}$' or extensions.crypt(p_pin,pin.pin_hash) is distinct from pin.pin_hash then
  if pin.blocked_until is not null then pin.failures:=0;end if;
  pin.failures:=pin.failures+1;blocked:=pin.failures>=policy.pin_failures;
  update public.approver_pins set failures=pin.failures,blocked_until=case when blocked then clock_timestamp()+make_interval(mins=>policy.pin_lock_minutes) else null end where user_id=p_approver returning * into pin;
  perform public.append_audit('pin_failed','profile',p_approver,0,'{}',jsonb_build_object('failures',pin.failures));
  if blocked then perform public.append_audit('pin_locked','profile',p_approver,0,'{}',jsonb_build_object('minutes',policy.pin_lock_minutes));end if;
  result:=jsonb_build_object('ok',false,'code',case when blocked then 'locked' else 'pin' end,'attempts_remaining',greatest(0,policy.pin_failures-pin.failures),'blocked_until',pin.blocked_until,'retry_after_seconds',case when blocked then greatest(1,ceil(extract(epoch from(pin.blocked_until-clock_timestamp()))))::integer else null end);
 else
  update public.approver_pins set failures=0,blocked_until=null where user_id=p_approver;
  insert into public.operation_authorizations(actor_id,approver_id,pin_version,binding,expires_at,request_id) values(auth.uid(),p_approver,pin.version,p_binding,clock_timestamp()+make_interval(secs=>policy.authorization_seconds),p_request_id) returning id into authorization_id;
  perform public.append_audit('approval_granted',case when quote->'operation'->>'action'='counter_discount' then 'counter_draft' else 'order' end,coalesce(quote->'operation'->>'order_id',quote->'operation'->>'target')::uuid,(quote->'operation'->>'amount')::bigint,jsonb_build_object('action',quote->'operation'->>'action'),'{}',quote->'operation'->>'reason',p_approver);
  result:=jsonb_build_object('ok',true,'authorization',authorization_id,'expires_seconds',policy.authorization_seconds);
 end if;
 insert into public.approval_attempts(request_id,actor_id,approver_id,binding,result) values(p_request_id,auth.uid(),p_approver,p_binding,result);
 return result;
end $$;

revoke all on function public.issue_operation_approval(uuid,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
commit;
