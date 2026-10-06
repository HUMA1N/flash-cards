'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Samples = require('../js/samples.js');
const { normKey } = require('../js/parse.js');

test('три колоды-примера с постоянными id', () => {
  assert.deepEqual(Samples.map((d) => d.id), ['sample-geometry-9', 'sample-irregular-verbs', 'sample-oge-social']);
});

for (const deck of Samples) {
  test(`«${deck.name}»: карточки заполнены и не повторяются`, () => {
    assert.ok(deck.name && deck.description);
    assert.ok(deck.cards.length >= 40, `карточек: ${deck.cards.length}`);
    const seen = new Set();
    for (const [q, a] of deck.cards) {
      assert.ok(typeof q === 'string' && q.trim(), 'пустой вопрос');
      assert.ok(typeof a === 'string' && a.trim(), `пустой ответ у «${q}»`);
      const k = normKey(q);
      assert.ok(!seen.has(k), `повтор: ${q}`);
      seen.add(k);
    }
  });
}

test('неправильные глаголы: ответ начинается с инфинитива и содержит три формы', () => {
  const verbs = Samples.find((d) => d.id === 'sample-irregular-verbs');
  for (const [q, a] of verbs.cards) {
    const inf = q.split('\n')[0];
    const forms = a.split('\n')[0].split(' — ');
    assert.equal(forms[0], inf, q);
    assert.equal(forms.length, 3, a);
  }
});
