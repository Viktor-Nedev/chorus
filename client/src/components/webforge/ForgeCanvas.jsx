import { useEffect, useRef } from 'react';
import { Canvas, PencilBrush } from 'fabric';
import { makeFrame, CUSTOM_PROPS } from './tools';

const UNDO_CAP = 30;

/**
 * ForgeCanvas — Fabric v6 wrapper. Създава canvas ВЕДНЪЖ и излага
 * императивен api през onReady (getCanvas/undo/redo/clear) — същият идиом
 * като onSystemReady при P5Canvas. Активният инструмент идва през toolRef
 * (mutable ref, четен в event handler-ите — без re-mount).
 *
 * Frame инструментът е drag-to-create: mousedown/move/up върху platnoto;
 * при пускане родителят получава onFrameCreated(rect) за type popover-а.
 */
export function ForgeCanvas({ toolRef, onReady, onSelection, onObjectsChanged, onFrameCreated }) {
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

  useEffect(() => {
    const host = hostRef.current;
    const el = canvasElRef.current;
    if (!host || !el) return;

    const canvas = new Canvas(el, {
      width: host.clientWidth,
      height: host.clientHeight,
      backgroundColor: '#0d0d12',
      selection: true,
      preserveObjectStacking: true,
    });
    canvas.freeDrawingBrush = new PencilBrush(canvas);
    canvas.freeDrawingBrush.color = '#F5F5F5';
    canvas.freeDrawingBrush.width = 2;

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
      await canvas.loadFromJSON(json);
      canvas.backgroundColor = '#0d0d12';
      canvas.renderAll();
      restoring = false;
      onObjectsChangedRef.current?.();
    };

    canvas.on('object:added', pushSnapshot);
    canvas.on('object:modified', pushSnapshot);
    canvas.on('object:removed', pushSnapshot);

    // ── Selection събития → Properties панела
    const emitSelection = () => onSelectionRef.current?.(canvas.getActiveObject() || null);
    canvas.on('selection:created', emitSelection);
    canvas.on('selection:updated', emitSelection);
    canvas.on('selection:cleared', () => onSelectionRef.current?.(null));

    // ── Frame drag-to-create
    let draftRect = null;
    let dragStart = null;

    canvas.on('mouse:down', (opt) => {
      const tool = toolRef.current?.tool;
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
      const p = canvas.getScenePoint(opt.e);
      // Родителят показва type popover при екранните координати
      onFrameCreatedRef.current?.(rect, { x: opt.e.clientX, y: opt.e.clientY });
      pushSnapshot();
    });

    // ── Resize с контейнера
    const ro = new ResizeObserver(() => {
      canvas.setDimensions({ width: host.clientWidth, height: host.clientHeight });
    });
    ro.observe(host);

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
      setDrawingMode: (on) => {
        canvas.isDrawingMode = on;
      },
    });

    return () => {
      ro.disconnect();
      canvas.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={hostRef} className="absolute inset-0">
      <canvas ref={canvasElRef} />
    </div>
  );
}
