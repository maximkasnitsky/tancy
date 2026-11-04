// Точка входа: загрузка данных, тема, вкладки, сервис-воркер
import * as store from './store.js';
import { actions, setRenderer, refresh, toast } from './ui.js';
import { ui } from './uistate.js';
import { esc } from './util.js';
import { progressKey } from './logic.js';
import { renderHome } from './views/home.js';
import { renderStudents } from './views/students.js';
import { renderCalendar } from './views/calendar.js';
import { renderPayments } from './views/payments.js';
import { renderSettings, openSetup } from './views/settings.js';
import './views/payment.js';
import './views/notifications.js';

const VIEWS = {
  home: renderHome,
  students: renderStudents,
  calendar: renderCalendar,
  payments: renderPayments,
  settings: renderSettings,
};

const topbar = document.getElementById('topbar');
const view = document.getElementById('view');
const tabs = document.querySelectorAll('#tabbar button');
const themeMeta = document.querySelector('meta[name="theme-color"]');

export function applyLook() {
  const { theme, accent } = store.state.settings;
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme; else delete root.dataset.theme;
  root.dataset.accent = accent || 'garnet';
  const band1 = getComputedStyle(root).getPropertyValue('--band1').trim();
  if (band1 && themeMeta) themeMeta.content = band1;
}

function render() {
  applyLook();
  const v = (VIEWS[ui.tab] || renderHome)();
  topbar.innerHTML = `<div class="band-inner">
    <div class="tb-row">
      <div class="tb-sub">${esc(v.sub || '')}</div>
      <div class="tb-actions">${v.action || ''}</div>
    </div>
    <h1 class="tb-title">${esc(v.title)}</h1>
    ${v.hero || ''}
  </div>`;
  view.innerHTML = v.html;
  tabs.forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
}

function go(tab) {
  ui.tab = tab;
  render();
  window.scrollTo(0, 0);
}

actions.tab = ({ tab }) => {
  if (ui.tab === tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  go(tab);
};
actions['filter-go'] = ({ f }) => {
  ui.filter = f;
  ui.search = '';
  go('students');
};

// ---------- Старт ----------
store.load();
setRenderer(render);
render();
if (!store.state.settings.onboarded) openSetup();

// Просим систему не удалять данные приложения при нехватке места
navigator.storage?.persist?.().catch(() => {});

// Дата могла смениться, пока приложение было свёрнуто — тогда пересчитываем.
// (Без смены даты не перерисовываем, чтобы не «съесть» нажатие при возврате.)
// Так же пересчитываем, когда начинается занятие — с этого момента оно списывается.
let renderedKey = progressKey();
function refreshIfChanged() {
  if (document.hidden) return;
  const k = progressKey();
  if (k === renderedKey) return;
  renderedKey = k;
  refresh();
}
document.addEventListener('visibilitychange', refreshIfChanged);
setInterval(refreshIfChanged, 30000);

// Тема «Авто» следует за системой
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', applyLook);

// Офлайн-режим и обновления
// (на localhost не включаем, чтобы при разработке сразу видеть правки)
const isDev = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !isDev) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    toast('Приложение обновилось', { action: { label: 'Перезапустить', fn: () => location.reload() } });
  });
}
