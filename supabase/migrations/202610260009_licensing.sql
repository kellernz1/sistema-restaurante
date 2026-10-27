begin;
create extension if not exists pgsodium;
create table public.license_installation(
 id boolean primary key default true check(id),installation_id uuid not null unique default gen_random_uuid(),
 public_key bytea check(octet_length(public_key)=32),max_sequence bigint not null default 0,
 max_seen_at timestamptz not null default clock_timestamp(),backup_seen_at timestamptz,
 boundary_day date not null,restricted boolean not null default false,last_state text not null default 'grace',
 clock_suspect boolean not null default false,clock_deadline timestamptz,clock_ack_until timestamptz,
 renewal_url text,renewal_interval_days integer not null default 7 check(renewal_interval_days between 1 and 7),
 last_online_at timestamptz,last_attempt_at timestamptz,next_attempt_at timestamptz,renewal_nonce uuid,renewal_lease_until timestamptz
);
insert into public.license_installation(boundary_day)select public.business_day_for(clock_timestamp(),business_timezone,business_day_start)from public.restaurant_settings where id;
create table public.license_current(id boolean primary key default true check(id),token text not null,claims jsonb not null,imported_at timestamptz not null default clock_timestamp());
create table public.license_continuations(backend_id integer not null,transaction_id bigint not null,table_id uuid not null,primary key(backend_id,transaction_id));
alter table public.license_installation enable row level security;
alter table public.license_current enable row level security;
alter table public.license_continuations enable row level security;
revoke all on public.license_installation,public.license_current,public.license_continuations from public,anon,authenticated,service_role;

create function public.license_decode64(p_value text)returns bytea language sql immutable strict set search_path=''as $$
 select decode(translate(p_value,'-_','+/')||repeat('=',(4-length(p_value)%4)%4),'base64');
$$;
create function public.license_verify(p_token text)returns jsonb language plpgsql security definer set search_path=''as $$
declare parts text[];claims jsonb;key bytea;issued timestamptz;expires timestamptz;grace timestamptz;
begin
 if p_token is null or length(p_token)>12000 or p_token!~'^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'then raise exception 'Invalid license envelope'using errcode='22023';end if;
 parts:=string_to_array(p_token,'.');select public_key into key from public.license_installation where id;
 if key is null or octet_length(public.license_decode64(parts[2]))<>64 or not pgsodium.crypto_sign_verify_detached(public.license_decode64(parts[2]),convert_to('MesaCertaLicense/v1.'||parts[1],'UTF8'),key)then raise exception 'Invalid license signature or trust key'using errcode='22023';end if;
 claims:=convert_from(public.license_decode64(parts[1]),'UTF8')::jsonb;
 if jsonb_typeof(claims)<>'object'or claims-'v'-'license_id'-'installation_id'-'restaurant'-'plan'-'features'-'sequence'-'issued_at'-'expires_at'-'grace_until'-'suspended'-'online_nonce'<>'{}'or claims->>'v'<>'1'then raise exception 'Invalid license version'using errcode='22023';end if;
 if(claims->>'installation_id')::uuid is distinct from(select installation_id from public.license_installation where id)or(claims->>'license_id')::uuid is null then raise exception 'License installation mismatch'using errcode='22023';end if;
 if length(coalesce(claims->>'restaurant',''))not between 1 and 160 or coalesce(claims->>'plan','')!~'^[a-z][a-z0-9_-]{1,31}$'or coalesce(claims->>'sequence','')!~'^[1-9][0-9]{0,14}$'or jsonb_typeof(claims->'features')is distinct from 'array'or jsonb_array_length(claims->'features')>64 or exists(select 1 from jsonb_array_elements_text(claims->'features')f where f!~'^[a-z][a-z_]{1,31}$')or jsonb_typeof(claims->'suspended')is distinct from 'boolean'then raise exception 'Invalid license claims'using errcode='22023';end if;
 if coalesce(claims->>'issued_at','')!~'^\d{4}-\d{2}-\d{2}T' or coalesce(claims->>'expires_at','')!~'^\d{4}-\d{2}-\d{2}T'or coalesce(claims->>'grace_until','')!~'^\d{4}-\d{2}-\d{2}T'then raise exception 'License timestamps required'using errcode='22023';end if;
 issued:=(claims->>'issued_at')::timestamptz;expires:=(claims->>'expires_at')::timestamptz;grace:=(claims->>'grace_until')::timestamptz;
 if not isfinite(issued)or not isfinite(expires)or not isfinite(grace)or expires>issued+interval '31 days'or grace<expires or grace>expires+interval '31 days'then raise exception 'License exceeds monthly validity or grace bound'using errcode='22023';end if;
 return claims;
