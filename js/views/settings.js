// Настройки: оформление, группы и расписание, уведомления, данные
import {
  state, SCHEDULE_START, GROUP_COLORS, ACCENTS, newGroup, backupFile, parseBackup, replaceState, snapshot, restore, wipe,
} from '../store.js';
import { actions, forms, inputs, openSheet, closeSheet, commit, ask, toast, refresh, shareFile } from '../ui.js';
import {
  esc, todayISO, addDaysISO, fmtDate, cap, pl, num, uid, isStandalone, WD_SHORT, WD_FULL, WD_ORDER, LESSONS, STUDENTS, PAYMENTS,
} from '../util.js';
import { getGroup, scheduleOn, currentSchedule, fmtMoney, multiGroup, okey, lessonOn, timeOf } from '../logic.js';
import { icon, actionRow } from '../components.js';

export const APP_VERSION = '2.6.0';

// «Пн, Ср · 19:00» или, если время разное, «Пн 17:00 · Ср 18:30»
export const scheduleText = s => {
  if (!s || !s.days.length) return 'нет занятий';
  const days = WD_ORDER.filter(d => s.days.includes(d));
  const times = days.map(d => timeOf(s, d));
  if (times.every(t => t === times[0])) {
    return days.map(d => cap(WD_SHORT[d])).join(', ') + (times[0] ? ' · ' + times[0] : '');
  }
  return days.map((d, i) => `${cap(WD_SHORT[d])} ${times[i] || '—'}`).join(' · ');
};

function dayTimesHTML(days, times) {
  const list = WD_ORDER.filter(d => days.includes(d));
  if (!list.length) return '<p class="hint" style="margin:0;padding:12px 14px">Сначала выберите дни выше</p>';
  return list.map(d => `
    <label class="dt-row"><span>${cap(WD_FULL[d])}</span>
      <input type="time" name="time-${d}" id="g-time-${d}" value="${esc(times[d] || '')}"></label>`).join('')
    + (list.length > 1 ? '<button type="button" class="dt-same" data-act="times-same">Поставить всем дням время первого</button>' : '');
}

function scheduleFromForm(fd) {
  const days = fd.getAll('days').map(Number);
  const times = {};
  days.forEach(d => { times[d] = fd.get('time-' + d) || ''; });
  const first = WD_ORDER.find(d => days.includes(d));
  return { days, time: first === undefined ? '' : times[first], times };
}
const sameSchedule = (cur, next) =>
  cur.days.length === next.days.length && next.days.every(d => cur.days.includes(d) && timeOf(cur, d) === next.times[d]);

function readTimes(form) {
  const cur = {};
  form.querySelectorAll('input[name^="time-"]').forEach(i => { cur[i.name.slice(5)] = i.value; });
  return cur;
}
inputs['group-days'] = el => {
  const f = el.form;
  const days = [...f.querySelectorAll('input[name="days"]:checked')].map(i => Number(i.value));
  const cur = readTimes(f);
  const fallback = Object.values(cur).find(Boolean) || '19:00';
  days.forEach(d => { if (!cur[d]) cur[d] = fallback; });
  f.querySelector('.day-times').innerHTML = dayTimesHTML(days, cur);
};
actions['times-same'] = (_, el) => {
  const inputsT = [...el.form.querySelectorAll('input[name^="time-"]')];
  inputsT.forEach(i => { i.value = inputsT[0].value; });
  toast('Время одинаковое для всех дней');
};

export function rulesHTML() {
  const n = state.groups[0]?.passSize || 8;
  return `<ul>
    <li><b>Абонемент</b> — ${pl(n, LESSONS)}, примерно месяц при занятиях 2 раза в неделю. Когда занятия заканчиваются, ученица попадает в «Нужно оплатить».</li>
    <li><b>Пропуск</b> ученицы — занятие всё равно списывается.</li>
    <li><b>Отмена тренером</b> (болезнь, праздник, отпуск) — не списывается ни у кого, все абонементы продлеваются сами.</li>
    <li><b>«Уважительная»</b> отметка или <b>пауза</b> — по вашему решению занятие не спишется только у этой ученицы.</li>
    <li><b>Перенос</b> — отмените занятие и выберите новую дату: там появится доп. занятие.</li>
  </ul>`;
}

