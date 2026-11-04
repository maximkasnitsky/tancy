// Приём / редактирование оплаты
import { state } from '../store.js';
import { actions, forms, inputs, openSheet, closeSheet, commit, ask } from '../ui.js';
import { esc, todayISO, fmtDate, pl, LESSONS, num, uid, whenShort } from '../util.js';
import {
  getStudent, getPayment, studentStatus, fmtMoney, countedLessons, METHODS,
  singlePriceOf, sortByStatus, activeStudents,
} from '../logic.js';
import { avatar, chip, studentRow, icon } from '../components.js';

export function openPaymentForm({ studentId, paymentId } = {}) {
  const p = paymentId ? getPayment(paymentId) : null;
  const st = getStudent(p ? p.studentId : studentId);
  if (!st) return;
  const s = studentStatus(st);
  const v = p ? { ...p } : { date: todayISO(), amount: s.price, lessons: s.passSize, method: 'cash', note: '' };
  if (!p && s.debt > s.passSize) {
    const k = Math.ceil(s.debt / s.passSize);
    v.lessons = k * s.passSize;
    v.amount = k * s.price;
  }
  const kind = Number(v.lessons) === s.passSize ? 'pass' : Number(v.lessons) === 1 ? 'single' : 'custom';
  const cov = p ? s.coverage.find(c => c.p.id === p.id) : null;
  const radio = (val, label) =>
    `<label><input type="radio" name="kind" value="${val}" data-input="pay-kind" ${kind === val ? 'checked' : ''}><span>${label}</span></label>`;

  openSheet({
    title: p ? 'Оплата' : 'Принять оплату',
    render: () => `
      <form data-form="payment" data-sid="${st.id}" data-pid="${p?.id || ''}" autocomplete="off">
        <div class="row" style="padding:0 2px 14px;min-height:0;border:0">
          ${avatar(st)}
          <div class="main"><div class="title">${esc(st.name)}</div><div class="sub">${esc(s.sub)}</div></div>
          ${chip(s.label, s.tone)}
        </div>
        <div class="field"><span>Что оплачено</span>
          <div class="pills">
            ${radio('pass', `Абонемент · ${pl(s.passSize, LESSONS)}`)}
            ${radio('single', 'Разовое · 1 занятие')}
            ${radio('custom', 'Другое')}
          </div>
        </div>
        <label class="field"><span>Сумма, ₽</span>
          <input name="amount" id="pay-amount" class="big" inputmode="decimal" value="${esc(v.amount)}" required></label>
        <label class="field" data-lessons ${kind === 'custom' ? '' : 'hidden'}><span>Сколько занятий оплачено</span>
          <input name="lessons" id="pay-lessons" type="number" inputmode="numeric" min="0" step="1" value="${esc(v.lessons)}" data-input="pay-preview"></label>
        <div class="field"><span>Как оплатила</span>
          <div class="pills">${Object.entries(METHODS).map(([k, t]) =>
            `<label><input type="radio" name="method" value="${k}" ${(v.method || 'cash') === k ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div></div>
        <label class="field"><span>Дата оплаты</span>
          <input type="date" name="date" id="pay-date" value="${esc(v.date)}" required></label>
        <label class="field"><span>Комментарий</span>
          <input name="note" id="pay-note" value="${esc(v.note || '')}" placeholder="Необязательно"></label>
        ${p
          ? (cov && cov.from ? `<div class="note-box">Покрывает занятия: ${fmtDate(cov.from)} — ${fmtDate(cov.to || cov.from)} · использовано ${cov.used} из ${cov.total}</div>` : '')
          : `<div class="note-box" id="pay-preview">${previewHTML(st, Number(v.lessons))}</div>`}
        <button class="btn">${p ? 'Сохранить' : 'Принять оплату'}</button>
        ${p ? `<button type="button" class="btn danger mt" data-act="delete-payment" data-id="${p.id}">Удалить оплату</button>` : ''}
      </form>`,
  });
}

function previewHTML(st, n) {
  const s = studentStatus(st);
  if (!n) return 'Занятия не добавятся — только сумма.';
  const list = countedLessons(st, s.credits + n + 1);
  const from = list[s.credits], to = list[s.credits + n - 1], next = list[s.credits + n];
  if (!from) return 'В расписании нет будущих занятий.';
  let t = `Покроет ${pl(n, LESSONS)}: <b>${fmtDate(from.date)} — ${fmtDate((to || from).date)}</b>.`;
  if (s.debt > 0) t += ` Из них ${pl(Math.min(s.debt, n), LESSONS)} — уже прошедшие неоплаченные.`;
  if (s.debt > n) t += ` <b>Останется долг: ${pl(s.debt - n, LESSONS)}.</b>`;
  else if (next) t += ` Следующая оплата: <b>${whenShort(next.date)}</b>.`;
  return t;
}

inputs['pay-kind'] = el => {
  const f = el.form;
  const st = getStudent(f.dataset.sid);
  const s = studentStatus(st);
  if (el.value === 'pass') { f.lessons.value = s.passSize; f.amount.value = s.price; }
  if (el.value === 'single') { f.lessons.value = 1; f.amount.value = singlePriceOf(st); }
  f.querySelector('[data-lessons]').hidden = el.value !== 'custom';
  if (el.value === 'custom') f.lessons.focus();
  inputs['pay-preview'](f.lessons);
};
inputs['pay-preview'] = el => {
  const box = document.getElementById('pay-preview');
  if (!box) return;
  const st = getStudent(el.form.dataset.sid);
  box.innerHTML = previewHTML(st, Math.max(0, Math.round(num(el.value))));
};

forms.payment = (f, fd) => {
  const st = getStudent(f.dataset.sid);
  const pid = f.dataset.pid;
  const data = {
    amount: num(fd.get('amount')),
    lessons: Math.max(0, Math.round(num(fd.get('lessons')))),
    date: fd.get('date') || todayISO(),
    method: fd.get('method') || 'cash',
    note: String(fd.get('note') || '').trim(),
  };
  if (pid) {
    commit(s => Object.assign(s.payments.find(x => x.id === pid), data), { toast: 'Оплата изменена', undo: true });
  } else {
    commit(s => s.payments.push({ id: uid(), studentId: st.id, createdAt: Date.now(), ...data }),
      { toast: `${st.name.split(' ')[0]}: оплата ${fmtMoney(data.amount)} принята`, undo: true });
  }
  closeSheet();
};

actions['delete-payment'] = async ({ id }) => {
  const p = getPayment(id);
  if (!p) return;
  const ok = await ask({ title: 'Удалить оплату?', text: `${fmtMoney(p.amount)} от ${fmtDate(p.date)}`, ok: 'Удалить', danger: true });
  if (!ok) return;
  commit(s => { s.payments = s.payments.filter(x => x.id !== id); }, { toast: 'Оплата удалена', undo: true });
  closeSheet();
};

// ---------- Быстрая оплата: выбрать ученицу ----------
function pickListHTML(q = '') {
  const ql = q.trim().toLowerCase();
  const list = sortByStatus(activeStudents()).filter(st => !ql || st.name.toLowerCase().includes(ql));
  return list.map(st => studentRow(st, { act: 'pick-pay' })).join('') ||
    '<div class="empty" style="padding:24px">Никого не найдено</div>';
}
export function openPickStudent() {
  openSheet({
    title: 'Кто оплатил?',
    tall: true,
    render: () => `
      <div class="search" style="margin:0 0 12px">${icon('search')}
        <input type="search" placeholder="Поиск по имени" data-input="pick-search" autocomplete="off"></div>
      <div class="list" id="pick-list">${pickListHTML()}</div>`,
  });
}
inputs['pick-search'] = el => { document.getElementById('pick-list').innerHTML = pickListHTML(el.value); };
actions['pick-pay'] = ({ id }) => { closeSheet(); openPaymentForm({ studentId: id }); };
actions['quick-pay'] = () => {
  if (!activeStudents().length) return;
  openPickStudent();
};
actions.pay = ({ id }) => openPaymentForm({ studentId: id });
actions['edit-payment'] = ({ id }) => openPaymentForm({ paymentId: id });
