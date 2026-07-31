import { useCallback } from 'react';
import { describeSupabaseError } from '../lib/setupCheck';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const useSupa = !!supabase;

// Изчислен публичен изглед на състезание (огледало на server publicView).
function publicView(c, entries, votes, uid) {
  const tally = {};
  votes.forEach((v) => { tally[v.entry_user_id] = (tally[v.entry_user_id] || 0) + 1; });
  const ended = Date.now() > new Date(c.ends_at).getTime();
  let winner = null;
  if (ended && entries.length) {
    const best = [...entries].sort(
      (a, b) => (tally[b.user_id] || 0) - (tally[a.user_id] || 0) || new Date(a.created_at) - new Date(b.created_at)
    )[0];
    if (best) winner = { userId: best.user_id, username: best.username, votes: tally[best.user_id] || 0 };
  }
  return {
    id: c.id,
    theme: c.theme,
    description: c.description || '',
    createdBy: { id: c.created_by, username: c.created_by_name },
    createdAt: c.created_at,
    endsAt: c.ends_at,
    ended,
    winner,
    totalVotes: votes.length,
    myVote: uid ? votes.find((v) => v.voter_id === uid)?.entry_user_id || null : null,
    entries: entries.map((e) => ({
      userId: e.user_id, username: e.username, artworkId: e.artwork_id,
      title: e.title, imageData: e.image_data, at: e.created_at, votes: tally[e.user_id] || 0,
    })),
  };
}

export function useCompetitions() {
  const { authFetch, user } = useAuth();
  const uid = user?.id;
  const uname = user?.username;

  const rest = useCallback(
    async (url, options) => {
      const res = await authFetch(url, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    },
    [authFetch]
  );

  const oneView = useCallback(async (compId) => {
    const [{ data: c }, { data: entries }, { data: votes }] = await Promise.all([
      supabase.from('competitions').select('*').eq('id', compId).single(),
      supabase.from('competition_entries').select('*').eq('competition_id', compId),
      supabase.from('competition_votes').select('*').eq('competition_id', compId),
    ]);
    return publicView(c, entries || [], votes || [], uid);
  }, [uid]);

  const list = useCallback(async () => {
    if (!useSupa) return rest('/api/competitions');
    const [{ data: comps }, { data: entries }, { data: votes }] = await Promise.all([
      supabase.from('competitions').select('*').order('created_at', { ascending: false }),
      supabase.from('competition_entries').select('*'),
      supabase.from('competition_votes').select('*'),
    ]);
    return (comps || []).map((c) =>
      publicView(c, (entries || []).filter((e) => e.competition_id === c.id), (votes || []).filter((v) => v.competition_id === c.id), uid)
    );
  }, [rest, uid]);

  const create = useCallback(async ({ theme, description, hours }) => {
    if (!useSupa) return rest('/api/competitions', { method: 'POST', body: JSON.stringify({ theme, description, hours }) });
    const h = Math.min(24 * 14, Math.max(1, Number(hours) || 24));
    const { data, error } = await supabase.from('competitions').insert({
      theme: String(theme).slice(0, 80), description: String(description || '').slice(0, 300),
      created_by: uid, created_by_name: uname,
      ends_at: new Date(Date.now() + h * 3600 * 1000).toISOString(),
    }).select('*').single();
    if (error) throw new Error(describeSupabaseError(error, 'Competitions'));
    return publicView(data, [], [], uid);
  }, [rest, uid, uname]);

  const enter = useCallback(async (compId, artworkId) => {
    if (!useSupa) return rest(`/api/competitions/${compId}/enter`, { method: 'POST', body: JSON.stringify({ artworkId }) });
    const { data: art } = await supabase.from('artworks').select('title,image_data,user_id').eq('id', artworkId).single();
    if (!art) throw new Error('Artwork not found');
    if (art.user_id !== uid) throw new Error('You can only enter your own artwork');
    const { error } = await supabase.from('competition_entries').insert({
      competition_id: compId, user_id: uid, username: uname, artwork_id: artworkId, title: art.title, image_data: art.image_data,
    });
    if (error) throw new Error(error.code === '23505' ? 'You already entered this competition' : error.message);
    return oneView(compId);
  }, [rest, uid, uname, oneView]);

  const vote = useCallback(async (compId, entryUserId) => {
    if (!useSupa) return rest(`/api/competitions/${compId}/vote`, { method: 'POST', body: JSON.stringify({ entryUserId }) });
    if (entryUserId === uid) throw new Error('You cannot vote for yourself');
    const { error } = await supabase.from('competition_votes').upsert(
      { competition_id: compId, voter_id: uid, entry_user_id: entryUserId }, { onConflict: 'competition_id,voter_id' }
    );
    if (error) throw new Error(describeSupabaseError(error, 'Competitions'));
    return oneView(compId);
  }, [rest, uid, oneView]);

  return { list, create, enter, vote };
}
