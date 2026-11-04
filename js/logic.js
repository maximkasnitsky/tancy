// Расчёты: расписание, списание занятий, абонементы и долги.
//
// Правила:
//  • Абонемент = N занятий (по умолчанию 8 — это месяц при Пн/Ср).
//  • Каждое занятие по расписанию списывается, даже если ученица не пришла.
//  • Отменённое тренером занятие не списывается ни у кого → абонемент сдвигается.
//  • «Уважительная» отметка у ученицы или пауза — занятие у неё не списывается.
//  • Оплаты покрывают занятия по порядку (сначала старые долги).
import { state, rev } from './store.js';
import {
  todayISO, addDaysISO, parseISO, fmtDate, whenShort, pl, LESSONS, VISITS, money, daysBetween, MONTHS_GEN,
} from './util.js';

let memoKey = '';
const memoMap = new Map();
function memo(key, fn) {
  const k = rev + '|' + progressKey();
  if (k !== memoKey) { memoMap.clear(); memoKey = k; }
  if (!memoMap.has(key)) memoMap.set(key, fn());
  return memoMap.get(key);
}

export const fmtMoney = n => money(n, '₽');

// ---------- Прошло ли занятие ----------
// Занятие списывается только с момента его начала: в 10 утра вечернее занятие ещё не прошло.
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export function isHeld(l) {
  const t = todayISO();
  if (l.date !== t) return l.date < t;
  return !!l.time && nowHM() >= l.time; // время не указано — считаем прошедшим со следующего дня
}
// Меняется, когда наступает новый день или начинается очередное занятие сегодня
export const progressKey = () => {
  const t = todayISO();
  return t + '|' + state.groups.map(g => lessonOn(g.id, t)).filter(l => l && isHeld(l)).length;
};
export const getGroup = id => state.groups.find(g => g.id === id);
export const getStudent = id => state.students.find(s => s.id === id);
export const getPayment = id => state.payments.find(p => p.id === id);
export const multiGroup = () => state.groups.length > 1;
export const byName = (a, b) => a.name.localeCompare(b.name, 'ru');
export const activeStudents = () => state.students.filter(s => !s.archived);
export const okey = (gid, iso) => gid + '|' + iso;

// ---------- Расписание ----------
export function scheduleOn(g, iso) {
  let cur = null;
  for (const s of g.schedule) { if (s.from <= iso) cur = s; else break; }
  return cur;
}
export const currentSchedule = g => scheduleOn(g, todayISO()) || g.schedule[g.schedule.length - 1];

export function lessonOn(gid, iso) {
  const g = getGroup(gid);
  if (!g) return null;
  const ov = state.overrides[okey(gid, iso)];
  const s = scheduleOn(g, iso);
  const wd = parseISO(iso).getDay();
  if (ov && ov.type === 'extra') {
    return { date: iso, gid, kind: 'extra', cancelled: false, time: ov.time || timeOf(s, wd), note: ov.note || '' };
  }
  if (!s || !s.days.includes(wd)) return null;
  const cancelled = !!ov && ov.type === 'cancel';
  // Перенос только по времени (тот же день): своё время и пометка
  if (ov && ov.type === 'time') {
    return { date: iso, gid, kind: 'regular', cancelled: false, moved: true, origTime: timeOf(s, wd), time: ov.time || timeOf(s, wd), note: ov.note || '' };
  }
  return { date: iso, gid, kind: 'regular', cancelled, time: timeOf(s, wd), note: cancelled ? (ov.note || '') : '' };
}
// Время занятия в этот день недели: своё для дня, иначе общее время группы
export const timeOf = (s, wd) => (s && (s.times?.[wd] || s.time)) || '';
// Сначала раннее занятие (например, дети в 17:00, потом взрослые в 18:30)
export const byTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99');
export const lessonsOnDay = iso => state.groups.map(g => lessonOn(g.id, iso)).filter(Boolean).sort(byTime);

export function groupLessons(gid, from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    const l = lessonOn(gid, d);
    if (l) out.push(l);
  }
  return out;
}

