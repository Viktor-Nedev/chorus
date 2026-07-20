import { useState, useEffect, useCallback } from 'react';

// Тефтер/книжка с инструкции за Solo режима. Разлиства се страница по
// страница (Prev/Next, стрелки, Esc за затваряне). Всяка страница се
// пре-mount-ва с key={page} → CSS flip анимацията се пуска наново.

const PAGES = [
  {
    title: 'CHORUS · Solo Studio',
    subtitle: 'Ръководство',
    kind: 'cover',
    body: [
      'Рисувай с мишка, с ръката си (камера), с гласа си и с емоциите си.',
      'Разлисти книжката със стрелките → или бутоните долу.',
    ],
  },
  {
    title: 'Основи',
    icon: '🎨',
    items: [
      ['👁 Камера + микрофон', 'Пуска лице/ръка/звук като вход. Без нея рисуваш само с мишка.'],
      ['🖐 Ръка', 'Включва/изключва проследяването на ръката.'],
      ['↶ ↷ Undo / Redo', 'Или Ctrl+Z / Ctrl+Y.'],
      ['Clear', 'Изчиства платното. Save — записва в галерията (по избор с поема).'],
      ['Export', 'Сваля PNG / JPG / WEBP на устройството.'],
    ],
  },
  {
    title: 'Инструменти',
    icon: '🧰',
    items: [
      ['🎆 Chorus', 'Четка от частици, водена от емоцията/жеста. Не оставя петна.'],
      ['🖐️ Hand Draw', 'Рисуване с движение на ръката + 7 стила писци.'],
      ['✏️ Brush', 'Плавна линия с мишката.'],
      ['／ Lines', 'Права, вълна, пунктир, стрелка, зигзаг — избери от подменюто.'],
      ['◇ Shapes', 'Кръг, правоъгълник, триъгълник, звезда, 6/5-ъгълник, ромб, сърце, стрелка.'],
      ['🪣 Fill', 'Запълва оградена област до очертанието (като в Paint).'],
      ['✍️ Text · 💧 Eyedropper · ⌫ Eraser', 'Текст, взимане на цвят, гума.'],
    ],
  },
  {
    title: 'Ръка и жестове',
    icon: '✋',
    items: [
      ['1. Пусни 👁 камерата', 'Hand Draw иска включена камера.'],
      ['2. Свий длан = рисуваш', 'Затворената ръка сваля „писеца".'],
      ['3. Отвори длан (✋) = пауза', 'Или кажи „стоп". Свий пак, за да продължиш.'],
      ['⚡ Smooth', 'Тогъл за изглаждане — маха треперенето на ръката.'],
      ['🪞 Mirror', 'Огледален щрих спрямо вертикалната ос.'],
    ],
  },
  {
    title: 'Гласови команди',
    icon: '🎙',
    items: [
      ['Цветове', '„червено", „злато", „тюркоаз", „магента", „сребро"…'],
      ['Инструменти', '„четка", „кръг", „сърце", „пунктир", „стрелка", „гума", „запълни".'],
      ['Писци', '„молив", „маркер", „калиграфия", „спрей", „неон".'],
      ['Текст', '„текст здравей" → поставя „здравей".'],
      ['Емоция', '„цвят по емоция" → взима цвят от лицето ти.'],
      ['Още', '„по-голям/по-малък", „стоп/рисувай", „изчисти", „запази".'],
    ],
  },
  {
    title: 'Клавиши и съвети',
    icon: '⌨️',
    items: [
      ['Ctrl + Z / Y', 'Undo / Redo.'],
      ['Ctrl + колелце', 'Zoom около центъра. Бутоните 🔍 също.'],
      ['⟲ ⟳', 'Завърта платното на 90°, остава центрирано.'],
      ['Размер на платното', 'Изборът центрира артборда с видима рамка.'],
      ['🎨 Emotion color', 'Бутон в хедъра — цветът следва настроението ти.'],
    ],
  },
];

export function InstructionsBook({ onClose }) {
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState('next');
  const last = PAGES.length - 1;

  const go = useCallback((delta) => {
    setDir(delta > 0 ? 'next' : 'prev');
    setPage((pg) => Math.min(last, Math.max(0, pg + delta)));
  }, [last]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  const pg = PAGES[page];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg h-[560px] max-h-[88vh] rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ perspective: '1600px' }}
      >
        {/* Спирала/подвързия отляво */}
        <div className="absolute left-0 inset-y-0 w-8 bg-gradient-to-r from-ink to-ink-soft border-r border-ink-line z-10 flex flex-col items-center justify-center gap-3">
          {Array.from({ length: 11 }).map((_, i) => (
            <span key={i} className="w-2.5 h-2.5 rounded-full bg-ink-line ring-1 ring-white/10" />
          ))}
        </div>

        <div className="absolute inset-0 pl-8 bg-ink-soft border border-ink-line flex flex-col">
          {/* Затваряне */}
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="absolute top-3 right-3 z-20 w-8 h-8 rounded-lg border border-ink-line text-gray-400 hover:text-white hover:border-gray-500 transition"
          >
            ✕
          </button>

          {/* Страница (пре-mount с key → flip анимация) */}
          <div
            key={page}
            className={`flex-1 overflow-y-auto px-7 py-8 ${dir === 'next' ? 'book-flip-next' : 'book-flip-prev'}`}
            style={{ transformOrigin: 'left center' }}
          >
            {pg.kind === 'cover' ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                <div className="text-5xl">📖</div>
                <h2 className="font-display text-3xl text-white tracking-tight">{pg.title}</h2>
                <p className="text-cyan-300/80 text-sm uppercase tracking-[0.3em]">{pg.subtitle}</p>
                <div className="mt-4 space-y-2 max-w-xs">
                  {pg.body.map((b, i) => (
                    <p key={i} className="text-gray-400 text-sm leading-relaxed">{b}</p>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-3xl">{pg.icon}</span>
                  <h2 className="font-display text-2xl text-white">{pg.title}</h2>
                </div>
                <ul className="space-y-3.5">
                  {pg.items.map(([k, v], i) => (
                    <li key={i} className="flex flex-col gap-0.5">
                      <span className="text-sm text-cyan-200 font-medium">{k}</span>
                      <span className="text-[13px] text-gray-400 leading-snug">{v}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Долна лента: навигация + номер */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-ink-line bg-ink/40">
            <button
              onClick={() => go(-1)}
              disabled={page === 0}
              className="rounded-lg border border-ink-line px-3 py-1.5 text-xs text-gray-300 enabled:hover:bg-ink-line/50 disabled:opacity-30 transition"
            >
              ← Назад
            </button>
            <div className="flex items-center gap-1.5">
              {PAGES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setDir(i > page ? 'next' : 'prev'); setPage(i); }}
                  className={`w-2 h-2 rounded-full transition ${i === page ? 'bg-cyan-400' : 'bg-ink-line hover:bg-gray-600'}`}
                  aria-label={`Page ${i + 1}`}
                />
              ))}
            </div>
            <button
              onClick={() => go(1)}
              disabled={page === last}
              className="rounded-lg border border-ink-line px-3 py-1.5 text-xs text-gray-300 enabled:hover:bg-ink-line/50 disabled:opacity-30 transition"
            >
              Напред →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
