// Список учениц, карточка ученицы, форма, пауза, архив, напоминание
import { state, SCHEDULE_START } from '../store.js';
import { actions, forms, inputs, openSheet, closeSheet, commit, ask, toast, refresh } from '../ui.js';
import { ui } from '../uistate.js';
import {
  esc, todayISO, addDaysISO, fmtDate, whenShort, pl, cap, num, uid, phoneDigits, LESSONS, STUDENTS, parseISO, MONTHS_GEN,
} from '../util.js';
import {
  getStudent, getGroup, studentStatus, sortByStatus, activeStudents, multiGroup, fmtMoney,
  studentStream, isHeld, lessonOn, modeOf, groupSinglePrice, currentGroupId, pausedOn, METHODS, amountDue, attendanceStats, nextBirthday,
} from '../logic.js';
import { avatar, chip, studentRow, icon, empty, tbBtn, coins, actionRow } from '../components.js';

const FILTERS = [
  ['all', 'Все', s => s.status !== 'archived'],
  ['debt', 'Должны', s => s.status === 'debt' || s.status === 'today'],
  ['soon', 'Скоро оплата', s => s.status === 'soon'],
  ['ok', 'Оплачено', s => s.status === 'ok'],
  ['paused', 'Пауза', s => s.status === 'paused'],
  ['archived', 'Архив', s => s.status === 'archived'],
];

// ---------- Список ----------
export function renderStudents() {
  const all = state.students;
  const action = tbBtn('add-student', icon('plus') + 'Добавить');
  if (!all.length) {
    return {
      title: 'Ученицы', sub: 'Список пока пуст', action,
      html: empty('Пока нет учениц', 'Добавьте учениц — приложение само посчитает, у кого когда оплата.',
        `<button class="btn" data-act="add-student">${icon('plus')} Добавить ученицу</button>`),
    };
  }
  const counts = FILTERS.map(([, , fn]) => all.filter(st => fn(studentStatus(st))).length);
  return {
    title: 'Ученицы',
    sub: pl(activeStudents().length, STUDENTS),
    action,
    html: `
      <div class="search">${icon('search')}
        <input type="search" id="student-search" placeholder="Поиск по имени или телефону" value="${esc(ui.search)}" data-input="student-search" autocomplete="off"></div>
      <div class="filters">${FILTERS.map(([k, t], i) => (counts[i] || k === 'all' || k === ui.filter)
        ? `<button class="${ui.filter === k ? 'on' : ''}" data-act="filter" data-f="${k}">${t}<b>${counts[i]}</b></button>` : '').join('')}</div>
      <div id="students-list">${listHTML()}</div>`,
  };
}

function listHTML() {
  const fn = (FILTERS.find(f => f[0] === ui.filter) || FILTERS[0])[2];
  const q = ui.search.trim().toLowerCase();
  const qd = q.replace(/\D/g, '');
  const list = sortByStatus(state.students.filter(st => fn(studentStatus(st)) &&
    (!q || st.name.toLowerCase().includes(q) || (qd.length >= 3 && phoneDigits(st.phone).includes(qd)))));
  if (!list.length) return '<div class="empty"><p>Никого не найдено</p></div>';
  if (multiGroup() && !q) {
    return state.groups.map(g => {
      const items = list.filter(st => currentGroupId(st) === g.id);
      if (!items.length) return '';
      return `<div class="section-title"><span><i class="gdot" style="--c:${g.color}"></i>${esc(g.name)}</span><span>${items.length}</span></div>
        <div class="list">${items.map(st => studentRow(st, { sub: studentStatus(st).sub })).join('')}</div>`;
    }).join('');
  }
  return `<div class="list" style="margin-top:14px">${list.map(st => studentRow(st)).join('')}</div>`;
}

actions.filter = ({ f }) => { ui.filter = f; refresh(); };
inputs['student-search'] = el => {
  ui.search = el.value;
  document.getElementById('students-list').innerHTML = listHTML();
};

// ---------- Карточка ученицы ----------
export function openStudent(id) {
  openSheet({
    title: '',
    tall: true,
    dynamic: true,
    render: () => {
      const st = getStudent(id);
      return st ? studentHTML(st) : null;
    },
  });
}
actions['open-student'] = ({ id }) => openStudent(id);

