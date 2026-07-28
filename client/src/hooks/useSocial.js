import { useCallback } from 'react';
import { useAuth } from './useAuth';
import { supabase, SOCIAL_BACKEND } from '../lib/supabase';
import { CATEGORIES, CATEGORY_BY_KEY, currentSeason, seasonEndsAt, seasonLabel } from '../constants/social';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// ── Мапъри snake_case (Supabase) → формите, които компонентите очакват ──
const mapComment = (c) => ({ id: c.id, userId: c.user_id, author: c.author, text: c.text, at: c.created_at });
function mapPost(p, uid, followSet, badgesMap) {
  const likes = p.likes || [];
  const comments = (p.comments || []).map(mapComment).sort((a, b) => new Date(a.at) - new Date(b.at));
  return {
    id: p.id,
    userId: p.user_id,
    author: p.author,
    artworkId: p.artwork_id,
    imageData: p.image_data,
    title: p.title,
    mode: p.mode,
    caption: p.caption || '',
    tags: p.tags || [],
    remixOf: p.remix_of_post_id ? { postId: p.remix_of_post_id, author: p.remix_of_author } : null,
    createdAt: p.created_at,
    likeCount: likes.length,
    commentCount: comments.length,
    comments,
    likedByMe: uid ? likes.some((l) => l.user_id === uid) : false,
    followsAuthor: uid && followSet ? followSet.has(p.user_id) : false,
    authorBadges: (badgesMap?.[p.user_id] || []).slice(0, 3),
  };
}
const mapBadge = (b) => ({
  id: b.id, season: b.season, categoryKey: b.category_key, title: b.title,
  icon: b.icon, rank: b.rank, username: b.username, awardedAt: b.awarded_at,
});
const mapNotif = (n) => ({
  id: n.id, type: n.type, actorId: n.actor_id, actorName: n.actor_name,
  postId: n.post_id, text: n.text, read: n.read, at: n.created_at,
});
const prevSeason = (season) => {
  const [y, m] = season.split('-').map(Number);
  return currentSeason(new Date(Date.UTC(y, m - 2, 1)));
};
const cleanTags = (tags) =>
  Array.isArray(tags)
    ? [...new Set(tags.map((t) => String(t).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)).filter(Boolean))].slice(0, 6)
    : [];
async function galleryArtwork(artworkId) {
  if (supabase) {
    const { data, error } = await supabase.from('artworks')
      .select('image_data,title,mode,user_id').eq('id', artworkId).single();
    if (error || !data) throw new Error('Artwork not found');
    return { imageData: data.image_data, title: data.title, mode: data.mode, userId: data.user_id };
  }
  const res = await fetch(`${SERVER_URL}/api/gallery/${artworkId}`);
  if (!res.ok) throw new Error('Artwork not found');
  return res.json();
}
async function fetchBadgesRaw(userId) {
  const { data } = await supabase.from('badges').select('*').eq('user_id', userId);
  return (data || []).map(mapBadge);
}

