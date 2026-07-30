import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon, IconText } from '../components/Icon';
import { useAuth } from '../hooks/useAuth';
import { useSocial } from '../hooks/useSocial';
import { Feed } from '../components/social/Feed';
import { SeasonalAwards } from '../components/social/SeasonalAwards';
import { Leaderboard } from '../components/social/Leaderboard';
import { NotificationsPanel } from '../components/social/Notifications';
import { Compete } from './Compete';

const TABS = [
  ['feed', 'Feed', '🖼'],
  ['awards', 'Seasonal Awards', '🏆'],
  ['challenges', 'Challenges', '🏁'],
  ['leaderboard', 'Leaderboard', '📊'],
];

export function Social({ navigate }) {
  const { user } = useAuth();
  const { fetchNotifications, markNotificationsRead } = useSocial();
  const [tab, setTab] = useState('feed');
  const [notifs, setNotifs] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const loadNotifs = useCallback(() => {
    fetchNotifications().then(setNotifs).catch(() => {});
  }, [fetchNotifications]);

  useEffect(() => {
    loadNotifs();
    const id = setInterval(loadNotifs, 30000);
    return () => clearInterval(id);
  }, [loadNotifs]);

  const unread = notifs.filter((n) => !n.read).length;

  const markRead = async () => {
    try { await markNotificationsRead(); setNotifs((prev) => prev.map((n) => ({ ...n, read: true }))); }
    catch { /* ignore */ }
  };

  return (
    <div className="h-full w-full bg-ink overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-10">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('landing')} className="text-xs tracking-[0.25em] uppercase text-gray-500 hover:text-white transition">
            <Icon glyph="←" /> Back
          </button>
          <h1 className="font-display font-extrabold text-white text-2xl tracking-tight">SOCIAL</h1>
          <div className="ml-auto relative">
            <button
              onClick={() => setShowNotifs((s) => !s)}
              className="relative w-10 h-10 rounded-full border border-ink-line bg-ink-soft/70 text-lg hover:border-accent-violet transition"
              title="Notifications"
            >
              <Icon glyph="🔔" />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent-violet text-ink text-[10px] font-bold flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            {showNotifs && (
              <NotificationsPanel items={notifs} onClose={() => setShowNotifs(false)} onMarkRead={markRead} />
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-1 border-b border-ink-line overflow-x-auto">
          {TABS.map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`shrink-0 px-4 py-2.5 text-sm border-b-2 -mb-px transition ${
                tab === id ? 'border-accent-violet text-white' : 'border-transparent text-gray-500 hover:text-white'
              }`}
            >
              <span className="mr-1.5"><Icon glyph={icon} size={16} /></span>{label}
            </button>
          ))}
        </div>

        {/* Съдържание */}
        <div className="mt-6 pb-16">
          {tab === 'feed' && <Feed me={user} navigate={navigate} />}
          {tab === 'awards' && <SeasonalAwards me={user} toast={showToast} />}
          {tab === 'challenges' && <Compete navigate={navigate} embedded />}
          {tab === 'leaderboard' && <Leaderboard />}
        </div>
      </div>

      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-ink-soft border border-ink-line px-5 py-2 text-sm text-white backdrop-blur animate-fade-in">
          <IconText size={15}>{toast}</IconText>
        </div>
      )}
    </div>
  );
}
