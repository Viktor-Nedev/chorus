import { useEffect, useRef } from 'react';
import { Canvas, Path } from 'fabric';
import { makeFrame, CUSTOM_PROPS } from './tools';
import { applyBrush, strokeProps } from './brushes';

const UNDO_CAP = 30;
export const DEFAULT_PAGE_HEIGHT = 1400;
const GROW_STEP = 600;

/**
 * ForgeCanvas — Fabric v6 wrapper. Създава canvas ВЕДНЪЖ и излага
 * императивен api през onReady. Активният инструмент идва през toolRef
 * (mutable ref, четен в handler-ите — без re-mount).
 *
 * Платното е ВИСОКО колкото страницата (pageHeight) и се скролва вертикално
 * в host-а, така че сайтът може да продължава надолу.
 */
export function ForgeCanvas({ toolRef, onReady, onSelection, onObjectsChanged, onFrameCreated, onHeightChange }) {
  const hostRef = useRef(null);
  const canvasElRef = useRef(null);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onSelectionRef = useRef(onSelection);
  onSelectionRef.current = onSelection;
  const onObjectsChangedRef = useRef(onObjectsChanged);
  onObjectsChangedRef.current = onObjectsChanged;
  const onFrameCreatedRef = useRef(onFrameCreated);
  onFrameCreatedRef.current = onFrameCreated;
  const onHeightChangeRef = useRef(onHeightChange);
  onHeightChangeRef.current = onHeightChange;

  useEffect(() => {
    const host = hostRef.current;
    const el = canvasElRef.current;
    if (!host || !el) return;

    let pageHeight = DEFAULT_PAGE_HEIGHT;

    const canvas = new Canvas(el, {
      width: host.clientWidth,
      height: pageHeight,
      backgroundColor: '#0d0d12',
      selection: true,
      preserveObjectStacking: true,
    });
    applyBrush(canvas, { type: 'pen', color: '#F5F5F5', width: 3 });

    // ── Undo/redo: JSON snapshot стек
    let undoStack = [JSON.stringify(canvas.toJSON(CUSTOM_PROPS))];
    let redoStack = [];
    let restoring = false;

    const pushSnapshot = () => {
      if (restoring) return;
      undoStack.push(JSON.stringify(canvas.toJSON(CUSTOM_PROPS)));
      if (undoStack.length > UNDO_CAP) undoStack.shift();
      redoStack = [];
      onObjectsChangedRef.current?.();
    };

    const restore = async (json) => {
      restoring = true;
      const bg = canvas.backgroundColor;
      await canvas.loadFromJSON(json);
      canvas.backgroundColor = bg;
      canvas.renderAll();
      restoring = false;
      onObjectsChangedRef.current?.();
    };

    canvas.on('object:added', pushSnapshot);
    canvas.on('object:modified', pushSnapshot);
    canvas.on('object:removed', pushSnapshot);

    // Расти страницата, ако се рисува близо до долния ръб
    const growIfNeeded = (y) => {
      if (y < pageHeight - 120) return;
      pageHeight += GROW_STEP;
      canvas.setDimensions({ width: canvas.width, height: pageHeight });
      canvas.renderAll();
      onHeightChangeRef.current?.(pageHeight);
    };

    // Щрихите получават customType според четката (гумата — destination-out)
    canvas.on('path:created', (e) => {
      const p = e.path;
      if (!p) return;
      p.set(strokeProps(toolRef.current?.brushType));
      growIfNeeded((p.top || 0) + (p.height || 0));
    });

    // ── Selection събития → Properties панела
    const emitSelection = () => onSelectionRef.current?.(canvas.getActiveObject() || null);
    canvas.on('selection:created', emitSelection);
    canvas.on('selection:updated', emitSelection);
    canvas.on('selection:cleared', () => onSelectionRef.current?.(null));

    // ── Frame drag-to-create + bucket fill
    let draftRect = null;
    let dragStart = null;

    canvas.on('mouse:down', (opt) => {
      const tool = toolRef.current?.tool;

      // Кофичка: клик върху обект → неговият fill; по празно → фон на страницата
      if (tool === 'FILL') {
        const color = toolRef.current?.color || '#F5F5F5';
        if (opt.target) {
          opt.target.set({ fill: color });
          canvas.renderAll();
          pushSnapshot();
        } else {
          canvas.backgroundColor = color;
          canvas.renderAll();
          onObjectsChangedRef.current?.();
        }
        return;
      }

      if (tool !== 'FRAME' || opt.target) return;
      const p = canvas.getScenePoint(opt.e);
      dragStart = p;
      draftRect = makeFrame(p.x, p.y, 1, 1, 'auto');
      draftRect.set({ selectable: false, evented: false });
      restoring = true; // не snapshot-вай draft-а
      canvas.add(draftRect);
      restoring = false;
      canvas.selection = false;
    });

    canvas.on('mouse:move', (opt) => {
      if (!draftRect || !dragStart) return;
      const p = canvas.getScenePoint(opt.e);
      draftRect.set({
        left: Math.min(dragStart.x, p.x),
        top: Math.min(dragStart.y, p.y),
        width: Math.abs(p.x - dragStart.x),
        height: Math.abs(p.y - dragStart.y),
      });
      canvas.renderAll();
    });

    canvas.on('mouse:up', (opt) => {
      if (!draftRect) return;
      const rect = draftRect;
      draftRect = null;
      dragStart = null;
      canvas.selection = true;
      if (rect.width < 12 || rect.height < 12) {
        restoring = true;
        canvas.remove(rect);
        restoring = false;
        return;
      }
      rect.set({ selectable: true, evented: true });
      growIfNeeded(rect.top + rect.height);
      const p = canvas.getScenePoint(opt.e);
      onFrameCreatedRef.current?.(rect, { x: opt.e.clientX, y: opt.e.clientY });
      pushSnapshot();
    });

    // ── Resize: ширината следва контейнера, височината е на страницата
    const ro = new ResizeObserver(() => {
      canvas.setDimensions({ width: host.clientWidth, height: pageHeight });
    });
    ro.observe(host);

    // ── Delete/Backspace трие селекцията (освен при писане в текст/поле)
    const onKeyDown = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
      const active = canvas.getActiveObject();
      if (!active || active.isEditing) return;
      e.preventDefault();
      canvas.getActiveObjects().forEach((o) => canvas.remove(o));
      canvas.discardActiveObject();
      canvas.renderAll();
    };
    window.addEventListener('keydown', onKeyDown);

    // ── Изложи api
    onReadyRef.current?.({
      getCanvas: () => canvas,
      undo: () => {
        if (undoStack.length <= 1) return;
        redoStack.push(undoStack.pop());
        restore(undoStack[undoStack.length - 1]);
      },
      redo: () => {
        if (!redoStack.length) return;
        const json = redoStack.pop();
        undoStack.push(json);
        restore(json);
      },
      clear: () => {
        canvas.getObjects().forEach((o) => canvas.remove(o));
        canvas.discardActiveObject();
        canvas.renderAll();
      },
      deleteSelected: () => {
        const active = canvas.getActiveObjects();
        active.forEach((o) => canvas.remove(o));
        canvas.discardActiveObject();
        canvas.renderAll();
      },
      addObject: (obj) => {
        canvas.add(obj);
        canvas.setActiveObject(obj);
        canvas.renderAll();
      },
      addObjects: (objs) => {
        restoring = true;
        objs.forEach((o) => canvas.add(o));
        restoring = false;
        canvas.renderAll();
        pushSnapshot();
      },
      setDrawingMode: (on) => {
        canvas.isDrawingMode = on;
      },
      setBrush: (opts) => applyBrush(canvas, opts),
      // Рисуване с ръка: точки в координати на платното → Path с текущата четка
      strokeFromPoints: (points, { color = '#F5F5F5', width = 3, type = 'pen' } = {}) => {
        if (!points || points.length < 2) return;
        const d = points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ');
        const path = new Path(d, {
          stroke: color,
          strokeWidth: width,
          fill: null,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          selectable: true,
          ...strokeProps(type),
        });
        canvas.add(path);
        canvas.renderAll();
        growIfNeeded(path.top + path.height);
      },
      setPageHeight: (h) => {
        pageHeight = Math.max(400, Math.round(h));
        canvas.setDimensions({ width: canvas.width, height: pageHeight });
        canvas.renderAll();
        onHeightChangeRef.current?.(pageHeight);
      },
      growPage: () => {
        pageHeight += GROW_STEP;
        canvas.setDimensions({ width: canvas.width, height: pageHeight });
        canvas.renderAll();
        onHeightChangeRef.current?.(pageHeight);
      },
      getPageHeight: () => pageHeight,
      setBackground: (color) => {
        canvas.backgroundColor = color;
        canvas.renderAll();
        onObjectsChangedRef.current?.();
      },
      loadJSON: async (json, height) => {
        restoring = true;
        if (height) {
          pageHeight = Math.max(400, Math.round(height));
          canvas.setDimensions({ width: host.clientWidth, height: pageHeight });
        }
        await canvas.loadFromJSON(json);
        canvas.renderAll();
        restoring = false;
        undoStack = [JSON.stringify(canvas.toJSON(CUSTOM_PROPS))];
        redoStack = [];
        onHeightChangeRef.current?.(pageHeight);
        onObjectsChangedRef.current?.();
      },
      reset: (height = DEFAULT_PAGE_HEIGHT) => {
        restoring = true;
        canvas.getObjects().forEach((o) => canvas.remove(o));
        canvas.discardActiveObject();
        canvas.backgroundColor = '#0d0d12';
        pageHeight = height;
        canvas.setDimensions({ width: host.clientWidth, height: pageHeight });
        canvas.renderAll();
        restoring = false;
        undoStack = [JSON.stringify(canvas.toJSON(CUSTOM_PROPS))];
        redoStack = [];
        onHeightChangeRef.current?.(pageHeight);
        onObjectsChangedRef.current?.();
      },
    });

    return () => {
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      canvas.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={hostRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden webforge-scroll">
      <canvas ref={canvasElRef} />
    </div>
  );
}