export function useSocial() {
  const { authFetch, user } = useAuth();
  const uid = user?.id;
  const uname = user?.username;
  const useSupa = SOCIAL_BACKEND === 'supabase' && !!supabase;

  // Express fallback helper
  const rest = useCallback(
    async (url, options) => {
      const res = await authFetch(url, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    },
    [authFetch]
  );

  // ─────────── FEED ───────────
  const fetchFeed = useCallback(
    async (params = {}) => {
      if (!useSupa) {
        const qs = new URLSearchParams(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
        ).toString();
        return rest(`/api/social/feed${qs ? `?${qs}` : ''}`);
      }
      const { scope = 'all', mode, tag, q, sort = 'new', limit = 40, before } = params;
      let query = supabase
        .from('posts')
        .select('*, likes(user_id), comments(id,post_id,user_id,author,text,created_at)')
        .order('created_at', { ascending: false })
        .limit(Math.min(50, limit));
      if (mode) query = query.eq('mode', mode);
      if (tag) query = query.contains('tags', [tag]);
      if (before) query = query.lt('created_at', before);
      if (scope === 'following' && uid) {
        const { data: fol } = await supabase.from('follows').select('followee_id').eq('follower_id', uid);
        query = query.in('user_id', [...(fol || []).map((f) => f.followee_id), uid]);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      let posts = data || [];
      if (q) {
        const needle = String(q).toLowerCase();
        posts = posts.filter((p) =>
          [p.caption, p.title, p.author, ...(p.tags || [])].join(' ').toLowerCase().includes(needle)
        );
      }
      if (sort === 'top') {
        const now = Date.now();
        const score = (p) => (p.likes?.length || 0) + (p.comments?.length || 0) * 0.5 +
          (now - new Date(p.created_at).getTime() < 48 * 3600e3 ? 2 : 0);
        posts = [...posts].sort((a, b) => score(b) - score(a) || new Date(b.created_at) - new Date(a.created_at));
      }
      // авторски follows + баджове (за целите на страницата)
      const followSet = uid
        ? new Set(((await supabase.from('follows').select('followee_id').eq('follower_id', uid)).data || []).map((f) => f.followee_id))
        : null;
      const authorIds = [...new Set(posts.map((p) => p.user_id))];
      const badgesMap = {};
      if (authorIds.length) {
        const { data: br } = await supabase.from('badges').select('*').in('user_id', authorIds);
        (br || []).forEach((b) => { (badgesMap[b.user_id] ||= []).push(mapBadge(b)); });
      }
      return posts.map((p) => mapPost(p, uid, followSet, badgesMap));
    },
    [useSupa, rest, uid]
  );

  // ─────────── POSTS ───────────
  const createPost = useCallback(
    async (body) => {
      if (!useSupa) return rest('/api/social/posts', { method: 'POST', body: JSON.stringify(body) });
      const { artworkId, caption, tags, remixOfPostId } = body;
      const art = await galleryArtwork(artworkId);
      let remixAuthor = null;
      if (remixOfPostId) {
        const { data: src } = await supabase.from('posts').select('author').eq('id', remixOfPostId).maybeSingle();
        remixAuthor = src?.author || null;
      }
      const row = {
        user_id: uid, author: uname, artwork_id: artworkId,
        image_data: art.imageData, title: art.title || 'Untitled', mode: art.mode || 'solo',
        caption: String(caption || '').slice(0, 500), tags: cleanTags(tags),
        remix_of_post_id: remixOfPostId || null, remix_of_author: remixAuthor,
      };
      const { data, error } = await supabase.from('posts').insert(row)
        .select('*, likes(user_id), comments(id,post_id,user_id,author,text,created_at)').single();
      if (error) throw new Error(error.message);
      const myBadges = {}; myBadges[uid] = await fetchBadgesRaw(uid);
      return mapPost(data, uid, new Set(), myBadges);
    },
    [useSupa, rest, uid, uname]
  );

  const deletePost = useCallback(
    async (id) => {
      if (!useSupa) return rest(`/api/social/posts/${id}`, { method: 'DELETE' });
      const { error } = await supabase.from('posts').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { success: true };
    },
    [useSupa, rest]
  );

  const toggleLike = useCallback(
    async (id) => {
      if (!useSupa) return rest(`/api/social/posts/${id}/like`, { method: 'POST' });
      const { data: existing } = await supabase.from('likes').select('post_id').eq('post_id', id).eq('user_id', uid).maybeSingle();
      if (existing) await supabase.from('likes').delete().eq('post_id', id).eq('user_id', uid);
      else await supabase.from('likes').insert({ post_id: id, user_id: uid });
      const { count } = await supabase.from('likes').select('*', { count: 'exact', head: true }).eq('post_id', id);
      return { likeCount: count || 0, likedByMe: !existing };
    },
    [useSupa, rest, uid]
  );

  const addComment = useCallback(
    async (id, text) => {
      if (!useSupa) return rest(`/api/social/posts/${id}/comment`, { method: 'POST', body: JSON.stringify({ text }) });
      const { data, error } = await supabase.from('comments')
        .insert({ post_id: id, user_id: uid, author: uname, text: String(text).slice(0, 400) }).select().single();
      if (error) throw new Error(error.message);
      return mapComment(data);
    },
    [useSupa, rest, uid, uname]
  );

  const deleteComment = useCallback(
    async (id, cid) => {
      if (!useSupa) return rest(`/api/social/posts/${id}/comment/${cid}`, { method: 'DELETE' });
      const { error } = await supabase.from('comments').delete().eq('id', cid);
      if (error) throw new Error(error.message);
      return { success: true };
    },
    [useSupa, rest]
  );

  const toggleFollow = useCallback(
    async (userId) => {
      if (!useSupa) return rest(`/api/social/follow/${userId}`, { method: 'POST' });
      const { data: existing } = await supabase.from('follows').select('followee_id')
        .eq('follower_id', uid).eq('followee_id', userId).maybeSingle();
      if (existing) await supabase.from('follows').delete().eq('follower_id', uid).eq('followee_id', userId);
      else await supabase.from('follows').insert({ follower_id: uid, followee_id: userId });
      return { following: !existing };
    },
    [useSupa, rest, uid]
  );

  // ─────────── LEADERBOARD / BADGES ───────────
  const fetchBadges = useCallback(
    async (userId) => {
      if (!useSupa) return rest(`/api/social/badges/${userId}`);
      return fetchBadgesRaw(userId);
    },
    [useSupa, rest]
  );

  const fetchLeaderboard = useCallback(
    async () => {
      if (!useSupa) return rest('/api/social/creators/leaderboard');
      const { data: posts } = await supabase.from('posts').select('user_id, author, likes(count)');
      const { data: badges } = await supabase.from('badges').select('*');
      const byUser = new Map();
      (posts || []).forEach((p) => {
        const u = byUser.get(p.user_id) || { userId: p.user_id, username: p.author, likes: 0, posts: 0 };
        u.likes += p.likes?.[0]?.count || 0;
        u.posts += 1;
        u.username = p.author;
        byUser.set(p.user_id, u);
      });
      const badgesMap = {};
      (badges || []).forEach((b) => { (badgesMap[b.user_id] ||= []).push(mapBadge(b)); });
      for (const [uidKey, list] of Object.entries(badgesMap)) {
        if (!byUser.has(uidKey)) byUser.set(uidKey, { userId: uidKey, username: list[0]?.username || 'artist', likes: 0, posts: 0 });
      }
      const creators = [...byUser.values()].map((u) => ({
        ...u,
        badgeList: (badgesMap[u.userId] || []).slice(0, 4),
        badges: (badgesMap[u.userId] || []).length,
        points: 0,
      }));
      creators.sort((a, b) => b.badges - a.badges || b.likes - a.likes);
      return creators.slice(0, 20);
    },
    [useSupa, rest]
  );

  // ─────────── SEASONAL AWARDS ───────────
  const fetchAwards = useCallback(
    async () => {
      if (!useSupa) return rest('/api/social/awards/current');
      await supabase.rpc('finalize_due_seasons');
      const season = currentSeason();
      const [{ data: entries }, { data: votes }] = await Promise.all([
        supabase.from('award_entries').select('*').eq('season', season),
        supabase.from('award_votes').select('*').eq('season', season),
      ]);
      const categories = CATEGORIES.map((cat) => {
        const ce = (entries || []).filter((e) => e.category === cat.key);
        const cv = (votes || []).filter((v) => v.category === cat.key);
        const tally = {};
        cv.forEach((v) => { tally[v.entry_user_id] = (tally[v.entry_user_id] || 0) + 1; });
        const ranked = ce
          .map((e) => ({ userId: e.user_id, username: e.username, imageData: e.image_data, title: e.title, at: e.created_at, votes: tally[e.user_id] || 0 }))
          .sort((a, b) => b.votes - a.votes || new Date(a.at) - new Date(b.at));
        return {
          ...cat,
          entries: ranked,
          myEntry: uid ? ce.find((e) => e.user_id === uid) || null : null,
          myVote: uid ? cv.find((v) => v.voter_id === uid)?.entry_user_id || null : null,
        };
      });
      // Победители от предходния сезон (от баджовете)
      const prev = prevSeason(season);
      const { data: pw } = await supabase.from('badges').select('*').eq('season', prev);
      let pastWinners = null;
      if (pw && pw.length) {
        const winners = {};
        pw.forEach((b) => { winners[b.category_key] = { userId: b.user_id, username: b.username, votes: null }; });
        pastWinners = { season: prev, label: seasonLabel(prev), winners };
      }
      return { season, label: seasonLabel(season), endsAt: seasonEndsAt(season), categories, pastWinners };
    },
    [useSupa, rest, uid]
  );

  const enterAward = useCallback(
    async (category, artworkId) => {
      if (!useSupa) return rest('/api/social/awards/enter', { method: 'POST', body: JSON.stringify({ category, artworkId }) });
      const cat = CATEGORY_BY_KEY[category];
      if (!cat) throw new Error('Unknown category');
      const art = await galleryArtwork(artworkId);
      if ((art.mode || 'solo') !== cat.mode) throw new Error(`${cat.label} accepts ${cat.mode} artworks`);
      const { error } = await supabase.from('award_entries').upsert(
        { season: currentSeason(), category, user_id: uid, username: uname, artwork_id: artworkId, image_data: art.imageData, title: art.title || 'Untitled' },
        { onConflict: 'season,category,user_id' }
      );
      if (error) throw new Error(error.message);
      return { success: true };
    },
    [useSupa, rest, uid, uname]
  );

  const voteAward = useCallback(
    async (category, entryUserId) => {
      if (!useSupa) return rest('/api/social/awards/vote', { method: 'POST', body: JSON.stringify({ category, entryUserId }) });
      if (entryUserId === uid) throw new Error('You cannot vote for yourself');
      const { error } = await supabase.from('award_votes').upsert(
        { season: currentSeason(), category, voter_id: uid, entry_user_id: entryUserId },
        { onConflict: 'season,category,voter_id' }
      );
      if (error) throw new Error(error.message);
      return { success: true };
    },
    [useSupa, rest, uid]
  );

  // ─────────── NOTIFICATIONS ───────────
  const fetchNotifications = useCallback(
    async () => {
      if (!useSupa) return rest('/api/social/notifications');
      if (!uid) return [];
      const { data } = await supabase.from('notifications').select('*')
        .eq('user_id', uid).order('created_at', { ascending: false }).limit(50);
      return (data || []).map(mapNotif);
    },
    [useSupa, rest, uid]
  );
  const markNotificationsRead = useCallback(
    async () => {
      if (!useSupa) return rest('/api/social/notifications/read', { method: 'POST' });
      if (uid) await supabase.from('notifications').update({ read: true }).eq('user_id', uid).eq('read', false);
      return { success: true };
    },
    [useSupa, rest, uid]
  );

  return {
    fetchFeed, createPost, deletePost, toggleLike, addComment, deleteComment, toggleFollow,
    fetchLeaderboard, fetchBadges,
    fetchAwards, enterAward, voteAward,
    fetchNotifications, markNotificationsRead,
  };
}
