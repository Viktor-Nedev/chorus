import { useEffect, useRef, useState, useCallback } from 'react';
import { FaceLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { classifyEmotionFromBlendshapes, majorityVote } from '../engine/emotionMapper';
import { classifyGesture } from '../engine/gestureMapper';

export function useMediaPipe(videoRef, enabled = true) {
  const [emotion, setEmotion] = useState('neutral');
  const [gesture, setGesture] = useState('NO_HAND');
  const [handPosition, setHandPosition] = useState({ x: 0.5, y: 0.5 });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const faceLandmarkerRef = useRef(null);
  const handLandmarkerRef = useRef(null);
  const lastEmotions = useRef([]); // за smoothing
  const lastVideoTime = useRef(-1);

  // Refs дублират state за директен достъп от p5 draw loop без re-render
  const emotionRef = useRef('neutral');
  const gestureRef = useRef('NO_HAND');
  const handPositionRef = useRef({ x: 0.5, y: 0.5 });

  // Сурови face landmarks (478 × xyz) за Mood Check — копират се веднага в
  // предварително алокиран буфер (MediaPipe преизползва изходните си
  // структури между кадрите, така че референция НЕ бива да се пази).
  const landmarksBufRef = useRef(new Float32Array(478 * 3));
  const landmarkStampRef = useRef(0); // performance.now() на последното копие

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function init() {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );
        if (cancelled) return;

        const [face, hand] = await Promise.all([
          FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: true, // задължително за точна емоция
          }),
          HandLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 1,
          }),
        ]);

        if (cancelled) {
          face.close();
          hand.close();
          return;
        }
        faceLandmarkerRef.current = face;
        handLandmarkerRef.current = hand;
        setReady(true);
      } catch (err) {
        console.error('MediaPipe init failed:', err);
        if (!cancelled) setError('Failed to load vision models');
      }
    }
    init();

    return () => {
      cancelled = true;
      faceLandmarkerRef.current?.close();
      handLandmarkerRef.current?.close();
      faceLandmarkerRef.current = null;
      handLandmarkerRef.current = null;
      setReady(false);
    };
  }, [enabled]);

  // Detect loop — извиква се от VideoProcessor на всеки frame
  const detect = useCallback(
    (timestamp) => {
      const video = videoRef.current;
      if (!video || !faceLandmarkerRef.current || !handLandmarkerRef.current) return;
      if (video.readyState < 2) return;
      if (video.currentTime === lastVideoTime.current) return;
      lastVideoTime.current = video.currentTime;

      try {
        // Face detection
        const faceResult = faceLandmarkerRef.current.detectForVideo(video, timestamp);

        // Копирай суровите landmarks веднага (за Mood Check Mirror режима)
        const lm = faceResult.faceLandmarks?.[0];
        if (lm && lm.length >= 478) {
          const buf = landmarksBufRef.current;
          for (let i = 0; i < 478; i++) {
            const p = lm[i];
            const j = i * 3;
            buf[j] = p.x;
            buf[j + 1] = p.y;
            buf[j + 2] = p.z;
          }
          landmarkStampRef.current = performance.now();
        }

        if (faceResult.faceBlendshapes?.length > 0) {
          const blendshapes = faceResult.faceBlendshapes[0].categories;
          const detectedEmotion = classifyEmotionFromBlendshapes(blendshapes);

          // Smoothing: majority vote от последните 8 детекции
          lastEmotions.current.push(detectedEmotion);
          if (lastEmotions.current.length > 8) lastEmotions.current.shift();
          const smoothed = majorityVote(lastEmotions.current);
          if (smoothed !== emotionRef.current) {
            emotionRef.current = smoothed;
            setEmotion(smoothed);
          }
        }

        // Hand detection
        const handResult = handLandmarkerRef.current.detectForVideo(video, timestamp);
        if (handResult.landmarks?.length > 0) {
          const landmarks = handResult.landmarks[0];
          const detectedGesture = classifyGesture(landmarks);
          // Огледално x — камерата е mirror
          const pos = { x: 1 - landmarks[9].x, y: landmarks[9].y };
          handPositionRef.current = pos;
          if (detectedGesture !== gestureRef.current) {
            gestureRef.current = detectedGesture;
            setGesture(detectedGesture);
          }
          setHandPosition(pos);
        } else if (gestureRef.current !== 'NO_HAND') {
          gestureRef.current = 'NO_HAND';
          setGesture('NO_HAND');
        }
      } catch (err) {
        // detectForVideo може да хвърли при race на timestamps — игнорирай кадъра
      }
    },
    [videoRef]
  );

  return {
    emotion,
    gesture,
    handPosition,
    emotionRef,
    gestureRef,
    handPositionRef,
    landmarksBufRef,
    landmarkStampRef,
    detect,
    ready,
    error,
  };
}
