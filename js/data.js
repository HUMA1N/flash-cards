/*
 * Модель данных: колоды и карточки, очередь повторения, статистика,
 * экспорт и импорт файлов.
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var mod = factory(isNode ? require('./sm2.js') : root.SM2, isNode ? require('./parse.js') : root.Parse);
  if (isNode) module.exports = mod;
  else root.Data = mod;
})(typeof self !== 'undefined' ? self : this, function (SM2, Parse) {
  'use strict';

  var FORMAT = 'flash-cards';
  var VERSION = 1;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var SCHED_FIELDS = ['ef', 'n', 'interval', 'due', 'reps', 'lapses', 'last'];
  var MATURE_DAYS = 21;

  var counter = 0;
  function uid() {
    counter = (counter + 1) % 1679616;
    return Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function newCard(q, a) {
    return {
      id: uid(), q: q, a: a,
      ef: SM2.START_EF, n: 0, interval: 0, due: null, reps: 0, lapses: 0, last: null,
      created: Date.now()
    };
  }

  function newDeck(name, description) {
    return { id: uid(), name: name, description: description || '', created: Date.now(), newToday: null, cards: [] };
  }

  function resetProgress(card) {
    card.ef = SM2.START_EF;
    card.n = 0;
    card.interval = 0;
    card.due = null;
    card.reps = 0;
    card.lapses = 0;
    card.last = null;
    return card;
  }

  function shuffle(arr, rng) {
    rng = rng || Math.random;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  // ---------- статистика и очередь ----------

  /** Сколько новых карточек колоды ещё можно взять сегодня. */
  function newLeft(deck, todayStr, newPerDay) {
    var used = deck.newToday && deck.newToday.date === todayStr ? deck.newToday.count : 0;
    return Math.max(0, newPerDay - used);
  }

  function deckStats(deck, todayStr, newPerDay) {
    var s = { total: deck.cards.length, due: 0, fresh: 0, learning: 0, mature: 0, newAvail: 0, nextDue: null };
    deck.cards.forEach(function (c) {
      if (!c.due) {
        s.fresh++;
        return;
      }
      if (c.due <= todayStr) s.due++;
      else if (!s.nextDue || c.due < s.nextDue) s.nextDue = c.due;
      if (c.interval >= MATURE_DAYS) s.mature++;
      else s.learning++;
    });
    s.newAvail = Math.min(s.fresh, newLeft(deck, todayStr, newPerDay));
    return s;
  }

  /**
   * Очередь сессии: сначала карточки, которые пора повторить (вперемешку),
   * затем новые в порядке добавления — не больше дневного лимита на колоду.
   * В режиме тренировки — все карточки вперемешку.
   */
  function buildQueue(decks, todayStr, newPerDay, practice, rng) {
    var due = [];
    var fresh = [];
    decks.forEach(function (deck) {
      if (practice) {
        deck.cards.forEach(function (c) { due.push({ d: deck.id, c: c.id }); });
        return;
      }
      var left = newLeft(deck, todayStr, newPerDay);
      deck.cards.forEach(function (c) {
        if (SM2.isDue(c, todayStr)) due.push({ d: deck.id, c: c.id });
        else if (SM2.isNew(c) && left > 0) {
          fresh.push({ d: deck.id, c: c.id });
          left--;
        }
      });
    });
    return shuffle(due, rng).concat(fresh);
  }

  /** Ближайшая дата повторения после сегодняшней и сколько карточек на неё. */
  function nextDue(decks, todayStr) {
    var date = null;
    var count = 0;
    decks.forEach(function (deck) {
      deck.cards.forEach(function (c) {
        if (!c.due || c.due <= todayStr) return;
        if (!date || c.due < date) {
          date = c.due;
          count = 1;
        } else if (c.due === date) count++;
      });
    });
    return date ? { date: date, count: count } : null;
  }

  /** Сколько дней подряд были повторения (сегодняшний день может ещё быть пустым). */
  function streak(log, todayStr) {
    var d = todayStr;
    if (!(log[d] > 0)) d = SM2.addDays(d, -1);
    var n = 0;
    while (log[d] > 0) {
      n++;
      d = SM2.addDays(d, -1);
    }
    return n;
  }

  // ---------- экспорт ----------

  function exportCard(c, progress) {
    if (!progress) return { q: c.q, a: c.a };
    var out = { id: c.id, q: c.q, a: c.a };
    SCHED_FIELDS.forEach(function (k) { out[k] = c[k]; });
    out.created = c.created;
    return out;
  }

  function buildExport(decks, opts) {
    var progress = !(opts && opts.progress === false);
    return {
      format: FORMAT,
      version: VERSION,
      exported: new Date().toISOString(),
      progress: progress,
      decks: decks.map(function (d) {
        var out = { id: d.id, name: d.name, description: d.description || '', created: d.created };
        if (progress && d.newToday) out.newToday = { date: d.newToday.date, count: d.newToday.count };
        out.cards = d.cards.map(function (c) { return exportCard(c, progress); });
        return out;
      })
    };
  }

  /** Текстовый список «вопрос — ответ» построчно (переносы строк заменяются на « / »). */
  function toText(deck) {
    function flat(s) { return String(s).replace(/\s*\n\s*/g, ' / ').trim(); }
    return deck.cards.map(function (c) { return flat(c.q) + ' — ' + flat(c.a); }).join('\n') + '\n';
  }

  // ---------- импорт ----------

  function str(x) {
    return x == null ? '' : String(x).trim();
  }

  function pick(obj, keys) {
    for (var i = 0; i < keys.length; i++) if (obj[keys[i]] != null) return obj[keys[i]];
    return null;
  }

  function num(x, min, max, def) {
    var v = typeof x === 'number' ? x : parseFloat(x);
    if (!isFinite(v)) return def;
    return Math.min(max, Math.max(min, v));
  }

  var Q_KEYS = ['q', 'question', 'front', 'term', 'вопрос', 'термин'];
  var A_KEYS = ['a', 'answer', 'back', 'definition', 'ответ', 'определение'];

  function looksLikeCard(x) {
    if (Array.isArray(x)) return x.length >= 2 && typeof x[0] !== 'object';
    return !!x && typeof x === 'object' && !Array.isArray(x.cards) && pick(x, Q_KEYS) != null;
  }

  function normalizeCard(raw, keepProgress) {
    if (Array.isArray(raw)) raw = { q: raw[0], a: raw[1] };
    if (!raw || typeof raw !== 'object') return null;
    var q = str(pick(raw, Q_KEYS));
    var a = str(pick(raw, A_KEYS));
    if (!q || !a) return null;
    var card = newCard(q, a);
    if (typeof raw.id === 'string' && raw.id) card.id = raw.id.slice(0, 64);
    if (typeof raw.created === 'number' && isFinite(raw.created)) card.created = raw.created;
    if (keepProgress && typeof raw.due === 'string' && DATE_RE.test(raw.due)) {
      card.due = raw.due;
      card.ef = Math.round(num(raw.ef, SM2.MIN_EF, 5, SM2.START_EF) * 100) / 100;
      card.n = Math.round(num(raw.n, 0, 10000, 0));
      card.interval = Math.round(num(raw.interval, 0, 100000, 0));
      card.reps = Math.round(num(raw.reps, 0, 1e7, 0));
      card.lapses = Math.round(num(raw.lapses, 0, 1e7, 0));
      card.last = typeof raw.last === 'string' && DATE_RE.test(raw.last) ? raw.last : null;
    }
    return card;
  }

  function normalizeDeck(raw, keepProgress, fallbackName) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.cards)) return null;
    var deck = newDeck(str(raw.name || raw.title) || fallbackName || 'Без названия', str(raw.description));
    if (typeof raw.id === 'string' && raw.id) deck.id = raw.id.slice(0, 64);
    if (typeof raw.created === 'number' && isFinite(raw.created)) deck.created = raw.created;
    if (keepProgress && raw.newToday && typeof raw.newToday.date === 'string' && DATE_RE.test(raw.newToday.date)) {
      deck.newToday = { date: raw.newToday.date, count: Math.round(num(raw.newToday.count, 0, 1e6, 0)) };
    }
    var seen = {};
    raw.cards.forEach(function (rc) {
      var c = normalizeCard(rc, keepProgress);
      if (!c) return;
      while (seen[c.id]) c.id = uid();
      seen[c.id] = true;
      deck.cards.push(c);
    });
    return deck;
  }

  /**
   * Принимает разобранный JSON в одном из видов:
   *   {decks: [...]} — файл экспорта; [{name, cards}, ...]; {name, cards}; [{q, a}, ...] или [[q, a], ...].
   * Возвращает массив нормализованных колод. Бросает ошибку, если формат не распознан.
   */
  function normalizeImport(data, opts) {
    opts = opts || {};
    var keep = opts.progress !== false;
    var list;
    if (Array.isArray(data)) {
      list = data.length && looksLikeCard(data[0]) ? [{ name: opts.name, cards: data }] : data;
    } else if (data && Array.isArray(data.decks)) list = data.decks;
    else if (data && Array.isArray(data.cards)) list = [data];
    else throw new Error('В файле не найдено колод');

    var decks = [];
    list.forEach(function (raw) {
      var d = normalizeDeck(raw, keep, opts.name);
      if (d) decks.push(d);
    });
    if (!decks.length) throw new Error('В файле не найдено колод');
    return decks;
  }

  /** Импорт текстового файла (.txt/.csv/.tsv): каждая строка — «вопрос — ответ». */
  function deckFromText(text, name) {
    var parsed = Parse.parseList(text, { sep: 'auto' });
    if (!parsed.cards.length) throw new Error('В файле нет строк вида «вопрос — ответ»');
    var deck = newDeck(name || 'Импорт', '');
    parsed.cards.forEach(function (p) { deck.cards.push(newCard(p.q, p.a)); });
    return { deck: deck, errors: parsed.errors };
  }

  return {
    FORMAT: FORMAT,
    VERSION: VERSION,
    SCHED_FIELDS: SCHED_FIELDS,
    MATURE_DAYS: MATURE_DAYS,
    uid: uid,
    newCard: newCard,
    newDeck: newDeck,
    resetProgress: resetProgress,
    shuffle: shuffle,
    newLeft: newLeft,
    deckStats: deckStats,
    buildQueue: buildQueue,
    nextDue: nextDue,
    streak: streak,
    buildExport: buildExport,
    toText: toText,
    normalizeImport: normalizeImport,
    deckFromText: deckFromText
  };
});
