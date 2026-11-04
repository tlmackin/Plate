/* Plate — the Lift tab: exercise library, custom exercises and the routine builder.
   Saved in the same synced key/value store as the food log (see app.js), so offline use, sync,
   backup and "erase all my data" cover it automatically. Keys:
     wo:r:<id>     one routine (null once deleted, so the deletion reaches other devices)
     wo:s:<id>     one workout session (one record per workout, so saving again can't duplicate it)
     wo:exercises  custom exercises     wo:favs  favorite exercise ids     wo:prefs  unit and default rest
     _wo_rest      the running rest timer (this device only; keys starting with _ never sync) */
(function () {
  'use strict';
  const L = window.LiftCore;
  const LIBRARY = window.PLATE_EXERCISES || [];
  const A = () => window.PlateApp; // filled in by app.js before it starts
  const ROUTINE_PREFIX = 'wo:r:';
  const SESSION_PREFIX = 'wo:s:';
  const DEFAULT_PREFS = () => ({ unit: 'lb', rest: 90, restAlert: true });
  const St = {
    pane: 'workout',
    routines: [], custom: [], favs: [], prefs: DEFAULT_PREFS(), sessions: [],
    filter: { q: '', muscle: '', equipment: '', level: '', scope: 'all' },
  };
  /* The workout on screen. W.s is the working copy while its sheet is open. */
  const W = { s: null, repaint: null, saveTimer: null, rest: null, ticker: null, finishing: false };

  async function load() {
    const { DB } = A();
    if (!W.s) await recoverJournal();
    const keys = (await DB.keys()).filter((k) => typeof k === 'string');
    const routines = await Promise.all(keys.filter((k) => k.startsWith(ROUTINE_PREFIX)).map((k) => DB.get(k)));
    const sessions = await Promise.all(keys.filter((k) => k.startsWith(SESSION_PREFIX)).map((k) => DB.get(k)));
    St.routines = routines.filter(Boolean).sort(byRoutineName);
    St.custom = (await DB.get('wo:exercises')) || [];
    St.favs = (await DB.get('wo:favs')) || [];
    St.prefs = Object.assign(DEFAULT_PREFS(), (await DB.get('wo:prefs')) || {});
    St.sessions = sessions.filter((s) => s && s.status !== 'discarded').sort((a, b) => b.startedAt - a.startedAt);
    W.rest = (await DB.get('_wo_rest')) || null;
    reconcileOpenWorkout(sessions.filter(Boolean));
    updateMini();
  }
  /* A sync brought in new data while a workout is on screen. Keep what's being typed, take newer changes
     from another device otherwise, and leave the screen if the workout was ended over there. */
  function reconcileOpenWorkout(docs) {
    if (!W.s) return;
    const incoming = docs.find((d) => d.id === W.s.id);
    if (incoming && (incoming.status === 'completed' || incoming.status === 'discarded') && incoming.updatedAt > W.s.updatedAt) {
      clearTimeout(W.saveTimer); W.saveTimer = null; W.s = null;
      A().closeSheets(99);
      A().toast('This workout was ended on another device');
      return;
    }
    const typing = W.saveTimer || (document.activeElement && document.activeElement.closest && document.activeElement.matches('input, textarea, select') && document.activeElement.closest('.wk-sheet'));
    if (incoming && incoming.updatedAt > W.s.updatedAt && !typing) { W.s = incoming; if (W.repaint) W.repaint(); }
    St.sessions = [W.s, ...St.sessions.filter((x) => x.id !== W.s.id)].sort((a, b) => b.startedAt - a.startedAt);
  }
  const routineName = (r) => r.name || 'Untitled routine';
  const byRoutineName = (a, b) => routineName(a).localeCompare(routineName(b));
  const allExercises = () => LIBRARY.concat(St.custom);
  const findExercise = (id) => allExercises().find((e) => e.id === id);
  const repaintIfOnTab = () => { if (A().S.tab === 'lift' && !A().sheetsOpen()) render(); };

  const isFav = (id) => St.favs.includes(id);
  async function toggleFav(id) {
    St.favs = isFav(id) ? St.favs.filter((x) => x !== id) : [id, ...St.favs];
    await A().put('wo:favs', St.favs);
    return isFav(id);
  }

  /* ================= Muscle diagram =================
     A simple front and back figure. Colour is never the only signal: the caption names the muscles. */
  const REGIONS = {
    front: {
      shoulders: '<ellipse cx="34" cy="46" rx="10" ry="9"/><ellipse cx="86" cy="46" rx="10" ry="9"/>',
      chest: '<ellipse cx="49" cy="54" rx="11" ry="9"/><ellipse cx="71" cy="54" rx="11" ry="9"/>',
      biceps: '<ellipse cx="28" cy="70" rx="5.5" ry="12"/><ellipse cx="92" cy="70" rx="5.5" ry="12"/>',
      forearms: '<ellipse cx="23" cy="98" rx="5" ry="14"/><ellipse cx="97" cy="98" rx="5" ry="14"/>',
      core: '<rect x="47" y="66" width="26" height="44" rx="7"/>',
      quads: '<ellipse cx="48" cy="142" rx="10.5" ry="27"/><ellipse cx="72" cy="142" rx="10.5" ry="27"/>',
      calves: '<ellipse cx="48" cy="199" rx="6.5" ry="20"/><ellipse cx="72" cy="199" rx="6.5" ry="20"/>',
    },
    back: {
      shoulders: '<ellipse cx="34" cy="46" rx="10" ry="9"/><ellipse cx="86" cy="46" rx="10" ry="9"/>',
      back: '<path d="M46 38h28l7 22-8 42H47l-8-42z"/>',
      triceps: '<ellipse cx="28" cy="70" rx="5.5" ry="12"/><ellipse cx="92" cy="70" rx="5.5" ry="12"/>',
      forearms: '<ellipse cx="23" cy="98" rx="5" ry="14"/><ellipse cx="97" cy="98" rx="5" ry="14"/>',
      glutes: '<ellipse cx="49" cy="118" rx="11" ry="11"/><ellipse cx="71" cy="118" rx="11" ry="11"/>',
      hamstrings: '<ellipse cx="48" cy="155" rx="10" ry="22"/><ellipse cx="72" cy="155" rx="10" ry="22"/>',
      calves: '<ellipse cx="48" cy="199" rx="7.5" ry="19"/><ellipse cx="72" cy="199" rx="7.5" ry="19"/>',
    },
  };
  const FIGURE_BASE = '<circle class="bm-base" cx="60" cy="17" r="12"/><rect class="bm-base" x="54" y="27" width="12" height="10" rx="3"/>';
  function bodyMap(ex) {
    const { esc } = A();
    const secondary = ex.secondary || [];
    const everything = ex.primary === 'full_body';
    const cls = (m) => (m === ex.primary ? 'on-p' : everything || secondary.includes(m) ? 'on-s' : '');
    const figure = (side, title) => `<figure><svg viewBox="0 0 120 225" aria-hidden="true">${FIGURE_BASE}${
      Object.entries(REGIONS[side]).map(([m, shape]) => `<g class="bm-r ${cls(m)}">${shape}</g>`).join('')}</svg><figcaption>${title}</figcaption></figure>`;
    const names = (list) => list.map(L.muscleLabel).filter(Boolean).join(', ');
    return `<div class="bodymap">${figure('front', 'Front')}${figure('back', 'Back')}
      <div class="bm-key"><p><i class="bm-swatch p"></i><span><b>Primary</b><br>${esc(L.muscleLabel(ex.primary))}</span></p>
      ${secondary.length ? `<p><i class="bm-swatch s"></i><span><b>Secondary</b><br>${esc(names(secondary))}</span></p>` : ''}</div></div>`;
  }

  /* ================= Exercise list (used by the tab and by the routine picker) ================= */
  const exerciseSub = (e) => [L.muscleLabel(e.primary), L.equipmentLabel(e.equipment), L.levelLabel(e.level)].filter(Boolean).join(' · ');
  function filtersHTML(f, showScope) {
    const { esc, ICON } = A();
    const options = (list, chosen, all) => `<option value="">${all}</option>${list.map((x) => `<option value="${x.id}" ${x.id === chosen ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}`;
    return `<div class="searchbar lift-search"><span class="lift-search-ic">${ICON.search}</span><input type="search" class="lift-q" placeholder="Search exercises" aria-label="Search exercises" value="${esc(f.q)}" autocomplete="off"></div>
      <div class="lift-filters">
        <select class="lift-f" data-f="muscle" aria-label="Muscle group">${options(L.MUSCLES, f.muscle, 'Muscle')}</select>
        <select class="lift-f" data-f="equipment" aria-label="Equipment">${options(L.EQUIPMENT, f.equipment, 'Equipment')}</select>
        <select class="lift-f" data-f="level" aria-label="Difficulty">${options(L.LEVELS, f.level, 'Level')}</select>
      </div>
      ${showScope ? `<div class="seg lift-scope">${[['all', 'All'], ['favs', 'Favorites'], ['mine', 'My exercises']].map(([k, t]) => `<button data-scope="${k}" class="${f.scope === k ? 'on' : ''}">${t}</button>`).join('')}</div>` : ''}`;
  }
  const runFilter = (f) => L.searchExercises(allExercises(), {
    q: f.q, muscle: f.muscle, equipment: f.equipment, level: f.level,
    favs: f.scope === 'favs' ? St.favs : null, mineOnly: f.scope === 'mine',
  });
  /* Results, with an A-Z heading each time the first letter changes. pick: Set of chosen ids when choosing for a routine. */
  function resultsHTML(list, f, pick) {
    const { esc } = A();
    if (!list.length) {
      const empty = f.scope === 'favs' && !St.favs.length ? 'No favorites yet. Open an exercise and tap the star.'
        : f.scope === 'mine' && !St.custom.length ? 'Exercises you create are saved here.' : 'No exercises match. Try fewer filters.';
      return `<div class="note">${empty}</div>`;
    }
    let letter = '';
    const rows = [];
    list.forEach((e) => {
      const first = /^[a-z]/i.test(e.name) ? e.name[0].toUpperCase() : '#';
      if (first !== letter) { letter = first; rows.push(`<div class="lift-letter">${esc(letter)}</div>`); }
      const text = `<div class="main"><div class="name">${esc(e.name)}</div><div class="sub">${e.custom ? '<span class="badge">Mine</span>' : ''}${esc(exerciseSub(e))}</div></div>`;
      if (pick) {
        const on = pick.has(e.id);
        rows.push(`<div class="lift-pickrow"><button class="item" data-pick="${esc(e.id)}" aria-pressed="${on}"><span class="lift-check ${on ? 'on' : ''}">${on ? '✓' : ''}</span>${text}</button>
          <button class="lift-info" data-info="${esc(e.id)}" aria-label="About ${esc(e.name)}">i</button></div>`);
      } else {
        rows.push(`<button class="item" data-ex="${esc(e.id)}">${text}${isFav(e.id) ? '<span class="lift-fav" aria-label="Favorite">★</span>' : ''}</button>`);
      }
    });
    return `<p class="small muted lift-count">${list.length} exercise${list.length === 1 ? '' : 's'}</p><div class="list lift-list">${rows.join('')}</div>`;
  }
  /* Wires the search box and filter menus inside root. onChange repaints the results only, so the keyboard stays open. */
  function wireFilters(root, f, onChange) {
    const { $, $$ } = A();
    $('.lift-q', root).addEventListener('input', (e) => { f.q = e.target.value; onChange(); });
    $$('.lift-f', root).forEach((s) => s.addEventListener('change', () => { f[s.dataset.f] = s.value; onChange(); }));
  }

  /* ================= Exercise detail ================= */
  function detailList(title, items, ordered) {
    const { esc } = A();
    if (!items || !items.length) return '';
    const tag = ordered ? 'ol' : 'ul';
    return `<section class="card lift-detail"><h2>${title}</h2><${tag}>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</${tag}></section>`;
  }
  function openExercise(ex) {
    const { openSheet, sheetHead, wireClose, esc, $, $$, ICON } = A();
    openSheet((el) => {
      const alternatives = (ex.alternatives || []).map(findExercise).filter(Boolean);
      el.innerHTML = `<div class="grab"></div>${sheetHead(ex.name, exerciseSub(ex))}
        <div class="row" style="margin-bottom:10px">
          <button class="star ${isFav(ex.id) ? 'on' : ''}" id="ex-fav" aria-label="Favorite" aria-pressed="${isFav(ex.id)}">${ICON.star}</button>
          <span class="small muted" id="ex-favt">${isFav(ex.id) ? 'In your favorites' : 'Add to favorites'}</span>
          <span class="spacer"></span>
          ${ex.custom ? '<button class="chipbtn ghost" id="ex-edit">Edit</button>' : ''}
        </div>
        <section class="card">${bodyMap(ex)}</section>
        ${ex.custom && ex.notes ? `<section class="card lift-detail"><h2>Your notes</h2><p class="lift-notes">${esc(ex.notes)}</p></section>` : ''}
        ${detailList('How to do it', ex.steps, true)}
        ${detailList('Good form', ex.form)}
        ${detailList('Common mistakes', ex.mistakes)}
        ${detailList('Safety', ex.safety)}
        ${detailList('Variations', ex.variations)}
        ${alternatives.length ? `<section class="card lift-detail"><h2>Alternatives</h2><div class="lift-alts">${alternatives.map((a) => `<button class="item" data-alt="${esc(a.id)}"><div class="main"><div class="name">${esc(a.name)}</div><div class="sub">${esc(exerciseSub(a))}</div></div></button>`).join('')}</div></section>` : ''}
        ${ex.custom ? '' : '<p class="small muted lift-disclaimer">General guidance only. Start light, and stop if something hurts.</p>'}`;
      wireClose(el);
      $('#ex-fav', el).onclick = async () => {
        const on = await toggleFav(ex.id);
        const b = $('#ex-fav', el);
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
        $('#ex-favt', el).textContent = on ? 'In your favorites' : 'Add to favorites';
      };
      const edit = $('#ex-edit', el);
      if (edit) edit.onclick = () => openCustomForm({ exercise: ex, onSaved: () => A().closeSheets(1) });
      $$('[data-alt]', el).forEach((b) => { b.onclick = () => openExercise(findExercise(b.dataset.alt)); });
    }, { full: true, onClose: repaintIfOnTab });
  }

  /* ================= Custom exercise form ================= */
  function openCustomForm({ exercise, onSaved }) {
    const { openSheet, sheetHead, wireClose, closeSheets, esc, $, $$, toast, put } = A();
    const v = exercise || { primary: '', secondary: [], equipment: '', level: 'beginner', measure: 'weight_reps' };
    const options = (list, chosen, prompt) => `${prompt ? `<option value="">${prompt}</option>` : ''}${list.map((x) => `<option value="${x.id}" ${x.id === chosen ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}`;
    openSheet((el) => {
      el.innerHTML = `${sheetHead(exercise ? 'Edit exercise' : 'Create an exercise')}
        <label class="f"><span>Name *</span><input type="text" id="cx-name" maxlength="80" value="${esc(v.name || '')}" placeholder="e.g. Landmine press"></label>
        <div class="grid2">
          <label class="f"><span>Main muscle group *</span><select id="cx-primary">${options(L.MUSCLES, v.primary, 'Choose')}</select></label>
          <label class="f"><span>Equipment *</span><select id="cx-equipment">${options(L.EQUIPMENT, v.equipment, 'Choose')}</select></label>
        </div>
        <div class="f"><span class="lift-flabel">Other muscles worked</span>
          <div class="lift-chips">${L.MUSCLES.filter((m) => m.id !== 'full_body').map((m) => `<button type="button" class="lift-chip ${(v.secondary || []).includes(m.id) ? 'on' : ''}" data-m="${m.id}" aria-pressed="${(v.secondary || []).includes(m.id)}">${esc(m.label)}</button>`).join('')}</div></div>
        <div class="grid2">
          <label class="f"><span>Difficulty</span><select id="cx-level">${options(L.LEVELS, v.level)}</select></label>
          <label class="f"><span>What you record</span><select id="cx-measure">${options(L.MEASURES, v.measure)}</select></label>
        </div>
        <label class="lift-check-line"><input type="checkbox" id="cx-uni" ${v.unilateral ? 'checked' : ''}><span>Done one side at a time</span></label>
        <label class="f"><span>Your notes (optional)</span><textarea id="cx-notes" rows="3" placeholder="Setup, cues, machine settings">${esc(v.notes || '')}</textarea></label>
        <div class="btnrow">${exercise ? '<button class="btn danger" id="cx-del">Delete</button>' : ''}<button class="btn" id="cx-save">${exercise ? 'Save' : 'Save exercise'}</button></div>`;
      wireClose(el);
      $$('.lift-chip', el).forEach((b) => { b.onclick = () => { const on = b.classList.toggle('on'); b.setAttribute('aria-pressed', on); }; });
      if (!exercise) setTimeout(() => $('#cx-name', el).focus(), 250);
      $('#cx-save', el).onclick = async () => {
        const form = {
          name: $('#cx-name', el).value, primary: $('#cx-primary', el).value, equipment: $('#cx-equipment', el).value, level: $('#cx-level', el).value,
          measure: $('#cx-measure', el).value, unilateral: $('#cx-uni', el).checked, notes: $('#cx-notes', el).value,
          secondary: $$('.lift-chip.on', el).map((b) => b.dataset.m),
        };
        const problem = L.validateCustom(form, allExercises(), exercise && exercise.id);
        if (problem) return toast(problem);
        const saved = L.customFromForm(form, exercise && exercise.id);
        St.custom = [saved, ...St.custom.filter((e) => e.id !== saved.id)];
        await put('wo:exercises', St.custom);
        await closeSheets(1);
        toast(exercise ? 'Exercise updated' : 'Exercise saved');
        if (onSaved) await onSaved(saved);
        repaintIfOnTab();
      };
      const del = $('#cx-del', el);
      if (del) del.onclick = async () => {
        if (!confirm(`Delete “${exercise.name}”? Routines that already use it keep their copy.`)) return;
        St.custom = St.custom.filter((e) => e.id !== exercise.id);
        St.favs = St.favs.filter((id) => id !== exercise.id);
        await Promise.all([put('wo:exercises', St.custom), put('wo:favs', St.favs)]);
        await closeSheets(2); // the form and the detail sheet behind it
        toast('Exercise deleted');
        repaintIfOnTab();
      };
    });
  }

  /* ================= Exercise picker (adding to a routine) ================= */
  function openPicker(onDone) {
    const { openSheet, sheetHead, wireClose, closeSheets, $, $$ } = A();
    const f = { q: '', muscle: '', equipment: '', level: '', scope: 'all' };
    const chosen = new Set();
    openSheet((el) => {
      el.innerHTML = `${sheetHead('Add exercises')}${filtersHTML(f, false)}
        <button class="btn secondary" id="pk-new" style="margin-bottom:10px">+ Create an exercise</button>
        <div id="pk-list"></div>
        <div class="lift-stickybar"><button class="btn" id="pk-done" disabled>Add exercises</button></div>`;
      wireClose(el);
      const paint = () => { $('#pk-list', el).innerHTML = resultsHTML(runFilter(f), f, chosen); };
      const paintDone = () => {
        const b = $('#pk-done', el);
        b.disabled = !chosen.size;
        b.textContent = chosen.size ? `Add ${chosen.size} exercise${chosen.size === 1 ? '' : 's'}` : 'Add exercises';
      };
      paint();
      wireFilters(el, f, paint);
      $('#pk-list', el).addEventListener('click', (e) => {
        const info = e.target.closest('[data-info]');
        if (info) return openExercise(findExercise(info.dataset.info));
        const row = e.target.closest('[data-pick]');
        if (!row) return;
        const id = row.dataset.pick;
        if (chosen.has(id)) chosen.delete(id); else chosen.add(id);
        const on = chosen.has(id);
        row.setAttribute('aria-pressed', on);
        const box = $('.lift-check', row); box.classList.toggle('on', on); box.textContent = on ? '✓' : '';
        paintDone();
      });
      $('#pk-new', el).onclick = () => openCustomForm({ onSaved: (saved) => { chosen.add(saved.id); paint(); paintDone(); } });
      $('#pk-done', el).onclick = async () => {
        const list = [...chosen].map(findExercise).filter(Boolean);
        await closeSheets(1);
        onDone(list);
      };
    }, { full: true });
  }

  /* ================= Routine editor =================
     Changes save themselves as you go, so the back button or a closed app can't lose them. */
  const FIELD_INFO = {
    w: (it) => (it.measure === 'assisted' ? 'Assist' : it.measure === 'reps' ? 'Added' : 'Weight'),
    reps: () => 'Reps', secs: () => 'Seconds', dist: () => 'Metres',
  };
  function restLabel(s) {
    if (!s) return 'No timer';
    return s % 60 ? `${s} sec` : `${s / 60} min`;
  }
  function setRowHTML(item, set, i) {
    const { esc } = A();
    const fields = L.measureFields(item.measure);
    const input = (field) => `<label class="lift-in"><span class="lift-sr">${FIELD_INFO[field](item)}, set ${i + 1}</span>
        <input type="text" inputmode="${field === 'reps' ? 'numeric' : 'decimal'}" data-set="${esc(set.id)}" data-field="${field}" value="${set[field] == null ? '' : esc(set[field])}" placeholder="–">
        ${field === 'w' ? `<em>${esc(set.u)}</em>` : ''}</label>`;
    return `<div class="lift-setrow f${fields.length}"><span class="lift-setno num">${i + 1}</span>${fields.map(input).join('')}
      <button class="lift-x" data-rmset="${esc(set.id)}" ${item.sets.length < 2 ? 'disabled' : ''} aria-label="Remove set ${i + 1}">×</button></div>`;
  }
  function itemHTML(item, i, count) {
    const { esc, ICON } = A();
    const fields = L.measureFields(item.measure);
    return `<section class="card lift-item" data-uid="${esc(item.uid)}">
      <div class="lift-item-head">
        <div class="main"><h2>${esc(item.name)}</h2><div class="small muted">${esc(L.muscleLabel(item.primary))}</div></div>
        <button class="lift-move" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(item.name)} up"><span class="up">${ICON.right}</span></button>
        <button class="lift-move" data-move="1" ${i === count - 1 ? 'disabled' : ''} aria-label="Move ${esc(item.name)} down"><span class="down">${ICON.right}</span></button>
        <button class="lift-move" data-rmitem aria-label="Remove ${esc(item.name)}">${ICON.close}</button>
      </div>
      <div class="lift-setrow lift-sethead f${fields.length}" aria-hidden="true"><span>Set</span>${fields.map((f) => `<span>${FIELD_INFO[f](item)}</span>`).join('')}<span></span></div>
      ${item.sets.map((s, n) => setRowHTML(item, s, n)).join('')}
      <button class="chipbtn lift-addset" data-addset>+ Add set</button>
      <div class="grid2 lift-item-opts">
        <label class="f"><span>Rest timer</span><select data-rest>${L.REST_CHOICES.map((r) => `<option value="${r}" ${r === item.rest ? 'selected' : ''}>${restLabel(r)}</option>`).join('')}</select></label>
        <label class="f"><span>Note</span><input type="text" data-note value="${esc(item.note)}" placeholder="Optional"></label>
      </div>
    </section>`;
  }
  function openRoutine(routine, opts = {}) {
    const { openSheet, wireClose, closeSheets, esc, $, $$, put, toast, ICON } = A();
    const draft = JSON.parse(JSON.stringify(routine));
    let deleted = false, saved = !!opts.existing, changed = !!opts.unsaved, timer = null;
    const persist = async () => {
      clearTimeout(timer); timer = null;
      if (deleted || !changed || !L.routineHasContent(draft)) return false;
      changed = false; saved = true;
      draft.updatedAt = Date.now();
      const copy = JSON.parse(JSON.stringify(draft));
      St.routines = [copy, ...St.routines.filter((r) => r.id !== copy.id)].sort(byRoutineName);
      await put(ROUTINE_PREFIX + copy.id, copy);
      return true;
    };
    const touched = () => { changed = true; clearTimeout(timer); timer = setTimeout(persist, 700); };
    const flushNow = () => { if (changed) persist(); };
    window.addEventListener('pagehide', flushNow);
    openSheet((el) => {
      const paint = () => {
        const top = el.scrollTop;
        const stats = L.routineStats(draft);
        el.innerHTML = `<div class="sheet-head"><h3>${opts.existing ? 'Edit routine' : 'New routine'}</h3><button class="iconbtn" data-close aria-label="Done">${ICON.close}</button></div>
          <label class="f"><span>Routine name</span><input type="text" id="rt-name" maxlength="60" value="${esc(draft.name)}" placeholder="e.g. Push Day"></label>
          ${draft.items.length ? `<p class="small muted" style="margin:0 2px 10px">${stats.exercises} exercise${stats.exercises === 1 ? '' : 's'} · ${stats.sets} set${stats.sets === 1 ? '' : 's'}</p>` : '<div class="note">Add the exercises for this routine. You can set targets and reorder them next.</div>'}
          ${draft.items.map((it, i) => itemHTML(it, i, draft.items.length)).join('')}
          <button class="btn secondary" id="rt-add" style="margin-bottom:12px">+ Add exercises</button>
          ${draft.items.length ? '<button class="btn" id="rt-start" style="margin-bottom:10px">Start workout</button>' : ''}
          <button class="btn ${draft.items.length ? 'secondary' : ''}" id="rt-done">Done</button>
          ${saved ? `<div class="btnrow" style="margin-top:10px"><button class="btn secondary" id="rt-dup">Duplicate</button><button class="btn danger" id="rt-del">Delete</button></div>` : ''}`;
        el.scrollTop = top;
        wireClose(el);
        $('#rt-done', el).onclick = () => closeSheets(1);
        const startBtn = $('#rt-start', el);
        if (startBtn) startBtn.onclick = async () => {
          await persist();
          const snapshot = JSON.parse(JSON.stringify(draft));
          await closeSheets(1);
          beginWorkout(snapshot);
        };
        $('#rt-add', el).onclick = () => openPicker((list) => {
          list.forEach((ex) => draft.items.push(L.newItem(ex, St.prefs)));
          touched(); paint();
        });
        const dup = $('#rt-dup', el);
        if (dup) dup.onclick = async () => {
          await persist();
          const copy = L.duplicateRoutine(draft);
          await closeSheets(1);
          openRoutine(copy, { unsaved: true });
          toast('Copied. Rename it and change anything you like.');
        };
        const del = $('#rt-del', el);
        if (del) del.onclick = async () => {
          if (!confirm(`Delete “${routineName(draft)}”?`)) return;
          deleted = true; clearTimeout(timer);
          St.routines = St.routines.filter((r) => r.id !== draft.id);
          await put(ROUTINE_PREFIX + draft.id, null);
          await closeSheets(1);
          toast('Routine deleted');
        };
      };
      paint();
      if (!opts.existing && !draft.name) setTimeout(() => { const n = $('#rt-name', el); if (n) n.focus(); }, 250);
      /* One listener on the sheet: it survives repaints, and typing never repaints, so the keyboard stays open. */
      el.addEventListener('input', (e) => {
        const t = e.target;
        if (t.id === 'rt-name') { draft.name = t.value.trim(); return touched(); }
        const card = t.closest('[data-uid]'); if (!card) return;
        const item = draft.items.find((x) => x.uid === card.dataset.uid); if (!item) return;
        if (t.dataset.field) {
          const set = item.sets.find((s) => s.id === t.dataset.set);
          if (set) { set[t.dataset.field] = L.cleanNumber(t.value, t.dataset.field); touched(); }
        } else if ('note' in t.dataset) { item.note = t.value; touched(); }
      });
      el.addEventListener('change', (e) => {
        const t = e.target;
        if (!('rest' in t.dataset)) return;
        const item = draft.items.find((x) => x.uid === t.closest('[data-uid]').dataset.uid);
        if (item) { item.rest = Number(t.value); touched(); }
      });
      el.addEventListener('click', (e) => {
        const card = e.target.closest('[data-uid]'); if (!card) return;
        const index = draft.items.findIndex((x) => x.uid === card.dataset.uid); if (index < 0) return;
        const item = draft.items[index];
        const btn = e.target.closest('button'); if (!btn || btn.disabled) return;
        if (btn.dataset.move) L.moveItem(draft.items, index, Number(btn.dataset.move));
        else if ('rmitem' in btn.dataset) draft.items.splice(index, 1);
        else if ('addset' in btn.dataset) L.addSet(item, St.prefs.unit);
        else if (btn.dataset.rmset) L.removeSet(item, btn.dataset.rmset);
        else return;
        touched(); paint();
      });
    }, {
      full: true,
      onClose: async () => {
        window.removeEventListener('pagehide', flushNow);
        const wrote = await persist();
        if (wrote) toast('Routine saved');
        repaintIfOnTab();
      },
    });
  }

  /* ================= Saving a workout ================= */
  const unfinished = () => St.sessions.filter((s) => s.status === 'active' || s.status === 'paused');
  const completed = () => St.sessions.filter((s) => s.status === 'completed');
  /* The database write can be cancelled if the page closes in that instant, so every change first goes
     to localStorage, which finishes immediately. It's only a safety copy: removed once the real save
     lands, and picked up by recoverJournal if the page died first. */
  const JOURNAL_KEY = 'plate_wo_journal';
  function writeJournal(s) {
    try { localStorage.setItem(JOURNAL_KEY, JSON.stringify({ owner: A().owner(), session: s })); } catch (e) { /* storage full or blocked: the normal save still runs */ }
  }
  function clearJournal() { try { localStorage.removeItem(JOURNAL_KEY); } catch (e) { /* nothing to clear */ } }
  async function recoverJournal() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(JOURNAL_KEY)); } catch (e) { /* unreadable: ignore it */ }
    clearJournal();
    if (!saved || !saved.session || saved.owner !== A().owner()) return; // never hand one person's workout to another
    const s = saved.session;
    const stored = await A().DB.get(SESSION_PREFIX + s.id);
    if (!stored || s.updatedAt > stored.updatedAt) await A().put(SESSION_PREFIX + s.id, s);
  }
  async function saveSession(s) {
    s.updatedAt = Date.now();
    writeJournal(s);
    St.sessions = [s, ...St.sessions.filter((x) => x.id !== s.id)].sort((a, b) => b.startedAt - a.startedAt);
    await A().put(SESSION_PREFIX + s.id, JSON.parse(JSON.stringify(s)));
    if (!W.saveTimer) clearJournal(); // newer typing keeps its own safety copy until it saves
  }
  /* Typing saves after a short pause. A finished set or any other action saves straight away. */
  function saveSoon() {
    if (W.s) { W.s.updatedAt = Date.now(); writeJournal(W.s); }
    clearTimeout(W.saveTimer);
    W.saveTimer = setTimeout(() => { W.saveTimer = null; if (W.s) saveSession(W.s); }, 400);
  }
  async function flush() {
    if (!W.saveTimer) return;
    clearTimeout(W.saveTimer); W.saveTimer = null;
    if (W.s) await saveSession(W.s);
  }
  const saveNow = () => { clearTimeout(W.saveTimer); W.saveTimer = null; return saveSession(W.s); };
  window.addEventListener('pagehide', () => { flush(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    else if (W.s) keepScreenOn();
  });

  /* Keep the phone awake during a workout, where the browser allows it. */
  let wakeLock = null;
  async function keepScreenOn() {
    try { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } }
    catch (e) { /* not available here: the workout still works */ }
  }
  function letScreenSleep() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }

  /* ================= Rest timer ================= */
  let audio = null;
  function unlockAudio() { // browsers only allow sound after a tap, so this runs on the tap that starts the timer
    if (!St.prefs.restAlert) return;
    try { const Ctx = window.AudioContext || window.webkitAudioContext; if (Ctx) { audio = audio || new Ctx(); audio.resume(); } } catch (e) { audio = null; }
  }
  function restAlert() {
    A().toast('Rest finished');
    if (!St.prefs.restAlert) return;
    try { if (navigator.vibrate) navigator.vibrate([180, 90, 180]); } catch (e) { /* not available */ }
    try {
      if (!audio) return;
      [0, 0.25].forEach((at) => {
        const osc = audio.createOscillator(), gain = audio.createGain();
        osc.frequency.value = 880; gain.gain.value = 0.2;
        osc.connect(gain); gain.connect(audio.destination);
        osc.start(audio.currentTime + at); osc.stop(audio.currentTime + at + 0.16);
      });
    } catch (e) { /* no sound available */ }
  }
  const saveRest = () => { const { DB } = A(); return W.rest ? DB.set('_wo_rest', W.rest) : DB.del('_wo_rest'); };
  function setRest(rest) { W.rest = rest; saveRest(); paintRest(); ensureTicker(); }
  function restBarHTML() {
    const { esc } = A();
    if (!W.rest) {
      return `<span class="small muted wk-restlabel">Rest</span>${L.REST_CHOICES.filter(Boolean).map((r) => `<button class="wk-restbtn" data-rest-start="${r}" aria-label="Start ${restLabel(r)} rest">${r < 60 ? r + 's' : r % 60 ? r + 's' : r / 60 + 'm'}</button>`).join('')}`;
    }
    const paused = W.rest.pausedLeft != null;
    return `<button class="wk-restbtn" data-rest-add="-15" aria-label="15 seconds less">−15</button>
      <b class="num wk-resttime" id="wk-resttime" role="timer">${esc(L.formatClock(L.restLeft(W.rest)))}</b>
      <button class="wk-restbtn" data-rest-add="15" aria-label="15 seconds more">+15</button>
      <button class="wk-restbtn" data-rest-toggle>${paused ? 'Resume' : 'Pause'}</button>
      <button class="wk-restbtn" data-rest-skip>Skip</button>`;
  }
  function paintRest() { const bar = document.getElementById('wk-restbar'); if (bar) bar.innerHTML = restBarHTML(); }

  /* One clock for everything that counts: the workout screen, the rest timer and the mini bar. */
  function ensureTicker() {
    const needed = W.s || W.rest || unfinished().length;
    if (needed && !W.ticker) W.ticker = setInterval(tick, 1000);
    if (!needed && W.ticker) { clearInterval(W.ticker); W.ticker = null; }
  }
  function tick() {
    if (W.rest && W.rest.pausedLeft == null && L.restLeft(W.rest) <= 0) {
      W.rest = null; saveRest(); paintRest();
      if (document.visibilityState === 'visible') restAlert();
    }
    const time = document.getElementById('wk-resttime');
    if (time && W.rest) time.textContent = L.formatClock(L.restLeft(W.rest));
    const elapsed = document.getElementById('wk-elapsed');
    if (elapsed && W.s) elapsed.textContent = L.formatClock(L.sessionDuration(W.s));
    updateMini();
    ensureTicker();
  }

  /* ================= "Workout in progress" bar, shown above the tabs on every screen ================= */
  function updateMini() {
    let bar = document.getElementById('lift-mini');
    const s = unfinished()[0];
    const show = !!s && !W.s;
    document.body.classList.toggle('has-mini', show);
    if (!show) { if (bar) bar.hidden = true; ensureTicker(); return; }
    if (!bar) {
      bar = document.createElement('button');
      bar.id = 'lift-mini'; bar.className = 'lift-mini';
      bar.addEventListener('click', () => { const x = unfinished()[0]; if (x) openWorkout(x); });
      document.body.append(bar);
    }
    bar.hidden = false;
    const { esc } = A();
    const rest = W.rest ? ` · Rest ${L.formatClock(L.restLeft(W.rest))}` : '';
    bar.innerHTML = `<span class="lift-mini-dot ${s.status === 'paused' ? 'paused' : ''}"></span><span class="lift-mini-text"><b>${esc(s.name)}</b>
      <span class="num">${s.status === 'paused' ? 'Paused' : L.formatClock(L.sessionDuration(s))}${rest}</span></span><span class="lift-mini-go">Open</span>`;
    ensureTicker();
  }

  /* ================= Live workout ================= */
  const previousFor = (exId, s) => L.lastPerformance(St.sessions, exId, s.id);
  function weightUnitOf(ex) { return (ex.sets[0] && ex.sets[0].u) || St.prefs.unit; }
  function setTypeMark(set, ex) {
    const type = L.SET_TYPES.find((t) => t.id === set.type);
    if (type && type.mark) return type.mark;
    let n = 0;
    for (const x of ex.sets) { if (x.type !== 'warmup') n += 1; if (x.id === set.id) break; }
    return String(n);
  }
  function workoutSetRow(ex, set, i, prev) {
    const { esc } = A();
    const fields = L.measureFields(ex.measure);
    const prevSet = prev && prev.sets[i];
    const hint = L.setHint(set, prevSet);
    const prevText = prevSet ? L.formatSet(prevSet, ex.measure, true) : '–';
    const input = (f) => `<label class="wk-in"><span class="lift-sr">${FIELD_INFO[f](ex)}, set ${i + 1}</span>
      <input type="text" inputmode="${f === 'reps' ? 'numeric' : 'decimal'}" data-set="${esc(set.id)}" data-field="${f}" value="${set[f] == null ? '' : esc(set[f])}" placeholder="${hint[f] == null ? '–' : esc(hint[f])}"></label>`;
    return `<div class="wk-row f${fields.length} ${set.done ? 'done' : ''}" data-row="${esc(set.id)}">
      <label class="wk-type ${set.type !== 'normal' ? 'marked' : ''}"><span aria-hidden="true">${esc(setTypeMark(set, ex))}</span>
        <select data-type="${esc(set.id)}" aria-label="Set ${i + 1} type">${L.SET_TYPES.map((t) => `<option value="${t.id}" ${t.id === set.type ? 'selected' : ''}>${t.label}</option>`).join('')}</select></label>
      <button class="wk-prev num" data-use-prev="${esc(set.id)}" ${prevSet ? '' : 'disabled'} aria-label="${prevSet ? `Use last time's ${esc(L.formatSet(prevSet, ex.measure))}` : 'No previous set'}">${esc(prevText)}</button>
      ${fields.map(input).join('')}
      <button class="wk-check ${set.done ? 'on' : ''}" data-done="${esc(set.id)}" aria-pressed="${set.done}" aria-label="${set.done ? 'Undo' : 'Complete'} set ${i + 1}">✓</button>
      <button class="lift-x wk-x" data-rmset="${esc(set.id)}" aria-label="Remove set ${i + 1}">×</button>
    </div>`;
  }
  function workoutExerciseHTML(ex, i, count, s) {
    const { esc, ICON } = A();
    const prev = previousFor(ex.exId, s);
    const fields = L.measureFields(ex.measure);
    const when = prev ? new Date(prev.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    return `<section class="card wk-ex" data-uid="${esc(ex.uid)}">
      <div class="lift-item-head">
        <div class="main"><button class="wk-exname" data-about="${esc(ex.exId)}">${esc(ex.name)}</button>
          <div class="small muted">${prev ? `Last time ${esc(when)}` : 'First time logging this'}${ex.unilateral ? ' · each side' : ''}</div></div>
        <button class="lift-move" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(ex.name)} up"><span class="up">${ICON.right}</span></button>
        <button class="lift-move" data-move="1" ${i === count - 1 ? 'disabled' : ''} aria-label="Move ${esc(ex.name)} down"><span class="down">${ICON.right}</span></button>
        <button class="lift-move" data-rmex aria-label="Remove ${esc(ex.name)}">${ICON.close}</button>
      </div>
      <div class="wk-row wk-head f${fields.length}" aria-hidden="true"><span>Set</span><span>Prev</span>${fields.map((f) => `<span>${f === 'w' ? `${FIELD_INFO.w(ex) === 'Weight' ? '' : FIELD_INFO.w(ex) + ' '}${esc(weightUnitOf(ex))}` : FIELD_INFO[f](ex)}</span>`).join('')}<span></span><span></span></div>
      ${ex.sets.map((set, n) => workoutSetRow(ex, set, n, prev)).join('')}
      <div class="wk-exfoot">
        <button class="chipbtn" data-addset>+ Add set</button>
        <label class="wk-restpick"><span class="lift-sr">Rest timer for ${esc(ex.name)}</span><select data-rest>${L.REST_CHOICES.map((r) => `<option value="${r}" ${r === ex.rest ? 'selected' : ''}>${r ? 'Rest ' + restLabel(r) : 'No timer'}</option>`).join('')}</select></label>
      </div>
      <label class="f wk-note"><span class="lift-sr">Note for ${esc(ex.name)}</span><input type="text" data-exnote value="${esc(ex.note)}" placeholder="Exercise note"></label>
    </section>`;
  }
  function volumeText(kg) {
    const v = Math.round(L.fromKg(kg, St.prefs.unit));
    return `${v.toLocaleString('en-US')} ${St.prefs.unit}`;
  }
  function paintWorkoutStats() {
    const el = document.getElementById('wk-stats');
    if (!el || !W.s) return;
    const st = L.sessionStats(W.s);
    el.textContent = `${st.exercises} exercise${st.exercises === 1 ? '' : 's'} · ${st.done}/${st.sets} sets · ${volumeText(st.volumeKg)}`;
  }
  function openWorkout(session) {
    const { openSheet, closeSheets, esc, $, ICON, toast } = A();
    W.s = session;
    W.finishing = false;
    keepScreenOn();
    updateMini();
    openSheet((el) => {
      el.classList.add('wk-sheet');
      el.innerHTML = `<div class="wk-top">
          <div class="wk-topline">
            <button class="iconbtn" data-close aria-label="Minimize workout">${ICON.down}</button>
            <div class="wk-title"><input type="text" id="wk-name" maxlength="60" aria-label="Workout name" value="${esc(session.name)}"></div>
            <button class="btn wk-finish" id="wk-finish">Finish</button>
          </div>
          <div class="wk-sub"><b class="num" id="wk-elapsed">${L.formatClock(L.sessionDuration(session))}</b><span class="small muted" id="wk-stats"></span></div>
          <div class="small muted wk-started"><span>Started ${esc(new Date(session.startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}</span><button class="chipbtn ghost" id="wk-pause"></button></div>
        </div>
        <div id="wk-body"></div>
        <div class="wk-restbar" id="wk-restbar"></div>`;
      A().wireClose(el);
      const body = $('#wk-body', el);
      const paint = () => {
        const s = W.s; if (!s) return;
        const top = el.scrollTop;
        const n = s.exercises.length;
        body.innerHTML = `${s.status === 'paused' ? '<div class="note">Paused. The clock has stopped, and you can still edit your sets.</div>' : ''}
          ${n ? '' : '<div class="note">Add your first exercise to get going.</div>'}
          ${s.exercises.map((ex, i) => workoutExerciseHTML(ex, i, n, s)).join('')}
          <button class="btn secondary" id="wk-add" style="margin-bottom:12px">+ Add exercises</button>
          <label class="f"><span>Workout notes</span><textarea id="wk-note" rows="2" placeholder="How did it go?">${esc(s.note)}</textarea></label>
          <button class="btn danger" id="wk-discard">Discard workout</button>`;
        el.scrollTop = top;
        $('#wk-pause', el).textContent = s.status === 'paused' ? 'Resume' : 'Pause';
        const name = $('#wk-name', el);
        if (document.activeElement !== name) name.value = s.name;
        paintWorkoutStats();
        paintRest();
      };
      W.repaint = paint;
      paint();
      const exerciseOf = (node) => { const c = node.closest('[data-uid]'); return c ? W.s.exercises.find((x) => x.uid === c.dataset.uid) : null; };

      el.addEventListener('input', (e) => {
        const t = e.target; if (!W.s) return;
        if (t.id === 'wk-name') { W.s.name = t.value.trim() || 'Workout'; return saveSoon(); }
        if (t.id === 'wk-note') { W.s.note = t.value; return saveSoon(); }
        const ex = exerciseOf(t); if (!ex) return;
        if ('exnote' in t.dataset) { ex.note = t.value; return saveSoon(); }
        if (t.dataset.field) {
          const set = ex.sets.find((x) => x.id === t.dataset.set);
          if (set) { set[t.dataset.field] = L.cleanNumber(t.value, t.dataset.field); paintWorkoutStats(); saveSoon(); }
        }
      });
      el.addEventListener('change', (e) => {
        const t = e.target; if (!W.s) return;
        const ex = exerciseOf(t); if (!ex) return;
        if ('rest' in t.dataset) { ex.rest = Number(t.value); saveNow(); }
        else if (t.dataset.type) {
          const set = ex.sets.find((x) => x.id === t.dataset.type);
          if (set) { set.type = t.value; saveNow(); paint(); }
        }
      });
      el.addEventListener('click', async (e) => {
        const btn = e.target.closest('button'); if (!btn || btn.disabled || !W.s) return;
        const d = btn.dataset;
        /* rest timer */
        if (d.restStart) { unlockAudio(); return setRest(L.startRest(Number(d.restStart))); }
        if (d.restAdd && W.rest) { L.adjustRest(W.rest, Number(d.restAdd)); return setRest(W.rest); }
        if ('restToggle' in d && W.rest) { unlockAudio(); if (W.rest.pausedLeft != null) L.resumeRest(W.rest); else L.pauseRest(W.rest); return setRest(W.rest); }
        if ('restSkip' in d) return setRest(null);
        /* whole workout */
        if (btn.id === 'wk-pause') {
          if (W.s.status === 'paused') L.resumeSession(W.s); else L.pauseSession(W.s);
          paint();
          $('#wk-elapsed', el).textContent = L.formatClock(L.sessionDuration(W.s));
          return saveNow();
        }
        if (btn.id === 'wk-add') return openPicker((list) => {
          list.forEach((x) => { const prev = previousFor(x.id, W.s); W.s.exercises.push(L.sessionExercise(x, St.prefs, prev ? prev.sets.length : 3)); });
          saveNow(); paint();
        });
        if (btn.id === 'wk-finish') return finishWorkout();
        if (btn.id === 'wk-discard') {
          if (!confirm('Discard this workout? Everything you recorded in it will be lost.')) return;
          clearTimeout(W.saveTimer); W.saveTimer = null;
          const doc = L.discardedSession(W.s);
          St.sessions = St.sessions.filter((x) => x.id !== W.s.id);
          W.s = null;
          setRest(null);
          await A().put(SESSION_PREFIX + doc.id, doc);
          await closeSheets(1);
          return toast('Workout discarded');
        }
        /* one exercise */
        const ex = exerciseOf(btn); if (!ex) return;
        if (d.about) { const found = findExercise(d.about); if (found) openExercise(found); else toast("This exercise is no longer in your library"); return; }
        const index = W.s.exercises.indexOf(ex);
        if (d.move) L.moveItem(W.s.exercises, index, Number(d.move));
        else if ('rmex' in d) {
          if (ex.sets.some((x) => x.done) && !confirm(`Remove ${ex.name} and the sets you finished?`)) return;
          W.s.exercises.splice(index, 1);
        } else if ('addset' in d) L.addSessionSet(ex, St.prefs.unit);
        else if (d.rmset) L.removeSessionSet(ex, d.rmset);
        else if (d.usePrev) {
          const set = ex.sets.find((x) => x.id === d.usePrev);
          const prev = previousFor(ex.exId, W.s);
          const prevSet = prev && prev.sets[ex.sets.indexOf(set)];
          if (set && prevSet) { const h = L.setHint({ u: set.u, target: null }, prevSet); L.measureFields(ex.measure).forEach((f) => { set[f] = h[f]; }); }
        } else if (d.done) {
          const set = ex.sets.find((x) => x.id === d.done); if (!set) return;
          if (set.done) { set.done = false; set.doneAt = null; }
          else {
            const prev = previousFor(ex.exId, W.s);
            const hint = L.setHint(set, prev && prev.sets[ex.sets.indexOf(set)]);
            const need = L.requiredField(ex.measure);
            if (!L.completeSet(set, hint, ex.measure)) {
              const box = el.querySelector(`[data-set="${set.id}"][data-field="${need}"]`);
              if (box) box.focus();
              return toast(`Enter ${FIELD_INFO[need](ex).toLowerCase()} first`);
            }
            if (ex.rest > 0) { unlockAudio(); setRest(L.startRest(ex.rest)); }
          }
        } else return;
        paint(); // show it first, so a tap never feels slow, then save
        await saveNow();
      });
    }, {
      full: true,
      onClose: async () => {
        await flush();
        W.s = null; W.repaint = null;
        letScreenSleep();
        updateMini();
        repaintIfOnTab();
      },
    });
  }
  async function beginWorkout(routine) {
    const open = unfinished()[0];
    if (open) { A().toast('Finish or discard this workout before starting another'); return openWorkout(open); }
    const s = L.newSession(routine, findExercise, St.prefs);
    await saveSession(s);
    openWorkout(s);
  }
  async function finishWorkout() {
    if (W.finishing || !W.s) return; // a second tap can't save it twice
    const st = L.sessionStats(W.s);
    if (!st.done) {
      A().toast('Complete at least one set, or discard this workout');
      return;
    }
    if (st.done < st.sets && !confirm(`${st.sets - st.done} unfinished set${st.sets - st.done === 1 ? '' : 's'} won't be saved. Finish the workout?`)) return;
    W.finishing = true;
    clearTimeout(W.saveTimer); W.saveTimer = null;
    const s = W.s;
    L.finishSession(s);
    W.s = null; // closing the sheet shouldn't save it again
    setRest(null);
    await saveSession(s);
    await A().closeSheets(1);
    openSummary(s, true);
  }
  function openSummary(s, justFinished) {
    const { openSheet, sheetHead, wireClose, closeSheets, esc, $, put, toast } = A();
    const st = L.sessionStats(s);
    const date = new Date(s.startedAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    openSheet((el) => {
      el.innerHTML = `<div class="grab"></div>${sheetHead(justFinished ? 'Workout complete' : s.name, justFinished ? s.name : date)}
        <div class="nutgrid wk-grid3"><div><b class="num">${esc(L.formatClock(L.sessionDuration(s)))}</b><span>time</span></div>
          <div><b class="num">${st.done}</b><span>sets</span></div>
          <div><b class="num">${esc(volumeText(st.volumeKg))}</b><span>volume</span></div></div>
        ${s.exercises.map((ex) => `<section class="card wk-sumex"><h2>${esc(ex.name)}</h2><ol>${ex.sets.map((x) => {
          const type = L.SET_TYPES.find((t) => t.id === x.type);
          return `<li class="num">${esc(L.formatSet(x, ex.measure))}${x.type !== 'normal' && type ? ` <span class="badge">${esc(type.label)}</span>` : ''}</li>`;
        }).join('')}</ol>${ex.note ? `<p class="small muted">${esc(ex.note)}</p>` : ''}</section>`).join('')}
        ${s.note ? `<section class="card"><h2>Notes</h2><p class="lift-notes small">${esc(s.note)}</p></section>` : ''}
        <p class="small muted" style="margin:0 2px 12px">Volume is weight × reps for finished sets, leaving out warm-ups, assisted, timed and distance sets.</p>
        <button class="btn" id="sm-done">Done</button>
        <div style="margin-top:10px"><button class="btn danger" id="sm-del">Delete workout</button></div>`;
      wireClose(el);
      $('#sm-done', el).onclick = () => closeSheets(1);
      $('#sm-del', el).onclick = async () => {
        if (!confirm('Delete this workout from your history? This cannot be undone.')) return;
        const doc = L.discardedSession(s);
        St.sessions = St.sessions.filter((x) => x.id !== s.id);
        await put(SESSION_PREFIX + s.id, doc);
        await closeSheets(1);
        toast('Workout deleted');
      };
    }, { onClose: repaintIfOnTab });
  }

  /* ================= Templates ================= */
  function openTemplate(t) {
    const { openSheet, sheetHead, wireClose, closeSheets, esc, $ } = A();
    openSheet((el) => {
      const rows = t.items.map(([id, sets, target]) => {
        const ex = findExercise(id); if (!ex) return '';
        const timed = L.measureFields(ex.measure).includes('secs');
        return `<div class="item"><div class="main"><div class="name">${esc(ex.name)}</div><div class="sub">${esc(exerciseSub(ex))}</div></div><div class="k num">${sets} × ${target}${timed ? ' sec' : ''}</div></div>`;
      }).join('');
      el.innerHTML = `<div class="grab"></div>${sheetHead(t.name, `${L.levelLabel(t.level)} template`)}
        <p class="hint" style="margin:0 0 12px">${esc(t.about)} This is an example to adapt. Your copy can change anything, and you choose the weights.</p>
        <div class="list" style="margin-bottom:14px">${rows}</div>
        <button class="btn" id="tp-use">Copy to my routines</button>`;
      wireClose(el);
      $('#tp-use', el).onclick = async () => {
        const r = L.routineFromTemplate(t, findExercise, St.prefs);
        await closeSheets(1);
        openRoutine(r, { unsaved: true });
      };
    });
  }

  /* ================= The tab ================= */
  function routinesPane(root) {
    const { esc, $, $$, put, toast } = A();
    const rows = St.routines.map((r) => {
      const s = L.routineStats(r);
      return `<button class="item" data-routine="${esc(r.id)}"><div class="main"><div class="name">${esc(routineName(r))}</div>
        <div class="sub">${s.exercises} exercise${s.exercises === 1 ? '' : 's'} · ${s.sets} set${s.sets === 1 ? '' : 's'}${s.muscles.length ? ' · ' + esc(s.muscles.map(L.muscleLabel).join(', ')) : ''}</div></div></button>`;
    }).join('');
    root.innerHTML = `<button class="btn" id="rt-new" style="margin-bottom:12px">+ New routine</button>
      ${St.routines.length ? `<div class="list">${rows}</div>` : '<div class="note">Build a routine from the exercise library, or copy a template below and make it your own.</div>'}
      <div class="section-title">Templates</div>
      <div class="list">${L.TEMPLATES.map((t) => `<button class="item" data-template="${t.id}"><div class="main"><div class="name">${esc(t.name)}</div><div class="sub">${esc(L.levelLabel(t.level))} · ${t.items.length} exercises</div></div></button>`).join('')}</div>
      <div class="section-title">Preferences</div>
      <section class="card">
        <div class="grid2">
          <label class="f" style="margin:0"><span>Weight unit</span><select id="pf-unit"><option value="lb" ${St.prefs.unit === 'lb' ? 'selected' : ''}>Pounds (lb)</option><option value="kg" ${St.prefs.unit === 'kg' ? 'selected' : ''}>Kilograms (kg)</option></select></label>
          <label class="f" style="margin:0"><span>Default rest timer</span><select id="pf-rest">${L.REST_CHOICES.map((r) => `<option value="${r}" ${r === St.prefs.rest ? 'selected' : ''}>${restLabel(r)}</option>`).join('')}</select></label>
        </div>
        <label class="lift-check-line" style="margin:12px 0 0"><input type="checkbox" id="pf-alert" ${St.prefs.restAlert ? 'checked' : ''}><span>Sound and vibration when rest ends</span></label>
        <p class="hint" style="margin:10px 0 0">Units and rest time apply to sets you add from now on. Numbers you already entered keep their unit. The alert only plays while the app is open.</p>
      </section>`;
    $('#rt-new', root).onclick = () => openRoutine(L.newRoutine(''));
    $$('[data-routine]', root).forEach((b) => { b.onclick = () => openRoutine(St.routines.find((r) => r.id === b.dataset.routine), { existing: true }); });
    $$('[data-template]', root).forEach((b) => { b.onclick = () => openTemplate(L.TEMPLATES.find((t) => t.id === b.dataset.template)); });
    const savePrefs = async () => { await put('wo:prefs', St.prefs); toast('Saved'); };
    $('#pf-unit', root).onchange = (e) => { St.prefs.unit = e.target.value; savePrefs(); };
    $('#pf-rest', root).onchange = (e) => { St.prefs.rest = Number(e.target.value); savePrefs(); };
    $('#pf-alert', root).onchange = (e) => { St.prefs.restAlert = e.target.checked; savePrefs(); };
  }
  function workoutPane(root) {
    const { esc, $, $$, C } = A();
    const now = new Date();
    const from = C.parseYmd(C.weekStart(C.ymd(now))).getTime();
    const week = L.periodSummary(St.sessions, from, C.parseYmd(C.addDays(C.ymd(new Date(from)), 7)).getTime());
    const open = unfinished();
    const recent = completed().slice(0, 5);
    const minutes = Math.round(week.durationMs / 60000);
    root.innerHTML = `${open.map((s) => `<button class="card wk-continue" data-open="${esc(s.id)}"><span class="main"><b>Continue ${esc(s.name)}</b>
        <span class="small">${s.status === 'paused' ? 'Paused' : 'In progress'} · ${esc(L.formatClock(L.sessionDuration(s)))}</span></span><span class="wk-continue-go">Open</span></button>`).join('')}
      <button class="btn" id="wk-empty" style="margin-bottom:12px">Start empty workout</button>
      <div class="section-title">Start from a routine</div>
      ${St.routines.length ? `<div class="list">${St.routines.map((r) => {
        const st = L.routineStats(r);
        return `<button class="item" data-start="${esc(r.id)}" ${st.exercises ? '' : 'disabled'}><div class="main"><div class="name">${esc(routineName(r))}</div><div class="sub">${st.exercises} exercise${st.exercises === 1 ? '' : 's'} · ${st.sets} set${st.sets === 1 ? '' : 's'}</div></div><span class="chipbtn">Start</span></button>`;
      }).join('')}</div>` : '<div class="note">No routines yet. Build one in the Routines tab, or start an empty workout and add exercises as you go.</div>'}
      <div class="section-title">This week</div>
      <div class="nutgrid"><div><b class="num">${week.workouts}</b><span>workouts</span></div><div><b class="num">${minutes}</b><span>minutes</span></div>
        <div><b class="num">${week.sets}</b><span>sets</span></div><div><b class="num">${Math.round(L.fromKg(week.volumeKg, St.prefs.unit)).toLocaleString('en-US')}</b><span>${esc(St.prefs.unit)} volume</span></div></div>
      ${recent.length ? `<div class="section-title">Recent workouts</div><div class="list">${recent.map((s) => {
        const st = L.sessionStats(s);
        return `<button class="item" data-summary="${esc(s.id)}"><div class="main"><div class="name">${esc(s.name)}</div><div class="sub">${esc(new Date(s.startedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))} · ${st.done} set${st.done === 1 ? '' : 's'} · ${esc(L.formatClock(L.sessionDuration(s)))}</div></div></button>`;
      }).join('')}</div>` : ''}`;
    $('#wk-empty', root).onclick = () => beginWorkout(null);
    $$('[data-open]', root).forEach((b) => { b.onclick = () => openWorkout(St.sessions.find((s) => s.id === b.dataset.open)); });
    $$('[data-start]', root).forEach((b) => { b.onclick = () => beginWorkout(St.routines.find((r) => r.id === b.dataset.start)); });
    $$('[data-summary]', root).forEach((b) => { b.onclick = () => openSummary(St.sessions.find((s) => s.id === b.dataset.summary)); });
  }
  function exercisesPane(root) {
    const { $, $$ } = A();
    const f = St.filter;
    root.innerHTML = `${filtersHTML(f, true)}<button class="btn secondary" id="ex-new" style="margin-bottom:10px">+ Create an exercise</button><div id="ex-list"></div>`;
    const paint = () => { $('#ex-list', root).innerHTML = resultsHTML(runFilter(f), f); };
    paint();
    wireFilters(root, f, paint);
    $$('[data-scope]', root).forEach((b) => {
      b.onclick = () => {
        f.scope = b.dataset.scope;
        $$('[data-scope]', root).forEach((x) => x.classList.toggle('on', x === b));
        paint();
      };
    });
    $('#ex-new', root).onclick = () => openCustomForm({});
    $('#ex-list', root).addEventListener('click', (e) => {
      const row = e.target.closest('[data-ex]');
      if (row) openExercise(findExercise(row.dataset.ex));
    });
  }
  function render() {
    const { $, $$ } = A();
    const active = document.activeElement;
    const wasTyping = active && active.classList && active.classList.contains('lift-q');
    const caret = wasTyping ? active.selectionStart : 0;
    $('#topbar').innerHTML = '<h1>Lift</h1>';
    $('#view').innerHTML = `<div class="seg lift-panes">${[['workout', 'Workout'], ['routines', 'Routines'], ['exercises', 'Exercises']].map(([k, t]) => `<button data-pane="${k}" class="${St.pane === k ? 'on' : ''}">${t}</button>`).join('')}</div><div id="lift-pane"></div>`;
    $$('[data-pane]').forEach((b) => { b.onclick = () => { St.pane = b.dataset.pane; render(); }; });
    ({ workout: workoutPane, routines: routinesPane, exercises: exercisesPane })[St.pane]($('#lift-pane'));
    if (wasTyping) { const q = $('.lift-q'); if (q) { q.focus(); q.setSelectionRange(caret, caret); } } // a sync can repaint this tab mid-search
  }

  window.PlateLift = { load, render, flush, hasOpenWorkout: () => unfinished().length > 0 };
})();
