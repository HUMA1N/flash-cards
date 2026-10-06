/*
 * Разбор списка «термин — определение» построчно для массового добавления.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.Parse = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Порядок важен: берётся первый разделитель, который встретился в строке.
  // Дефис без пробелов («кто-то») и минус (−) разделителями не считаются.
  var SEPARATORS = {
    auto: ['\t', ' — ', ' – ', ' - ', '—', '–', ' = ', ';', ':'],
    dash: [' — ', ' – ', ' - ', '—', '–'],
    tab: ['\t'],
    semicolon: [';'],
    colon: [':'],
    equals: ['='],
    comma: [',']
  };

  // Маркеры списков в начале строки: «• », «- », «— », «* », «1. », «12) »
  var BULLET = /^\s*(?:[•·*▪◦‣—–-]|\d{1,3}[.)])\s+/;

  function splitLine(line, seps) {
    for (var i = 0; i < seps.length; i++) {
      var idx = line.indexOf(seps[i]);
      if (idx !== -1) return [line.slice(0, idx), line.slice(idx + seps[i].length)];
    }
    return null;
  }

  /**
   * @param {string} text
   * @param {{sep?: string, swap?: boolean}} [opts]
   * @returns {{cards: {q: string, a: string, line: number}[], errors: {line: number, text: string}[]}}
   */
  function parseList(text, opts) {
    opts = opts || {};
    var seps = SEPARATORS[opts.sep] || SEPARATORS.auto;
    var cards = [];
    var errors = [];
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');

    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i].replace(/ /g, ' ');
      if (!raw.trim()) continue;
      var line = raw.replace(BULLET, '');
      var parts = splitLine(line, seps);
      var q = parts && parts[0].trim();
      var a = parts && parts[1].trim();
      if (!q || !a) {
        errors.push({ line: i + 1, text: raw.trim() });
        continue;
      }
      cards.push(opts.swap ? { q: a, a: q, line: i + 1 } : { q: q, a: a, line: i + 1 });
    }
    return { cards: cards, errors: errors };
  }

  /** Ключ для поиска повторов: регистр, лишние пробелы и «ё» не важны. */
  function normKey(s) {
    return String(s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  }

  return { SEPARATORS: SEPARATORS, parseList: parseList, normKey: normKey };
});
