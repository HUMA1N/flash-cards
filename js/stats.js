/*
 * Статистика: календарь занятий (как на GitHub), серии дней подряд, итоги по карточкам.
 * Журнал log — объект {'YYYY-MM-DD': число ответов за день}.
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var mod = factory(isNode ? require('./sm2.js') : root.SM2, isNode ? require('./data.js') : root.Data);
  if (isNode) module.exports = mod;
  else root.Stats = mod;
})(typeof self !== 'undefined' ? self : this, function (SM2, Data) {
  'use strict';

  // Границы уровней цвета: 1–9 ответов, 10–24, 25–49, 50 и больше
  var LEVELS = [1, 10, 25, 50];

  function level(count) {
    var l = 0;
    for (var i = 0; i < LEVELS.length; i++) if (count >= LEVELS[i]) l = i + 1;
    return l;
  }

  /** День недели с понедельника: 0 — пн, 6 — вс. */
  function weekday(s) {
    var p = s.split('-');
    return (new Date(+p[0], +p[1] - 1, +p[2]).getDay() + 6) % 7;
  }

  /**
   * Сетка календаря: weeks колонок по 7 дней (пн…вс), последняя колонка — текущая неделя.
   * @returns {{weeks: {date: string, count: number, level: number, future: boolean}[][], months: {col: number, month: number}[]}}
   */
  function calendar(log, todayStr, weeks) {
    weeks = weeks || 53;
    var start = SM2.addDays(todayStr, -weekday(todayStr) - (weeks - 1) * 7);
    var cols = [];
    var months = [];
    var d = start;
    for (var w = 0; w < weeks; w++) {
      var col = [];
      for (var i = 0; i < 7; i++) {
        var count = log[d] > 0 ? log[d] : 0;
        col.push({ date: d, count: count, level: level(count), future: d > todayStr });
        d = SM2.addDays(d, 1);
      }
      // Подпись месяца — над неделей, в которой встречается 1-е число
      var first = col.filter(function (c) { return c.date.slice(8) === '01'; })[0];
      if (first || w === 0) months.push({ col: w, month: +(first || col[0]).date.slice(5, 7) - 1 });
      cols.push(col);
    }
    // Подпись в первой колонке уберём, если следующая слишком близко
    if (months.length > 1 && months[1].col - months[0].col < 3) months.shift();
    return { weeks: cols, months: months };
  }

  /** Самая длинная серия дней подряд с ответами за всю историю журнала. */
  function bestStreak(log) {
    var days = Object.keys(log).filter(function (k) { return log[k] > 0; }).sort();
    var best = 0;
    var run = 0;
    var prev = null;
    days.forEach(function (d) {
      run = prev && SM2.addDays(prev, 1) === d ? run + 1 : 1;
      if (run > best) best = run;
      prev = d;
    });
    return best;
  }

  function totals(log, todayStr, days) {
    var from = days ? SM2.addDays(todayStr, -(days - 1)) : '';
    var answers = 0;
    var active = 0;
    Object.keys(log).forEach(function (k) {
      if (k < from || k > todayStr || !(log[k] > 0)) return;
      answers += log[k];
      active++;
    });
    return { answers: answers, activeDays: active };
  }

  /**
   * Сводка по карточкам: новые (ещё не учились), изучаются, выучены
   * (интервал не меньше MATURE_DAYS дней — карточку помнят минимум три недели).
   */
  function cardSummary(decks) {
    var s = { total: 0, fresh: 0, learning: 0, learned: 0 };
    decks.forEach(function (deck) {
      deck.cards.forEach(function (c) {
        s.total++;
        if (!c.due) s.fresh++;
        else if (c.interval >= Data.MATURE_DAYS) s.learned++;
        else s.learning++;
      });
    });
    return s;
  }

  return {
    LEVELS: LEVELS,
    level: level,
    weekday: weekday,
    calendar: calendar,
    bestStreak: bestStreak,
    totals: totals,
    cardSummary: cardSummary
  };
});
