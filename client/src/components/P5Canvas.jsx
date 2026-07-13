import { useEffect, useRef } from 'react';
import p5 from 'p5';
import { ParticleSystem } from '../engine/ParticleSystem';
import { EMOTION_CONFIGS } from '../constants/emotions';
import { applySwarmRules } from '../engine/swarmRules';
import { createUndoStack } from '../engine/undoStack';
import { floodFill } from '../engine/floodFill';

const FILL_TOLERANCE = 30;
const CANVAS_BG = { r: 5, g: 5, b: 5 }; // #050505 — тъмна тема, единствената

// Помощни функции за рисуване

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function rgbToHex(r, g, b) {
  const toHex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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

// Правилен многоъгълник (и звезда, ако е зададен innerR за редуващи се върхове).
// Не задава fill/stroke — извикващият код контролира стила преди да го извика.
function drawPolygon(graphics, p, cx, cy, outerR, sides, innerR) {
  graphics.beginShape();
  const angleStep = (Math.PI * 2) / sides;
  for (let i = 0; i < sides; i++) {
    const angle = -Math.PI / 2 + i * angleStep;
    const r = innerR != null && i % 2 === 1 ? innerR : outerR;
    graphics.vertex(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  }
  graphics.endShape(p.CLOSE);
}

// Връща трите върха на триъгълник, вписан в bounding box — връх горе в средата,
// основа долу в двата ъгъла.
function triangleFromBox(x1, y1, x2, y2) {
  const cx = (x1 + x2) / 2;
  return [cx, y1, x1, y2, x2, y2];
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

// ── Hand-draw pen styles — рисуват върху постоянния drawLayer между две
// последователни позиции на ръката (x1,y1) → (x2,y2).
function drawHandStroke(layer, p, style, x1, y1, x2, y2, hexColor, size, opacityPct) {
  const c = hexToRgb(hexColor);
  const alpha = Math.max(0, Math.min(255, opacityPct * 2.55));

  switch (style) {
    case 'PEN': {
      // Химикал — тънка, твърда, силно наситена линия
      layer.stroke(c.r, c.g, c.b, Math.max(alpha, 210));
      layer.strokeWeight(Math.max(1.5, size * 0.45));
      layer.strokeCap(p.ROUND);
      layer.line(x1, y1, x2, y2);
      break;
    }
    case 'PENCIL': {
      // Молив — зърнеста текстура от разпръснати точици по пътя
      const steps = Math.max(2, Math.ceil(p.dist(x1, y1, x2, y2) / 2));
      layer.noStroke();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const gx = p.lerp(x1, x2, t) + (Math.random() - 0.5) * size * 0.25;
        const gy = p.lerp(y1, y2, t) + (Math.random() - 0.5) * size * 0.25;
        layer.fill(c.r, c.g, c.b, alpha * (0.35 + Math.random() * 0.35));
        layer.ellipse(gx, gy, Math.max(1, size * 0.35));
      }
      break;
    }
    case 'MARKER': {
      // Маркер — дебел плосък щрих, наслагва се като мастило (multiply blend)
      layer.blendMode(p.MULTIPLY);
      layer.stroke(c.r, c.g, c.b, Math.min(alpha, 190));
      layer.strokeWeight(Math.max(4, size * 1.6));
      layer.strokeCap(p.SQUARE);
      layer.line(x1, y1, x2, y2);
      layer.blendMode(p.BLEND);
      break;
    }
    case 'CALLIGRAPHY': {
      // Калиграфско перо — дебелината зависи от посоката на движение
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const nib = Math.PI / 4;
      const w = Math.max(1.5, size * (0.25 + 0.9 * Math.abs(Math.sin(angle - nib))));
      layer.stroke(c.r, c.g, c.b, alpha);
      layer.strokeWeight(w);
      layer.strokeCap(p.PROJECT);
      layer.line(x1, y1, x2, y2);
      break;
    }
    case 'SPRAY': {
      // Спрей — разпръснати частици около текущата точка
      const count = 6;
      const radius = size * 1.3;
      layer.noStroke();
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = Math.random() * radius;
        layer.fill(c.r, c.g, c.b, alpha * (0.3 + Math.random() * 0.5));
        layer.ellipse(x2 + Math.cos(ang) * r, y2 + Math.sin(ang) * r, Math.random() * 3 + 1);
      }
      break;
    }
    case 'NEON': {
      // Неон — широко меко сияние + ярка бяла сърцевина + плътен цветен кор
      layer.strokeCap(p.ROUND);
      layer.stroke(c.r, c.g, c.b, alpha * 0.25);
      layer.strokeWeight(size * 2.4);
      layer.line(x1, y1, x2, y2);
      layer.stroke(255, 255, 255, alpha * 0.5);
      layer.strokeWeight(Math.max(1, size * 0.35));
      layer.line(x1, y1, x2, y2);
      layer.stroke(c.r, c.g, c.b, alpha);
      layer.strokeWeight(Math.max(1, size * 0.5));
      layer.line(x1, y1, x2, y2);
      break;
    }
    case 'BRUSH':
    default: {
      // Нормална четка — мек кръгъл щрих
      layer.stroke(c.r, c.g, c.b, alpha);
      layer.strokeWeight(size);
      layer.strokeCap(p.ROUND);
      layer.line(x1, y1, x2, y2);
    }
  }
}

/**
 * P5Canvas — един компонент за двата режима.
 *
 * ВАЖНО: p5 инстанцията се създава ВЕДНЪЖ. Всички живи данни (emotion,
 * gesture, audio, tool настройки, тема) влизат през refs — четат се
 * директно в draw() loop без да рестартират p5.
 *
 * Три легитимни канала през границата на затварянето:
 *  1. toolRef  — родител→дете, четено всеки кадър (tool, color, size, opacity,
 *     penStyle, handPaused, symmetry)
 *  2. api.*    — родителят вика метод по желание (clearAll, undo, redo,
 *     rotate90, resizeCanvasTo, loadArtworkImage, commitText)
 *  3. callback props — дете→родител, еднократни събития (onTextPlace,
 *     onColorPicked), по същия модел като onSystemReady
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
 *  - toolRef: { tool, color, size, opacity, penStyle, handPaused, symmetry }
 *  - liveRef: { camera, hands }                (Solo; кои live входа са активни)
 *  - baseColor: {r,g,b}                        (цвят на частиците по подразбиране)
 *  - usersRef                                  (Collective; чужди потребители)
 *  - myAudioLevelRef                           (Collective)
 *  - onSystemReady(system, p5instance, api)    (callback за export/clear/undo/... достъп)
 *  - onTextPlace(px,py,screenX,screenY)        (Solo; TEXT tool кликна върху canvas-а)
 *  - onColorPicked(hex)                        (Solo; EYEDROPPER взе цвят)
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
  onSystemReady,
  onTextPlace,
  onColorPicked,
}) {
  const containerRef = useRef(null);
  const p5Ref = useRef(null);

  // Стабилни refs за callback-и, за да не пресъздаваме p5
  const getAudioRef = useRef(getAudioData);
  getAudioRef.current = getAudioData;
  const onReadyRef = useRef(onSystemReady);
  onReadyRef.current = onSystemReady;
  const onTextPlaceRef = useRef(onTextPlace);
  onTextPlaceRef.current = onTextPlace;
  const onColorPickedRef = useRef(onColorPicked);
  onColorPickedRef.current = onColorPicked;

  useEffect(() => {
    const particleCount = mode === 'collective' ? 80 : 80;
    const w = containerRef.current?.clientWidth || window.innerWidth;
    const h = containerRef.current?.clientHeight || window.innerHeight;

    const particleSystem = new ParticleSystem(particleCount, w, h, baseColor);

    // Manual drawing state (Solo)
    let isDrawing = false;
    let strokeDirty = false; // за BRUSH/WAVE/ERASER — само snapshot-вай ако наистина е нарисувано нещо
    let lastX = 0;
    let lastY = 0;
    let shapeStartX = 0;
    let shapeStartY = 0;
    let waveDist = 0;
    let drawLayer = null; // p5.Graphics — постоянен слой за ръчно рисуване
    let lastHandX = null; // последна позиция на ръката, докато HAND tool рисува
    let lastHandY = null;
    let wasHandDrawing = false;

    const undo = createUndoStack(20);

    const bg = () => CANVAS_BG;
    const mirroredX = (x) => drawLayer.width - x;
    const pushUndoSnapshot = () => undo.push(drawLayer.get());

    const sketch = (p) => {
      p.setup = () => {
        p.createCanvas(w, h);
        p.background(bg().r, bg().g, bg().b);
        p.colorMode(p.RGB, 255);
        drawLayer = p.createGraphics(w, h);
        drawLayer.clear(); // прозрачен, за да не покрива фона
        undo.reset(drawLayer.get());

        onReadyRef.current?.(particleSystem, p, {
          clearAll: () => {
            drawLayer.clear();
            p.background(bg().r, bg().g, bg().b);
            pushUndoSnapshot();
          },

          undo: () => {
            const img = undo.undo(drawLayer.get());
            if (img) {
              drawLayer.clear();
              drawLayer.image(img, 0, 0);
            }
          },
          redo: () => {
            const img = undo.redo();
            if (img) {
              drawLayer.clear();
              drawLayer.image(img, 0, 0);
            }
          },

          rotate90: (direction) => {
            const oldW = drawLayer.width;
            const oldH = drawLayer.height;
            const newW = oldH;
            const newH = oldW;
            const rotated = p.createGraphics(newW, newH);
            rotated.push();
            rotated.translate(newW / 2, newH / 2);
            rotated.rotate(direction * p.HALF_PI);
            rotated.imageMode(p.CENTER);
            rotated.image(drawLayer, 0, 0, oldW, oldH);
            rotated.pop();
            // Забележка: НЕ викаме drawLayer.remove() тук — p5's Graphics.remove()
            // хвърля вътрешна грешка (indexOf на undefined) за buffer-и, създадени
            // в instance mode. Просто изпускаме референцията — старият <canvas>
            // остава извън видимия DOM и се garbage-collect-ва, приемлив разход
            // за рядко извиквано, потребителски задействано действие.
            drawLayer = rotated;
            p.resizeCanvas(newW, newH);
            p.background(bg().r, bg().g, bg().b);
            particleSystem.resize(newW, newH);
            pushUndoSnapshot();
          },

          resizeCanvasTo: (newW, newH) => {
            const snapshot = drawLayer.get();
            const fresh = p.createGraphics(newW, newH);
            fresh.clear();
            fresh.image(snapshot, 0, 0);
            // (виж бележката в rotate90 по-горе — не викаме .remove() на Graphics)
            drawLayer = fresh;
            p.resizeCanvas(newW, newH);
            p.background(bg().r, bg().g, bg().b);
            particleSystem.resize(newW, newH);
            pushUndoSnapshot();
          },

          loadArtworkImage: (dataURL) => {
            p.loadImage(dataURL, (img) => {
              drawLayer.clear();
              const scale = Math.min(drawLayer.width / img.width, drawLayer.height / img.height);
              const dw = img.width * scale;
              const dh = img.height * scale;
              const dx = (drawLayer.width - dw) / 2;
              const dy = (drawLayer.height - dh) / 2;
              drawLayer.image(img, dx, dy, dw, dh);
              undo.reset(drawLayer.get());
            });
          },

          commitText: (x, y, text, hexColor, size) => {
            if (!text || !text.trim()) return;
            const c = hexToRgb(hexColor);
            drawLayer.push();
            drawLayer.noStroke();
            drawLayer.fill(c.r, c.g, c.b, 255);
            drawLayer.textFont('Inter');
            drawLayer.textSize(Math.max(12, size * 2.2));
            drawLayer.textAlign(p.LEFT, p.TOP);
            drawLayer.text(text, x, y);
            if (toolRef?.current?.symmetry) {
              drawLayer.textAlign(p.RIGHT, p.TOP);
              drawLayer.text(text, mirroredX(x), y);
            }
            drawLayer.pop();
            pushUndoSnapshot();
          },
        });
      };

      p.windowResized = () => {
        const nw = containerRef.current?.clientWidth || window.innerWidth;
        const nh = containerRef.current?.clientHeight || window.innerHeight;
        const snapshot = drawLayer.get();
        const fresh = p.createGraphics(nw, nh);
        fresh.clear();
        fresh.image(snapshot, 0, 0);
        // (виж бележката в api.rotate90 — не викаме .remove() на Graphics)
        drawLayer = fresh;
        p.resizeCanvas(nw, nh);
        p.background(bg().r, bg().g, bg().b);
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

        // ── CHORUS частиците трябва да са скрити И замразени, докато е избран
        // друг инструмент (Solo) — иначе продължават да се движат невидимо и
        // "прескачат" при повторен избор на CHORUS. В Collective режим винаги
        // се показват (там няма концепция за "инструмент").
        const showOwnParticles = mode === 'collective' || chorusActive;

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

        if (showOwnParticles) {
          particleSystem.update(audio, EMOTION_CONFIGS[emotion], { gesture });
        }

        // ── HAND DRAW: рисуване с движението на ръката върху постоянния
        // слой. OPEN_PALM (пет пръста) или гласова пауза вдигат "перото" —
        // ръката може да се мести свободно без да рисува; следващото
        // затваряне на дланта продължава рисуването от новото място.
        let handDrawState = null; // { hx, hy, canDraw } — за курсора, рисуван по-долу
        if (mode === 'solo' && tool?.tool === 'HAND' && drawLayer) {
          const hx = handPos.x * p.width;
          const hy = handPos.y * p.height;
          const canDraw = gesture !== 'NO_HAND' && gesture !== 'OPEN_PALM' && !tool.handPaused;
          if (gesture !== 'NO_HAND') handDrawState = { hx, hy, canDraw };

          if (canDraw) {
            if (lastHandX === null) {
              lastHandX = hx;
              lastHandY = hy;
            } else {
              drawHandStroke(
                drawLayer, p, tool.penStyle || 'BRUSH',
                lastHandX, lastHandY, hx, hy,
                tool.color, tool.size, tool.opacity
              );
              if (tool.symmetry) {
                drawHandStroke(
                  drawLayer, p, tool.penStyle || 'BRUSH',
                  mirroredX(lastHandX), lastHandY, mirroredX(hx), hy,
                  tool.color, tool.size, tool.opacity
                );
              }
              lastHandX = hx;
              lastHandY = hy;
            }
            wasHandDrawing = true;
          } else {
            lastHandX = null;
            lastHandY = null;
            if (wasHandDrawing) pushUndoSnapshot();
            wasHandDrawing = false;
          }
        } else {
          lastHandX = null;
          lastHandY = null;
          wasHandDrawing = false;
        }

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

        // ── Рисувай моите частици (само когато CHORUS е активен или сме в Collective)
        if (showOwnParticles) {
          particleSystem.particles.forEach((particle) => drawParticle(p, particle));
        }

        // ── Live preview за инструменти, рисувани на release
        if (mode === 'solo' && isDrawing && toolRef?.current) {
          const { tool: activeTool, color, size } = toolRef.current;
          const shapeTools = ['LINE', 'CIRCLE', 'RECT', 'TRIANGLE', 'STAR', 'HEXAGON'];
          if (shapeTools.includes(activeTool)) {
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
            } else if (activeTool === 'TRIANGLE') {
              const [tx1, ty1, tx2, ty2, tx3, ty3] = triangleFromBox(shapeStartX, shapeStartY, p.mouseX, p.mouseY);
              p.triangle(tx1, ty1, tx2, ty2, tx3, ty3);
            } else if (activeTool === 'STAR' || activeTool === 'HEXAGON') {
              const cx = (shapeStartX + p.mouseX) / 2;
              const cy = (shapeStartY + p.mouseY) / 2;
              const outerR = Math.max(p.dist(shapeStartX, shapeStartY, p.mouseX, p.mouseY) / 2, 4);
              if (activeTool === 'STAR') drawPolygon(p, p, cx, cy, outerR, 10, outerR * 0.45);
              else drawPolygon(p, p, cx, cy, outerR, 6);
            }
            p.pop();
          }
        }

        // ── Hand-draw cursor — жив пръстен на позицията на ръката, рисуван
        // директно в p (не в drawLayer), затова естествено избледнява и
        // никога не остава запечатан в картината.
        if (handDrawState) {
          const { hx, hy, canDraw } = handDrawState;
          p.push();
          p.noFill();
          p.stroke(canDraw ? 100 : 230, canDraw ? 255 : 70, canDraw ? 140 : 70, 220);
          p.strokeWeight(2);
          p.ellipse(hx, hy, Math.max(18, tool.size * 1.5));
          p.pop();
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
        const { tool, color, size, symmetry } = toolRef.current;

        if (tool === 'BRUSH' || tool === 'WAVE' || tool === 'ERASER') {
          isDrawing = true;
          strokeDirty = false;
          lastX = p.mouseX;
          lastY = p.mouseY;
          waveDist = 0;
        }
        if (['LINE', 'CIRCLE', 'RECT', 'TRIANGLE', 'STAR', 'HEXAGON'].includes(tool)) {
          isDrawing = true;
          shapeStartX = p.mouseX;
          shapeStartY = p.mouseY;
        }
        if (tool === 'BURST') {
          drawBurstEffect(drawLayer, p.mouseX, p.mouseY, color, size * 5);
          if (symmetry) drawBurstEffect(drawLayer, mirroredX(p.mouseX), p.mouseY, color, size * 5);
          pushUndoSnapshot();
        }
        if (tool === 'FILL') {
          drawLayer.loadPixels();
          floodFill(
            drawLayer.pixels, drawLayer.width, drawLayer.height,
            Math.floor(p.mouseX), Math.floor(p.mouseY), hexToRgb(color), FILL_TOLERANCE
          );
          if (symmetry) {
            floodFill(
              drawLayer.pixels, drawLayer.width, drawLayer.height,
              Math.floor(mirroredX(p.mouseX)), Math.floor(p.mouseY), hexToRgb(color), FILL_TOLERANCE
            );
          }
          drawLayer.updatePixels();
          pushUndoSnapshot();
        }
        if (tool === 'EYEDROPPER') {
          const sample = p.get(p.mouseX, p.mouseY);
          onColorPickedRef.current?.(rgbToHex(sample[0], sample[1], sample[2]));
        }
        if (tool === 'TEXT') {
          const rect = p.canvas.getBoundingClientRect();
          onTextPlaceRef.current?.(p.mouseX, p.mouseY, rect.left + p.mouseX, rect.top + p.mouseY);
        }
      };

      p.mouseDragged = () => {
        if (mode !== 'solo' || !isDrawing || !toolRef?.current) return;
        const { tool, color, size, opacity, symmetry } = toolRef.current;
        const c = hexToRgb(color);
        const alpha = opacity * 2.55;

        if (tool === 'BRUSH') {
          const px = lastX;
          const py = lastY;
          drawLayer.stroke(c.r, c.g, c.b, alpha);
          drawLayer.strokeWeight(size);
          drawLayer.strokeCap(p.ROUND);
          drawLayer.line(px, py, p.mouseX, p.mouseY);
          if (symmetry) drawLayer.line(mirroredX(px), py, mirroredX(p.mouseX), p.mouseY);
          lastX = p.mouseX;
          lastY = p.mouseY;
          strokeDirty = true;
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
            if (symmetry) drawLayer.ellipse(mirroredX(wx), wy, size * 0.5);
          }
          waveDist += segLen;
          lastX = p.mouseX;
          lastY = p.mouseY;
          strokeDirty = true;
        } else if (tool === 'ERASER') {
          drawLayer.erase();
          drawLayer.noStroke();
          drawLayer.ellipse(p.mouseX, p.mouseY, size * 2);
          if (symmetry) drawLayer.ellipse(mirroredX(p.mouseX), p.mouseY, size * 2);
          drawLayer.noErase();
          strokeDirty = true;
        }
      };

      p.mouseReleased = () => {
        if (mode !== 'solo' || !toolRef?.current || !isDrawing) {
          isDrawing = false;
          return;
        }
        const { tool, color, size, opacity, symmetry } = toolRef.current;
        const c = hexToRgb(color);
        const alpha = opacity * 2.55;
        let committed = false;

        if (tool === 'BRUSH' || tool === 'WAVE' || tool === 'ERASER') {
          committed = strokeDirty; // continuous щрихи вече нарисувани по време на drag
        } else if (tool === 'LINE') {
          drawLayer.stroke(c.r, c.g, c.b, alpha);
          drawLayer.strokeWeight(size);
          drawLayer.strokeCap(p.ROUND);
          drawLayer.line(shapeStartX, shapeStartY, p.mouseX, p.mouseY);
          if (symmetry) drawLayer.line(mirroredX(shapeStartX), shapeStartY, mirroredX(p.mouseX), p.mouseY);
          committed = true;
        } else if (tool === 'CIRCLE') {
          const r = p.dist(shapeStartX, shapeStartY, p.mouseX, p.mouseY);
          drawLayer.noFill();
          drawLayer.stroke(c.r, c.g, c.b, alpha);
          drawLayer.strokeWeight(size * 0.4);
          drawLayer.ellipse(shapeStartX, shapeStartY, r * 2);
          if (symmetry) drawLayer.ellipse(mirroredX(shapeStartX), shapeStartY, r * 2);
          committed = true;
        } else if (tool === 'RECT') {
          drawLayer.noFill();
          drawLayer.stroke(c.r, c.g, c.b, alpha);
          drawLayer.strokeWeight(size * 0.4);
          drawLayer.rectMode(p.CORNERS);
          drawLayer.rect(shapeStartX, shapeStartY, p.mouseX, p.mouseY);
          if (symmetry) drawLayer.rect(mirroredX(shapeStartX), shapeStartY, mirroredX(p.mouseX), p.mouseY);
          drawLayer.rectMode(p.CORNER);
          committed = true;
        } else if (tool === 'TRIANGLE') {
          const [tx1, ty1, tx2, ty2, tx3, ty3] = triangleFromBox(shapeStartX, shapeStartY, p.mouseX, p.mouseY);
          drawLayer.noFill();
          drawLayer.stroke(c.r, c.g, c.b, alpha);
          drawLayer.strokeWeight(size * 0.4);
          drawLayer.triangle(tx1, ty1, tx2, ty2, tx3, ty3);
          if (symmetry) {
            const [mx1, my1, mx2, my2, mx3, my3] = triangleFromBox(
              mirroredX(shapeStartX), shapeStartY, mirroredX(p.mouseX), p.mouseY
            );
            drawLayer.triangle(mx1, my1, mx2, my2, mx3, my3);
          }
          committed = true;
        } else if (tool === 'STAR' || tool === 'HEXAGON') {
          const cx = (shapeStartX + p.mouseX) / 2;
          const cy = (shapeStartY + p.mouseY) / 2;
          const outerR = Math.max(p.dist(shapeStartX, shapeStartY, p.mouseX, p.mouseY) / 2, 4);
          const innerR = tool === 'STAR' ? outerR * 0.45 : undefined;
          const sides = tool === 'STAR' ? 10 : 6;
          drawLayer.noFill();
          drawLayer.stroke(c.r, c.g, c.b, alpha);
          drawLayer.strokeWeight(size * 0.4);
          drawPolygon(drawLayer, p, cx, cy, outerR, sides, innerR);
          if (symmetry) drawPolygon(drawLayer, p, mirroredX(cx), cy, outerR, sides, innerR);
          committed = true;
        }

        if (committed) pushUndoSnapshot();
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
