import { useEffect, useRef } from 'react';
import p5 from 'p5';
import { ParticleSystem } from '../engine/ParticleSystem';
import { EMOTION_CONFIGS } from '../constants/emotions';
import { applySwarmRules } from '../engine/swarmRules';
import { CANVAS_BG } from '../hooks/useTheme';

// Помощни функции за рисуване

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function drawSpike(p, x, y, size) {
  p.beginShape();
  p.vertex(x, y - size);
  p.vertex(x + size * 0.3, y - size * 0.3);
  p.vertex(x + size, y);
  p.vertex(x + size * 0.3, y + size * 0.3);
  p.vertex(x, y + size);
  p.vertex(x - size * 0.3, y + size * 0.3);
  p.vertex(x - size, y);
  p.vertex(x - size * 0.3, y - size * 0.3);
  p.endShape(p.CLOSE);
}

function drawParticle(p, particle) {
  // Следи
  for (let i = 1; i < particle.trail.length; i++) {
    const alpha = (1 - i / particle.trail.length) * 60;
    p.noStroke();
    p.fill(particle.color.r, particle.color.g, particle.color.b, alpha);
    const trailSize = particle.size * (1 - i / particle.trail.length) * 0.7;
    p.ellipse(particle.trail[i].x, particle.trail[i].y, trailSize);
  }

  // Самата частица
  p.noStroke();
  p.fill(particle.color.r, particle.color.g, particle.color.b, 220);

  if (particle.shape === 'spike') {
    drawSpike(p, particle.x, particle.y, particle.size);
  } else if (particle.shape === 'triangle') {
    p.triangle(
      particle.x,
      particle.y - particle.size,
      particle.x - particle.size * 0.8,
      particle.y + particle.size * 0.6,
      particle.x + particle.size * 0.8,
      particle.y + particle.size * 0.6
    );
  } else if (particle.shape === 'burst') {
    // Пулсиращ кръг с ореол
    const pulse = 1 + Math.sin(particle.age * 0.15) * 0.3;
    p.fill(particle.color.r, particle.color.g, particle.color.b, 80);
    p.ellipse(particle.x, particle.y, particle.size * pulse * 1.8);
    p.fill(particle.color.r, particle.color.g, particle.color.b, 220);
    p.ellipse(particle.x, particle.y, particle.size * pulse);
  } else {
    p.ellipse(particle.x, particle.y, particle.size);
  }
}

function drawBurstEffect(layer, x, y, hexColor, radius) {
  const c = hexToRgb(hexColor);
  for (let i = 0; i < 60; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * radius;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    layer.noStroke();
    layer.fill(c.r, c.g, c.b, Math.random() * 200 + 55);
    layer.ellipse(px, py, Math.random() * 6 + 2);
  }
}

/**
 * P5Canvas — един компонент за двата режима.
 *
 * ВАЖНО: p5 инстанцията се създава ВЕДНЪЖ. Всички живи данни (emotion,
 * gesture, audio, tool настройки, тема) влизат през refs — четат се
 * директно в draw() loop без да рестартират p5.
 *
 * Ръчното рисуване (Solo) отива в отделен постоянен `drawLayer` (p5.Graphics),
 * който се композира върху canvas-а всеки кадър БЕЗ ефекта на избледняване —
 * затова щрихите остават запазени, докато частиците продължават да оставят
 * фосилни следи.
 *
 * props:
 *  - mode: 'solo' | 'collective'
 *  - emotionRef, gestureRef, handPositionRef  (от useMediaPipe)
 *  - getAudioData()                            (от useAudio)
 *  - toolRef: { tool, color, size, opacity }   (Solo; ref обект)
 *  - liveRef: { camera, hands }                (Solo; кои live входа са активни)
 *  - baseColor: {r,g,b}                        (цвят на частиците по подразбиране)
 *  - usersRef                                  (Collective; чужди потребители)
 *  - myAudioLevelRef                           (Collective)
 *  - themeRef                                  (ref 'dark' | 'light' — за фона на canvas-а)
 *  - onSystemReady(system, p5instance, api)    (callback за export/clear достъп)
 */
