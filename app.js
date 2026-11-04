/* Plate — a macro tracker. Data is kept on the device (IndexedDB) and synced to the
   signed-in person's private cloud account (Supabase) when one is configured.
   Friends can view each other's diaries through server functions; those are never stored here. */
(function () {
  'use strict';
  const C = window.Core;
  const { r1, num, MEALS } = C;
  const VERSION = '1.6.0';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => C.ymd(new Date());
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const recoveryInUrl = /type=recovery/.test(location.hash); // password-reset link (checked before the auth client consumes the URL)

  /* ================= Local storage (IndexedDB key/value) ================= */
  const DB = (() => {
    let dbp;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const rq = indexedDB.open('plate', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    }));
    const tx = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('kv', mode); const st = t.objectStore('kv');
        const out = fn(st);
        t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
        t.onerror = () => rej(t.error);
      });
    };
    return {
      get: (k) => tx('readonly', (s) => s.get(k)),
      set: (k, v) => tx('readwrite', (s) => s.put(v, k)),
      setBoth: (k1, v1, k2, v2) => tx('readwrite', (s) => { s.put(v1, k1); s.put(v2, k2); }), // both are saved, or neither is
      del: (k) => tx('readwrite', (s) => s.delete(k)),
      keys: () => tx('readonly', (s) => s.getAllKeys()),
      clear: () => tx('readwrite', (s) => s.clear()),
    };
  })();
  const isDataKey = (k) => typeof k === 'string' && !k.startsWith('_');

  /* ---- Sync bookkeeping: which keys changed locally and when ---- */
  const META_KEY = '_meta';
  const freshMeta = () => ({ owner: null, updated: {}, dirty: [], cursor: null });
  let meta = freshMeta();
  async function loadMeta() { meta = Object.assign(freshMeta(), await DB.get(META_KEY)); }
  const saveMeta = () => DB.set(META_KEY, meta);
  /* Every app write goes through put(): saved locally right away, then queued for upload. */
  async function put(k, v) {
    meta.updated[k] = Math.max(Date.now(), (meta.updated[k] || 0) + 1);
    if (!meta.dirty.includes(k)) meta.dirty.push(k);
    await DB.setBoth(k, v, META_KEY, meta); // together, so a change can't be saved here but never marked for upload
    Sync.schedule();
  }

  /* ================= Cloud (Supabase) ================= */
  const appUrl = () => location.origin + location.pathname;
  function makeRemote() {
    if (window.__PLATE_FAKE_REMOTE) return window.__PLATE_FAKE_REMOTE; // used by automated tests
    const cfg = window.PLATE_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) return null;
    const sb = window.supabase.createClient(cfg.supabaseUrl.trim(), cfg.supabaseAnonKey.trim(), {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const T = 'plate_data';
    const chk = ({ data, error }) => { if (error) throw error; return data; };
    return {
      async getUser() { const d = chk(await sb.auth.getSession()); return d.session ? d.session.user : null; },
      onAuth(cb) { sb.auth.onAuthStateChange((ev, session) => cb(ev, session ? session.user : null)); },
      async signIn(email, password) { return chk(await sb.auth.signInWithPassword({ email, password })).user; },
      async signUp(email, password) {
        const d = chk(await sb.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } }));
        if (d.user && Array.isArray(d.user.identities) && d.user.identities.length === 0) {
          const e = new Error('User already registered'); e.code = 'user_already_exists'; throw e;
        }
        return { user: d.user, hasSession: !!d.session };
      },
      async resetPassword(email) { chk(await sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() })); },
      async setPassword(password) { chk(await sb.auth.updateUser({ password })); },
      async signOut() { await sb.auth.signOut(); },
      async push(rows) { chk(await sb.from(T).upsert(rows, { onConflict: 'user_id,key' })); },
      async pull(since) {
        const out = [];
        for (let from = 0; ; from += 1000) {
          let q = sb.from(T).select('key,value,updated_at,server_at').order('server_at', { ascending: true }).range(from, from + 999);
          if (since) q = q.gt('server_at', since);
          const rows = chk(await q);
          out.push(...rows);
          if (rows.length < 1000) break;
        }
        return out;
      },
      async wipe() {
        const r = await sb.rpc('plate_forget_me');
        if (r.error && r.error.code !== 'PGRST202') throw r.error; // PGRST202: friends SQL not installed yet, nothing to forget
        chk(await sb.from(T).delete().neq('key', ''));
      },
      friends: {
        myUsername: async () => chk(await sb.rpc('plate_my_username')),
        setUsername: async (username) => chk(await sb.rpc('plate_set_username', { p_username: username })),
        list: async () => chk(await sb.rpc('plate_friends')),
        request: async (username) => chk(await sb.rpc('plate_friend_request', { p_username: username })),
        accept: async (id) => chk(await sb.rpc('plate_friend_accept', { p_other: id })),
        remove: async (id) => chk(await sb.rpc('plate_friend_remove', { p_other: id })),
        day: async (id, date) => chk(await sb.rpc('plate_friend_day', { p_friend: id, p_date: date })),
      },
    };
  }
  const remote = makeRemote();
  let user = null; // { id, email } when signed in

  const Sync = {
    timer: null, busy: false, again: false, state: 'idle', lastOk: null, err: null, warned: false,
    schedule(ms = 1200) {
      if (!remote || !user) return;
      clearTimeout(this.timer); this.timer = setTimeout(() => this.run(), ms);
    },
    setState(st, err) {
      this.state = st; this.err = err || null;
      if (st === 'ok') { this.lastOk = Date.now(); this.warned = false; }
      if (st === 'error' && !this.warned) { this.warned = true; toast("Couldn't sync — your changes are saved here and will sync later", 3500); }
      const el = $('#syncline'); if (el) el.innerHTML = syncLabel();
    },
    async run() {
      if (!remote || !user) return;
      if (this.busy) { this.again = true; return; }
      if (!navigator.onLine) return this.setState('offline');
      this.busy = true; this.setState('syncing');
      try {
        // 1) upload local changes
        if (meta.dirty.length) {
          const snap = {}; const rows = [];
          for (const k of [...meta.dirty]) {
            snap[k] = meta.updated[k] || Date.now();
            const v = await DB.get(k);
            rows.push({ user_id: user.id, key: k, value: v === undefined ? null : v, updated_at: snap[k] });
          }
          for (let i = 0; i < rows.length; i += 200) await remote.push(rows.slice(i, i + 200));
          meta.dirty = meta.dirty.filter((k) => !(k in snap) || (meta.updated[k] || 0) > snap[k]); // keep keys edited mid-upload
          await saveMeta();
        }
        // 2) download changes made on other devices (newest edit wins, per day / per list)
        const since = meta.cursor ? new Date(Date.parse(meta.cursor) - 60000).toISOString() : null;
        const rows = await remote.pull(since);
        let changed = false, cursor = meta.cursor;
        for (const r of rows) {
          if (!cursor || Date.parse(r.server_at) > Date.parse(cursor)) cursor = r.server_at;
          if (!isDataKey(r.key)) continue;
          const ts = Number(r.updated_at) || 0;
          if (ts > (meta.updated[r.key] || 0)) {
            if (r.value === null) await DB.del(r.key); else await DB.set(r.key, r.value);
            meta.updated[r.key] = ts;
            meta.dirty = meta.dirty.filter((k) => k !== r.key);
            changed = true;
          }
        }
        meta.cursor = cursor; await saveMeta();
        if (changed) { S.days.clear(); await loadState(); if (!sheets.length && document.body.classList.contains('in-app')) render(); }
        this.setState('ok');
      } catch (e) {
        console.warn('sync failed', e);
        this.setState(navigator.onLine ? 'error' : 'offline', e);
      } finally {
        this.busy = false;
        if (this.again) { this.again = false; this.schedule(300); }
      }
    },
  };
  function syncLabel() {
    const n = meta.dirty.length;
    const t = Sync.lastOk ? new Date(Sync.lastOk).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
    if (Sync.state === 'syncing') return '<span class="spin"></span>Syncing…';
    if (Sync.state === 'offline') return `Offline — ${n ? n + ' change' + (n > 1 ? 's' : '') + ' will' : 'changes will'} sync when you're back online.`;
    if (Sync.state === 'error') return `Last sync failed${n ? ` (${n} change${n > 1 ? 's' : ''} waiting)` : ''}. Tap Sync now to retry.`;
    if (n) return `${n} change${n > 1 ? 's' : ''} waiting to sync.`;
    return t ? `✓ All changes synced · ${t}` : 'Not synced yet.';
  }

  /* ================= State ================= */
  const DEFAULT_SETTINGS = () => ({ name: '', targets: { kcal: 2000, p: 150, c: 200, f: 65 }, usdaKey: '' });
  const S = {
    tab: 'diary',
    date: today(),
    repStart: C.weekStart(today()),
    settings: DEFAULT_SETTINGS(),
    myFoods: [], favs: [], recents: [], meals: [],
    days: new Map(),
  };
  async function loadState() {
    const [settings, myFoods, favs, recents, meals] = await Promise.all(['settings', 'myFoods', 'favs', 'recents', 'meals'].map((k) => DB.get(k)));
    const d = DEFAULT_SETTINGS();
    S.settings = Object.assign(d, settings || {}, { targets: Object.assign(d.targets, (settings && settings.targets) || {}) });
    S.myFoods = myFoods || []; S.favs = favs || []; S.recents = recents || []; S.meals = meals || [];
    await window.PlateLift.load();
  }
  const save = (k) => put(k, S[k]);
  const saveSettings = () => put('settings', S.settings);
  async function getDay(date) {
    if (!S.days.has(date)) S.days.set(date, (await DB.get('day:' + date)) || []);
    return S.days.get(date);
  }
  async function setDay(date, entries) { S.days.set(date, entries); await put('day:' + date, entries); }

  function touchRecent(food) {
    S.recents = [food, ...S.recents.filter((f) => f.key !== food.key)].slice(0, 60);
    save('recents');
  }
  const isFav = (key) => S.favs.some((f) => f.key === key);
  function toggleFav(food) {
    if (isFav(food.key)) S.favs = S.favs.filter((f) => f.key !== food.key);
    else S.favs = [food, ...S.favs];
    save('favs');
    return isFav(food.key);
  }

  /* ================= UI helpers ================= */
  let toastT;
  function toast(msg, ms = 2200) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  function defaultMeal() {
    const h = new Date().getHours();
    return h < 10 ? 'Breakfast' : h < 14 ? 'Lunch' : h < 17 ? 'Snacks' : h < 21 ? 'Dinner' : 'Snacks';
  }
  function prettyDate(d) {
    const t = today();
    if (d === t) return 'Today';
    if (d === C.addDays(t, -1)) return 'Yesterday';
    if (d === C.addDays(t, 1)) return 'Tomorrow';
    return C.parseYmd(d).toLocaleDateString('en-US', { weekday: 'long' });
  }
  const longDate = (d) => C.parseYmd(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const shortDate = (d) => C.parseYmd(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const macroLine = (n) => `<span class="macros-mini"><i class="mp">P</i> ${r1(n.p)} · <i class="mc">C</i> ${r1(n.c)} · <i class="mf">F</i> ${r1(n.f)}</span>`;
  const srcBadge = (f) => f.source === 'usda' ? '<span class="badge">USDA</span>' : f.source === 'custom' ? '<span class="badge">Mine</span>' : '';
  const ICON = {
    left: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    scan: '<svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 9v6M10 9v6M13 9v6M17 9v6"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  };
  const MEAL_ICON = {
    Breakfast: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>',
    Lunch: '<svg viewBox="0 0 24 24"><path d="M3 11h18a9 9 0 0 1-6 8.5V21H9v-1.5A9 9 0 0 1 3 11z"/><path d="M9 7c0-1.5 1-1.5 1-3M14 7c0-1.5 1-1.5 1-3"/></svg>',
    Dinner: '<svg viewBox="0 0 24 24"><path d="M7 3v7a2 2 0 0 0 2 2v9M5 3v5M9 3v5M17 21v-7h-2V7a4 4 0 0 1 3-4v18"/></svg>',
    Snacks: '<svg viewBox="0 0 24 24"><path d="M12 8c-2-2-7-1.500-7 4 0 5 3.500 9 5.500 9 .7 0 1-.5 1.500-.5s.8.5 1.500.5c2 0 5.500-4 5.500-9 0-5.500-5-6-7-4z"/><path d="M12 8c0-2 1-4 3-5"/></svg>',
  };
  const mealTitle = (m) => `<span class="meal-ic m-${m.toLowerCase()}">${MEAL_ICON[m] || ''}</span><h2>${m}</h2>`;

  /* ---- Sheets (stacked, Android back button closes them) ---- */
  const sheets = [];
  let popWaiters = [];
  function openSheet(build, opts = {}) {
    const root = $('#sheet-root');
    const bg = document.createElement('div'); bg.className = 'sheet-bg';
    const el = document.createElement('div'); el.className = 'sheet' + (opts.full ? ' full' : '');
    el.setAttribute('role', 'dialog');
    bg.style.zIndex = 20 + sheets.length * 2; el.style.zIndex = 21 + sheets.length * 2;
    root.append(bg, el);
    const s = { el, bg, onClose: opts.onClose };
    sheets.push(s);
    history.pushState({ depth: sheets.length }, '');
    bg.addEventListener('click', () => closeSheets(1));
    document.body.style.overflow = 'hidden';
    build(el, s);
    return s;
  }
  function removeTop() {
    const s = sheets.pop(); if (!s) return;
    s.el.remove(); s.bg.remove();
    try { s.onClose && s.onClose(); } catch (e) { console.error(e); }
    if (!sheets.length) document.body.style.overflow = '';
  }
  function closeSheets(n = 1) {
    n = Math.min(n, sheets.length);
    if (!n) return Promise.resolve();
    const target = sheets.length - n;
    return new Promise((res) => {
      const w = { target, res, done: false };
      popWaiters.push(w);
      history.go(-n);
      setTimeout(() => { // safety net in case popstate never fires
        if (w.done) return;
        while (sheets.length > target) removeTop();
        flushWaiters();
      }, 600);
    });
  }
  function flushWaiters() {
    popWaiters = popWaiters.filter((w) => { if (sheets.length <= w.target) { w.done = true; w.res(); return false; } return true; });
  }
  window.addEventListener('popstate', (e) => {
    const depth = (e.state && e.state.depth) || 0;
    while (sheets.length > depth) removeTop();
    flushWaiters();
  });
  const closeAll = () => closeSheets(sheets.length);
  const sheetHead = (title, sub) => `<div class="sheet-head"><h3>${esc(title)}${sub ? `<span class="brand">${esc(sub)}</span>` : ''}</h3><button class="iconbtn" data-close aria-label="Close">${ICON.close}</button></div>`;
  function wireClose(el) { $$('[data-close]', el).forEach((b) => b.addEventListener('click', () => closeSheets(1))); }

  /* ================= Tabs ================= */
  $$('.tab').forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.tab;
    if (t === 'add') { openAdd({ meal: S.tab === 'diary' ? defaultMeal() : defaultMeal(), date: S.tab === 'diary' ? S.date : today() }); return; }
    S.tab = t; render();
  }));
  function render() {
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === S.tab));
    window.scrollTo(0, 0);
    ({ diary: renderDiary, foods: renderFoods, lift: window.PlateLift.render, friends: renderFriends, report: renderReport, settings: renderSettings })[S.tab]();
  }

  /* ================= Diary ================= */
  function diarySummary(tot, T) {
    const left = (T.kcal || 0) - tot.kcal;
    const pct = T.kcal ? Math.min(1, tot.kcal / T.kcal) : 0;
    const CIRC = 2 * Math.PI * 48;
    const bar = (cls, name, val, tgt) => {
      const p = tgt ? Math.min(100, (val / tgt) * 100) : 0;
      return `<div class="bar ${cls}"><div class="top"><b>${name}</b><span class="num">${Math.round(val)} / ${tgt || '—'} g</span></div>
        <div class="trk"><div class="fill ${tgt && val > tgt ? 'over' : ''}" style="width:${p}%"></div></div></div>`;
    };
    return `<section class="card summary">
      <div class="ring"><svg viewBox="0 0 116 116"><circle class="trk" cx="58" cy="58" r="48" fill="none"/>
        <circle class="val ${left < 0 ? 'over' : ''}" cx="58" cy="58" r="48" fill="none" stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC * (1 - pct)}"/></svg>
        <div class="lbl"><b class="num">${Math.abs(Math.round(left))}</b><span>${left < 0 ? 'kcal over' : 'kcal left'}</span><span class="num">${Math.round(tot.kcal)} / ${T.kcal || '—'}</span></div></div>
      <div class="bars">${bar('p', 'Protein', tot.p, T.p)}${bar('c', 'Carbs', tot.c, T.c)}${bar('f', 'Fat', tot.f, T.f)}</div>
    </section>`;
  }
  async function renderDiary() {
    const d = S.date;
    $('#topbar').innerHTML = `
      <div class="datenav">
        <button class="iconbtn" id="dprev" aria-label="Previous day">${ICON.left}</button>
        <div class="datebtn">${esc(prettyDate(d))}<small>${esc(longDate(d))}</small><input type="date" id="dpick" value="${d}" aria-label="Pick a date"></div>
        <button class="iconbtn" id="dnext" aria-label="Next day">${ICON.right}</button>
      </div>`;
    $('#dprev').onclick = () => { S.date = C.addDays(S.date, -1); renderDiary(); };
    $('#dnext').onclick = () => { S.date = C.addDays(S.date, 1); renderDiary(); };
    $('#dpick').onchange = (e) => { if (e.target.value) { S.date = e.target.value; renderDiary(); } };

    const entries = await getDay(d);
    if (d !== S.date || S.tab !== 'diary') return;
    let html = diarySummary(C.sumEntries(entries), S.settings.targets);
    MEALS.forEach((m) => {
      const list = entries.filter((e) => e.meal === m);
      const mt = C.sumEntries(list);
      html += `<section class="card"><div class="meal-head">${mealTitle(m)}${list.length ? `<span class="small muted">${macroLine(mt)}</span><span class="k num">${Math.round(mt.kcal)}</span>` : ''}</div>`;
      html += list.length ? list.map((e) => {
        const n = C.entryNut(e);
        return `<button class="item" data-entry="${e.id}"><div class="main"><div class="name">${esc(e.food.name)}</div>
          <div class="sub">${esc(C.amountLabel(e))}${e.food.brand ? ' · ' + esc(e.food.brand) : ''}</div></div>
          <div class="k num">${Math.round(n.kcal)}<small>${macroLine(n)}</small></div></button>`;
      }).join('') : `<div class="empty">Nothing logged</div>`;
      html += `<div class="meal-actions"><button class="chipbtn" data-add="${m}">+ Add food</button>${list.length ? `<button class="chipbtn ghost" data-savemeal="${m}">Save as meal</button>` : ''}</div></section>`;
    });
    if (!entries.length && !S.recents.length) {
      html += `<div class="note">Tap <b>+</b> to search, scan a barcode, or create a food. Set your daily targets in <b>Settings</b>.</div>`;
    }
    $('#view').innerHTML = html;
    $$('[data-add]').forEach((b) => b.onclick = () => openAdd({ meal: b.dataset.add, date: S.date }));
    $$('[data-entry]').forEach((b) => b.onclick = () => {
      const e = entries.find((x) => x.id === b.dataset.entry);
      if (e) openFood(e.food, { mode: 'edit', entry: e, date: S.date });
    });
    $$('[data-savemeal]').forEach((b) => b.onclick = () => saveMealFrom(entries.filter((e) => e.meal === b.dataset.savemeal), b.dataset.savemeal));
  }

  async function addEntries(date, items) {
    const entries = [...(await getDay(date))];
    items.forEach((it) => {
      entries.push({ id: uid(), meal: it.meal, food: it.food, unit: it.unit, qty: it.qty, t: Date.now() });
      touchRecent(it.food);
    });
    await setDay(date, entries);
  }

  function saveMealFrom(list, mealName) {
    openSheet((el) => {
      el.innerHTML = `<div class="grab"></div>${sheetHead('Save as meal')}
        <p class="hint">${list.length} item${list.length > 1 ? 's' : ''} · ${Math.round(C.sumEntries(list).kcal)} kcal. You can add the whole meal later in one tap.</p>
        <label class="f"><span>Meal name</span><input type="text" id="mname" placeholder="e.g. Usual breakfast" value="${esc(mealName === 'Breakfast' ? 'My breakfast' : '')}"></label>
        <button class="btn" id="msave">Save meal</button>`;
      wireClose(el);
      $('#mname', el).focus();
      $('#msave', el).onclick = async () => {
        const name = $('#mname', el).value.trim();
        if (!name) { $('#mname', el).focus(); return; }
        S.meals = [{ id: uid(), name, items: list.map((e) => ({ food: e.food, unit: e.unit, qty: e.qty })) }, ...S.meals];
        await save('meals');
        await closeSheets(1);
        toast(`Saved “${name}”`);
      };
    });
  }

  /* ================= Food lookups ================= */
  const cache = new Map();
  async function getJSON(url, ms = 12000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) { const err = new Error('HTTP ' + r.status); err.status = r.status; throw err; }
      return await r.json();
    } finally { clearTimeout(t); }
  }
  const OFF_FIELDS = 'code,product_name,product_name_en,generic_name,brands,nutriments,serving_size,serving_quantity';
  async function offBarcode(code) {
    for (const c of C.barcodeVariants(code)) {
      const k = 'offb:' + c;
      if (cache.has(k)) { if (cache.get(k)) return cache.get(k); continue; }
      try {
        const d = await getJSON(`https://world.openfoodfacts.org/api/v2/product/${c}.json?fields=${OFF_FIELDS}`);
        const food = d && d.product ? C.fromOFF(Object.assign({ code: c }, d.product)) : null;
        cache.set(k, food);
        if (food) return food;
      } catch (e) {
        if (e.status === 404) { cache.set(k, null); continue; }
        throw e;
      }
    }
    return null;
  }
  async function offSearch(q) {
    const k = 'offs:' + q.toLowerCase();
    if (cache.has(k)) return cache.get(k);
    let products;
    try {
      const d = await getJSON(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&fields=${OFF_FIELDS}`, 15000);
      products = d.products || [];
    } catch (e) {
      const d = await getJSON(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=24&fields=${OFF_FIELDS}`, 15000);
      products = d.hits || [];
    }
    const out = dedupe(products.map(C.fromOFF).filter((f) => f && f.name !== 'Unnamed product'));
    cache.set(k, out);
    return out;
  }
  async function usdaSearch(q) {
    const k = 'usda:' + q.toLowerCase();
    if (cache.has(k)) return cache.get(k);
    const key = (S.settings.usdaKey || '').trim() || 'DEMO_KEY';
    const d = await getJSON(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(q)}&dataType=${encodeURIComponent('Foundation,SR Legacy,Survey (FNDDS)')}&pageSize=25`, 15000);
    const out = dedupe((d.foods || []).map(C.fromUSDA).filter(Boolean));
    cache.set(k, out);
    return out;
  }
  function dedupe(list) { const seen = new Set(); return list.filter((f) => !seen.has(f.key) && seen.add(f.key)); }
  function errMsg(e, src) {
    if (!navigator.onLine) return "You're offline — Recent, Favorites and My foods still work.";
    if (e && e.status === 429) return src === 'usda' ? 'USDA search limit reached. Add your free USDA key in Settings for more searches.' : 'Open Food Facts is busy (rate limit). Try again in a minute.';
    if (e && e.status === 403 && src === 'usda') return 'USDA rejected the API key. Check it in Settings.';
    if (e && e.name === 'AbortError') return `${src === 'usda' ? 'USDA' : 'Open Food Facts'} took too long to respond. Try again.`;
    return `Couldn't reach ${src === 'usda' ? 'USDA' : 'Open Food Facts'} right now.`;
  }
  const localByBarcode = (code) => {
    const vs = C.barcodeVariants(code);
    return S.myFoods.find((f) => f.barcode && vs.includes(f.barcode)) || null;
  };

  /* ================= Food rows ================= */
  function foodRow(f, attrs = '') {
    const u = f.units[f.defUnit || 0] || f.units[0];
    const m = u.factor;
    const n = { kcal: f.nut.kcal * m, p: f.nut.p * m, c: f.nut.c * m, f: f.nut.f * m };
    return `<button class="item" ${attrs}><div class="main"><div class="name">${esc(f.name)}</div>
      <div class="sub">${srcBadge(f)}${f.brand ? esc(f.brand) + ' · ' : ''}${esc(u.label)}</div></div>
      <div class="k num">${Math.round(n.kcal)}<small>${macroLine(n)}</small></div></button>`;
  }
  function bindRows(el, list, onPick) {
    $$('[data-i]', el).forEach((b) => b.addEventListener('click', () => onPick(list[+b.dataset.i])));
  }
  const listHTML = (list) => `<div class="list">${list.map((f, i) => foodRow(f, `data-i="${i}"`)).join('')}</div>`;

  /* ================= Add sheet ================= */
  function openAdd(ctx) {
    let pane = S.recents.length ? 'recent' : 'search';
    let lastQ = '';
    openSheet((el) => {
      el.innerHTML = `${sheetHead('Add food', `${ctx.meal} · ${shortDate(ctx.date)}`)}
        <form class="searchbar" id="sform" role="search">
          <input type="search" id="q" placeholder="Search foods or brands" enterkeyhint="search" autocomplete="off">
          <button class="iconbtn" type="submit" aria-label="Search">${ICON.search}</button>
          <button class="iconbtn scanbtn" type="button" id="scan" aria-label="Scan barcode">${ICON.scan}</button>
        </form>
        <div class="seg" id="seg">
          ${[['search', 'Search'], ['recent', 'Recent'], ['favs', 'Favorites'], ['mine', 'My foods'], ['meals', 'Meals']].map(([k, l]) => `<button data-p="${k}">${l}</button>`).join('')}
        </div>
        <div id="pane"></div>`;
      wireClose(el);
      const paneEl = $('#pane', el);
      const pick = (food) => openFood(food, { mode: 'add', meal: ctx.meal, date: ctx.date, onAdded: () => closeAll().then(afterAdd) });
      const afterAdd = () => { if (S.tab === 'diary') { S.date = ctx.date; renderDiary(); } else toast('Added to ' + ctx.meal); };

      function setPane(p) {
        pane = p;
        $$('#seg button', el).forEach((b) => b.classList.toggle('on', b.dataset.p === p));
        if (p === 'search') return showSearch();
        if (p === 'recent') return showList(S.recents, 'No recent foods yet. Foods you log show up here.');
        if (p === 'favs') return showList(S.favs, 'Tap the ☆ on any food to keep it here.');
        if (p === 'mine') {
          paneEl.innerHTML = `<button class="btn secondary" id="newfood" style="margin-bottom:10px">+ Create a food</button>` +
            (S.myFoods.length ? listHTML(S.myFoods) : `<div class="note">Foods you create are saved here for reuse.</div>`);
          $('#newfood', paneEl).onclick = () => openFoodForm({ onSaved: pick });
          bindRows(paneEl, S.myFoods, pick);
          return;
        }
        if (p === 'meals') {
          paneEl.innerHTML = S.meals.length ? `<div class="list">${S.meals.map((m, i) => mealRow(m, i)).join('')}</div>`
            : `<div class="note">No saved meals yet. In your diary, tap <b>Save as meal</b> under any meal to reuse it.</div>`;
          $$('[data-mi]', paneEl).forEach((b) => b.onclick = () => openMeal(S.meals[+b.dataset.mi], { meal: ctx.meal, date: ctx.date, onAdded: () => closeAll().then(afterAdd) }));
        }
      }
      function showList(list, emptyMsg) {
        paneEl.innerHTML = list.length ? listHTML(list) : `<div class="note">${emptyMsg}</div>`;
        bindRows(paneEl, list, pick);
      }
      function showSearch() {
        if (!lastQ) {
          paneEl.innerHTML = `<div class="note">Search packaged foods (Open Food Facts) and whole foods (USDA) at the same time — e.g. “banana”, “chicken breast”, or “Chobani vanilla”.</div>`;
          return;
        }
        runSearch(lastQ);
      }
      async function runSearch(q) {
        const token = (runSearch.t = (runSearch.t || 0) + 1);
        const digits = q.replace(/\s/g, '');
        if (/^\d{8,14}$/.test(digits)) { paneEl.innerHTML = `<div class="note"><span class="spin"></span>Looking up barcode…</div>`; return lookupBarcode(digits, ctx, pick); }
        const mine = S.myFoods.filter((f) => (f.name + ' ' + f.brand).toLowerCase().includes(q.toLowerCase()));
        paneEl.innerHTML = `${mine.length ? `<div class="section-title">My foods</div><div id="r-mine"></div>` : ''}
          <div class="section-title">Whole foods · USDA</div><div id="r-usda"><div class="note"><span class="spin"></span>Searching…</div></div>
          <div class="section-title">Packaged · Open Food Facts</div><div id="r-off"><div class="note"><span class="spin"></span>Searching…</div></div>
          <div style="margin-top:14px"><button class="btn secondary" id="notfound">Can't find it? Create a food</button></div>`;
        if (mine.length) { $('#r-mine', paneEl).innerHTML = listHTML(mine); bindRows($('#r-mine', paneEl), mine, pick); }
        $('#notfound', paneEl).onclick = () => openFoodForm({ preset: { name: q }, onSaved: pick });
        const fill = (id, p, src) => p.then((list) => {
          if (token !== runSearch.t) return;
          const box = $(id, paneEl); if (!box) return;
          box.innerHTML = list.length ? listHTML(list.slice(0, 20)) : `<div class="note">No matches.</div>`;
          bindRows(box, list, pick);
        }).catch((e) => {
          if (token !== runSearch.t) return;
          const box = $(id, paneEl); if (box) box.innerHTML = `<div class="note">${esc(errMsg(e, src))}</div>`;
        });
        fill('#r-usda', usdaSearch(q), 'usda');
        fill('#r-off', offSearch(q), 'off');
      }
      $('#sform', el).onsubmit = (e) => {
        e.preventDefault();
        const q = $('#q', el).value.trim(); if (!q) return;
        $('#q', el).blur();
        lastQ = q; setPane('search');
      };
      $$('#seg button', el).forEach((b) => b.onclick = () => setPane(b.dataset.p));
      $('#scan', el).onclick = () => openScanner((code) => lookupBarcode(code, ctx, pick));
      setPane(pane);
    }, { full: true });
  }

  async function lookupBarcode(code, ctx, pick) {
    const local = localByBarcode(code);
    if (local) return pick(local);
    toast('Looking up ' + code + '…', 4000);
    try {
      const food = await offBarcode(code);
      if (food) { $('#toast').classList.remove('show'); return pick(food); }
      notFound(code, pick);
    } catch (e) {
      toast(errMsg(e, 'off'), 3500);
      if (navigator.onLine) notFound(code, pick);
    }
  }
  function notFound(code, pick) {
    openSheet((el) => {
      el.innerHTML = `<div class="grab"></div>${sheetHead('Not found')}
        <p>Barcode <b class="num">${esc(code)}</b> isn't in Open Food Facts (or has no nutrition info).</p>
        <p class="hint">Create it from the nutrition label — it's saved with this barcode, so next time the scan finds it instantly.</p>
        <div class="btnrow"><button class="btn secondary" data-close>Cancel</button><button class="btn" id="mk">Create food</button></div>`;
      wireClose(el);
      $('#mk', el).onclick = async () => { await closeSheets(1); openFoodForm({ preset: { barcode: code }, onSaved: pick }); };
    });
  }

  /* ================= Food detail (add / edit entry) ================= */
  function openFood(food, opt) {
    const editing = opt.mode === 'edit';
    let unit = editing ? opt.entry.unit : (food.defUnit || 0);
    let qty = editing ? opt.entry.qty : 1;
    if (!editing && food.units[unit] && food.units[unit].label === 'g') qty = 100;
    let meal = editing ? opt.entry.meal : (opt.meal || defaultMeal());
    const date = opt.date || today();
    openSheet((el) => {
      const unitOpts = food.units.map((u, i) => `<option value="${i}" ${i === unit ? 'selected' : ''}>${esc(u.label)}</option>`).join('');
      el.innerHTML = `<div class="grab"></div>
        <div class="sheet-head"><h3>${esc(food.name)}<span class="brand">${srcBadge(food)}${esc(food.brand || (food.source === 'usda' ? 'USDA FoodData Central' : ''))}</span></h3>
          <button class="star ${isFav(food.key) ? 'on' : ''}" id="fav" aria-label="Favorite">${ICON.star}</button>
          <button class="iconbtn" data-close aria-label="Close">${ICON.close}</button></div>
        <div class="nutgrid" id="ng"></div>
        <div class="grid2">
          <label class="f"><span>Amount</span><input type="text" inputmode="decimal" id="qty" value="${r1(qty)}"></label>
          <label class="f"><span>Unit</span><select id="unit">${unitOpts}</select></label>
        </div>
        <label class="f"><span>Meal</span><select id="meal">${MEALS.map((m) => `<option ${m === meal ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        ${editing ? `<div class="btnrow"><button class="btn danger" id="del">Remove</button><button class="btn" id="go">Save</button></div>`
                  : `<button class="btn" id="go">Add to ${esc(shortDate(date))}</button>`}
        ${food.source === 'custom' && !editing ? `<p style="text-align:center"><a href="#" id="editfood" class="small">Edit this food</a></p>` : ''}
        <p class="small muted" style="text-align:center;margin-top:12px">${food.source === 'off' ? 'Nutrition data: Open Food Facts (ODbL) — check it against the label.' : food.source === 'usda' ? 'Nutrition data: USDA FoodData Central.' : ''}</p>`;
      wireClose(el);
      const upd = () => {
        const n = C.entryNut({ food, unit, qty: num(qty) || 0 });
        $('#ng', el).innerHTML = `<div><b class="num">${Math.round(n.kcal)}</b><span>kcal</span></div><div class="p"><b class="num">${r1(n.p)}</b><span>protein g</span></div>
          <div class="c"><b class="num">${r1(n.c)}</b><span>carbs g</span></div><div class="f"><b class="num">${r1(n.f)}</b><span>fat g</span></div>`;
      };
      upd();
      $('#qty', el).oninput = (e) => { qty = e.target.value; upd(); };
      $('#qty', el).onfocus = (e) => e.target.select();
      $('#unit', el).onchange = (e) => {
        const prev = food.units[unit], next = food.units[+e.target.value];
        unit = +e.target.value;
        if (prev && next && (next.label === 'g' || prev.label === 'g')) { // keep the same amount of food when switching to/from grams
          qty = r1(((num(qty) || 0) * prev.factor) / next.factor); $('#qty', el).value = qty;
        }
        upd();
      };
      $('#meal', el).onchange = (e) => { meal = e.target.value; };
      $('#fav', el).onclick = () => { const on = toggleFav(food); $('#fav', el).classList.toggle('on', on); toast(on ? 'Added to favorites' : 'Removed from favorites'); };
      $('#go', el).onclick = async () => {
        const q = num(qty);
        if (!q || q <= 0) { $('#qty', el).focus(); return toast('Enter an amount'); }
        if (editing) {
          const entries = (await getDay(date)).map((x) => x.id === opt.entry.id ? Object.assign({}, x, { unit, qty: q, meal }) : x);
          await setDay(date, entries);
          await closeSheets(1); renderDiary();
        } else {
          await addEntries(date, [{ food, unit, qty: q, meal }]);
          if (opt.onAdded) opt.onAdded(); else { await closeSheets(1); toast(`Added to ${meal}`); if (S.tab === 'diary') renderDiary(); }
        }
      };
      if (editing) $('#del', el).onclick = async () => {
        await setDay(date, (await getDay(date)).filter((x) => x.id !== opt.entry.id));
        await closeSheets(1); renderDiary(); toast('Removed');
      };
      const ef = $('#editfood', el);
      if (ef) ef.onclick = async (e) => { e.preventDefault(); await closeSheets(1); openFoodForm({ food, onSaved: (f) => openFood(f, opt) }); };
    });
  }

  /* ================= Manual food form ================= */
  function openFoodForm({ food, preset = {}, onSaved }) {
    const v = food ? Object.assign({ name: food.name, brand: food.brand, barcode: food.barcode }, food.form) : Object.assign({ servingLabel: '1 serving' }, preset);
    openSheet((el) => {
      el.innerHTML = `${sheetHead(food ? 'Edit food' : 'Create a food')}
        <p class="hint">Copy the numbers from the nutrition label. Everything is per one serving.</p>
        <label class="f"><span>Name *</span><input type="text" id="ff-name" value="${esc(v.name || '')}" placeholder="e.g. Grandma's chili"></label>
        <label class="f"><span>Brand (optional)</span><input type="text" id="ff-brand" value="${esc(v.brand || '')}"></label>
        <div class="grid2">
          <label class="f"><span>Serving size</span><input type="text" id="ff-sl" value="${esc(v.servingLabel || '')}" placeholder="1 cup"></label>
          <label class="f"><span>Grams per serving</span><input type="text" inputmode="decimal" id="ff-sg" value="${esc(v.servingGrams || '')}" placeholder="optional"></label>
        </div>
        <div class="grid4">
          <label class="f"><span>Calories</span><input type="text" inputmode="decimal" id="ff-k" value="${esc(v.kcal != null ? v.kcal : '')}"></label>
          <label class="f"><span>Protein g</span><input type="text" inputmode="decimal" id="ff-p" value="${esc(v.p != null ? v.p : '')}"></label>
          <label class="f"><span>Carbs g</span><input type="text" inputmode="decimal" id="ff-c" value="${esc(v.c != null ? v.c : '')}"></label>
          <label class="f"><span>Fat g</span><input type="text" inputmode="decimal" id="ff-f" value="${esc(v.f != null ? v.f : '')}"></label>
        </div>
        <p class="hint">Leave calories blank to calculate them from the macros. Add grams to log by weight too.</p>
        <label class="f"><span>Barcode (optional)</span><input type="text" inputmode="numeric" id="ff-bc" value="${esc(v.barcode || '')}"></label>
        <div class="btnrow">${food ? '<button class="btn danger" id="ff-del">Delete</button>' : ''}<button class="btn" id="ff-save">${food ? 'Save' : 'Save food'}</button></div>`;
      wireClose(el);
      if (!v.name) setTimeout(() => $('#ff-name', el).focus(), 250);
      $('#ff-save', el).onclick = async () => {
        const form = { name: $('#ff-name', el).value, brand: $('#ff-brand', el).value, servingLabel: $('#ff-sl', el).value, servingGrams: $('#ff-sg', el).value,
          kcal: $('#ff-k', el).value, p: $('#ff-p', el).value, c: $('#ff-c', el).value, f: $('#ff-f', el).value, barcode: $('#ff-bc', el).value };
        if (!form.name.trim()) { $('#ff-name', el).focus(); return toast('Give the food a name'); }
        if (num(form.kcal) == null && ![form.p, form.c, form.f].some((x) => num(x) != null)) { $('#ff-k', el).focus(); return toast('Enter calories or macros'); }
        const nf = C.fromManual(form, food && food.key);
        S.myFoods = [nf, ...S.myFoods.filter((f) => f.key !== nf.key)].sort((a, b) => a.name.localeCompare(b.name));
        await save('myFoods');
        if (isFav(nf.key)) { S.favs = S.favs.map((f) => f.key === nf.key ? nf : f); save('favs'); }
        if (S.recents.some((f) => f.key === nf.key)) { S.recents = S.recents.map((f) => f.key === nf.key ? nf : f); save('recents'); }
        await closeSheets(1);
        toast(food ? 'Food updated' : 'Food saved to My foods');
        if (onSaved) onSaved(nf); else if (S.tab === 'foods') renderFoods();
      };
      const del = $('#ff-del', el);
      if (del) del.onclick = async () => {
        if (!confirm(`Delete “${food.name}” from My foods? Past diary entries are kept.`)) return;
        S.myFoods = S.myFoods.filter((f) => f.key !== food.key);
        S.favs = S.favs.filter((f) => f.key !== food.key);
        S.recents = S.recents.filter((f) => f.key !== food.key);
        await Promise.all([save('myFoods'), save('favs'), save('recents')]);
        await closeSheets(1); toast('Deleted'); if (S.tab === 'foods') renderFoods();
      };
    });
  }

  /* ================= Saved meals ================= */
  function mealRow(m, i) {
    const t = C.sumEntries(m.items);
    return `<button class="item" data-mi="${i}"><div class="main"><div class="name">${esc(m.name)}</div>
      <div class="sub">${m.items.length} item${m.items.length > 1 ? 's' : ''} · ${esc(m.items.map((x) => x.food.name).join(', '))}</div></div>
      <div class="k num">${Math.round(t.kcal)}<small>${macroLine(t)}</small></div></button>`;
  }
  function openMeal(m, opt) {
    let meal = opt.meal || defaultMeal();
    const date = opt.date || today();
    openSheet((el) => {
      const t = C.sumEntries(m.items);
      el.innerHTML = `<div class="grab"></div>${sheetHead(m.name, 'Saved meal')}
        <div class="nutgrid"><div><b class="num">${Math.round(t.kcal)}</b><span>kcal</span></div><div class="p"><b class="num">${r1(t.p)}</b><span>protein g</span></div>
          <div class="c"><b class="num">${r1(t.c)}</b><span>carbs g</span></div><div class="f"><b class="num">${r1(t.f)}</b><span>fat g</span></div></div>
        <div class="list" style="margin-bottom:14px">${m.items.map((x) => {
          const n = C.entryNut(x);
          return `<div class="item"><div class="main"><div class="name">${esc(x.food.name)}</div><div class="sub">${esc(C.amountLabel(x))}</div></div><div class="k num">${Math.round(n.kcal)}</div></div>`;
        }).join('')}</div>
        <label class="f"><span>Add to</span><select id="meal">${MEALS.map((x) => `<option ${x === meal ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <button class="btn" id="go">Add meal to ${esc(shortDate(date))}</button>
        <div style="margin-top:10px"><button class="btn danger" id="del">Delete saved meal</button></div>
        <p class="hint" style="margin-top:10px">After adding, tap any item in your diary to adjust its amount.</p>`;
      wireClose(el);
      $('#meal', el).onchange = (e) => { meal = e.target.value; };
      $('#go', el).onclick = async () => {
        await addEntries(date, m.items.map((x) => ({ food: x.food, unit: x.unit, qty: x.qty, meal })));
        if (opt.onAdded) opt.onAdded(); else { await closeSheets(1); toast(`Added ${m.name}`); }
      };
      $('#del', el).onclick = async () => {
        if (!confirm(`Delete saved meal “${m.name}”?`)) return;
        S.meals = S.meals.filter((x) => x.id !== m.id); await save('meals');
        await closeSheets(1); toast('Meal deleted'); if (S.tab === 'foods') renderFoods();
      };
    });
  }

  /* ================= Barcode scanner ================= */
  function openScanner(onCode) {
    let scanner = null, done = false;
    const stop = async () => {
      if (!scanner) return;
      const s = scanner; scanner = null;
      try { if (s.isScanning) await s.stop(); s.clear(); } catch (e) { /* already stopped */ }
    };
    openSheet((el) => {
      el.innerHTML = `${sheetHead('Scan barcode')}
        <div class="scanner"><div id="qr-reader"></div></div>
        <p class="hint" style="margin-top:10px" id="scanmsg">Point the camera at the barcode and hold steady.</p>
        <form id="manualbc" class="searchbar"><input type="text" inputmode="numeric" id="bc" placeholder="…or type the barcode number"><button class="iconbtn" type="submit" aria-label="Look up">${ICON.search}</button></form>`;
      wireClose(el);
      const finish = async (code) => {
        if (done) return; done = true;
        if (navigator.vibrate) navigator.vibrate(60);
        await stop(); await closeSheets(1);
        onCode(code);
      };
      $('#manualbc', el).onsubmit = (e) => {
        e.preventDefault();
        const code = $('#bc', el).value.replace(/\D/g, '');
        if (code.length < 8) return toast('Barcodes are 8–14 digits');
        finish(code);
      };
      if (!window.Html5Qrcode) { $('#scanmsg', el).textContent = 'Scanner is still loading — try again in a second.'; return; }
      const F = window.Html5QrcodeSupportedFormats;
      try {
        scanner = new window.Html5Qrcode('qr-reader', {
          verbose: false,
          formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E],
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        });
        scanner.start({ facingMode: 'environment' },
          { fps: 12, qrbox: (w, h) => ({ width: Math.floor(w * 0.8), height: Math.floor(Math.min(h * 0.3, w * 0.45)) }) },
          (text) => { const code = String(text).replace(/\D/g, ''); if (code.length >= 8) finish(code); },
          () => {}
        ).catch((err) => {
          const m = String(err && (err.name || err.message || err));
          $('#scanmsg', el).innerHTML = /NotAllowed|Permission/i.test(m)
            ? 'Camera permission was blocked. Allow camera access for this site in your phone settings, or type the barcode below.'
            : /secure|https/i.test(m) ? 'The camera only works when the app is opened over https (your Netlify link).' : 'Could not start the camera. You can type the barcode below.';
        });
      } catch (e) { $('#scanmsg', el).textContent = 'Could not start the camera. You can type the barcode below.'; }
    }, { full: true, onClose: () => { stop(); } });
  }

  /* ================= Foods tab ================= */
  let foodsPane = 'favs';
  function renderFoods() {
    $('#topbar').innerHTML = `<h1>Foods</h1>`;
    const panes = [['favs', 'Favorites'], ['mine', 'My foods'], ['meals', 'Meals'], ['recent', 'Recent']];
    let html = `<div class="seg">${panes.map(([k, l]) => `<button data-p="${k}" class="${k === foodsPane ? 'on' : ''}">${l}</button>`).join('')}</div><div id="fp"></div>`;
    $('#view').innerHTML = html;
    $$('.seg button').forEach((b) => b.onclick = () => { foodsPane = b.dataset.p; renderFoods(); });
    const fp = $('#fp');
    const pick = (f) => openFood(f, { mode: 'add', date: today(), meal: defaultMeal() });
    if (foodsPane === 'favs') {
      fp.innerHTML = S.favs.length ? listHTML(S.favs) : `<div class="note">No favorites yet. Open any food and tap ☆.</div>`;
      bindRows(fp, S.favs, pick);
    } else if (foodsPane === 'recent') {
      fp.innerHTML = S.recents.length ? listHTML(S.recents) : `<div class="note">Foods you log show up here.</div>`;
      bindRows(fp, S.recents, pick);
    } else if (foodsPane === 'mine') {
      fp.innerHTML = `<button class="btn" id="newfood" style="margin-bottom:12px">+ Create a food</button>` +
        (S.myFoods.length ? `<div class="list">${S.myFoods.map((f, i) => foodRow(f, `data-i="${i}"`)).join('')}</div><p class="hint" style="margin-top:10px">Tap a food to edit or delete it.</p>` : `<div class="note">Foods you create (or that weren't in the databases) are saved here.</div>`);
      $('#newfood').onclick = () => openFoodForm({});
      bindRows(fp, S.myFoods, (f) => openFoodForm({ food: f }));
    } else {
      fp.innerHTML = S.meals.length ? `<div class="list">${S.meals.map((m, i) => mealRow(m, i)).join('')}</div>`
        : `<div class="note">Log a meal in your diary, then tap <b>Save as meal</b> to reuse it in one tap.</div>`;
      $$('[data-mi]', fp).forEach((b) => b.onclick = () => openMeal(S.meals[+b.dataset.mi], { date: today(), meal: defaultMeal() }));
    }
  }

  /* ================= Report tab ================= */
  async function buildReport() {
    const days = C.weekDays(S.repStart);
    await Promise.all(days.map(getDay));
    return C.weekReport(days, (d) => S.days.get(d), S.settings.targets);
  }
  async function renderReport() {
    $('#topbar').innerHTML = `<div class="datenav">
      <button class="iconbtn" id="wprev" aria-label="Previous week">${ICON.left}</button>
      <div class="datebtn">Week of ${esc(C.parseYmd(S.repStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}<small>${esc(longDate(S.repStart))} – ${esc(longDate(C.addDays(S.repStart, 6)))}</small></div>
      <button class="iconbtn" id="wnext" aria-label="Next week">${ICON.right}</button></div>`;
    $('#wprev').onclick = () => { S.repStart = C.addDays(S.repStart, -7); renderReport(); };
    $('#wnext').onclick = () => { S.repStart = C.addDays(S.repStart, 7); renderReport(); };
    const start = S.repStart;
    const rep = await buildReport();
    if (start !== S.repStart || S.tab !== 'report') return;
    const T = rep.targets;
    const cell = (v, t, dec) => `<td class="num ${t && v > t * 1.1 ? 'over-t' : ''}">${dec ? r1(v) : Math.round(v)}</td>`;
    $('#view').innerHTML = `
      <section class="card">
        <table class="rep"><thead><tr><th>Day</th><th>kcal</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead><tbody>
        ${rep.rows.map((r) => `<tr><td>${esc(C.parseYmd(r.date).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }))}</td>
          ${r.entries.length ? cell(r.tot.kcal, T.kcal) + cell(r.tot.p, 0) + cell(r.tot.c, T.c) + cell(r.tot.f, T.f) : '<td colspan="4" class="muted" style="text-align:right">not logged</td>'}</tr>`).join('')}
        <tr class="avg"><td>Daily avg</td>${rep.daysLogged ? cell(rep.avg.kcal, 0) + cell(rep.avg.p, 0) + cell(rep.avg.c, 0) + cell(rep.avg.f, 0) : '<td colspan="4"></td>'}</tr>
        <tr><td class="muted">Target</td><td class="num muted">${T.kcal || '—'}</td><td class="num muted">${T.p || '—'}</td><td class="num muted">${T.c || '—'}</td><td class="num muted">${T.f || '—'}</td></tr>
        </tbody></table>
        <p class="small muted" style="margin:10px 0 0">${rep.daysLogged} of 7 days logged. Protein, carbs and fat in grams.</p>
      </section>
      <section class="card">
        <h2 style="margin-bottom:6px">Send to your dietitian</h2>
        <p class="hint" style="margin:0 0 12px">Creates a file for this week. On your phone, the share sheet lets you save it to Files or send it — then attach it in Nourish however your dietitian prefers.</p>
        <div class="btnrow"><button class="btn" id="pdf">PDF report</button><button class="btn secondary" id="csv">Spreadsheet (CSV)</button></div>
        ${S.settings.name ? '' : `<p class="small muted" style="margin:10px 0 0">Tip: add your name in Settings so it appears on the report.</p>`}
      </section>`;
    $('#csv').onclick = async () => {
      const r = await buildReport();
      const blob = new Blob([C.reportCSV(r, S.settings.name)], { type: 'text/csv' });
      shareFile(blob, fileBase(r) + '.csv', 'Weekly food log');
    };
    $('#pdf').onclick = async () => {
      if (!window.jspdf) return toast('PDF tool still loading — try again');
      const r = await buildReport();
      shareFile(makePDF(r), fileBase(r) + '.pdf', 'Weekly food log');
    };
  }
  const fileBase = (r) => `food-log${S.settings.name ? '-' + S.settings.name.trim().replace(/[^\w-]+/g, '-') : ''}-${r.rows[0].date}`;

  function makePDF(rep) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const W = doc.internal.pageSize.getWidth(), M = 40;
    const green = [31, 61, 43];
    const T = rep.targets;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(20);
    doc.text('Weekly food log' + (S.settings.name ? ' — ' + S.settings.name : ''), M, 50);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(90);
    doc.text(`${longDate(rep.rows[0].date)} – ${longDate(rep.rows[6].date)}   ·   ${rep.daysLogged} of 7 days logged`, M, 68);
    doc.text(`Daily targets: ${T.kcal || '—'} kcal · Protein ${T.p || '—'} g · Carbs ${T.c || '—'} g · Fat ${T.f || '—'} g`, M, 84);
    const fmt = (v, dec) => dec ? String(r1(v)) : String(Math.round(v));
    doc.autoTable({
      startY: 100, margin: { left: M, right: M }, theme: 'grid',
      head: [['Day', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Items']],
      body: rep.rows.map((r) => r.entries.length
        ? [shortDate(r.date), fmt(r.tot.kcal), fmt(r.tot.p, 1), fmt(r.tot.c, 1), fmt(r.tot.f, 1), r.entries.length]
        : [shortDate(r.date), { content: 'not logged', colSpan: 5, styles: { textColor: 150, halign: 'center' } }]),
      foot: [['Daily average', fmt(rep.avg.kcal), fmt(rep.avg.p, 1), fmt(rep.avg.c, 1), fmt(rep.avg.f, 1), ''],
             ['Target', T.kcal || '—', T.p || '—', T.c || '—', T.f || '—', '']],
      headStyles: { fillColor: green }, footStyles: { fillColor: [239, 235, 225], textColor: 20 },
      styles: { fontSize: 10 }, didParseCell: (d) => { if (d.column.index >= 1 && d.cell.colSpan === 1) d.cell.styles.halign = 'right'; }, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    });
    rep.rows.filter((r) => r.entries.length).forEach((r) => {
      let y = doc.lastAutoTable.finalY + 26;
      if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); y = 50; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20);
      doc.text(C.parseYmd(r.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }), M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
      doc.text(`${Math.round(r.tot.kcal)} kcal · P ${r1(r.tot.p)} g · C ${r1(r.tot.c)} g · F ${r1(r.tot.f)} g`, W - M, y, { align: 'right' });
      const body = [];
      MEALS.forEach((m) => {
        const list = r.entries.filter((e) => e.meal === m);
        if (!list.length) return;
        const mt = C.sumEntries(list);
        body.push([{ content: m, styles: { fontStyle: 'bold', fillColor: [246, 243, 236] } }, { content: '', styles: { fillColor: [246, 243, 236] } },
          ...[fmt(mt.kcal), fmt(mt.p, 1), fmt(mt.c, 1), fmt(mt.f, 1)].map((v) => ({ content: v, styles: { fontStyle: 'bold', fillColor: [246, 243, 236] } }))]);
        list.forEach((e) => {
          const n = C.entryNut(e);
          body.push(['   ' + e.food.name + (e.food.brand ? ` (${e.food.brand})` : ''), C.amountLabel(e), fmt(n.kcal), fmt(n.p, 1), fmt(n.c, 1), fmt(n.f, 1)]);
        });
      });
      doc.autoTable({
        startY: y + 8, margin: { left: M, right: M }, theme: 'plain',
        head: [['Food', 'Amount', 'kcal', 'P', 'C', 'F']], body,
        headStyles: { textColor: 100, fontStyle: 'bold', lineWidth: { bottom: 0.5 }, lineColor: 200 },
        styles: { fontSize: 9, cellPadding: 3 }, didParseCell: (d) => { if (d.column.index >= 2) d.cell.styles.halign = 'right'; },
        columnStyles: { 0: { cellWidth: 220 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      });
    });
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140);
      doc.text(`Nutrition data from Open Food Facts (ODbL), USDA FoodData Central and user-entered labels. Generated ${longDate(today())}.`, M, doc.internal.pageSize.getHeight() - 24);
      doc.text(`Page ${i} of ${pages}`, W - M, doc.internal.pageSize.getHeight() - 24, { align: 'right' });
    }
    return doc.output('blob');
  }

  async function shareFile(blob, name, title) {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Saved ' + name);
  }

  /* ================= Friends ================= */
  // Held in memory only: a friend's data is fetched when viewed and never saved on this device.
  const F = { loaded: false, username: null, list: [] };
  const friendsOn = () => !!(remote && user && remote.friends);
  function friendsError(e) {
    const m = String((e && e.message) || e || '');
    const known = {
      plate_bad_username: 'Usernames are 3–20 letters, numbers or underscores.',
      plate_username_taken: 'That username is taken. Try another.',
      plate_no_username: 'Pick a username first.',
      plate_user_not_found: 'No one has that username. Check the spelling with your friend.',
      plate_self: "That's your own username.",
      plate_already_friends: "You're already friends.",
      plate_already_requested: 'You already sent them a request.',
      plate_too_many_requests: 'You have too many requests waiting. Cancel some first.',
      plate_request_gone: 'That request is no longer available.',
      plate_not_friends: "You're no longer friends, so this diary isn't available.",
    };
    const code = Object.keys(known).find((k) => m.includes(k));
    if (code) return known[code];
    if (e && e.code === 'PGRST202') return "Friends isn't set up on the server yet. Run supabase-friends.sql (see the README).";
    if (!navigator.onLine || /fetch|network|Load failed/i.test(m)) return "Can't reach the server. Friends needs a connection.";
    return 'Something went wrong. Please try again.';
  }
  function setFriendsBadge() {
    const dot = $('#friends-dot');
    if (dot) dot.hidden = !F.list.some((x) => x.status === 'pending' && x.incoming);
  }
  async function loadFriends() {
    const [username, list] = await Promise.all([remote.friends.myUsername(), remote.friends.list()]);
    F.username = username; F.list = list || []; F.loaded = true;
    setFriendsBadge();
  }
  function resetFriends() { F.loaded = false; F.username = null; F.list = []; setFriendsBadge(); }
  const refreshFriendsBadge = () => { if (friendsOn()) loadFriends().catch((e) => console.warn('friends', e)); };

  async function renderFriends() {
    $('#topbar').innerHTML = `<h1>Friends</h1>`;
    const v = $('#view');
    if (!friendsOn()) {
      v.innerHTML = `<div class="note">Friends needs an account. Cloud sign-in turns on once the app's Supabase settings are filled in — see the README.</div>`;
      return;
    }
    if (!F.loaded) v.innerHTML = `<div class="note"><span class="spin"></span>Loading…</div>`;
    try { await loadFriends(); }
    catch (e) {
      if (S.tab === 'friends') v.innerHTML = `<div class="note">${esc(friendsError(e))}</div>`;
      return;
    }
    if (S.tab !== 'friends') return;
    if (!F.username) return paintUsernamePrompt(v);

    const friends = F.list.filter((x) => x.status === 'accepted');
    const incoming = F.list.filter((x) => x.status === 'pending' && x.incoming);
    const sent = F.list.filter((x) => x.status === 'pending' && !x.incoming);
    const avatar = (name) => `<span class="avatar av${[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 6}" aria-hidden="true">${esc(name[0].toUpperCase())}</span>`;
    const person = (x, actions) => `<div class="item">${avatar(x.username)}<div class="main"><div class="name">@${esc(x.username)}</div></div>${actions}</div>`;
    v.innerHTML = `
      <section class="card">
        <h2 style="margin-bottom:4px">Add a friend</h2>
        <p class="small muted" style="margin:0 0 10px">Your username is <b>@${esc(F.username)}</b> · <a href="#" id="fr-rename">Change</a></p>
        <form class="searchbar" id="fr-add" style="margin:0">
          <input type="text" id="fr-name" placeholder="Their username" aria-label="Friend's username" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send">
          <button class="iconbtn scanbtn" type="submit" aria-label="Send friend request">${ICON.plus}</button>
        </form>
      </section>
      ${incoming.length ? `<div class="section-title">Requests</div>
        <p class="hint" style="margin:0 2px 8px">If you accept, you'll each see the other's food diary and daily targets.</p>
        <div class="list">${incoming.map((x) => person(x, `<button class="chipbtn" data-accept="${esc(x.user_id)}">Accept</button><button class="chipbtn ghost" data-remove="${esc(x.user_id)}">Decline</button>`)).join('')}</div>` : ''}
      <div class="section-title">Your friends</div>
      ${friends.length ? `<div class="list">${friends.map((x) => `<button class="item" data-friend="${esc(x.user_id)}">${avatar(x.username)}<div class="main"><div class="name">@${esc(x.username)}</div><div class="sub">View diary</div></div><span class="muted">${ICON.right}</span></button>`).join('')}</div>`
        : `<div class="note">No friends yet. Share your username, or add theirs above.</div>`}
      ${sent.length ? `<div class="section-title">Sent</div>
        <div class="list">${sent.map((x) => person(x, `<span class="small muted">Waiting</span><button class="chipbtn ghost" data-remove="${esc(x.user_id)}">Cancel</button>`)).join('')}</div>` : ''}
      <p class="small muted" style="margin:14px 2px 0">Friends can see your food diary and daily targets, and you can see theirs. Your saved foods, saved meals, email and other settings stay private.</p>`;

    const act = async (btn, fn, done) => {
      btn.disabled = true;
      try { await fn(); toast(done); }
      catch (e) { toast(friendsError(e), 3500); }
      if (S.tab === 'friends') renderFriends();
    };
    $('#fr-rename').onclick = (e) => { e.preventDefault(); openUsernameSheet(); };
    $$('[data-accept]', v).forEach((b) => b.onclick = () => act(b, () => remote.friends.accept(b.dataset.accept), 'Friend added'));
    $$('[data-remove]', v).forEach((b) => b.onclick = () => act(b, () => remote.friends.remove(b.dataset.remove), 'Request removed'));
    $$('[data-friend]', v).forEach((b) => b.onclick = () => {
      const fr = friends.find((x) => x.user_id === b.dataset.friend);
      if (fr) openFriendDiary(fr);
    });
    $('#fr-add').onsubmit = async (e) => {
      e.preventDefault();
      const input = $('#fr-name'), name = C.normalizeUsername(input.value);
      if (!C.validUsername(name)) { input.focus(); return toast(friendsError(new Error('plate_bad_username')), 3500); }
      try {
        const r = await remote.friends.request(name);
        toast(r === 'accepted' ? `You and @${name} are now friends` : `Request sent to @${name}`);
        if (S.tab === 'friends') renderFriends();
      } catch (ex) { toast(friendsError(ex), 3500); }
    };
  }

  function usernameForm(root, submitLabel, onDone) {
    const form = $('#un-form', root), input = $('#un-name', root), err = $('#un-err', root), btn = $('button[type=submit]', form);
    btn.textContent = submitLabel;
    form.onsubmit = async (e) => {
      e.preventDefault(); err.textContent = '';
      const name = C.normalizeUsername(input.value);
      if (!C.validUsername(name)) { err.textContent = friendsError(new Error('plate_bad_username')); return; }
      btn.disabled = true;
      try { F.username = await remote.friends.setUsername(name); await onDone(); }
      catch (ex) { err.textContent = friendsError(ex); }
      finally { if (btn.isConnected) btn.disabled = false; }
    };
  }
  const usernameFields = (value = '') => `<form id="un-form">
      <label class="f"><span>Username</span><input type="text" id="un-name" value="${esc(value)}" maxlength="21" placeholder="e.g. tim_eats" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <p class="auth-err" id="un-err" role="alert"></p><button class="btn" type="submit"></button>
    </form>`;
  function paintUsernamePrompt(v) {
    v.innerHTML = `<section class="card"><h2 style="margin-bottom:6px">Pick a username</h2>
      <p class="hint" style="margin:0 0 12px">Friends add you with your username, so they never need your email. 3–20 letters, numbers or underscores.</p>
      ${usernameFields()}</section>`;
    usernameForm(v, 'Save username', () => renderFriends());
  }
  function openUsernameSheet() {
    openSheet((el) => {
      el.innerHTML = `<div class="grab"></div>${sheetHead('Change username')}${usernameFields(F.username || '')}`;
      wireClose(el);
      usernameForm(el, 'Save username', async () => { await closeSheets(1); toast('Username updated'); if (S.tab === 'friends') renderFriends(); });
    });
  }

  function openFriendDiary(fr) {
    let date = today(), token = 0;
    openSheet((el) => {
      el.innerHTML = `${sheetHead('@' + fr.username, 'Diary · view only')}
        <div class="datenav" style="margin-bottom:10px">
          <button class="iconbtn" id="fd-prev" aria-label="Previous day">${ICON.left}</button>
          <div class="datebtn" id="fd-date"></div>
          <button class="iconbtn" id="fd-next" aria-label="Next day">${ICON.right}</button>
        </div>
        <div id="fd-body"></div>
        <div style="margin-top:6px"><button class="btn danger" id="fd-remove">Remove friend</button></div>`;
      wireClose(el);
      const body = $('#fd-body', el);
      const load = async () => {
        const d = date, t = ++token;
        $('#fd-date', el).innerHTML = `${esc(prettyDate(d))}<small>${esc(longDate(d))}</small><input type="date" id="fd-pick" value="${d}" aria-label="Pick a date">`;
        $('#fd-pick', el).onchange = (e) => { if (e.target.value) { date = e.target.value; load(); } };
        body.innerHTML = `<div class="note"><span class="spin"></span>Loading…</div>`;
        try {
          const day = C.cleanSharedDay(await remote.friends.day(fr.user_id, d));
          if (t !== token) return;
          body.innerHTML = diarySummary(C.sumEntries(day.entries), day.targets) + MEALS.map((m) => {
            const list = day.entries.filter((e) => e.meal === m), mt = C.sumEntries(list);
            return `<section class="card"><div class="meal-head">${mealTitle(m)}${list.length ? `<span class="small muted">${macroLine(mt)}</span><span class="k num">${Math.round(mt.kcal)}</span>` : ''}</div>
              ${list.length ? list.map((e) => {
                const n = C.entryNut(e);
                return `<div class="item"><div class="main"><div class="name">${esc(e.food.name)}</div>
                  <div class="sub">${esc(C.amountLabel(e))}${e.food.brand ? ' · ' + esc(e.food.brand) : ''}</div></div>
                  <div class="k num">${Math.round(n.kcal)}<small>${macroLine(n)}</small></div></div>`;
              }).join('') : `<div class="empty">Nothing logged</div>`}</section>`;
          }).join('');
        } catch (e) {
          if (t === token) body.innerHTML = `<div class="note">${esc(friendsError(e))}</div>`;
        }
      };
      $('#fd-prev', el).onclick = () => { date = C.addDays(date, -1); load(); };
      $('#fd-next', el).onclick = () => { date = C.addDays(date, 1); load(); };
      $('#fd-remove', el).onclick = async () => {
        if (!confirm(`Remove @${fr.username}? You'll stop seeing each other's diaries.`)) return;
        try {
          await remote.friends.remove(fr.user_id);
          await closeSheets(1);
          toast('Friend removed');
          if (S.tab === 'friends') renderFriends();
        } catch (e) { toast(friendsError(e), 3500); }
      };
      load();
    }, { full: true });
  }

  /* ================= Settings ================= */
  function renderSettings() {
    $('#topbar').innerHTML = `<h1>Settings</h1>`;
    const s = S.settings, T = s.targets;
    const cloud = !!(remote && user);
    $('#view').innerHTML = `
      ${cloud ? `<section class="card">
        <h2 style="margin-bottom:4px">Account</h2>
        <p class="small muted" style="margin:0 0 6px">Signed in as <b>${esc(user.email || '')}</b></p>
        <p class="small" id="syncline" style="margin:0 0 12px">${syncLabel()}</p>
        <div class="btnrow"><button class="btn secondary" id="a-sync">Sync now</button><button class="btn secondary" id="a-pass">Change password</button></div>
        <div style="margin-top:10px"><button class="btn danger" id="a-out">Sign out</button></div>
      </section>` : `<section class="card"><h2 style="margin-bottom:6px">Account</h2>
        <p class="hint" style="margin:0">Using Plate on this phone only (no account). Cloud sign-in turns on once the app's Supabase settings are filled in — see the README.</p></section>`}
      <section class="card">
        <h2 style="margin-bottom:12px">Daily targets</h2>
        <label class="f"><span>Calories (kcal)</span><input type="text" inputmode="numeric" id="t-k" value="${esc(T.kcal || '')}"></label>
        <div class="grid2" style="grid-template-columns:repeat(3,1fr)">
          <label class="f"><span>Protein g</span><input type="text" inputmode="numeric" id="t-p" value="${esc(T.p || '')}"></label>
          <label class="f"><span>Carbs g</span><input type="text" inputmode="numeric" id="t-c" value="${esc(T.c || '')}"></label>
          <label class="f"><span>Fat g</span><input type="text" inputmode="numeric" id="t-f" value="${esc(T.f || '')}"></label>
        </div>
        <p class="hint" id="t-hint"></p>
        <button class="btn" id="t-save">Save targets</button>
      </section>
      <section class="card">
        <h2 style="margin-bottom:12px">Report</h2>
        <label class="f"><span>Your name (shown on reports)</span><input type="text" id="s-name" value="${esc(s.name)}" placeholder="e.g. Tim"></label>
        <button class="btn secondary" id="s-namesave">Save name</button>
      </section>
      <section class="card">
        <h2 style="margin-bottom:6px">USDA search key</h2>
        <p class="hint" style="margin:0 0 10px">Whole-food search works without a key, but the shared demo key only allows a few dozen searches per hour. A free personal key (instant, by email) raises that to 1,000/hour.${cloud ? ' It\'s saved with your account.' : ''}
          <a href="https://fdc.nal.usda.gov/api-key-signup" target="_blank" rel="noopener">Get a free key</a></p>
        <label class="f"><span>API key</span><input type="text" id="s-key" value="${esc(s.usdaKey)}" placeholder="DEMO_KEY" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <button class="btn secondary" id="s-keysave">Save key</button>
      </section>
      <section class="card">
        <h2 style="margin-bottom:6px">Backup file</h2>
        <p class="hint" style="margin:0 0 10px">${cloud ? 'Your log is already saved to your account. A backup file is an extra copy you control.' : 'Your log lives only on this phone. Make a backup now and then (e.g. to iCloud Drive or Google Drive).'}</p>
        <div class="btnrow"><button class="btn secondary" id="b-exp">Download backup</button><button class="btn secondary" id="b-imp">Restore</button></div>
        <input type="file" id="b-file" accept="application/json,.json" hidden>
      </section>
      <section class="card small muted">
        <p style="margin-top:0"><b>Plate</b> v${VERSION}. Food data from <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> (Open Database License) and <a href="https://fdc.nal.usda.gov" target="_blank" rel="noopener">USDA FoodData Central</a>. Community data can contain mistakes — compare with the label for foods you eat often.</p>
        <button class="btn danger" id="wipe">${cloud ? 'Erase all my data' : 'Erase all data on this phone'}</button>
      </section>`;
    const hint = () => {
      const p = num($('#t-p').value) || 0, c = num($('#t-c').value) || 0, f = num($('#t-f').value) || 0;
      const k = Math.round(C.kcalFromMacros(p, c, f)), tk = num($('#t-k').value) || 0;
      $('#t-hint').innerHTML = (p || c || f) ? `Your macros add up to <b>${k} kcal</b>${tk && Math.abs(k - tk) > 50 ? ` (target is ${tk}). <a href="#" id="t-use">Use ${k}</a>` : '.'}` : '';
      const u = $('#t-use'); if (u) u.onclick = (e) => { e.preventDefault(); $('#t-k').value = k; hint(); };
    };
    ['#t-k', '#t-p', '#t-c', '#t-f'].forEach((id) => $(id).oninput = hint); hint();
    $('#t-save').onclick = async () => {
      s.targets = { kcal: num($('#t-k').value) || 0, p: num($('#t-p').value) || 0, c: num($('#t-c').value) || 0, f: num($('#t-f').value) || 0 };
      await saveSettings(); toast('Targets saved');
    };
    $('#s-namesave').onclick = async () => { s.name = $('#s-name').value.trim(); await saveSettings(); toast('Saved'); };
    $('#s-keysave').onclick = async () => { s.usdaKey = $('#s-key').value.trim(); cache.clear(); await saveSettings(); toast('Key saved'); };
    if (cloud) {
      $('#a-sync').onclick = () => Sync.run();
      $('#a-pass').onclick = () => openPasswordSheet();
      $('#a-out').onclick = signOut;
    }
    $('#b-exp').onclick = async () => {
      const keys = (await DB.keys()).filter(isDataKey); const data = {};
      for (const k of keys) data[k] = await DB.get(k);
      const blob = new Blob([JSON.stringify({ app: 'plate', version: 1, exported: new Date().toISOString(), data })], { type: 'application/json' });
      shareFile(blob, `plate-backup-${today()}.json`, 'Plate backup');
    };
    $('#b-imp').onclick = () => $('#b-file').click();
    $('#b-file').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (j.app !== 'plate' || !j.data) throw new Error('bad');
        if (!confirm(cloud ? 'Load this backup into your account? Days and foods in the backup replace the same days and lists in your account.' : 'Replace everything on this phone with this backup?')) return;
        if (!cloud) { await DB.clear(); meta = Object.assign(freshMeta(), { owner: meta.owner }); }
        for (const [k, v] of Object.entries(j.data)) if (isDataKey(k)) await put(k, v);
        S.days.clear(); await loadState(); toast('Backup restored'); renderSettings();
      } catch (err) { toast("That file isn't a Plate backup"); }
      e.target.value = '';
    };
    $('#wipe').onclick = async () => {
      if (!confirm(cloud ? 'Erase your entire log, foods, meals, workouts, routines, settings, username and friends — on every device and in your account? This cannot be undone.' : 'Erase your entire log, foods, meals, workouts, routines and settings on this phone? This cannot be undone.')) return;
      if (!confirm('Really erase everything? Consider downloading a backup first.')) return;
      try { if (cloud) await remote.wipe(); }
      catch (err) { return toast("Couldn't reach your account — nothing was erased. Try again online."); }
      const owner = meta.owner;
      await DB.clear(); S.days.clear();
      meta = Object.assign(freshMeta(), { owner }); await saveMeta();
      await loadState();
      resetFriends();
      toast('Erased'); renderSettings();
    };
  }

  /* ================= Accounts: sign in / sign up / reset ================= */
  function authError(e) {
    const m = String((e && (e.code || e.message)) || e || '');
    const st = e && e.status;
    if (!navigator.onLine || /fetch|network|Failed to fetch|Load failed/i.test(m)) return "Can't reach the server. Check your connection and try again.";
    if (/invalid_credentials|Invalid login credentials/i.test(m)) return 'Wrong email or password.';
    if (/email_not_confirmed|Email not confirmed/i.test(m)) return 'Please confirm your email first — check your inbox (and spam folder) for the link.';
    if (/user_already_exists|already registered/i.test(m)) return 'That email already has an account. Sign in instead.';
    if (/weak_password|Password should be/i.test(m)) return 'Choose a longer password (at least 8 characters).';
    if (/rate|too many/i.test(m) || st === 429) return 'Too many attempts. Wait a few minutes and try again.';
    if (/signup_disabled|Signups not allowed/i.test(m)) return 'New accounts are turned off for this app.';
    if (/same_password|different from the old/i.test(m)) return 'Pick a password different from your old one.';
    return 'Something went wrong: ' + (e && e.message ? e.message : m);
  }
  function showAuth(mode, notice) {
    document.body.classList.remove('in-app'); document.body.classList.add('auth-mode');
    $('#topbar').innerHTML = '';
    const v = $('#view');
    const head = `<div class="auth-logo"><img src="icons/icon-192.png" alt=""><div><b>Plate</b><span>Food & macro log</span></div></div>`;
    const note = notice ? `<div class="note auth-note">${notice}</div>` : '';
    const field = (id, label, type, ac, extra = '') => `<label class="f"><span>${label}</span><input type="${type}" id="${id}" autocomplete="${ac}" ${extra}></label>`;
    const forms = {
      signin: `<h2>Sign in</h2>${note}
        <form id="af">${field('a-email', 'Email', 'email', 'email', 'inputmode="email" autocapitalize="off" required')}${field('a-pw', 'Password', 'password', 'current-password', 'required')}
        <p class="auth-err" id="a-err" role="alert"></p><button class="btn" type="submit">Sign in</button></form>
        <div class="auth-links"><a href="#" data-m="forgot">Forgot password?</a><a href="#" data-m="signup">Create an account</a></div>`,
      signup: `<h2>Create your account</h2>${note}<p class="hint">Each person gets their own log, visible only to friends they accept. Use an email you can check — you'll get a confirmation link.</p>
        <form id="af">${field('a-email', 'Email', 'email', 'email', 'inputmode="email" autocapitalize="off" required')}${field('a-pw', 'Password (8+ characters)', 'password', 'new-password', 'minlength="8" required')}${field('a-pw2', 'Confirm password', 'password', 'new-password', 'required')}
        <p class="auth-err" id="a-err" role="alert"></p><button class="btn" type="submit">Create account</button></form>
        <div class="auth-links"><a href="#" data-m="signin">I already have an account</a></div>`,
      forgot: `<h2>Reset password</h2>${note}<p class="hint">We'll email you a link to choose a new password.</p>
        <form id="af">${field('a-email', 'Email', 'email', 'email', 'inputmode="email" autocapitalize="off" required')}
        <p class="auth-err" id="a-err" role="alert"></p><button class="btn" type="submit">Send reset link</button></form>
        <div class="auth-links"><a href="#" data-m="signin">Back to sign in</a></div>`,
      newpass: `<h2>Choose a new password</h2>${note}
        <form id="af">${field('a-pw', 'New password (8+ characters)', 'password', 'new-password', 'minlength="8" required')}${field('a-pw2', 'Confirm password', 'password', 'new-password', 'required')}
        <p class="auth-err" id="a-err" role="alert"></p><button class="btn" type="submit">Save password</button></form>`,
      setup: `<h2>Accounts aren't set up yet</h2>
        <p class="hint">Sign-in needs the app's Supabase settings in <b>config.js</b> (see the README). Until then you can use Plate on this phone only.</p>
        <button class="btn" id="a-local">Use on this phone only</button>`,
    };
    v.innerHTML = `<div class="auth">${head}<div class="card auth-card">${forms[mode]}</div></div>`;
    $$('[data-m]', v).forEach((a) => a.onclick = (e) => { e.preventDefault(); showAuth(a.dataset.m); });
    const lb = $('#a-local', v); if (lb) lb.onclick = () => enterApp(null);
    const form = $('#af', v); if (!form) return;
    const err = (m) => { $('#a-err').textContent = m || ''; };
    const btn = $('button[type=submit]', form);
    setTimeout(() => { const f = $('input', form); if (f && window.innerWidth > 700) f.focus(); }, 50);
    form.onsubmit = async (e) => {
      e.preventDefault(); err('');
      const email = ($('#a-email') || {}).value ? $('#a-email').value.trim() : '';
      const pw = ($('#a-pw') || {}).value || '', pw2 = ($('#a-pw2') || {}).value;
      if ((mode === 'signup' || mode === 'newpass') && pw.length < 8) return err('Use at least 8 characters.');
      if ((mode === 'signup' || mode === 'newpass') && pw !== pw2) return err("Passwords don't match.");
      btn.disabled = true; const label = btn.textContent; btn.innerHTML = '<span class="spin"></span>' + label;
      try {
        if (mode === 'signin') { const u = await remote.signIn(email, pw); return enterApp(u); }
        if (mode === 'signup') {
          const r = await remote.signUp(email, pw);
          if (r.hasSession) return enterApp(r.user);
          return showAuth('signin', `Almost done — we sent a confirmation link to <b>${esc(email)}</b>. Tap it, then sign in here. (Check spam if it doesn't arrive in a few minutes.)`);
        }
        if (mode === 'forgot') { await remote.resetPassword(email); return showAuth('signin', `If <b>${esc(email)}</b> has an account, a reset link is on its way. Open it on this phone.`); }
        if (mode === 'newpass') {
          await remote.setPassword(pw);
          history.replaceState(history.state, '', appUrl());
          toast('Password updated');
          return enterApp(await remote.getUser());
        }
      } catch (ex) { err(authError(ex)); }
      finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = label; } }
    };
  }

  function openPasswordSheet() {
    openSheet((el) => {
      el.innerHTML = `<div class="grab"></div>${sheetHead('Change password')}
        <label class="f"><span>New password (8+ characters)</span><input type="password" id="np1" autocomplete="new-password"></label>
        <label class="f"><span>Confirm password</span><input type="password" id="np2" autocomplete="new-password"></label>
        <p class="auth-err" id="np-err"></p><button class="btn" id="np-save">Save password</button>`;
      wireClose(el);
      $('#np-save', el).onclick = async () => {
        const a = $('#np1', el).value, b = $('#np2', el).value, er = $('#np-err', el);
        if (a.length < 8) return er.textContent = 'Use at least 8 characters.';
        if (a !== b) return er.textContent = "Passwords don't match.";
        try { await remote.setPassword(a); await closeSheets(1); toast('Password updated'); }
        catch (e) { er.textContent = authError(e); }
      };
    });
  }

  async function signOut() {
    await window.PlateLift.flush();
    if (meta.dirty.length) await Sync.run();
    if (window.PlateLift.hasOpenWorkout() && !confirm('You have a workout in progress. Sign out anyway? Once it has synced, you can pick it back up after signing in.')) return;
    if (meta.dirty.length && !confirm(`${meta.dirty.length} change(s) haven't reached your account yet (you may be offline). Sign out anyway and lose them?`)) return;
    if (!confirm('Sign out? Your log stays safe in your account; it is removed from this phone until you sign in again.')) return;
    try { await remote.signOut(); } catch (e) { /* signing out locally is enough */ }
    await DB.clear();
    location.replace(appUrl());
  }

  /* When someone signs in, make sure this phone's stored data belongs to them. */
  async function claimLocalData(u) {
    await loadMeta();
    if (meta.owner && meta.owner !== 'local' && meta.owner !== u.id) {
      await DB.clear(); meta = freshMeta();               // a different person's data was here: start clean
    } else if (meta.owner !== u.id) {
      // Data logged before accounts existed (v1 / phone-only mode): upload it to this account.
      // Timestamp 1 means anything already in the account takes priority over it.
      const keys = (await DB.keys()).filter(isDataKey);
      keys.forEach((k) => { if (!meta.updated[k]) meta.updated[k] = 1; if (!meta.dirty.includes(k)) meta.dirty.push(k); });
      meta.cursor = null;
    }
    meta.owner = u.id; meta.email = u.email || meta.email; await saveMeta();
  }

  let appStarted = false;
  async function enterApp(u) {
    user = u ? { id: u.id, email: u.email } : null;
    try {
      if (user) await claimLocalData(user);
      else { await loadMeta(); if (!meta.owner) { meta.owner = 'local'; await saveMeta(); } }
      await loadState();
    } catch (e) { console.error(e); toast('Storage unavailable — is private browsing on?', 5000); }
    document.body.classList.remove('auth-mode'); document.body.classList.add('in-app');
    S.tab = 'diary'; S.date = today();
    render();
    if (user) { Sync.run(); refreshFriendsBadge(); }
    if (!appStarted) {
      appStarted = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !document.body.classList.contains('in-app')) return;
        if (S.tab === 'diary' && !sheets.length) renderDiary();
        Sync.run(); // pick up changes made on the other device
        refreshFriendsBadge();
      });
      window.addEventListener('online', () => Sync.run());
    }
  }

  /* ================= Boot ================= */
  async function boot() {
    history.replaceState({ depth: 0 }, '');
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
    }
    if (!remote) {
      await loadMeta();
      // No cloud configured: phone-only mode (skip the screen for people already using it)
      if (meta.owner === 'local' || (await DB.keys()).some(isDataKey)) return enterApp(null);
      return showAuth('setup');
    }
    remote.onAuth((ev) => {
      if (ev === 'PASSWORD_RECOVERY') showAuth('newpass');
      if (ev === 'SIGNED_OUT' && user) location.replace(appUrl());
    });
    let u = null;
    try {
      // A weak signal can leave this waiting forever, so give up after a few seconds and open from this phone.
      u = await Promise.race([remote.getUser(), new Promise((_, rej) => setTimeout(() => rej(new Error('sign-in check timed out')), 4000))]);
    }
    catch (e) {
      // Can't reach the server (e.g. no signal): open the signed-in person's log from this phone anyway.
      console.warn(e);
      await loadMeta();
      if (meta.owner && meta.owner !== 'local' && !recoveryInUrl) return enterApp({ id: meta.owner, email: meta.email || '' });
    }
    if (recoveryInUrl) return showAuth('newpass');
    if (u) {
      if (location.hash.includes('access_token')) history.replaceState({ depth: 0 }, '', appUrl());
      return enterApp(u);
    }
    showAuth('signin');
  }
  window.__plate = { S, C, DB, makePDF, buildReport, Sync, get meta() { return meta; } }; // for debugging
  /* What lift.js needs from here. Everything else in this file stays private. */
  window.PlateApp = { DB, put, S, C, $, $$, esc, ICON, toast, owner: () => meta.owner, topSheet: () => (sheets.length ? sheets[sheets.length - 1].el : null), openSheet, closeSheets, sheetHead, wireClose, sheetsOpen: () => sheets.length > 0 };
  boot();
})();
