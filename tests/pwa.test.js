'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function swAssets() {
  const m = /var ASSETS = (\[[\s\S]*?\]);/.exec(read('sw.js'));
  assert.ok(m, 'в sw.js нет списка ASSETS');
  return JSON.parse(m[1].replace(/'/g, '"'));
}

test('офлайн-кэш содержит все файлы, которые подключает index.html', () => {
  const assets = swAssets();
  const html = read('index.html');
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => './' + m[1]);
  assert.ok(refs.length >= 5);
  refs.forEach((r) => assert.ok(assets.includes(r), r + ' нет в ASSETS в sw.js'));
});

test('все файлы из офлайн-кэша существуют', () => {
  swAssets().forEach((a) => {
    const f = a === './' ? 'index.html' : a.slice(2);
    assert.ok(fs.existsSync(path.join(ROOT, f)), a + ' не найден');
  });
});

test('все скрипты из js/ подключены и закэшированы', () => {
  const assets = swAssets();
  const html = read('index.html');
  fs.readdirSync(path.join(ROOT, 'js')).forEach((f) => {
    assert.ok(html.includes('src="js/' + f + '"'), f + ' не подключён в index.html');
    assert.ok(assets.includes('./js/' + f), f + ' нет в sw.js');
  });
});

test('manifest пригоден для установки', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.ok(m.name && m.short_name);
  assert.equal(m.display, 'standalone');
  assert.ok(m.start_url);
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  m.icons.concat(...(m.shortcuts || []).map((s) => s.icons || [])).forEach((i) => {
    assert.ok(fs.existsSync(path.join(ROOT, i.src)), i.src + ' не найден');
  });
  // Относительные пути — чтобы сайт работал из подпапки на GitHub Pages
  assert.ok(!m.start_url.startsWith('/') && !m.scope.startsWith('/'));
});

test('скрипты подключены в правильном порядке зависимостей', () => {
  const html = read('index.html');
  const order = [...html.matchAll(/src="js\/([^"]+)"/g)].map((m) => m[1]);
  const before = (a, b) => assert.ok(order.indexOf(a) < order.indexOf(b), a + ' должен идти раньше ' + b);
  before('sm2.js', 'data.js');
  before('parse.js', 'data.js');
  before('parse.js', 'quiz.js');
  before('data.js', 'stats.js');
  assert.equal(order[order.length - 1], 'app.js');
});