end $$;

-- Read-only enforcement avoids adding a global write lock to each ordering transaction.
create function public.license_snapshot(p_boundary boolean default false)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare s public.license_installation;c jsonb;settings public.restaurant_settings;wall timestamptz:=statement_timestamp();effective timestamptz;day date;
 expires timestamptz;grace timestamptz;deadline timestamptz;bad boolean;desired boolean;restricted boolean;boundary boolean;state text;remaining integer;allowed boolean;
begin
 select *into s from public.license_installation where id;select claims into c from public.license_current where id;select *into settings from public.restaurant_settings where id;
 effective:=greatest(wall,s.max_seen_at,s.backup_seen_at,(select max(created_at)from public.orders),(select max(created_at)from public.payments),(select max(last_seen_at)from public.print_worker_heartbeats),(c->>'issued_at')::timestamptz,s.last_online_at);
 expires:=(c->>'expires_at')::timestamptz;grace:=(c->>'grace_until')::timestamptz;
 bad:=wall<effective-interval '2 minutes';deadline:=s.clock_deadline;
 if bad and deadline is null and(not s.clock_suspect or s.clock_ack_until is null or effective>s.clock_ack_until)then deadline:=coalesce(expires,effective);end if;
 day:=public.business_day_for(effective,settings.business_timezone,settings.business_day_start);
 boundary:=p_boundary or day>s.boundary_day or not exists(select 1 from public.cash_sessions where status='open');
 desired:=c is null or coalesce((c->>'suspended')::boolean,false)or effective>grace or(deadline is not null and effective>deadline);
 restricted:=desired and(s.restricted or boundary);
 remaining:=case when expires is null then null else ceil(extract(epoch from(expires-effective))/86400)::integer end;
 state:=case when restricted then 'restricted'when desired or effective>expires then 'grace'when remaining<=7 then 'expiring'else 'active'end;
 allowed:=not restricted;
 return jsonb_build_object('installation_id',s.installation_id,'state',state,'plan',c->>'plan','restaurant',c->>'restaurant','license_id',c->>'license_id','sequence',s.max_sequence,'expires_at',expires,'grace_until',grace,'days_remaining',remaining,'warning_days',case when remaining<=3 then 3 when remaining<=7 then 7 else null end,'last_online_at',s.last_online_at,'last_attempt_at',s.last_attempt_at,'key_configured',s.public_key is not null,'pending_restriction',desired and not restricted,'clock_suspect',bad,'requires_online',deadline is not null,'clock_deadline',deadline,'effective_time',effective,'business_day',day,'orders_enabled',allowed,'delivery_enabled',allowed and(c is null or(c->'features'?'delivery')),'whatsapp_enabled',allowed and(c is null or(c->'features'?'whatsapp')),'features',coalesce(c->'features','[]'));
end $$;

create function public.license_refresh(p_boundary boolean default false)returns jsonb language plpgsql security definer set search_path=''as $$
declare s public.license_installation;v jsonb;
begin
 select *into s from public.license_installation where id for update;v:=public.license_snapshot(p_boundary);
 if v->>'state'<>s.last_state then perform public.append_audit('license_state_changed','installation',s.installation_id,0,jsonb_build_object('state',s.last_state),jsonb_build_object('state',v->>'state','pending',v->'pending_restriction'));end if;
 if(v->>'clock_suspect')::boolean and not s.clock_suspect then perform public.append_audit('license_clock_suspect','installation',s.installation_id,0,'{}',jsonb_build_object('online_required',true));end if;
 update public.license_installation set max_seen_at=greatest(max_seen_at,(v->>'effective_time')::timestamptz),restricted=v->>'state'='restricted',last_state=v->>'state',clock_suspect=(v->>'clock_suspect')::boolean,clock_deadline=(v->>'clock_deadline')::timestamptz,boundary_day=case when p_boundary or(v->>'business_day')::date>boundary_day then(v->>'business_day')::date else boundary_day end where id;
 return v;
