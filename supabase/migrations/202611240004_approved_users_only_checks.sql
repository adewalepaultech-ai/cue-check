-- Cue Check: restrict shared service records to approved users.
-- Run after 202611240003_admin_only_config.sql.
-- public.cuecheck_is_approved() must return true for approved staff and admins.

DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cuecheck_checks'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.cuecheck_checks',
      p.policyname
    );
  END LOOP;
END $$;

CREATE POLICY "Approved users can read shared checks"
ON public.cuecheck_checks
FOR SELECT
TO authenticated
USING (public.cuecheck_is_approved());

CREATE POLICY "Approved users can create shared checks"
ON public.cuecheck_checks
FOR INSERT
TO authenticated
WITH CHECK (public.cuecheck_is_approved());

CREATE POLICY "Approved users can update shared checks"
ON public.cuecheck_checks
FOR UPDATE
TO authenticated
USING (public.cuecheck_is_approved())
WITH CHECK (public.cuecheck_is_approved());

CREATE POLICY "Approved users can delete shared checks"
ON public.cuecheck_checks
FOR DELETE
TO authenticated
USING (public.cuecheck_is_approved());

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.cuecheck_checks
TO authenticated;
