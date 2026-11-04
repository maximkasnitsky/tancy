// Базовый UI: делегирование событий, нижние «шторки», тосты, подтверждения.
import * as store from './store.js';
import { esc } from './util.js';

export const actions = {};  // data-act="name"   → actions.name(dataset, el, event)
export const forms = {};    // data-form="name"  → forms.name(form, formData)
export const inputs = {};   // data-input="name" → inputs.name(el) на input/change

let renderer = () => {};
export const setRenderer = fn => { renderer = fn; };

const stack = [];

export function refresh() {
  renderer();
  [...stack].forEach(s => { if (s.dynamic) renderSheet(s); });
}

// ---------- Шторки ----------
export function openSheet({ title, render, dynamic = false, tall = false, onClose, mount }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop" data-act="close-sheet"></div>
    <div class="sheet ${tall ? 'tall' : ''}" role="dialog" aria-modal="true">
      <div class="sheet-grab"></div>
      <div class="sheet-head">
        <div class="sheet-title"></div>
        <button class="icon-btn" data-act="close-sheet" aria-label="Закрыть">
          <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <div class="sheet-body"></div>
    </div>`;
  document.getElementById('sheets').appendChild(wrap);
  const s = { wrap, title, render, dynamic, onClose, mount };
  stack.push(s);
  renderSheet(s);
  if (!stack.length || !stack.includes(s)) return s; // render мог закрыть
  wrap.getBoundingClientRect(); // принудительная отрисовка — анимация появления сработает и без кадра
  wrap.classList.add('open');
  enableDrag(s);
  document.body.classList.add('has-sheet');
  return s;
}

function renderSheet(s) {
  const body = s.wrap.querySelector('.sheet-body');
  const html = s.render(s);
  if (html == null) { closeSheet(s); return; }
  s.wrap.querySelector('.sheet-title').textContent = typeof s.title === 'function' ? s.title() : (s.title || '');
  const top = body.scrollTop;
  body.innerHTML = html;
  body.scrollTop = top;
  s.mount?.(body, s);
}

export function closeSheet(s = stack[stack.length - 1]) {
  const i = stack.indexOf(s);
  if (i < 0) return;
  stack.splice(i, 1);
  document.activeElement?.blur?.();
  s.wrap.classList.remove('open');
  s.wrap.classList.add('closing');
  setTimeout(() => s.wrap.remove(), 320);
  if (!stack.length) document.body.classList.remove('has-sheet');
  s.onClose?.();
}
export const closeAllSheets = () => { while (stack.length) closeSheet(); };
export const topSheet = () => stack[stack.length - 1];

function enableDrag(s) {
  const sheet = s.wrap.querySelector('.sheet');
  let y0 = null, dy = 0;
  sheet.querySelectorAll('.sheet-grab, .sheet-head').forEach(h => {
    h.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; }, { passive: true });
    h.addEventListener('touchmove', e => {
      if (y0 === null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    h.addEventListener('touchend', () => {
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (dy > 90) closeSheet(s);
      y0 = null;
    });
  });
}

// ---------- Тосты ----------
let toastTimer;
export function toast(msg, { undo, action } = {}) {
  const root = document.getElementById('toast-root');
  root.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'toast';
  const btn = undo ? { label: 'Отменить', fn: undo } : action;
  el.innerHTML = `<span>${esc(msg)}</span>${btn ? `<button>${esc(btn.label)}</button>` : ''}`;
  root.appendChild(el);
  if (btn) el.querySelector('button').onclick = () => { el.remove(); btn.fn(); };
  el.getBoundingClientRect();
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, btn ? 5500 : 2600);
}

// Изменить данные + сохранить + перерисовать (+ «Отменить» в тосте)
export function commit(fn, { toast: msg, undo = false } = {}) {
  const snap = undo ? store.snapshot() : null;
  fn(store.state);
  store.save();
  refresh();
  if (msg) {
    toast(msg, undo ? {
      undo: () => { store.restore(snap); refresh(); toast('Действие отменено'); },
    } : {});
  }
}

// ---------- Подтверждение ----------
export function ask({ title, text = '', ok = 'Да', danger = false, cancel = 'Отмена' }) {
  return new Promise(resolve => {
    let done = false;
    openSheet({
      title,
      render: () => `
        ${text ? `<p class="muted">${esc(text)}</p>` : ''}
        <div class="btn-col mt">
          <button class="btn ${danger ? 'danger' : ''}" data-ask="ok">${esc(ok)}</button>
          <button class="btn ghost" data-ask="no">${esc(cancel)}</button>
        </div>`,
      mount: (body, s) => body.querySelectorAll('[data-ask]').forEach(b => {
        b.onclick = () => { done = true; closeSheet(s); resolve(b.dataset.ask === 'ok'); };
      }),
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

// ---------- Делегирование событий ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el.dataset, el, e);
});
document.addEventListener('submit', e => {
  const f = e.target;
  const fn = forms[f.dataset.form];
  if (!fn) return;
  e.preventDefault();
  fn(f, new FormData(f));
});
const onInput = e => {
  const fn = inputs[e.target.dataset?.input];
  if (fn) fn(e.target, e);
};
// радиокнопки/чекбоксы/селекты/даты обрабатываем по change, текстовые поля — по input (без двойного вызова)
const CHANGE_TYPES = ['radio', 'checkbox', 'select-one', 'date', 'time'];
document.addEventListener('input', e => { if (!CHANGE_TYPES.includes(e.target.type)) onInput(e); });
document.addEventListener('change', e => { if (CHANGE_TYPES.includes(e.target.type)) onInput(e); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

actions['close-sheet'] = () => closeSheet();

// Поделиться файлом (iOS: «Сохранить в Файлы», Telegram и т.п.) или скачать
export async function shareFile(file, title) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return true;
}
