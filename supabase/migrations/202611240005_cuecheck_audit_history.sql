-- Cue Check immutable activity history
-- Run after the account approval setup and existing shared database migrations.

create table if not exists public.cuecheck_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_email text not null default '',
  action text not null,
  check_id uuid references public.cuecheck_checks(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cuecheck_audit_created_at_idx
  on public.cuecheck_audit (created_at desc);
create index if not exists cuecheck_audit_actor_id_idx
  on public.cuecheck_audit (actor_id);

alter table public.cuecheck_audit enable row level security;

drop policy if exists "Approved users can read their activity and admins can read all" on public.cuecheck_audit;
create policy "Approved users can read their activity and admins can read all"
on public.cuecheck_audit
for select to authenticated
using (
  public.cuecheck_is_approved()
  and (actor_id = auth.uid() or public.cuecheck_is_admin())
);

drop policy if exists "Approved users can record their own activity" on public.cuecheck_audit;
create policy "Approved users can record their own activity"
on public.cuecheck_audit
for insert to authenticated
with check (
  public.cuecheck_is_approved()
  and actor_id = auth.uid()
);

grant select, insert on public.cuecheck_audit to authenticated;

-- No UPDATE or DELETE policies are intentionally created: audit entries are append-only.
