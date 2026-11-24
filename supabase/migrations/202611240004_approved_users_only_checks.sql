-- Cue Check: restrict shared service records to approved users.
-- Run after the account-approval setup and 202611240003_admin_only_config.sql.
-- This migration removes the permissive policy names created by the original
-- Cue Check schema. It intentionally does not delete unrelated/custom policies.
-- Before running, inspect pg_policies for any other broad policies on this table.

DROP POLICY IF EXISTS "Signed-in staff can read shared checks" ON public.cuecheck_checks;
DROP POLICY IF EXISTS "Signed-in staff can create shared checks" ON public.cuecheck_checks;
DROP POLICY IF EXISTS "Signed-in staff can update shared checks" ON public.cuecheck_checks;
DROP POLICY IF EXISTS "Signed-in staff can delete shared checks" ON public.cuecheck_checks;

DROP POLICY IF EXISTS "Approved users can read shared checks" ON public.cuecheck_checks;
DROP POLICY IF EXISTS "Approved users can create shared checks" ON public.cuecheck_checks;
DROP POLICY IF EXISTS "Approved users can update shared checks" ON public.cuecheck_checks;
DROP POLICY IF EXISTS "Approved users can delete shared checks" ON public.cuecheck_checks;
DROP POLICY IF EXISTS "Admins can delete shared checks" ON public.cuecheck_checks;

CREATE POLICY "Approved users can read shared checks"
ON public.cuecheck_checks
FOR SELECT TO authenticated
USING (public.cuecheck_is_approved());

CREATE POLICY "Approved users can create shared checks"
ON public.cuecheck_checks
FOR INSERT TO authenticated
WITH CHECK (public.cuecheck_is_approved());

CREATE POLICY "Approved users can update shared checks"
ON public.cuecheck_checks
FOR UPDATE TO authenticated
USING (public.cuecheck_is_approved())
WITH CHECK (public.cuecheck_is_approved());

CREATE POLICY "Admins can delete shared checks"
ON public.cuecheck_checks
FOR DELETE TO authenticated
USING (public.cuecheck_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cuecheck_checks TO authenticated;
