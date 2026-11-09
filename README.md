# Accounting Task Manager

A Next.js application for managing accounting tasks with Supabase Auth and PostgreSQL.

## Requirements

- Node.js 20 or newer
- npm
- A Supabase project with the SQL migrations in `supabase/migrations/` applied in order

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and set the Supabase URL and anon key.
   Set `NEXT_PUBLIC_APP_URL` to the local application URL (normally
   `http://localhost:3000`) and add its `/auth/confirm` URL to the Supabase Auth
   redirect URL allow-list.
3. For user invitations and account activation/deactivation, set
   `SUPABASE_SERVICE_ROLE_KEY` as a server-only secret. Never use a
   `NEXT_PUBLIC_` prefix, expose it in client code, log it, or commit its value.
4. For reminder email escalation, configure the server-only `RESEND_API_KEY`
   and `RESEND_FROM_EMAIL`; the sender domain must be verified in Resend. Email
   is sent only after an in-app reminder has remained unanswered for 72 hours.
5. Apply all SQL files in `supabase/migrations/` to the Supabase project in
   filename order. The seed data for roles and organizational units is included
   in the initial migration.
6. Set `CRON_SECRET` to a random server-only value in `.env.local` and in the
   application deployment environment. Enable Supabase's `pg_cron`, `pg_net`,
   and Vault extensions, then store the app URL and the same secret in Vault:

   ```sql
   select vault.create_secret('https://<your-app-domain>', 'task_manager_app_url');
   select vault.create_secret('<same-value-as-CRON_SECRET>', 'task_manager_cron_secret');

   select cron.schedule(
     'task-reminder-checkpoints',
     '*/30 * * * *',
     $job$
       select net.http_post(
         url := (
           select decrypted_secret
           from vault.decrypted_secrets
           where name = 'task_manager_app_url'
         ) || '/api/cron/reminders',
         headers := jsonb_build_object(
           'Authorization',
           'Bearer ' || (
             select decrypted_secret
             from vault.decrypted_secrets
             where name = 'task_manager_cron_secret'
           )
         ),
         body := '{}'::jsonb
       );
     $job$
   );
   ```

   Configure this schedule once per project; do not add a second scheduler.
   `pg_cron` invokes the authenticated application endpoint, which records
   checkpoint reminders and PIC notifications transactionally and idempotently.
   Never commit the real URL/secret pair.
7. Start the development server:

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000`.

## Checks

### Gmail reminders without buying a domain

The reminder scheduler also supports sending from a Gmail account through authenticated
SMTP. In Vercel Production, configure `REMINDER_EMAIL_PROVIDER=gmail`, `GMAIL_USER`
with the sender's Gmail address, and `GMAIL_APP_PASSWORD` as a Secret containing a
Google App Password. Create that password directly in the owner's Google Account
with 2-Step Verification enabled; never use the normal Google password or commit it.
Redeploy after setting the variables. A partial configuration does not claim emails.

Gmail sends as `GMAIL_USER`, so no Resend domain or `RESEND_FROM_EMAIL` is required.
The existing 72-hour unanswered-reminder rule, PIC recipient, and database delivery
tracking still apply. Gmail processes at most five queued emails per scheduler run;
account sending quotas still apply. SMTP cannot guarantee exactly-once delivery if a
connection fails after Gmail accepted a message but before the app recorded success.
Test one controlled recipient before enabling an existing backlog. Supabase Auth
confirmation/reset emails are configured separately from these task reminders.

The default provider remains Resend for existing installations. To use it, keep
`REMINDER_EMAIL_PROVIDER=resend` (or unset), `RESEND_API_KEY`, and a verified
`RESEND_FROM_EMAIL`. The free `resend.dev` sender is limited to the Resend account
owner's email and does not replace a production sender for all PICs.

```bash
npm run lint
npx tsc --noEmit
npx vitest run
npm run build
```

## Project structure

- `app/` — App Router pages, layouts, and route handlers
- `lib/` — authentication, Supabase clients, user/task logic, and queries
- `supabase/migrations/` — ordered PostgreSQL schema and RLS migrations
- `supabase/tests/` — database policy tests using PGlite
- `task-manager-repo/docs/` — requirements, architecture, decisions, and traceability
- `stitch_user_interface_design/` — static UI references; not runtime data

User invitations create Spectator accounts. Role and section assignment are
handled separately. Self-registration and password reset are not enabled.
