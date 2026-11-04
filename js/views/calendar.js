// Календарь занятий: отмены, переносы, доп. занятия, посещаемость
import { state } from '../store.js';
import { actions, forms, inputs, openSheet, closeSheet, commit, refresh, toast } from '../ui.js';
import { ui } from '../uistate.js';
import {
  esc, todayISO, addDaysISO, parseISO, fmtDate, fmtDateLong, whenShort, monthTitle, addMonths,
  daysInMonth, pad, cap, pl, LESSONS, WD_SHORT, WD_ORDER,
} from '../util.js';
import {
  getGroup, lessonOn, lessonsOnDay, groupLessons, studentsOn, studentStatus, multiGroup, okey,
  needsPayOn, scheduleOn, timeOf, modeOf,
} from '../logic.js';
import { avatar, chip, icon, tbBtn, kidTag } from '../components.js';

// ---------- Месяц ----------
export function renderCalendar() {
  const key = ui.calMonth;
  const today = todayISO();
  const first = key + '-01';
  const dim = daysInMonth(key);
  const lead = (parseISO(first).getDay() + 6) % 7;
  const multi = multiGroup();

  let cells = WD_ORDER.map(w => `<div class="wd">${WD_SHORT[w]}</div>`).join('');
  for (let i = 0; i < lead; i++) cells += '<div></div>';
  for (let d = 1; d <= dim; d++) {
    const iso = `${key}-${pad(d)}`;
    const ls = lessonsOnDay(iso);
    const active = ls.filter(l => !l.cancelled);
    const wd = parseISO(iso).getDay();
    let cls = 'day';
    if (active.some(l => l.kind === 'regular')) cls += ' lesson';
    else if (active.length) cls += ' extra';
    else if (ls.length) cls += ' cancelled';
    else if (wd === 0 || wd === 6) cls += ' weekend';
    if (iso === today) cls += ' today';
    const dots = multi && ls.length
      ? `<span class="dots">${ls.map(l => `<i class="${l.cancelled ? 'x' : ''}" style="--c:${getGroup(l.gid).color}"></i>`).join('')}</span>`
      : `<span class="dots">${ls.some(l => l.kind === 'extra') ? '<i style="--c:currentColor"></i>' : ''}</span>`;
    cells += `<button class="${cls}" data-act="open-day" data-date="${iso}"><span class="n">${d}</span>${dots}</button>`;
  }

  // Сводка за месяц
  const last = `${key}-${pad(dim)}`;
  const summary = state.groups.map(g => {
    const ls = groupLessons(g.id, first, last);
    const held = ls.filter(l => !l.cancelled).length;
    const canc = ls.filter(l => l.cancelled).length;
    const extra = ls.filter(l => l.kind === 'extra').length;
    return `<div class="row compact">
      <div class="main">
        <div class="title">${multi ? `<i class="gdot" style="--c:${g.color}"></i>${esc(g.name)}` : 'Занятий в месяце'}</div>
        <div class="sub">${[canc && `отменено ${canc}`, extra && `доп. ${extra}`].filter(Boolean).join(' · ') || 'без изменений'}</div>
      </div>
      <div class="right"><b>${held}</b></div>
    </div>`;
  }).join('');

  const changes = [];
  for (let d = 1; d <= dim; d++) {
    const iso = `${key}-${pad(d)}`;
    for (const l of lessonsOnDay(iso)) if (l.cancelled || l.kind === 'extra' || l.moved) changes.push(l);
  }

  return {
    title: 'Календарь',
    sub: 'Расписание',
    action: tbBtn('cancel-range', icon('ban') + 'Отменить период'),
    html: `
      <div class="cal-nav">
        <button class="icon-btn" data-act="cal-move" data-n="-1" aria-label="Предыдущий месяц">${icon('left')}</button>
        <h2 data-act="cal-today">${monthTitle(key, true)}</h2>
        <button class="icon-btn" data-act="cal-move" data-n="1" aria-label="Следующий месяц">${icon('right')}</button>
      </div>
      <div class="card">
        <div class="cal">${cells}</div>
        <div class="legend">
          <span><i style="background:var(--accent-soft);box-shadow:inset 0 0 0 1px var(--accent)"></i>занятие</span>
          <span><i style="background:var(--red-soft);box-shadow:inset 0 0 0 1px var(--red)"></i>отменено</span>
          <span><i style="background:var(--gold-soft);box-shadow:inset 0 0 0 1px var(--gold)"></i>доп. / перенос</span>
        </div>
      </div>
      <p class="hint" style="margin:0 20px">Нажмите на день, чтобы отметить посещение, отменить или перенести занятие.</p>
      <div class="section-title">Итого за ${monthTitle(key).toLowerCase()}</div>
      <div class="list">${summary}</div>
      ${changes.length ? `<div class="section-title">Изменения</div>
        <div class="list">${changes.map(l => `
          <div class="row compact tap" data-act="open-day" data-date="${l.date}">
            <div class="main">
              <div class="title">${cap(fmtDate(l.date, { wd: true }))}${multi ? ' · ' + esc(getGroup(l.gid).name) : ''}</div>
              ${l.note ? `<div class="sub">${esc(l.note)}</div>` : ''}
            </div>
            <div class="right">${l.cancelled ? chip('Отменено', 'red') : l.moved ? chip('Время ' + l.time, 'accent') : chip('Доп. занятие', 'gold')}</div>
          </div>`).join('')}</div>` : ''}`,
  };
}

