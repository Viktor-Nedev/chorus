import { useEffect, useRef, useState, useCallback } from 'react';

// Гласови команди — цветове и инструменти на български и английски.
const COLOR_COMMANDS = [
  [['червено', 'червен', 'red'], '#FF2D2D'],
  [['синьо', 'син', 'blue'], '#4A90D9'],
  [['зелено', 'зелен', 'green'], '#22C55E'],
  [['жълто', 'жълт', 'yellow'], '#FFD700'],
  [['лилаво', 'лилав', 'виолетово', 'purple', 'violet'], '#A78BFA'],
  [['оранжево', 'оранжев', 'orange'], '#FF6600'],
  [['розово', 'розов', 'pink'], '#FF6B9D'],
  [['бяло', 'бял', 'white'], '#FFFFFF'],
  [['черно', 'черен', 'black'], '#161616'],
  [['циан', 'тюркоаз', 'cyan'], '#00FFFF'],
];

const TOOL_COMMANDS = [
  [['частици', 'частица', 'хор', 'chorus'], 'CHORUS'],
  [['ръка', 'ръчно рисуване', 'hand draw', 'hand'], 'HAND'],
  [['линия', 'line'], 'LINE'],
  [['четка', 'brush'], 'BRUSH'],
  [['кръг', 'кръгче', 'circle'], 'CIRCLE'],
  [['правоъгълник', 'квадрат', 'rectangle', 'rect'], 'RECT'],
  [['избухване', 'експлозия', 'burst'], 'BURST'],
  [['вълна', 'wave'], 'WAVE'],
  [['гума', 'изтриване', 'eraser'], 'ERASER'],
];

const TOOL_LABELS = {
  CHORUS: 'Chorus', HAND: 'Hand Draw', LINE: 'Line', BRUSH: 'Brush', CIRCLE: 'Circle',
  RECT: 'Rectangle', BURST: 'Burst', WAVE: 'Wave', ERASER: 'Eraser',
};

function findMatch(text, table) {
  for (const [words, value] of table) {
    if (words.some((w) => text.includes(w))) return value;
  }
  return null;
}

/**
 * Гласови команди чрез Web Speech API (SpeechRecognition).
 * Поддържа команди за смяна на инструмент, цвят, размер, clear, save,
 * и пауза/продължаване на рисуването с ръка ("stop" / "draw").
 *
 * handlers: { onColor(hex), onTool(toolId), onClear(), onSave(), onSizeChange(delta), onPause(), onResume() }
 */
export function useVoiceCommands({
  onColor, onTool, onClear, onSave, onSizeChange, onPause, onResume, onFeedback, enabled,
}) {
  const [listening, setListening] = useState(false);
  const [supported] = useState(
    () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const recognitionRef = useRef(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const handlersRef = useRef({});
  handlersRef.current = { onColor, onTool, onClear, onSave, onSizeChange, onPause, onResume, onFeedback };

  const processTranscript = useCallback((raw) => {
    const t = raw.toLowerCase().trim();
    if (!t) return;

    const color = findMatch(t, COLOR_COMMANDS);
    if (color) {
      handlersRef.current.onColor?.(color);
      handlersRef.current.onFeedback?.(`🎙 Color → ${color}`);
      return;
    }

    const tool = findMatch(t, TOOL_COMMANDS);
    if (tool) {
      handlersRef.current.onTool?.(tool);
      handlersRef.current.onFeedback?.(`🎙 Tool → ${TOOL_LABELS[tool]}`);
      return;
    }

    if (/(по-голям|по голям|увеличи|bigger|larger|increase)/.test(t)) {
      handlersRef.current.onSizeChange?.(4);
      handlersRef.current.onFeedback?.('🎙 Size increased');
      return;
    }
    if (/(по-малък|по малък|намали|smaller|decrease)/.test(t)) {
      handlersRef.current.onSizeChange?.(-4);
      handlersRef.current.onFeedback?.('🎙 Size decreased');
      return;
    }
    if (/(спри|стоп|пауза|stop|pause)/.test(t)) {
      handlersRef.current.onPause?.();
      handlersRef.current.onFeedback?.('🎙 Hand drawing paused');
      return;
    }
    if (/(продължи|рисувай|старт|start|resume|continue)/.test(t)) {
      handlersRef.current.onResume?.();
      handlersRef.current.onFeedback?.('🎙 Hand drawing resumed');
      return;
    }
    if (/(изчисти|изтрий всичко|clear)/.test(t)) {
      handlersRef.current.onClear?.();
      handlersRef.current.onFeedback?.('🎙 Canvas cleared');
      return;
    }
    if (/(запази|запис|save)/.test(t)) {
      handlersRef.current.onSave?.();
      handlersRef.current.onFeedback?.('🎙 Opening save dialog');
      return;
    }
  }, []);

  useEffect(() => {
    if (!supported || !enabled) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setListening(false);
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'bg-BG';

    let fatal = false;
    let restartTimeout = null;

    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      if (last.isFinal) processTranscript(last[0].transcript);
    };
    recognition.onerror = (e) => {
      // 'no-speech' / 'aborted' are routine — recognition restarts on its own.
      // Anything else (network, not-allowed, audio-capture, …) is persistent:
      // retrying in a loop would just spin forever, so stop for good.
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      fatal = true;
      console.warn('Voice recognition error:', e.error);
      handlersRef.current.onFeedback?.(`🎙 Voice input stopped (${e.error})`);
    };
    recognition.onend = () => {
      if (fatal || !enabledRef.current || recognitionRef.current !== recognition) return;
      // Small delay avoids a tight synchronous start/end restart loop.
      restartTimeout = setTimeout(() => {
        try {
          recognition.start();
        } catch {
          /* already started — ignore */
        }
      }, 300);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      /* ignore */
    }

    return () => {
      const r = recognitionRef.current;
      recognitionRef.current = null;
      setListening(false);
      if (restartTimeout) clearTimeout(restartTimeout);
      if (r) {
        r.onend = null;
        r.onresult = null;
        r.onerror = null;
        r.stop();
      }
    };
  }, [enabled, supported, processTranscript]);

  return { listening, supported };
}
