-- ══════════════════════════════════════════════════════════════════════════
--  CHORUS · ЕДИНСТВЕНАТА настройка на базата
--
--  Supabase Dashboard → SQL Editor → постави целия файл → Run.
--  Безопасно е да се пуска повторно (IF NOT EXISTS / OR REPLACE / DROP POLICY).
--
--  Създава всичко, от което хостнатият сайт има нужда:
--    · artworks                → Solo / Mirror / Sculpt записват тук
--    · competitions + entries + votes  → Compete
--    · posts/likes/comments/follows/badges/notifications → Social
--    · award_entries/award_votes       → сезонните награди
--    · user_avatars                    → Mirror аватарите
--    · sessions + arena_points + battle_wins → Collective (Realtime)
--    · Storage: artwork-videos, sites
-- ══════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════
-- ЧАСТ 1 — Social (постове, награди, известия)
-- ══════════════════════════════════════════════════════════

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author text not null,
  artwork_id text,
  image_data text,
  title text,
  mode text,
  caption text default '',
  tags text[] default '{}',
  remix_of_post_id uuid,
  remix_of_author text,
  created_at timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_user_idx on public.posts (user_id);

create table if not exists public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author text not null,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id);

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id)
);

create table if not exists public.award_entries (
  season text not null,
  category text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  artwork_id text,
  image_data text,
  title text,
  created_at timestamptz not null default now(),
  primary key (season, category, user_id)
);

create table if not exists public.award_votes (
  season text not null,
  category text not null,
  voter_id uuid not null references auth.users(id) on delete cascade,
  entry_user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (season, category, voter_id)
);

create table if not exists public.badges (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  season text not null,
  category_key text not null,
  title text not null,
  icon text not null,
  rank int not null default 1,
  username text,
  awarded_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  actor_id uuid,
  actor_name text,
  post_id uuid,
  text text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- ─────────────── GRANTS (row access still governed by RLS) ───────────────
grant select on public.posts, public.likes, public.comments, public.follows,
  public.award_entries, public.award_votes, public.badges to anon, authenticated;
grant insert, update, delete on public.posts, public.likes, public.comments, public.follows,
  public.award_entries, public.award_votes to authenticated;
grant select, update on public.notifications to authenticated;

-- ─────────────── ROW LEVEL SECURITY ───────────────
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.award_entries enable row level security;
alter table public.award_votes enable row level security;
alter table public.badges enable row level security;
alter table public.notifications enable row level security;

-- posts
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select using (true);
drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts for insert with check (auth.uid() = user_id);
drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts for delete using (auth.uid() = user_id);

-- likes
drop policy if exists likes_read on public.likes;
create policy likes_read on public.likes for select using (true);
drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own on public.likes for insert with check (auth.uid() = user_id);
drop policy if exists likes_delete_own on public.likes;
create policy likes_delete_own on public.likes for delete using (auth.uid() = user_id);

-- comments
drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select using (true);
drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own on public.comments for insert with check (auth.uid() = user_id);
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete using (
  auth.uid() = user_id
  or exists (select 1 from public.posts p where p.id = comments.post_id and p.user_id = auth.uid())
);

-- follows
drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows for select using (true);
drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows for insert with check (auth.uid() = follower_id);
drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own on public.follows for delete using (auth.uid() = follower_id);

-- award_entries
drop policy if exists entries_read on public.award_entries;
create policy entries_read on public.award_entries for select using (true);
drop policy if exists entries_insert_own on public.award_entries;
create policy entries_insert_own on public.award_entries for insert with check (auth.uid() = user_id);
drop policy if exists entries_update_own on public.award_entries;
create policy entries_update_own on public.award_entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists entries_delete_own on public.award_entries;
create policy entries_delete_own on public.award_entries for delete using (auth.uid() = user_id);

-- award_votes (cannot vote for yourself)
drop policy if exists votes_read on public.award_votes;
create policy votes_read on public.award_votes for select using (true);
drop policy if exists votes_insert_own on public.award_votes;
create policy votes_insert_own on public.award_votes for insert with check (auth.uid() = voter_id and entry_user_id <> auth.uid());
drop policy if exists votes_update_own on public.award_votes;
create policy votes_update_own on public.award_votes for update using (auth.uid() = voter_id) with check (auth.uid() = voter_id and entry_user_id <> auth.uid());
drop policy if exists votes_delete_own on public.award_votes;
create policy votes_delete_own on public.award_votes for delete using (auth.uid() = voter_id);

-- badges (read-only for clients; written by the finalize function)
drop policy if exists badges_read on public.badges;
create policy badges_read on public.badges for select using (true);

-- notifications (only the recipient can read / mark read; inserts come from triggers)
drop policy if exists notif_read_own on public.notifications;
create policy notif_read_own on public.notifications for select using (auth.uid() = user_id);
drop policy if exists notif_update_own on public.notifications;
create policy notif_update_own on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────── HELPERS + TRIGGERS (notifications) ───────────────
create or replace function public.username_of(uid uuid) returns text
language sql security definer set search_path = public, auth as $$
  select coalesce(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1), 'artist')
  from auth.users u where u.id = uid;
