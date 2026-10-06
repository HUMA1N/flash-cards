'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const SM2 = require('../js/sm2.js');

const T = '2026-10-06';
const fresh = () => ({ ef: 2.5, n: 0, interval: 0, due: null });

test('даты: прибавление дней и разница, включая смену месяца и года', () => {
  assert.equal(SM2.addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(SM2.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(SM2.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(SM2.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(SM2.diffDays('2026-03-25', '2026-04-05'), 11); // через переход на летнее время
  assert.equal(SM2.today(new Date(2026, 0, 5)), '2026-01-05');
});

test('успешные ответы: интервалы 1 → 6 → I·EF', () => {
  let c = fresh();
  c = SM2.review(c, SM2.GRADES.hard, T);
  assert.equal(c.interval, 1);
  assert.equal(c.n, 1);
  assert.equal(c.due, '2026-10-07');
  c = SM2.review(c, SM2.GRADES.hard, T);
  assert.equal(c.interval, 6);
  assert.equal(c.n, 2);
  const ef = c.ef;
  c = SM2.review(c, SM2.GRADES.easy, T);
  assert.equal(c.interval, Math.round(6 * ef));
  assert.equal(c.n, 3);
});

test('изменение коэффициента лёгкости по формуле SM-2', () => {
  assert.equal(SM2.schedule(fresh(), 5, T).ef, 2.6);  // +0,1
  assert.equal(SM2.schedule(fresh(), 4, T).ef, 2.5);  // без изменений
  assert.equal(SM2.schedule(fresh(), 3, T).ef, 2.36); // −0,14
  assert.equal(SM2.schedule(fresh(), 1, T).ef, 1.96); // −0,54
});

test('лёгкость не опускается ниже 1,3', () => {
  let c = fresh();
  for (let i = 0; i < 10; i++) c = SM2.review(c, SM2.GRADES.again, T);
  assert.equal(c.ef, SM2.MIN_EF);
});

test('«Не помню» сбрасывает повторения и интервал, считает забывание', () => {
  let c = fresh();
  c = SM2.review(c, 5, T);
  c = SM2.review(c, 5, T);
  c = SM2.review(c, 5, T);
  assert.ok(c.interval > 6);
  c = SM2.review(c, SM2.GRADES.again, T);
  assert.equal(c.n, 0);
  assert.equal(c.interval, 1);
  assert.equal(c.due, '2026-10-07');
  assert.equal(c.lapses, 1);
  assert.equal(c.reps, 4);
  assert.equal(c.last, T);
});

test('«Не помню» на новой карточке — не забывание', () => {
  const c = SM2.review(fresh(), SM2.GRADES.again, T);
  assert.equal(c.lapses, 0);
});

test('review не меняет исходную карточку и сохраняет прочие поля', () => {
  const c = { id: 'x', q: 'Q', a: 'A', ef: 2.5, n: 0, interval: 0, due: null };
  const r = SM2.review(c, 5, T);
  assert.equal(c.due, null);
  assert.equal(r.id, 'x');
  assert.equal(r.q, 'Q');
});

test('повреждённые поля не ломают расчёт', () => {
  const r = SM2.schedule({ ef: NaN, n: 5, interval: 0 }, 5, T);
  assert.ok(r.interval >= 1);
  assert.equal(r.ef, 2.6);
});

test('isDue / isNew', () => {
  assert.ok(SM2.isNew({ due: null }));
  assert.ok(SM2.isDue({ due: '2026-10-06' }, T));
  assert.ok(SM2.isDue({ due: '2026-10-01' }, T));
  assert.ok(!SM2.isDue({ due: '2026-10-07' }, T));
  assert.ok(!SM2.isDue({ due: null }, T));
});
