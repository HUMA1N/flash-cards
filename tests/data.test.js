'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Data = require('../js/data.js');
const SM2 = require('../js/sm2.js');

const T = '2026-10-06';

function deckWith(cards) {
  const d = Data.newDeck('Тест');
  cards.forEach(([q, a, due, interval]) => {
    const c = Data.newCard(q, a);
    if (due) { c.due = due; c.interval = interval || 1; c.n = 1; }
    d.cards.push(c);
  });
  return d;
}

test('статистика колоды', () => {
  const d = deckWith([
    ['a', '1'], ['b', '2'], ['c', '3'],
    ['d', '4', '2026-10-01', 3], ['e', '5', T, 30], ['f', '6', '2026-10-09', 40]
  ]);
  const s = Data.deckStats(d, T, 2);
  assert.equal(s.total, 6);
  assert.equal(s.fresh, 3);
  assert.equal(s.newAvail, 2);
  assert.equal(s.due, 2);
  assert.equal(s.learning, 1);
  assert.equal(s.mature, 2);
  assert.equal(s.nextDue, '2026-10-09');
});

test('дневной лимит новых учитывает уже показанные сегодня', () => {
  const d = deckWith([['a', '1'], ['b', '2'], ['c', '3']]);
  d.newToday = { date: T, count: 2 };
  assert.equal(Data.newLeft(d, T, 3), 1);
  assert.equal(Data.newLeft(d, '2026-10-07', 3), 3);
  assert.equal(Data.newLeft(d, T, 1), 0);
});

test('очередь: сначала к повторению, потом новые в пределах лимита', () => {
  const d = deckWith([['n1', '1'], ['n2', '2'], ['n3', '3'], ['r1', '4', '2026-10-01'], ['r2', '5', T], ['later', '6', '2026-10-10']]);
  const q = Data.buildQueue([d], T, 2, false);
  const names = q.map((i) => d.cards.find((c) => c.id === i.c).q);
  assert.equal(names.length, 4);
  assert.deepEqual(names.slice(0, 2).sort(), ['r1', 'r2']);
  assert.deepEqual(names.slice(2), ['n1', 'n2']);
  assert.ok(q.every((i) => i.d === d.id));
});

test('тренировка: все карточки', () => {
  const d = deckWith([['a', '1'], ['b', '2', '2026-12-01']]);
  assert.equal(Data.buildQueue([d], T, 0, true).length, 2);
});

test('серия дней подряд', () => {
  assert.equal(Data.streak({ '2026-10-04': 3, '2026-10-05': 1, '2026-10-06': 2 }, T), 3);
  assert.equal(Data.streak({ '2026-10-04': 3, '2026-10-05': 1 }, T), 2); // сегодня ещё не занимались
  assert.equal(Data.streak({ '2026-10-03': 3 }, T), 0);
  assert.equal(Data.streak({}, T), 0);
});

test('ближайшее повторение', () => {
  const d = deckWith([['a', '1', '2026-10-08'], ['b', '2', '2026-10-08'], ['c', '3', '2026-10-20'], ['d', '4', T]]);
  assert.deepEqual(Data.nextDue([d], T), { date: '2026-10-08', count: 2 });
  assert.equal(Data.nextDue([deckWith([['a', '1']])], T), null);
});

test('экспорт и импорт с прогрессом сохраняют всё', () => {
  const d = deckWith([['a', '1'], ['b', '2']]);
  Object.assign(d.cards[1], SM2.review(d.cards[1], 5, T));
  d.newToday = { date: T, count: 1 };
  const file = JSON.parse(JSON.stringify(Data.buildExport([d])));
  assert.equal(file.format, 'flash-cards');
  const [back] = Data.normalizeImport(file);
  assert.equal(back.id, d.id);
  assert.equal(back.name, 'Тест');
  assert.deepEqual(back.newToday, d.newToday);
  assert.deepEqual(back.cards.map((c) => [c.id, c.q, c.a, c.due, c.interval, c.n, c.ef, c.reps]),
    d.cards.map((c) => [c.id, c.q, c.a, c.due, c.interval, c.n, c.ef, c.reps]));
});