// Ближайшие НЕ отменённые занятия начиная с даты
export function upcomingLessons(from, n = 1) {
  const out = [];
  for (let i = 0, d = from; i < 200 && out.length < n; i++, d = addDaysISO(d, 1)) {
    for (const l of lessonsOnDay(d)) if (!l.cancelled && out.length < n) out.push(l);
  }
  return out;
}

// ---------- Ученицы ----------
export function studentGroupOn(st, iso) {
  let gid = st.groups[0]?.groupId;
  for (const seg of st.groups) { if (seg.from <= iso) gid = seg.groupId; else break; }
  return gid;
}
export const currentGroupId = st => st.groups[st.groups.length - 1]?.groupId;
export const groupOf = st => getGroup(currentGroupId(st)) || state.groups[0];
export const groupColor = st => groupOf(st)?.color || '#a3326a';
export const priceOf = st => (st.price !== null && st.price !== undefined && st.price !== '')
  ? Number(st.price) : Number(groupOf(st)?.price || 0);
export const passSizeOf = st => Number(groupOf(st)?.passSize) || 8;
// Как ученица платит: абонемент (по умолчанию) или разово — за каждое посещение
export const MODES = { pass: 'Абонемент', single: 'Разово' };
export const modeOf = st => (MODES[st.mode] ? st.mode : 'pass');
export const groupSinglePrice = g => (g?.singlePrice ? Number(g.singlePrice) : Math.round(Number(g?.price || 0) / (Number(g?.passSize) || 8)));
export const singlePriceOf = st => {
  if (st.singlePrice !== null && st.singlePrice !== undefined && st.singlePrice !== '') return Number(st.singlePrice);
  return groupSinglePrice(groupOf(st));
};
export const pausedOn = (st, iso) => st.pauses.find(p => p.from <= iso && (!p.to || iso <= p.to));
export const markOf = (gid, iso, sid) => state.attendance[okey(gid, iso)]?.[sid] || null;

export function isActiveOn(st, iso) {
  return st.startDate <= iso && (!st.leftDate || iso <= st.leftDate);
}
export function studentsOn(gid, iso) {
  return state.students.filter(st => isActiveOn(st, iso) && studentGroupOn(st, iso) === gid).sort(byName);
}

// Все занятия ученицы по порядку (с причиной, если не списывается)
export function* studentStream(st, until) {
  const mode = modeOf(st);
  // для разовых будущее не нужно: посещения отмечаются по факту
  const end = until || addDaysISO(todayISO(), mode === 'pass' ? 1100 : 1);
  for (let d = st.startDate; d <= end; d = addDaysISO(d, 1)) {
    if (st.leftDate && d > st.leftDate) return;
    const gid = studentGroupOn(st, d);
    const l = lessonOn(gid, d);
    if (!l) continue;
    const mark = markOf(gid, d, st.id);
    let reason = null;
    if (l.cancelled) reason = 'cancelled';
    else if (pausedOn(st, d)) reason = 'paused';
    else if (mark === 'excused') reason = 'excused';
    // Разовые: считаются только посещения (отметка «была»), пропуски не считаются
    if (!reason && mode === 'single' && mark !== 'present') reason = 'absent';
    yield { ...l, counted: !reason, reason, mark };
  }
}

export function countedLessons(st, n) {
  const out = [];
  if (n <= 0) return out;
  for (const l of studentStream(st)) {
    if (!l.counted) continue;
    out.push(l);
    if (out.length >= n) break;
  }
  return out;
}

export function studentPayments(st) {
  return state.payments
    .filter(p => p.studentId === st.id)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
}

export const PRIORITY = { debt: 0, today: 1, soon: 2, ok: 3, paused: 4, archived: 5 };

export const studentStatus = st => memo('st:' + st.id, () => computeStatus(st));