export function startHTML() {
  return `<ol>
    <li><b>Добавьте учениц</b> — вкладка «Ученицы» → «Добавить». Если ученица уже ходит, укажите, сколько занятий у неё осталось.</li>
    <li><b>Когда ученица платит</b> — кнопка «₽ Оплата» на главной или «Принять оплату» в её карточке.</li>
    <li><b>Кто должен заплатить</b> — видно на главной: «Нужно оплатить» и «Скоро оплата».</li>
    <li><b>Если отменяете занятие</b> — «Отменить занятие» на главной или нажмите на день в «Календаре».</li>
    <li><b>Ученица заболела или уехала</b> — в её карточке «Поставить на паузу».</li>
  </ol>`;
}

export function renderSettings() {
  const st = state.settings;
  const last = st.lastBackup;
  const hasDemo = state.students.some(x => x.demo);
  return {
    title: 'Настройки',
    sub: 'Оформление, группы, данные',
    html: `
      <div class="section-title">Оформление</div>
      <div class="card">
        <div class="label" style="margin-left:0">Тема</div>
        <div class="seg">${[['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([k, t]) =>
          `<button class="${st.theme === k ? 'on' : ''}" data-act="set-theme" data-v="${k}">${t}</button>`).join('')}</div>
        <div class="label" style="margin:18px 0 10px">Цвет</div>
        <div class="swatches">${ACCENTS.map(a => `
          <button class="${st.accent === a.id ? 'on' : ''}" data-act="set-accent" data-v="${a.id}" aria-label="${a.name}">
            <span style="--s1:${a.s1};--s2:${a.s2}"></span><span class="swatch-name">${a.name}</span></button>`).join('')}</div>
      </div>

      <div class="section-title">Группы и расписание</div>
      <div class="list">
        ${state.groups.map(g => `
          <div class="row tap" data-act="edit-group" data-id="${g.id}">
            <span class="lead-ic" style="background:${g.color};color:#fff">${icon('calendar')}</span>
            <div class="main">
              <div class="title">${esc(g.name)}</div>
              <div class="sub">${esc(scheduleText(currentSchedule(g)))} · ${fmtMoney(g.price)} за ${pl(g.passSize, LESSONS)}</div>
            </div>${icon('chev', 'chev')}
          </div>`).join('')}
        ${actionRow('add-group', 'plus', 'Добавить группу', { sub: 'например, дети и взрослые отдельно' })}
      </div>

      <div class="section-title">Данные</div>
      <div class="list">
        ${actionRow('backup', 'download', 'Сохранить копию', { sub: last ? 'последняя: ' + fmtDate(last) : 'ещё ни разу' })}
        ${actionRow('restore', 'upload', 'Восстановить из копии', { sub: 'выбрать файл копии' })}
        ${actionRow('storage-info', 'shield', 'Где хранятся данные', { sub: 'и когда они могут пропасть' })}
        ${hasDemo ? actionRow('demo-remove', 'sparkle', 'Удалить пример', { sub: 'оставить только ваши данные' })
          : (state.students.length ? '' : actionRow('demo', 'sparkle', 'Посмотреть на примере', { sub: 'загрузить учениц для пробы' }))}
      </div>

      <div class="section-title">Как пользоваться</div>
      <div class="card rules">${startHTML()}</div>

      <div class="section-title">Как считаются оплаты</div>
      <div class="card rules">${rulesHTML()}</div>

      ${isStandalone() ? '' : `<div class="section-title">Установка на iPhone</div>
      <div class="card rules"><ol>
        <li>Откройте сайт в <b>Safari</b>.</li>
        <li>Нажмите <b>Поделиться</b> (квадрат со стрелкой вверх).</li>
        <li>Выберите <b>На экран «Домой»</b> и нажмите <b>Добавить</b>.</li>
      </ol></div>`}

      <div class="section-title">Опасная зона</div>
      <div class="list">${actionRow('reset-all', 'trash', 'Удалить все данные', { danger: true })}</div>
      <p class="footer-note">Танцы · версия ${APP_VERSION} · ${pl(state.students.length, STUDENTS)} · ${pl(state.payments.length, PAYMENTS)}</p>`,
  };
}

actions['set-theme'] = ({ v }) => commit(s => { s.settings.theme = v; });
actions['set-accent'] = ({ v }) => commit(s => { s.settings.accent = v; });