function statusCardHTML(st, s) {
  let big = s.label, small = s.sub;
  if (s.mode === 'single' && s.status === 'ok') {
    big = 'Разовые занятия';
    small = `${fmtMoney(s.single)} за занятие${s.balance > 0 ? ` · оплачено наперёд: ${pl(s.balance, LESSONS)}` : ' · всё оплачено'}`;
  } else if ((s.status === 'ok' || s.status === 'soon') && s.balance > 0) {
    big = `Осталось ${pl(s.balance, LESSONS)}`;
    small = [s.lastCovered && `оплачено до ${fmtDate(s.lastCovered.date)}`,
      s.payDate && `следующая оплата ${whenShort(s.payDate)}`].filter(Boolean).join(' · ');
  } else if (['debt', 'today', 'soon'].includes(s.status)) {
    small = `${s.sub} · к оплате ${fmtMoney(amountDue(s))}`;
  }
  let pass = '';
  if (s.current && !st.archived) {
    const c = s.current;
    pass = `${coins(c.total, c.used)}
      <div class="coins-label">Абонемент от ${fmtDate(c.p.date)}: прошло ${c.used} из ${c.total}${c.from ? ` · ${fmtDate(c.from)} — ${fmtDate(c.to || c.from)}` : ''}</div>`;
  }
  return `<div class="status-card tone-${s.tone}">
    <div class="big">${esc(big)}</div>
    <div class="small">${esc(small)}</div>
    ${pass}
    ${st.archived ? '' : `<div class="btn-row"><button class="btn" data-act="pay" data-id="${st.id}">Принять оплату</button></div>`}
  </div>`;
}

function lessonChip(l, paid) {
  const past = isHeld(l) || l.mark === 'present';
  if (l.reason === 'cancelled') return chip('Отмена тренером', 'gray');
  if (l.reason === 'paused') return chip('Пауза', 'gray');
  if (l.reason === 'excused') return chip('Уваж. причина', 'gold');
  if (!paid) return past ? chip('Не оплачено', 'red') : chip('Нужна оплата', 'orange');
  if (!past) return chip('Оплачено', 'accent');
  if (l.mark === 'present') return chip('Была', 'green');
  if (l.mark === 'absent') return chip('Пропуск · списано', 'gray');
  return chip('Списано', 'gray');
}

function lessonLogHTML(st, s) {
  const today = todayISO();
  const all = [];
  let idx = 0;
  for (const l of studentStream(st, addDaysISO(today, 35))) {
    all.push({ l, paid: l.counted ? idx < s.credits : true });
    if (l.counted) idx++;
  }
  // у разовых показываем только посещения (отмеченные «была»)
  const single = s.mode === 'single';
  const list = single ? all.filter(x => x.l.counted) : all;
  const past = list.filter(x => single || isHeld(x.l)).slice(-10);
  const future = single ? [] : list.filter(x => !isHeld(x.l)).slice(0, 4);
  const rows = [...future.reverse(), ...past.reverse()];
  if (!rows.length) return `<div class="card muted center">${s.mode === 'single' ? 'Посещений пока нет. Отметьте «✓» в посещении — оно появится здесь.' : 'Занятий пока не было'}</div>`;
  return `<div class="list">${rows.map(({ l, paid }) => `
    <div class="row compact tap" data-act="open-day" data-date="${l.date}">
      <div class="main">
        <div class="title ${l.reason === 'cancelled' ? 'strike' : ''}">${cap(whenShort(l.date))}${l.kind === 'extra' ? ' · доп.' : ''}</div>
        ${l.note ? `<div class="sub">${esc(l.note)}</div>` : ''}
      </div>
      <div class="right">${lessonChip(l, paid)}</div>
    </div>`).join('')}</div>`;
}