actions['cal-move'] = ({ n }) => { ui.calMonth = addMonths(ui.calMonth, Number(n)); refresh(); };
actions['cal-today'] = () => { ui.calMonth = todayISO().slice(0, 7); refresh(); };

// ---------- День ----------
export function openDay(iso) {
  openSheet({
    title: () => cap(fmtDateLong(iso)),
    dynamic: true,
    tall: true,
    render: () => groupsForDay(iso).map(g => groupDayHTML(g, iso)).join(''),
  });
}
// Сначала группы с занятием, по времени (дети 17:00 → взрослые 18:30), потом остальные
function groupsForDay(iso) {
  const time = g => lessonOn(g.id, iso)?.time || '99:99';
  const none = g => (lessonOn(g.id, iso) ? 0 : 1);
  return [...state.groups].sort((a, b) => none(a) - none(b) || time(a).localeCompare(time(b)));
}
actions['open-day'] = ({ date }) => openDay(date);

function groupDayHTML(g, iso) {
  const l = lessonOn(g.id, iso);
  const multi = multiGroup();
  const head = multi ? `<div class="section-title"><span><i class="gdot" style="--c:${g.color}"></i>${esc(g.name)}</span></div>` : '';
  const sched = scheduleOn(g, iso);

  if (!l && multi) {
    return `<div class="card" style="display:flex;align-items:center;gap:12px;padding:12px 14px;margin-top:18px">
      <i class="gdot" style="--c:${g.color}"></i>
      <div style="flex:1;min-width:0"><b>${esc(g.name)}</b><div class="muted" style="font-size:13.5px">в этот день занятия нет</div></div>
      <button class="btn secondary xs" data-act="add-extra" data-gid="${g.id}" data-date="${iso}">+ Занятие</button>
    </div>`;
  }
  if (!l) {
    return `${head}<div class="card">
      <div class="muted">В этот день занятия нет по расписанию.</div>
      <button class="btn secondary sm mt" data-act="add-extra" data-gid="${g.id}" data-date="${iso}">${icon('plus')} Добавить занятие</button>
      <p class="hint">Например, перенос или дополнительное занятие. Оно будет списываться как обычное.</p>
    </div>`;
  }
  if (l.cancelled) {
    return `${head}<div class="lesson-head cancelled">
      <div class="when">Занятие отменено</div>
      <div class="meta">${l.note ? esc(l.note) + ' · ' : ''}${l.time || sched?.time || ''}</div>
      <p class="hint">Ни у кого не списывается — все абонементы продлены на одно занятие.</p>
      <button class="btn secondary sm mt" data-act="restore-lesson" data-gid="${g.id}" data-date="${iso}">Вернуть занятие</button>
    </div>`;
  }

  const students = studentsOn(g.id, iso);
  const marks = state.attendance[okey(g.id, iso)] || {};
  const cnt = { present: 0, absent: 0, excused: 0 };
  students.forEach(st => { if (marks[st.id]) cnt[marks[st.id]]++; });
  const isPastOrToday = iso <= todayISO();
  const seg = (st, v, t) =>
    `<button class="${marks[st.id] === v ? 'on' : ''} v-${v}" data-act="mark" data-gid="${g.id}" data-date="${iso}" data-sid="${st.id}" data-v="${v}">${t}</button>`;

  const rows = students.map(st => {
    const s = studentStatus(st);
    const pay = needsPayOn(st, iso)
      ? `<button class="btn xs danger" data-act="pay" data-id="${st.id}">₽</button>` : '';
    const paused = s.status === 'paused';
    const warn = !paused && needsPayOn(st, iso);
    return `<div class="att-row">
      ${avatar(st, 'sm')}
      <div class="main" data-act="open-student" data-id="${st.id}">
        <div class="title">${esc(st.name)}${kidTag(st)}</div>
        <div class="sub ${warn ? 'warn' : ''}">${paused ? 'на паузе' : warn ? 'нужна оплата' : esc(s.label)}</div>
      </div>
      ${pay}
      <div class="seg">${seg(st, 'present', '✓')}${seg(st, 'absent', '✗')}${seg(st, 'excused', 'Уваж.')}</div>
    </div>`;
  }).join('');

  return `${head}
    <div class="lesson-head">
      <div class="when">${l.kind === 'extra' ? 'Доп. занятие' : 'Занятие'}${l.time ? ' · ' + esc(l.time) : ''}</div>
      <div class="meta">${l.note ? esc(l.note) + ' · ' : ''}${pl(students.length, ['ученица', 'ученицы', 'учениц'])}</div>
      <div class="btn-row mt">
        <button class="btn secondary sm" data-act="cancel-lesson" data-mode="time" data-gid="${g.id}" data-date="${iso}">Перенести</button>
        <button class="btn danger sm" data-act="cancel-lesson" data-gid="${g.id}" data-date="${iso}">${l.kind === 'extra' ? 'Удалить' : 'Отменить'}</button>
        ${l.moved ? `<button class="btn ghost sm" data-act="restore-lesson" data-gid="${g.id}" data-date="${iso}">Вернуть ${esc(l.origTime)}</button>` : ''}
      </div>
    </div>
    ${students.length ? `
      <div class="section-title"><span>Посещение</span>
        ${isPastOrToday ? `<button class="link" data-act="mark-all" data-gid="${g.id}" data-date="${iso}">Все были</button>` : ''}</div>
      <p class="hint" style="margin:-2px 4px 10px">Отмечать не обязательно — занятие и так спишется у всех. <b>✓</b> была, <b>✗</b> не пришла (всё равно списывается), <b>Уваж.</b> — по уважительной причине, у неё не спишется. У разовых <b>✓</b> — пришла и платит за занятие.</p>
      <div class="counters">${chip('Были: ' + cnt.present, 'green')}${chip('Не пришли: ' + cnt.absent, 'gray')}${chip('Уваж.: ' + cnt.excused, 'gold')}</div>
      <div class="list">${rows}</div>`
    : '<div class="card muted center">В этот день в группе нет учениц</div>'}`;
}

