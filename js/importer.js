/*
 * Импорт карточек из текста: экспорт Quizlet и CSV-таблицы.
 *
 * Quizlet («Экспортировать» в наборе) выдаёт текст, где между термином и определением
 * стоит табуляция или запятая (или свой разделитель), а между карточками — перенос строки
 * или точка с запятой (или свой разделитель).
 *
 * CSV разбирается по RFC 4180: значения в кавычках могут содержать разделитель,
 * переносы строк и удвоенные кавычки "". Разделитель (, ; или табуляция) определяется сам.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.Importer = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clean(text) {
    return String(text == null ? '' : text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/ /g, ' ');
  }

  // ---------- Quizlet ----------

  var TERM_SEPS = { tab: '\t', comma: ',', dash: ' - ' };
  var CARD_SEPS = { newline: '\n', semicolon: ';' };

  /** Угадывает разделители экспорта Quizlet по тексту. */
  function detectQuizlet(text) {
    text = clean(text).trim();
    var lines = text.split('\n').filter(function (l) { return l.trim(); });
    function count(s) { return lines.filter(function (l) { return l.indexOf(s) !== -1; }).length; }
    var term = count('\t') ? 'tab' : count(' - ') > count(',') ? 'dash' : 'comma';
    // Карточки разделены «;», если после разбиения по «;» каждый кусок — ровно одна пара,
    // а по строкам пары не сходятся (есть строки без разделителя — продолжение
    // многострочного определения) или текст заканчивается на «;», как в экспорте Quizlet
    var sep = TERM_SEPS[term];
    function onePair(s) { return s.split(sep).length === 2; }
    var chunks = text.split(';').filter(function (c) { return c.trim(); });
    var semiOk = chunks.length > 1 && chunks.every(onePair);
    var linesOk = lines.every(onePair);
    var card = semiOk && (!linesOk || /;\s*$/.test(text)) ? 'semicolon' : 'newline';
    return { term: term, card: card };
  }

  function sepValue(map, key, custom) {
    if (key === 'custom') return custom ? String(custom).replace(/\\t/g, '\t').replace(/\\n/g, '\n') : null;
    return map[key] || null;
  }

  /**
   * @param {string} text
   * @param {{term?: string, card?: string, termCustom?: string, cardCustom?: string}} [opts]
   *   term: 'auto' | 'tab' | 'comma' | 'dash' | 'custom'; card: 'auto' | 'newline' | 'semicolon' | 'custom'
   * @returns {{cards: {q: string, a: string}[], errors: {index: number, text: string}[], term: string, card: string}}
   */
  function parseQuizlet(text, opts) {
    opts = opts || {};
    text = clean(text);
    var guess = detectQuizlet(text);
    var termKey = !opts.term || opts.term === 'auto' ? guess.term : opts.term;
    var cardKey = !opts.card || opts.card === 'auto' ? guess.card : opts.card;
    var termSep = sepValue(TERM_SEPS, termKey, opts.termCustom);
    var cardSep = sepValue(CARD_SEPS, cardKey, opts.cardCustom);
    var cards = [];
    var errors = [];
    if (!termSep || !cardSep) return { cards: cards, errors: errors, term: termKey, card: cardKey };

    var chunks = text.split(cardSep);
    chunks.forEach(function (chunk, i) {
      if (!chunk.trim()) return;
      var idx = chunk.indexOf(termSep);
      var q = idx === -1 ? '' : chunk.slice(0, idx).trim();
      var a = idx === -1 ? '' : chunk.slice(idx + termSep.length).trim();
      if (!q || !a) errors.push({ index: i + 1, text: chunk.trim() });
      else cards.push({ q: q, a: a });
    });
    return { cards: cards, errors: errors, term: termKey, card: cardKey };
  }

  // ---------- CSV ----------

  /** Разбор CSV в массив строк (каждая — массив ячеек). */
  function parseCSVRows(text, delim) {
    text = clean(text);
    var rows = [];
    var row = [];
    var cell = '';
    var quoted = false;
    var i = 0;
    var n = text.length;
    while (i < n) {
      var ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i += 2;
            continue;
          }
          quoted = false;
          i++;
          continue;
        }
        cell += ch;
        i++;
        continue;
      }
      if (ch === '"' && cell.trim() === '') {
        quoted = true;
        cell = '';
        i++;
      } else if (ch === delim) {
        row.push(cell);
        cell = '';
        i++;
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i++;
      } else {
        cell += ch;
        i++;
      }
    }
    if (cell !== '' || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim(); }); });
  }

  /** Разделитель, который даёт больше всего строк с одинаковым числом (≥ 2) колонок. */
  function detectDelimiter(text) {
    var sample = clean(text).slice(0, 20000);
    var best = ',';
    var bestScore = -1;
    [',', ';', '\t'].forEach(function (d) {
      var rows = parseCSVRows(sample, d).slice(0, 50);
      var multi = rows.filter(function (r) { return r.length >= 2; }).length;
      // Табуляция и «;» редко встречаются внутри текста, поэтому при равенстве им отдаётся предпочтение
      var score = multi * 10 + (d === ',' ? 0 : 1);
      if (multi && score > bestScore) {
        best = d;
        bestScore = score;
      }
    });
    return best;
  }

  var HEADER_WORDS = [
    'q', 'a', 'question', 'answer', 'front', 'back', 'term', 'definition', 'word', 'translation', 'meaning',
    'вопрос', 'ответ', 'термин', 'определение', 'слово', 'перевод', 'значение', 'лицевая сторона', 'обратная сторона'
  ];

  function isHeader(row) {
    if (row.length < 2) return false;
    var a = row[0].trim().toLowerCase();
    var b = row[1].trim().toLowerCase();
    return HEADER_WORDS.indexOf(a) !== -1 && HEADER_WORDS.indexOf(b) !== -1;
  }

  /**
   * @param {string} text
   * @param {{delimiter?: string, header?: 'auto'|boolean, swap?: boolean}} [opts]
   *   delimiter: 'auto' | ',' | ';' | '\t'
   * @returns {{cards: {q: string, a: string}[], errors: {index: number, text: string}[], delimiter: string, header: boolean}}
   */
  function parseCSV(text, opts) {
    opts = opts || {};
    var delim = !opts.delimiter || opts.delimiter === 'auto' ? detectDelimiter(text) : opts.delimiter;
    var rows = parseCSVRows(text, delim);
    var header = opts.header === true || ((opts.header == null || opts.header === 'auto') && rows.length > 0 && isHeader(rows[0]));
    var cards = [];
    var errors = [];
    rows.forEach(function (r, i) {
      if (i === 0 && header) return;
      var q = (r[0] || '').trim();
      // Лишние колонки (например, «пример» или «теги») — в пояснение после пустой строки
      var a = (r[1] || '').trim();
      var extra = r.slice(2).map(function (c) { return c.trim(); }).filter(Boolean);
      if (!q || !a) {
        errors.push({ index: i + 1, text: r.join(delim === '\t' ? ' ⇥ ' : delim + ' ').trim() });
        return;
      }
      if (extra.length) a += '\n\n' + extra.join('\n');
      cards.push(opts.swap ? { q: a, a: q } : { q: q, a: a });
    });
    return { cards: cards, errors: errors, delimiter: delim, header: header };
  }

  /** Строка CSV для экспорта: значения с разделителем, кавычками или переносами — в кавычках. */
  function toCSV(rows, delim) {
    delim = delim || ',';
    return rows.map(function (r) {
      return r.map(function (v) {
        v = String(v == null ? '' : v);
        return /[",;\t\n\r]/.test(v) || v !== v.trim() ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(delim);
    }).join('\r\n') + '\r\n';
  }

  return {
    detectQuizlet: detectQuizlet,
    parseQuizlet: parseQuizlet,
    parseCSVRows: parseCSVRows,
    detectDelimiter: detectDelimiter,
    parseCSV: parseCSV,
    toCSV: toCSV
  };
});