function studentHTML(st) {
  const s = studentStatus(st);
  const g = s.group;
  const d = phoneDigits(st.phone);
  const pays = [...s.coverage].reverse();
  const total = pays.reduce((a, c) => a + (Number(c.p.amount) || 0), 0);
  const today = todayISO();
  const pausedNow = pausedOn(st, today);
  const pauses = st.pauses.filter(p => !p.to || p.to >= addDaysISO(today, -60));
  const att = attendanceStats(st);
  const bd = nextBirthday(st);
  const bdText = st.birthday ? `${parseISO(st.birthday).getDate()} ${MONTHS_GEN[parseISO(st.birthday).getMonth()]}` : '';

  return `
    <div class="profile">${avatar(st, 'big')}
      <div class="name">${esc(st.name)}</div>
      <div class="meta">${[multiGroup() ? g?.name : '', st.phone, bd ? `🎂 ${bdText}` : ''].filter(Boolean).map(esc).join(' · ') || 'телефон не указан'}</div>
    </div>
    ${d ? `<div class="quick">
      <a href="tel:+${d}"><i>${icon('phone')}</i>Звонок</a>
      <a href="https://wa.me/${d}" target="_blank" rel="noopener"><i>${icon('msg')}</i>WhatsApp</a>
      <a href="https://t.me/+${d}" target="_blank" rel="noopener"><i>${icon('send')}</i>Telegram</a>
    </div>` : '<div style="height:14px"></div>'}
    ${statusCardHTML(st, s)}
    <div class="facts">
      <div><b>${fmtDate(st.startDate)}</b><span>ходит с</span></div>
      <div><b>${att.rate === null ? '—' : att.rate + '%'}</b><span>посещаемость</span></div>
      <div><b>${fmtMoney(total)}</b><span>всего оплат</span></div>
    </div>
    ${st.note ? `<div class="section-title">Заметка</div><div class="note-box">${esc(st.note)}</div>` : ''}

    <div class="section-title"><span>Оплаты</span><span>${pays.length || ''}</span></div>
    ${pays.length ? `<div class="list">${pays.map(c => `
      <div class="row tap" data-act="edit-payment" data-id="${c.p.id}">
        <div class="main">
          <div class="title num">${c.p.carry ? 'Остаток абонемента' : fmtMoney(c.p.amount)} · ${pl(c.total, LESSONS)}</div>
          <div class="sub">${c.p.carry ? 'перенесено из тетрадки' : `${fmtDate(c.p.date)} · ${METHODS[c.p.method] || ''}`}${c.from ? ` · ${fmtDate(c.from)} — ${fmtDate(c.to || c.from)}` : ''}${c.p.note && !c.p.carry ? ' · ' + esc(c.p.note) : ''}</div>
        </div>${icon('chev', 'chev')}
      </div>`).join('')}</div>` : '<div class="card muted center">Оплат пока нет</div>'}

    <div class="section-title">${s.mode === 'single' ? 'Посещения' : 'Занятия'}</div>
    ${lessonLogHTML(st, s)}
    <p class="hint">${s.mode === 'single' ? 'Считаются только занятия, где отмечено «✓ была». За каждое — разовая оплата.' : 'Пропуск списывается. Занятие, отменённое тренером, не списывается — абонемент продлевается.'}</p>

    ${pauses.length ? `<div class="section-title">Паузы</div><div class="list">${pauses.map(p => `
      <div class="row compact">
        <div class="main"><div class="title">${fmtDate(p.from)} — ${p.to ? fmtDate(p.to) : 'без даты'}</div>${p.note ? `<div class="sub">${esc(p.note)}</div>` : ''}</div>
        <button class="btn danger xs" data-act="delete-pause" data-id="${st.id}" data-pid="${p.id}">Удалить</button>
      </div>`).join('')}</div>` : ''}

    <div class="section-title">Действия</div>
    <div class="list">
      ${actionRow('edit-student', 'edit', 'Изменить данные', { attrs: `data-id="${st.id}"` })}
      ${st.archived ? '' : (pausedNow || st.pauses.some(p => p.from > today)
        ? actionRow('resume-student', 'play', 'Снять паузу', { attrs: `data-id="${st.id}"` })
        : actionRow('pause-student', 'pause', 'Поставить на паузу', { attrs: `data-id="${st.id}"`, sub: 'болезнь, отпуск — занятия не списываются' }))}
      ${st.archived
        ? actionRow('unarchive-student', 'archive', 'Вернуть из архива', { attrs: `data-id="${st.id}"` })
        : actionRow('archive-student', 'archive', 'Ушла — в архив', { attrs: `data-id="${st.id}"`, sub: 'история оплат сохранится' })}
      ${actionRow('delete-student', 'trash', 'Удалить навсегда', { attrs: `data-id="${st.id}"`, danger: true })}
    </div>`;
}

