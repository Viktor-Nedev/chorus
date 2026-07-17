import { useState } from 'react';
import { AuthParticles } from '../components/AuthParticles';
import { useAuth } from '../hooks/useAuth';

// Split-screen auth: вляво частици + послание, вдясно Login/Sign up карта.
export function Auth({ navigate, postAuthTarget }) {
  const { login, register, backend } = useAuth();
  const [tab, setTab] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (tab === 'signup') await register(email.trim(), username.trim(), password);
      else await login(email.trim(), password);
      navigate(postAuthTarget || 'landing');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'w-full rounded-lg bg-ink border border-ink-line px-3 py-2.5 text-sm text-white focus:border-accent-violet focus:outline-none transition';

  return (
    <div className="h-full w-full bg-ink flex overflow-hidden">
      {/* ── LEFT: particles ── */}
      <div className="hidden md:block relative w-1/2 border-r border-ink-line overflow-hidden">
        <AuthParticles />
        <div className="absolute inset-0 flex flex-col justify-end p-10 pointer-events-none bg-gradient-to-t from-ink via-transparent to-transparent">
          <div className="font-display font-extrabold text-4xl text-white tracking-[0.25em]">
            CHORUS
          </div>
          <p className="mt-3 max-w-sm text-sm text-gray-400 leading-relaxed">
            Paint with your voice, face and hands. Build websites from sketches.
            Sculpt worlds in 3D. Together.
          </p>
        </div>
      </div>

      {/* ── RIGHT: form ── */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm animate-slide-up">
          <button
            onClick={() => navigate('landing')}
            className="text-sm text-gray-500 hover:text-white transition mb-8"
          >
            ← Back
          </button>

          <h1 className="font-display font-bold text-2xl text-white mb-1">
            {tab === 'login' ? 'Welcome back' : 'Join the chorus'}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {tab === 'login'
              ? 'Log in to paint, compete and share.'
              : 'One account for every mode — solo, collective, 3D and more.'}
          </p>

          {/* Tabs */}
          <div className="flex rounded-lg border border-ink-line p-1 mb-6">
            {['login', 'signup'].map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setError(null);
                }}
                className={`flex-1 rounded-md py-1.5 text-xs uppercase tracking-[0.15em] transition ${
                  tab === t ? 'bg-accent-violet/25 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t === 'login' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-xs text-gray-400 mb-1 block">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputCls}
              />
            </label>

            {tab === 'signup' && (
              <label className="block animate-fade-in">
                <span className="text-xs text-gray-400 mb-1 block">Username</span>
                <input
                  required
                  minLength={3}
                  maxLength={24}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="how others will see you"
                  className={inputCls}
                />
              </label>
            )}

            <label className="block">
              <span className="text-xs text-gray-400 mb-1 block">Password</span>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="at least 6 characters"
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-sm"
                  title={showPass ? 'Hide' : 'Show'}
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </label>

            {error && (
              <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300 animate-fade-in">
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-accent-violet/85 py-2.5 text-sm font-bold text-ink hover:bg-accent-violet transition disabled:opacity-50"
            >
              {busy ? 'Please wait…' : tab === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-[11px] text-gray-600 text-center">
            {backend === 'supabase'
              ? 'Secured by Supabase Auth'
              : 'Accounts are stored on the CHORUS server'}
          </p>
        </div>
      </div>
    </div>
  );
}
