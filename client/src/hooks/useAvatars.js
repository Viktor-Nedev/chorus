import { useCallback } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';

const useSupa = !!supabase;
const MAX_AVATARS = 8;
const newId = () => 'av' + Math.random().toString(36).slice(2, 10);

// Mirror кастъм аватари (list + избор на cam аватар). Dual-backend: Supabase
// таблица `user_avatars` (един ред/потребител, jsonb list) или Express
// `/api/users/avatar`. Еднакви return-форми: { list, camAvatarId } / { avatar, list, camAvatarId }.
export function useAvatars() {
  const { authFetch, user } = useAuth();
  const uid = user?.id;

  const readRow = useCallback(async () => {
    const { data } = await supabase.from('user_avatars').select('list,cam_avatar_id').eq('user_id', uid).maybeSingle();
    return { list: data?.list || [], camAvatarId: data?.cam_avatar_id ?? null };
  }, [uid]);
  const writeRow = useCallback(async (list, camAvatarId) => {
    const { error } = await supabase.from('user_avatars').upsert(
      { user_id: uid, list, cam_avatar_id: camAvatarId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }
    );
    if (error) throw new Error(error.message);
  }, [uid]);

  const getAvatars = useCallback(async () => {
    if (useSupa) return readRow();
    const res = await authFetch('/api/users/avatar');
    return res.ok ? res.json() : { list: [], camAvatarId: null };
  }, [authFetch, readRow]);

  const saveAvatar = useCallback(async (params) => {
    if (!useSupa) {
      const res = await authFetch('/api/users/avatar', { method: 'PUT', body: JSON.stringify(params) });
      if (!res.ok) throw new Error('Could not save avatar');
      return res.json();
    }
    const { list, camAvatarId } = await readRow();
    const avatar = { ...params, id: /^av[a-z0-9]{1,24}$/i.test(params.id || '') ? params.id : newId() };
    const i = list.findIndex((a) => a.id === avatar.id);
    if (i >= 0) list[i] = avatar;
    else { if (list.length >= MAX_AVATARS) list.shift(); list.push(avatar); }
    await writeRow(list, camAvatarId);
    return { avatar, list, camAvatarId };
  }, [authFetch, readRow, writeRow]);

  const deleteAvatar = useCallback(async (id) => {
    if (!useSupa) {
      const res = await authFetch(`/api/users/avatar/${id}`, { method: 'DELETE' });
      return res.ok ? res.json() : { list: [], camAvatarId: null };
    }
    const { list, camAvatarId } = await readRow();
    const next = list.filter((a) => a.id !== id);
    const cam = camAvatarId === id ? null : camAvatarId;
    await writeRow(next, cam);
    return { list: next, camAvatarId: cam };
  }, [authFetch, readRow, writeRow]);

  const setCamAvatar = useCallback(async (id) => {
    if (!useSupa) {
      const res = await authFetch('/api/users/avatar/cam', { method: 'PUT', body: JSON.stringify({ camAvatarId: id }) });
      return res.ok ? res.json() : { camAvatarId: null };
    }
    const { list, camAvatarId } = await readRow();
    const cam = id && list.some((a) => a.id === id) ? id : null;
    await writeRow(list, cam);
    return { camAvatarId: cam, prev: camAvatarId };
  }, [authFetch, readRow, writeRow]);

  return { getAvatars, saveAvatar, deleteAvatar, setCamAvatar };
}
