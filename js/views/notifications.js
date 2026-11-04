// Уведомления: собираются автоматически из данных, ничего настраивать не нужно
import { state } from '../store.js';
import { actions, openSheet } from '../ui.js';
import { esc } from '../util.js';
import { notifications } from '../logic.js';
import { icon } from '../components.js';

function rowHTML(n) {
  const data = [n.id ? `data-id="${n.id}"` : '', n.date ? `data-date="${n.date}"` : '', n.gid ? `data-gid="${n.gid}"` : ''].join(' ');
  return `<div class="row tap nrow" data-act="${n.act}" ${data}>
    <span class="bubble tone-${n.tone}">${icon(n.icon)}</span>
    <div class="main"><div class="title">${esc(n.title)}</div><div class="sub wrap">${esc(n.sub || '')}</div></div>
    ${icon('chev', 'chev')}
  </div>`;
}

function listHTML() {
  const all = notifications();
  const urgent = all.filter(n => n.kind === 'urgent');
  const info = all.filter(n => n.kind !== 'urgent');
  if (!all.length) {
    return `<div class="card done-card"><b>Всё спокойно</b><span class="muted">Долгов нет, занятий сегодня нет</span></div>`;
  }
  return `
    ${urgent.length ? `<div class="section-title" style="margin-top:4px">Требуют внимания</div><div class="list">${urgent.map(rowHTML).join('')}</div>` : ''}
    ${info.length ? `<div class="section-title" ${urgent.length ? '' : 'style="margin-top:4px"'}>К сведению</div><div class="list">${info.map(rowHTML).join('')}</div>` : ''}
`;
}

actions['open-notifs'] = () => openSheet({ title: 'Уведомления', dynamic: true, tall: true, render: listHTML });