// ---------- Форма ----------
export function openStudentForm(id) {
  const st = id ? getStudent(id) : null;
  const gid = st ? currentGroupId(st) : state.groups[0].id;
  const g = getGroup(gid) || state.groups[0];
  const pm = st ? modeOf(st) : 'pass';
  openSheet({
    title: st ? 'Изменить данные' : 'Новая ученица',
    render: () => `
      <form data-form="student" data-id="${st?.id || ''}" autocomplete="off">
        <label class="field"><span>Имя и фамилия</span>
          <input name="name" id="st-name" required value="${esc(st?.name || '')}" placeholder="Например, Анна Иванова" autocapitalize="words"></label>
        <label class="field"><span>Телефон</span>
          <input name="phone" id="st-phone" type="tel" value="${esc(st?.phone || '')}" placeholder="+7 900 000-00-00"></label>
        <div class="field"><span>Группа</span>
          <div class="pills group-pick">${groupPickHTML(gid)}</div>
          ${st && st.groups.length ? '<p class="hint">При смене группы новое расписание действует с сегодняшнего дня.</p>' : ''}</div>
        <div class="field"><span>Как оплачивает</span>
          <div class="pills">
            <label><input type="radio" name="payMode" value="pass" data-input="student-pay" ${pm === 'pass' ? 'checked' : ''}><span>Абонемент</span></label>
            <label><input type="radio" name="payMode" value="single" data-input="student-pay" ${pm === 'single' ? 'checked' : ''}><span>Разово — за каждое занятие</span></label>
          </div></div>
        ${st ? `
        <div class="grid2">
          <label class="field"><span>Ходит с</span>
            <input type="date" name="startDate" id="st-start" value="${st.startDate}" required></label>
          <label class="field"><span>День рождения</span>
            <input type="date" name="birthday" id="st-bday" value="${esc(st.birthday || '')}"></label>
        </div>
        <p class="hint" style="margin:-8px 4px 16px">«Ходит с» обычно менять не нужно — с этой даты считаются её занятия.</p>` : `
        <div data-pay="pass" ${pm === 'pass' ? '' : 'hidden'}>
        <div class="field"><span>Она уже ходит к вам?</span>
          <div class="pills">
            <label><input type="radio" name="mode" value="new" data-input="student-mode" checked><span>Новая ученица</span></label>
            <label><input type="radio" name="mode" value="old" data-input="student-mode"><span>Уже ходит</span></label>
          </div></div>
        <div data-mode="new">
          <label class="field"><span>Первое занятие</span>
            <input type="date" name="startDate" id="st-start" value="${todayISO()}"></label>
          <p class="hint" style="margin:-8px 4px 16px">Оплату примете на первом занятии — приложение покажет это на главной.</p>
        </div>
        <div data-mode="old" hidden>
          <label class="field"><span>Сколько занятий осталось в её абонементе?</span>
            <input name="left" id="st-left" type="number" inputmode="numeric" min="0" max="99" value="${g.passSize}"></label>
          <p class="hint" style="margin:-8px 4px 16px">Посмотрите в тетрадке. Сегодняшнее занятие считайте, если оно ещё не прошло. Абонемент уже закончился — поставьте 0.</p>
        </div>
        </div>
        <label class="field"><span>День рождения (необязательно)</span>
          <input type="date" name="birthday" id="st-bday" value=""></label>`}
        <label class="field" data-pay="pass" ${pm === 'pass' ? '' : 'hidden'}><span>Своя цена абонемента, ₽ (необязательно)</span>
          <input name="price" id="st-price" inputmode="decimal" value="${esc(st?.price ?? '')}" placeholder="как у группы: ${esc(fmtMoney(g.price))}">
          <p class="hint">Только если у неё скидка. Иначе цена как у группы.</p></label>
        <div data-pay="single" ${pm === 'single' ? '' : 'hidden'}>
          <label class="field"><span>Цена одного занятия, ₽</span>
            <input name="singlePrice" id="st-single" inputmode="decimal" value="${esc(st?.singlePrice ?? '')}" placeholder="как у группы: ${esc(fmtMoney(groupSinglePrice(g)))}">
            <p class="hint">Оставьте пустым — будет цена разового занятия группы. Она платит только за те занятия, на которые пришла: отметьте «✓» в посещении и примите оплату. Пропуски не считаются.</p></label>
        </div>
        <label class="field"><span>Заметка</span>
          <textarea name="note" id="st-note" placeholder="Например: платит переводом">${esc(st?.note || '')}</textarea></label>
        <button class="btn">${st ? 'Сохранить' : 'Добавить ученицу'}</button>
      </form>`,
  });
}
actions['add-student'] = () => openStudentForm();

