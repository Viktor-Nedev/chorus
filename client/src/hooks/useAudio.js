import { useRef, useState, useCallback } from 'react';
import { analyzeFrequencyData, SILENT_AUDIO } from '../engine/audioAnalyzer';

export function useAudio() {
  const contextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const streamRef = useRef(null);
  const [audioReady, setAudioReady] = useState(false);

  const initAudio = useCallback(async (existingStream = null) => {
    if (analyserRef.current) return; // вече инициализиран
    const stream =
      existingStream || (await navigator.mediaDevices.getUserMedia({ audio: true }));
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.7;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);

    contextRef.current = ctx;
    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    streamRef.current = stream;
    setAudioReady(true);
  }, []);

  const stopAudio = useCallback(() => {
    streamRef.current?.getAudioTracks().forEach((t) => t.stop());
    contextRef.current?.close().catch(() => {});
    contextRef.current = null;
    analyserRef.current = null;
    dataArrayRef.current = null;
    streamRef.current = null;
    setAudioReady(false);
  }, []);

  // Извиква се в p5 draw() loop — връща свежи стойности всеки кадър
  const getAudioData = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current) return SILENT_AUDIO;
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    return analyzeFrequencyData(dataArrayRef.current);
  }, []);

  // За waveform визуализация в sidebar
  const getWaveform = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current) return null;
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    return dataArrayRef.current;
  }, []);

  return { initAudio, stopAudio, getAudioData, getWaveform, audioReady };
}
