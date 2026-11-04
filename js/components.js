// Повторяющиеся куски разметки
import { esc, initials } from './util.js';
import { studentStatus, groupOf, multiGroup } from './logic.js';

const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
  msg: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1.1-4.6A8 8 0 1121 12z"/>',
  send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4 18-7z"/>',
  bell: '<path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 004 0"/>',
  share: '<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  wallet: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><path d="M12 9.5v5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h8"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  gift: '<rect x="3.5" y="9" width="17" height="11.5" rx="2"/><path d="M3.5 13h17M12 9v11.5"/><path d="M12 9c-1.5-4-6-4-5.5-1.2C7 10 12 9 12 9zm0 0c1.5-4 6-4 5.5-1.2C17 10 12 9 12 9z"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  users: '<circle cx="9" cy="8" r="3.6"/><path d="M2.5 20.5c.4-3.6 3-5.6 6.5-5.6s6.1 2 6.5 5.6"/><path d="M15.5 4.6a3.6 3.6 0 0 1 0 6.8"/><path d="M18 15.2c2 .7 3.2 2.5 3.5 5.3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

export const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

export const chip = (label, tone = 'gray') => `<span class="chip tone-${tone}">${esc(label)}</span>`;

// У каждой ученицы свой узнаваемый градиент — по имени
const AVATAR = [
  ['#d0477f', '#7a1846'], ['#e08a3c', '#9a4410'], ['#3fa7b0', '#0f5960'], ['#7b6ae0', '#3a2b8f'],
  ['#45b07f', '#1a6544'], ['#d9604a', '#8a2b1c'], ['#c99a2e', '#7a5508'], ['#b25bc9', '#5d2273'],
];
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
export function avatar(st, size = '') {
  const [c1, c2] = AVATAR[hash(st.name) % AVATAR.length];
  return `<div class="avatar ${size}" style="--c1:${c1};--c2:${c2}">${esc(initials(st.name))}</div>`;
}

// метки рядом с именем: «ребёнок», «разово»
export const kidTag = st => (st.kid ? '<span class="tag">ребёнок</span>' : '') + (st.mode === 'single' ? '<span class="tag tag-single">разово</span>' : '');

export function studentRow(st, { sub, right, act = 'open-student' } = {}) {
  const s = studentStatus(st);
  let subText = sub ?? s.sub;
  if (multiGroup() && sub === undefined) subText = `${groupOf(st)?.name || ''} · ${subText}`;
  return `<div class="row tap" data-act="${act}" data-id="${st.id}">
    ${avatar(st)}
    <div class="main">
      <div class="title">${esc(st.name)}</div>
      <div class="sub">${kidTag(st)}${esc(subText)}</div>
    </div>
    <div class="right">${right ?? chip(s.label, s.tone)}</div>
  </div>`;
}

// Монетки абонемента: золотые — осталось, пустые — прошло
export function coins(total, used) {
  const n = Math.min(total, 24);
  return `<div class="coins" aria-label="Прошло ${used} из ${total}">${Array.from({ length: n }, (_, i) =>
    `<i class="coin ${i < used ? 'spent' : ''}"></i>`).join('')}</div>`;
}

export const empty = (title, text = '', btn = '') =>
  `<div class="empty"><div class="art"><i class="coin"></i><i class="coin"></i><i class="coin"></i></div>
    <b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}${btn}</div>`;

export const tbBtn = (act, content, attrs = '') =>
  `<button class="tb-btn" data-act="${act}" ${attrs}>${content}</button>`;

export const actionRow = (act, ic, title, { attrs = '', danger = false, sub = '' } = {}) =>
  `<button class="row tap compact ${danger ? 'danger' : ''}" data-act="${act}" ${attrs}>
    <span class="lead-ic">${icon(ic)}</span>
    <div class="main"><div class="title">${esc(title)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
  </button>`;