function computeStatus(st) {
  const today = todayISO();
  const pays = studentPayments(st);
  const credits = pays.reduce((s, p) => s + (Number(p.lessons) || 0), 0);
  const mode = modeOf(st);
  const counted = [];
  let used = 0;
  for (const l of studentStream(st)) {
    if (!l.counted) continue;
    const held = mode === 'single' ? true : isHeld(l); // отмеченное посещение уже состоялось
    if (!held && counted.length >= credits + 1) break;
    counted.push(l);
    if (held) used++;
  }
  const balance = credits - used;
  const debt = Math.max(0, -balance);
  const firstUncovered = counted[credits] || null; // первое неоплаченное занятие
  const lastCovered = credits > 0 ? (counted[Math.min(credits, counted.length) - 1] || null) : null;

  // Какие занятия покрывает каждая оплата
  let idx = 0;
  const coverage = pays.map(p => {
    const n = Number(p.lessons) || 0;
    const c = {
      p, total: n,
      from: n ? counted[idx]?.date || null : null,
      to: n ? counted[idx + n - 1]?.date || null : null,
      used: Math.max(0, Math.min(n, used - idx)),
    };
    idx += n;
    return c;
  });
  let current = null;
  if (balance >= 0) {
    let acc = 0;
    for (const c of coverage) {
      if (c.total && used < acc + c.total) { current = c; break; }
      acc += c.total;
    }
    if (!current) current = [...coverage].reverse().find(c => c.total) || null;
  }

  const single = singlePriceOf(st);
  // для разовых «абонемент» — одно занятие по разовой цене
  const price = mode === 'pass' ? priceOf(st) : single;
  const passSize = mode === 'pass' ? passSizeOf(st) : 1;
  if (mode !== 'pass') current = null;
  const pausedNow = pausedOn(st, today);
  let status, tone, label, sub;

  if (st.archived) {
    status = 'archived'; tone = 'gray'; label = 'Архив';
    sub = st.leftDate ? `ушла ${fmtDate(st.leftDate)}` : 'в архиве';
    if (debt) sub += ` · долг ${pl(debt, LESSONS)}`;
  } else if (mode === 'single') {
    if (debt && firstUncovered.date === todayISO()) {
      status = 'today'; tone = 'orange'; label = 'Оплата сегодня'; sub = 'разовое занятие';
    } else if (debt) {
      status = 'debt'; tone = 'red'; label = `Долг: ${pl(debt, VISITS)}`;
      sub = `${pl(debt, VISITS)} с ${fmtDate(firstUncovered.date)}`;
    } else {
      status = 'ok'; tone = 'gray'; label = 'Разово';
      sub = balance > 0 ? `оплачено наперёд: ${pl(balance, LESSONS)}` : `${fmtMoney(single)} за занятие`;
    }
  } else if (balance < 0) {
    if (firstUncovered.date === today) {
      status = 'today'; tone = 'orange'; label = 'Оплата сегодня';
      sub = credits ? 'абонемент закончился' : 'первое занятие';
    } else {
      status = 'debt'; tone = 'red'; label = `Долг: ${pl(debt, LESSONS)}`;
      sub = `не оплачено с ${fmtDate(firstUncovered.date)}`;
    }
  } else if (pausedNow) {
    status = 'paused'; tone = 'gray'; label = 'Пауза';
    sub = pausedNow.to ? `до ${fmtDate(pausedNow.to)}` : 'без даты окончания';
    if (balance > 0) sub += ` · осталось ${pl(balance, LESSONS)}`;
  } else if (!firstUncovered) {
    status = 'ok'; tone = 'gray'; label = balance ? pl(balance, LESSONS) : 'Нет занятий';
    sub = 'в расписании нет занятий';
  } else if (balance === 0 && firstUncovered.date === today) {
    status = 'today'; tone = 'orange'; label = 'Оплата сегодня';
    sub = `${credits ? 'абонемент закончился' : 'первое занятие'}${firstUncovered.time ? ', в ' + firstUncovered.time : ''}`;
  } else if (balance === 0) {
    status = 'soon'; tone = 'orange'; label = `Оплата ${whenShort(firstUncovered.date)}`;
    sub = credits ? 'оплаченные занятия закончились' : 'ещё не оплачивала';
  } else if (balance <= 2) {
    status = 'soon'; tone = 'amber'; label = `Осталось ${balance}`;
    sub = `следующая оплата ${whenShort(firstUncovered.date)}`;
  } else {
    status = 'ok'; tone = 'green'; label = `Осталось ${balance}`;
    sub = lastCovered ? `оплачено до ${fmtDate(lastCovered.date)}` : 'оплачено';
  }

  return {
    status, tone, label, sub, priority: PRIORITY[status],
    balance, debt, credits, used, firstUncovered, lastCovered, coverage, current,
    payDate: mode === 'pass' ? (firstUncovered?.date || null) : (debt ? firstUncovered.date : null),
    price, passSize, mode, single, group: groupOf(st),
  };
}