$$;

create or replace function public.notify_on_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; nm text;
begin
  select user_id into owner from public.posts where id = new.post_id;
  if owner is not null and owner <> new.user_id then
    nm := public.username_of(new.user_id);
    insert into public.notifications(user_id, type, actor_id, actor_name, post_id, text)
    values (owner, 'like', new.user_id, nm, new.post_id, nm || ' liked your post');
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_like on public.likes;
create trigger trg_notify_like after insert on public.likes for each row execute function public.notify_on_like();

create or replace function public.notify_on_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.posts where id = new.post_id;
  if owner is not null and owner <> new.user_id then
    insert into public.notifications(user_id, type, actor_id, actor_name, post_id, text)
    values (owner, 'comment', new.user_id, new.author, new.post_id, new.author || ' commented: ' || left(new.text, 60));
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_comment on public.comments;
create trigger trg_notify_comment after insert on public.comments for each row execute function public.notify_on_comment();

create or replace function public.notify_on_follow() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  nm := public.username_of(new.follower_id);
  insert into public.notifications(user_id, type, actor_id, actor_name, text)
  values (new.followee_id, 'follow', new.follower_id, nm, nm || ' started following you');
  return new;
end $$;
drop trigger if exists trg_notify_follow on public.follows;
create trigger trg_notify_follow after insert on public.follows for each row execute function public.notify_on_follow();

-- ─────────────── SEASON FINALIZATION (idempotent) ───────────────
-- За всеки приключил сезон дава Champion бадж на топ записа във всяка категория.
create or replace function public.finalize_due_seasons() returns void
language plpgsql security definer set search_path = public as $$
declare
  cur text := to_char(now() at time zone 'utc', 'YYYY-MM');
  s   text;
  cat text;
  win record;
  lbl text; ic text;
begin
  for s in select distinct season from public.award_entries where season < cur loop
    foreach cat in array array['solo', 'sculpt', 'moodcheck', 'collective'] loop
      select e.user_id, e.username,
             (select count(*) from public.award_votes v
                where v.season = s and v.category = cat and v.entry_user_id = e.user_id) as votes,
             e.created_at
        into win
      from public.award_entries e
      where e.season = s and e.category = cat
      order by votes desc, e.created_at asc
      limit 1;

      if win.user_id is not null and win.votes > 0 then
        lbl := case cat when 'solo' then '2D Painting' when 'sculpt' then '3D Sculpture'
                        when 'moodcheck' then 'Portrait & Mood' when 'collective' then 'Collective Canvas'
                        else cat end;
        ic := case cat when 'solo' then '🎨' when 'sculpt' then '🧊'
                       when 'moodcheck' then '🪞' when 'collective' then '🌈' else '🏆' end;

        insert into public.badges(id, user_id, season, category_key, title, icon, rank, username)
        values (s || ':' || cat, win.user_id, s, cat,
                lbl || ' Champion · ' || to_char(to_date(s, 'YYYY-MM'), 'Mon YYYY'),
                ic, 1, win.username)
        on conflict (id, user_id) do nothing;

        if found then
          insert into public.notifications(user_id, type, text)
          values (win.user_id, 'badge', '🏆 You won ' || lbl || '!');
        end if;
      end if;
    end loop;
  end loop;
end $$;

grant execute on function public.finalize_due_seasons() to anon, authenticated;


