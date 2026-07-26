import { useCallback } from 'react';
import { useAuth } from './useAuth';

// Централен клиент за /api/social — за да не се дублира authFetch логиката
// из компонентите. Всеки метод хвърля при не-OK отговор с message от server-а.
export function useSocial() {
  const { authFetch } = useAuth();

  const call = useCallback(
    async (url, options) => {
      const res = await authFetch(url, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    },
    [authFetch]
  );

  // ── Feed / posts ──
  const fetchFeed = useCallback(
    (params = {}) => {
      const qs = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
      ).toString();
      return call(`/api/social/feed${qs ? `?${qs}` : ''}`);
    },
    [call]
  );
  const createPost = useCallback(
    (body) => call('/api/social/posts', { method: 'POST', body: JSON.stringify(body) }),
    [call]
  );
  const deletePost = useCallback((id) => call(`/api/social/posts/${id}`, { method: 'DELETE' }), [call]);
  const toggleLike = useCallback((id) => call(`/api/social/posts/${id}/like`, { method: 'POST' }), [call]);
  const addComment = useCallback(
    (id, text) => call(`/api/social/posts/${id}/comment`, { method: 'POST', body: JSON.stringify({ text }) }),
    [call]
  );
  const deleteComment = useCallback(
    (id, cid) => call(`/api/social/posts/${id}/comment/${cid}`, { method: 'DELETE' }),
    [call]
  );
  const toggleFollow = useCallback((userId) => call(`/api/social/follow/${userId}`, { method: 'POST' }), [call]);

  // ── Leaderboard / badges ──
  const fetchLeaderboard = useCallback(() => call('/api/social/creators/leaderboard'), [call]);
  const fetchBadges = useCallback((userId) => call(`/api/social/badges/${userId}`), [call]);

  // ── Seasonal awards ──
  const fetchAwards = useCallback(() => call('/api/social/awards/current'), [call]);
  const enterAward = useCallback(
    (category, artworkId) => call('/api/social/awards/enter', { method: 'POST', body: JSON.stringify({ category, artworkId }) }),
    [call]
  );
  const voteAward = useCallback(
    (category, entryUserId) => call('/api/social/awards/vote', { method: 'POST', body: JSON.stringify({ category, entryUserId }) }),
    [call]
  );

  // ── Notifications ──
  const fetchNotifications = useCallback(() => call('/api/social/notifications'), [call]);
  const markNotificationsRead = useCallback(
    () => call('/api/social/notifications/read', { method: 'POST' }),
    [call]
  );

  return {
    fetchFeed, createPost, deletePost, toggleLike, addComment, deleteComment, toggleFollow,
    fetchLeaderboard, fetchBadges,
    fetchAwards, enterAward, voteAward,
    fetchNotifications, markNotificationsRead,
  };
}
