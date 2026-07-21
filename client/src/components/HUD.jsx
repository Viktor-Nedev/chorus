import { EMOTION_CONFIGS, EMOTION_HEX, GESTURE_LABELS } from '../constants/emotions';
import { ParticleCam } from './ParticleCam';

// Emotion sidebar (Solo) / участници + състояние (Collective)
export function EmotionSidebar({
  emotion,
  gesture,
  videoRef,
  emotionHistory,
  getWaveform,
  visible,
  onToggle,
  camAvatar, // { color } когато потребителят е избрал particle аватар вместо камера
  landmarksBufRef,
  landmarkStampRef,
  position, // { x, y } когато е откачен; null = докиран горе-вдясно
  onDragTo, // (x,y) при влачене за заглавието
  onDock, // връщане в default позиция
}) {
  const config = EMOTION_CONFIGS[emotion] || EMOTION_CONFIGS.neutral;
  const gestureInfo = GESTURE_LABELS[gesture] || GESTURE_LABELS.NO_HAND;

  if (!visible) {
    return (
      <button
        onClick={onToggle}
        className="absolute right-3 top-20 z-20 rounded-lg bg-ink-soft/80 border border-ink-line px-2 py-1 text-xs text-gray-400 hover:text-white backdrop-blur"
        title="Show emotion panel"
      >
        ◀
      </button>
    );
  }

  const detached = !!position;

  // Влачене за заглавната лента (pointer events → clamp в екрана)
  const startDrag = (e) => {
    if (!onDragTo) return;
    e.preventDefault();
    const panel = e.currentTarget.closest('[data-live-panel]');
    const rect = panel.getBoundingClientRect();
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;
    const move = (ev) => {
      const x = Math.max(4, Math.min(window.innerWidth - rect.width - 4, ev.clientX - offX));
      const y = Math.max(4, Math.min(window.innerHeight - 40, ev.clientY - offY));
      onDragTo({ x, y });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      data-live-panel
      className={`${detached ? 'fixed' : 'absolute right-3 top-20'} z-30 w-[200px] rounded-xl bg-ink-soft/90 border border-ink-line backdrop-blur p-3 flex flex-col gap-3 animate-fade-in`}
      style={detached ? { left: position.x, top: position.y } : undefined}
    >
      <div
        onPointerDown={startDrag}
        className="flex items-center justify-between -m-1 mb-0 p-1 cursor-grab active:cursor-grabbing select-none"
        title="Drag to move the panel"
      >
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gray-500 font-body">
          <span className="text-gray-600">⠿</span> Live State
        </span>
        <span className="flex items-center gap-1.5">
          <button
            onClick={detached ? onDock : () => onDragTo?.({ x: window.innerWidth - 220, y: 80 })}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-xs text-gray-500 hover:text-white"
            title={detached ? 'Dock back to the corner' : 'Detach panel'}
          >
            {detached ? '⤢' : '⛶'}
          </button>
          <button
            onClick={onToggle}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-xs text-gray-500 hover:text-white"
            title="Hide panel"
          >
            ▶
          </button>
        </span>
      </div>

      {/* Текуща емоция */}
      <div className="flex items-center gap-3">
        <span className="text-4xl">{config.emoji}</span>
        <div>
          <div className="text-sm font-medium" style={{ color: EMOTION_HEX[emotion] }}>
            {config.label}
          </div>
          <div className="text-[10px] text-gray-500">detected emotion</div>
        </div>
      </div>

      {/* Live preview — реална камера ИЛИ particle аватар */}
      {camAvatar ? (
        <ParticleCam
          landmarksBufRef={landmarksBufRef}
          landmarkStampRef={landmarkStampRef}
          color={camAvatar.color}
          width={160}
          height={120}
          className="w-full rounded-lg border border-ink-line bg-black"
        />
      ) : (
        <LivePreview videoRef={videoRef} />
      )}

      {/* Жест */}
      <div className="flex items-center gap-2 text-xs text-gray-300">
        <span className="text-xl w-7 text-center">{gestureInfo.emoji}</span>
        <span>{gestureInfo.label}</span>
      </div>

      {/* Audio waveform */}
      <WaveformMini getWaveform={getWaveform} />

      {/* Emotion history — последните 60 секунди */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
          Emotion History
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded">
          {emotionHistory.length === 0 ? (
            <div className="w-full bg-ink-line" />
          ) : (
            emotionHistory.slice(-60).map((e, i) => (
              <div
                key={i}
                className="flex-1"
                style={{ backgroundColor: EMOTION_HEX[e.emotion] || '#333' }}
                title={`${e.emotion} @ ${e.timestamp}s`}
              />
            ))
          )}
        </div>
        <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
          <span>-60s</span>
          <span>now</span>
        </div>
      </div>
    </div>
  );
}

// Малко видео preview — копира кадри от скрития processing video
import { useEffect, useRef } from 'react';

function LivePreview({ videoRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    let raf;
    const draw = () => {
      const video = videoRef?.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.scale(-1, 1); // огледално
        ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={120}
      className="w-full rounded-lg border border-ink-line bg-black"
    />
  );
}

function WaveformMini({ getWaveform }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    let raf;
    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas && getWaveform) {
        const data = getWaveform();
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (data) {
          const barCount = 32;
          const step = Math.floor(data.length / barCount);
          const barW = canvas.width / barCount;
          ctx.fillStyle = '#a78bfa';
          for (let i = 0; i < barCount; i++) {
            const v = data[i * step] / 255;
            const h = Math.max(1, v * canvas.height);
            ctx.fillRect(i * barW + 1, canvas.height - h, barW - 2, h);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getWaveform]);

  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Audio</div>
      <canvas ref={canvasRef} width={172} height={32} className="w-full rounded bg-ink" />
    </div>
  );
}

// Участници в Collective режим
export function ParticipantsList({ users, myNickname, myColor, sessionCode }) {
  const hsl = (c) => `hsl(${c.h}, ${c.s}%, ${c.l}%)`;
  const list = Object.values(users);

  return (
    <div className="absolute left-3 top-20 z-20 w-[190px] rounded-xl bg-ink-soft/80 border border-ink-line backdrop-blur p-3 animate-fade-in">
      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Session</div>
      <div className="font-display text-2xl tracking-[0.3em] text-white mb-3">{sessionCode}</div>
      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
        {list.length + 1} in the chorus
      </div>
      <ul className="flex flex-col gap-1.5">
        <li className="flex items-center gap-2 text-xs">
          <span
            className="h-2.5 w-2.5 rounded-full glow-pulse"
            style={{ backgroundColor: myColor ? hsl(myColor) : '#a78bfa' }}
          />
          <span className="text-white font-medium">{myNickname}</span>
          <span className="text-gray-500">(you)</span>
        </li>
        {list.map((u) => (
          <li key={u.userId} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: u.baseColor ? hsl(u.baseColor) : '#888' }}
            />
            <span className="text-gray-300">{u.nickname}</span>
            <span className="ml-auto">
              {(EMOTION_CONFIGS[u.emotion] || EMOTION_CONFIGS.neutral).emoji}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
