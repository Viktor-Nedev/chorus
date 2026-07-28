-- ══════════════════════════════════════════════════════════════════════════
-- CHORUS · Social layer schema for Supabase
-- Run this once in the Supabase Dashboard → SQL Editor.
-- Safe to re-run (idempotent: IF NOT EXISTS / OR REPLACE / DROP POLICY guards).
-- ══════════════════════════════════════════════════════════════════════════

-- ─────────────── TABLES ───────────────
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
