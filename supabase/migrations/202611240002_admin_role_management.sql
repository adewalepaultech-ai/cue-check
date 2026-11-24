-- Admin role management and access control refinements
-- Run after 202611240001_cuecheck_shared_database.sql.

-- The authenticated administrator can list staff and change roles.
-- Regular staff can only read their own profile.
drop policy if exists "Profiles visible to self and admins" on public.cuecheck_profiles;
create policy "Profiles visible to self and admins"
on public.cuecheck_profiles for select to authenticated
using (id = auth.uid() or public.cuecheck_is_admin());

drop policy if exists "Admins can update profiles" on public.cuecheck_profiles;
create policy "Admins can update profiles"
on public.cuecheck_profiles for update to authenticated
using (public.cuecheck_is_admin())
with check (public.cuecheck_is_admin());

-- First account bootstrap: replace with the email address of the owner account,
-- then run this statement once in the SQL Editor:
-- update public.cuecheck_profiles set role = 'admin'
-- where email = 'owner@example.com';
