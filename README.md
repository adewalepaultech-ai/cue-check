# Cue Check

Cue Check is a React + Vite media-readiness application with Supabase authentication and shared cloud records.

## Features
- Individual staff email/password sign-in
- Shared service-check history across authorised staff and devices
- Live updates for service records
- Checklist templates and special-program templates
- Service progress, notes, readiness status and PDF export
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
4. In Supabase Authentication, invite the owner account (or create it using the approved account workflow).
5. Promote the owner account by running this SQL with the exact account email:
   ```sql
   update public.cuecheck_profiles
   set role = 'admin'
   where email = 'owner@example.com';
   ```
6. Invite staff from Supabase Authentication > Users. Staff accounts receive the `staff` role automatically.
7. In Vercel, confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured for Production, Preview and Development, then redeploy.

The first successful login on a browser that contains old Cue Check local data migrates that browser's saved checklist, special-program templates, settings and service checks into the shared database if the cloud workspace is still empty. Keep the old browser data until migration is verified.

## Data and security
- The Supabase publishable key is intended for browser use; database access is controlled by Row Level Security.
- Do not expose database passwords, secret keys or service-role keys.
- Authenticated staff can read and update shared service checks and shared checklist configuration.
- Administrators can view staff profiles and change staff/admin roles.
- Account invitations are issued from Supabase Authentication.

## Deployment
Vercel is connected to this GitHub repository and deploys changes pushed to `main`.
