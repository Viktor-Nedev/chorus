-- ══════════════════════════════════════════════════════════════════════════
-- CHORUS · WebForge publishing (Supabase Storage + site registry)
-- Run in Supabase Dashboard → SQL Editor (after social.sql / data.sql).
-- Idempotent. Lets any signed-in user publish a generated site to a public
-- URL — no Docker and no Node server required.
-- ══════════════════════════════════════════════════════════════════════════

-- ─────────────── Registry of published sites ───────────────
create table if not exists public.webforge_sites (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_name text,
  path text not null,
  url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists webforge_sites_user_idx on public.webforge_sites (user_id, created_at desc);

grant select on public.webforge_sites to anon, authenticated;
grant insert, update, delete on public.webforge_sites to authenticated;

alter table public.webforge_sites enable row level security;

drop policy if exists sites_read on public.webforge_sites;
create policy sites_read on public.webforge_sites for select using (true);
drop policy if exists sites_insert_own on public.webforge_sites;
create policy sites_insert_own on public.webforge_sites for insert with check (auth.uid() = user_id);
drop policy if exists sites_update_own on public.webforge_sites;
create policy sites_update_own on public.webforge_sites for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists sites_delete_own on public.webforge_sites;
create policy sites_delete_own on public.webforge_sites for delete using (auth.uid() = user_id);

-- ─────────────── Public Storage bucket for the generated sites ───────────────
insert into storage.buckets (id, name, public)
values ('sites', 'sites', true)
on conflict (id) do nothing;

-- Публичен прочит; писане само в собствената папка (<auth.uid()>/<projectId>/…)
drop policy if exists sites_public_read on storage.objects;
create policy sites_public_read on storage.objects
  for select using (bucket_id = 'sites');

drop policy if exists sites_write_own on storage.objects;
create policy sites_write_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sites' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists sites_update_own_obj on storage.objects;
create policy sites_update_own_obj on storage.objects
  for update to authenticated
  using (bucket_id = 'sites' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'sites' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists sites_delete_own_obj on storage.objects;
create policy sites_delete_own_obj on storage.objects
  for delete to authenticated
  using (bucket_id = 'sites' and (storage.foldername(name))[1] = auth.uid()::text);
