/*
 * Режим «Тест»: вопрос и 4 варианта ответа, один верный.
 * Неверные варианты берутся из ответов других карточек тех же колод;
 * предпочтение — ответам похожей длины, чтобы верный не выделялся.
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var mod = factory(isNode ? require('./parse.js') : root.Parse);
  if (isNode) module.exports = mod;
  else root.Quiz = mod;
})(typeof self !== 'undefined' ? self : this, function (Parse) {
  'use strict';

  var OPTIONS = 4;
  var DEFAULT_COUNT = 20;

  /** Основной текст ответа — без пояснения после пустой строки. */
  function mainText(s) {
    return String(s).split(/\n[ \t]*\n/)[0].trim();
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /** Разные (без учёта регистра и пробелов) ответы карточек: [{key, text}]. */
  function answerPool(cards) {
    var seen = {};
    var pool = [];
    cards.forEach(function (c) {
      var text = mainText(c.a);
      var key = Parse.normKey(text);
      if (!key || seen[key]) return;
      seen[key] = true;
      pool.push({ key: key, text: text });
    });
    return pool;
  }

  /** Хватает ли разных ответов, чтобы собрать 4 варианта. */
  function canQuiz(cards) {
    return answerPool(cards).length >= OPTIONS;
  }

  /** Варианты для одной карточки: верный + до трёх неверных, вперемешку. */
  function makeOptions(card, pool, rng) {
    rng = rng || Math.random;
    var right = mainText(card.a);
    var rightKey = Parse.normKey(right);
    var len = right.length;
    var others = pool.filter(function (p) { return p.key !== rightKey; }).map(function (p) {
      // Близость по длине плюс случайность, чтобы варианты не повторялись от раза к разу
      var diff = Math.abs(p.text.length - len) / Math.max(len, p.text.length, 1);
      return { text: p.text, score: diff + rng() * 0.6 };
    });
    others.sort(function (x, y) { return x.score - y.score; });
    var options = [right].concat(others.slice(0, OPTIONS - 1).map(function (o) { return o.text; }));
    shuffle(options, rng);
    return { options: options, correct: options.indexOf(right) };
  }

  /**
   * Вопросы теста.
   * @param {{d: string, c: object}[]} items — карточки с id колоды
   * @param {{count?: number, rng?: function, pool?: object[]}} [opts] — pool: карточки, из ответов которых берутся неверные варианты (по умолчанию — сами items)
   * @returns {{d: string, c: string, options: string[], correct: number}[]}
   */
  function buildQuiz(items, opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var count = opts.count > 0 ? opts.count : DEFAULT_COUNT;
    var pool = answerPool(opts.pool || items.map(function (i) { return i.c; }));
    if (pool.length < OPTIONS) return [];
    return shuffle(items.slice(), rng).slice(0, count).map(function (it) {
      var o = makeOptions(it.c, pool, rng);
      return { d: it.d, c: it.c.id, options: o.options, correct: o.correct };
    });
  }

  return {
    OPTIONS: OPTIONS,
    DEFAULT_COUNT: DEFAULT_COUNT,
    mainText: mainText,
    answerPool: answerPool,
    canQuiz: canQuiz,
    makeOptions: makeOptions,
    buildQuiz: buildQuiz
  };
});
