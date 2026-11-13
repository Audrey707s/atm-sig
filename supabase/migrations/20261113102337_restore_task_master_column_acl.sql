begin;
-- Restore the editable category columns already declared by migration 033.
-- Existing scoped RLS and category guards remain authoritative.
grant update (org_unit_id,name,is_active) on public.task_categories to authenticated;
notify pgrst,'reload schema';
commit;