end $$;

create function public.license_apply(p_token text,p_online boolean default false)returns jsonb language plpgsql security definer set search_path=''as $$
declare s public.license_installation;c jsonb;prior public.license_current;
begin
 select *into s from public.license_installation where id for update;c:=public.license_verify(p_token);select *into prior from public.license_current where id;
 if prior.token=p_token then return public.license_snapshot();end if;
 if(c->>'sequence')::bigint<=s.max_sequence or(prior.id and(c->>'issued_at')::timestamptz<(prior.claims->>'issued_at')::timestamptz)then raise exception 'Older license rejected'using errcode='22023';end if;
 if prior.id and c->>'license_id'<>prior.claims->>'license_id'then raise exception 'License identity cannot change'using errcode='22023';end if;
 insert into public.license_current(token,claims)values(p_token,c)on conflict(id)do update set token=excluded.token,claims=excluded.claims,imported_at=clock_timestamp();
 update public.license_installation set max_sequence=(c->>'sequence')::bigint,max_seen_at=greatest(max_seen_at,(c->>'issued_at')::timestamptz),last_online_at=case when p_online then(c->>'issued_at')::timestamptz else last_online_at end,clock_deadline=case when p_online then null else clock_deadline end,clock_ack_until=case when p_online then(c->>'expires_at')::timestamptz else clock_ack_until end where id;
 perform public.append_audit(case when p_online then 'license_renewed'else 'license_imported'end,'installation',s.installation_id,0,jsonb_build_object('sequence',s.max_sequence),jsonb_build_object('sequence',c->'sequence','plan',c->>'plan','expires_at',c->>'expires_at'));
 return public.license_refresh();
end $$;
create function public.license_import(p_token text)returns jsonb language plpgsql security definer set search_path=''as $$
begin if public.current_user_role()is distinct from 'admin'then raise exception 'Admin required'using errcode='42501';end if;return public.license_apply(p_token,false);end $$;
create function public.license_status()returns jsonb language plpgsql security definer set search_path=''as $$
declare v jsonb;begin
 if coalesce(public.current_user_role()::text,'')not in('admin','cashier')and coalesce(auth.role(),'')<>'service_role'then raise exception 'License status access denied'using errcode='42501';end if;
 v:=public.license_snapshot();if public.current_user_role()='admin'then v:=v||(select jsonb_build_object('renewal_url',renewal_url,'renewal_interval_days',renewal_interval_days)from public.license_installation where id);end if;return v;
end $$;
create function public.license_public_status()returns jsonb language sql security definer set search_path=''as $$
 select jsonb_build_object('orders_enabled',v->'orders_enabled','delivery_enabled',v->'delivery_enabled','whatsapp_enabled',v->'whatsapp_enabled')from(select public.license_snapshot()v)s;
$$;
create function public.license_configure(p_url text default null,p_days integer default 7)returns jsonb language plpgsql security definer set search_path=''as $$
begin
 if public.current_user_role()is distinct from 'admin'then raise exception 'Admin required'using errcode='42501';end if;
 if p_days not between 1 and 7 or length(coalesce(p_url,''))>500 or(p_url is not null and p_url!~'^https://[^/@#?[:space:]]+(/[^#?[:space:]]*)?$'and p_url!~'^http://(127\.0\.0\.1|localhost):[0-9]+(/[^#?[:space:]]*)?$')then raise exception 'Invalid licensing URL or interval'using errcode='22023';end if;
 update public.license_installation set renewal_url=p_url,renewal_interval_days=p_days,next_attempt_at=null where id;
 return public.license_status();
