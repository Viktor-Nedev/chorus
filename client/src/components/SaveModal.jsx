import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export function SaveModal({ defaultTitle, defaultAuthor = '', mode, onSave, onCancel, saving }) {
  const { user } = useAuth();
  const [title, setTitle] = useState(defaultTitle);
  const [author, setAuthor] = useState(defaultAuthor);
  const [description, setDescription] = useState('');
  const [generatePoem, setGeneratePoem] = useState(true);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      title: title.trim() || defaultTitle,
      author: user?.username || author.trim() || 'Anonymous',
      description: description.trim(),
      generatePoem,
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <form
        onSubmit={handleSubmit}
        className="max-w-md w-full mx-4 rounded-2xl bg-ink-soft border border-ink-line p-6 animate-slide-up"
      >
        <h2 className="font-display text-xl text-white mb-5">
          Save {mode === 'collective' ? 'Collective Session' : 'Artwork'}
        </h2>

        <label className="block mb-3">
          <span className="text-xs text-gray-400 mb-1 block">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            className="w-full rounded-lg bg-ink border border-ink-line px-3 py-2 text-sm text-white focus:border-violet-400 focus:outline-none"
          />
        </label>

        {user ? (
          <p className="mb-3 text-xs text-gray-500">
            Publishing as <span className="text-gray-300 font-bold">{user.username}</span>
          </p>
        ) : (
          <label className="block mb-3">
            <span className="text-xs text-gray-400 mb-1 block">Author</span>
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              maxLength={40}
              placeholder="Anonymous"
              className="w-full rounded-lg bg-ink border border-ink-line px-3 py-2 text-sm text-white focus:border-violet-400 focus:outline-none"
            />
          </label>
        )}

        <label className="block mb-3">
          <span className="text-xs text-gray-400 mb-1 block">Description (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            rows={2}
            className="w-full rounded-lg bg-ink border border-ink-line px-3 py-2 text-sm text-white focus:border-violet-400 focus:outline-none resize-none"
          />
        </label>

        {mode !== 'sculpt' && mode !== 'moodcheck' && (
          <label className="flex items-center gap-2 mb-5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={generatePoem}
              onChange={(e) => setGeneratePoem(e.target.checked)}
              className="accent-violet-500"
            />
            <span className="text-sm text-gray-300">Generate poem about this artwork</span>
          </label>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 rounded-lg border border-ink-line py-2 text-sm text-gray-300 hover:bg-ink-line/50 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-violet-600 py-2 text-sm text-white hover:bg-violet-500 transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
