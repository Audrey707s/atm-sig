begin;
-- Distinct revisions keep independent progress; at most one active run per owner/revision.
drop index public.atm_eval_one_active;
create unique index atm_eval_one_active on public.atm_eval_runs(user_id,revision)
 where status in ('queued','running','waiting');
-- Rollback: pause the recheck first, then restore the former user_id-only index.
commit;
