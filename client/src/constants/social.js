// Споделени социални константи (огледало на server/services/social.js), за да
// не се дублира логиката между Supabase и Express пътищата на клиента.

export const CATEGORIES = [
  { key: 'solo', mode: 'solo', label: '2D Painting', icon: '🎨' },
  { key: 'sculpt', mode: 'sculpt', label: '3D Sculpture', icon: '🧊' },
  { key: 'moodcheck', mode: 'moodcheck', label: 'Portrait & Mood', icon: '🪞' },
  { key: 'collective', mode: 'collective', label: 'Collective Canvas', icon: '🌈' },
];
export const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function currentSeason(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function seasonEndsAt(season) {
  const [y, m] = String(season).split('-').map(Number);
  return new Date(Date.UTC(y, m || 1, 1)).toISOString();
}
export function seasonLabel(season) {
  const [y, m] = String(season).split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}
