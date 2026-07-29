// Свързване на страниците: име → файлов път, уникалност при дублирани имена,
// и site map, който отива към AI-я и към wireframe навигацията.

export function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// Първата страница (или „home") е index.html; останалите — <slug>.html
export function pagePath(name, index = 0) {
  const slug = slugify(name);
  if (index === 0 || slug === 'home' || slug === 'index' || !slug) return 'index.html';
  return `${slug}.html`;
}

// Уникални пътища дори при еднакви имена (About, About → about.html, about-2.html)
export function buildSiteMap(pages = []) {
  const used = new Set();
  return pages.map((p, i) => {
    let path = pagePath(p.name, i);
    if (used.has(path)) {
      const base = path.replace(/\.html$/, '');
      let n = 2;
      while (used.has(`${base}-${n}.html`)) n++;
      path = `${base}-${n}.html`;
    }
    used.add(path);
    return { id: p.id, name: p.name || (i === 0 ? 'Home' : `Page ${i + 1}`), path, isHome: i === 0 };
  });
}

// Кратко описание на навигацията за промпта
export function siteMapSummary(siteMap = []) {
  return siteMap.map((p) => `${p.name} -> ${p.path}`).join(', ');
}

// Съпоставя nav етикет към път (за кликаемия wireframe preview)
export function resolveNavTarget(label, siteMap = []) {
  const s = slugify(label);
  if (!s) return null;
  const hit = siteMap.find((p) => slugify(p.name) === s || p.path === `${s}.html`);
  return hit ? hit.path : null;
}
