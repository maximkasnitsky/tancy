// Даты храним строками 'YYYY-MM-DD' в местном времени — их можно сравнивать как строки.

export const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
export const WD_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
export const WD_ORDER = [1, 2, 3, 4, 5, 6, 0]; // неделя с понедельника
export const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const LESSONS = ['занятие', 'занятия', 'занятий'];
export const PAYMENTS = ['оплата', 'оплаты', 'оплат'];
export const VISITS = ['посещение', 'посещения', 'посещений'];
export const STUDENTS = ['ученица', 'ученицы', 'учениц'];

export const pad = n => String(n).padStart(2, '0');

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const todayISO = () => toISO(new Date());
export function addDaysISO(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export const weekday = iso => parseISO(iso).getDay();
export function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

// Месяцы как 'YYYY-MM'
export const monthOf = iso => iso.slice(0, 7);
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
export function monthTitle(key, forceYear = false) {
  const [y, m] = key.split('-').map(Number);
  const showYear = forceYear || y !== new Date().getFullYear();
  return MONTHS_NOM[m - 1] + (showYear ? ' ' + y : '');
}

export function fmtDate(iso, { wd = false } = {}) {
  if (!iso) return '—';
  const d = parseISO(iso);
  let s = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  if (d.getFullYear() !== new Date().getFullYear()) s += ` ${d.getFullYear()}`;
  return wd ? `${WD_SHORT[d.getDay()]}, ${s}` : s;
}
export function fmtDateLong(iso) {
  const d = parseISO(iso);
  let s = `${WD_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  if (d.getFullYear() !== new Date().getFullYear()) s += ` ${d.getFullYear()}`;
  return s;
}
export function relDay(iso) {
  const t = todayISO();
  if (iso === t) return 'сегодня';
  if (iso === addDaysISO(t, 1)) return 'завтра';
  if (iso === addDaysISO(t, -1)) return 'вчера';
  return null;
}
// «сегодня» / «завтра» / «пт, 6 ноя»
export const whenShort = iso => relDay(iso) || fmtDate(iso, { wd: true });

export function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
export const pl = (n, forms) => `${n} ${plural(n, forms)}`;
export const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
export const money = (n, cur) => nf.format(Number(n) || 0) + (cur ? ' ' + cur : '');
export const num = v => {
  const n = parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}
export const firstName = name => String(name || '').trim().split(/\s+/)[0] || '';

// +7 (999) 123-45-67 / 8 999 ... → 79991234567
export function phoneDigits(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  if (d.length === 10 && d[0] === '9') d = '7' + d;
  return d;
}

export const isStandalone = () =>
  window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
