import { Fragment } from 'react';
import { ICON_MAP } from '../constants/iconMap';

// Всички глифове, за които има картинка — сортирани по дължина, за да се
// хващат първо съставните (напр. с variation selector).
const GLYPH_RE = new RegExp(
  `(${Object.keys(ICON_MAP)
    .sort((a, b) => b.length - a.length)
    .map((g) => g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\uFE0F?`,
  'g'
);

// Показва генерираната иконка вместо емоджито. Ако за този глиф няма
// изображение, връща самото емоджи — така UI-ят никога не остава празен.
//
//   <Icon glyph="🪣" />            вместо   {'🪣'}
//   <Icon glyph={t.icon} size={22} />
// Част от глифовете в кода носят variation selector (U+FE0F/FE0E) — „🖌️" не е
// същият низ като „🖌". Махаме ги преди търсенето, за да съвпадат с картата.
const normalize = (g) => (typeof g === 'string' ? g.replace(/[\uFE0E\uFE0F]/g, '') : g);

export function Icon({ glyph, size = 20, className = '', title, alt }) {
  const file = ICON_MAP[normalize(glyph)];
  if (!file) {
    return (
      <span className={className} title={title} aria-hidden={!alt}>
        {glyph}
      </span>
    );
  }
  return (
    <img
      src={`/icons/${file}`}
      width={size}
      height={size}
      alt={alt || ''}
      title={title}
      draggable={false}
      aria-hidden={!alt}
      className={`inline-block select-none align-[-0.15em] ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Показва низ, в който може да има глифове, като ги подменя с иконки.
 * Ползва се за етикети, наръчника и toast съобщенията — там не може да се
 * сложи JSX, затова текстът остава низ, а подмяната става при рендер.
 *
 *   <IconText size={14}>{'🎨 Draw'}</IconText>
 *   <IconText>{toast}</IconText>
 */
export function IconText({ children, size = 15, className = '' }) {
  if (typeof children !== 'string' || !children) return children ?? null;
  const parts = children.split(GLYPH_RE);
  if (parts.length === 1) return children;
  return (
    <>
      {parts.map((p, i) =>
        // нечетните индекси са уловените глифове
        i % 2 === 1 ? (
          <Icon key={i} glyph={p} size={size} className={className} />
        ) : (
          <Fragment key={i}>{p}</Fragment>
        )
      )}
    </>
  );
}
