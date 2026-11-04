// Хранилище: всё лежит в памяти приложения на этом телефоне (localStorage). Никуда не отправляется.
import { uid, todayISO } from './util.js';

const KEY = 'dance-pay:v1';
const LOOK_KEY = 'dance-pay:look'; // тема отдельно — чтобы применить её до загрузки скриптов
export const SCHEDULE_START = '2000-01-01';
export const GROUP_COLORS = ['#a3245a', '#c08a22', '#0b7680', '#5b45b0', '#1b7a55', '#c4502e'];
export const ACCENTS = [
  { id: 'garnet', name: 'Гранат', s1: '#d0477f', s2: '#5e1338' },
  { id: 'indigo', name: 'Индиго', s1: '#6f82e6', s2: '#222d70' },
  { id: 'turquoise', name: 'Бирюза', s1: '#2fb3ba', s2: '#0b4e55' },
  { id: 'emerald', name: 'Изумруд', s1: '#3fb07e', s2: '#12462f' },
  { id: 'saffron', name: 'Шафран', s1: '#e39a3b', s2: '#5b330a' },
];

export let state = null;
export let rev = 0; // меняется при каждом сохранении — для кэша расчётов

export function defaults() {
  return {
    version: 2,
    settings: {
      theme: 'auto',      // auto | light | dark
      accent: 'emerald',
      onboarded: false,
      lastBackup: null,
      createdAt: todayISO(),
    },
    groups: [],
    students: [],
    payments: [],
    overrides: {},   // 'groupId|YYYY-MM-DD' → { type: 'cancel' | 'extra', note, time }
    attendance: {},  // 'groupId|YYYY-MM-DD' → { studentId: 'present' | 'absent' | 'excused' }
  };
}

export function newGroup(p = {}) {
  return {
    id: uid(),
    name: p.name || 'Восточные танцы',
    color: p.color || GROUP_COLORS[0],
    price: p.price ?? 0,
    passSize: p.passSize ?? 8,
    singlePrice: p.singlePrice ?? null,
    schedule: p.schedule || [{ from: SCHEDULE_START, days: [1, 3], time: '19:00' }],
  };
}

function migrate(s) {
  const d = defaults();
  const out = { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
  delete out.settings.currency;  // всегда рубли
  delete out.settings.reminder;  // напоминаний больше нет
  delete out.settings.badge;     // числа на иконке больше нет
  out.version = 2;
  for (const k of ['groups', 'students', 'payments']) if (!Array.isArray(out[k])) out[k] = [];
  for (const k of ['overrides', 'attendance']) if (!out[k] || typeof out[k] !== 'object') out[k] = {};
  out.groups.forEach(g => {
    if (!Array.isArray(g.schedule) || !g.schedule.length) g.schedule = [{ from: SCHEDULE_START, days: [], time: '' }];
    g.schedule.sort((a, b) => a.from.localeCompare(b.from));
    g.passSize = Number(g.passSize) || 8;
  });
  out.students.forEach(st => {
    if (!Array.isArray(st.pauses)) st.pauses = [];
    if (!Array.isArray(st.groups) || !st.groups.length) {
      st.groups = [{ from: SCHEDULE_START, groupId: st.groupId || out.groups[0]?.id }];
    }
    if (!st.startDate) st.startDate = todayISO();
    if (st.parent) { st.kid = true; delete st.parent; }
  });
  if (!out.groups.length) out.groups.push(newGroup());
  return out;
}

function saveLook() {
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify({ theme: state.settings.theme, accent: state.settings.accent }));
  } catch { /* не критично */ }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = migrate(raw ? JSON.parse(raw) : defaults());
  } catch (e) {
    console.error('Не удалось прочитать данные', e);
    state = migrate(defaults());
  }
  rev++;
}

export function save() {
  rev++;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveLook();
  } catch (e) {
    alert('Не удалось сохранить данные: ' + e.message);
  }
}

export const snapshot = () => JSON.stringify(state);
export function restore(json) {
  state = migrate(JSON.parse(json));
  save();
}

// ---------- Резервная копия ----------
export function backupFile() {
  const data = JSON.stringify({ app: 'dance-pay', exportedAt: new Date().toISOString(), state }, null, 1);
  return new File([data], `tancy-kopiya-${todayISO()}.json`, { type: 'application/json' });
}
export function parseBackup(text) {
  const obj = JSON.parse(text);
  const s = obj && obj.state ? obj.state : obj;
  if (!s || !Array.isArray(s.students) || !Array.isArray(s.groups)) {
    throw new Error('Это не файл резервной копии приложения');
  }
  return migrate(s);
}
export function replaceState(s) {
  state = s;
  save();
}
export function wipe() {
  localStorage.removeItem(KEY);
  state = migrate(defaults());
  rev++;
  saveLook();
}
