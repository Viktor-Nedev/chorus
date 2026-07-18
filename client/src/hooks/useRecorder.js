import { useState, useRef, useCallback, useEffect } from 'react';

// Записва WebGL canvas-а (particle avatar) като webm клип чрез captureStream +
// MediaRecorder, с опционален микрофон. Твърд лимит 120s. Връща blob за
// download / качване в архива.
const MAX_SECONDS = 120;
const BITRATE = 2_500_000;

function pickMime() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidates.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || 'video/webm';
}

export function useRecorder(canvasGetter) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null); // { blob, url, mime }
  const [error, setError] = useState(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const micStreamRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);

  const supported =
    typeof window !== 'undefined' && !!window.MediaRecorder && !!HTMLCanvasElement.prototype.captureStream;

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const start = useCallback(
    async ({ withMic = true } = {}) => {
      setError(null);
      setResult(null);
      const canvas = canvasGetter();
      if (!canvas) {
        setError('Scene not ready');
        return;
      }
      const stream = canvas.captureStream(30);

      // Опционален микрофон (за клипове/коментар) — при отказ пишем без звук
      if (withMic) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStreamRef.current = mic;
          mic.getAudioTracks().forEach((t) => stream.addTrack(t));
        } catch {
          /* без микрофон */
        }
      }

      const mime = pickMime();
      let rec;
      try {
        rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: BITRATE });
      } catch (e) {
        setError('Recording not supported: ' + e.message);
        return;
      }
      recorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        clearInterval(timerRef.current);
        micStreamRef.current?.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setResult({ blob, url: URL.createObjectURL(blob), mime });
        setRecording(false);
        setElapsed(0);
      };

      rec.start(250); // timeslice → редовни chunks
      startedAtRef.current = performance.now();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        const s = (performance.now() - startedAtRef.current) / 1000;
        setElapsed(s);
        if (s >= MAX_SECONDS) stop();
      }, 250);
    },
    [canvasGetter, stop]
  );

  const clearResult = useCallback(() => {
    setResult((r) => {
      if (r?.url) URL.revokeObjectURL(r.url);
      return null;
    });
  }, []);

  useEffect(
    () => () => {
      clearInterval(timerRef.current);
      recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop?.();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    },
    []
  );

  return { supported, recording, elapsed, result, error, start, stop, clearResult, MAX_SECONDS };
}
