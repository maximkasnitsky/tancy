// История оплат по месяцам, график за полгода, выгрузка в таблицу
import { actions, refresh, shareFile, toast } from '../ui.js';
import { ui } from '../uistate.js';
import { esc, todayISO, fmtDate, cap, pl, monthTitle, addMonths, LESSONS, PAYMENTS, MONTHS_SHORT } from '../util.js';
import {
  monthPayments, monthTotals, monthHistory, expectedThisMonth, getStudent, groupOf, fmtMoney, METHODS, multiGroup,
} from '../logic.js';
import { avatar, icon, empty, tbBtn } from '../components.js';

const short = n => n >= 1000 ? `${Math.round(n / 100) / 10}`.replace('.', ',') + 'к' : String(Math.round(n));

function chartHTML(key) {
  const hist = monthHistory(key, 6);
  if (!hist.some(h => h.total)) return '';
  const max = Math.max(...hist.map(h => h.total), 1);
  return `<div class="card">
    <div class="label" style="margin:0">Доход по месяцам, ₽</div>
    <div class="chart">${hist.map(h => {
      const m = Number(h.key.slice(5, 7)) - 1;
      const pct = Math.max(3, Math.round(h.total / max * 100));
      return `<button class="col ${h.key === key ? 'on' : ''}" data-act="pay-month" data-key="${h.key}" aria-label="${monthTitle(h.key, true)}: ${fmtMoney(h.total)}">
        <span class="val">${h.total ? short(h.total) : '—'}</span>
        <span class="bar" style="height:${h.total ? pct : 3}%"></span>
        <span class="mon">${MONTHS_SHORT[m]}</span>
      </button>`;
    }).join('')}</div>
  </div>`;
}

export function renderPayments() {
  const key = ui.payMonth;
  const list = monthPayments(key);
  const tot = monthTotals(key);
  const isCurrent = key === todayISO().slice(0, 7);
  const exp = isCurrent ? expectedThisMonth() : null;

  const byDay = {};
  list.forEach(p => { (byDay[p.date] ||= []).push(p); });
  const methods = Object.entries(tot.byMethod).map(([m, a]) => `${METHODS[m] || m} ${fmtMoney(a)}`).join(' · ');

  const days = Object.keys(byDay).sort().reverse().map(d => `
    <div class="row-date">${cap(fmtDate(d, { wd: true }))}</div>
    <div class="list">${byDay[d].map(p => {
      const st = getStudent(p.studentId);
      return `<div class="row tap" data-act="edit-payment" data-id="${p.id}">
        ${st ? avatar(st) : '<div class="avatar">?</div>'}
        <div class="main">
          <div class="title">${esc(st ? st.name : 'Удалённая ученица')}</div>
          <div class="sub">${pl(Number(p.lessons) || 0, LESSONS)} · ${METHODS[p.method] || ''}${multiGroup() && st ? ' · ' + esc(groupOf(st).name) : ''}${p.note ? ' · ' + esc(p.note) : ''}</div>
        </div>
        <div class="right"><span class="amount">${fmtMoney(p.amount)}</span></div>
      </div>`;
    }).join('')}</div>`).join('');

  return {
    title: 'Оплаты',
    sub: 'История и итоги',
    action: list.length ? tbBtn('export-csv', icon('share') + 'Таблица') : '',
    html: `
      <div class="cal-nav">
        <button class="icon-btn" data-act="pay-move" data-n="-1" aria-label="Предыдущий месяц">${icon('left')}</button>
        <h2>${monthTitle(key, true)}</h2>
        <button class="icon-btn" data-act="pay-move" data-n="1" aria-label="Следующий месяц">${icon('right')}</button>
      </div>
      <div class="stats" style="margin-top:6px">
        <div class="stat"><span class="label">Получено</span><b>${fmtMoney(tot.total)}</b><span class="foot">${pl(tot.count, PAYMENTS)}</span></div>
        ${exp
          ? `<button class="stat" data-act="filter-go" data-f="soon"><span class="label">Ожидается</span><b>${fmtMoney(exp.sum)}</b><span class="foot">ещё ${pl(exp.count, PAYMENTS)}</span></button>`
          : `<div class="stat"><span class="label">Средний чек</span><b>${tot.count ? fmtMoney(Math.round(tot.total / tot.count)) : '—'}</b><span class="foot">за месяц</span></div>`}
      </div>
      ${methods ? `<p class="hint" style="margin:10px 4px 0">${esc(methods)}</p>` : ''}
      ${chartHTML(key)}
      ${list.length ? days : empty('Оплат пока нет', isCurrent ? 'Оплаты появятся здесь, когда вы их примете.' : 'В этом месяце оплат не было.',
        isCurrent ? '<button class="btn" data-act="quick-pay">Принять оплату</button>' : '')}`,
  };
}

actions['pay-move'] = ({ n }) => { ui.payMonth = addMonths(ui.payMonth, Number(n)); refresh(); };
actions['pay-month'] = ({ key }) => { ui.payMonth = key; refresh(); };

actions['export-csv'] = async () => {
  const key = ui.payMonth;
  const list = [...monthPayments(key)].reverse();
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Дата', 'Ученица', 'Группа', 'Сумма, ₽', 'Занятий', 'Способ', 'Комментарий'].map(q).join(';')];
  list.forEach(p => {
    const st = getStudent(p.studentId);
    lines.push([
      p.date, st?.name || '', st ? groupOf(st).name : '', String(p.amount).replace('.', ','),
      p.lessons, METHODS[p.method] || '', p.note || '',
    ].map(q).join(';'));
  });
  const file = new File(['﻿' + lines.join('\r\n')], `oplaty-${key}.csv`, { type: 'text/csv' });
  const ok = await shareFile(file, `Оплаты — ${monthTitle(key, true)}`);
  if (ok) toast('Таблица готова');
};