-- ══════════════════════════════════════════════════════════
-- ЧАСТ 2 — Творби, състезания, аватари
-- ══════════════════════════════════════════════════════════

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


-- ══════════════════════════════════════════════════════════
-- ЧАСТ 3 — WebForge публикуване
-- ══════════════════════════════════════════════════════════

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


-- ══════════════════════════════════════════════════════════
-- ЧАСТ 4 — Collective през Supabase Realtime
-- (стаи по код, арена точки, победи от Draw Battle)
-- ══════════════════════════════════════════════════════════

-- Стая: 4-буквен код, режим (canvas | arena) и настройки на игрите
create table if not exists public.sessions (
  code text primary key,
  creator_id uuid references auth.users(id) on delete set null,
  creator_name text,
  mode text not null default 'canvas',
  settings jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists sessions_active_idx on public.sessions (active, created_at desc);

grant select on public.sessions to anon, authenticated;
grant insert, update, delete on public.sessions to authenticated;
alter table public.sessions enable row level security;

drop policy if exists sessions_read on public.sessions;
create policy sessions_read on public.sessions for select using (true);
drop policy if exists sessions_insert_own on public.sessions;
create policy sessions_insert_own on public.sessions for insert with check (auth.uid() = creator_id);
drop policy if exists sessions_update_own on public.sessions;
create policy sessions_update_own on public.sessions for update using (auth.uid() = creator_id) with check (auth.uid() = creator_id);
drop policy if exists sessions_delete_own on public.sessions;
create policy sessions_delete_own on public.sessions for delete using (auth.uid() = creator_id);

-- Арена точки (заменя server/users/points.json)
create table if not exists public.arena_points (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points int not null default 0,
  rounds_played int not null default 0,
  round_wins int not null default 0,
  ai_wins int not null default 0,
  updated_at timestamptz not null default now()
);

-- Победи от Draw Battle (заменя server/users/battleWins.json)
create table if not exists public.battle_wins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wins int not null default 0,
  updated_at timestamptz not null default now()
);

grant select on public.arena_points, public.battle_wins to anon, authenticated;
grant insert, update on public.arena_points, public.battle_wins to authenticated;
alter table public.arena_points enable row level security;
alter table public.battle_wins enable row level security;

drop policy if exists points_read on public.arena_points;
create policy points_read on public.arena_points for select using (true);
drop policy if exists points_upsert_own on public.arena_points;
create policy points_upsert_own on public.arena_points for insert with check (auth.uid() = user_id);
drop policy if exists points_update_own on public.arena_points;
create policy points_update_own on public.arena_points for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists wins_read on public.battle_wins;
create policy wins_read on public.battle_wins for select using (true);
drop policy if exists wins_upsert_own on public.battle_wins;
create policy wins_upsert_own on public.battle_wins for insert with check (auth.uid() = user_id);
drop policy if exists wins_update_own on public.battle_wins;
create policy wins_update_own on public.battle_wins for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Начисляване на точки — всеки пише само за себе си (security invoker),
-- затова резултатите се записват от собствения браузър след рунда.
create or replace function public.add_arena_points(p_points int, p_won boolean, p_ai boolean)
returns void language plpgsql security invoker set search_path = public as $$
begin
  insert into public.arena_points as a (user_id, points, rounds_played, round_wins, ai_wins)
  values (auth.uid(), greatest(p_points, 0), 1, case when p_won then 1 else 0 end,
          case when p_won and p_ai then 1 else 0 end)
  on conflict (user_id) do update set
    points = a.points + greatest(p_points, 0),
    rounds_played = a.rounds_played + 1,
    round_wins = a.round_wins + case when p_won then 1 else 0 end,
    ai_wins = a.ai_wins + case when p_won and p_ai then 1 else 0 end,
    updated_at = now();
end $$;

create or replace function public.add_battle_win()
returns void language plpgsql security invoker set search_path = public as $$
begin
  insert into public.battle_wins as b (user_id, wins) values (auth.uid(), 1)
  on conflict (user_id) do update set wins = b.wins + 1, updated_at = now();
end $$;

grant execute on function public.add_arena_points(int, boolean, boolean) to authenticated;
grant execute on function public.add_battle_win() to authenticated;

-- Готово. Ако не се появи грешка, базата е настроена.
