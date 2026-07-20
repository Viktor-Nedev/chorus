import { useEffect, useRef, useState, useCallback } from 'react';

// Гласови команди — цветове, инструменти, стилове на четка, фигури, линии,
// на български и английски. Проверката е substring (t.includes(w)), затова
// РЕДЪТ има значение: по-специфичните фрази стоят преди по-общите.
const COLOR_COMMANDS = [
  [['червено', 'червен', 'red'], '#FF2D2D'],
  [['оранжево', 'оранжев', 'orange'], '#FF6600'],
  [['корал', 'coral'], '#FF7F50'],
  [['злато', 'златно', 'златен', 'gold', 'golden'], '#FFD700'],
  [['жълто', 'жълт', 'yellow'], '#FFE94D'],
  [['лайм', 'лаймово', 'lime'], '#A3E635'],
  [['зелено', 'зелен', 'green'], '#22C55E'],
  [['тюркоаз', 'тюркоазено', 'teal', 'тийл'], '#14B8A6'],
  [['циан', 'cyan'], '#00FFFF'],
  [['синьо', 'син', 'blue'], '#4A90D9'],
  [['индиго', 'indigo'], '#6366F1'],
  [['лилаво', 'лилав', 'виолетово', 'purple', 'violet'], '#A78BFA'],
  [['магента', 'magenta', 'фуксия'], '#FF00FF'],
  [['розово', 'розов', 'pink'], '#FF6B9D'],
  [['кафяво', 'кафяв', 'brown'], '#8B5E3C'],
  [['сребро', 'сребърно', 'сребърен', 'silver'], '#C0C0C0'],
  [['бяло', 'бял', 'white'], '#FFFFFF'],
  [['черно', 'черен', 'black'], '#161616'],
];

// Инструменти → tool id. По-специфични линии/стрелки ПРЕДИ 'линия'/'стрелка'.
const TOOL_COMMANDS = [
  [['частици', 'частица', 'хор', 'chorus'], 'CHORUS'],
  [['ръчно рисуване', 'рисуване с ръка', 'hand draw', 'ръка', 'hand'], 'HAND'],
  [['пунктир', 'прекъсната', 'dashed', 'dotted'], 'DASHED'],
  [['зигзаг', 'zigzag', 'zig zag'], 'ZIGZAG'],
  [['линия стрелка', 'стрелка линия', 'arrow line'], 'ARROWLINE'],
  [['права линия', 'линия', 'line'], 'LINE'],
  [['кръг', 'кръгче', 'circle'], 'CIRCLE'],
  [['правоъгълник', 'квадрат', 'rectangle', 'rect', 'square'], 'RECT'],
  [['триъгълник', 'triangle'], 'TRIANGLE'],
  [['звезда', 'star'], 'STAR'],
  [['шестоъгълник', 'hexagon'], 'HEXAGON'],
  [['петоъгълник', 'pentagon'], 'PENTAGON'],
  [['ромб', 'диамант', 'diamond', 'rhombus'], 'DIAMOND'],
  [['сърце', 'сърчице', 'heart'], 'HEART'],
  [['стрелка', 'arrow'], 'ARROW'],
  [['избухване', 'експлозия', 'burst'], 'BURST'],
  [['вълна', 'вълнообразна', 'wave'], 'WAVE'],
  [['четка', 'brush'], 'BRUSH'],
  [['запълни', 'запълване', 'кофичка', 'кофа', 'fill', 'bucket'], 'FILL'],
  [['пипета', 'вземи цвят', 'eyedropper', 'color picker'], 'EYEDROPPER'],
  [['гума', 'изтриване', 'eraser'], 'ERASER'],
];

// Стилове на четка (важат при Hand Draw). PENCIL преди PEN (заради 'pencil').
const PEN_STYLE_COMMANDS = [
  [['молив', 'pencil'], 'PENCIL'],
  [['химикал', 'писалка', 'pen'], 'PEN'],
  [['маркер', 'marker'], 'MARKER'],
  [['калиграфия', 'калиграфски', 'calligraphy'], 'CALLIGRAPHY'],
  [['спрей', 'spray'], 'SPRAY'],
  [['неон', 'neon'], 'NEON'],
  [['мека четка', 'soft brush'], 'BRUSH'],
];

const TOOL_LABELS = {
  CHORUS: 'Chorus', HAND: 'Hand Draw', LINE: 'Line', DASHED: 'Dashed line',
  ZIGZAG: 'Zigzag', ARROWLINE: 'Arrow line', BRUSH: 'Brush', CIRCLE: 'Circle',
  RECT: 'Rectangle', TRIANGLE: 'Triangle', STAR: 'Star', HEXAGON: 'Hexagon',
  PENTAGON: 'Pentagon', DIAMOND: 'Diamond', HEART: 'Heart', ARROW: 'Arrow',
  BURST: 'Burst', WAVE: 'Wave', FILL: 'Fill', EYEDROPPER: 'Eyedropper',
  ERASER: 'Eraser', TEXT: 'Text',
};