test('экспорт без прогресса — только вопросы и ответы', () => {
  const d = deckWith([['a', '1', T, 10]]);
  const file = Data.buildExport([d], { progress: false });
  assert.deepEqual(file.decks[0].cards, [{ q: 'a', a: '1' }]);
  const [back] = Data.normalizeImport(file);
  assert.equal(back.cards[0].due, null);
});

test('импорт без прогресса по запросу обнуляет расписание', () => {
  const d = deckWith([['a', '1', T, 10]]);
  const [back] = Data.normalizeImport(Data.buildExport([d]), { progress: false });
  assert.equal(back.cards[0].due, null);
  assert.equal(back.cards[0].n, 0);
});

test('импорт понимает разные формы JSON', () => {
  assert.equal(Data.normalizeImport({ name: 'X', cards: [{ q: '1', a: '2' }] })[0].name, 'X');
  assert.equal(Data.normalizeImport([{ name: 'A', cards: [] }, { name: 'B', cards: [['q', 'a']] }]).length, 2);
  const [fromCards] = Data.normalizeImport([{ front: 'f', back: 'b' }, { question: 'q', answer: 'a' }], { name: 'Файл' });
  assert.equal(fromCards.name, 'Файл');
  assert.deepEqual(fromCards.cards.map((c) => [c.q, c.a]), [['f', 'b'], ['q', 'a']]);
  const [pairs] = Data.normalizeImport([['кошка', 'cat'], ['собака', 'dog']]);
  assert.equal(pairs.cards.length, 2);
});

test('импорт отбрасывает мусор и чинит поля', () => {
  const [d] = Data.normalizeImport({
    decks: [{
      name: '  ',
      cards: [
        { q: 'ok', a: 'ok', id: 'same', due: '2026-10-10', ef: 99, interval: -5, n: 'abc' },
        { q: 'dup', a: 'id', id: 'same' },
        { q: '', a: 'empty' },
        null,
        42,
        { q: 'bad due', a: 'x', due: 'завтра' }
      ]
    }]
  });
  assert.equal(d.name, 'Без названия');
  assert.equal(d.cards.length, 3);
  const [c1, c2, c3] = d.cards;
  assert.equal(c1.ef, 5);
  assert.equal(c1.interval, 0);
  assert.equal(c1.n, 0);
  assert.notEqual(c2.id, 'same');
  assert.equal(c3.due, null);
});

test('импорт: понятная ошибка, если колод нет', () => {
  assert.throws(() => Data.normalizeImport({ foo: 1 }), /не найдено колод/);
  assert.throws(() => Data.normalizeImport([]), /не найдено колод/);
  assert.throws(() => Data.normalizeImport(null), /не найдено колод/);
});

test('текст: экспорт и обратный импорт', () => {
  const d = deckWith([['go\n\nидти', 'go — went — gone'], ['кошка', 'cat']]);
  const text = Data.toText(d);
  assert.equal(text, 'go / идти — go — went — gone\nкошка — cat\n');
  const { deck, errors } = Data.deckFromText(text + 'мусор\n', 'Слова');
  assert.equal(deck.name, 'Слова');
  assert.deepEqual(deck.cards.map((c) => [c.q, c.a]), [['go / идти', 'go — went — gone'], ['кошка', 'cat']]);
  assert.equal(errors.length, 1);
  assert.throws(() => Data.deckFromText('нет разделителей', 'x'), /нет строк/);
});

test('сброс прогресса', () => {
  const c = SM2.review(Data.newCard('a', 'b'), 5, T);
  Data.resetProgress(c);
  assert.deepEqual([c.due, c.n, c.interval, c.ef, c.reps, c.lapses], [null, 0, 0, 2.5, 0, 0]);
});

test('uid уникальны', () => {
  const ids = new Set(Array.from({ length: 5000 }, Data.uid));
  assert.equal(ids.size, 5000);
});
