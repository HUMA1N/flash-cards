/*
 * Интерфейс: главная со списком колод, страница колоды, повторение, настройки.
 * Данные хранятся в localStorage под ключом STORAGE_KEY.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'flashcards.v1';
  var DEFAULT_SETTINGS = { newPerDay: 20 };
  var LOG_DAYS = 400;

  var $top = document.getElementById('topbar');
  var $view = document.getElementById('view');
  var $modal = document.getElementById('modal');
  var $confirm = document.getElementById('confirm');
  var $toast = document.getElementById('toast');
  var $file = document.getElementById('import-file');

  var storageOk = true;
  var state = loadState();
  var session = null;
  var route = { name: 'home' };
  var deckSearch = { id: null, text: '' };
  var keepAdding = true;

  // ================= хранилище =================

  function sampleDecks() {
    return Samples.map(function (s) {
      var deck = Data.newDeck(s.name, s.description);
      deck.id = s.id;
      s.cards.forEach(function (p) { deck.cards.push(Data.newCard(p[0], p[1])); });
      return deck;
    });
  }

  function withDefaults(s) {
    s.version = 1;
    s.settings = Object.assign({}, DEFAULT_SETTINGS, s.settings);
    s.log = s.log && typeof s.log === 'object' ? s.log : {};
    return s;
  }

  function loadState() {
    var raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      storageOk = false;
    }
    if (raw) {
      try {
        var s = JSON.parse(raw);
        if (s && Array.isArray(s.decks)) return pruneLog(withDefaults(s));
      } catch (e) { /* испорченные данные: отложим копию и начнём заново */ }
      try { localStorage.setItem(STORAGE_KEY + '.broken-' + Date.now(), raw); } catch (e) { /* нет места */ }
    }
    var fresh = withDefaults({ decks: sampleDecks() });
    persist(fresh);
    return fresh;
  }

  function pruneLog(s) {
    var cutoff = SM2.addDays(SM2.today(), -LOG_DAYS);
    Object.keys(s.log).forEach(function (d) { if (d < cutoff) delete s.log[d]; });
    return s;
  }

  function persist(s) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      return true;
    } catch (e) {
      storageOk = false;
      toast('Не удалось сохранить: хранилище браузера недоступно или переполнено', 'error');
      return false;
    }
  }

  function save() {
    return persist(state);
  }

  // Изменения из другой вкладки
  window.addEventListener('storage', function (e) {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      var s = JSON.parse(e.newValue);
      if (!s || !Array.isArray(s.decks)) return;
      state = withDefaults(s);
      if (!$modal.open && !$confirm.open) render();
    } catch (err) { /* игнорируем */ }
  });

  // ================= утилиты =================

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  function enc(s) {
    return encodeURIComponent(s);
  }

  function plural(n, one, few, many) {
    var m10 = n % 10;
    var m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function nCards(n) {
    return n + ' ' + plural(n, 'карточка', 'карточки', 'карточек');
  }

  function nDays(n) {
    return n + ' ' + plural(n, 'день', 'дня', 'дней');
  }

  function fmtInterval(days) {
    if (days < 30) return nDays(days);
    if (days < 365) return Math.round(days / 30) + ' мес.';
    return String(Math.round(days / 36.5) / 10).replace('.', ',') + ' г.';
  }

  function fmtDate(s) {
    var p = s.split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }

  function fmtDue(due, t) {
    var d = SM2.diffDays(t, due);
    if (d <= 0) return 'сегодня';
    if (d === 1) return 'завтра';
    if (d === 2) return 'послезавтра';
    return 'через ' + fmtInterval(d);
  }

  function getDeck(id) {
    for (var i = 0; i < state.decks.length; i++) if (state.decks[i].id === id) return state.decks[i];
    return null;
  }

  function getCard(deck, id) {
    if (!deck) return null;
    for (var i = 0; i < deck.cards.length; i++) if (deck.cards[i].id === id) return deck.cards[i];
    return null;
  }

  function fileSafe(name) {
    return String(name).replace(/[\\/:*?"<>|,;\u0000-\u001f]+/g, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'deck';
  }

  function go(hash) {
    if ((location.hash || '#/') === hash) render(true);
    else location.hash = hash;
  }

  var toastTimer = null;
  function toast(msg, kind) {
    // Диалоги лежат в top layer — тост кладём внутрь открытого, иначе его не видно
    var host = $confirm.open ? $confirm : $modal.open ? $modal : document.body;
    if ($toast.parentNode !== host) host.appendChild($toast);
    $toast.textContent = msg;
    $toast.className = 'toast is-shown' + (kind === 'error' ? ' is-error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $toast.className = 'toast'; }, kind === 'error' ? 5000 : 2400);
  }

  // ================= иконки =================

  var ICONS = {
    logo: '<rect x="3" y="7" width="13" height="14" rx="2.5"/><path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h8A2.5 2.5 0 0 1 21 5.5v9a2.5 2.5 0 0 1-2.5 2.5H16"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    more: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
    play: '<path d="M7 4.8v14.4a.8.8 0 0 0 1.2.7l11.5-7.2a.8.8 0 0 0 0-1.4L8.2 4.1A.8.8 0 0 0 7 4.8z"/>',
    shuffle: '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>'
  };

  function icon(name, cls) {
    return '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>';
  }

  // ================= каркас =================

  function setTop(opts) {
    var left = opts.back
      ? '<a class="icon-btn" href="' + opts.back + '" aria-label="' + esc(opts.backLabel || 'Назад') + '">' + icon(opts.backIcon || 'back') + '</a>'
      : '<span class="brand" aria-hidden="true">' + icon('logo') + '</span>';
    $top.innerHTML =
      '<div class="topbar-inner">' + left +
      '<h1 class="top-title">' + esc(opts.title) + '</h1>' +
      '<div class="top-actions">' + (opts.actions || '') + '</div></div>';
    document.title = opts.home ? 'Карточки — интервальные повторения' : opts.title + ' — Карточки';
  }

  function parseRoute() {
    var h = location.hash.replace(/^#\/?/, '');
    var qi = h.indexOf('?');
    var query = qi >= 0 ? h.slice(qi + 1) : '';
    if (qi >= 0) h = h.slice(0, qi);
    var parts = h.split('/').filter(Boolean).map(function (p) {
      try { return decodeURIComponent(p); } catch (e) { return p; }
    });
    return { name: parts[0] || 'home', id: parts[1] || null, practice: /(^|&)practice(&|$)/.test(query) };
  }

  /** @param {boolean} [nav] — переход по ссылке (а не перерисовка после изменения данных) */
  function render(nav) {
    route = parseRoute();
    document.body.dataset.view = route.name;
    if (route.name === 'deck') renderDeck(route.id);
    else if (route.name === 'study') renderStudy(route.id, route.practice, nav);
    else if (route.name === 'settings') renderSettings();
    else renderHome();
  }

  window.addEventListener('hashchange', function () {
    if ($confirm.open) $confirm.close();
    if ($modal.open) $modal.close();
    render(true);
    window.scrollTo(0, 0);
  });

  // ================= главная =================

  function statBox(value, label, kind) {
    return '<div class="stat' + (kind ? ' stat-' + kind : '') + '"><b>' + value + '</b><span>' + label + '</span></div>';
  }

  function deckItem(d, s) {
    var todo = s.due + s.newAvail;
    var learnedPct = s.total ? Math.round((s.total - s.fresh) / s.total * 100) : 0;
    var pills = '';
    if (s.due) pills += '<span class="pill pill-due">повторить: ' + s.due + '</span>';
    if (s.newAvail) pills += '<span class="pill pill-new">новых: ' + s.newAvail + '</span>';
    if (!todo && s.total) pills += '<span class="pill pill-ok">' + icon('check') + 'на сегодня всё</span>';
    return (
      '<article class="deck-item">' +
        '<a class="deck-link" href="#/deck/' + enc(d.id) + '">' +
          '<h3>' + esc(d.name) + '</h3>' +
          '<div class="deck-meta">' + pills + '<span class="deck-count">' + nCards(s.total) + '</span></div>' +
          '<div class="meter" title="Изучено ' + learnedPct + '%"><span style="width:' + learnedPct + '%"></span></div>' +
        '</a>' +
        '<a class="study-btn' + (todo ? '' : ' is-idle') + '" href="#/study/' + enc(d.id) + '" aria-label="Учить «' + esc(d.name) + '»">' +
          icon('play') +
        '</a>' +
      '</article>'
    );
  }

  function renderHome() {
    var t = SM2.today();
    var lim = state.settings.newPerDay;
    var due = 0;
    var fresh = 0;
    var items = state.decks.map(function (d) {
      var s = Data.deckStats(d, t, lim);
      due += s.due;
      fresh += s.newAvail;
      return deckItem(d, s);
    }).join('');
    var answers = state.log[t] || 0;
    var streak = Data.streak(state.log, t);
    var todo = due + fresh;

    setTop({
      title: 'Карточки',
      home: true,
      actions: '<a class="icon-btn" href="#/settings" aria-label="Настройки">' + icon('settings') + '</a>'
    });

    var html = '';
    if (!storageOk) {
      html += '<div class="banner">Браузер не даёт сохранять данные (например, в приватном режиме). ' +
        'Изменения пропадут после закрытия страницы — сохраните их через экспорт.</div>';
    }
    html +=
      '<section class="summary">' +
        '<div class="stats">' +
          statBox(due, 'к повторению', 'due') +
          statBox(fresh, 'новых', 'new') +
          statBox(answers, 'ответов сегодня') +
          statBox(streak, plural(streak, 'день', 'дня', 'дней') + ' подряд') +
        '</div>' +
        (todo
          ? '<a class="btn btn-primary btn-lg btn-block" href="#/study/all">' + icon('play') + 'Учить все колоды · ' + todo + '</a>'
          : state.decks.length
            ? '<p class="summary-done">' + icon('check') + 'На сегодня всё повторено. Возвращайтесь завтра!</p>'
            : '') +
      '</section>';

    html += '<div class="section-head"><h2>Колоды</h2>' +
      '<button class="btn btn-sm" data-act="new-deck">' + icon('plus') + 'Новая колода</button></div>';

    if (state.decks.length) {
      html += '<div class="deck-list">' + items + '</div>';
    } else {
      html += '<div class="empty">' + icon('box', 'empty-ico') +
        '<p>Колод пока нет. Создайте новую, импортируйте файл или верните примеры.</p>' +
        '<div class="btn-row">' +
          '<button class="btn btn-primary" data-act="new-deck">' + icon('plus') + 'Новая колода</button>' +
          '<button class="btn" data-act="restore-samples">Вернуть примеры</button>' +
        '</div></div>';
    }

    html +=
      '<div class="btn-row toolbar">' +
        '<button class="btn" data-act="import">' + icon('upload') + 'Импорт</button>' +
        '<button class="btn" data-act="export"' + (state.decks.length ? '' : ' disabled') + '>' + icon('download') + 'Экспорт</button>' +
      '</div>' +
      '<p class="footnote">Всё хранится только в этом браузере. Время от времени сохраняйте резервную копию через «Экспорт».</p>';

    $view.innerHTML = html;
  }

  // ================= колода =================

  function cardStatus(c, t) {
    if (!c.due) return '<span class="st st-new">новая</span>';
    if (c.due <= t) return '<span class="st st-due">повторить</span>';
    return '<span class="st" title="' + fmtDate(c.due) + '">' + fmtDue(c.due, t) + '</span>';
  }

  function oneLine(s) {
    return String(s).replace(/\s*\n+\s*/g, ' · ');
  }

  function renderCardList(deck) {
    var ul = document.getElementById('card-list');
    if (!ul) return;
    var t = SM2.today();
    var needle = Parse.normKey(deckSearch.text);
    var list = deck.cards.filter(function (c) {
      return !needle || Parse.normKey(c.q + ' ' + c.a).indexOf(needle) !== -1;
    });
    ul.innerHTML = list.length
      ? list.map(function (c) {
          return '<li><button class="card-row" data-act="edit-card" data-deck="' + esc(deck.id) + '" data-id="' + esc(c.id) + '">' +
            '<span class="card-q">' + esc(oneLine(c.q)) + '</span>' +
            '<span class="card-a">' + esc(oneLine(c.a)) + '</span>' +
            cardStatus(c, t) +
          '</button></li>';
        }).join('')
      : '<li class="empty-small">Ничего не найдено</li>';
  }

  function deckNote(s, t, lim) {
    var parts = [];
    if (!s.due && !s.newAvail) {
      if (s.fresh) parts.push('Лимит новых карточек на сегодня исчерпан (' + lim + ' в день).');
      else parts.push('На сегодня всё повторено.');
    }
    if (s.nextDue) parts.push('Ближайшее повторение — ' + fmtDue(s.nextDue, t) + ' (' + fmtDate(s.nextDue) + ').');
    if (s.fresh > s.newAvail && (s.due || s.newAvail)) parts.push('Ещё новых в очереди: ' + (s.fresh - s.newAvail) + '.');
    return parts.join(' ');
  }

  function renderDeck(id) {
    var deck = getDeck(id);
    if (!deck) {
      toast('Колода не найдена');
      location.replace('#/');
      return;
    }
    if (deckSearch.id !== deck.id) deckSearch = { id: deck.id, text: '' };
    var t = SM2.today();
    var lim = state.settings.newPerDay;
    var s = Data.deckStats(deck, t, lim);
    var todo = s.due + s.newAvail;
    var d = esc(deck.id);

    setTop({
      back: '#/',
      title: deck.name,
      actions: '<button class="icon-btn" data-act="deck-menu" data-deck="' + d + '" aria-label="Действия с колодой">' + icon('more') + '</button>'
    });

    var html = '<section class="deck-head">';
    if (deck.description) html += '<p class="deck-desc">' + esc(deck.description) + '</p>';
    html += '<div class="stats">' +
      statBox(s.due, 'к повторению', 'due') +
      statBox(s.newAvail, 'новых сегодня', 'new') +
      statBox(s.learning, 'изучаются') +
      statBox(s.mature, 'выучены') +
    '</div>';
    if (s.total) {
      html += '<div class="btn-row">' +
        '<a class="btn btn-primary btn-lg grow" href="#/study/' + enc(deck.id) + '">' + icon('play') + 'Учить' + (todo ? ' · ' + todo : '') + '</a>' +
        '<a class="btn btn-lg grow" href="#/study/' + enc(deck.id) + '?practice">' + icon('shuffle') + 'Тренировка</a>' +
      '</div>';
      var note = deckNote(s, t, lim);
      if (note) html += '<p class="deck-note">' + esc(note) + '</p>';
    }
    html += '</section>';

    html += '<section class="cards-section">' +
      '<div class="section-head"><h2>Карточки <span class="count">' + s.total + '</span></h2></div>' +
      '<div class="btn-row">' +
        '<button class="btn grow" data-act="add-card" data-deck="' + d + '">' + icon('plus') + 'Карточка</button>' +
        '<button class="btn grow" data-act="bulk-add" data-deck="' + d + '">' + icon('list') + 'Добавить списком</button>' +
      '</div>';
    if (s.total) {
      html += '<label class="search">' + icon('search') +
        '<input type="search" id="card-search" placeholder="Поиск по карточкам" autocomplete="off" value="' + esc(deckSearch.text) + '"></label>' +
        '<ul class="card-list" id="card-list"></ul>';
    } else {
      html += '<div class="empty">' + icon('list', 'empty-ico') +
        '<p>В колоде пока нет карточек. Добавьте по одной или вставьте сразу список строк «термин — определение».</p></div>';
    }
    html += '</section>';

    $view.innerHTML = html;

    if (s.total) {
      renderCardList(deck);
      document.getElementById('card-search').addEventListener('input', function (e) {
        deckSearch.text = e.target.value;
        renderCardList(deck);
      });
    }
  }

  // ================= повторение =================

  function sessionDecks(id) {
    if (id === 'all') return state.decks;
    var d = getDeck(id);
    return d ? [d] : [];
  }

  function startSession(id, practice, key) {
    var decks = sessionDecks(id);
    session = {
      key: key,
      id: id,
      practice: practice,
      queue: Data.buildQueue(decks, SM2.today(), state.settings.newPerDay, practice),
      graded: {},
      history: [],
      stats: { again: 0, hard: 0, easy: 0 },
      done: 0,
      revealed: false
    };
  }

  function renderStudy(id, practice, nav) {
    if (id !== 'all' && !getDeck(id)) {
      toast('Колода не найдена');
      location.replace('#/');
      return;
    }
    // Каждый заход на страницу — свежая очередь; перерисовка после правки карточки сессию сохраняет
    var key = id + (practice ? '?practice' : '');
    if (!session || session.key !== key || nav) startSession(id, practice, key);
    renderStudyView();
  }

  function currentItem() {
    while (session.queue.length) {
      var item = session.queue[0];
      var deck = getDeck(item.d);
      var card = getCard(deck, item.c);
      if (card) return { deck: deck, card: card, key: item.d + '/' + item.c };
      session.queue.shift(); // карточку удалили во время сессии
    }
    return null;
  }

  function studyBack() {
    return session.id === 'all' ? '#/' : '#/deck/' + enc(session.id);
  }

  function studyTitle() {
    if (session.practice) return 'Тренировка';
    if (session.id === 'all') return 'Все колоды';
    var d = getDeck(session.id);
    return d ? d.name : 'Повторение';
  }

  function textSize(s) {
    var len = s.length;
    if (len > 160) return 't-xl';
    if (len > 70) return 't-l';
    if (len > 24) return 't-m';
    return 't-s';
  }

  /** Текст карточки: всё, что после пустой строки, — пояснение мелким шрифтом. */
  function cardText(s, cls) {
    var parts = String(s).split(/\n[ \t]*\n/);
    var main = parts.shift();
    return '<div class="' + cls + ' ' + textSize(main) + '">' + esc(main) + '</div>' +
      (parts.length ? '<div class="fc-note">' + esc(parts.join('\n\n')) + '</div>' : '');
  }

  function renderStudyView() {
    var cur = currentItem();
    var actions =
      '<button class="icon-btn" data-act="undo" aria-label="Отменить последний ответ"' + (session.history.length ? '' : ' disabled') + '>' + icon('undo') + '</button>' +
      (cur ? '<button class="icon-btn" data-act="edit-current" aria-label="Редактировать карточку">' + icon('edit') + '</button>' : '');
    setTop({ back: studyBack(), backIcon: 'close', backLabel: 'Завершить', title: studyTitle(), actions: actions });

    if (!cur) {
      renderDone();
      return;
    }

    var t = SM2.today();
    var card = cur.card;
    var remaining = session.queue.length;
    var pct = Math.round(session.done / (session.done + remaining) * 100);
    var counts = !session.practice && !session.graded[cur.key];
    var label = session.practice ? 'тренировка' : session.graded[cur.key] ? 'ещё раз' : SM2.isNew(card) ? 'новая' : 'повторение';
    var labelCls = session.graded[cur.key] ? 'tag-again' : SM2.isNew(card) && !session.practice ? 'tag-new' : '';

    function gradeBtn(kind, text) {
      var hint = counts ? fmtInterval(SM2.schedule(card, SM2.GRADES[kind], t).interval) : '';
      var keyNum = { again: 1, hard: 2, easy: 3 }[kind];
      return '<button class="btn grade grade-' + kind + '" data-act="grade" data-grade="' + kind + '">' +
        '<span class="grade-label">' + text + '</span>' +
        '<small>' + (hint || '&nbsp;') + '</small><kbd>' + keyNum + '</kbd></button>';
    }

    var html =
      '<div class="study">' +
        '<div class="study-progress">' +
          '<div class="meter"><span style="width:' + pct + '%"></span></div>' +
          '<span class="study-left" title="Осталось карточек">' + remaining + '</span>' +
        '</div>' +
        '<div class="flashcard' + (session.revealed ? ' is-revealed' : '') + '"' + (session.revealed ? '' : ' data-act="reveal"') + '>' +
          '<div class="fc-tags">' +
            '<span class="tag ' + labelCls + '">' + label + '</span>' +
            (session.id === 'all' ? '<span class="tag tag-deck">' + esc(cur.deck.name) + '</span>' : '') +
          '</div>' +
          '<div class="fc-body">' +
            cardText(card.q, 'fc-q') +
            (session.revealed ? '<div class="fc-answer">' + cardText(card.a, 'fc-a') + '</div>' : '') +
          '</div>' +
          (session.revealed ? '' : '<div class="fc-hint">нажмите, чтобы увидеть ответ</div>') +
        '</div>' +
        '<div class="study-actions' + (session.revealed ? ' is-grading' : '') + '">' +
          (session.revealed
            ? gradeBtn('again', 'Не помню') + gradeBtn('hard', 'Трудно') + gradeBtn('easy', 'Легко')
            : '<button class="btn btn-primary btn-xl" data-act="reveal">Показать ответ<kbd>Пробел</kbd></button>') +
        '</div>' +
        (session.practice ? '<p class="study-note">Тренировка не меняет расписание повторений.</p>' : '') +
      '</div>';
    $view.innerHTML = html;
  }

  function renderDone() {
    var t = SM2.today();
    var decks = sessionDecks(session.id);
    var st = session.stats;
    var answered = st.again + st.hard + st.easy;
    var next = Data.nextDue(decks, t);
    var lim = state.settings.newPerDay;
    var waitingNew = 0;
    decks.forEach(function (d) {
      var s = Data.deckStats(d, t, lim);
      waitingNew += s.fresh - s.newAvail;
    });

    var title = answered ? (session.practice ? 'Тренировка завершена' : 'Готово!') : 'Сейчас нечего повторять';
    var html = '<div class="done">' +
      '<div class="done-ico">' + icon(answered ? 'check' : 'box') + '</div>' +
      '<h2>' + title + '</h2>';
    if (answered) {
      html += '<p>Пройдено: ' + nCards(session.done) + '</p>' +
        '<div class="done-stats">' +
          '<span class="pill pill-again">Не помню: ' + st.again + '</span>' +
          '<span class="pill pill-hard">Трудно: ' + st.hard + '</span>' +
          '<span class="pill pill-easy">Легко: ' + st.easy + '</span>' +
        '</div>';
    }
    if (!session.practice) {
      if (next) html += '<p class="muted">Ближайшее повторение — ' + fmtDue(next.date, t) + ': ' + nCards(next.count) + '.</p>';
      if (waitingNew > 0) html += '<p class="muted">Новых карточек ждут своей очереди: ' + waitingNew + ' (по ' + lim + ' в день на колоду).</p>';
    }
    html += '<div class="btn-col">';
    if (session.id !== 'all') {
      html += '<button class="btn btn-primary btn-lg" data-act="practice" data-deck="' + esc(session.id) + '">' + icon('shuffle') +
        (session.practice ? 'Ещё раз' : 'Тренировка: все карточки') + '</button>';
    }
    html += '<a class="btn btn-lg" href="' + studyBack() + '">' + (session.id === 'all' ? 'На главную' : 'К колоде') + '</a>';
    html += '</div></div>';
    $view.innerHTML = html;
  }

  function reveal() {
    if (!session || session.revealed || !currentItem()) return;
    session.revealed = true;
    renderStudyView();
  }

  function bumpNewToday(deck, t) {
    if (!deck.newToday || deck.newToday.date !== t) deck.newToday = { date: t, count: 0 };
    deck.newToday.count++;
  }

  function grade(kind) {
    if (!session || !session.revealed) return;
    var cur = currentItem();
    if (!cur) return;
    var t = SM2.today();
    var card = cur.card;

    session.history.push({
      queue: session.queue.slice(),
      deckId: cur.deck.id,
      cardId: card.id,
      card: JSON.parse(JSON.stringify(card)),
      newToday: cur.deck.newToday ? { date: cur.deck.newToday.date, count: cur.deck.newToday.count } : null,
      stats: Object.assign({}, session.stats),
      graded: !!session.graded[cur.key],
      done: session.done,
      logDay: t,
      log: state.log[t] || 0
    });

    // Расписание меняется только при первом ответе в сессии; повторы после «Не помню» — закрепление
    if (!session.practice && !session.graded[cur.key]) {
      var wasNew = SM2.isNew(card);
      var next = SM2.review(card, SM2.GRADES[kind], t);
      Data.SCHED_FIELDS.forEach(function (k) { card[k] = next[k]; });
      if (wasNew) bumpNewToday(cur.deck, t);
    }
    session.graded[cur.key] = true;
    session.stats[kind]++;
    state.log[t] = (state.log[t] || 0) + 1;

    var item = session.queue.shift();
    if (kind === 'again') session.queue.splice(Math.min(session.queue.length, 3), 0, item);
    else session.done++;
    session.revealed = false;
    save();
    renderStudyView();
  }

  function undo() {
    if (!session || !session.history.length) return;
    var h = session.history.pop();
    var deck = getDeck(h.deckId);
    var card = getCard(deck, h.cardId);
    if (card) Data.SCHED_FIELDS.forEach(function (k) { card[k] = h.card[k]; });
    if (deck) deck.newToday = h.newToday;
    session.queue = h.queue;
    session.stats = h.stats;
    session.done = h.done;
    if (!h.graded) delete session.graded[h.deckId + '/' + h.cardId];
    if (h.log) state.log[h.logDay] = h.log;
    else delete state.log[h.logDay];
    session.revealed = false;
    save();
    renderStudyView();
  }

  document.addEventListener('keydown', function (e) {
    if (route.name !== 'study' || !session || $modal.open || $confirm.open) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault();
      undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyZ' || e.key === 'Backspace') {
      e.preventDefault();
      undo();
    } else if (e.key === 'Escape') {
      location.hash = studyBack();
    } else if (!session.revealed) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        reveal();
      }
    } else if (e.code === 'Digit1' || e.code === 'Numpad1') grade('again');
    else if (e.code === 'Digit2' || e.code === 'Numpad2') grade('hard');
    else if (e.code === 'Digit3' || e.code === 'Numpad3') grade('easy');
    else if (e.key === ' ' || e.key === 'Enter') e.preventDefault();
  });

  // ================= настройки =================

  function renderSettings() {
    setTop({ back: '#/', title: 'Настройки' });
    $view.innerHTML =
      '<section class="panel">' +
        '<h2>Обучение</h2>' +
        '<label class="field"><span class="field-label">Новых карточек в день — на каждую колоду</span>' +
          '<input type="number" id="set-new" min="1" max="999" inputmode="numeric" value="' + state.settings.newPerDay + '"></label>' +
        '<p class="hint">Новые карточки добавляются в повторение постепенно, чтобы через неделю не набралась гора повторений. На тренировку лимит не влияет.</p>' +
      '</section>' +
      '<section class="panel">' +
        '<h2>Данные</h2>' +
        '<p>Колоды и прогресс хранятся только в этом браузере на этом устройстве. Чтобы перенести их на другое устройство или не потерять при очистке браузера, сохраните файл через экспорт.</p>' +
        '<div class="btn-col">' +
          '<button class="btn" data-act="export"' + (state.decks.length ? '' : ' disabled') + '>' + icon('download') + 'Экспорт всех колод</button>' +
          '<button class="btn" data-act="import">' + icon('upload') + 'Импорт из файла</button>' +
          '<button class="btn" data-act="restore-samples">' + icon('box') + 'Вернуть колоды-примеры</button>' +
        '</div>' +
        '<p class="hint">Импорт принимает файлы экспорта (.json), а также текстовые файлы (.txt, .csv), где каждая строка — «вопрос — ответ».</p>' +
        '<p class="hint" id="persist-status"></p>' +
        '<button class="btn btn-danger-ghost" data-act="wipe">' + icon('trash') + 'Удалить все данные</button>' +
      '</section>' +
      '<section class="panel prose">' +
        '<h2>Как работает повторение</h2>' +
        '<p>Расписание строится по алгоритму <b>SM-2</b>. У каждой карточки есть интервал до следующего показа и коэффициент лёгкости (от 1,3, в начале 2,5). Чем легче вспоминается карточка, тем быстрее растут интервалы.</p>' +
        '<ul>' +
          '<li><b class="c-again">Не помню</b> — интервал сбрасывается до 1 дня, лёгкость снижается; карточка ещё раз появится в этой же сессии.</li>' +
          '<li><b class="c-hard">Трудно</b> — вспомнили с усилием: интервал растёт, но лёгкость немного снижается.</li>' +
          '<li><b class="c-easy">Легко</b> — интервал растёт, лёгкость повышается.</li>' +
        '</ul>' +
        '<p>После успешных ответов интервалы такие: 1 день → 6 дней → дальше предыдущий интервал умножается на коэффициент лёгкости. Под каждой кнопкой показано, когда карточка вернётся.</p>' +
        '<p><b>Тренировка</b> — прогон всех карточек колоды вперемешку; на расписание не влияет. Удобно перед контрольной.</p>' +
        '<p class="hide-touch">Клавиши: <kbd>Пробел</kbd> — показать ответ, <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> — оценка, <kbd>Z</kbd> — отменить ответ, <kbd>Esc</kbd> — выйти.</p>' +
      '</section>';

    var input = document.getElementById('set-new');
    input.addEventListener('change', function () {
      var v = Math.round(Number(input.value));
      if (!isFinite(v) || v < 1) v = 1;
      if (v > 999) v = 999;
      input.value = v;
      state.settings.newPerDay = v;
      session = null;
      save();
      toast('Сохранено');
    });

    var ps = document.getElementById('persist-status');
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(function (p) {
        ps.innerHTML = p
          ? icon('check') + ' Браузер не удалит данные автоматически.'
          : 'Браузер может удалить данные сайта при нехватке места. ' +
            '<button class="link-btn" data-act="persist">Попросить сохранить их</button>';
      }).catch(function () {});
    }
  }

  // ================= модальные окна =================

  function openModal(html) {
    $modal.innerHTML = html;
    if (!$modal.open) $modal.showModal();
    $modal.scrollTop = 0;
  }

  function closeModal() {
    if ($modal.open) $modal.close();
  }

  [$modal, $confirm].forEach(function (dlg) {
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) dlg.close();
    });
  });

  function sheetHead(title) {
    return '<div class="sheet-head"><h2>' + esc(title) + '</h2>' +
      '<button type="button" class="icon-btn" data-act="modal-close" aria-label="Закрыть">' + icon('close') + '</button></div>';
  }

  /** Диалог подтверждения. Возвращает Promise со значением нажатой кнопки или null. */
  function ask(opts) {
    return new Promise(function (resolve) {
      var buttons = opts.buttons || [
        { label: 'Отмена', value: null },
        { label: opts.ok || 'OK', value: true, cls: opts.danger ? 'btn-danger' : 'btn-primary' }
      ];
      var result = null;
      $confirm.innerHTML =
        '<div class="sheet">' +
          '<div class="sheet-body confirm-body"><h2>' + esc(opts.title) + '</h2>' +
            (opts.text ? '<p>' + esc(opts.text) + '</p>' : '') + '</div>' +
          '<div class="sheet-foot">' +
            buttons.map(function (b, i) {
              return '<button type="button" class="btn ' + (b.cls || '') + '" data-i="' + i + '">' + esc(b.label) + '</button>';
            }).join('') +
          '</div>' +
        '</div>';
      $confirm.querySelectorAll('[data-i]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          result = buttons[+btn.dataset.i].value;
          $confirm.close();
        });
      });
      $confirm.addEventListener('close', function onClose() {
        $confirm.removeEventListener('close', onClose);
        resolve(result);
      });
      $confirm.showModal();
      var last = $confirm.querySelector('.sheet-foot .btn:last-child');
      if (last) last.focus();
    });
  }

  function submitOnCtrlEnter(form) {
    form.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });
  }

  function menuItem(act, ico, label, attrs, sub, cls) {
    return '<button class="menu-item' + (cls ? ' ' + cls : '') + '" data-act="' + act + '"' + (attrs || '') + '>' +
      icon(ico) + '<span><span class="menu-label">' + esc(label) + '</span>' +
      (sub ? '<span class="menu-sub">' + esc(sub) + '</span>' : '') + '</span></button>';
  }

  // ---------- колода: создание и правка ----------

  function openDeckForm(deck) {
    openModal(
      '<form class="sheet" id="deck-form" novalidate>' +
        sheetHead(deck ? 'Колода' : 'Новая колода') +
        '<div class="sheet-body">' +
          '<label class="field"><span class="field-label">Название</span>' +
            '<input name="name" maxlength="120" autocomplete="off" value="' + esc(deck ? deck.name : '') + '" placeholder="Например: Химия, 8 класс"></label>' +
          '<label class="field"><span class="field-label">Описание <span class="muted">— необязательно</span></span>' +
            '<textarea name="desc" rows="2" maxlength="500">' + esc(deck ? deck.description : '') + '</textarea></label>' +
        '</div>' +
        '<div class="sheet-foot"><button type="button" class="btn" data-act="modal-close">Отмена</button>' +
          '<button type="submit" class="btn btn-primary">' + (deck ? 'Сохранить' : 'Создать') + '</button></div>' +
      '</form>'
    );
    var form = $modal.querySelector('form');
    if (!deck) form.elements.name.focus();
    submitOnCtrlEnter(form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.elements.name.value.trim();
      var desc = form.elements.desc.value.trim();
      if (!name) {
        toast('Введите название колоды');
        form.elements.name.focus();
        return;
      }
      if (deck) {
        deck.name = name;
        deck.description = desc;
        save();
        closeModal();
        render();
        return;
      }
      var d = Data.newDeck(name, desc);
      state.decks.push(d);
      save();
      closeModal();
      go('#/deck/' + enc(d.id));
    });
  }

  function openDeckMenu(deck) {
    var a = ' data-deck="' + esc(deck.id) + '"';
    openModal(
      '<div class="sheet">' + sheetHead(deck.name) +
        '<div class="sheet-body menu">' +
          menuItem('edit-deck', 'edit', 'Название и описание', a) +
          menuItem('export', 'download', 'Экспорт в файл', a) +
          menuItem('reset-deck', 'reset', 'Сбросить прогресс', a, 'Все карточки снова станут новыми') +
          menuItem('delete-deck', 'trash', 'Удалить колоду', a, '', 'is-danger') +
        '</div>' +
      '</div>'
    );
  }

  // ---------- карточка ----------

  function cardInfo(c) {
    var t = SM2.today();
    if (!c.due) return '<p class="hint">Новая карточка — ещё не повторялась.</p>';
    return '<p class="hint">Следующее повторение: ' + fmtDue(c.due, t) + ' (' + fmtDate(c.due) + ') · интервал ' + nDays(c.interval) +
      ' · лёгкость ' + String(c.ef).replace('.', ',') + ' · ответов ' + (c.reps || 0) + ', забываний ' + (c.lapses || 0) + '</p>';
  }

  function openCardForm(deckId, cardId) {
    var deck = getDeck(deckId);
    if (!deck) return;
    var card = cardId ? getCard(deck, cardId) : null;
    openModal(
      '<form class="sheet" id="card-form" novalidate>' +
        sheetHead(card ? 'Карточка' : 'Новая карточка') +
        '<div class="sheet-body">' +
          '<label class="field"><span class="field-label">Вопрос</span>' +
            '<textarea name="q" rows="3">' + esc(card ? card.q : '') + '</textarea></label>' +
          '<label class="field"><span class="field-label">Ответ</span>' +
            '<textarea name="a" rows="4">' + esc(card ? card.a : '') + '</textarea></label>' +
          '<p class="hint">Текст после пустой строки показывается мелким шрифтом — удобно для пояснений.</p>' +
          (card ? cardInfo(card) : '') +
        '</div>' +
        '<div class="sheet-foot">' +
          (card
            ? '<button type="button" class="btn btn-danger-ghost" id="card-del">' + icon('trash') + 'Удалить</button>'
            : '<label class="check"><input type="checkbox" name="more"' + (keepAdding ? ' checked' : '') + '><span>Добавить ещё</span></label>') +
          '<button type="submit" class="btn btn-primary">' + (card ? 'Сохранить' : 'Добавить') + '</button>' +
        '</div>' +
      '</form>'
    );
    var form = $modal.querySelector('form');
    var f = form.elements;
    if (!card) f.q.focus();
    submitOnCtrlEnter(form);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = f.q.value.trim();
      var a = f.a.value.trim();
      if (!q || !a) {
        toast(q ? 'Введите ответ' : 'Введите вопрос');
        (q ? f.a : f.q).focus();
        return;
      }
      if (card) {
        card.q = q;
        card.a = a;
        save();
        closeModal();
        render();
        return;
      }
      deck.cards.push(Data.newCard(q, a));
      keepAdding = f.more.checked;
      save();
      render();
      if (keepAdding) {
        f.q.value = '';
        f.a.value = '';
        f.q.focus();
        toast('Карточка добавлена');
      } else {
        closeModal();
        toast('Карточка добавлена');
      }
    });

    var del = form.querySelector('#card-del');
    if (del) {
      del.addEventListener('click', function () {
        ask({ title: 'Удалить карточку?', text: oneLine(card.q), ok: 'Удалить', danger: true }).then(function (ok) {
          if (!ok) return;
          deck.cards = deck.cards.filter(function (c) { return c.id !== card.id; });
          if (session) {
            session.queue = session.queue.filter(function (i) { return !(i.d === deck.id && i.c === card.id); });
            session.history = [];
            session.revealed = false;
          }
          save();
          closeModal();
          render();
          toast('Карточка удалена');
        });
      });
    }
  }

  // ---------- массовое добавление ----------

  function openBulk(deckId) {
    var deck = getDeck(deckId);
    if (!deck) return;
    var placeholder = 'кошка — cat\nсобака — dog\nТеорема Пифагора — c² = a² + b²';
    openModal(
      '<form class="sheet" id="bulk-form" novalidate>' +
        sheetHead('Добавить списком') +
        '<div class="sheet-body">' +
          '<p class="hint">Каждая строка — одна карточка: <b>термин — определение</b>. Подойдёт тире, табуляция (при копировании из таблицы), «;», «:» или «=». Нумерация и маркеры списка в начале строки убираются.</p>' +
          '<textarea name="text" rows="9" class="bulk-text" placeholder="' + esc(placeholder) + '" spellcheck="false"></textarea>' +
          '<div class="bulk-opts">' +
            '<label class="field-inline"><span>Разделитель</span><select name="sep">' +
              '<option value="auto">Авто</option>' +
              '<option value="dash">Тире</option>' +
              '<option value="tab">Табуляция</option>' +
              '<option value="semicolon">;</option>' +
              '<option value="colon">:</option>' +
              '<option value="equals">=</option>' +
              '<option value="comma">,</option>' +
            '</select></label>' +
            '<label class="check"><input type="checkbox" name="swap"><span>Поменять местами</span></label>' +
            '<label class="check"><input type="checkbox" name="dedupe" checked><span>Пропускать повторы</span></label>' +
          '</div>' +
          '<div class="bulk-preview" id="bulk-preview" aria-live="polite"></div>' +
        '</div>' +
        '<div class="sheet-foot"><button type="button" class="btn" data-act="modal-close">Отмена</button>' +
          '<button type="submit" class="btn btn-primary" id="bulk-submit" disabled>Добавить</button></div>' +
      '</form>'
    );
    var form = $modal.querySelector('form');
    var f = form.elements;
    var preview = form.querySelector('#bulk-preview');
    var submit = form.querySelector('#bulk-submit');
    var pending = [];
    f.text.focus();
    submitOnCtrlEnter(form);

    function update() {
      var p = Parse.parseList(f.text.value, { sep: f.sep.value, swap: f.swap.checked });
      var seen = {};
      if (f.dedupe.checked) deck.cards.forEach(function (c) { seen[Parse.normKey(c.q)] = true; });
      var dups = 0;
      pending = [];
      p.cards.forEach(function (c) {
        var k = Parse.normKey(c.q);
        if (f.dedupe.checked && seen[k]) {
          dups++;
          return;
        }
        seen[k] = true;
        pending.push(c);
      });

      if (!p.cards.length && !p.errors.length) {
        preview.innerHTML = '';
      } else {
        var html = '<div class="bulk-summary"><b>Будет добавлено: ' + pending.length + '</b>';
        if (dups) html += ' · повторов пропущено: ' + dups;
        if (p.errors.length) html += ' · <span class="c-again">не распознано строк: ' + p.errors.length + '</span>';
        html += '</div>';
        if (pending.length) {
          html += '<ul class="bulk-sample">' + pending.slice(0, 4).map(function (c) {
            return '<li><span class="bq">' + esc(c.q) + '</span><span class="ba">' + esc(c.a) + '</span></li>';
          }).join('') + '</ul>';
          if (pending.length > 4) html += '<div class="hint">…и ещё ' + (pending.length - 4) + '</div>';
        }
        if (p.errors.length) {
          html += '<div class="bulk-errors"><div class="hint">Строки без разделителя (не будут добавлены):</div><ul>' +
            p.errors.slice(0, 5).map(function (er) {
              return '<li><span class="ln">' + er.line + '</span>' + esc(er.text) + '</li>';
            }).join('') + '</ul></div>';
        }
        preview.innerHTML = html;
      }
      submit.disabled = !pending.length;
      submit.textContent = pending.length ? 'Добавить ' + nCards(pending.length) : 'Добавить';
    }

    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!pending.length) return;
      pending.forEach(function (c) { deck.cards.push(Data.newCard(c.q, c.a)); });
      session = null;
      save();
      closeModal();
      render();
      toast('Добавлено: ' + nCards(pending.length));
    });
  }

  // ---------- экспорт ----------

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function openExport(deck) {
    var a = deck ? ' data-deck="' + esc(deck.id) + '"' : '';
    openModal(
      '<div class="sheet">' + sheetHead(deck ? 'Экспорт колоды' : 'Экспорт всех колод') +
        '<div class="sheet-body menu">' +
          (deck ? '<p class="hint">«' + esc(deck.name) + '», ' + nCards(deck.cards.length) + '</p>'
                : '<p class="hint">' + state.decks.length + ' ' + plural(state.decks.length, 'колода', 'колоды', 'колод') + ' в одном файле</p>') +
          menuItem('do-export', 'download', 'С прогрессом (.json)', a + ' data-kind="full"', 'Резервная копия: карточки и расписание повторений') +
          menuItem('do-export', 'download', 'Только карточки (.json)', a + ' data-kind="clean"', 'Чтобы поделиться колодой: прогресс не сохраняется') +
          (deck ? menuItem('do-export', 'download', 'Текстовый список (.txt)', a + ' data-kind="text"', 'Строки «вопрос — ответ», можно вставить через «Добавить списком»') : '') +
        '</div>' +
      '</div>'
    );
  }

  function doExport(kind, deckId) {
    var deck = deckId ? getDeck(deckId) : null;
    var decks = deck ? [deck] : state.decks;
    var base = deck ? fileSafe(deck.name) : 'flash-cards-' + SM2.today();
    var name;
    if (kind === 'text' && deck) {
      name = base + '.txt';
      download(name, Data.toText(deck), 'text/plain');
    } else {
      name = base + (kind === 'clean' ? '' : '-backup') + '.json';
      download(name, JSON.stringify(Data.buildExport(decks, { progress: kind !== 'clean' }), null, 2), 'application/json');
    }
    closeModal();
    toast('Сохраняю файл ' + name);
  }

  // ---------- импорт ----------

  function readFile(file) {
    return file.arrayBuffer().then(function (buf) {
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buf);
      } catch (e) {
        // Старые текстовые файлы из Windows бывают в кодировке cp1251
        return new TextDecoder('windows-1251').decode(buf);
      }
    });
  }

  $file.addEventListener('change', function () {
    var file = $file.files && $file.files[0];
    $file.value = '';
    if (!file) return;
    readFile(file).then(function (text) {
      return importText(text, file.name);
    }).catch(function () {
      toast('Не удалось прочитать файл', 'error');
    });
  });

  function importText(text, filename) {
    var base = filename.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim() || 'Импорт';
    var trimmed = text.replace(/^﻿/, '').trim();
    var decks;
    var skipped = 0;
    try {
      if (/\.json$/i.test(filename) || /^[[{]/.test(trimmed)) {
        decks = Data.normalizeImport(JSON.parse(trimmed), { name: base });
      } else {
        var r = Data.deckFromText(trimmed, base);
        decks = [r.deck];
        skipped = r.errors.length;
      }
    } catch (e) {
      toast('Не удалось импортировать: ' + (e instanceof SyntaxError ? 'файл повреждён или это не JSON' : e.message), 'error');
      return Promise.resolve();
    }

    var clashes = decks.filter(function (d) { return getDeck(d.id); });
    var choice = clashes.length
      ? ask({
          title: clashes.length === 1 ? 'Такая колода уже есть' : 'Такие колоды уже есть',
          text: (clashes.length === 1 ? '«' + clashes[0].name + '»' : clashes.map(function (d) { return '«' + d.name + '»'; }).join(', ')) +
            ' — заменить данными из файла (текущий прогресс будет заменён) или добавить как копии?',
          buttons: [
            { label: 'Отмена', value: null },
            { label: 'Как копии', value: 'copy' },
            { label: 'Заменить', value: 'replace', cls: 'btn-primary' }
          ]
        })
      : Promise.resolve('add');

    return choice.then(function (mode) {
      if (!mode) return;
      var cards = 0;
      var replaced = 0;
      decks.forEach(function (d) {
        cards += d.cards.length;
        var idx = state.decks.findIndex(function (x) { return x.id === d.id; });
        if (idx === -1) {
          state.decks.push(d);
        } else if (mode === 'replace') {
          state.decks[idx] = d;
          replaced++;
        } else {
          d.id = Data.uid();
          if (state.decks.some(function (x) { return x.name === d.name; })) d.name += ' (копия)';
          state.decks.push(d);
        }
      });
      session = null;
      save();
      closeModal();
      var msg = decks.length === 1
        ? 'Импортирована колода «' + decks[0].name + '»: ' + nCards(cards)
        : 'Импортировано колод: ' + decks.length + ', ' + nCards(cards);
      if (replaced) msg += ' (заменено: ' + replaced + ')';
      if (skipped) msg += '. Пропущено строк без разделителя: ' + skipped;
      go(decks.length === 1 ? '#/deck/' + enc(decks[0].id) : '#/');
      toast(msg);
    });
  }

  // ================= действия =================

  function deckFrom(el) {
    return getDeck(el.dataset.deck);
  }

  var actions = {
    'modal-close': closeModal,
    'new-deck': function () { openDeckForm(null); },
    'edit-deck': function (el) { var d = deckFrom(el); if (d) openDeckForm(d); },
    'deck-menu': function (el) { var d = deckFrom(el); if (d) openDeckMenu(d); },
    'add-card': function (el) { openCardForm(el.dataset.deck); },
    'edit-card': function (el) { openCardForm(el.dataset.deck, el.dataset.id); },
    'bulk-add': function (el) { openBulk(el.dataset.deck); },
    'import': function () { $file.click(); },
    'export': function (el) { openExport(el.dataset.deck ? deckFrom(el) : null); },
    'do-export': function (el) { doExport(el.dataset.kind, el.dataset.deck); },
    'reveal': reveal,
    'grade': function (el) { grade(el.dataset.grade); },
    'undo': undo,
    'edit-current': function () {
      var cur = session && currentItem();
      if (cur) openCardForm(cur.deck.id, cur.card.id);
    },
    'practice': function (el) { go('#/study/' + enc(el.dataset.deck) + '?practice'); },
    'reset-deck': function (el) {
      var deck = deckFrom(el);
      if (!deck) return;
      ask({
        title: 'Сбросить прогресс?',
        text: 'Все карточки колоды «' + deck.name + '» снова станут новыми. Сами карточки останутся.',
        ok: 'Сбросить',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        deck.cards.forEach(Data.resetProgress);
        deck.newToday = null;
        session = null;
        save();
        closeModal();
        render();
        toast('Прогресс сброшен');
      });
    },
    'delete-deck': function (el) {
      var deck = deckFrom(el);
      if (!deck) return;
      ask({
        title: 'Удалить колоду?',
        text: '«' + deck.name + '» и все её карточки (' + deck.cards.length + ') будут удалены. Отменить это нельзя.',
        ok: 'Удалить',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        state.decks = state.decks.filter(function (d) { return d !== deck; });
        session = null;
        save();
        closeModal();
        go('#/');
        toast('Колода удалена');
      });
    },
    'restore-samples': function () {
      var added = 0;
      sampleDecks().forEach(function (d) {
        if (!getDeck(d.id)) {
          state.decks.push(d);
          added++;
        }
      });
      if (!added) {
        toast('Все колоды-примеры уже на месте');
        return;
      }
      save();
      render();
      toast('Возвращено колод: ' + added);
    },
    'wipe': function () {
      ask({
        title: 'Удалить все данные?',
        text: 'Будут удалены все колоды, карточки и прогресс в этом браузере. Сначала стоит сделать экспорт.',
        ok: 'Удалить всё',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        state = withDefaults({ decks: [], settings: state.settings });
        session = null;
        save();
        go('#/');
        toast('Данные удалены');
      });
    },
    'persist': function () {
      navigator.storage.persist().then(function (granted) {
        toast(granted ? 'Готово: браузер сохранит данные' : 'Браузер отказал — делайте резервные копии через экспорт');
        if (route.name === 'settings') renderSettings();
      });
    }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var fn = actions[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  });

  // ================= запуск =================

  render(true);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* офлайн-режим не обязателен */ });
    });
  }
})();
