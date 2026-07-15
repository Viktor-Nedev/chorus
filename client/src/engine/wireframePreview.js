// Live wireframe preview — детерминистичен HTML директно от Fabric
// обектите (без AI): рисуваш → виждаш сайта веднага. Позициите идват
// от sketchAnalyzer сериализацията (xPct/yPct/wPct/hPct).

const FRAME_TINTS = {
  navbar: { border: '#7c6cf0', bg: 'rgba(124,108,240,0.06)' },
  hero: { border: '#22b8d4', bg: 'rgba(34,184,212,0.06)' },
  section: { border: '#9a9aa4', bg: 'rgba(120,120,130,0.05)' },
  card: { border: '#e0a33c', bg: 'rgba(224,163,60,0.07)' },
  footer: { border: '#e06ba8', bg: 'rgba(224,107,168,0.06)' },
  sidebar: { border: '#2fbf7f', bg: 'rgba(47,191,127,0.06)' },
  form: { border: '#2fbf7f', bg: 'rgba(47,191,127,0.05)' },
  backend: { border: '#e0902c', bg: 'rgba(224,144,44,0.07)' },
  frame: { border: '#b3b3bc', bg: 'rgba(120,120,130,0.04)' },
};

const BUTTON_COLORS = {
  primary: { bg: '#6c5ce7', fg: '#ffffff' },
  secondary: { bg: '#e8e8ee', fg: '#2a2a33' },
  danger: { bg: '#e05555', fg: '#ffffff' },
  ghost: { bg: 'transparent', fg: '#55555e' },
  link: { bg: 'transparent', fg: '#1f9dbb' },
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const posStyle = (o) =>
  `position:absolute;left:${o.xPct}%;top:${o.yPct}%;width:${o.wPct}%;height:${o.hPct}%;`;

// font-size в cqw — мащабира се с ширината на контейнера (container query units)
const fontCqw = (fontSize, cw) => `${((fontSize / cw) * 100).toFixed(2)}cqw`;

function renderObject(o, cw, ch) {
  const type = o.customType || o.type;

  // ── Текст
  if (type === 'text' || o.type === 'i-text' || o.type === 'textbox') {
    const weight = o.textRole === 'h1' || o.textRole === 'h2' ? 700 : o.textRole === 'h3' ? 600 : 400;
    return `<div style="${posStyle(o)}height:auto;font-size:${fontCqw(o.fontSize || 16, cw)};font-weight:${weight};color:#26262e;white-space:pre-wrap;line-height:1.2;">${esc(o.text)}</div>`;
  }

  // ── Бутон (група rect+text)
  if (type === 'button') {
    const c = BUTTON_COLORS[o.buttonStyle] || BUTTON_COLORS.primary;
    const label = o.children?.find((ch) => ch.text)?.text || 'Button';
    const border = o.buttonStyle === 'ghost' ? 'border:1.5px solid #b3b3bc;' : '';
    return `<div style="${posStyle(o)}display:flex;align-items:center;justify-content:center;background:${c.bg};color:${c.fg};${border}border-radius:10px;font-size:${fontCqw(15, cw)};font-weight:600;box-shadow:${o.buttonStyle === 'primary' ? '0 2px 8px rgba(108,92,231,0.35)' : 'none'};">${esc(label)}</div>`;
  }

  // ── Навигация (група) — лого вляво, елементи вдясно
  if (type === 'navbar' && o.navItems) {
    const [logo, ...items] = o.navItems;
    return `<div style="${posStyle(o)}display:flex;align-items:center;justify-content:space-between;padding:0 2cqw;background:#ffffff;border-bottom:1.5px solid #e4e4ea;box-shadow:0 1px 6px rgba(0,0,0,0.05);border-radius:6px;">
      <span style="font-size:${fontCqw(17, cw)};font-weight:700;color:#26262e;">${esc(logo || 'Logo')}</span>
      <span style="display:flex;gap:1.6cqw;">${items.map((it) => `<span style="font-size:${fontCqw(14, cw)};color:#55555e;">${esc(it)}</span>`).join('')}</span>
    </div>`;
  }

  // ── Image placeholder — кутия с диагонален кръст
  if (type === 'image') {
    return `<div style="${posStyle(o)}border:1.5px dashed #b3b3bc;border-radius:8px;background:
      linear-gradient(to top right, transparent 49.6%, #c9c9d1 49.8%, #c9c9d1 50.2%, transparent 50.4%),
      linear-gradient(to bottom right, transparent 49.6%, #c9c9d1 49.8%, #c9c9d1 50.2%, transparent 50.4%),
      #f2f2f5;display:flex;align-items:center;justify-content:center;">
      <span style="font-size:${fontCqw(13, cw)};color:#9a9aa4;background:#f2f2f5;padding:2px 8px;border-radius:4px;">IMG</span></div>`;
  }

  // ── Component placeholder
  if (type === 'component') {
    return `<div style="${posStyle(o)}border:1.5px dashed #e0a33c;border-radius:10px;background:rgba(224,163,60,0.06);display:flex;align-items:center;justify-content:center;font-size:${fontCqw(14, cw)};color:#b07c20;font-weight:600;">◈ ${esc(o.componentKind || 'Component')}</div>`;
  }

  // ── Legacy form група с полета
  if (type === 'form' && o.formFields) {
    const rows = o.formFields
      .map(
        (f) => `<div style="margin-bottom:6cqh;">
          <div style="font-size:${fontCqw(11, cw)};color:#9a9aa4;margin-bottom:2px;">${esc(f.label)}</div>
          <div style="height:14cqh;min-height:18px;background:#eeeef2;border:1px solid #dcdce4;border-radius:5px;"></div>
        </div>`
      )
      .join('');
    return `<div style="${posStyle(o)}border:1.5px solid #2fbf7f;border-radius:10px;background:#ffffff;padding:4cqh 1.4cqw;box-sizing:border-box;overflow:hidden;">${rows}
      <div style="height:16cqh;min-height:22px;background:#6c5ce7;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:${fontCqw(13, cw)};font-weight:600;">Submit</div></div>`;
  }

  // ── Freehand щрих → SVG полилиния
  if (o.type === 'freehand' && o.polyline?.length > 1) {
    const points = o.polyline.map(([x, y]) => `${x},${y}`).join(' ');
    return `<svg style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;" viewBox="0 0 ${cw} ${ch}" preserveAspectRatio="none">
      <polyline points="${points}" fill="none" stroke="${esc(o.stroke || '#55555e')}" stroke-width="${o.strokeWidth || 2}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  // ── Frames (navbar/hero/section/card/footer/sidebar/form/backend/frame)
  const tint = FRAME_TINTS[type] || FRAME_TINTS.frame;
  const dashed = type === 'form' || type === 'backend' ? 'dashed' : 'solid';
  const label = type !== 'frame' ? `<span style="position:absolute;top:4px;left:8px;font-size:${fontCqw(10, cw)};letter-spacing:0.12em;text-transform:uppercase;color:${tint.border};opacity:0.75;font-weight:700;">${type === 'backend' ? '⚡ backend' : esc(type)}</span>` : '';
  return `<div style="${posStyle(o)}border:1.5px ${dashed} ${tint.border};border-radius:10px;background:${tint.bg};box-sizing:border-box;">${label}</div>`;
}

export function buildWireframeHtml(objects, canvasSize) {
  if (!objects?.length) return null;
  const cw = canvasSize?.width || 1200;
  const ch = canvasSize?.height || 800;

  const body = objects.map((o) => renderObject(o, cw, ch)).join('\n');

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;font-family:'Segoe UI',system-ui,sans-serif;}
  body{background:#ebebf0;min-height:100vh;padding:14px;box-sizing:border-box;}
  .chrome{max-width:100%;background:#fff;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,0.12);overflow:hidden;}
  .chrome-bar{height:28px;background:#f2f2f6;border-bottom:1px solid #e4e4ea;display:flex;align-items:center;gap:6px;padding:0 12px;}
  .dot{width:9px;height:9px;border-radius:50%;}
  .page{position:relative;width:100%;aspect-ratio:${cw}/${ch};container-type:inline-size;background:#fdfdfe;}
</style></head>
<body>
  <div class="chrome">
    <div class="chrome-bar">
      <span class="dot" style="background:#ff5f57"></span>
      <span class="dot" style="background:#febc2e"></span>
      <span class="dot" style="background:#28c840"></span>
    </div>
    <div class="page">
${body}
    </div>
  </div>
</body></html>`;
}