// Нужно ли брать оплату на занятии в эту дату
export function needsPayOn(st, iso) {
  if (st.archived) return false;
  const s = studentStatus(st);
  if (s.status === 'paused') return false;
  return !!s.payDate && s.payDate <= iso;
}

export function sortByStatus(list) {
  return list
    .map(st => [st, studentStatus(st)])
    .sort((a, b) => a[1].priority - b[1].priority
      || (a[1].status === 'debt' ? b[1].debt - a[1].debt : 0)
      || (a[1].status === 'soon' ? (a[1].payDate || '').localeCompare(b[1].payDate || '') : 0)
      || byName(a[0], b[0]))
    .map(x => x[0]);
}

// ---------- Деньги ----------
export const METHODS = { cash: 'Наличные', transfer: 'Перевод', card: 'Карта' };

export function monthPayments(key) {
  return state.payments
    .filter(p => p.date.startsWith(key) && !p.carry) // перенесённый остаток — не доход
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
}
export function monthTotals(key) {
  const list = monthPayments(key);
  const t = { total: 0, count: list.length, byMethod: {} };
  for (const p of list) {
    const a = Number(p.amount) || 0;
    t.total += a;
    const m = p.method || 'cash';
    t.byMethod[m] = (t.byMethod[m] || 0) + a;
  }
  return t;
}
// Ожидаемые оплаты до конца текущего месяца (долги + у кого заканчивается абонемент)
export function expectedThisMonth() {
  const today = todayISO();
  const key = today.slice(0, 7);
  let count = 0, sum = 0;
  for (const st of activeStudents()) {
    const s = studentStatus(st);
    if (s.status === 'paused' || !s.payDate) continue;
    if (s.payDate <= today || s.payDate.startsWith(key)) {
      const passes = Math.max(1, Math.ceil(s.debt / s.passSize));
      count++;
      sum += passes * s.price;
    }
  }
  return { count, sum };
}

export const amountDue = s => Math.max(1, Math.ceil(s.debt / s.passSize)) * s.price;

// ---------- Дни рождения ----------
export function nextBirthday(st) {
  if (!st.birthday) return null;
  const today = todayISO();
  const [, m, d] = st.birthday.split('-');
  const y = Number(today.slice(0, 4));
  let date = `${y}-${m}-${d}`;
  if (date < today) date = `${y + 1}-${m}-${d}`;
  return { date, days: daysBetween(today, date) };
}
export function upcomingBirthdays(withinDays = 7) {
  return activeStudents()
    .map(st => ({ st, b: nextBirthday(st) }))
    .filter(x => x.b && x.b.days <= withinDays)
    .sort((a, b) => a.b.days - b.b.days);
}

// ---------- Посещаемость ----------
export function attendanceStats(st) {
  let present = 0, absent = 0, excused = 0;
  for (const l of studentStream(st, todayISO())) {
    if (l.cancelled) continue;
    if (l.mark === 'present') present++;
    else if (l.mark === 'absent') absent++;
    else if (l.mark === 'excused') excused++;
  }
  const marked = present + absent;
  return { present, absent, excused, rate: marked ? Math.round(present / marked * 100) : null };
}

