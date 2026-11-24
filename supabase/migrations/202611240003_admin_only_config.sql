-- Cue Check: administrator-only checklist configuration
-- Run after 202611240001_cuecheck_shared_database.sql and
-- 202611240002_admin_role_management.sql.
--
-- Requires public.cuecheck_is_admin() and public.cuecheck_is_approved()
-- to be installed by the account-approval setup.

DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cuecheck_config'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.cuecheck_config',
      p.policyname
    );
  END LOOP;
END $$;

CREATE POLICY "Approved users can read shared config"
ON public.cuecheck_config
FOR SELECT
TO authenticated
USING (public.cuecheck_is_approved());

CREATE POLICY "Admins can insert shared config"
ON public.cuecheck_config
FOR INSERT
TO authenticated
WITH CHECK (public.cuecheck_is_admin());

CREATE POLICY "Admins can update shared config"
ON public.cuecheck_config
FOR UPDATE
TO authenticated
USING (public.cuecheck_is_admin())
WITH CHECK (public.cuecheck_is_admin());

CREATE POLICY "Admins can delete shared config"
ON public.cuecheck_config
FOR DELETE
TO authenticated
USING (public.cuecheck_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.cuecheck_config
TO authenticated;
