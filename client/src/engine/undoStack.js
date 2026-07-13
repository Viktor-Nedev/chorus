// Undo/redo stack за drawLayer snapshots (p5.Image обекти, не base64 —
// синхронно и евтино). Пази максимум `maxDepth` записа; всеки нов push
// изчиства redo стека (стандартно поведение на undo history).
export function createUndoStack(maxDepth = 20) {
  let undoStack = [];
  let redoStack = [];

  return {
    push(snapshotImg) {
      undoStack.push(snapshotImg);
      if (undoStack.length > maxDepth) undoStack.shift();
      redoStack = [];
    },
    canUndo: () => undoStack.length > 1, // 1 запис = текущото състояние, нищо преди него
    canRedo: () => redoStack.length > 0,
    // current: снимка на текущото (живо) състояние, за да може redo да го възстанови
    undo(current) {
      if (undoStack.length <= 1) return null;
      redoStack.push(current);
      undoStack.pop();
      return undoStack[undoStack.length - 1];
    },
    redo() {
      if (!redoStack.length) return null;
      const img = redoStack.pop();
      undoStack.push(img);
      return img;
    },
    // Нова база (напр. при зареждане на запазена картина) — изчиства историята
    reset(baselineImg) {
      undoStack = [baselineImg];
      redoStack = [];
    },
  };
}
