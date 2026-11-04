// Состояние интерфейса (не сохраняется в данных)
import { todayISO } from './util.js';

export const ui = {
  tab: 'home',
  calMonth: todayISO().slice(0, 7),
  payMonth: todayISO().slice(0, 7),
  filter: 'all',
  search: '',
};
