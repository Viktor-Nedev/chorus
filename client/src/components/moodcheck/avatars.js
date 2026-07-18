import * as THREE from 'three';

// Avatar = параметричен набор върху ЖИВОТО лице на потребителя. deform
// преоформя реалния face mesh (1 = без промяна), accessory добавя частици на
// герой (уши/рога/...), закотвени към главата. Затова всеки аватар ВИНАГИ
// имитира лицето ти. "Real" = чиста идентичност → 1:1 твоето лице.
//
// deform: eye (радиус на очите), faceLength (издължаване на черепа),
// jaw (ширина на челюстта), cheek (издуване/хлътване на бузите),
// nose (размер на носа), eyeDepth (хлътналост на очите по z).

const IDENTITY = { eye: 1, faceLength: 1, jaw: 1, cheek: 1, nose: 1, eyeDepth: 1 };
const d = (over) => ({ ...IDENTITY, ...over });

export const AVATARS = [
  // ── Лица (деформации на собственото ти лице) ──
  { id: 'real', label: 'Real (1:1)', emoji: '🪞', family: 'face', deform: d({}), accessory: 'none', particleSize: 1.0, glow: 0.35, fixedColor: '#8B7BFA' },
  { id: 'bigeyes', label: 'Big Eyes', emoji: '👀', family: 'face', deform: d({ eye: 1.7, jaw: 0.92 }), accessory: 'none', particleSize: 1.0, glow: 0.4, fixedColor: '#67E8F9' },
  { id: 'alien', label: 'Alien', emoji: '👽', family: 'face', deform: d({ eye: 1.55, faceLength: 1.35, jaw: 0.68, nose: 0.7 }), accessory: 'antenna', particleSize: 0.95, glow: 0.5, fixedColor: '#64FFB4' },
  { id: 'skull', label: 'Skull', emoji: '💀', family: 'face', deform: d({ eye: 0.85, eyeDepth: 1.8, cheek: 0.6, jaw: 1.1 }), accessory: 'none', particleSize: 0.95, glow: 0.3, fixedColor: '#E8E8EE' },
  { id: 'chipmunk', label: 'Chipmunk', emoji: '🐿', family: 'face', deform: d({ cheek: 1.9, jaw: 1.15, eye: 1.1 }), accessory: 'none', particleSize: 1.0, glow: 0.4, fixedColor: '#FFD27F' },

  // ── Герои (твоето лице + аксесоари) ──
  { id: 'cat', label: 'Cat', emoji: '🐱', family: 'character', deform: d({ nose: 0.85, cheek: 1.1 }), accessory: 'catEars', particleSize: 1.0, glow: 0.45, fixedColor: '#FFB86B' },
  { id: 'devil', label: 'Devil', emoji: '😈', family: 'character', deform: d({ jaw: 1.05 }), accessory: 'horns', particleSize: 1.0, glow: 0.55, fixedColor: '#FF5555' },
  { id: 'robot', label: 'Robot', emoji: '🤖', family: 'character', deform: d({ jaw: 1.1 }), accessory: 'antenna', particleSize: 1.35, glow: 0.5, fixedColor: '#67E8F9' },
  { id: 'angel', label: 'Angel', emoji: '😇', family: 'character', deform: d({}), accessory: 'halo', particleSize: 1.0, glow: 0.65, fixedColor: '#FFE3B0' },
];

// Runtime форма: hex → THREE.Color (нула алокации при live смяна)
export function toRuntime(a) {
  return { ...a, fixedColorObj: new THREE.Color(a.fixedColor) };
}

export const AVATAR_MAP = Object.fromEntries(AVATARS.map((a) => [a.id, toRuntime(a)]));
export const DEFAULT_AVATAR = 'real';

export const ACCESSORY_TYPES = ['none', 'catEars', 'horns', 'antenna', 'halo', 'whiskers'];

// Клампове за custom/AI параметри
export function clampAvatar(raw = {}) {
  const c = (v, lo, hi, dv) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dv;
  };
  const dm = raw.deform || {};
  return {
    id: 'custom',
    label: raw.label ? String(raw.label).slice(0, 24) : 'My Custom',
    emoji: '⭐',
    family: 'custom',
    deform: {
      eye: c(dm.eye, 0.4, 2.2, 1),
      faceLength: c(dm.faceLength, 0.6, 1.6, 1),
      jaw: c(dm.jaw, 0.5, 1.6, 1),
      cheek: c(dm.cheek, 0.3, 2.2, 1),
      nose: c(dm.nose, 0.4, 2.0, 1),
      eyeDepth: c(dm.eyeDepth, 0.5, 2.2, 1),
    },
    accessory: ACCESSORY_TYPES.includes(raw.accessory) ? raw.accessory : 'none',
    particleSize: c(raw.particleSize, 0.6, 1.8, 1),
    glow: c(raw.glow, 0, 1, 0.4),
    fixedColor: /^#[0-9a-fA-F]{6}$/.test(raw.fixedColor || '') ? raw.fixedColor : '#8B7BFA',
  };
}
