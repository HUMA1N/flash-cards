'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Stats = require('../js/stats.js');
const Data = require('../js/data.js');

const T = '2026-10-06'; // вторник

test('уровни цвета календаря', () => {
  assert.deepEqual([0, 1, 9, 10, 24, 25, 49, 50, 500].map(Stats.level), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test('день недели с понедельника', () => {
  assert.equal(Stats.weekday('2026-10-05'), 0); // понедельник
  assert.equal(Stats.weekday(T), 1);
  assert.equal(Stats.weekday('2026-10-11'), 6); // воскресенье
});

test('календарь: 53 недели по 7 дней, последняя — текущая, будущие дни помечены', () => {
  const log = { [T]: 12, '2026-10-01': 3, '2025-01-01': 99 };
  const cal = Stats.calendar(log, T, 53);
  assert.equal(cal.weeks.length, 53);
  cal.weeks.forEach((w) => assert.equal(w.length, 7));
  const last = cal.weeks[52];
  assert.equal(last[0].date, '2026-10-05');
  assert.equal(last[1].date, T);
  assert.equal(last[1].count, 12);
  assert.equal(last[1].level, 2);
  assert.equal(last[2].future, true);
  assert.equal(cal.weeks[0][0].date, '2025-10-06');
  const flat = cal.weeks.flat();
  assert.equal(flat.find((c) => c.date === '2026-10-01').level, 1);
  // Дни идут подряд без пропусков (в том числе через переход на зимнее время)
  for (let i = 1; i < flat.length; i++) assert.ok(flat[i].date > flat[i - 1].date);
  assert.equal(new Set(flat.map((c) => c.date)).size, 53 * 7);
});

test('подписи месяцев: по одной на месяц, в порядке колонок', () => {
  const cal = Stats.calendar({}, T, 53);
  const cols = cal.months.map((m) => m.col);
  assert.deepEqual(cols, [...cols].sort((a, b) => a - b));
  assert.ok(cal.months.length >= 12 && cal.months.length <= 13);
  assert.equal(cal.months[cal.months.length - 1].month, 9); // октябрь
});

test('рекордная серия', () => {
  const log = { '2026-01-01': 1, '2026-01-02': 4, '2026-01-03': 2, '2026-01-05': 1, '2026-02-28': 1, '2026-03-01': 1, '2026-03-02': 0 };
  assert.equal(Stats.bestStreak(log), 3);
  assert.equal(Stats.bestStreak({}), 0);
});

test('итоги за период', () => {
  const log = { [T]: 5, '2026-10-01': 3, '2025-10-06': 100, '2025-10-07': 7 };
  assert.deepEqual(Stats.totals(log, T, 365), { answers: 15, activeDays: 3 });
  assert.deepEqual(Stats.totals(log, T), { answers: 115, activeDays: 4 });
});

test('сводка по карточкам: выучены — интервал от 21 дня', () => {
  const d = Data.newDeck('x');
  const mk = (due, interval) => { const c = Data.newCard('q', 'a'); c.due = due; c.interval = interval; return c; };
  d.cards.push(Data.newCard('q', 'a'), mk(T, 1), mk('2026-11-01', 21), mk('2026-12-01', 60));
  assert.deepEqual(Stats.cardSummary([d, Data.newDeck('пустая')]), { total: 4, fresh: 1, learning: 1, learned: 2 });
});
