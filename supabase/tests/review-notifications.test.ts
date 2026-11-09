import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

it('notifies only the assigned reviewer on submission and only the PIC on a review decision', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create schema auth;
      create role anon; create role authenticated; create role service_role;
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;
      create table public.users(id uuid primary key, status text);
      create table public.tasks(id uuid primary key, owner_id uuid, reviewer_id uuid, title text, status text);
      create table public.notifications(id uuid default gen_random_uuid(), user_id uuid,task_id uuid,type text,title text,body text);
      insert into public.users select ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,'aktif' from generate_series(1,6) n;
    `)
    const reviewerMigration = await readFile(resolve('supabase/migrations/20261103113000_notify_only_assigned_reviewer_for_task_events.sql'), 'utf8')
    await db.exec(reviewerMigration)
    const { readdir } = await import('node:fs/promises')
    const migration = (await readdir(resolve('supabase/migrations'))).find(n => n.endsWith('_assigned_reviewer_status_notifications.sql'))!
    await db.exec(await readFile(resolve('supabase/migrations', migration), 'utf8'))
    const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
    await db.query('insert into public.tasks values($1,$2,$3,$4,$5)', [id(10), id(2), id(3), 'Review fixture', 'In progress'])
    await db.exec(`update public.tasks set status='Review'; update public.tasks set title='Updated title'; update public.tasks set status='Review';`)
    expect((await db.query('select user_id,type from public.notifications')).rows).toEqual([{ user_id: id(3), type: 'task_review_requested' }])
    await db.exec(`update public.tasks set status='Revisi';`)
    expect((await db.query("select user_id from public.notifications where type='task_review_decision'")).rows).toEqual([{ user_id: id(2) }])
    await db.exec(`update public.tasks set status='In progress'; update public.tasks set status='Review';`)
    expect((await db.query("select count(*)::int n from public.notifications where type='task_review_requested'")).rows).toEqual([{ n: 2 }])
    await db.exec(`delete from public.notifications; update public.users set status='nonaktif' where id='${id(3)}'; update public.tasks set status='In progress'; update public.tasks set status='Review';`)
    expect((await db.query('select * from public.notifications')).rows).toEqual([])
    await db.exec(`update public.tasks set status='In progress',reviewer_id=null; update public.tasks set status='Review';`)
    expect((await db.query('select * from public.notifications')).rows).toEqual([])
    expect((await db.query("select has_function_privilege('authenticated','public.notify_task_review_status()','execute') allowed")).rows).toEqual([{ allowed: false }])
  } finally { await db.close() }
}, 30000)