// ---------- Доход по месяцам ----------
export function monthHistory(endKey, n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = addMonthsKey(endKey, -i);
    out.push({ key, total: monthTotals(key).total });
  }
  return out;
}
function addMonthsKey(key, k) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + k, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ---------- Уведомления (собираются автоматически) ----------
// kind: urgent — требует действия сегодня; info — к сведению
export function notifications() {
  const t = todayISO();
  const out = [];
  const students = activeStudents();

  for (const l of lessonsOnDay(t)) {
    const g = getGroup(l.gid);
    if (l.cancelled) {
      out.push({ kind: 'info', icon: 'ban', tone: 'gray', title: 'Сегодня занятие отменено', sub: l.note || g.name, act: 'open-day', date: t });
      continue;
    }
    const sts = studentsOn(l.gid, t).filter(st => studentStatus(st).status !== 'paused');
    const payers = sts.filter(st => needsPayOn(st, t));
    out.push({
      kind: 'info', icon: 'calendar', tone: 'accent',
      title: multiGroup() ? `${g.name}: сегодня${l.time ? ' в ' + l.time : ''}` : `Сегодня занятие${l.time ? ' в ' + l.time : ''}`,
      sub: `${pl(sts.length, ['ученица', 'ученицы', 'учениц'])}${payers.length ? ` · ${pl(payers.length, ['оплата', 'оплаты', 'оплат'])}` : ''}`,
      act: 'open-day', date: t,
    });
  }
  const tomorrow = addDaysISO(t, 1);
  for (const l of lessonsOnDay(tomorrow)) {
    if (l.cancelled) out.push({ kind: 'info', icon: 'ban', tone: 'gray', title: 'Завтра занятие отменено', sub: l.note || getGroup(l.gid).name, act: 'open-day', date: tomorrow });
  }

  for (const st of sortByStatus(students)) {
    const s = studentStatus(st);
    if (s.status === 'today') {
      out.push({ kind: 'urgent', icon: 'wallet', tone: 'orange', title: `Оплата сегодня: ${st.name}`, sub: `${s.sub} · ${fmtMoney(amountDue(s))}`, act: 'open-student', id: st.id });
    } else if (s.status === 'debt') {
      out.push({ kind: 'urgent', icon: 'wallet', tone: 'red', title: `Долг: ${st.name}`, sub: s.mode === 'single' ? s.sub : `${pl(s.debt, LESSONS)} · ${s.sub}`, act: 'open-student', id: st.id });
    } else if (s.status === 'soon' && s.balance === 0) {
      out.push({ kind: 'info', icon: 'wallet', tone: 'amber', title: `Скоро оплата: ${st.name}`, sub: `на занятии ${whenShort(s.payDate)}`, act: 'open-student', id: st.id });
    }
  }

  for (const { st, b } of upcomingBirthdays(7)) {
    const when = b.days === 0 ? 'сегодня' : b.days === 1 ? 'завтра' : `${whenShort(b.date)}`;
    out.push({ kind: b.days === 0 ? 'urgent' : 'info', icon: 'gift', tone: 'gold', title: `День рождения: ${st.name}`, sub: when, act: 'open-student', id: st.id });
  }

  for (const st of students) {
    const p = st.pauses.find(x => x.to && x.to >= t && x.to <= addDaysISO(t, 3) && x.from <= t);
    if (p) out.push({ kind: 'info', icon: 'play', tone: 'gray', title: `Пауза заканчивается: ${st.name}`, sub: `последний день ${fmtDate(p.to)}`, act: 'open-student', id: st.id });
  }

  const last = state.settings.lastBackup;
  const since = last || state.settings.createdAt || t; // новичку — через неделю, потом раз в 2 недели
  if (state.students.length && daysBetween(since, t) >= (last ? 14 : 7)) {
    out.push({
      kind: 'info', icon: 'download', tone: 'accent', title: 'Сохраните резервную копию',
      sub: last ? `последняя была ${fmtDate(last)}` : 'копия ещё ни разу не сохранялась', act: 'backup',
    });
  }
  return out;
}
export const urgentCount = () => notifications().filter(n => n.kind === 'urgent').length;
