import { useState, useRef, useEffect } from 'react';

const hsl = (c) => (c ? `hsl(${c.h}, ${c.s}%, ${c.l}%)` : '#aaa');

// Сгъваем чат панел (дясно). Badge с непрочетени при затворен панел.
export function ChatPanel({ messages, onSend, myId }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [unread, setUnread] = useState(0);
  const endRef = useRef(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (openRef.current) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else if (messages.length) {
      setUnread((u) => u + 1);
    }
  }, [messages]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };

  return (
    <>
      <button
        onClick={() => {
          setOpen((o) => !o);
          setUnread(0);
        }}
        className={`absolute right-4 bottom-20 z-30 w-11 h-11 rounded-full border flex items-center justify-center text-lg transition ${
          open
            ? 'bg-accent-cyan/25 border-accent-cyan text-white'
            : 'bg-ink-soft/80 border-ink-line text-gray-300 hover:text-white backdrop-blur'
        }`}
        title="Chat"
      >
        💬
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-accent-violet text-[10px] text-ink font-bold flex items-center justify-center px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-4 bottom-[8.5rem] z-30 w-72 max-h-[50vh] rounded-xl bg-ink-soft/90 border border-ink-line backdrop-blur flex flex-col animate-fade-in overflow-hidden">
          <div className="px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-gray-500 border-b border-ink-line shrink-0">
            Session chat
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-[120px]">
            {messages.length === 0 && (
              <p className="text-[11px] text-gray-600 text-center pt-6">Say hi to the chorus 👋</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className="text-xs leading-relaxed break-words">
                <span className="font-bold" style={{ color: hsl(m.color) }}>
                  {m.userId === myId ? 'you' : m.nickname}
                </span>
                <span className="text-gray-300"> {m.text}</span>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="p-2 border-t border-ink-line flex gap-1.5 shrink-0">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              maxLength={200}
              placeholder="Message…"
              className="flex-1 rounded-lg bg-ink border border-ink-line px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-accent-cyan"
            />
            <button
              onClick={send}
              className="rounded-lg bg-accent-cyan/80 px-2.5 text-xs text-ink hover:bg-accent-cyan transition"
            >
              →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
