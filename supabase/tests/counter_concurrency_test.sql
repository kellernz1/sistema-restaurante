-- The local runner starts two simultaneous psql transactions and passes results.
begin;
create temporary table counter_concurrency_results(ticket integer) on commit drop;
insert into counter_concurrency_results values (:'first_ticket'::integer),(:'second_ticket'::integer);
do $$ begin
 if (select count(distinct ticket) from counter_concurrency_results)<>2 or (select min(ticket) from counter_concurrency_results)<>1 or (select max(ticket) from counter_concurrency_results)<>2 then raise exception 'Concurrent ticket allocation failed'; end if;
 if not exists(select 1 from public.counter_daily_numbers where business_date='9997-12-31' and last_ticket=2) then raise exception 'Allocator committed unexpected state'; end if;
end $$;
delete from public.counter_daily_numbers where business_date='9997-12-31';
commit;
