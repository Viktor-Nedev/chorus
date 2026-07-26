// Детерминистичен hue от низ (username) → аватар-градиент. Изнесено, за да
// го ползват Profile, PostCard и Leaderboard еднакво.
export function avatarHue(name = '?') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function avatarGradient(name = '?') {
  const hue = avatarHue(name);
  return `linear-gradient(135deg, hsl(${hue},70%,62%), hsl(${(hue + 50) % 360},70%,52%))`;
}

export const initials = (name = '?') => name.slice(0, 2).toUpperCase();
