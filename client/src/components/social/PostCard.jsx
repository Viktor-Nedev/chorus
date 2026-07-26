import { useState, useRef } from 'react';
import { useSocial } from '../../hooks/useSocial';
import { useArtworkStore } from '../../hooks/useArtworkStore';
import { avatarGradient, initials } from '../../utils/avatar';
import { BadgeRow } from './Badge';

const MODE_LABEL = { solo: '2D Painting', collective: 'Collective', moodcheck: 'Mirror', sculpt: 'Sculpt' };
const MODE_COLOR = {
  collective: 'text-accent-cyan/80', moodcheck: 'text-yellow-400/80', sculpt: 'text-emerald-300/80', solo: 'text-accent-violet/80',
};

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function PostCard({ post, me, onDelete, navigate }) {
  const social = useSocial();
  const { fetchArtwork } = useArtworkStore();

  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [liked, setLiked] = useState(post.likedByMe);
  const [burst, setBurst] = useState(false);
  const [comments, setComments] = useState(post.comments || []);
  const [showComments, setShowComments] = useState(false);
  const [text, setText] = useState('');
  const [following, setFollowing] = useState(post.followsAuthor);
  const [copied, setCopied] = useState(false);
  const busy = useRef(false);

  const isMine = me?.id === post.userId;

  const like = async () => {
    if (busy.current) return;
    busy.current = true;
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    if (next) { setBurst(true); setTimeout(() => setBurst(false), 450); }
    try {
      const r = await social.toggleLike(post.id);
      setLiked(r.likedByMe);
      setLikeCount(r.likeCount);
    } catch {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
    } finally {
      busy.current = false;
    }
  };

  const comment = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    try {
      const c = await social.addComment(post.id, t);
      setComments((prev) => [...prev, c]);
    } catch { /* ignore */ }
  };

  const removeComment = async (cid) => {
    setComments((prev) => prev.filter((c) => c.id !== cid));
    try { await social.deleteComment(post.id, cid); } catch { /* ignore */ }
  };

  const follow = async () => {
    setFollowing((f) => !f);
    try { const r = await social.toggleFollow(post.userId); setFollowing(r.following); }
    catch { setFollowing((f) => !f); }
  };

  const share = async () => {
    const url = `${window.location.origin}/?post=${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: post.title, text: `“${post.title}” on CHORUS`, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    } catch { /* cancelled */ }
  };

  const remix = async () => {
    let art = { id: post.artworkId, imageData: post.imageData, title: post.title, mode: post.mode, author: post.author };
    try { art = await fetchArtwork(post.artworkId); } catch { /* fallback to denormalized */ }
    // Кредит за remix-а през режима — четем го обратно в PostComposer при публикуване
    sessionStorage.setItem('chorus-remix', JSON.stringify({ postId: post.id, author: post.author }));
    navigate(post.mode === 'sculpt' && art.sceneJson ? 'sculpt' : 'solo', art);
  };

  return (
    <article className="rounded-2xl border border-ink-line bg-ink-soft/50 overflow-hidden animate-fade-in">
      {/* Header: автор + баджове + follow */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center font-display font-bold text-xs text-ink shrink-0"
          style={{ background: avatarGradient(post.author) }}
        >
          {initials(post.author)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">{post.author}</span>
            <BadgeRow badges={post.authorBadges} />
          </div>
          <div className="text-[11px] text-gray-500">
            <span className={MODE_COLOR[post.mode] || 'text-gray-400'}>{MODE_LABEL[post.mode] || post.mode}</span>
            <span> · {timeAgo(post.createdAt)}</span>
            {post.remixOf && <span className="text-accent-cyan/70"> · ♻ remix of {post.remixOf.author}</span>}
          </div>
        </div>
        {!isMine && (
          <button
            onClick={follow}
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] border transition ${
              following ? 'border-ink-line text-gray-400 hover:text-white' : 'border-accent-violet/60 bg-accent-violet/10 text-accent-violet hover:bg-accent-violet/20'
            }`}
          >
            {following ? 'Following' : '+ Follow'}
          </button>
        )}
      </div>

      {/* Изображение */}
      <div className="relative bg-ink">
        {post.imageData && <img src={post.imageData} alt={post.title} className="w-full max-h-[70vh] object-contain" />}
      </div>

      {/* Действия */}
      <div className="px-4 pt-3 flex items-center gap-4 text-sm">
        <button onClick={like} className="group flex items-center gap-1.5 text-gray-300 hover:text-white transition">
          <span className={`text-lg transition-transform ${burst ? 'scale-150' : 'scale-100'} ${liked ? 'text-red-400' : ''}`}>
            {liked ? '♥' : '♡'}
          </span>
          <span>{likeCount}</span>
        </button>
        <button onClick={() => setShowComments((s) => !s)} className="flex items-center gap-1.5 text-gray-300 hover:text-white transition">
          <span className="text-base">💬</span>
          <span>{comments.length}</span>
        </button>
        <button onClick={share} className="flex items-center gap-1.5 text-gray-300 hover:text-white transition">
          <span className="text-base">↗</span>
          <span className="text-xs">{copied ? 'Copied!' : 'Share'}</span>
        </button>
        <button onClick={remix} title="Open in the studio and build on it" className="flex items-center gap-1.5 text-accent-cyan/80 hover:text-accent-cyan transition">
          <span className="text-base">♻</span>
          <span className="text-xs">Remix</span>
        </button>
        {isMine && (
          <button onClick={() => onDelete?.(post.id)} className="ml-auto text-[11px] text-gray-600 hover:text-red-400 transition">
            Delete
          </button>
        )}
      </div>

      {/* Caption + tags */}
      <div className="px-4 pt-2 pb-3">
        <h3 className="font-display font-bold text-white text-sm">{post.title}</h3>
        {post.caption && <p className="mt-1 text-[13px] text-gray-300 leading-snug whitespace-pre-wrap">{post.caption}</p>}
        {post.tags?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {post.tags.map((t) => (
              <span key={t} className="text-[11px] text-accent-cyan/70">#{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Коментари */}
      {showComments && (
        <div className="px-4 pb-4 border-t border-ink-line pt-3 space-y-3">
          {comments.length === 0 && <p className="text-xs text-gray-600">No comments yet — be the first.</p>}
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2 group">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-ink shrink-0"
                style={{ background: avatarGradient(c.author) }}
              >
                {initials(c.author)}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs text-white font-medium">{c.author}</span>
                <span className="text-[10px] text-gray-600 ml-2">{timeAgo(c.at)}</span>
                <p className="text-[13px] text-gray-300 leading-snug break-words">{c.text}</p>
              </div>
              {(c.userId === me?.id || isMine) && (
                <button onClick={() => removeComment(c.id)} className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-600 hover:text-red-400 transition">✕</button>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && comment()}
              maxLength={400}
              placeholder="Add a comment…"
              className="flex-1 rounded-full bg-ink border border-ink-line px-3 py-1.5 text-xs text-white focus:border-accent-violet focus:outline-none"
            />
            <button onClick={comment} disabled={!text.trim()} className="text-xs text-accent-violet disabled:opacity-30 hover:text-white transition">Post</button>
          </div>
        </div>
      )}
    </article>
  );
}
