'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Quiz = require('../js/quiz.js');
const Data = require('../js/data.js');

function seq(seed) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

function items(pairs) {
  return pairs.map(([q, a]) => ({ d: 'deck', c: Data.newCard(q, a) }));
}

const PAIRS = [['go', 'идти'], ['see', 'видеть'], ['take', 'брать'], ['give', 'давать'], ['make', 'делать'], ['eat', 'есть']];

test('ровно 4 варианта, один верный, без повторов', () => {
  const its = items(PAIRS);
  const qs = Quiz.buildQuiz(its, { rng: seq(7) });
  assert.equal(qs.length, PAIRS.length);
  qs.forEach((q) => {
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    const card = its.find((i) => i.c.id === q.c).c;
    assert.equal(q.options[q.correct], card.a);
    assert.equal(q.options.filter((o) => o === card.a).length, 1);
  });
});

test('количество вопросов ограничено настройкой', () => {
  assert.equal(Quiz.buildQuiz(items(PAIRS), { count: 3 }).length, 3);
});

test('меньше 4 разных ответов — тест недоступен', () => {
  const its = items([['a', '1'], ['b', '2'], ['c', '2'], ['d', '3']]);
  assert.equal(Quiz.canQuiz(its.map((i) => i.c)), false);
  assert.deepEqual(Quiz.buildQuiz(its), []);
  assert.equal(Quiz.canQuiz(items(PAIRS).map((i) => i.c)), true);
});

test('одинаковый ответ у другой карточки не становится «неверным» вариантом', () => {
  const its = items([['a', 'Да'], ['b', 'да '], ['c', '2'], ['d', '3'], ['e', '4']]);
  for (let s = 1; s < 30; s++) {
    Quiz.buildQuiz(its, { rng: seq(s) }).forEach((q) => {
      const low = q.options.map((o) => o.toLowerCase().trim());
      assert.equal(new Set(low).size, 4);
    });
  }
});

test('варианты — без пояснения после пустой строки', () => {
  const its = items([['a', 'ответ\n\nпояснение'], ['b', '2'], ['c', '3'], ['d', '4']]);
  const q = Quiz.buildQuiz(its, { rng: seq(3) }).find((x) => x.c === its[0].c.id);
  assert.equal(q.options[q.correct], 'ответ');
});

test('pool: неверные варианты можно брать из всей колоды', () => {
  const all = items(PAIRS);
  const qs = Quiz.buildQuiz([all[0]], { pool: all.map((i) => i.c) });
  assert.equal(qs.length, 1);
  assert.equal(qs[0].options.length, 4);
});

test('предпочитаются ответы похожей длины', () => {
  const pairs = [['q', 'короткий'], ['x1', 'другой'], ['x2', 'третий'], ['x3', 'четвёрт'],
    ['y1', 'очень длинный ответ, который сразу видно среди коротких вариантов'],
    ['y2', 'ещё один очень длинный ответ, который заметно отличается по длине']];
  const its = items(pairs);
  const target = its[0].c;
  for (let s = 1; s < 20; s++) {
    const o = Quiz.makeOptions(target, Quiz.answerPool(its.map((i) => i.c)), seq(s));
    assert.ok(o.options.every((t) => t.length < 20), o.options.join(' | '));
  }
});
