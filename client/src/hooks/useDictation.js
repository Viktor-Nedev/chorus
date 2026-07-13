// Еднократна (non-continuous) гласова диктовка за текстовия инструмент.
// Умишлено НЕ преизползва useVoiceCommands — този hook е за continuous
// command-режим с грижливо изградена anti-loop защита; диктовката е съвсем
// отделен, еднократен цикъл (start → един резултат → спира сама).
export function useDictation() {
  const supported =
    typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const start = (onResult, onEnd) => {
    if (!supported) return null;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'bg-BG';

    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? '';
      onResult(transcript);
    };
    rec.onerror = () => onEnd?.();
    rec.onend = () => onEnd?.();

    try {
      rec.start();
    } catch {
      /* ignore */
    }
    return rec;
  };

  return { start, supported };
}
