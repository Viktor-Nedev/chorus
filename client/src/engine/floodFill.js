// Итеративен (не рекурсивен — рекурсия на 1080p canvas би препълнила стека),
// 4-свързан flood fill върху RGBA Uint8ClampedArray (drawLayer.pixels).
// tolerance позволява запълване през леко антиалиасирани/полупрозрачни ръбове,
// вместо да протича през тях или да спира твърде рано.

function colorDistance(pixels, idx, target) {
  const dr = pixels[idx] - target.r;
  const dg = pixels[idx + 1] - target.g;
  const db = pixels[idx + 2] - target.b;
  const da = pixels[idx + 3] - target.a;
  return Math.sqrt(dr * dr + dg * dg + db * db + da * da);
}

export function floodFill(pixels, width, height, startX, startY, fillColor, tolerance = 30) {
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

  const startIdx = (startY * width + startX) * 4;
  const target = {
    r: pixels[startIdx],
    g: pixels[startIdx + 1],
    b: pixels[startIdx + 2],
    a: pixels[startIdx + 3],
  };
  const fill = { r: fillColor.r, g: fillColor.g, b: fillColor.b, a: 255 };

  // Целта вече е (почти) новия цвят — няма какво да пълним
  if (
    Math.abs(target.r - fill.r) < 2 &&
    Math.abs(target.g - fill.g) < 2 &&
    Math.abs(target.b - fill.b) < 2 &&
    Math.abs(target.a - fill.a) < 2
  ) {
    return;
  }

  const visited = new Uint8Array(width * height);
  const stack = [startY * width + startX];
  visited[startY * width + startX] = 1;

  while (stack.length) {
    const pos = stack.pop();
    const x = pos % width;
    const y = (pos - x) / width;
    const idx = pos * 4;

    if (colorDistance(pixels, idx, target) > tolerance) continue;

    pixels[idx] = fill.r;
    pixels[idx + 1] = fill.g;
    pixels[idx + 2] = fill.b;
    pixels[idx + 3] = fill.a;

    if (x > 0 && !visited[pos - 1]) { visited[pos - 1] = 1; stack.push(pos - 1); }
    if (x < width - 1 && !visited[pos + 1]) { visited[pos + 1] = 1; stack.push(pos + 1); }
    if (y > 0 && !visited[pos - width]) { visited[pos - width] = 1; stack.push(pos - width); }
    if (y < height - 1 && !visited[pos + width]) { visited[pos + width] = 1; stack.push(pos + width); }
  }
}