// Группы — всегда видны, плюс кнопка «Новая группа» (например, дети и взрослые)
function groupPickHTML(selected) {
  return state.groups.map(x => `<label><input type="radio" name="groupId" value="${x.id}" ${x.id === selected ? 'checked' : ''}>
    <span><i class="gdot" style="--c:${x.color}"></i>${esc(x.name)}</span></label>`).join('')
    + '<button type="button" class="pill-add" data-act="add-group">+ Новая группа</button>';
}
// Создали группу прямо из формы ученицы — сразу показываем и выбираем её
document.addEventListener('groups-changed', e => {
  document.querySelectorAll('.group-pick').forEach(box => {
    const cur = box.querySelector('input:checked')?.value;
    box.innerHTML = groupPickHTML(e.detail?.id || cur);
  });
});
inputs['student-pay'] = el => {
  el.form.querySelectorAll('[data-pay]').forEach(b => { b.hidden = b.dataset.pay !== el.value; });
};
inputs['student-mode'] = el => {
  el.form.querySelectorAll('[data-mode]').forEach(b => { b.hidden = b.dataset.mode !== el.value; });
};
// Сегодня, если сегодняшнее занятие группы ещё не началось; иначе завтра
function firstOpenDay(gid) {
  const t = todayISO();
  const l = lessonOn(gid, t);
  return l && isHeld(l) ? addDaysISO(t, 1) : t;
}
actions['edit-student'] = ({ id }) => openStudentForm(id);

forms.student = (f, fd) => {
  const id = f.dataset.id;
  const name = String(fd.get('name') || '').trim().replace(/\s+/g, ' ');
  if (!name) return;
  const priceRaw = String(fd.get('price') || '').trim();
  const data = {
    name,
    phone: String(fd.get('phone') || '').trim(),
    mode: fd.get('payMode') === 'single' ? 'single' : 'pass',
    singlePrice: String(fd.get('singlePrice') || '').trim() === '' ? null : num(fd.get('singlePrice')),
    note: String(fd.get('note') || '').trim(),
    price: priceRaw === '' ? null : num(priceRaw),
    birthday: fd.get('birthday') || null,
  };
  if (id) data.startDate = fd.get('startDate') || todayISO();
  const gid = fd.get('groupId') || state.groups[0].id;
  if (id) {
    commit(s => {
      const st = s.students.find(x => x.id === id);
      Object.assign(st, data);
      const cur = st.groups[st.groups.length - 1];
      if (cur.groupId !== gid) {
        const t = todayISO();
        if ((st.groups.length === 1 && st.startDate >= t) || cur.from >= t) cur.groupId = gid;
        else st.groups.push({ from: t, groupId: gid });
      }
    }, { toast: 'Сохранено', undo: true });
  } else {
    const sid = uid();
    const single = data.mode === 'single';
    const mode = single ? 'new' : (fd.get('mode') || 'new');
    const left = Math.max(0, Math.round(num(fd.get('left'))));
    // «Уже ходит»: считаем с ближайшего ещё не прошедшего занятия, остаток — бесплатным переносом.
    // Разовая: с сегодняшнего дня, считаются только отмеченные посещения.
    const start = single ? todayISO() : mode === 'old' ? firstOpenDay(gid) : (fd.get('startDate') || todayISO());
    commit(s => {
      s.students.push({
        id: sid, ...data, startDate: start, groups: [{ from: SCHEDULE_START, groupId: gid }],
        pauses: [], archived: false, leftDate: null, createdAt: Date.now(),
      });
      if (mode === 'old' && left) {
        s.payments.push({
          id: uid(), studentId: sid, date: start, amount: 0, lessons: left, carry: true,
          method: 'cash', note: 'Остаток абонемента', createdAt: Date.now(),
        });
      }
    });
    toast(`${name} — добавлена`, { action: { label: 'Открыть', fn: () => openStudent(sid) } });
  }
  closeSheet();
};

