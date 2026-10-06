'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseList, normKey } = require('../js/parse.js');

const qa = (r) => r.cards.map((c) => [c.q, c.a]);

test('разные тире и табуляция в авто-режиме', () => {
  const r = parseList('кошка — cat\nсобака – dog\nдом - house\nстол\ttable\nокно—window');
  assert.deepEqual(qa(r), [['кошка', 'cat'], ['собака', 'dog'], ['дом', 'house'], ['стол', 'table'], ['окно', 'window']]);
  assert.equal(r.errors.length, 0);
});

test('делит по первому разделителю, остальное — ответ', () => {
  const r = parseList('go (идти) — go — went — gone');
  assert.deepEqual(qa(r), [['go (идти)', 'go — went — gone']]);
});

test('тире важнее двоеточия и знака равенства; минус и дефис в словах не разделяют', () => {
  const r = parseList('Деньги — функции: мера стоимости\nТеорема косинусов — a² = b² + c² − 2bc·cos α\nкто-то: someone');
  assert.deepEqual(qa(r), [
    ['Деньги', 'функции: мера стоимости'],
    ['Теорема косинусов', 'a² = b² + c² − 2bc·cos α'],
    ['кто-то', 'someone']
  ]);
});

test('пустые строки пропускаются, строки без разделителя — в ошибки с номером', () => {
  const r = parseList('\nкошка — cat\n\nпросто текст\n   \nсобака — dog\nтермин —   \n');
  assert.equal(r.cards.length, 2);
  assert.deepEqual(r.errors.map((e) => e.line), [4, 7]);
  assert.equal(r.errors[0].text, 'просто текст');
});

test('маркеры списка и нумерация в начале строки убираются', () => {
  const r = parseList('1. кошка — cat\n2) собака — dog\n• дом — house\n- стол - table\n— окно — window\n* дверь — door');
  assert.deepEqual(r.cards.map((c) => c.q), ['кошка', 'собака', 'дом', 'стол', 'окно', 'дверь']);
});

test('явный разделитель и обмен сторон', () => {
  assert.deepEqual(qa(parseList('a;b — c', { sep: 'semicolon' })), [['a', 'b — c']]);
  assert.deepEqual(qa(parseList('cat — кошка', { swap: true })), [['кошка', 'cat']]);
  assert.deepEqual(qa(parseList('x = 1', { sep: 'equals' })), [['x', '1']]);
});

test('переводы строк Windows и неразрывные пробелы', () => {
  const r = parseList('кошка — cat\r\nсобака — dog\r\n');
  assert.deepEqual(qa(r), [['кошка', 'cat'], ['собака', 'dog']]);
});

test('normKey: регистр, пробелы и ё не важны', () => {
  assert.equal(normKey('  Ёлка   Зелёная '), 'елка зеленая');
});
