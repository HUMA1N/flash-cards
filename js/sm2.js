/*
 * Алгоритм интервальных повторений SM-2 (SuperMemo 2, П. Возняк, 1987)
 * и работа с датами в формате 'YYYY-MM-DD' (локальное время).
 *
 * Три кнопки отображаются на оценки качества ответа q из шкалы SM-2 (0–5):
 *   «Не помню» → 1, «Трудно» → 3, «Легко» → 5.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.SM2 = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GRADES = { again: 1, hard: 3, easy: 5 };
  var START_EF = 2.5;
  var MIN_EF = 1.3;

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function dateToStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function strToDate(s) {
    var p = s.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function today(now) {
    return dateToStr(now || new Date());
  }

  function addDays(s, n) {
    var d = strToDate(s);
    d.setDate(d.getDate() + n);
    return dateToStr(d);
  }

  /** Сколько дней от a до b (b − a). Округление гасит переходы на летнее время. */
  function diffDays(a, b) {
    return Math.round((strToDate(b) - strToDate(a)) / 86400000);
  }

  function isNew(card) {
    return !card.due;
  }

  function isDue(card, todayStr) {
    return !!card.due && card.due <= todayStr;
  }

  /**
   * Один шаг SM-2. Возвращает новые поля расписания, карточку не меняет.
   *   n        — сколько раз подряд карточку вспомнили (q ≥ 3)
   *   interval — текущий интервал в днях
   *   ef       — коэффициент лёгкости (E-Factor), не ниже 1,3
   */
  function schedule(card, q, todayStr) {
    var ef = typeof card.ef === 'number' && isFinite(card.ef) ? card.ef : START_EF;
    var n = card.n > 0 ? card.n : 0;
    var interval = card.interval > 0 ? card.interval : 0;

    if (q >= 3) {
      if (n === 0) interval = 1;
      else if (n === 1) interval = 6;
      else interval = Math.max(1, Math.round(interval * ef));
      n += 1;
    } else {
      n = 0;
      interval = 1;
    }

    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (ef < MIN_EF) ef = MIN_EF;
    ef = Math.round(ef * 100) / 100;

    return { ef: ef, n: n, interval: interval, due: addDays(todayStr, interval) };
  }

  /** Применяет ответ к карточке: расписание SM-2 плюс счётчики. Возвращает новый объект. */
  function review(card, q, todayStr) {
    var next = schedule(card, q, todayStr);
    var out = {};
    for (var k in card) out[k] = card[k];
    out.ef = next.ef;
    out.n = next.n;
    out.interval = next.interval;
    out.due = next.due;
    out.reps = (card.reps || 0) + 1;
    out.lapses = (card.lapses || 0) + (q < 3 && card.n > 0 ? 1 : 0);
    out.last = todayStr;
    return out;
  }

  return {
    GRADES: GRADES,
    START_EF: START_EF,
    MIN_EF: MIN_EF,
    today: today,
    addDays: addDays,
    diffDays: diffDays,
    isNew: isNew,
    isDue: isDue,
    schedule: schedule,
    review: review
  };
});
