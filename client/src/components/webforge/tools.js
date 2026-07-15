// Fabric v6 обектни фабрики за WebForge инструментите. Всеки обект носи
// семантични custom props (customType, formFields, ...), които се
// сериализират чрез canvas.toJSON(CUSTOM_PROPS) и стигат до Gemini анализа.
import { Rect, IText, Group, Line } from 'fabric';

export const CUSTOM_PROPS = [
  'customType',
  'annotation',
  'formFields',
  'buttonStyle',
  'textRole',
  'navItems',
  'componentKind',
];

// Цветове на рамките по тип — визуална конвенция
export const FRAME_COLORS = {
  auto: '#8a8a92',
  navbar: '#8B7BFA',
  hero: '#67E8F9',
  section: '#D9D9D9',
  card: '#FFD27F',
  footer: '#FF8FC7',
  sidebar: '#64FFB4',
  form: '#3DDC97',
  backend: '#FF8A3D',
};

export const FRAME_TYPES = [
  'auto', 'navbar', 'hero', 'section', 'card', 'footer', 'sidebar', 'form', 'backend',
];

export function makeFrame(left, top, width, height, frameType = 'auto') {
  const stroke = FRAME_COLORS[frameType] || FRAME_COLORS.auto;
  return new Rect({
    left,
    top,
    width,
    height,
    fill: 'rgba(255,255,255,0.04)',
    stroke,
    strokeWidth: 1.5,
    strokeUniform: true,
    rx: 4,
    ry: 4,
    customType: frameType === 'auto' ? 'frame' : frameType,
  });
}

export function makeText(left, top, text = 'Text', role = 'body') {
  const sizes = { h1: 42, h2: 32, h3: 24, body: 16, caption: 12, label: 14 };
  return new IText(text, {
    left,
    top,
    fontSize: sizes[role] || 16,
    fill: '#F5F5F5',
    fontFamily: 'Arial',
    customType: 'text',
    textRole: role,
  });
}

export function makeImagePlaceholder(left, top, width = 200, height = 140) {
  const box = new Rect({
    left: 0,
    top: 0,
    width,
    height,
    fill: 'rgba(255,255,255,0.05)',
    stroke: '#8a8a92',
    strokeWidth: 1,
    strokeDashArray: [6, 4],
  });
  const d1 = new Line([0, 0, width, height], { stroke: '#8a8a92', strokeWidth: 1 });
  const d2 = new Line([width, 0, 0, height], { stroke: '#8a8a92', strokeWidth: 1 });
  const label = new IText('IMG', {
    left: width / 2 - 18,
    top: height / 2 - 10,
    fontSize: 16,
    fill: '#8a8a92',
    fontFamily: 'Arial',
  });
  const group = new Group([box, d1, d2, label], { left, top });
  group.set({ customType: 'image' });
  return group;
}

export function makeButton(left, top, label = 'Button', style = 'primary') {
  const colors = {
    primary: { bg: '#8B7BFA', fg: '#0a0a0f' },
    secondary: { bg: 'rgba(255,255,255,0.1)', fg: '#F5F5F5' },
    danger: { bg: '#FF5555', fg: '#0a0a0f' },
    ghost: { bg: 'transparent', fg: '#D9D9D9' },
    link: { bg: 'transparent', fg: '#67E8F9' },
  };
  const c = colors[style] || colors.primary;
  const width = Math.max(110, label.length * 10 + 40);
  const rect = new Rect({
    left: 0,
    top: 0,
    width,
    height: 40,
    fill: c.bg,
    stroke: style === 'ghost' ? '#8a8a92' : undefined,
    strokeWidth: style === 'ghost' ? 1 : 0,
    rx: 8,
    ry: 8,
  });
  const text = new IText(label, {
    left: width / 2,
    top: 20,
    originX: 'center',
    originY: 'center',
    fontSize: 15,
    fill: c.fg,
    fontFamily: 'Arial',
  });
  const group = new Group([rect, text], { left, top });
  group.set({ customType: 'button', buttonStyle: style });
  return group;
}

export function makeNav(left, top, items = ['Logo', 'Home', 'About', 'Contact']) {
  const width = 700;
  const height = 52;
  const parts = [
    new Rect({
      left: 0,
      top: 0,
      width,
      height,
      fill: 'rgba(139,123,250,0.12)',
      stroke: '#8B7BFA',
      strokeWidth: 1.5,
      rx: 6,
      ry: 6,
    }),
  ];
  // Първият елемент = лого (вляво), останалите — вдясно
  parts.push(
    new IText(items[0] || 'Logo', {
      left: 18,
      top: 16,
      fontSize: 17,
      fontWeight: 'bold',
      fill: '#F5F5F5',
      fontFamily: 'Arial',
    })
  );
  let x = width - 20;
  for (let i = items.length - 1; i >= 1; i--) {
    const w = items[i].length * 8 + 10;
    x -= w + 14;
    parts.push(
      new IText(items[i], {
        left: x,
        top: 18,
        fontSize: 14,
        fill: '#D9D9D9',
        fontFamily: 'Arial',
      })
    );
  }
  const group = new Group(parts, { left, top });
  group.set({ customType: 'navbar', navItems: items });
  return group;
}

export const COMPONENT_KINDS = [
  'Modal', 'Toast', 'Dropdown', 'Table', 'Chart', 'Calendar',
  'File Upload', 'Rich Text Editor', 'Image Gallery', 'Video Player', 'Map',
];

export function makeComponentPlaceholder(left, top, kind) {
  const width = 240;
  const height = 150;
  const parts = [
    new Rect({
      left: 0,
      top: 0,
      width,
      height,
      fill: 'rgba(255,210,127,0.07)',
      stroke: '#FFD27F',
      strokeWidth: 1.5,
      strokeDashArray: [8, 5],
      rx: 8,
      ry: 8,
    }),
    new IText(`◈ ${kind}`, {
      left: width / 2,
      top: height / 2,
      originX: 'center',
      originY: 'center',
      fontSize: 15,
      fill: '#FFD27F',
      fontFamily: 'Arial',
    }),
  ];
  const group = new Group(parts, { left, top });
  group.set({ customType: 'component', componentKind: kind });
  return group;
}
