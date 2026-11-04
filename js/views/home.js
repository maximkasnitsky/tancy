// Главная: занятие дня в шапке, кто платит, деньги за месяц, дни рождения
import { state } from '../store.js';
import {
  esc, todayISO, addDaysISO, fmtDate, fmtDateLong, whenShort, cap, pl, monthTitle,
  isStandalone, isIOS, PAYMENTS, STUDENTS, WD_FULL, parseISO,
} from '../util.js';
import {
  activeStudents, studentStatus, sortByStatus, lessonsOnDay, upcomingLessons, studentsOn, needsPayOn,
  getGroup, multiGroup, monthTotals, expectedThisMonth, fmtMoney, urgentCount, upcomingBirthdays, amountDue,
} from '../logic.js';
import { studentRow, icon, empty, tbBtn, chip } from '../components.js';
import { rulesHTML, startHTML } from './settings.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function lessonHero(l, isToday, compact = false) {
  const g = getGroup(l.gid);
  const d = parseISO(l.date);
  // Несколько групп: в подписи сразу видно, чьё это занятие («Сегодня · Дети»)
  const eyebrow = multiGroup()
    ? `${isToday ? 'Сегодня' : cap(whenShort(l.date))} · ${esc(g.name)}`
    : (isToday ? `Сегодня · ${WD_FULL[d.getDay()]}` : `Ближайшее · ${cap(whenShort(l.date))}`);
  const group = '';
  const cls = compact ? ' compact' : '';
  if (l.cancelled) {
    return `<div class="hero-card cancelled${cls}">
      <div class="hero-eyebrow">${eyebrow}</div>
      <div class="hero-time">${esc(l.time || 'Занятие')}</div>
      <div class="hero-meta">${group}Отменено${l.note ? ': ' + esc(l.note) : ''} — ни у кого не списывается</div>
      <div class="btn-row"><button class="btn glass sm" data-act="open-day" data-date="${l.date}">Открыть день</button></div>
    </div>`;
  }
  const sts = studentsOn(l.gid, l.date).filter(st => studentStatus(st).status !== 'paused');
  const payers = sts.filter(st => needsPayOn(st, l.date));
  const payText = payers.length
    ? `оплата: <b>${payers.slice(0, 3).map(st => esc(st.name.split(' ')[0])).join(', ')}${payers.length > 3 ? ` и ещё ${payers.length - 3}` : ''}</b>`
    : (sts.length ? 'оплат не ожидается' : '');
  return `<div class="hero-card${cls}">
    <div class="hero-eyebrow">${eyebrow}${l.kind === 'extra' ? ' · перенос' : ''}${l.moved ? ' · новое время' : ''}</div>
    <div class="hero-time">${esc(l.time || 'Занятие')}</div>
    <div class="hero-meta">${group}${sts.length ? pl(sts.length, STUDENTS) : 'учениц пока нет'}${payText ? ' · ' + payText : ''}</div>
    ${state.students.length ? `<div class="btn-row">
      <button class="btn white sm" data-act="open-day" data-date="${l.date}">${isToday ? 'Посещение' : 'Открыть день'}</button>
      <button class="btn glass sm" style="flex:0 0 auto" data-act="cancel-lesson" data-gid="${l.gid}" data-date="${l.date}">Перенос / отмена</button>
    </div>` : ''}
  </div>`;
}

function heroHTML() {
  const t = todayISO();
  const todays = lessonsOnDay(t);
  if (todays.length) return todays.map(l => lessonHero(l, true, todays.length > 1)).join('');
  const next = upcomingLessons(addDaysISO(t, 1), 1)[0];
  if (!next) {
    return `<div class="hero-card"><div class="hero-eyebrow">Расписание</div>
      <div class="hero-meta" style="margin-top:6px">Ближайших занятий нет. Проверьте дни занятий в настройках группы.</div>
      <div class="btn-row"><button class="btn white sm" data-act="tab" data-tab="settings">Открыть настройки</button></div></div>`;
  }
  const nextDay = lessonsOnDay(next.date).filter(l => !l.cancelled);
  return nextDay.map(l => lessonHero(l, false, nextDay.length > 1)).join('');
}

