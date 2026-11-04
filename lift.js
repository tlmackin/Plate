/* Plate — the Lift tab: exercise library, custom exercises and the routine builder.
   Saved in the same synced key/value store as the food log (see app.js), so offline use, sync,
   backup and "erase all my data" cover it automatically. Keys:
     wo:r:<id>     one routine (null once deleted, so the deletion reaches other devices)
     wo:exercises  custom exercises     wo:favs  favorite exercise ids     wo:prefs  unit and default rest */
(function () {
  'use strict';
  const L = window.LiftCore;
  const LIBRARY = window.PLATE_EXERCISES || [];
  const A = () => window.PlateApp; // filled in by app.js before it starts
  const ROUTINE_PREFIX = 'wo:r:';
  const DEFAULT_PREFS = () => ({ unit: 'lb', rest: 90 });
  const St = {
    pane: 'routines',
    routines: [], custom: [], favs: [], prefs: DEFAULT_PREFS(),
    filter: { q: '', muscle: '', equipment: '', level: '', scope: 'all' },
  };

  async function load() {
    const { DB } = A();
    const keys = (await DB.keys()).filter((k) => typeof k === 'string' && k.startsWith(ROUTINE_PREFIX));
    const routines = await Promise.all(keys.map((k) => DB.get(k)));
    St.routines = routines.filter(Boolean).sort(byRoutineName);
    St.custom = (await DB.get('wo:exercises')) || [];
    St.favs = (await DB.get('wo:favs')) || [];
    St.prefs = Object.assign(DEFAULT_PREFS(), (await DB.get('wo:prefs')) || {});
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
          <button class="btn" id="rt-done">Done</button>
          ${saved ? `<div class="btnrow" style="margin-top:10px"><button class="btn secondary" id="rt-dup">Duplicate</button><button class="btn danger" id="rt-del">Delete</button></div>` : ''}`;
        el.scrollTop = top;
        wireClose(el);
        $('#rt-done', el).onclick = () => closeSheets(1);
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
        <p class="hint" style="margin:10px 0 0">These apply to sets you add from now on. Targets you already entered keep their unit.</p>
      </section>`;
    $('#rt-new', root).onclick = () => openRoutine(L.newRoutine(''));
    $$('[data-routine]', root).forEach((b) => { b.onclick = () => openRoutine(St.routines.find((r) => r.id === b.dataset.routine), { existing: true }); });
    $$('[data-template]', root).forEach((b) => { b.onclick = () => openTemplate(L.TEMPLATES.find((t) => t.id === b.dataset.template)); });
    const savePrefs = async () => { await put('wo:prefs', St.prefs); toast('Saved'); };
    $('#pf-unit', root).onchange = (e) => { St.prefs.unit = e.target.value; savePrefs(); };
    $('#pf-rest', root).onchange = (e) => { St.prefs.rest = Number(e.target.value); savePrefs(); };
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
    $('#view').innerHTML = `<div class="seg lift-panes">${[['routines', 'Routines'], ['exercises', 'Exercises']].map(([k, t]) => `<button data-pane="${k}" class="${St.pane === k ? 'on' : ''}">${t}</button>`).join('')}</div><div id="lift-pane"></div>`;
    $$('[data-pane]').forEach((b) => { b.onclick = () => { St.pane = b.dataset.pane; render(); }; });
    (St.pane === 'exercises' ? exercisesPane : routinesPane)($('#lift-pane'));
    if (wasTyping) { const q = $('.lift-q'); if (q) { q.focus(); q.setSelectionRange(caret, caret); } } // a sync can repaint this tab mid-search
  }

  window.PlateLift = { load, render };
})();
