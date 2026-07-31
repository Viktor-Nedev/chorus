import { useState, useCallback } from 'react';
import { webforgeRequest, AI_UNAVAILABLE } from '../lib/aiEndpoint';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const BASE = `${SERVER_URL}/api/webforge`;

// AI заявка → Vercel функция на същия домейн (или локалния Express).
async function callAi(action, payload) {
  const { url, body } = webforgeRequest(action, payload);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error(AI_UNAVAILABLE), { data: {} });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { data });
  return data;
}

// Само за локалния Express път (Docker / server-side save)
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

export function useWebforge() {
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const analyze = useCallback(async (payload) => {
    setAnalyzing(true);
    try {
      return await callAi('analyze', payload);
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const generate = useCallback(async (payload) => {
    setGenerating(true);
    try {
      return await callAi('generate', payload);
    } finally {
      setGenerating(false);
    }
  }, []);

  const chat = useCallback((payload) => callAi('chat', payload), []);

  // Docker/save съществуват само при локален Express сървър
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
