begin;
create function public.review_print_job(p_job_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.print_jobs;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','kitchen','cashier') then raise exception 'Staff print access required' using errcode='42501'; end if;
 perform 1 from public.print_processor_lease where id for update;
 select * into j from public.print_jobs where id=p_job_id for update;
 if not found or j.status not in ('failed','uncertain') then raise exception 'Job is not awaiting review' using errcode='23514'; end if;
 if exists(select 1 from public.print_processor_lease where id and owner_id=j.owner_id and expires_at>now()) then raise exception 'Transport may still be active' using errcode='23514'; end if;
 update public.print_jobs set reviewed_at=coalesce(reviewed_at,now()) where id=j.id;
end $$;
revoke all on function public.review_print_job(uuid) from public,anon;
grant execute on function public.review_print_job(uuid) to authenticated;
commit;