actions.mark = ({ gid, date, sid, v }) => {
  commit(s => {
    const k = okey(gid, date);
    const m = s.attendance[k] || (s.attendance[k] = {});
    if (m[sid] === v) delete m[sid]; else m[sid] = v;
    if (!Object.keys(m).length) delete s.attendance[k];
  });
};
actions['mark-all'] = ({ gid, date }) => {
  commit(s => {
    const k = okey(gid, date);
    const m = s.attendance[k] || (s.attendance[k] = {});
    // разовых не трогаем: «была» для них означает оплату за занятие
    studentsOn(gid, date).forEach(st => { if (!m[st.id] && modeOf(st) !== 'single') m[st.id] = 'present'; });
  });
};

// ---------- Отмена / перенос ----------
const REASONS = ['Болезнь', 'Праздник', 'Отпуск', 'Мероприятие', 'Зал занят'];

// Одно окно для отмены и переноса: «Отменить» / «Другое время» / «Другой день»
function openMove(gid, date, mode = 'cancel') {
  const g = getGroup(gid);
  const l = lessonOn(gid, date);
  const time = l?.time || '';
  const extra = l?.kind === 'extra';
  const pill = (v, t) => `<label><input type="radio" name="what" value="${v}" data-input="move-what" ${mode === v ? 'checked' : ''}><span>${t}</span></label>`;
  const show = v => (mode === v ? '' : 'hidden');
  openSheet({
    title: 'Перенести или отменить',
    render: () => `
      <form data-form="move" data-gid="${gid}" data-date="${date}">
        <p class="muted" style="margin:0 4px 14px">${cap(fmtDateLong(date))}${time ? ', ' + esc(time) : ''}${multiGroup() ? ' · ' + esc(g.name) : ''}</p>
        <div class="field"><span>Что сделать</span>
          <div class="pills">${pill('cancel', 'Отменить')}${pill('time', 'Другое время')}${pill('day', 'Другой день')}</div></div>

        <div data-what="cancel" ${show('cancel')}>
          <p class="hint" style="margin:-6px 4px 14px">${extra ? 'Доп. занятие будет удалено.' : 'Занятие не спишется ни у кого — все абонементы продлятся сами.'}</p>
          <div class="field"><span>Причина</span>
            <div class="pills">${REASONS.map(r => `<label><input type="radio" name="reason" value="${r}"><span>${r}</span></label>`).join('')}</div></div>
          <label class="field"><span>Комментарий</span><input name="note" id="mv-note" placeholder="Необязательно"></label>
          <button class="btn danger">Отменить занятие</button>
        </div>

        <div data-what="time" ${show('time')}>
          <label class="field"><span>Новое время в этот же день</span>
            <input type="time" name="newTime" id="mv-time" value="${esc(time)}"></label>
          <p class="hint" style="margin:-8px 4px 16px">Списывается как обычно — поменяется только время.</p>
          <button class="btn">Перенести время</button>
        </div>

        <div data-what="day" ${show('day')}>
          <div class="grid2">
            <label class="field"><span>Новый день</span><input type="date" name="moveTo" id="mv-date" min="${addDaysISO(date, -30)}"></label>
            <label class="field"><span>Время</span><input type="time" name="moveTime" id="mv-day-time" value="${esc(time)}"></label>
          </div>
          <p class="hint" style="margin:-8px 4px 16px">В старый день занятия не будет, в новый появится — списывается как обычно.</p>
          <button class="btn">Перенести на этот день</button>
        </div>
      </form>`,
  });
}
inputs['move-what'] = el => {
  el.form.querySelectorAll('[data-what]').forEach(b => { b.hidden = b.dataset.what !== el.value; });
};
actions['cancel-lesson'] = ({ gid, date, mode }) => openMove(gid, date, mode || 'cancel');