export function P5Canvas({
  mode = 'solo',
  emotionRef,
  gestureRef,
  handPositionRef,
  getAudioData,
  toolRef,
  liveRef,
  baseColor = { r: 150, g: 100, b: 255 },
  usersRef,
  myAudioLevelRef,
  themeRef,
  onSystemReady,
}) {
  const containerRef = useRef(null);
  const p5Ref = useRef(null);

  // Стабилни refs за callback-и, за да не пресъздаваме p5
  const getAudioRef = useRef(getAudioData);
  getAudioRef.current = getAudioData;
  const onReadyRef = useRef(onSystemReady);
  onReadyRef.current = onSystemReady;

  useEffect(() => {
    const particleCount = mode === 'collective' ? 80 : 80;
    const w = containerRef.current?.clientWidth || window.innerWidth;
    const h = containerRef.current?.clientHeight || window.innerHeight;

    const particleSystem = new ParticleSystem(particleCount, w, h, baseColor);

    // Manual drawing state (Solo)
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    let shapeStartX = 0;
    let shapeStartY = 0;
    let waveDist = 0;
    let drawLayer = null; // p5.Graphics — постоянен слой за ръчно рисуване

    const bg = () => (themeRef?.current === 'light' ? CANVAS_BG.light : CANVAS_BG.dark);

    const sketch = (p) => {
      p.setup = () => {
        p.createCanvas(w, h);
        p.background(bg().r, bg().g, bg().b);
        p.colorMode(p.RGB, 255);
        drawLayer = p.createGraphics(w, h);
        drawLayer.clear(); // прозрачен, за да не покрива фона

        onReadyRef.current?.(particleSystem, p, {
          clearAll: () => {
            drawLayer.clear();
            p.background(bg().r, bg().g, bg().b);
          },
        });
      };

      p.windowResized = () => {
        const nw = containerRef.current?.clientWidth || window.innerWidth;
        const nh = containerRef.current?.clientHeight || window.innerHeight;
        p.resizeCanvas(nw, nh);
        p.background(bg().r, bg().g, bg().b);
        drawLayer.resizeCanvas(nw, nh);
        particleSystem.resize(nw, nh);
      };

      p.draw = () => {
        const { r, g, b } = bg();

        // Фосилен ефект — много бавно избледняване, само за частиците
        p.fill(r, g, b, 6);
        p.noStroke();
        p.rect(0, 0, p.width, p.height);

        const audio = getAudioRef.current ? getAudioRef.current() : { bassLevel: 0, midLevel: 0, trebleLevel: 0, totalLevel: 0 };
        const emotion = emotionRef?.current ?? 'neutral';
        const gesture = liveRef?.current?.hands === false ? 'NO_HAND' : (gestureRef?.current ?? 'NO_HAND');
        const handPos = handPositionRef?.current ?? { x: 0.5, y: 0.5 };
        const tool = toolRef?.current;

        // ── Емоция и жест → particle system
        particleSystem.applyEmotion(emotion);

        // CHORUS brush: закотвяне около мишката (Solo). Жестът има
        // приоритет ако ръката е видима.
        const chorusActive = mode === 'solo' && tool?.tool === 'CHORUS';
        if (gesture !== 'NO_HAND') {
          particleSystem.clearAnchor();
          particleSystem.applyGesture({ gesture, handX: handPos.x, handY: handPos.y });
        } else if (chorusActive && (p.mouseX !== 0 || p.mouseY !== 0)) {
          if (isDrawing || p.movedX !== 0 || p.movedY !== 0) {
            particleSystem.setAnchor(p.mouseX, p.mouseY);
          }
          particleSystem.applyGesture({ gesture: 'NO_HAND', handX: 0.5, handY: 0.5 });
        } else {
          particleSystem.applyGesture({ gesture: 'NO_HAND', handX: 0.5, handY: 0.5 });
        }

        // ── Collective: swarm правила от чуждите потребители
        if (mode === 'collective' && usersRef?.current) {
          applySwarmRules(
            particleSystem,
            emotion,
            myAudioLevelRef?.current ?? audio.totalLevel,
            usersRef.current,
            p.width,
            p.height
          );
        }

        particleSystem.update(audio, EMOTION_CONFIGS[emotion], { gesture });

        // ── Постоянният слой за ръчно рисуване — рисува се всеки кадър
        // на пълна плътност, така че НЕ избледнява със фосилния ефект
        if (drawLayer) p.image(drawLayer, 0, 0);

        // ── Рисувай чуждите частици (Collective) — прости точки
        if (mode === 'collective' && usersRef?.current) {
          Object.values(usersRef.current).forEach((u) => {
            if (!u.particles) return;
            u.particles.forEach((op) => {
              p.noStroke();
              p.fill(op.color.r, op.color.g, op.color.b, 160);
              p.ellipse(op.x, op.y, 7);
            });
          });
        }

        // ── Рисувай моите частици
        particleSystem.particles.forEach((particle) => drawParticle(p, particle));

        // ── Live preview за инструменти, рисувани на release (Line/Circle/Rect)
        if (mode === 'solo' && isDrawing && toolRef?.current) {
          const { tool: activeTool, color, size } = toolRef.current;
          if (activeTool === 'LINE' || activeTool === 'CIRCLE' || activeTool === 'RECT') {
            const c = hexToRgb(color);
            p.push();
            p.noFill();
            p.stroke(c.r, c.g, c.b, 160);
            p.strokeWeight(Math.max(1, size * 0.4));
            if (activeTool === 'LINE') {
              p.line(shapeStartX, shapeStartY, p.mouseX, p.mouseY);
            } else if (activeTool === 'CIRCLE') {
              const r2 = p.dist(shapeStartX, shapeStartY, p.mouseX, p.mouseY);
              p.ellipse(shapeStartX, shapeStartY, r2 * 2);
            } else if (activeTool === 'RECT') {
              p.rectMode(p.CORNERS);
              p.rect(shapeStartX, shapeStartY, p.mouseX, p.mouseY);
              p.rectMode(p.CORNER);
            }
            p.pop();
          }
        }

        // ── Eraser preview
        if (mode === 'solo' && tool?.tool === 'ERASER') {
          p.noFill();
          p.stroke(255, 255, 255, 80);
          p.strokeWeight(1);
          p.ellipse(p.mouseX, p.mouseY, tool.size * 2);
        }
      };

      // ── Manual drawing (Solo) — всичко персистентно се рисува в drawLayer

      const overCanvas = () =>
        p.mouseX >= 0 && p.mouseX <= p.width && p.mouseY >= 0 && p.mouseY <= p.height;

      p.mousePressed = () => {
        if (mode !== 'solo' || !toolRef?.current || !overCanvas()) return;
        const { tool, color, size } = toolRef.current;

        if (tool === 'BRUSH' || tool === 'WAVE' || tool === 'ERASER') {
          isDrawing = true;
          lastX = p.mouseX;
          lastY = p.mouseY;
          waveDist = 0;
        }
        if (tool === 'LINE' || tool === 'CIRCLE' || tool === 'RECT') {
          isDrawing = true;
          shapeStartX = p.mouseX;
          shapeStartY = p.mouseY;
        }
        if (tool === 'BURST') {
          drawBurstEffect(drawLayer, p.mouseX, p.mouseY, color, size * 5);
        }
      };

      p.mouseDragged = () => {
        if (mode !== 'solo' || !isDrawing || !toolRef?.current) return;
        const { tool, color, size, opacity } = toolRef.current;
        const c = hexToRgb(color);
        const alpha = opacity * 2.55;

        if (tool === 'BRUSH') {
          drawLayer.stroke(c.r, c.g, c.b, alpha);
          drawLayer.strokeWeight(size);
          drawLayer.strokeCap(p.ROUND);
          drawLayer.line(lastX, lastY, p.mouseX, p.mouseY);
          lastX = p.mouseX;
          lastY = p.mouseY;
        } else if (tool === 'WAVE') {
          // Вълнообразна линия — sin offset по дължината на щриха
          const segLen = p.dist(lastX, lastY, p.mouseX, p.mouseY);
          const steps = Math.max(2, Math.ceil(segLen / 3));
          for (let i = 0; i < steps; i++) {
            const t = i / steps;
            const wx = p.lerp(lastX, p.mouseX, t);
            const baseY = p.lerp(lastY, p.mouseY, t);
            const wy = baseY + Math.sin((waveDist + segLen * t) * 0.08) * 18;
            drawLayer.noStroke();
            drawLayer.fill(c.r, c.g, c.b, alpha);
            drawLayer.ellipse(wx, wy, size * 0.5);
          }
          waveDist += segLen;
          lastX = p.mouseX;
          lastY = p.mouseY;
        } else if (tool === 'ERASER') {
          drawLayer.erase();
          drawLayer.noStroke();
          drawLayer.ellipse(p.mouseX, p.mouseY, size * 2);
          drawLayer.noErase();
        }
      };

      p.mouseReleased = () => {
        if (mode !== 'solo' || !isDrawing || !toolRef?.current) {
          isDrawing = false;
          return;
        }
        const { tool, color, size, opacity } = toolRef.current;
        const c = hexToRgb(color);
        const alpha = opacity * 2.55;

        // LINE, CIRCLE и RECT се рисуват на release (click + drag → форма)
        if (tool === 'LINE') {
          drawLayer.stroke(c.r, c.g, c.b, alpha);
          drawLayer.strokeWeight(size);
          drawLayer.strokeCap(p.ROUND);
          drawLayer.line(shapeStartX, shapeStartY, p.mouseX, p.mouseY);
        } else if (tool === 'CIRCLE') {
          const r = p.dist(shapeStartX, shapeStartY, p.mouseX, p.mouseY);
          drawLayer.noFill();
          drawLayer.stroke(c.r, c.g, c.b, alpha);
          drawLayer.strokeWeight(size * 0.4);
          drawLayer.ellipse(shapeStartX, shapeStartY, r * 2);
        } else if (tool === 'RECT') {
          drawLayer.noFill();
          drawLayer.stroke(c.r, c.g, c.b, alpha);
          drawLayer.strokeWeight(size * 0.4);
          drawLayer.rectMode(p.CORNERS);
          drawLayer.rect(shapeStartX, shapeStartY, p.mouseX, p.mouseY);
          drawLayer.rectMode(p.CORNER);
        }
        isDrawing = false;
      };
    };

    p5Ref.current = new p5(sketch, containerRef.current);
    return () => {
      p5Ref.current?.remove();
      p5Ref.current = null;
    };
    // Създаваме p5 само веднъж — живите данни идват през refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
