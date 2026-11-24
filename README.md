# Cue Check

Cue Check is a React + Vite media-readiness application with Supabase authentication and shared cloud records.

## Features
- Individual staff email/password sign-in
- Shared service-check history across authorised staff and devices
- Live updates for service records
- Checklist templates and special-program templates
- Service progress, notes, readiness status and detailed PDF export
- Management dashboard with readiness, overdue and monthly metrics
- Append-only activity history for checklist and service actions
- Administrator staff performance reports with CSV export
- Administrator JSON backup and merge-based recovery
- Responsive mobile navigation and touch-friendly checklist controls
- Light and dark appearance modes
- Administrator role management for staff profiles

## Local development
```bash
npm install
npm run dev
```

Create a local `.env` file with:
```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Never put a Supabase secret or service-role key in frontend environment variables.

## Supabase setup (required once)
1. Open the Supabase project SQL Editor.
2. Run `supabase/migrations/202611240001_cuecheck_shared_database.sql`.
3. Run `supabase/migrations/202611240002_admin_role_management.sql`.
4. Complete the account-approval setup used by this project, including the `cuecheck_is_approved()` function.
5. Run `supabase/migrations/202611240003_admin_only_config.sql`. This makes shared checklist templates read-only for approved staff and writable only by administrators.
6. Inspect the current `cuecheck_checks` policies in `pg_policies`, then run `supabase/migrations/202611240004_approved_users_only_checks.sql`. It replaces the original permissive Cue Check policies with approved-user access. Do not run it until any custom policies have been reviewed.
7. Run `supabase/migrations/202611240005_cuecheck_audit_history.sql` to enable the new activity log.
8. In Supabase Authentication, invite the owner account (or create it using the approved account workflow).
9. Promote the owner account by running this SQL with the exact account email:
   ```sql
   update public.cuecheck_profiles
   set role = 'admin'
   where email = 'owner@example.com';
   ```
10. Invite staff from Supabase Authentication > Users. Staff accounts receive the `staff` role automatically.
11. In Vercel, confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured for Production, Preview and Development, then redeploy.

The first successful login on a browser that contains old Cue Check local data migrates that browser's saved checklist, special-program templates, settings and service checks into the shared database if the cloud workspace is still empty. Keep the old browser data until migration is verified.

## Data and security
- The Supabase publishable key is intended for browser use; database access is controlled by Row Level Security.
- Do not expose database passwords, secret keys or service-role keys.
- Approved staff can read shared checklist configuration but cannot create, edit or delete templates.
- Approved staff can create and update shared service checks; only administrators can delete service records or manage checklist templates.
- Administrators can view staff profiles, approve or reject registrations, and change staff/admin roles.
- Audit entries are append-only; staff can read their own entries and administrators can read all entries.
- Backup restore updates matching record IDs and leaves other cloud records untouched. Keep downloaded backups in a secure location.
- Account invitations are issued from Supabase Authentication.

## Deployment
Vercel is connected to this GitHub repository and deploys changes pushed to `main`.
