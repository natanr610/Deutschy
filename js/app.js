/* Deutschy – a tiny German learning app made with love 💕 */
'use strict';
(() => {
  const CFG = window.DEUTSCHY_CONFIG || {};
  const C = window.DEUTSCHY_CONTENT;
  const STORE_KEY = 'deutschy.v1';
  // days until next review, indexed by box (0 = brand new)
  const INTERVALS = [0, 1, 2, 4, 7, 14, 30];
  const MAX_BOX = INTERVALS.length - 1;
  const XP = { correct: 10, intro: 2, dialogue: 15, diary: 20, talk: 30 };
  const PRAISE = ['Super!', 'Toll!', 'Klasse!', 'Wunderbar!', 'Genau!', 'Sehr gut!', 'Spitze!', 'Stark!', 'Perfekt!', 'Ass! 🎾'];
  const COMFORT = ['Fast!', 'Nicht schlimm!', 'Kein Problem – nochmal!', 'Weiter so!'];

  // ───────────────────────── helpers
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); };
  const fmtDate = (k, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => parseKey(k).toLocaleDateString('de-DE', opts);
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(arr, r = Math.random) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];
  const fill = (s) => String(s).replace(/\{his\}/g, S.hisName).replace(/\{her\}/g, S.herName);

  // ───────────────────────── vocabulary index
  const ITEMS = [];
  const ITEM = {};
  const TOPIC = {};
  C.topics.forEach((t) => {
    TOPIC[t.id] = t;
    t.items.forEach(([de, en, ex, exEn]) => {
      const words = de.split(/\s+/);
      const it = {
        id: `${t.id}:${de}`, topic: t.id, de, en, ex: ex || '', exEn: exEn || '',
        answers: de.split(' / ').map((s) => s.trim()),
        open: de.includes('...'),
        buildable: words.length >= 3 && words.length <= 10 && !de.includes('...') && !de.includes(' / '),
      };
      ITEMS.push(it); ITEM[it.id] = it;
    });
  });

  // ───────────────────────── state
  function defaultState() {
    return {
      v: 1, herName: CFG.herName || 'Schatz', hisName: CFG.hisName || 'Schatz',
      dailyGoal: CFG.dailyGoal || 60, rate: 0.9, newPerLesson: 5,
      xp: 0, cards: {}, days: {}, unlocked: [], created: dateKey(),
    };
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s && s.v) return Object.assign(defaultState(), s); } catch (e) { /* ignore */ }
    return defaultState();
  }
  let S = load();
  // pick up the real names if the app was opened before they were set in config.js
  if (S.herName === 'Schatz' && CFG.herName && CFG.herName !== 'Schatz') S.herName = CFG.herName;
  if (S.hisName === 'Natan' && CFG.hisName) S.hisName = CFG.hisName;
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { toast('⚠️ Speichern fehlgeschlagen'); } }
  function day(k = dateKey()) {
    if (!S.days[k]) S.days[k] = { xp: 0, newWords: [], correct: 0, wrong: 0, lessons: 0, dialogues: [], diary: null, talk: null, goal: false };
    return S.days[k];
  }
  const peekDay = (k = dateKey()) => S.days[k] || { xp: 0, newWords: [], correct: 0, wrong: 0, lessons: 0, dialogues: [], diary: null, talk: null, goal: false };

  function level(xp = S.xp) {
    let i = 0; C.levels.forEach((l, j) => { if (xp >= l.xp) i = j; });
    const cur = C.levels[i], next = C.levels[i + 1];
    return { ...cur, idx: i, next, pct: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1 };
  }
  function streak() {
    let k = dateKey(), n = 0;
    if (!(S.days[k] && S.days[k].xp > 0)) k = addDays(k, -1);
    while (S.days[k] && S.days[k].xp > 0) { n++; k = addDays(k, -1); }
    return n;
  }
  function addXP(n) {
    const before = level().idx;
    S.xp += n; const d = day(); d.xp += n;
    if (!d.goal && d.xp >= S.dailyGoal) { d.goal = true; App.pendingRewards.push('goal'); }
    if (level().idx > before) App.pendingLevelUp = true;
    save(); renderTopbar();
    if (!App.session) flushRewards();
  }
  const dueItems = (topic) => {
    const today = dateKey();
    return ITEMS.filter((i) => (!topic || i.topic === topic) && S.cards[i.id] && S.cards[i.id].due <= today)
      .sort((a, b) => S.cards[a.id].due.localeCompare(S.cards[b.id].due));
  };
  const learnedCount = (topic) => ITEMS.filter((i) => i.topic === topic && S.cards[i.id] && S.cards[i.id].box >= 1).length;

  // ───────────────────────── photos (IndexedDB, stays on device)
  const DB = {
    db: null,
    open() {
      return new Promise((res) => {
        if (!('indexedDB' in window)) return res(null);
        const r = indexedDB.open('deutschy', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => res(null);
      });
    },
    tx(mode, fn) {
      return new Promise((res, rej) => {
        if (!this.db) return res(mode === 'readonly' ? [] : null);
        const t = this.db.transaction('photos', mode); const st = t.objectStore('photos');
        const req = fn(st); t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error);
      });
    },
    all() { return this.tx('readonly', (st) => st.getAll()); },
    put(p) { return this.tx('readwrite', (st) => st.put(p)); },
    del(id) { return this.tx('readwrite', (st) => st.delete(id)); },
    clear() { return this.tx('readwrite', (st) => st.clear()); },
  };
  function fileToDataURL(file, max = 1400) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
      img.src = url;
    });
  }
  function rewardPool() {
    const cfg = (CFG.photos || []).map((p, i) => ({ id: 'cfg:' + i, src: p.src, caption: p.caption || '' }));
    const own = App.photos.filter((p) => p.kind === 'reward').sort((a, b) => a.added - b.added)
      .map((p) => ({ id: p.id, src: p.data, caption: p.caption || '' }));
    return [...cfg, ...own];
  }
  function photoById(id) {
    const r = rewardPool().find((p) => p.id === id); if (r) return r;
    const d = App.photos.find((p) => p.id === id); return d ? { id, src: d.data, caption: d.caption || '' } : null;
  }
  const dayPhotos = (k) => App.photos.filter((p) => p.kind === 'day' && p.date === k).sort((a, b) => a.added - b.added);
  function unlockNext(reason) {
    const got = new Set(S.unlocked.map((u) => u.id));
    const next = rewardPool().find((p) => !got.has(p.id));
    if (!next) return null;
    S.unlocked.push({ id: next.id, date: dateKey(), reason }); save();
    return next;
  }

  // ───────────────────────── speech
  let deVoice = null;
  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const vs = speechSynthesis.getVoices().filter((v) => /^de(-|_|$)/i.test(v.lang));
    deVoice = vs.find((v) => /de-DE/i.test(v.lang) && /(google|anna|helena|katja|petra|marlene|vicki|female)/i.test(v.name))
      || vs.find((v) => /de-DE/i.test(v.lang)) || vs[0] || null;
  }
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  const canSpeak = () => 'speechSynthesis' in window;
  function speak(text, rate = S.rate) {
    if (!canSpeak()) return;
    speechSynthesis.cancel();
    queueSpeak(text, rate);
  }
  function queueSpeak(text, rate = S.rate) {
    if (!canSpeak()) return;
    const u = new SpeechSynthesisUtterance(String(text).replace(/\.\.\.|…/g, ' '));
    u.lang = 'de-DE'; u.rate = rate; if (deVoice) u.voice = deVoice;
    speechSynthesis.speak(u);
  }

  // ───────────────────────── answer checking
  const norm = (s) => String(s).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[.,!?;:„“"'’`´()–—-]/g, ' ').replace(/\s+/g, ' ').trim();
  const stripArticle = (s) => s.replace(/^(der|die|das) /, '');
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function checkTyped(input, item) {
    const a = norm(input); if (!a) return { ok: false };
    for (const ans of item.answers) {
      const t = norm(ans);
      if (a === t) return { ok: true };
      const hasArt = /^(der|die|das) /.test(t);
      if (hasArt && a === stripArticle(t)) return { ok: true, note: `Denk an den Artikel: <b>${esc(ans)}</b>` };
      if (hasArt && /^(der|die|das) /.test(a) && stripArticle(a) === stripArticle(t)) return { ok: true, note: `Fast! Der richtige Artikel ist <b>${esc(ans.split(' ')[0])}</b>.`, article: true };
      const tol = t.length >= 12 ? 2 : t.length >= 5 ? 1 : 0;
      if (tol && (lev(a, t) <= tol || (hasArt && lev(a, stripArticle(t)) <= tol))) return { ok: true, note: `Kleiner Tippfehler – richtig: <b>${esc(ans)}</b>` };
    }
    return { ok: false };
  }

  // ───────────────────────── app shell
  const App = { view: 'today', topic: null, dlg: null, dlgMode: 'read', revealed: new Set(), session: null, photos: [], pendingRewards: [], pendingLevelUp: false, showEn: false };
  const view = $('#view');

  function go(v, opts = {}) {
    Object.assign(App, opts, { view: v });
    if (v !== 'dialogue') { App.revealed = new Set(); }
    render(); window.scrollTo(0, 0);
  }
  function render() {
    document.body.classList.toggle('in-session', !!App.session);
    renderTopbar();
    document.querySelectorAll('.tabbar button').forEach((b) => {
      const v = b.dataset.view; const map = { topic: 'learn', words: 'learn', dialogue: 'talk' };
      b.classList.toggle('on', v === (map[App.view] || App.view));
    });
    if (App.session) return renderSession();
    const fn = { today: viewToday, learn: viewLearn, topic: viewTopic, talk: viewTalk, dialogue: viewDialogue, evening: viewEvening, album: viewAlbum, settings: viewSettings }[App.view] || viewToday;
    view.innerHTML = fn();
  }
  function renderTopbar() {
    const lv = level(); const st = streak();
    $('#topbar').innerHTML = `
      <div class="logo">Deutsch<b>y</b></div><div class="spacer"></div>
      <span class="chip" title="Streak">🔥 ${st}</span>
      <span class="chip" title="${esc(lv.name)}">${lv.emoji} ${S.xp} XP</span>
      <button class="icon-btn" data-act="nav" data-view="settings" aria-label="Einstellungen">⚙️</button>`;
  }

  // ───────────────────────── views: today
  function viewToday() {
    const k = dateKey(); const d = peekDay(); const pct = Math.min(100, Math.round((d.xp / S.dailyGoal) * 100));
    const hr = new Date().getHours();
    const greet = hr < 11 ? 'Guten Morgen' : hr < 18 ? 'Hallo' : 'Guten Abend';
    const r = rng(hashStr(k));
    const wod = pick(ITEMS.filter((i) => !i.open && i.ex), r);
    const tip = C.tips[hashStr(k + 'tip') % C.tips.length];
    const due = dueItems().length; const lv = level();
    const todays = S.unlocked.filter((u) => u.date === k).map((u) => photoById(u.id)).filter(Boolean);
    const plan = [
      { done: d.lessons > 0, label: 'Tageslektion machen', sub: 'Daily lesson · ~5 min', act: 'start-lesson' },
      { done: d.dialogues.length > 0, label: 'Ein Gespräch üben', sub: 'Practise a dialogue', act: 'nav', view: 'talk' },
      { done: !!(d.diary && d.diary.saved), label: 'Tagesrückblick schreiben', sub: 'Write about your day', act: 'nav', view: 'evening' },
      { done: !!(d.talk && d.talk.done), label: `Abendgespräch mit ${S.hisName}`, sub: 'Evening talk – in German!', act: 'nav', view: 'evening' },
    ];
    return `<div class="stack">
      <div class="hello"><div class="kicker">${esc(fmtDate(k))}</div><h1>${greet}, ${esc(S.herName)}! <span class="wiggle">👋</span></h1></div>

      <div class="card pink">
        <div class="row"><div><div class="kicker">Tagesziel · Daily goal</div>
          <div class="goal-num">${d.xp} <span style="font-size:1rem;font-weight:700">/ ${S.dailyGoal} XP</span></div></div>
          <div class="spacer"></div><div style="font-size:2.6rem">${d.goal ? '🏆' : '🎾'}</div></div>
        <div class="bar" style="margin:12px 0 14px"><i style="width:${pct}%"></i></div>
        ${d.goal ? `<div style="font-weight:800">Geschafft! Du bist toll 💕</div>` : `<button class="btn white block" data-act="start-lesson">${d.lessons ? 'Noch eine Lektion' : 'Tageslektion starten'} →</button>`}
        ${due ? `<div class="small" style="margin-top:10px;opacity:.9">🔁 ${due} Wörter zum Wiederholen fällig</div>` : ''}
      </div>

      ${todays.length ? `<div class="card"><div class="card-title"><span class="em">📸</span><h3>Heute freigeschaltet</h3></div>
        <div class="thumbs">${todays.map((p) => `<img src="${esc(p.src)}" alt="" data-act="photo" data-id="${esc(p.id)}">`).join('')}</div></div>` : ''}

      <div class="card"><div class="card-title"><span class="em">🗓️</span><h3>Dein Plan für heute</h3></div>
        <ul class="plan">${plan.map((p) => `<li class="${p.done ? 'done' : ''}" data-act="${p.act}" ${p.view ? `data-view="${p.view}"` : ''}>
          <span class="tick">✓</span><div><div class="label">${esc(p.label)}</div><div class="small muted">${p.sub}</div></div></li>`).join('')}</ul>
      </div>

      <div class="card ball">
        <div class="kicker">Wort des Tages · Word of the day</div>
        <div class="row" style="margin-top:6px"><div class="wod-de">${esc(wod.de)}</div><div class="spacer"></div>${speakBtn(wod.de)}</div>
        <div class="muted">${esc(wod.en)}</div>
        <div class="example" style="margin-top:10px;background:var(--card)">${esc(wod.ex)}<small>${esc(wod.exEn)}</small></div>
      </div>

      <div class="card"><div class="kicker">💡 Tipp des Tages</div><h3 style="margin:6px 0">${esc(tip.title)}</h3><div>${tip.text}</div></div>

      <div class="card soft"><div class="row"><div style="font-size:2rem">${lv.emoji}</div><div style="flex:1">
        <div class="kicker">Level ${lv.idx + 1}</div><h3>${esc(lv.name)}</h3>
        ${lv.next ? `<div class="bar" style="margin-top:8px"><i style="width:${Math.round(lv.pct * 100)}%"></i></div><div class="small muted" style="margin-top:4px">Noch ${lv.next.xp - S.xp} XP bis „${esc(lv.next.name)}“ ${lv.next.emoji}</div>` : '<div class="small muted">Höchstes Level erreicht! 👑</div>'}
      </div></div></div>
    </div>`;
  }
  const speakBtn = (text, big = false) => canSpeak() ? `<button class="speak${big ? ' big' : ''}" data-act="speak" data-text="${esc(text)}" aria-label="Anhören">🔊</button>` : '';

  // ───────────────────────── views: learn
  function viewLearn() {
    const due = dueItems().length;
    return `<div class="stack">
      <h2>Lernen 📚</h2>
      <div class="card ball"><div class="row"><div style="font-size:2rem">🔁</div><div style="flex:1"><h3>Wiederholen</h3>
        <div class="small muted">${due ? `${due} Wörter sind heute fällig` : 'Alles wiederholt – super!'}</div></div>
        <button class="btn small ball" data-act="start-review" ${due ? '' : 'disabled'}>Los</button></div></div>
      <div class="card"><div class="row"><div style="font-size:2rem">🧩</div><div style="flex:1"><h3>Satzbau</h3>
        <div class="small muted">Build sentences word by word</div></div>
        <button class="btn small" data-act="start-build">Los</button></div></div>
      <div class="section-title"><h3>Themen</h3><span class="small muted">Topics</span></div>
      <div class="grid2">${C.topics.map((t) => {
        const n = learnedCount(t.id); const pct = Math.round((n / t.items.length) * 100);
        return `<button class="card topic" data-act="topic" data-id="${t.id}"><span class="em">${t.emoji}</span>
          <span class="name">${esc(t.name)}</span><span class="small muted">${esc(t.desc)}</span><span class="spacer"></span>
          <div class="bar" style="height:8px"><i style="width:${pct}%"></i></div><span class="small muted">${n} / ${t.items.length} gelernt</span></button>`;
      }).join('')}</div></div>`;
  }
  function viewTopic() {
    const t = TOPIC[App.topic]; if (!t) return viewLearn();
    const due = dueItems(t.id).length; const fresh = t.items.length - ITEMS.filter((i) => i.topic === t.id && S.cards[i.id]).length;
    const its = ITEMS.filter((i) => i.topic === t.id);
    return `<div class="stack">
      <button class="btn ghost small" data-act="nav" data-view="learn">← Themen</button>
      <div class="row"><div style="font-size:2.6rem">${t.emoji}</div><div><h2>${esc(t.name)}</h2><div class="muted">${esc(t.desc)}</div></div></div>
      <div class="row"><button class="btn block" data-act="start-topic" data-id="${t.id}" ${due || fresh ? '' : 'disabled'}>Lernen ${fresh ? `(${Math.min(fresh, S.newPerLesson)} neu)` : ''}</button></div>
      <div class="row"><button class="btn ghost block" data-act="start-practice" data-id="${t.id}" ${learnedCount(t.id) >= 4 ? '' : 'disabled'}>🎯 Üben (gelernte Wörter)</button></div>
      <div class="card">${its.map((i) => {
        const c = S.cards[i.id]; const box = c ? c.box : -1;
        return `<div class="word-row">${speakBtn(i.de)}<div class="grow"><div class="de">${esc(i.de)}</div><div class="small muted">${esc(i.en)}</div></div>
          ${box < 0 ? '<span class="small muted">neu</span>' : `<span class="dots">${Array.from({ length: MAX_BOX }, (_, j) => `<i class="${j < box ? 'on' : ''}"></i>`).join('')}</span>`}</div>`;
      }).join('')}</div></div>`;
  }

  // ───────────────────────── sessions
  function makeQuestion(item, forceEasy = false) {
    const c = S.cards[item.id]; const box = c ? c.box : 0;
    let types;
    if (forceEasy || box <= 1) types = ['mc_de', 'mc_de', 'listen'];
    else if (box === 2) types = ['mc_en', 'listen', 'mc_de'];
    else types = item.open ? ['mc_en'] : ['type', 'mc_en', ...(item.buildable ? ['build', 'build'] : [])];
    if (!canSpeak()) types = types.filter((t) => t !== 'listen');
    if (item.open) types = types.filter((t) => t !== 'type' && t !== 'build');
    if (!types.length) types = ['mc_de'];
    return { type: pick(types), id: item.id };
  }
  function startSession({ topic = null, mode = 'lesson', size = 12 } = {}) {
    const today = dateKey(); let q = [];
    if (mode === 'build') {
      const pool = shuffle(ITEMS.filter((i) => i.buildable)).slice(0, 8);
      q = pool.map((i) => ({ type: 'build', id: i.id }));
    } else if (mode === 'practice') {
      const pool = shuffle(ITEMS.filter((i) => i.topic === topic && S.cards[i.id] && S.cards[i.id].box >= 1)).slice(0, 10);
      q = pool.map((i) => makeQuestion(i));
    } else {
      const due = dueItems(topic).slice(0, mode === 'review' ? 20 : size);
      let fresh = [];
      if (mode !== 'review') {
        let pool = ITEMS.filter((i) => !S.cards[i.id] && (!topic || i.topic === topic));
        if (!topic) {
          // mix topics: round-robin through topics in content order
          const byT = C.topics.map((t) => pool.filter((i) => i.topic === t.id));
          const start = hashStr(today) % byT.length; pool = [];
          for (let r = 0; pool.length < 40 && byT.some((a) => a.length > r); r++) byT.forEach((_, j) => { const a = byT[(start + j) % byT.length]; if (a[r]) pool.push(a[r]); });
        }
        const n = Math.min(S.newPerLesson, Math.max(2, size - due.length));
        fresh = pool.slice(0, n);
      }
      const dueQ = shuffle(due).map((i) => makeQuestion(i));
      fresh.forEach((it, idx) => {
        q.push({ type: 'intro', id: it.id });
        if (idx > 0) q.push({ type: 'mc_de', id: fresh[idx - 1].id, isNew: true });
        if (dueQ.length) q.push(dueQ.shift());
      });
      if (fresh.length) q.push({ type: canSpeak() ? 'listen' : 'mc_de', id: fresh[fresh.length - 1].id, isNew: true });
      q.push(...dueQ);
    }
    if (!q.length) { toast('Nichts zu lernen – super! 🎉'); return; }
    App.session = { q, i: 0, mode, topic, right: 0, wrong: 0, xp: 0, retried: new Set(), answered: null, built: [] };
    render();
  }
  function curEx() { const s = App.session; return s && s.q[s.i]; }

  function renderSession() {
    const s = App.session; const ex = curEx();
    if (!ex) return renderSessionEnd();
    const item = ITEM[ex.id];
    const pct = Math.round((s.i / s.q.length) * 100);
    let body = '';
    if (ex.type === 'intro') {
      body = `<div class="ex-label">✨ Neu · New</div>
        <div class="row"><div class="prompt">${esc(item.de)}</div><div class="spacer"></div>${speakBtn(item.de)}</div>
        <div style="font-size:1.15rem;font-weight:700" class="muted">${esc(item.en)}</div>
        ${item.ex ? `<div class="example">${esc(item.ex)} ${speakBtn(item.ex)}<small>${esc(item.exEn)}</small></div>` : ''}
        <div class="small muted">${TOPIC[item.topic].emoji} ${esc(TOPIC[item.topic].name)}</div>`;
    } else if (ex.type === 'mc_de' || ex.type === 'mc_en' || ex.type === 'listen') {
      if (!ex.opts) {
        const field = ex.type === 'mc_en' ? 'de' : 'en';
        const same = shuffle(ITEMS.filter((i) => i.topic === item.topic && i.id !== item.id && i[field] !== item[field]));
        const other = shuffle(ITEMS.filter((i) => i.topic !== item.topic));
        const ds = [...same, ...other].slice(0, 3);
        ex.opts = shuffle([item, ...ds]).map((i) => ({ id: i.id, text: i[field] }));
      }
      const head = ex.type === 'listen'
        ? `<div class="ex-label">🎧 Was hörst du? · What do you hear?</div><div class="center" style="margin:10px 0">${speakBtn(item.de, true)}
           <div style="margin-top:8px"><button class="btn ghost small" data-act="speak" data-text="${esc(item.de)}" data-rate="0.6">🐢 langsam</button></div></div>`
        : ex.type === 'mc_de'
          ? `<div class="ex-label">Was bedeutet das? · What does it mean?</div><div class="row"><div class="prompt">${esc(item.de)}</div><div class="spacer"></div>${speakBtn(item.de)}</div>`
          : `<div class="ex-label">Wie sagt man auf Deutsch? · Say it in German</div><div class="prompt">${esc(item.en)}</div>`;
      body = `${head}<div class="options">${ex.opts.map((o, j) => `<button class="opt ${optClass(ex, o)}" data-act="mc" data-j="${j}" ${s.answered ? 'disabled' : ''}>${esc(o.text)}</button>`).join('')}</div>`;
    } else if (ex.type === 'type') {
      body = `<div class="ex-label">✍️ Schreib auf Deutsch · Type in German</div><div class="prompt">${esc(item.en)}</div>
        <input class="answer-input" id="answer" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Auf Deutsch…" ${s.answered ? 'disabled' : ''} value="${esc(ex.typed || '')}">
        <div class="umlauts">${['ä', 'ö', 'ü', 'ß'].map((c) => `<button data-act="umlaut" data-c="${c}">${c}</button>`).join('')}</div>
        ${ex.hint ? `<div class="small muted">Tipp: <b>${esc(hintFor(item.answers[0]))}</b></div>` : ''}`;
    } else if (ex.type === 'build') {
      if (!ex.tokens) ex.tokens = shuffle(item.de.split(/\s+/).map((w, j) => ({ w, j })));
      const built = s.built;
      body = `<div class="ex-label">🧩 Bau den Satz · Build the sentence</div><div class="prompt" style="font-size:1.3rem">${esc(item.en)}</div>
        <div class="build-area" id="build">${built.map((ti, k) => `<button class="token" data-act="unbuild" data-k="${k}">${esc(ex.tokens[ti].w)}</button>`).join('')}</div>
        <div class="bank">${ex.tokens.map((t, ti) => `<button class="token ${built.includes(ti) ? 'used' : ''}" data-act="build" data-t="${ti}">${esc(t.w)}</button>`).join('')}</div>`;
    }
    let actions = '';
    if (s.answered) actions = feedbackHTML(s.answered, item);
    else if (ex.type === 'intro') actions = `<div class="session-actions"><div class="inner"><button class="btn green" data-act="next">Verstanden →</button></div></div>`;
    else if (ex.type === 'type') actions = `<div class="session-actions"><div class="inner"><button class="btn ghost" data-act="hint">💡</button><button class="btn ghost" data-act="skip">Weiß nicht</button><button class="btn green" data-act="check-type">Prüfen</button></div></div>`;
    else if (ex.type === 'build') actions = `<div class="session-actions"><div class="inner"><button class="btn ghost" data-act="skip">Weiß nicht</button><button class="btn green" data-act="check-build" ${s.built.length ? '' : 'disabled'}>Prüfen</button></div></div>`;
    view.innerHTML = `<div class="session">
      <div class="session-top"><button class="icon-btn" data-act="quit" aria-label="Beenden">✕</button><div class="bar"><i style="width:${pct}%"></i></div>
        <span class="chip">⭐ ${s.xp}</span></div>
      <div class="session-body">${body}</div>${actions}</div>`;
    if (!s.answered && (ex.type === 'intro' || ex.type === 'listen') && !ex.spoken) { ex.spoken = true; setTimeout(() => speak(item.de), 250); }
    if (ex.type === 'type' && !s.answered) { const inp = $('#answer'); if (inp) { inp.focus(); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') act('check-type'); }); inp.addEventListener('input', () => { ex.typed = inp.value; }); } }
  }
  function optClass(ex, o) {
    const s = App.session; if (!s.answered) return '';
    if (o.id === ex.id) return 'right';
    if (s.answered.choice === o.id) return 'wrong';
    return '';
  }
  const hintFor = (w) => w.split(' ').map((p) => p[0] + p.slice(1).replace(/[^\s]/g, '·')).join(' ');
  function feedbackHTML(a, item) {
    const extra = item.ex && !a.ok ? `<div class="small">${esc(item.ex)}</div>` : '';
    return `<div class="feedback ${a.ok ? 'ok' : 'bad'}"><div class="inner">
      <div class="row"><h3>${a.ok ? `✅ ${a.praise}` : `❌ ${a.praise}`}</h3><div class="spacer"></div>${speakBtn(item.de)}</div>
      ${a.note ? `<div>${a.note}</div>` : ''}
      ${!a.ok ? `<div>Richtig: <b>${esc(item.de)}</b> = ${esc(item.en)}</div>${extra}` : `<div><b>${esc(item.de)}</b> = ${esc(item.en)}</div>`}
      <button class="btn ${a.ok ? 'green' : ''} block" data-act="next">Weiter →</button></div></div>`;
  }
  function grade(ok, extra = {}) {
    const s = App.session; const ex = curEx(); const item = ITEM[ex.id]; const today = dateKey(); const d = day();
    let c = S.cards[item.id];
    if (!c) c = S.cards[item.id] = { box: 0, due: today, right: 0, wrong: 0 };
    if (ok) {
      s.right++; c.right++; d.correct++;
      if (!ex.retry) {
        if (c.box === 0) d.newWords.includes(item.id) || d.newWords.push(item.id);
        // only advance if it was due (or new) – practising early doesn't skip intervals
        if (c.due <= today || c.box === 0) { c.box = Math.min(MAX_BOX, c.box + 1); c.due = addDays(today, INTERVALS[c.box]); }
      }
      s.xp += XP.correct; addXP(XP.correct);
    } else {
      s.wrong++; c.wrong++; d.wrong++;
      c.box = Math.min(c.box, 1); c.due = today;
      if (!s.retried.has(item.id)) { s.retried.add(item.id); s.q.push({ type: canSpeak() && Math.random() < 0.4 ? 'listen' : 'mc_de', id: item.id, retry: true }); }
      save();
    }
    s.answered = { ok, praise: ok ? pick(PRAISE) : pick(COMFORT), ...extra };
    if (ok) speak(item.de);
    renderSession();
  }
  function renderSessionEnd() {
    const s = App.session; const total = s.right + s.wrong; const acc = total ? Math.round((s.right / total) * 100) : 100;
    const d = day(); if (!s.counted) { s.counted = true; if (s.mode !== 'build' || total) d.lessons++; save(); }
    const emoji = acc >= 90 ? '🏆' : acc >= 70 ? '🎉' : '💪';
    const msg = acc >= 90 ? 'Wahnsinn! Fast alles richtig!' : acc >= 70 ? 'Super gemacht!' : 'Gut geübt – Übung macht den Meister!';
    view.innerHTML = `<div class="session"><div class="session-body" style="justify-content:center">
      <div class="big-emoji">${emoji}</div><h2 class="center">${msg}</h2>
      <div class="stat-grid"><div class="stat"><b>${s.right}</b><span>richtig</span></div><div class="stat"><b>${acc}%</b><span>Genauigkeit</span></div><div class="stat"><b>+${s.xp}</b><span>XP</span></div></div>
      <div class="card pink"><div class="kicker">Tagesziel</div><div class="bar" style="margin-top:8px"><i style="width:${Math.min(100, Math.round((d.xp / S.dailyGoal) * 100))}%"></i></div>
        <div class="small" style="margin-top:6px">${d.xp} / ${S.dailyGoal} XP ${d.goal ? '· geschafft! 🏆' : ''}</div></div>
      </div><div class="session-actions"><div class="inner"><button class="btn ghost" data-act="end-session">Fertig</button><button class="btn" data-act="again">Weiter lernen</button></div></div></div>`;
    confetti(acc >= 70 ? 30 : 12);
  }
  function endSession() { const again = App.session; App.session = null; render(); flushRewards(); return again; }

  // ───────────────────────── views: dialogues
  function viewTalk() {
    const d = peekDay();
    return `<div class="stack"><h2>Gespräche 💬</h2><div class="muted">Read, listen, then play your role. · Role-play real conversations.</div>
      ${C.dialogues.map((g) => `<button class="card row" style="width:100%;text-align:left" data-act="dialogue" data-id="${g.id}">
        <div style="font-size:2rem">${g.emoji}</div><div style="flex:1"><h3>${esc(fill(g.title))}</h3><div class="small muted">${esc(fill(g.setting))}</div></div>
        ${d.dialogues.includes(g.id) ? '<span class="chip">✅</span>' : '<span class="muted">›</span>'}</button>`).join('')}</div>`;
  }
  function viewDialogue() {
    const g = C.dialogues.find((x) => x.id === App.dlg); if (!g) return viewTalk();
    const play = App.dlgMode === 'play'; const partner = fill(g.partner);
    const done = peekDay().dialogues.includes(g.id);
    return `<div class="stack">
      <button class="btn ghost small" data-act="nav" data-view="talk">← Gespräche</button>
      <div class="row"><div style="font-size:2.4rem">${g.emoji}</div><div><h2>${esc(fill(g.title))}</h2><div class="muted small">${esc(fill(g.setting))}</div></div></div>
      <div class="row wrap"><div class="seg"><button class="${play ? '' : 'on'}" data-act="dlg-mode" data-mode="read">📖 Lesen</button><button class="${play ? 'on' : ''}" data-act="dlg-mode" data-mode="play">🎭 Rolle spielen</button></div>
        <div class="spacer"></div>${canSpeak() ? '<button class="btn ghost small" data-act="dlg-play-all">▶︎ Alles</button>' : ''}</div>
      ${play ? `<div class="card soft small">🎭 You are the pink side. Say your line <b>out loud in German</b>, then tap to check.</div>` : ''}
      <div class="chat">${g.lines.map(([who, de, en], j) => {
        const name = who === 'a' ? partner : 'Du';
        if (play && who === 'b' && !App.revealed.has(j)) {
          return `<div class="bubble b hidden-line" data-act="reveal" data-j="${j}"><div class="who">${esc(name)}</div><div class="en" style="opacity:1">💭 ${esc(en)}</div><div class="small" style="margin-top:4px;color:var(--pink-ink);font-weight:800">Tippen zum Aufdecken</div></div>`;
        }
        return `<div class="bubble ${who}"><div class="row"><div style="flex:1"><div class="who">${esc(name)}</div><div class="de">${esc(de)}</div>${!play || App.showEn ? `<div class="en">${esc(en)}</div>` : ''}</div>${speakBtn(de)}</div></div>`;
      }).join('')}</div>
      <button class="btn ${done ? 'ghost' : 'green'} block" data-act="dlg-done" data-id="${g.id}">${done ? '✅ Heute schon geübt – nochmal?' : `Gespräch geschafft! +${XP.dialogue} XP`}</button></div>`;
  }

  // ───────────────────────── views: evening
  function eveningQuestions(k) {
    const r = rng(hashStr(k + 'eve'));
    return shuffle(C.evening.map((_, i) => i), r).slice(0, 5);
  }
  function viewEvening() {
    const k = dateKey(); const d = peekDay(); const diary = d.diary || {};
    const talk = d.talk || { checked: [], feedback: '', hearts: 0, done: false };
    const qs = eveningQuestions(k);
    const total = d.correct + d.wrong; const acc = total ? Math.round((d.correct / total) * 100) : 0;
    const photos = dayPhotos(k);
    const checkedN = qs.filter((qi) => talk.checked.includes(qi)).length;
    const history = Object.keys(S.days).filter((x) => x !== k && ((S.days[x].diary && S.days[x].diary.text) || (S.days[x].talk && S.days[x].talk.done) || dayPhotos(x).length)).sort().reverse();
    return `<div class="stack">
      <h2>Tagesrückblick 🌙</h2><div class="muted">${esc(fmtDate(k))} · Your daily summary</div>

      <div class="card"><div class="card-title"><span class="em">📊</span><h3>Dein Tag in Zahlen</h3></div>
        <div class="stat-grid"><div class="stat"><b>${d.xp}</b><span>XP heute</span></div><div class="stat"><b>${d.newWords.length}</b><span>neue Wörter</span></div><div class="stat"><b>${total ? acc + '%' : '–'}</b><span>richtig</span></div></div>
        <div class="stat-grid" style="margin-top:10px"><div class="stat"><b>${d.lessons}</b><span>Lektionen</span></div><div class="stat"><b>${d.dialogues.length}</b><span>Gespräche</span></div><div class="stat"><b>🔥 ${streak()}</b><span>Tage Streak</span></div></div>
        ${d.newWords.length ? `<div class="kicker" style="margin:14px 0 6px">Heute gelernt</div><div class="summary-words">${d.newWords.map((id) => ITEM[id] ? `<span>${esc(ITEM[id].de)}</span>` : '').join('')}</div>` : ''}
      </div>

      <div class="card"><div class="card-title"><span class="em">✍️</span><h3>1 · Schreib über deinen Tag</h3></div>
        <div class="small muted" style="margin-bottom:10px">Write 3+ sentences in German. Tap a starter to use it.</div>
        <div class="kicker" style="margin-bottom:6px">Wie fühlst du dich?</div>
        <div class="moods">${C.moods.map((m) => `<button class="mood ${diary.mood === m.de ? 'on' : ''}" data-act="mood" data-m="${m.de}">${m.e} ${m.de}</button>`).join('')}</div>
        <div class="starters" style="margin:12px 0">${C.starters.map((s) => `<button class="starter" data-act="starter" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        <textarea class="diary" id="diary" placeholder="Heute habe ich …">${esc(diary.text || '')}</textarea>
        <div class="row" style="margin-top:10px"><span class="small muted" id="wc">${sentenceCount(diary.text || '')} Sätze</span><div class="spacer"></div>
          <button class="btn small" data-act="save-diary">${d.diary && d.diary.saved ? 'Aktualisieren' : `Speichern +${XP.diary} XP`}</button></div>
      </div>

      <div class="card"><div class="card-title"><span class="em">💕</span><h3>2 · Abendgespräch mit ${esc(S.hisName)}</h3></div>
        <div class="small muted">${esc(S.hisName)} asks, you answer <b>auf Deutsch</b>. He ticks each question you answered. 3 ticks = Geschafft!</div>
        <div class="row" style="margin:8px 0"><div class="spacer"></div><button class="btn ghost small" data-act="toggle-en">${App.showEn ? 'Englisch ausblenden' : 'Englisch zeigen'}</button></div>
        <div>${qs.map((qi) => { const [de, en] = C.evening[qi]; const on = talk.checked.includes(qi);
          return `<div class="q ${on ? 'on' : ''}" data-act="tick" data-q="${qi}"><span class="box">✓</span><div style="flex:1"><div class="de">${esc(de)}</div>${App.showEn ? `<div class="small muted">${esc(en)}</div>` : ''}</div>${speakBtn(de)}</div>`; }).join('')}</div>
        ${diary.text ? `<div class="kicker" style="margin:14px 0 6px">Dein Text – für ${esc(S.hisName)} zum Korrigieren</div><div class="example" style="white-space:pre-wrap">${esc(diary.text)}</div>` : ''}
        <div class="kicker" style="margin:14px 0 6px">Feedback von ${esc(S.hisName)} ✏️</div>
        <textarea class="fb" id="fb" placeholder="Korrekturen, Lob, ein süßer Kommentar…">${esc(talk.feedback || '')}</textarea>
        <div class="row" style="margin-top:10px"><span class="small muted">Wie war's?</span><div class="hearts">${[1, 2, 3].map((n) => `<button class="${talk.hearts >= n ? 'on' : ''}" data-act="heart" data-n="${n}">❤️</button>`).join('')}</div></div>
        <button class="btn green block" style="margin-top:14px" data-act="talk-done" ${checkedN >= 3 ? '' : 'disabled'}>${talk.done ? '✅ Geschafft! (Feedback speichern)' : `Geschafft! 🎉 +${XP.talk} XP (${checkedN}/3)`}</button>
      </div>

      <div class="card"><div class="card-title"><span class="em">📸</span><h3>3 · Foto vom Tag</h3></div>
        <div class="small muted" style="margin-bottom:10px">Add a cute photo of you two from today 💕 (stays on this phone)</div>
        ${photos.length ? `<div class="thumbs" style="margin-bottom:12px">${photos.map((p) => `<img src="${p.data}" alt="" data-act="photo" data-id="${p.id}">`).join('')}</div>` : ''}
        <label class="btn ghost block">📷 Foto hinzufügen<input type="file" accept="image/*" id="day-photo" hidden></label>
      </div>

      ${history.length ? `<div class="section-title"><h3>📖 Tagebuch</h3><span class="small muted">Past days</span></div>${history.map(historyEntry).join('')}` : ''}
    </div>`;
  }
  const sentenceCount = (t) => (t.match(/[^.!?]+[.!?]+/g) || []).length + (/[^.!?\s]\s*$/.test(t) ? 1 : 0);
  function historyEntry(k) {
    const d = S.days[k]; const mood = d.diary && C.moods.find((m) => m.de === d.diary.mood);
    const imgs = [...S.unlocked.filter((u) => u.date === k).map((u) => photoById(u.id)).filter(Boolean), ...dayPhotos(k).map((p) => ({ id: p.id, src: p.data }))];
    return `<div class="card entry" style="margin-bottom:12px">
      <div class="row"><b>${esc(fmtDate(k))}</b><div class="spacer"></div>${mood ? `<span class="chip">${mood.e} ${mood.de}</span>` : ''}</div>
      <div class="small muted">${d.xp} XP · ${d.newWords.length} neue Wörter${d.talk && d.talk.done ? ` · 💕 Abendgespräch ${'❤️'.repeat(d.talk.hearts || 0)}` : ''}</div>
      ${d.diary && d.diary.text ? `<div class="text" style="margin-top:8px">${esc(d.diary.text)}</div>` : ''}
      ${d.talk && d.talk.feedback ? `<div class="his-note"><b>${esc(S.hisName)}:</b> ${esc(d.talk.feedback)}</div>` : ''}
      ${imgs.length ? `<div class="thumbs">${imgs.map((p) => `<img src="${esc(p.src)}" alt="" data-act="photo" data-id="${esc(p.id)}">`).join('')}</div>` : ''}</div>`;
  }

  // ───────────────────────── views: album
  function viewAlbum() {
    const pool = rewardPool(); const got = S.unlocked.map((u) => ({ ...u, p: photoById(u.id) })).filter((u) => u.p);
    const locked = pool.length - got.length;
    const days = App.photos.filter((p) => p.kind === 'day').sort((a, b) => b.added - a.added);
    return `<div class="stack"><h2>Unser Album 📸</h2>
      <div class="muted">Every daily goal & evening talk unlocks a new photo of you two.</div>
      ${!pool.length ? `<div class="card soft center"><div style="font-size:2.4rem">💌</div><h3>Noch keine Fotos</h3><div class="small muted">${esc(S.hisName)} adds surprise photos in ⚙️ Settings.</div></div>` : ''}
      ${got.length || locked ? `<div class="section-title"><h3>Belohnungen</h3><span class="small muted">${got.length} / ${pool.length}</span></div>
      <div class="album">${got.slice().reverse().map((u) => `<div class="polaroid" data-act="photo" data-id="${esc(u.id)}"><img src="${esc(u.p.src)}" alt="" loading="lazy">
        <div class="cap">${esc(u.p.caption || '💕')}</div><div class="date">${esc(fmtDate(u.date, { day: 'numeric', month: 'short', year: 'numeric' }))}</div></div>`).join('')}
        ${Array.from({ length: Math.min(locked, 4) }, () => `<div class="polaroid locked"><div class="ph">🔒</div><div class="cap">Überraschung</div></div>`).join('')}</div>
      ${locked > 4 ? `<div class="center small muted">+ ${locked - 4} weitere Fotos warten auf dich 💕</div>` : ''}` : ''}
      ${days.length ? `<div class="section-title"><h3>Fotos vom Tag</h3></div><div class="album">${days.map((p) => `<div class="polaroid" data-act="photo" data-id="${p.id}"><img src="${p.data}" alt="" loading="lazy">
        <div class="cap">${esc(p.caption || '💕')}</div><div class="date">${esc(fmtDate(p.date, { day: 'numeric', month: 'short', year: 'numeric' }))}</div></div>`).join('')}</div>` : ''}
    </div>`;
  }

  // ───────────────────────── views: settings
  function viewSettings() {
    const own = App.photos.filter((p) => p.kind === 'reward').sort((a, b) => a.added - b.added);
    const pool = rewardPool(); const got = new Set(S.unlocked.map((u) => u.id));
    return `<div class="stack"><h2>Einstellungen ⚙️</h2>
      <div class="card stack">
        <div class="field"><label>Ihr Name (her name)</label><input type="text" id="set-her" value="${esc(S.herName)}"></div>
        <div class="field"><label>Dein Name (your name)</label><input type="text" id="set-his" value="${esc(S.hisName)}"></div>
        <div class="field"><label>Tagesziel (daily goal)</label><select id="set-goal">${[30, 60, 100, 150].map((n) => `<option value="${n}" ${S.dailyGoal === n ? 'selected' : ''}>${n} XP ${n === 30 ? '· locker' : n === 60 ? '· normal' : n === 100 ? '· ehrgeizig' : '· Profi'}</option>`).join('')}</select></div>
        <div class="field"><label>Neue Wörter pro Lektion</label><select id="set-new">${[3, 5, 8].map((n) => `<option value="${n}" ${S.newPerLesson === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        ${canSpeak() ? `<div class="field"><label>Sprechtempo (speech speed): <span id="rate-v">${S.rate}</span></label>
          <div class="row"><input type="range" id="set-rate" min="0.5" max="1.2" step="0.1" value="${S.rate}" style="flex:1">${speakBtn('Hallo! Wie geht es dir heute?')}</div></div>` : ''}
        <button class="btn block" data-act="save-settings">Speichern</button>
      </div>

      <div class="card"><div class="card-title"><span class="em">🎁</span><h3>Belohnungsfotos</h3></div>
        <div class="small muted">For ${esc(S.hisName)}: add photos of you two. They unlock one at a time as rewards and stay on this device only.
          <br>${pool.length} Fotos insgesamt · ${pool.filter((p) => !got.has(p.id)).length} noch versteckt 🙈</div>
        <label class="btn ghost block" style="margin-top:12px">➕ Fotos hinzufügen<input type="file" accept="image/*" multiple id="reward-photos" hidden></label>
        ${own.length ? `<button class="btn ghost small" style="margin-top:10px" data-act="toggle-admin">${App.showAdmin ? 'Verstecken 🙈' : 'Fotos anzeigen (Spoiler!)'}</button>` : ''}
        ${App.showAdmin ? `<div class="photo-admin" style="margin-top:12px">${own.map((p) => `<div class="item"><img src="${p.data}" alt=""><button class="del" data-act="del-photo" data-id="${p.id}">✕</button>
          <input type="text" placeholder="Bildunterschrift" value="${esc(p.caption || '')}" data-caption="${p.id}">${got.has(p.id) ? '<div class="small muted">✓ freigeschaltet</div>' : ''}</div>`).join('')}</div>` : ''}
      </div>

      <div class="card stack"><div class="card-title"><span class="em">💾</span><h3>Backup</h3></div>
        <div class="small muted">Progress is saved in this browser. Export a backup to move to another phone.</div>
        <div class="row"><button class="btn ghost small" data-act="export">⬇️ Exportieren</button>
          <label class="btn ghost small">⬆️ Importieren<input type="file" accept="application/json,.json" id="import" hidden></label></div>
        <button class="btn ghost small" style="color:var(--bad)" data-act="reset">Fortschritt zurücksetzen</button>
      </div>
      <div class="center small muted">Mit Liebe gemacht 💕</div></div>`;
  }

  // ───────────────────────── modals, toast, confetti
  function modal(html) {
    $('#modal-root').innerHTML = `<div class="modal-back" data-act="close-modal"><div class="modal" data-stop>${html}</div></div>`;
  }
  function closeModal() { $('#modal-root').innerHTML = ''; }
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
  function confetti(n = 40) {
    const em = ['🎉', '💕', '🎾', '✨', '🥨', '💛', '⭐'];
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span'); s.className = 'confetti'; s.textContent = pick(em);
      s.style.left = Math.random() * 100 + 'vw'; s.style.animationDuration = 2 + Math.random() * 2 + 's'; s.style.animationDelay = Math.random() * 0.6 + 's';
      document.body.appendChild(s); setTimeout(() => s.remove(), 5000);
    }
  }
  function flushRewards() {
    if (App.session || $('#modal-root').innerHTML) return;
    if (App.pendingRewards.length) return showReward(App.pendingRewards.shift());
    if (App.pendingLevelUp) {
      App.pendingLevelUp = false; const lv = level(); confetti(30);
      modal(`<div class="big-emoji">${lv.emoji}</div><h2>Level ${lv.idx + 1}!</h2><p class="center">Du bist jetzt <b>${esc(lv.name)}</b>. ${esc(S.hisName)} ist sooo stolz auf dich! 💕</p><button class="btn block" data-act="close-modal">Weiter</button>`);
    }
  }
  function showReward(reason) {
    const p = unlockNext(reason); confetti(40);
    const title = reason === 'goal' ? 'Tagesziel geschafft! 🏆' : 'Abendgespräch geschafft! 💕';
    let body;
    if (p) body = `<p class="center">Neues Foto freigeschaltet!</p><div class="polaroid big"><img src="${esc(p.src)}" alt=""><div class="cap">${esc(p.caption || '💕')}</div></div>`;
    else {
      const old = S.unlocked.map((u) => photoById(u.id)).filter(Boolean);
      body = old.length
        ? `<p class="center">Alle Fotos sind freigeschaltet – hier ist eins eurer Lieblingsfotos:</p><div class="polaroid big"><img src="${esc(pick(old).src)}" alt=""></div><p class="center small muted">${esc(S.hisName)}, Zeit für neue Fotos! 😉</p>`
        : `<div class="big-emoji">💌</div><p class="center">Ich bin so stolz auf dich!</p><p class="center small muted">${esc(S.hisName)} hasn't added reward photos yet – go remind him 😉</p>`;
    }
    modal(`<h2>${title}</h2>${body}<button class="btn block" style="margin-top:16px" data-act="close-modal">Danke! 💕</button>`);
  }

  // ───────────────────────── actions
  function act(name, el = null) {
    const ds = (el && el.dataset) || {};
    const s = App.session;
    switch (name) {
      case 'nav': if (ds.view === 'evening') App.showEn = false; go(ds.view); break;
      case 'speak': speak(ds.text, ds.rate ? Number(ds.rate) : S.rate); break;
      case 'start-lesson': startSession({ mode: 'lesson' }); break;
      case 'start-review': startSession({ mode: 'review' }); break;
      case 'start-build': startSession({ mode: 'build' }); break;
      case 'start-topic': startSession({ topic: ds.id, mode: 'lesson' }); break;
      case 'start-practice': startSession({ topic: ds.id, mode: 'practice' }); break;
      case 'topic': go('topic', { topic: ds.id }); break;
      case 'quit':
        if (s.right + s.wrong === 0 || confirm('Lektion beenden? Dein Fortschritt bleibt gespeichert.')) { if (canSpeak()) speechSynthesis.cancel(); endSession(); }
        break;
      case 'next': {
        const ex = curEx();
        if (ex && ex.type === 'intro' && !s.answered) {
          const today = dateKey();
          if (!S.cards[ex.id]) S.cards[ex.id] = { box: 0, due: today, right: 0, wrong: 0 };
          s.xp += XP.intro; addXP(XP.intro);
        }
        s.answered = null; s.built = []; s.i++; renderSession(); window.scrollTo(0, 0); break;
      }
      case 'mc': {
        if (s.answered) return; const ex = curEx(); const o = ex.opts[Number(ds.j)];
        const ok = o.id === ex.id || o.text === ITEM[ex.id][ex.type === 'mc_en' ? 'de' : 'en'];
        grade(ok, { choice: o.id }); break;
      }
      case 'umlaut': { const inp = $('#answer'); if (!inp) return; const st = inp.selectionStart ?? inp.value.length; inp.value = inp.value.slice(0, st) + ds.c + inp.value.slice(inp.selectionEnd ?? st); curEx().typed = inp.value; inp.focus(); inp.setSelectionRange(st + 1, st + 1); break; }
      case 'hint': curEx().hint = true; renderSession(); break;
      case 'skip': grade(false); break;
      case 'check-type': {
        if (s.answered) return; const inp = $('#answer'); const ex = curEx();
        const r = checkTyped(inp ? inp.value : '', ITEM[ex.id]);
        if (!r.ok && inp && !inp.value.trim()) { inp.classList.add('shake'); setTimeout(() => inp.classList.remove('shake'), 400); return; }
        grade(r.ok, { note: r.note }); break;
      }
      case 'build': if (!s.answered && !s.built.includes(Number(ds.t))) { s.built.push(Number(ds.t)); renderSession(); } break;
      case 'unbuild': if (!s.answered) { s.built.splice(Number(ds.k), 1); renderSession(); } break;
      case 'check-build': {
        if (s.answered) return; const ex = curEx();
        const said = s.built.map((ti) => ex.tokens[ti].w).join(' ');
        grade(norm(said) === norm(ITEM[ex.id].de)); break;
      }
      case 'again': { const old = endSession(); startSession({ topic: old.topic, mode: old.mode === 'review' ? 'lesson' : old.mode }); break; }
      case 'end-session': endSession(); break;

      case 'dialogue': go('dialogue', { dlg: ds.id, dlgMode: 'read' }); break;
      case 'dlg-mode': App.dlgMode = ds.mode; App.revealed = new Set(); render(); break;
      case 'reveal': { App.revealed.add(Number(ds.j)); const g = C.dialogues.find((x) => x.id === App.dlg); speak(g.lines[Number(ds.j)][1]); render(); break; }
      case 'dlg-play-all': { if (!canSpeak()) return; const g = C.dialogues.find((x) => x.id === App.dlg); speechSynthesis.cancel(); g.lines.forEach((l) => queueSpeak(l[1])); break; }
      case 'dlg-done': {
        const d = day(); if (!d.dialogues.includes(ds.id)) { d.dialogues.push(ds.id); save(); addXP(XP.dialogue); toast(`+${XP.dialogue} XP – Toll gemacht! 🎉`); confetti(20); }
        else { App.dlgMode = 'play'; App.revealed = new Set(); }
        render(); break;
      }

      case 'mood': { const d = day(); d.diary = d.diary || { text: '' }; d.diary.text = $('#diary').value; d.diary.mood = ds.m; save(); render(); break; }
      case 'starter': {
        const ta = $('#diary'); const sText = ds.s; const v = ta.value.replace(/\s*$/, '');
        ta.value = (v ? v + ' ' : '') + sText; ta.focus();
        const pos = ta.value.lastIndexOf('…'); if (pos >= 0) ta.setSelectionRange(pos, pos + 1);
        updateWC(); saveTalkDraft(); break;
      }
      case 'save-diary': {
        const text = $('#diary').value.trim(); if (sentenceCount(text) < 1) { toast('Schreib mindestens einen Satz ✍️'); return; }
        const d = day(); const first = !(d.diary && d.diary.saved);
        d.diary = { ...(d.diary || {}), text, saved: Date.now() }; save();
        if (first) { addXP(XP.diary); toast(`+${XP.diary} XP – Wunderbar geschrieben! ✍️`); } else toast('Gespeichert ✓');
        render(); break;
      }
      case 'toggle-en': saveTalkDraft(); App.showEn = !App.showEn; render(); break;
      case 'tick': {
        if (el && ev && ev.target.closest('.speak')) return;
        saveTalkDraft(); const t = talkState(); const q = Number(ds.q); const i = t.checked.indexOf(q);
        if (i >= 0) t.checked.splice(i, 1); else t.checked.push(q); save(); render(); break;
      }
      case 'heart': { saveTalkDraft(); const t = talkState(); t.hearts = Number(ds.n); save(); render(); break; }
      case 'talk-done': {
        saveTalkDraft(); const t = talkState();
        if (!t.done) { t.done = true; save(); App.pendingRewards.push('talk'); addXP(XP.talk); }
        else toast('Gespeichert ✓');
        render(); flushRewards(); break;
      }
      case 'photo': {
        const p = photoById(ds.id); if (!p) return;
        modal(`<div class="polaroid big"><img src="${esc(p.src)}" alt=""><div class="cap">${esc(p.caption || '💕')}</div></div><button class="btn block" style="margin-top:16px" data-act="close-modal">Schließen</button>`); break;
      }
      case 'close-modal': closeModal(); setTimeout(flushRewards, 200); break;

      case 'save-settings': {
        S.herName = $('#set-her').value.trim() || S.herName; S.hisName = $('#set-his').value.trim() || S.hisName;
        S.dailyGoal = Number($('#set-goal').value); S.newPerLesson = Number($('#set-new').value);
        const r = $('#set-rate'); if (r) S.rate = Number(r.value);
        const d = day(); if (!d.goal && d.xp >= S.dailyGoal) { d.goal = true; App.pendingRewards.push('goal'); }
        save(); toast('Gespeichert ✓'); render(); flushRewards(); break;
      }
      case 'toggle-admin': App.showAdmin = !App.showAdmin; render(); break;
      case 'del-photo': if (confirm('Foto löschen?')) { DB.del(ds.id).then(reloadPhotos); } break;
      case 'export': exportBackup(); break;
      case 'reset':
        if (confirm('Wirklich ALLES zurücksetzen? (Fotos bleiben)') && confirm('Sicher? Das kann man nicht rückgängig machen.')) { S = defaultState(); save(); go('today'); }
        break;
    }
  }
  let ev = null;
  function talkState() { const d = day(); if (!d.talk) d.talk = { checked: [], feedback: '', hearts: 0, done: false }; return d.talk; }
  function saveTalkDraft() {
    const fb = $('#fb'); const ta = $('#diary');
    if (fb) { const t = talkState(); t.feedback = fb.value; }
    if (ta && ta.value.trim()) { const d = day(); d.diary = { ...(d.diary || {}), text: ta.value }; }
    save();
  }
  function updateWC() { const ta = $('#diary'); const wc = $('#wc'); if (ta && wc) wc.textContent = `${sentenceCount(ta.value)} Sätze`; }

  document.addEventListener('click', (e) => {
    const stop = e.target.closest('[data-stop]'); const el = e.target.closest('[data-act]');
    if (!el) return;
    if (stop && el.classList.contains('modal-back')) return; // click inside modal on non-action
    ev = e; e.preventDefault(); act(el.dataset.act, el); ev = null;
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'diary') { updateWC(); const d = day(); if (e.target.value.trim()) { d.diary = { ...(d.diary || {}), text: e.target.value }; save(); } }
    if (e.target.id === 'fb') { talkState().feedback = e.target.value; save(); }
    if (e.target.id === 'set-rate') $('#rate-v').textContent = e.target.value;
    if (e.target.dataset.caption) { const p = App.photos.find((x) => x.id === e.target.dataset.caption); if (p) { p.caption = e.target.value; DB.put(p); } }
  });
  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.id === 'day-photo' && t.files[0]) {
      try { const data = await fileToDataURL(t.files[0]); const k = dateKey(); await DB.put({ id: 'day:' + Date.now(), kind: 'day', date: k, data, caption: '', added: Date.now() }); await reloadPhotos(); toast('Foto gespeichert 💕'); confetti(15); } catch (err) { toast('Foto konnte nicht geladen werden'); }
    }
    if (t.id === 'reward-photos' && t.files.length) {
      let n = 0;
      for (const f of t.files) { try { const data = await fileToDataURL(f); await DB.put({ id: 'rw:' + Date.now() + ':' + n, kind: 'reward', data, caption: '', added: Date.now() + n }); n++; } catch (err) { /* skip */ } }
      await reloadPhotos(); toast(`${n} Foto${n === 1 ? '' : 's'} hinzugefügt 🎁`);
    }
    if (t.id === 'import' && t.files[0]) importBackup(t.files[0]);
  });
  async function reloadPhotos() { App.photos = (await DB.all()) || []; render(); }

  async function exportBackup() {
    const data = { app: 'deutschy', exported: new Date().toISOString(), state: S, photos: App.photos };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `deutschy-backup-${dateKey()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text()); if (data.app !== 'deutschy' || !data.state) throw new Error('bad');
      if (!confirm('Backup laden? Der aktuelle Fortschritt wird ersetzt.')) return;
      S = Object.assign(defaultState(), data.state); save();
      if (Array.isArray(data.photos)) { await DB.clear(); for (const p of data.photos) await DB.put(p); }
      await reloadPhotos(); toast('Backup geladen ✓'); go('today');
    } catch (err) { toast('Ungültige Backup-Datei'); }
  }

  // ───────────────────────── boot
  (async () => {
    render();
    await DB.open(); App.photos = (await DB.all()) || [];
    render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  })();
})();
