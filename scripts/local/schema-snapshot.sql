set search_path=pg_catalog,public,extensions;
with
relations as (
 select c.oid,c.relname,c.relkind,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.relreplident,c.reloptions,c.relpersistence
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')
),
functions as (
 select p.*,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname='public'
),
entries as (
 select 'schemas' category,nspname key,jsonb_build_object('owner',pg_get_userbyid(nspowner)) value from pg_namespace where nspname='public'
 union all
 select 'relations',relname,jsonb_build_object('kind',relkind,'owner',pg_get_userbyid(relowner),'rls',relrowsecurity,'force_rls',relforcerowsecurity,'identity',relreplident,'options',reloptions,'persistence',relpersistence) from relations
 union all
 select 'columns',r.relname||'.'||a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'collation',case when a.attcollation=0 then null else a.attcollation::regcollation::text end)
 from relations r join pg_attribute a on a.attrelid=r.oid left join pg_attrdef d on d.adrelid=r.oid and d.adnum=a.attnum where a.attnum>0 and not a.attisdropped
 union all
 select 'constraints',r.relname||':'||pg_get_constraintdef(c.oid,true),jsonb_build_object('table',r.relname,'definition',pg_get_constraintdef(c.oid,true),'validated',c.convalidated,'deferrable',c.condeferrable,'deferred',c.condeferred,'type',c.contype)
 from pg_constraint c join relations r on r.oid=c.conrelid
 union all
 select 'indexes',r.relname||':'||regexp_replace(pg_get_indexdef(i.indexrelid),'^(CREATE (UNIQUE )?INDEX) [^ ]+ ','\1 <index> '),jsonb_build_object('definition',regexp_replace(pg_get_indexdef(i.indexrelid),'^(CREATE (UNIQUE )?INDEX) [^ ]+ ','\1 <index> '),'primary',i.indisprimary,'valid',i.indisvalid,'ready',i.indisready,'replica_identity',i.indisreplident)
 from pg_index i join relations r on r.oid=i.indrelid
 union all
 select 'types',t.typname,jsonb_build_object('type',t.typtype,'owner',pg_get_userbyid(t.typowner),'base',format_type(t.typbasetype,t.typtypmod),'not_null',t.typnotnull,'default',t.typdefault,'labels',(select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid))
 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype in ('e','d')
 union all
 select 'functions',format('%I(%s)',proname,pg_get_function_identity_arguments(oid)),jsonb_build_object('definition',replace(pg_get_functiondef(oid),E'\r\n',E'\n'),'owner',pg_get_userbyid(proowner),'kind',prokind,'language',lanname,'security_definer',prosecdef,'strict',proisstrict,'volatility',provolatile,'parallel',proparallel,'leakproof',proleakproof,'settings',proconfig)
 from functions where prokind<>'a'
 union all
 select 'triggers',n.nspname||'.'||c.relname||':'||t.tgname,jsonb_build_object('definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace where not t.tgisinternal and (n.nspname='public' or pn.nspname='public')
 union all
 select 'policies',tablename||':'||policyname,jsonb_build_object('table',tablename,'command',cmd,'permissive',permissive,'roles',(select jsonb_agg(role order by role) from unnest(roles) role),'using',qual,'check',with_check)
 from pg_policies where schemaname='public'
 union all
 select 'relation_grants',r.relname||':'||coalesce(grantee.rolname,'PUBLIC')||':'||grantor.rolname||':'||acl.privilege_type,jsonb_build_object('grantable',acl.is_grantable)
 from relations r cross join lateral aclexplode(coalesce(r.relacl,acldefault(case when r.relkind='S' then 'S'::"char" else 'r'::"char" end,r.relowner))) acl left join pg_roles grantee on grantee.oid=acl.grantee join pg_roles grantor on grantor.oid=acl.grantor
 union all
 select 'column_grants',r.relname||'.'||a.attname||':'||coalesce(grantee.rolname,'PUBLIC')||':'||grantor.rolname||':'||acl.privilege_type,jsonb_build_object('grantable',acl.is_grantable)
 from relations r join pg_attribute a on a.attrelid=r.oid cross join lateral aclexplode(a.attacl) acl left join pg_roles grantee on grantee.oid=acl.grantee join pg_roles grantor on grantor.oid=acl.grantor where a.attnum>0 and not a.attisdropped
 union all
 select 'function_grants',format('%I(%s)',p.proname,pg_get_function_identity_arguments(p.oid))||':'||coalesce(grantee.rolname,'PUBLIC')||':'||grantor.rolname||':'||acl.privilege_type,jsonb_build_object('grantable',acl.is_grantable)
 from functions p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl left join pg_roles grantee on grantee.oid=acl.grantee join pg_roles grantor on grantor.oid=acl.grantor
 union all
 select 'default_grants',pg_get_userbyid(d.defaclrole)||':'||d.defaclobjtype::text||':'||coalesce(grantee.rolname,'PUBLIC')||':'||grantor.rolname||':'||acl.privilege_type,jsonb_build_object('grantable',acl.is_grantable)
 from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace cross join lateral aclexplode(d.defaclacl) acl left join pg_roles grantee on grantee.oid=acl.grantee join pg_roles grantor on grantor.oid=acl.grantor where n.nspname='public'
 union all
 select 'schema_grants',n.nspname||':'||coalesce(grantee.rolname,'PUBLIC')||':'||grantor.rolname||':'||acl.privilege_type,jsonb_build_object('grantable',acl.is_grantable)
 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) acl left join pg_roles grantee on grantee.oid=acl.grantee join pg_roles grantor on grantor.oid=acl.grantor where n.nspname='public'
 union all
 select 'type_grants',t.typname||':'||coalesce(grantee.rolname,'PUBLIC')||':'||grantor.rolname||':'||acl.privilege_type,jsonb_build_object('grantable',acl.is_grantable)
 from pg_type t join pg_namespace n on n.oid=t.typnamespace cross join lateral aclexplode(coalesce(t.typacl,acldefault('T',t.typowner))) acl left join pg_roles grantee on grantee.oid=acl.grantee join pg_roles grantor on grantor.oid=acl.grantor where n.nspname='public' and t.typtype in ('e','d')
 union all
 select 'sequences',r.relname,jsonb_build_object('type',format_type(s.seqtypid,null),'start',s.seqstart,'increment',s.seqincrement,'min',s.seqmin,'max',s.seqmax,'cache',s.seqcache,'cycle',s.seqcycle) from pg_sequence s join relations r on r.oid=s.seqrelid
 union all
 select 'views',r.relname,jsonb_build_object('definition',pg_get_viewdef(r.oid,true)) from relations r where r.relkind in ('v','m')
 union all
 select 'realtime',p.pubname||':'||t.schemaname||'.'||t.tablename,jsonb_build_object('insert',p.pubinsert,'update',p.pubupdate,'delete',p.pubdelete,'truncate',p.pubtruncate) from pg_publication p join pg_publication_tables t on t.pubname=p.pubname where t.schemaname='public'
)
select coalesce(jsonb_agg(jsonb_build_object('category',category,'key',key,'value',value) order by category,key,value::text),'[]') from entries;
