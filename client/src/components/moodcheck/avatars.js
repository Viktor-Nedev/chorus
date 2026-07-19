import * as THREE from 'three';

// Avatar типове:
//  - 'live'      → живото ти лице 1:1 (Real) или с deform параметри (custom sliders)
//  - 'character' → СЪВСЕМ различно процедурно лице (котка/череп/...), rigged от
//                  живите ти изражения (уста/мигане/усмивка/поза на главата)
//  - 'drawn'     → нарисуван от теб аватар (точки от щрихи), закачен за главата
// Всички типове ВИНАГИ имитират потребителя.

const IDENTITY = { eye: 1, faceLength: 1, jaw: 1, cheek: 1, nose: 1, eyeDepth: 1 };

export const AVATARS = [
  { id: 'real', label: 'Real (1:1)', emoji: '🪞', type: 'live', deform: { ...IDENTITY }, accessory: 'none', particleSize: 1.0, glow: 0.35, fixedColor: '#8B7BFA' },
  { id: 'cat', label: 'Cat', emoji: '🐱', type: 'character', character: 'cat', particleSize: 1.0, glow: 0.45, fixedColor: '#FFB86B' },
  { id: 'alien', label: 'Alien', emoji: '👽', type: 'character', character: 'alien', particleSize: 1.0, glow: 0.5, fixedColor: '#64FFB4' },
  { id: 'skull', label: 'Skull', emoji: '💀', type: 'character', character: 'skull', particleSize: 1.0, glow: 0.35, fixedColor: '#E8E8EE' },
  { id: 'robot', label: 'Robot', emoji: '🤖', type: 'character', character: 'robot', particleSize: 1.1, glow: 0.5, fixedColor: '#67E8F9' },
  { id: 'devil', label: 'Devil', emoji: '😈', type: 'character', character: 'devil', particleSize: 1.0, glow: 0.55, fixedColor: '#FF5555' },
  { id: 'ghost', label: 'Ghost', emoji: '👻', type: 'character', character: 'ghost', particleSize: 1.0, glow: 0.6, fixedColor: '#BFDFFF' },
];

export function toRuntime(a) {
  return { ...a, fixedColorObj: new THREE.Color(a.fixedColor || '#8B7BFA') };
}

export const AVATAR_MAP = Object.fromEntries(AVATARS.map((a) => [a.id, toRuntime(a)]));
export const DEFAULT_AVATAR = 'real';

export const ACCESSORY_TYPES = ['none', 'catEars', 'horns', 'antenna', 'halo', 'whiskers', 'tongue'];
export const CHARACTER_TYPES = ['cat', 'alien', 'skull', 'robot', 'devil', 'ghost'];

// Клампове за custom/AI/drawn параметри (същата логика като на сървъра)
export function clampAvatar(raw = {}) {
  const c = (v, lo, hi, dv) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dv;
  };
  const base = {
    id: raw.id || undefined,
    label: raw.label ? String(raw.label).slice(0, 24) : 'My Custom',
    emoji: raw.emoji && String(raw.emoji).length <= 4 ? raw.emoji : '⭐',
    particleSize: c(raw.particleSize, 0.6, 1.8, 1),
    glow: c(raw.glow, 0, 1, 0.4),
    fixedColor: /^#[0-9a-fA-F]{6}$/.test(raw.fixedColor || '') ? raw.fixedColor : '#8B7BFA',
  };
  if (raw.type === 'drawn' && Array.isArray(raw.points)) {
    return {
      ...base,
      type: 'drawn',
      points: raw.points
        .slice(0, 5000)
        .filter((p) => Array.isArray(p) && p.length >= 2)
        .map(([x, y]) => [c(x, -1, 1, 0), c(y, -1, 1, 0)]),
    };
  }
  if (raw.type === 'character' && CHARACTER_TYPES.includes(raw.character)) {
    return { ...base, type: 'character', character: raw.character };
  }
  const dm = raw.deform || {};
  return {
    ...base,
    type: 'live',
    deform: {
      eye: c(dm.eye, 0.4, 2.2, 1),
      faceLength: c(dm.faceLength, 0.6, 1.6, 1),
      jaw: c(dm.jaw, 0.5, 1.6, 1),
      cheek: c(dm.cheek, 0.3, 2.2, 1),
      nose: c(dm.nose, 0.4, 2.0, 1),
      eyeDepth: c(dm.eyeDepth, 0.5, 2.2, 1),
    },
    accessory: ACCESSORY_TYPES.includes(raw.accessory) ? raw.accessory : 'none',
  };
}
