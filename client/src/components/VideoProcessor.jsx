import { useEffect, useRef, forwardRef } from 'react';

// Скрит video element, който подава кадри към MediaPipe detect().
// Върти requestAnimationFrame loop докато е mounted и има stream.
export const VideoProcessor = forwardRef(function VideoProcessor(
  { detect, active, onStream },
  videoRef
) {
  const rafRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        onStream?.(stream);

        const loop = (timestamp) => {
          if (cancelled) return;
          detect(timestamp);
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (err) {
        console.error('Camera access failed:', err);
      }
    }
    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [active, detect, onStream, videoRef]);

  return (
    <video
      ref={videoRef}
      className="hidden"
      playsInline
      muted
      width={640}
      height={480}
    />
  );
});
