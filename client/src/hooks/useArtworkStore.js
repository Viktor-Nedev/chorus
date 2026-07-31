import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';
import { poemUrl, AI_UNAVAILABLE } from '../lib/aiEndpoint';
import { describeSupabaseError } from '../lib/setupCheck';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const useSupa = !!supabase;

// Доминираща емоция от историята (сървърът я смяташе; при Supabase — клиентски).
function dominantEmotion(history) {
  if (!Array.isArray(history) || !history.length) return undefined;
  const counts = {};
  for (const e of history) { const em = e?.emotion; if (em) counts[em] = (counts[em] || 0) + 1; }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
}
const ALLOWED_MODES = ['collective', 'moodcheck', 'sculpt'];
const mapArtwork = (r, full = false) => ({
  id: r.id,
  userId: r.user_id,
  author: r.author,
  title: r.title,
  description: r.description || '',
  imageData: r.image_data,
  mode: r.mode || 'solo',
  poem: r.poem || '',
  duration: r.duration || 0,
  dominantEmotion: r.dominant_emotion || undefined,
  videoUrl: r.video_url || undefined,
  totalUsers: r.total_users || undefined,
  createdAt: r.created_at,
  ...(full ? { sceneJson: r.scene_json || undefined } : {}),
});
const LIST_COLS = 'id,user_id,author,title,description,image_data,mode,poem,duration,dominant_emotion,video_url,total_users,created_at';

export function useArtworkStore() {
  const { token, user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const authHeaders = useCallback(
    () => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }),
    [token]
  );

  const saveArtwork = useCallback(async (artwork) => {
    setSaving(true);
    try {
      if (useSupa) {
        const row = {
          user_id: user?.id,
          author: user?.username || 'artist',
          title: String(artwork.title || 'Untitled').slice(0, 100),
          description: String(artwork.description || '').slice(0, 500),
          image_data: artwork.imageData,
          mode: ALLOWED_MODES.includes(artwork.mode) ? artwork.mode : 'solo',
          poem: String(artwork.poem || '').slice(0, 2000),
          duration: Number(artwork.duration) || 0,
          dominant_emotion: dominantEmotion(artwork.emotionHistory),
          scene_json: artwork.sceneJson || null,
          video_url: artwork.videoUrl || null,
          total_users: artwork.totalUsers || null,
        };
        const { data, error } = await supabase.from('artworks').insert(row).select('id').single();
        if (error) throw new Error(describeSupabaseError(error, 'Save'));
        return { id: data.id, success: true };
      }
      const res = await fetch(`${SERVER_URL}/api/gallery`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(artwork),
      });
      if (!res.ok) throw new Error('Save failed');
      return await res.json();
    } finally {
      setSaving(false);
    }
  }, [authHeaders, user?.id, user?.username]);

  const fetchGallery = useCallback(async () => {
    setLoading(true);
    try {
      if (useSupa) {
        const { data, error } = await supabase.from('artworks').select(LIST_COLS).order('created_at', { ascending: false });
        if (error) throw new Error(describeSupabaseError(error, 'Loading the archive'));
        return (data || []).map((r) => mapArtwork(r));
      }
      const res = await fetch(`${SERVER_URL}/api/gallery`);
      if (!res.ok) throw new Error('Fetch failed');
      return await res.json();
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchArtwork = useCallback(async (id) => {
    if (useSupa) {
      const { data, error } = await supabase.from('artworks').select('*').eq('id', id).single();
      if (error) throw new Error(describeSupabaseError(error, 'Opening the artwork'));
      return mapArtwork(data, true);
    }
    const res = await fetch(`${SERVER_URL}/api/gallery/${id}`);
    if (!res.ok) throw new Error('Not found');
    return await res.json();
  }, []);

  const deleteArtwork = useCallback(async (id) => {
    if (useSupa) {
      const { error } = await supabase.from('artworks').delete().eq('id', id);
      if (error) throw new Error(describeSupabaseError(error, 'Delete'));
      return { success: true };
    }
    const res = await fetch(`${SERVER_URL}/api/gallery/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) throw new Error('Delete failed');
    return await res.json();
  }, [authHeaders]);

  // Качва webm blob → { url }. В Supabase режим → Storage bucket 'artwork-videos'.
  const uploadVideo = useCallback(async (blob) => {
    if (useSupa) {
      const path = `${user?.id || 'anon'}/${crypto.randomUUID()}.webm`;
      const { error } = await supabase.storage.from('artwork-videos').upload(path, blob, { contentType: 'video/webm', upsert: false });
      if (error) throw new Error(describeSupabaseError(error, 'Video upload'));
      const { data } = supabase.storage.from('artwork-videos').getPublicUrl(path);
      return { url: data.publicUrl };
    }
    const res = await fetch(`${SERVER_URL}/api/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'video/webm', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: blob,
    });
    if (!res.ok) throw new Error('Video upload failed');
    return res.json();
  }, [token, user?.id]);

  // Поемата минава през Vercel функцията (/api/poem) на хостнатия сайт, или
  // през локалния Express. Ако не успее, записът на творбата пак продължава.
  const generatePoem = useCallback(async (payload) => {
    const res = await fetch(poemUrl(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || AI_UNAVAILABLE);
    }
    const data = await res.json();
    return data.poem;
  }, []);

  return { saveArtwork, fetchGallery, fetchArtwork, deleteArtwork, uploadVideo, generatePoem, saving, loading };
}