const PEN_LABELS = {
  PENCIL: 'Pencil', PEN: 'Pen', MARKER: 'Marker', CALLIGRAPHY: 'Calligraphy',
  SPRAY: 'Spray', NEON: 'Neon', BRUSH: 'Soft brush',
};

function findMatch(text, table) {
  for (const [words, value] of table) {
    if (words.some((w) => text.includes(w))) return value;
  }
  return null;
}

// Чиста функция (без React) — мапва суров транскрипт към действие. Изнесена,
// за да е unit-тестваема без да mount-ваме hook-а. Връща { type, value } или null.
export function parseVoiceCommand(raw) {
  const t = (raw || '').toLowerCase().trim();
  if (!t) return null;

  // "текст <дума>" / "text <word>" → диктувай текст
  const textMatch = t.match(/^(?:текст|text|напиши(?:\s+текст)?|write)\s+(.+)$/);
  if (textMatch && textMatch[1]) return { type: 'text', value: textMatch[1].trim() };
  if (t === 'текст' || t === 'text') return { type: 'tool', value: 'TEXT' };

  if (/(цвят по емоция|цвят според емоция|емоция цвят|emotion colou?r|mood colou?r)/.test(t)) {
    return { type: 'emotionColor' };
  }

  const color = findMatch(t, COLOR_COMMANDS);
  if (color) return { type: 'color', value: color };

  const pen = findMatch(t, PEN_STYLE_COMMANDS);
  if (pen) return { type: 'pen', value: pen };

  const tool = findMatch(t, TOOL_COMMANDS);
  if (tool) return { type: 'tool', value: tool };

  if (/(по-голям|по голям|увеличи|bigger|larger|increase)/.test(t)) return { type: 'size', value: 4 };
  if (/(по-малък|по малък|намали|smaller|decrease)/.test(t)) return { type: 'size', value: -4 };
  if (/(спри|стоп|пауза|stop|pause)/.test(t)) return { type: 'pause' };
  if (/(продължи|рисувай|старт|start|resume|continue)/.test(t)) return { type: 'resume' };
  if (/(изчисти|изтрий всичко|clear)/.test(t)) return { type: 'clear' };
  if (/(запази|запис|save)/.test(t)) return { type: 'save' };

  return null;
}

/**
 * Гласови команди чрез Web Speech API (SpeechRecognition).
 * Поддържа: инструмент, стил на четка, фигура/линия, цвят, размер, clear,
 * save, пауза/продължаване на рисуването с ръка, цвят-по-емоция, и текст
 * ("текст <дума>" / "text <word>").
 *
 * handlers: {
 *   onColor(hex), onTool(toolId), onPenStyle(styleId), onEmotionColor(),
 *   onText(str), onClear(), onSave(), onSizeChange(delta), onPause(),
 *   onResume(), onFeedback(msg)
 * }
 */
export function useVoiceCommands({
  onColor, onTool, onPenStyle, onEmotionColor, onText,
  onClear, onSave, onSizeChange, onPause, onResume, onFeedback, enabled,
}) {
  const [listening, setListening] = useState(false);
  const [supported] = useState(
    () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const recognitionRef = useRef(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const handlersRef = useRef({});
  handlersRef.current = {
    onColor, onTool, onPenStyle, onEmotionColor, onText,
    onClear, onSave, onSizeChange, onPause, onResume, onFeedback,
  };

  const processTranscript = useCallback((raw) => {
    const cmd = parseVoiceCommand(raw);
    if (!cmd) return;
    const h = handlersRef.current;
    switch (cmd.type) {
      case 'text': h.onText?.(cmd.value); h.onFeedback?.(`🎙 Text → "${cmd.value}"`); break;
      case 'emotionColor': h.onEmotionColor?.(); h.onFeedback?.('🎙 Color → your emotion'); break;
      case 'color': h.onColor?.(cmd.value); h.onFeedback?.(`🎙 Color → ${cmd.value}`); break;
      case 'pen': h.onPenStyle?.(cmd.value); h.onFeedback?.(`🎙 Pen → ${PEN_LABELS[cmd.value]}`); break;
      case 'tool': h.onTool?.(cmd.value); h.onFeedback?.(`🎙 Tool → ${TOOL_LABELS[cmd.value]}`); break;
      case 'size':
        h.onSizeChange?.(cmd.value);
        h.onFeedback?.(cmd.value > 0 ? '🎙 Size increased' : '🎙 Size decreased');
        break;
      case 'pause': h.onPause?.(); h.onFeedback?.('🎙 Hand drawing paused'); break;
      case 'resume': h.onResume?.(); h.onFeedback?.('🎙 Hand drawing resumed'); break;
      case 'clear': h.onClear?.(); h.onFeedback?.('🎙 Canvas cleared'); break;
      case 'save': h.onSave?.(); h.onFeedback?.('🎙 Opening save dialog'); break;
      default: break;
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

  return { listening, supported, processTranscript };
}