end $$;
create function public.license_set_public_key(p_hex text)returns void language plpgsql security definer set search_path=''as $$
declare s public.license_installation;begin
 if coalesce(auth.role(),'')<>'service_role'and not public.owner_maintenance()then raise exception 'Service required'using errcode='42501';end if;
 if p_hex!~'^[0-9a-fA-F]{64}$'then raise exception 'Ed25519 public key required'using errcode='22023';end if;
 select *into s from public.license_installation where id for update;
 if s.public_key is not null and s.public_key<>decode(p_hex,'hex')then raise exception 'Trust key rotation requires owner maintenance'using errcode='22023';end if;
 update public.license_installation set public_key=decode(p_hex,'hex')where id;
end $$;
create function public.license_tick(p_backup_at timestamptz default null)returns jsonb language plpgsql security definer set search_path=''as $$
begin
 if coalesce(auth.role(),'')<>'service_role'and not public.owner_maintenance()then raise exception 'Service required'using errcode='42501';end if;
 if p_backup_at is not null then update public.license_installation set backup_seen_at=greatest(backup_seen_at,p_backup_at)where id;end if;
 return public.license_refresh();
end $$;

create function public.license_renewal_claim(p_force boolean default false)returns jsonb language plpgsql security definer set search_path=''as $$
declare s public.license_installation;v jsonb;nonce uuid:=gen_random_uuid();moment timestamptz;token text;begin
 if coalesce(auth.role(),'')<>'service_role'then raise exception 'Service required'using errcode='42501';end if;
 perform public.license_refresh();select *into s from public.license_installation where id for update;select license_current.token into token from public.license_current where id;
 moment:=(public.license_snapshot()->>'effective_time')::timestamptz;
 if s.renewal_url is null or token is null or(not p_force and s.clock_deadline is null and(s.renewal_lease_until>moment or s.next_attempt_at>moment))then return null;end if;
 update public.license_installation set renewal_nonce=nonce,renewal_lease_until=moment+interval '60 seconds',last_attempt_at=moment,next_attempt_at=moment+interval '1 hour'where id;
 v:=jsonb_build_object('nonce',nonce,'url',s.renewal_url,'installation_id',s.installation_id,'license',token);return v;
end $$;
create function public.license_renewal_finish(p_nonce uuid,p_token text default null,p_error text default null)returns jsonb language plpgsql security definer set search_path=''as $$
declare s public.license_installation;c jsonb;v jsonb;begin
 if coalesce(auth.role(),'')<>'service_role'then raise exception 'Service required'using errcode='42501';end if;
 select *into s from public.license_installation where id for update;
 if p_token is not null and exists(select 1 from public.license_current where token=p_token and claims->>'online_nonce'=p_nonce::text)then return public.license_snapshot();end if;
 if s.renewal_nonce is distinct from p_nonce then raise exception 'Renewal claim changed'using errcode='22023';end if;
 if p_token is not null then
  c:=public.license_verify(p_token);if c->>'online_nonce'is distinct from p_nonce::text then raise exception 'Online proof nonce mismatch'using errcode='22023';end if;
  v:=public.license_apply(p_token,true);
  update public.license_installation set next_attempt_at=(v->>'effective_time')::timestamptz+make_interval(days=>renewal_interval_days)where id;
 else perform public.append_audit('license_renewal_failed','installation',s.installation_id,0,'{}',jsonb_build_object('code',left(coalesce(p_error,'unavailable'),80)));v:=public.license_refresh();end if;
 update public.license_installation set renewal_nonce=null,renewal_lease_until=null where id;return v;
end $$;

revoke all on function public.license_decode64(text),public.license_verify(text),public.license_snapshot(boolean),public.license_refresh(boolean),public.license_apply(text,boolean),public.license_import(text),public.license_status(),public.license_public_status(),public.license_configure(text,integer),public.license_set_public_key(text),public.license_tick(timestamptz),public.license_renewal_claim(boolean),public.license_renewal_finish(uuid,text,text)from public,anon,authenticated,service_role;
grant execute on function public.license_import(text),public.license_status(),public.license_configure(text,integer)to authenticated;
grant execute on function public.license_status(),public.license_public_status(),public.license_set_public_key(text),public.license_tick(timestamptz),public.license_renewal_claim(boolean),public.license_renewal_finish(uuid,text,text)to service_role;
commit;
