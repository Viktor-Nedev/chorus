import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export function useArtworkStore() {
  const { token } = useAuth();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const authHeaders = useCallback(
    () => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const saveArtwork = useCallback(async (artwork) => {
    setSaving(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/gallery`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(artwork),
      });
      if (!res.ok) throw new Error('Save failed');
      return await res.json();
    } finally {
      setSaving(false);
    }
  }, [authHeaders]);

  const fetchGallery = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/gallery`);
      if (!res.ok) throw new Error('Fetch failed');
      return await res.json();
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchArtwork = useCallback(async (id) => {
    const res = await fetch(`${SERVER_URL}/api/gallery/${id}`);
    if (!res.ok) throw new Error('Not found');
    return await res.json();
  }, []);

  const deleteArtwork = useCallback(async (id) => {
    const res = await fetch(`${SERVER_URL}/api/gallery/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Delete failed');
    return await res.json();
  }, [authHeaders]);

  // Качва webm blob → { url }. Реферира се от gallery entry чрез videoUrl.
  const uploadVideo = useCallback(
    async (blob) => {
      const res = await fetch(`${SERVER_URL}/api/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'video/webm', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: blob,
      });
      if (!res.ok) throw new Error('Video upload failed');
      return res.json();
    },
    [token]
  );

  const generatePoem = useCallback(async (payload) => {
    const res = await fetch(`${SERVER_URL}/api/poem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Poem generation failed');
    const data = await res.json();
    return data.poem;
  }, []);

  return { saveArtwork, fetchGallery, fetchArtwork, deleteArtwork, uploadVideo, generatePoem, saving, loading };
}