// ---------- Пауза ----------
actions['pause-student'] = ({ id }) => openSheet({
  title: 'Пауза',
  render: () => `
    <form data-form="pause" data-id="${id}">
      <p class="muted">Во время паузы занятия у ученицы не списываются — например, болезнь или отпуск, если вы так договорились.</p>
      <div class="grid2">
        <label class="field"><span>С</span><input type="date" name="from" id="pause-from" value="${todayISO()}" required></label>
        <label class="field"><span>По (включительно)</span><input type="date" name="to" id="pause-to"></label>
      </div>
      <p class="hint" style="margin:-8px 4px 16px">Не знаете дату окончания — оставьте пустой и потом нажмите «Снять паузу».</p>
      <label class="field"><span>Причина</span><input name="note" id="pause-note" placeholder="Необязательно"></label>
      <button class="btn">Поставить на паузу</button>
    </form>`,
});
forms.pause = (f, fd) => {
  const from = fd.get('from'), to = fd.get('to') || null;
  if (to && to < from) { toast('Дата окончания раньше даты начала'); return; }
  commit(s => s.students.find(x => x.id === f.dataset.id).pauses.push({
    id: uid(), from, to, note: String(fd.get('note') || '').trim(),
  }), { toast: 'Пауза установлена', undo: true });
  closeSheet();
};
actions['resume-student'] = ({ id }) => {
  const t = todayISO(), y = addDaysISO(t, -1);
  commit(s => {
    const st = s.students.find(x => x.id === id);
    st.pauses = st.pauses.filter(p => !(p.from >= t));
    st.pauses.forEach(p => { if (!p.to || p.to >= t) p.to = y; });
  }, { toast: 'Пауза снята — занятия снова считаются', undo: true });
};
actions['delete-pause'] = ({ id, pid }) => {
  commit(s => {
    const st = s.students.find(x => x.id === id);
    st.pauses = st.pauses.filter(p => p.id !== pid);
  }, { toast: 'Пауза удалена', undo: true });
};

// ---------- Архив / удаление ----------
actions['archive-student'] = async ({ id }) => {
  const st = getStudent(id);
  const ok = await ask({
    title: 'Перенести в архив?',
    text: `${st.name} больше не ходит. С сегодняшнего дня занятия у неё не считаются, история оплат сохранится.`,
    ok: 'В архив',
  });
  if (!ok) return;
  commit(s => {
    const x = s.students.find(v => v.id === id);
    x.archived = true;
    x.leftDate = addDaysISO(todayISO(), -1);
  }, { toast: 'Перенесена в архив', undo: true });
};
actions['unarchive-student'] = ({ id }) => {
  commit(s => {
    const x = s.students.find(v => v.id === id);
    const y = addDaysISO(todayISO(), -1);
    if (x.leftDate) {
      const from = addDaysISO(x.leftDate, 1);
      if (from <= y) x.pauses.push({ id: uid(), from, to: y, note: 'Перерыв (была в архиве)' });
    }
    x.archived = false;
    x.leftDate = null;
  }, { toast: 'Ученица снова в списке', undo: true });
};
actions['delete-student'] = async ({ id }) => {
  const st = getStudent(id);
  const ok = await ask({
    title: 'Удалить навсегда?',
    text: `${st.name} и все её оплаты будут удалены. Если она просто ушла — лучше перенести в архив.`,
    ok: 'Удалить', danger: true,
  });
  if (!ok) return;
  commit(s => {
    s.students = s.students.filter(x => x.id !== id);
    s.payments = s.payments.filter(p => p.studentId !== id);
    Object.values(s.attendance).forEach(m => { delete m[id]; });
  }, { toast: 'Ученица удалена', undo: true });
};