actions['storage-info'] = () => openSheet({
  title: 'Где хранятся данные',
  render: () => `
    <div class="card rules" style="margin-top:0"><p>Все ученицы и оплаты хранятся <b>в самом приложении на этом iPhone</b>. На сервер ничего не отправляется: если кто-то откроет адрес сайта, он увидит пустое приложение.</p></div>
    <div class="section-title">Данные сохраняются</div>
    <div class="card rules"><ul>
      <li>когда закрываете приложение и перезагружаете телефон;</li>
      <li>когда приложение обновляется;</li>
      <li>без интернета.</li>
    </ul></div>
    <div class="section-title">Данные могут пропасть, если</div>
    <div class="card rules"><ul>
      <li>удалить иконку «Танцы» с экрана «Домой»;</li>
      <li>очистить историю и данные сайтов в настройках Safari;</li>
      <li>перейти на новый iPhone и не восстановить копию;</li>
      <li>изменится адрес сайта (например, переименовать репозиторий на GitHub).</li>
    </ul>
    <p class="muted" style="margin-top:10px">Если открыть сайт в Safari, а не с иконки, приложение будет пустым: у Safari своё отдельное хранилище. Данные при этом никуда не делись — они в приложении на экране «Домой».</p></div>
    <div class="section-title">Как подстраховаться</div>
    <div class="card rules"><p>Раз в пару недель сохраняйте копию и отправляйте файл себе в Telegram («Избранное») или в «Файлы» → iCloud Drive. Приложение напомнит, если копия давно не сохранялась.</p>
      <button class="btn" data-act="backup">Сохранить копию сейчас</button></div>`,
});