function banners() {
  let out = '';
  if (isIOS() && !isStandalone()) {
    out += `<div class="banner"><span class="lead-ic">${icon('share')}</span><div class="grow">
      <b>Установите на экран «Домой»</b> — Поделиться → На экран «Домой». Вносите учениц уже в установленном приложении: у Safari своё отдельное хранилище.</div></div>`;
  }
  const noPrice = state.groups.find(g => !Number(g.price) && !Number(g.singlePrice));
  if (noPrice) {
    out += `<div class="banner"><span class="lead-ic">${icon('wallet')}</span><div class="grow">Укажите цены абонемента и разового занятия${multiGroup() ? ` для группы «${esc(noPrice.name)}»` : ''} — тогда приложение будет считать суммы.</div>
      <button class="btn secondary xs" data-act="edit-group" data-id="${noPrice.id}">Указать</button></div>`;
  }
  if (state.students.some(st => st.demo)) {
    out += `<div class="banner"><span class="lead-ic">${icon('sparkle')}</span><div class="grow">Сейчас загружен пример. Посмотрите, как всё работает, потом удалите его.</div>
      <button class="btn secondary xs" data-act="demo-remove">Удалить</button></div>`;
  }
  return out;
}

export function renderHome() {
  const t = todayISO();
  const students = activeStudents();
  const n = urgentCount();
  const action = `<button class="tb-btn icon" data-act="open-notifs" aria-label="Уведомления">${icon('bell')}${n ? `<span class="tb-badge">${n}</span>` : ''}</button>`
    + (students.length ? tbBtn('quick-pay', '₽ Оплата') : '');
  const base = { title: greeting(), sub: cap(fmtDateLong(t)), action, hero: heroHTML() };

  if (!students.length) {
    return {
      ...base,
      html: banners() + empty('Добавьте первую ученицу',
        'Приложение само посчитает, у кого когда заканчивается абонемент и кто должен оплатить.',
        `<div class="btn-col"><button class="btn" data-act="add-student">${icon('plus')} Добавить ученицу</button>
          <button class="btn ghost" data-act="demo">Посмотреть на примере</button></div>`) +
        `<div class="section-title">С чего начать</div><div class="card rules">${startHTML()}</div>
        <div class="section-title">Как считаются оплаты</div><div class="card rules">${rulesHTML()}</div>`,
    };
  }

  const sorted = sortByStatus(students);
  const due = sorted.filter(st => ['debt', 'today'].includes(studentStatus(st).status));
  const soon = sorted.filter(st => studentStatus(st).status === 'soon');
  const key = t.slice(0, 7);
  const tot = monthTotals(key);
  const exp = expectedThisMonth();
  const bdays = upcomingBirthdays(7);

  const dueRows = due.map(st => {
    const s = studentStatus(st);
    return studentRow(st, {
      sub: s.status === 'today' ? `оплата сегодня · ${fmtMoney(amountDue(s))}` : `${s.label.toLowerCase()} · с ${fmtDate(s.payDate)}`,
      right: `<button class="btn xs" data-act="pay" data-id="${st.id}">Принять</button>`,
    });
  }).join('');

  return {
    ...base,
    html: `
      ${banners()}
      <div class="stats">
        <button class="stat" data-act="tab" data-tab="payments">
          <span class="label">${monthTitle(key)}</span><b>${fmtMoney(tot.total)}</b><span class="foot">получено · ${pl(tot.count, PAYMENTS)}</span></button>
        <button class="stat" data-act="filter-go" data-f="soon">
          <span class="label">Ожидается</span><b>${fmtMoney(exp.sum)}</b><span class="foot">до конца месяца · ${pl(exp.count, PAYMENTS)}</span></button>
      </div>
      ${due.length ? `<div class="section-title"><span>Нужно оплатить</span><span>${due.length}</span></div>
        <div class="list">${dueRows}</div>` : ''}
      ${soon.length ? `<div class="section-title"><span>Скоро оплата</span>
        ${soon.length > 6 ? '<button class="link" data-act="filter-go" data-f="soon">Все</button>' : `<span>${soon.length}</span>`}</div>
        <div class="list">${soon.slice(0, 6).map(st => studentRow(st)).join('')}</div>` : ''}
      ${!due.length && !soon.length ? `<div class="card done-card"><b>Все оплатили</b><span class="muted">Ни у кого нет долгов и ближайших оплат</span></div>` : ''}
      ${bdays.length ? `<div class="section-title">Дни рождения</div>
        <div class="list">${bdays.map(({ st, b }) => studentRow(st, {
          sub: b.days === 0 ? 'сегодня — поздравьте!' : b.days === 1 ? 'завтра' : cap(whenShort(b.date)),
          right: chip(b.days === 0 ? 'Сегодня' : `через ${b.days} дн.`, 'gold'),
        })).join('')}</div>` : ''}`,
  };
}
