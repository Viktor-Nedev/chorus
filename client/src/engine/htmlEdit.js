// Визуално редактиране на генерирания HTML: маркира елементите със стабилен
// `data-wf-id`, прилага текстови/стилови промени по id и накрая маха
// маркерите, за да не изтичат в publish/ZIP.
//
// Работи през DOMParser/XMLSerializer (браузър). Всички функции получават и
// връщат HTML низ, така че истинският файл в проекта остава източникът.

const ATTR = 'data-wf-id';
const SKIP = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'TITLE', 'BR', 'HR']);

function parse(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function serialize(doc, original) {
  const out = `<!doctype html>\n${doc.documentElement.outerHTML}`;
  // Ако входът не е бил цял документ, не добавяй doctype/html обвивка
  return /<html[\s>]/i.test(original) || /<!doctype/i.test(original) ? out : doc.body.innerHTML;
}

// Обхожда в стабилен ред (document order) и слага data-wf-id на всеки елемент
export function annotate(html = '') {
  if (!html) return html;
  const doc = parse(html);
  let i = 0;
  doc.body.querySelectorAll('*').forEach((el) => {
    if (SKIP.has(el.tagName)) return;
    el.setAttribute(ATTR, String(i++));
  });
  return serialize(doc, html);
}

export function stripAnnotations(html = '') {
  if (!html || !html.includes(ATTR)) return html;
  const doc = parse(html);
  doc.body.querySelectorAll(`[${ATTR}]`).forEach((el) => el.removeAttribute(ATTR));
  // махни и помощните класове/атрибути на редактора
  doc.body.querySelectorAll('[data-wf-hover]').forEach((el) => el.removeAttribute('data-wf-hover'));
  return serialize(doc, html);
}

// Елементите, чийто текст може да се сменя директно (само ако нямат деца-елементи)
export function isTextEditable(el) {
  if (!el) return false;
  return el.children.length === 0 && (el.textContent || '').trim().length > 0;
}

// Смяна на текста САМО на този елемент (не пипа съседите)
export function applyTextEdit(html, id, text) {
  const doc = parse(html);
  const el = doc.body.querySelector(`[${ATTR}="${id}"]`);
  if (!el) return html;
  el.textContent = String(text ?? '');
  return serialize(doc, html);
}

// Слива inline стилове (нови стойности печелят; празна стойност маха свойството)
export function applyStyleEdit(html, id, styleObj = {}) {
  const doc = parse(html);
  const el = doc.body.querySelector(`[${ATTR}="${id}"]`);
  if (!el) return html;

  const current = {};
  for (const part of (el.getAttribute('style') || '').split(';')) {
    const [k, ...rest] = part.split(':');
    const key = k?.trim();
    const val = rest.join(':').trim();
    if (key && val) current[key] = val;
  }
  for (const [k, v] of Object.entries(styleObj)) {
    const key = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    if (v === '' || v == null) delete current[key];
    else current[key] = String(v);
  }
  const next = Object.entries(current).map(([k, v]) => `${k}: ${v}`).join('; ');
  if (next) el.setAttribute('style', next);
  else el.removeAttribute('style');
  return serialize(doc, html);
}

// Изтрива елемент (за „премахни този блок")
export function applyDelete(html, id) {
  const doc = parse(html);
  const el = doc.body.querySelector(`[${ATTR}="${id}"]`);
  if (!el) return html;
  el.remove();
  return serialize(doc, html);
}

// Скриптът, който живее В iframe-а: hover контур, клик за избор,
// contentEditable за текст, postMessage към родителя.
export const EDITOR_SCRIPT = `<script>(function(){
  var ATTR='${ATTR}';
  var sel=null;
  var style=document.createElement('style');
  style.textContent='[data-wf-hover]{outline:2px dashed rgba(124,108,240,.9)!important;outline-offset:1px;cursor:pointer}'
    +'[data-wf-sel]{outline:2px solid rgba(124,108,240,1)!important;outline-offset:1px}'
    +'[contenteditable="true"]{cursor:text}';
  document.head.appendChild(style);

  function post(msg){ parent.postMessage(msg,'*'); }
  function info(el){
    var cs=getComputedStyle(el);
    return { id: el.getAttribute(ATTR), tag: el.tagName.toLowerCase(),
      text: el.children.length===0 ? (el.textContent||'').trim() : null,
      color: cs.color, background: cs.backgroundColor, fontSize: cs.fontSize,
      padding: cs.padding, borderRadius: cs.borderRadius };
  }
  document.addEventListener('mouseover',function(e){
    var el=e.target.closest('['+ATTR+']'); if(!el) return;
    document.querySelectorAll('[data-wf-hover]').forEach(function(n){n.removeAttribute('data-wf-hover')});
    el.setAttribute('data-wf-hover','1');
  },true);
  document.addEventListener('mouseout',function(e){
    var el=e.target.closest('['+ATTR+']'); if(el) el.removeAttribute('data-wf-hover');
  },true);
  document.addEventListener('click',function(e){
    var el=e.target.closest('['+ATTR+']'); if(!el) return;
    e.preventDefault(); e.stopPropagation();
    if(sel && sel!==el){ sel.removeAttribute('data-wf-sel'); sel.removeAttribute('contenteditable'); }
    sel=el; el.setAttribute('data-wf-sel','1');
    if(el.children.length===0){
      el.setAttribute('contenteditable','true'); el.focus();
    }
    post({ type:'wf-select', payload: info(el) });
  },true);
  document.addEventListener('blur',function(e){
    var el=e.target; if(!el.getAttribute || el.getAttribute('contenteditable')!=='true') return;
    post({ type:'wf-text', payload:{ id: el.getAttribute(ATTR), text:(el.textContent||'').trim() } });
  },true);
  document.addEventListener('keydown',function(e){
    if(e.key==='Enter' && e.target.getAttribute && e.target.getAttribute('contenteditable')==='true'){
      e.preventDefault(); e.target.blur();
    }
  },true);
  // блокирай навигацията в режим на редакция
  document.addEventListener('submit',function(e){e.preventDefault()},true);
})();</script>`;