forms.move = (f, fd) => {
  const { gid, date } = f.dataset;
  const what = fd.get('what') || 'cancel';
  const l = lessonOn(gid, date);
  const extra = l?.kind === 'extra';
  const base = l?.moved ? l.origTime : (l?.time || '');
  const key = okey(gid, date);

  if (what === 'cancel') {
    const note = [fd.get('reason'), String(fd.get('note') || '').trim()].filter(Boolean).join(' — ');
    commit(s => {
      if (extra) delete s.overrides[key];
      else s.overrides[key] = { type: 'cancel', note };
    }, { toast: extra ? 'Доп. занятие удалено' : 'Занятие отменено — абонементы продлены', undo: true });
    closeSheet();
    return;
  }

  if (what === 'time') {
    const t = fd.get('newTime');
    if (!t) { toast('Укажите новое время'); return; }
    commit(s => {
      if (extra) s.overrides[key] = { ...s.overrides[key], time: t };
      else if (t === base) delete s.overrides[key];
      else s.overrides[key] = { type: 'time', time: t, note: `время перенесено с ${base}` };
    }, { toast: `Время перенесено на ${t}`, undo: true });
    closeSheet();
    return;
  }

  // другой день
  const to = fd.get('moveTo');
  const t = fd.get('moveTime') || base;
  if (!to) { toast('Выберите новый день'); return; }
  if (to === date) { toast('Это тот же день — выберите «Другое время»'); return; }
  const ex = lessonOn(gid, to);
  if (ex && !ex.cancelled) { toast('В этот день уже есть занятие — выберите другую дату'); return; }
  commit(s => {
    if (extra) delete s.overrides[key];
    else s.overrides[key] = { type: 'cancel', note: `перенесено на ${fmtDate(to)}${t ? ', ' + t : ''}` };
    s.overrides[okey(gid, to)] = { type: 'extra', time: t, note: `перенос с ${fmtDate(date)}` };
  }, { toast: `Занятие перенесено на ${fmtDate(to)}${t ? ', ' + t : ''}`, undo: true });
  closeSheet();
};
actions['restore-lesson'] = ({ gid, date }) => {
  commit(s => { delete s.overrides[okey(gid, date)]; }, { toast: 'Занятие возвращено', undo: true });
};
actions['remove-extra'] = ({ gid, date }) => {
  commit(s => { delete s.overrides[okey(gid, date)]; }, { toast: 'Доп. занятие удалено', undo: true });
};

