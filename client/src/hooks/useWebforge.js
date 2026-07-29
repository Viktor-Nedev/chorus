import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const BASE = `${SERVER_URL}/api/webforge`;

// Дали Supabase Edge Function-ът е наличен (разбираме го при първия успешен
// call; при 404/липса падаме към Express и не опитваме повече).
let edgeAvailable = !!supabase;

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { data });
  return data;
}

// AI през Edge Function-а; при липса/грешка на функцията → Express сървърът.
async function callAi(action, payload, expressPath) {
  if (supabase && edgeAvailable) {
    try {
      const { data, error } = await supabase.functions.invoke('webforge-ai', {
        body: { action, ...payload },
      });
      if (!error) {
        if (data?.error) throw Object.assign(new Error(data.error), { data });
        return data;
      }
      // Функцията върна грешка: quota → нагоре; иначе fallback към Express
      const ctx = error.context;
      const body = await ctx?.json?.().catch(() => null);
      if (body?.error === 'quota_exceeded') {
        throw Object.assign(new Error('Gemini quota exceeded'), { data: body });
      }
      if (ctx?.status && ctx.status !== 404) {
        throw Object.assign(new Error(body?.error || error.message), { data: body || {} });
      }
      edgeAvailable = false; // функцията не е деплойната
    } catch (e) {
      if (e.data) throw e; // истинска AI грешка — не я маскирай
      edgeAvailable = false;
    }
  }
  try {
    return await post(expressPath, payload);
  } catch (e) {
    if (e.message?.includes('Failed to fetch') || e.name === 'TypeError') {
      throw Object.assign(
        new Error(
          "AI is unavailable: the CHORUS server isn't reachable and the Supabase " +
          "'webforge-ai' function isn't deployed. You can still draw, preview and download."
        ),
        { data: {} }
      );
    }
    throw e;
  }
}

export function useWebforge() {
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const analyze = useCallback(async (payload) => {
    setAnalyzing(true);
    try {
      return await callAi('analyze', payload, '/analyze');
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const generate = useCallback(async (payload) => {
    setGenerating(true);
    try {
      return await callAi('generate', payload, '/generate');
    } finally {
      setGenerating(false);
    }
  }, []);

  const chat = useCallback((payload) => callAi('chat', payload, '/chat'), []);

  // Само за локалния Express път (Docker / server-side save)
  const save = useCallback((payload) => post('/save', payload), []);
  const deployDocker = useCallback((projectId) => post('/deploy/docker', { projectId }), []);

  const stopDocker = useCallback(async (projectId) => {
    const res = await fetch(`${BASE}/deploy/docker/${projectId}`, { method: 'DELETE' });
    return res.json();
  }, []);

  const dockerStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/docker/status`);
      return (await res.json()).available;
    } catch {
      return false;
    }
  }, []);

  const downloadUrl = useCallback((projectId) => `${BASE}/download/${projectId}`, []);

  return {
    analyze, generate, chat, save, deployDocker, stopDocker, dockerStatus, downloadUrl,
    analyzing, generating,
  };
}
