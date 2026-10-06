'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Importer = require('../js/importer.js');

test('Quizlet: табуляция и перенос строки (настройки экспорта по умолчанию)', () => {
  const r = Importer.parseQuizlet('кошка\tcat\nсобака\tdog\n\nдом\thouse\n');
  assert.equal(r.term, 'tab');
  assert.equal(r.card, 'newline');
  assert.deepEqual(r.cards, [{ q: 'кошка', a: 'cat' }, { q: 'собака', a: 'dog' }, { q: 'дом', a: 'house' }]);
  assert.equal(r.errors.length, 0);
});

test('Quizlet: запятая и точка с запятой', () => {
  const r = Importer.parseQuizlet('кошка,cat;собака,dog;дом,house');
  assert.equal(r.term, 'comma');
  assert.equal(r.card, 'semicolon');
  assert.equal(r.cards.length, 3);
  assert.deepEqual(r.cards[2], { q: 'дом', a: 'house' });
});

test('Quizlet: «;» между карточками позволяет многострочные определения', () => {
  const r = Importer.parseQuizlet('Теорема Пифагора\tc² = a² + b²\nc — гипотенуза;Площадь круга\tS = πr²;');
  assert.equal(r.card, 'semicolon');
  assert.equal(r.cards.length, 2);
  assert.equal(r.cards[0].a, 'c² = a² + b²\nc — гипотенуза');
});

test('Quizlet: запятая в определении остаётся в определении', () => {
  const r = Importer.parseQuizlet('go,идти, ехать\nsee,видеть', { term: 'comma', card: 'newline' });
  assert.deepEqual(r.cards[0], { q: 'go', a: 'идти, ехать' });
});

test('Quizlet: свои разделители и строки с ошибками', () => {
  const r = Importer.parseQuizlet('a::1##b::2##без пары##', { term: 'custom', termCustom: '::', card: 'custom', cardCustom: '##' });
  assert.deepEqual(r.cards, [{ q: 'a', a: '1' }, { q: 'b', a: '2' }]);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].text, 'без пары');
});

test('Quizlet: свой разделитель не задан — карточек нет, без падения', () => {
  const r = Importer.parseQuizlet('a\tb', { term: 'custom', termCustom: '' });
  assert.equal(r.cards.length, 0);
});

test('CSV: кавычки, запятые и переносы внутри значения, удвоенные кавычки', () => {
  const text = 'Вопрос,Ответ\r\n"Столица Франции, Европа",Париж\r\n"Цитата","Он сказал ""да""\nи ушёл"\r\n';
  const r = Importer.parseCSV(text);
  assert.equal(r.delimiter, ',');
  assert.equal(r.header, true);
  assert.deepEqual(r.cards, [
    { q: 'Столица Франции, Европа', a: 'Париж' },
    { q: 'Цитата', a: 'Он сказал "да"\nи ушёл' }
  ]);
});

test('CSV: русский Excel сохраняет через точку с запятой', () => {
  const r = Importer.parseCSV('﻿кошка;cat\nсобака;dog, hound\n');
  assert.equal(r.delimiter, ';');
  assert.equal(r.header, false);
  assert.deepEqual(r.cards[1], { q: 'собака', a: 'dog, hound' });
});

test('CSV: табуляция (копирование из таблицы) и лишние колонки идут в пояснение', () => {
  const r = Importer.parseCSV('term\tdefinition\texample\ngo\tидти\tI go home\nsee\tвидеть\t\n');
  assert.equal(r.delimiter, '\t');
  assert.equal(r.header, true);
  assert.deepEqual(r.cards, [{ q: 'go', a: 'идти\n\nI go home' }, { q: 'see', a: 'видеть' }]);
});

test('CSV: строки без ответа попадают в ошибки, пустые пропускаются', () => {
  const r = Importer.parseCSV('a,1\n\nb,\n,2\nc,3', { delimiter: ',' });
  assert.equal(r.cards.length, 2);
  assert.equal(r.errors.length, 2);
});

test('CSV: явный заголовок и обмен колонок', () => {
  const r = Importer.parseCSV('x,y\n1,2', { delimiter: ',', header: true, swap: true });
  assert.deepEqual(r.cards, [{ q: '2', a: '1' }]);
});

test('toCSV → parseCSV даёт исходные данные', () => {
  const rows = [['Вопрос', 'Ответ'], ['a, b', 'строка 1\nстрока 2'], ['кавычки "x"', ' пробел']];
  const back = Importer.parseCSVRows(Importer.toCSV(rows, ','), ',');
  assert.deepEqual(back, rows);
});