// ---------- Доп. занятие ----------
actions['add-extra'] = ({ gid, date }) => {
  const g = getGroup(gid);
  const time = timeOf(scheduleOn(g, date), parseISO(date).getDay()) || '19:00';
  openSheet({
    title: 'Доп. занятие',
    render: () => `
      <form data-form="extra" data-gid="${gid}" data-date="${date}">
        <p class="muted">${cap(fmtDateLong(date))}${multiGroup() ? ' · ' + esc(g.name) : ''}. Будет списываться у всех учениц группы, как обычное занятие.</p>
        <label class="field"><span>Время</span><input type="time" name="time" value="${esc(time)}"></label>
        <label class="field"><span>Комментарий</span><input name="note" placeholder="Например: перенос, отработка"></label>
        <button class="btn">Добавить занятие</button>
      </form>`,
  });
};
forms.extra = (f, fd) => {
  const { gid, date } = f.dataset;
  commit(s => {
    s.overrides[okey(gid, date)] = { type: 'extra', time: fd.get('time') || '', note: String(fd.get('note') || '').trim() };
  }, { toast: 'Занятие добавлено', undo: true });
  closeSheet();
};

// ---------- Отмена периода (отпуск, праздники) ----------
actions['cancel-range'] = () => {
  const t = todayISO();
  openSheet({
    title: 'Отменить период',
    render: () => `
      <form data-form="cancel-range">
        <p class="muted">Отпуск, праздники, болезнь — все занятия в эти дни отменятся и ни у кого не спишутся.</p>
        <div class="grid2">
          <label class="field"><span>С</span><input type="date" name="from" value="${t}" required data-input="range-preview"></label>
          <label class="field"><span>По (включительно)</span><input type="date" name="to" value="${addDaysISO(t, 7)}" required data-input="range-preview"></label>
        </div>
        ${multiGroup() ? `<label class="field"><span>Группа</span><select name="gid" data-input="range-preview">
          <option value="">Все группы</option>${state.groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label>` : ''}
        <div class="field"><span>Причина</span>
          <div class="pills">${['Отпуск', 'Праздники', 'Болезнь'].map(r => `<label><input type="radio" name="reason" value="${r}"><span>${r}</span></label>`).join('')}</div></div>
        <div class="note-box" id="range-preview">${rangePreview(t, addDaysISO(t, 7), '')}</div>
        <button class="btn danger">Отменить занятия</button>
      </form>`,
  });
};
function rangeLessons(from, to, gid) {
  if (!from || !to || to < from) return [];
  const groups = gid ? [getGroup(gid)] : state.groups;
  return groups.flatMap(g => groupLessons(g.id, from, to).filter(l => !l.cancelled && l.kind === 'regular'));
}
function rangePreview(from, to, gid) {
  if (!from || !to || to < from) return 'Проверьте даты';
  const n = rangeLessons(from, to, gid).length;
  return n ? `Будет отменено: <b>${pl(n, LESSONS)}</b>` : 'В этот период занятий нет';
}
inputs['range-preview'] = el => {
  const f = el.form;
  document.getElementById('range-preview').innerHTML = rangePreview(f.from.value, f.to.value, f.gid?.value || '');
};
forms['cancel-range'] = (f, fd) => {
  const ls = rangeLessons(fd.get('from'), fd.get('to'), fd.get('gid') || '');
  if (!ls.length) { closeSheet(); return; }
  const note = fd.get('reason') || 'Отмена';
  commit(s => { ls.forEach(l => { s.overrides[okey(l.gid, l.date)] = { type: 'cancel', note }; }); },
    { toast: `Отменено ${pl(ls.length, LESSONS)}`, undo: true });
  closeSheet();
};
