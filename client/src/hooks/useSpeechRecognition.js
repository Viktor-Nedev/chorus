import { useEffect, useRef, useState } from 'react';

// Generic Web Speech API recognizer с авто-restart (Chrome/Edge).
// onFinal(transcript) се вика при всеки финален резултат. Изнесен, за да го
// ползват няколко режима без да дублират lifecycle-а.
export function useSpeechRecognition(enabled, onFinal, lang = 'en-US') {
  const [listening, setListening] = useState(false);
  const [supported] = useState(
    () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const recRef = useRef(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const cbRef = useRef(onFinal);
  cbRef.current = onFinal;

  useEffect(() => {
    if (!supported || !enabled) {
      recRef.current?.stop();
      recRef.current = null;
      setListening(false);
      return undefined;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = lang;
    let fatal = false;
    let restart = null;

    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      if (last.isFinal) cbRef.current?.(last[0].transcript);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      fatal = true;
    };
    rec.onend = () => {
      if (fatal || !enabledRef.current || recRef.current !== rec) return;
      restart = setTimeout(() => {
        try { rec.start(); } catch { /* already started */ }
      }, 300);
    };

    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { /* ignore */ }

    return () => {
      const r = recRef.current;
      recRef.current = null;
      setListening(false);
      if (restart) clearTimeout(restart);
      if (r) { r.onend = null; r.onresult = null; r.onerror = null; r.stop(); }
    };
  }, [enabled, supported, lang]);

  return { listening, supported };
}
