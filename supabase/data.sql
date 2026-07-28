-- ══════════════════════════════════════════════════════════════════════════
-- CHORUS · Data layer schema for Supabase (artworks, competitions, avatars)
-- Run AFTER supabase/social.sql, in Supabase Dashboard → SQL Editor.
-- Idempotent (IF NOT EXISTS / DROP POLICY guards). Lets Gallery, Competitions
-- and Profile work from any device without the Node server.
-- ══════════════════════════════════════════════════════════════════════════

-- ─────────────── ARTWORKS (Gallery) ───────────────
create table if not exists public.artworks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author text not null,
  title text default 'Untitled',
  description text default '',
  image_data text,
  mode text default 'solo',
  poem text default '',
  duration int default 0,
  dominant_emotion text,
  scene_json jsonb,
  video_url text,
  total_users int,
  created_at timestamptz not null default now()
);
create index if not exists artworks_created_idx on public.artworks (created_at desc);
create index if not exists artworks_user_idx on public.artworks (user_id);

-- ─────────────── COMPETITIONS ───────────────
create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  theme text not null,
  description text default '',
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  ends_at timestamptz not null
);
create index if not exists competitions_created_idx on public.competitions (created_at desc);

create table if not exists public.competition_entries (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text,
  artwork_id uuid,
  title text,
  image_data text,
  created_at timestamptz not null default now(),
  primary key (competition_id, user_id)
);

create table if not exists public.competition_votes (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  entry_user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (competition_id, voter_id)
);

-- ─────────────── MIRROR AVATARS ───────────────
create table if not exists public.user_avatars (
  user_id uuid primary key references auth.users(id) on delete cascade,
  list jsonb not null default '[]',
  cam_avatar_id text,
  updated_at timestamptz not null default now()
);

-- ─────────────── GRANTS ───────────────
grant select on public.artworks, public.competitions, public.competition_entries,
  public.competition_votes, public.user_avatars to anon, authenticated;
grant insert, update, delete on public.artworks, public.competitions,
  public.competition_entries, public.competition_votes, public.user_avatars to authenticated;

-- ─────────────── ROW LEVEL SECURITY ───────────────
alter table public.artworks enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_entries enable row level security;
alter table public.competition_votes enable row level security;
alter table public.user_avatars enable row level security;

-- artworks
drop policy if exists artworks_read on public.artworks;
create policy artworks_read on public.artworks for select using (true);
drop policy if exists artworks_insert_own on public.artworks;
create policy artworks_insert_own on public.artworks for insert with check (auth.uid() = user_id);
drop policy if exists artworks_update_own on public.artworks;
create policy artworks_update_own on public.artworks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists artworks_delete_own on public.artworks;
create policy artworks_delete_own on public.artworks for delete using (auth.uid() = user_id);

-- competitions
drop policy if exists comp_read on public.competitions;
create policy comp_read on public.competitions for select using (true);
drop policy if exists comp_insert_own on public.competitions;
create policy comp_insert_own on public.competitions for insert with check (auth.uid() = created_by);

-- competition_entries (own; only while the competition is still open)
drop policy if exists entry_read on public.competition_entries;
create policy entry_read on public.competition_entries for select using (true);
drop policy if exists entry_insert_own on public.competition_entries;
create policy entry_insert_own on public.competition_entries for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.competitions c where c.id = competition_id and now() < c.ends_at)
);
drop policy if exists entry_delete_own on public.competition_entries;
create policy entry_delete_own on public.competition_entries for delete using (auth.uid() = user_id);

-- competition_votes (own; not for yourself; only while open)
drop policy if exists vote_read on public.competition_votes;
create policy vote_read on public.competition_votes for select using (true);
drop policy if exists vote_insert_own on public.competition_votes;
create policy vote_insert_own on public.competition_votes for insert with check (
  auth.uid() = voter_id and entry_user_id <> auth.uid()
  and exists (select 1 from public.competitions c where c.id = competition_id and now() < c.ends_at)
);
drop policy if exists vote_update_own on public.competition_votes;
create policy vote_update_own on public.competition_votes for update using (auth.uid() = voter_id) with check (auth.uid() = voter_id and entry_user_id <> auth.uid());
drop policy if exists vote_delete_own on public.competition_votes;
create policy vote_delete_own on public.competition_votes for delete using (auth.uid() = voter_id);

-- user_avatars (own)
drop policy if exists avatars_read on public.user_avatars;
create policy avatars_read on public.user_avatars for select using (true);
drop policy if exists avatars_upsert_own on public.user_avatars;
create policy avatars_upsert_own on public.user_avatars for insert with check (auth.uid() = user_id);
drop policy if exists avatars_update_own on public.user_avatars;
create policy avatars_update_own on public.user_avatars for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────── STORAGE: artwork videos (webm) ───────────────
insert into storage.buckets (id, name, public)
values ('artwork-videos', 'artwork-videos', true)
on conflict (id) do nothing;

drop policy if exists videos_public_read on storage.objects;
create policy videos_public_read on storage.objects for select using (bucket_id = 'artwork-videos');
drop policy if exists videos_insert_own on storage.objects;
create policy videos_insert_own on storage.objects for insert to authenticated with check (bucket_id = 'artwork-videos' and owner = auth.uid());
drop policy if exists videos_delete_own on storage.objects;
create policy videos_delete_own on storage.objects for delete to authenticated using (bucket_id = 'artwork-videos' and owner = auth.uid());