// ---------- Группа ----------
function groupFormHTML(g, { setup = false } = {}) {
  const s = g ? currentSchedule(g) : { days: [1, 3], time: '19:00' };
  const times = {};
  s.days.forEach(d => { times[d] = timeOf(s, d); });
  const color = g?.color || GROUP_COLORS[state.groups.length % GROUP_COLORS.length];
  return `
    <label class="field"><span>Название группы</span>
      <input name="name" id="g-name" required value="${esc(g?.name || '')}" placeholder="Например, Взрослые или Дети"></label>
    <div class="field"><span>Дни занятий</span><div class="days">${WD_ORDER.map(d =>
      `<label><input type="checkbox" name="days" value="${d}" data-input="group-days" ${s.days.includes(d) ? 'checked' : ''}><span>${cap(WD_SHORT[d])}</span></label>`).join('')}</div></div>
    <div class="field"><span>Время начала</span>
      <div class="day-times">${dayTimesHTML(s.days, times)}</div>
      <p class="hint">У каждого дня может быть своё время.</p></div>
    ${g && !setup ? `<label class="field"><span>Если поменяли дни или время — с какого числа</span>
      <input type="date" name="from" id="g-from" value="${todayISO()}">
      <p class="hint">Прошлые занятия останутся как были. Новое расписание начнёт действовать с этой даты.</p></label>` : ''}
    <div class="grid2">
      <label class="field"><span>Цена абонемента, ₽</span>
        <input name="price" id="g-price" inputmode="decimal" value="${esc(g?.price || '')}" placeholder="4000" required></label>
      <label class="field"><span>Занятий в абонементе</span>
        <input name="passSize" id="g-pass" type="number" inputmode="numeric" min="1" value="${esc(g?.passSize || 8)}"></label>
    </div>
    <label class="field"><span>Цена разового занятия, ₽</span>
      <input name="singlePrice" id="g-single" inputmode="decimal" value="${esc(g?.singlePrice || '')}" placeholder="необязательно">
      <p class="hint">Если не указать — цена абонемента, делённая на число занятий.</p></label>
    ${setup || (!multiGroup() && g) ? '' : `<div class="field"><span>Цвет группы</span><div class="days color-pick">${GROUP_COLORS.map(c =>
      `<label><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div></div>`}`;
}

function groupData(fd) {
  return {
    name: String(fd.get('name') || '').trim() || 'Группа',
    price: num(fd.get('price')),
    passSize: Math.max(1, Math.round(num(fd.get('passSize')))) || 8,
    singlePrice: String(fd.get('singlePrice') || '').trim() ? num(fd.get('singlePrice')) : null,
  };
}

export function openGroupForm(id) {
  const g = id ? getGroup(id) : null;
  const hist = g && g.schedule.length > 1 ? `
    <div class="section-title">История расписания</div>
    <div class="list">${[...g.schedule].reverse().map(x => `
      <div class="row compact"><div class="main"><div class="title">${esc(scheduleText(x))}</div>
      <div class="sub">${x.from === SCHEDULE_START ? 'с самого начала' : 'с ' + fmtDate(x.from)}</div></div></div>`).join('')}</div>` : '';
  openSheet({
    title: g ? g.name : 'Новая группа',
    render: () => `
      <form data-form="group" data-id="${g?.id || ''}" autocomplete="off">
        ${groupFormHTML(g)}
        <button class="btn">${g ? 'Сохранить' : 'Добавить группу'}</button>
        ${g && multiGroup() ? `<button type="button" class="btn danger mt" data-act="delete-group" data-id="${g.id}">Удалить группу</button>` : ''}
      </form>${hist}`,
  });
}
actions['add-group'] = () => openGroupForm();
actions['edit-group'] = ({ id }) => openGroupForm(id);

forms.group = async (f, fd) => {
  const id = f.dataset.id;
  const sch = scheduleFromForm(fd);
  const old = id ? getGroup(id) : null;
  const data = { ...groupData(fd), color: fd.get('color') || old?.color || GROUP_COLORS[state.groups.length % GROUP_COLORS.length] };
  if (!sch.days.length && !(await ask({ title: 'Нет дней занятий', text: 'Не выбран ни один день — занятий в этой группе не будет. Сохранить так?', ok: 'Сохранить' }))) return;
  let createdId = null;
  commit(s => {
    const g = id ? s.groups.find(x => x.id === id) : null;
    if (!g) {
      const ng = newGroup({ ...data, schedule: [{ from: SCHEDULE_START, ...sch }] });
      createdId = ng.id;
      s.groups.push(ng);
      return;
    }
    Object.assign(g, data);
    const eff = fd.get('from') || todayISO();
    const cur = scheduleOn(g, eff);
    if (!cur || !sameSchedule(cur, sch)) {
      g.schedule = g.schedule.filter(x => x.from < eff);
      g.schedule.push({ from: g.schedule.length ? eff : SCHEDULE_START, ...sch });
    }
  }, { toast: id ? 'Группа сохранена' : 'Группа добавлена', undo: true });
  closeSheet();
  document.dispatchEvent(new CustomEvent('groups-changed', { detail: { id: createdId } }));
};

actions['delete-group'] = async ({ id }) => {
  const used = state.students.some(st => st.groups.some(x => x.groupId === id));
  if (used) {
    await ask({ title: 'В группе есть ученицы', text: 'Сначала переведите их в другую группу (в том числе тех, кто в архиве) или удалите.', ok: 'Понятно', cancel: 'Закрыть' });
    return;
  }
  if (!(await ask({ title: 'Удалить группу?', ok: 'Удалить', danger: true }))) return;
  commit(s => {
    s.groups = s.groups.filter(g => g.id !== id);
    for (const k of Object.keys(s.overrides)) if (k.startsWith(id + '|')) delete s.overrides[k];
    for (const k of Object.keys(s.attendance)) if (k.startsWith(id + '|')) delete s.attendance[k];
  }, { toast: 'Группа удалена', undo: true });
  closeSheet();
};

// ---------- Первая настройка ----------
export function openSetup() {
  const g = state.groups[0];
  openSheet({
    title: 'Добро пожаловать',
    onClose: () => { if (!state.settings.onboarded) commit(s => { s.settings.onboarded = true; }); },
    render: () => `
      <form data-form="setup" autocomplete="off">
        <p class="muted" style="margin:0 4px 16px">Настроим за минуту: дни, время и цену абонемента. Всё можно поменять потом в «Настройках».</p>
        ${groupFormHTML(g, { setup: true })}
        <p class="hint" style="margin:-4px 4px 16px">Ведёте несколько групп — например, детей, а сразу после взрослых? Настройте сейчас первую, остальные добавите в «Настройки → Группы». У каждой группы свои дни, время, цена и ученицы.</p>
        <button class="btn">Готово</button>
      </form>`,
  });
}
forms.setup = (f, fd) => {
  commit(s => {
    const g = s.groups[0];
    Object.assign(g, groupData(fd));
    g.schedule = [{ from: SCHEDULE_START, ...scheduleFromForm(fd) }];
    s.settings.onboarded = true;
  }, { toast: 'Готово! Теперь добавьте учениц' });
  closeSheet();
};

// ---------- Резервная копия ----------
actions.backup = async () => {
  const ok = await shareFile(backupFile(), 'Копия данных — Танцы');
  if (ok) commit(s => { s.settings.lastBackup = todayISO(); }, { toast: 'Копия сохранена' });
};
actions.restore = () => document.getElementById('restore-input').click();
document.getElementById('restore-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let next;
  try {
    next = parseBackup(await file.text());
  } catch (err) {
    toast('Не получилось открыть файл: ' + err.message);
    return;
  }
  const ok = await ask({
    title: 'Восстановить из копии?',
    text: `В копии ${pl(next.students.length, STUDENTS)} и ${pl(next.payments.length, PAYMENTS)}. Текущие данные на телефоне заменятся.`,
    ok: 'Восстановить', danger: true,
  });
  if (!ok) return;
  const snap = snapshot();
  next.settings.onboarded = true;
  replaceState(next);
  refresh();
  toast('Данные восстановлены', { undo: () => { restore(snap); refresh(); } });
});

actions['reset-all'] = async () => {
  const ok = await ask({
    title: 'Удалить все данные?',
    text: 'Все ученицы, оплаты и настройки будут удалены с этого телефона. Сначала лучше сохранить копию.',
    ok: 'Удалить всё', danger: true,
  });
  if (!ok) return;
  wipe();
  refresh();
  toast('Все данные удалены');
  openSetup();
};

// ---------- Пример ----------
actions.demo = () => {
  commit(s => {
    const g = s.groups[0];
    if (!g.price) g.price = 4000;
    const t = todayISO();
    const add = (name, startBack, pays, extra = {}) => {
      const id = uid();
      s.students.push({
        id, name, phone: '', note: '', price: null, startDate: addDaysISO(t, -startBack), birthday: null,
        groups: [{ from: SCHEDULE_START, groupId: g.id }], pauses: [], archived: false, leftDate: null,
        createdAt: Date.now(), demo: true, ...extra,
      });
      pays.forEach(back => s.payments.push({
        id: uid(), studentId: id, date: addDaysISO(t, -back), amount: g.price, lessons: g.passSize,
        method: back % 2 ? 'transfer' : 'cash', note: '', createdAt: Date.now(),
      }));
    };
    add('Анна Смирнова', 30, [30, 2], { birthday: '1994-' + addDaysISO(t, 2).slice(5) });
    add('Мария Кузнецова', 27, [27]);
    add('Ольга Попова', 45, [45]);
    add('Екатерина Васильева', 6, [6]);
    add('Наталья Соколова', 20, [20]);
    add('Светлана Волкова', 0, []);
    add('Ирина Морозова', 14, [14], { pauses: [{ id: uid(), from: addDaysISO(t, -3), to: addDaysISO(t, 10), note: 'Отпуск' }] });
    for (let i = 8; i < 20; i++) {
      const d = addDaysISO(t, -i);
      const l = lessonOn(g.id, d);
      if (l && !l.cancelled) { s.overrides[okey(g.id, d)] = { type: 'cancel', note: 'Болезнь', demo: true }; break; }
    }
  }, { toast: 'Пример загружен' });
};
actions['demo-remove'] = async () => {
  if (!(await ask({ title: 'Удалить пример?', text: 'Удалятся ученицы из примера и их оплаты. Ваши данные останутся.', ok: 'Удалить пример', danger: true }))) return;
  commit(s => {
    const ids = new Set(s.students.filter(x => x.demo).map(x => x.id));
    s.students = s.students.filter(x => !x.demo);
    s.payments = s.payments.filter(p => !ids.has(p.studentId));
    for (const [k, v] of Object.entries(s.overrides)) if (v.demo) delete s.overrides[k];
    Object.values(s.attendance).forEach(m => ids.forEach(id => delete m[id]));
  }, { toast: 'Пример удалён', undo: true });
};
