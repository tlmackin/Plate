/* Plate — lifting logic (pure functions, no DOM). Shared by the app and the tests. */
(function (root) {
  'use strict';

  const MUSCLES = [
    ['chest', 'Chest'], ['back', 'Back'], ['shoulders', 'Shoulders'], ['biceps', 'Biceps'], ['triceps', 'Triceps'], ['forearms', 'Forearms'],
    ['core', 'Abs & core'], ['quads', 'Quads'], ['hamstrings', 'Hamstrings'], ['glutes', 'Glutes'], ['calves', 'Calves'], ['full_body', 'Full body'],
  ].map(([id, label]) => ({ id, label }));
  const EQUIPMENT = [
    ['barbell', 'Barbell'], ['dumbbell', 'Dumbbell'], ['cable', 'Cable machine'], ['smith', 'Smith machine'], ['machine', 'Resistance machine'], ['kettlebell', 'Kettlebell'],
    ['bodyweight', 'Bodyweight'], ['bands', 'Resistance bands'], ['ez_bar', 'EZ curl bar'], ['trap_bar', 'Trap bar'], ['other', 'Other equipment'],
  ].map(([id, label]) => ({ id, label }));
  const LEVELS = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']].map(([id, label]) => ({ id, label }));
  /* How an exercise is tracked, and which target fields a set has. w = weight, reps, secs = time, dist = metres */
  const MEASURES = [
    { id: 'weight_reps', label: 'Weight and reps', fields: ['w', 'reps'] },
    { id: 'reps', label: 'Bodyweight reps (optional added weight)', fields: ['w', 'reps'] },
    { id: 'assisted', label: 'Assisted (assistance weight and reps)', fields: ['w', 'reps'] },
    { id: 'time', label: 'Time', fields: ['secs'] },
    { id: 'distance', label: 'Distance', fields: ['dist'] },
    { id: 'weight_distance', label: 'Weight and distance', fields: ['w', 'dist'] },
  ];
  const REST_CHOICES = [0, 30, 60, 90, 120, 180];
  const label = (list, id) => { const x = list.find((i) => i.id === id); return x ? x.label : ''; };
  const muscleLabel = (id) => label(MUSCLES, id);
  const equipmentLabel = (id) => label(EQUIPMENT, id);
  const levelLabel = (id) => label(LEVELS, id);
  const measureFields = (id) => (MEASURES.find((m) => m.id === id) || MEASURES[0]).fields;

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* ---------- Numbers and units ----------
     A weight is always stored exactly as entered, next to its unit. Conversion only happens for
     comparing or displaying, so changing your preferred unit can never alter what was recorded. */
  const LIMITS = { w: 5000, reps: 1000, secs: 86400, dist: 1000000 };
  const KG_PER_LB = 0.45359237;
  function cleanNumber(raw, field) {
    const s = String(raw == null ? '' : raw).trim().replace(',', '.');
    if (s === '') return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0 || n > (LIMITS[field] || Infinity)) return null;
    return Math.round(n * 100) / 100;
  }
  const toKg = (w, unit) => (unit === 'lb' ? w * KG_PER_LB : w);
  const fromKg = (kg, unit) => (unit === 'lb' ? kg / KG_PER_LB : kg);
  const convertWeight = (w, from, to) => fromKg(toKg(w, from), to);

  /* ---------- Exercise search ---------- */
  const compact = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const byName = (a, b) => a.name.localeCompare(b.name);
  /* filter = { q, muscle, equipment, level, favs: [ids] or null, mineOnly }
     A muscle filter matches an exercise's primary muscle only, so "Chest" lists chest exercises rather
     than everything that touches the chest. A typed search also looks at secondary muscles. */
  function searchExercises(list, filter) {
    const f = filter || {};
    const tokens = String(f.q || '').split(/\s+/).map(compact).filter(Boolean);
    return list.filter((e) => {
      if (f.muscle && e.primary !== f.muscle) return false;
      if (f.equipment && e.equipment !== f.equipment) return false;
      if (f.level && e.level !== f.level) return false;
      if (f.favs && !f.favs.includes(e.id)) return false;
      if (f.mineOnly && !e.custom) return false;
      if (!tokens.length) return true;
      const hay = compact([e.name, muscleLabel(e.primary), equipmentLabel(e.equipment), ...(e.secondary || []).map(muscleLabel)].join(' '));
      return tokens.every((t) => hay.includes(t));
    }).sort(byName);
  }

  /* ---------- Custom exercises ---------- */
  /* Returns a message describing what's wrong, or null if the form is fine. */
  function validateCustom(form, allExercises, existingId) {
    const name = String(form.name || '').trim();
    if (!name) return 'Give the exercise a name';
    if (name.length > 80) return 'That name is too long';
    if (!MUSCLES.some((m) => m.id === form.primary)) return 'Pick the main muscle group';
    if (!EQUIPMENT.some((m) => m.id === form.equipment)) return 'Pick the equipment';
    const taken = (allExercises || []).find((e) => e.id !== existingId && compact(e.name) === compact(name));
    if (taken) return `“${taken.name}” is already in the library`;
    return null;
  }
  function customFromForm(form, existingId) {
    const primary = form.primary;
    return {
      id: existingId || 'custom:' + newId(), custom: true, name: String(form.name).trim(), primary,
      secondary: [...new Set(form.secondary || [])].filter((m) => m !== primary && MUSCLES.some((x) => x.id === m)),
      equipment: form.equipment, level: LEVELS.some((l) => l.id === form.level) ? form.level : 'beginner',
      measure: MEASURES.some((m) => m.id === form.measure) ? form.measure : 'weight_reps',
      unilateral: !!form.unilateral, notes: String(form.notes || '').trim(),
    };
  }

  /* ---------- Routines ----------
     A routine holds targets only (what you plan to do). Each item keeps its own copy of the exercise's
     name, muscle and tracking type, so it still reads correctly if a custom exercise is later changed
     or deleted. routine = { id, name, items: [item], createdAt, updatedAt }
     item = { uid, exId, name, primary, measure, rest, note, sets: [{ id, w, u, reps, secs, dist }] } */
  function newRoutine(name, now) {
    const t = now || Date.now();
    return { id: newId(), name: String(name || '').trim(), items: [], createdAt: t, updatedAt: t };
  }
  function newSet(unit, values) {
    return Object.assign({ id: newId(), w: null, u: unit === 'kg' ? 'kg' : 'lb', reps: null, secs: null, dist: null }, values || {});
  }
  function newItem(ex, prefs, setCount) {
    const p = prefs || {};
    const sets = [];
    for (let i = 0; i < (setCount || 3); i++) sets.push(newSet(p.unit));
    return { uid: newId(), exId: ex.id, name: ex.name, primary: ex.primary, measure: ex.measure, rest: p.rest != null ? p.rest : 90, note: '', sets };
  }
  /* A new set starts as a copy of the last one, since most sets repeat the same target. */
  function addSet(item, unit) {
    const last = item.sets[item.sets.length - 1];
    item.sets.push(last ? Object.assign({}, last, { id: newId() }) : newSet(unit));
    return item;
  }
  function removeSet(item, setId) {
    if (item.sets.length > 1) item.sets = item.sets.filter((s) => s.id !== setId);
    return item;
  }
  function moveItem(list, index, delta) {
    const to = index + delta;
    if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
    const [x] = list.splice(index, 1);
    list.splice(to, 0, x);
    return list;
  }
  /* Same content under new ids, so editing the copy can never touch the original. */
  function duplicateRoutine(routine, now) {
    const t = now || Date.now();
    const copy = JSON.parse(JSON.stringify(routine));
    copy.id = newId(); copy.name = `${routine.name || 'Untitled routine'} copy`; copy.createdAt = t; copy.updatedAt = t;
    copy.items.forEach((it) => { it.uid = newId(); it.sets.forEach((s) => { s.id = newId(); }); });
    return copy;
  }
  function routineStats(routine) {
    const items = routine.items || [];
    const muscles = [...new Set(items.map((i) => i.primary))].filter(Boolean);
    return { exercises: items.length, sets: items.reduce((n, i) => n + i.sets.length, 0), muscles };
  }
  /* Worth saving once it has a name or at least one exercise. */
  const routineHasContent = (r) => !!(String(r.name || '').trim() || (r.items && r.items.length));

  /* ---------- Templates: examples to copy and change, not prescriptions ----------
     Each item is [exercise id, sets, target reps (or seconds for timed exercises)]. Weights are left blank. */
  const TEMPLATES = [
    { id: 'full-body-a', name: 'Full Body A', level: 'beginner', about: 'Covers the main movement patterns with simple, stable exercises.',
      items: [['goblet-squat', 3, 10], ['dumbbell-bench-press', 3, 10], ['seated-cable-row', 3, 10], ['dumbbell-romanian-deadlift', 3, 10], ['plank', 3, 30]] },
    { id: 'full-body-b', name: 'Full Body B', level: 'beginner', about: 'A second full-body day to alternate with Full Body A.',
      items: [['leg-press', 3, 10], ['machine-shoulder-press', 3, 10], ['lat-pulldown', 3, 10], ['glute-bridge', 3, 12], ['dead-bug', 3, 10]] },
    { id: 'push-day', name: 'Push Day', level: 'intermediate', about: 'Chest, shoulders and triceps.',
      items: [['barbell-bench-press', 4, 8], ['incline-dumbbell-press', 3, 10], ['dumbbell-shoulder-press', 3, 10], ['dumbbell-lateral-raise', 3, 12], ['rope-triceps-pushdown', 3, 12]] },
    { id: 'pull-day', name: 'Pull Day', level: 'intermediate', about: 'Back, rear shoulders and biceps.',
      items: [['barbell-row', 4, 8], ['lat-pulldown', 3, 10], ['seated-cable-row', 3, 10], ['face-pull', 3, 15], ['ez-bar-curl', 3, 10], ['hammer-curl', 3, 12]] },
    { id: 'leg-day', name: 'Leg Day', level: 'intermediate', about: 'Quads, hamstrings, glutes and calves.',
      items: [['barbell-back-squat', 4, 8], ['romanian-deadlift', 3, 10], ['leg-press', 3, 10], ['lying-leg-curl', 3, 12], ['standing-calf-raise', 3, 12]] },
    { id: 'upper-body', name: 'Upper Body', level: 'intermediate', about: 'One session for pressing and pulling.',
      items: [['barbell-bench-press', 3, 8], ['barbell-row', 3, 8], ['dumbbell-shoulder-press', 3, 10], ['lat-pulldown', 3, 10], ['dumbbell-curl', 2, 12], ['cable-triceps-pushdown', 2, 12]] },
    { id: 'lower-body', name: 'Lower Body', level: 'intermediate', about: 'One session for the legs, plus core.',
      items: [['trap-bar-deadlift', 3, 6], ['bulgarian-split-squat', 3, 10], ['seated-leg-curl', 3, 12], ['seated-calf-raise', 3, 12], ['cable-crunch', 3, 12]] },
    { id: 'chest-triceps', name: 'Chest and Triceps', level: 'advanced', about: 'Higher volume for one pairing. Assumes you are used to heavy pressing.',
      items: [['barbell-bench-press', 4, 6], ['incline-barbell-bench-press', 3, 8], ['chest-dip', 3, 10], ['cable-fly', 3, 12], ['close-grip-bench-press', 3, 8], ['overhead-cable-triceps-extension', 3, 12]] },
    { id: 'back-biceps', name: 'Back and Biceps', level: 'advanced', about: 'Higher volume for one pairing. Assumes you are used to heavy pulling.',
      items: [['conventional-deadlift', 3, 5], ['pull-up', 4, 8], ['pendlay-row', 3, 8], ['straight-arm-pulldown', 3, 12], ['barbell-curl', 3, 8], ['incline-dumbbell-curl', 3, 10]] },
  ];
  /* findExercise(id) -> exercise. Exercises it can't find are skipped rather than breaking the routine. */
  function routineFromTemplate(template, findExercise, prefs, now) {
    const r = newRoutine(template.name, now);
    template.items.forEach(([id, sets, target]) => {
      const ex = findExercise(id);
      if (!ex) return;
      const it = newItem(ex, prefs, sets);
      const field = measureFields(ex.measure).includes('secs') ? 'secs' : 'reps';
      it.sets.forEach((s) => { s[field] = target; });
      r.items.push(it);
    });
    return r;
  }

  /* ---------- Workout sessions ----------
     A session is what you actually did. It copies everything it needs when it starts, so later changes
     to a routine or exercise can't alter it, and its id never changes, so saving it again (or an upload
     retrying) overwrites the same record instead of creating a duplicate.
     session = { id, status: 'active'|'paused'|'completed'|'discarded', name, routineId, startedAt, endedAt,
       pausedAt, pausedMs, note, updatedAt, exercises: [exercise] }
     exercise = { uid, exId, name, primary, secondary, equipment, measure, unilateral, rest, note, sets: [set] }
     set = { id, type, w, u, reps, secs, dist, done, doneAt, target } where target holds the planned values. */
  const SET_TYPES = [
    { id: 'warmup', label: 'Warm-up', mark: 'W' }, { id: 'normal', label: 'Working set', mark: '' }, { id: 'drop', label: 'Drop set', mark: 'D' },
    { id: 'failure', label: 'To failure', mark: 'F' }, { id: 'amrap', label: 'AMRAP', mark: 'A' },
  ];
  const VALUE_FIELDS = ['w', 'reps', 'secs', 'dist'];
  function newSessionSet(unit, target) {
    return { id: newId(), type: 'normal', w: null, u: unit === 'kg' ? 'kg' : 'lb', reps: null, secs: null, dist: null, done: false, doneAt: null, target: target || null };
  }
  function sessionExercise(ex, prefs, setCount) {
    const p = prefs || {};
    const sets = [];
    for (let i = 0; i < Math.max(1, setCount || 3); i++) sets.push(newSessionSet(p.unit));
    return { uid: newId(), exId: ex.id, name: ex.name, primary: ex.primary, secondary: ex.secondary || [], equipment: ex.equipment || '',
      measure: ex.measure, unilateral: !!ex.unilateral, rest: p.rest != null ? p.rest : 90, note: '', sets };
  }
  function newSession(routine, findExercise, prefs, now) {
    const t = now || Date.now();
    const s = { id: newId(), status: 'active', name: (routine && routine.name) || 'Workout', routineId: routine ? routine.id : null,
      startedAt: t, endedAt: null, pausedAt: null, pausedMs: 0, note: '', updatedAt: t, exercises: [] };
    ((routine && routine.items) || []).forEach((item) => {
      const found = (findExercise && findExercise(item.exId)) || {};
      s.exercises.push({ uid: newId(), exId: item.exId, name: item.name, primary: item.primary, secondary: found.secondary || [], equipment: found.equipment || '',
        measure: item.measure, unilateral: !!found.unilateral, rest: item.rest, note: item.note || '',
        sets: item.sets.map((t2) => newSessionSet(t2.u, { w: t2.w, u: t2.u, reps: t2.reps, secs: t2.secs, dist: t2.dist })) });
    });
    return s;
  }
  /* A new set starts from what the last set did, or planned to do. */
  function addSessionSet(exercise, unit) {
    const last = exercise.sets[exercise.sets.length - 1];
    if (!last) { exercise.sets.push(newSessionSet(unit)); return exercise; }
    const value = (f) => (last[f] != null ? last[f] : last.target ? last.target[f] : null);
    exercise.sets.push(newSessionSet(last.u, { w: value('w'), u: last.u, reps: value('reps'), secs: value('secs'), dist: value('dist') }));
    return exercise;
  }
  function removeSessionSet(exercise, setId) { exercise.sets = exercise.sets.filter((s) => s.id !== setId); return exercise; }
  /* The most recent finished performance of an exercise: { at, sets } with done sets only, or null. */
  function lastPerformance(sessions, exId, excludeSessionId) {
    let best = null;
    (sessions || []).forEach((s) => {
      if (s.status !== 'completed' || s.id === excludeSessionId || (best && s.startedAt <= best.at)) return;
      const ex = s.exercises.find((e) => e.exId === exId && e.sets.some((x) => x.done));
      if (ex) best = { at: s.startedAt, sets: ex.sets.filter((x) => x.done) };
    });
    return best;
  }
  /* What a blank set would be recorded as: the plan if there is one, otherwise last time's numbers. */
  function setHint(set, previous) {
    const t = set.target || {}, p = previous || {};
    const hint = { w: null, reps: null, secs: null, dist: null };
    if (t.w != null) hint.w = t.u === set.u ? t.w : Math.round(convertWeight(t.w, t.u, set.u) * 10) / 10;
    else if (p.w != null) hint.w = p.u === set.u ? p.w : Math.round(convertWeight(p.w, p.u, set.u) * 10) / 10;
    ['reps', 'secs', 'dist'].forEach((f) => { hint[f] = t[f] != null ? t[f] : p[f] != null ? p[f] : null; });
    return hint;
  }
  /* The one value a set can't be recorded without. Weight is optional because bands and bodyweight have none. */
  const requiredField = (measure) => { const f = measureFields(measure); return f.includes('reps') ? 'reps' : f[f.length - 1]; };
  /* Fills blanks from the hint and marks the set done. Returns false if the required value is still missing. */
  function completeSet(set, hint, measure, now) {
    const fields = measureFields(measure);
    const need = requiredField(measure);
    if ((set[need] != null ? set[need] : (hint || {})[need]) == null) return false;
    fields.forEach((f) => { if (set[f] == null && hint && hint[f] != null) set[f] = hint[f]; });
    set.done = true; set.doneAt = now || Date.now();
    return true;
  }
  /* Volume = weight x reps on finished sets. Warm-ups don't count, and neither does assistance, because
     more assistance means less work. Timed and distance sets have no weight x reps to compare. */
  function setVolumeKg(set, measure) {
    if (!set.done || set.type === 'warmup' || !(measure === 'weight_reps' || measure === 'reps')) return 0;
    if (!(set.w > 0) || !(set.reps > 0)) return 0;
    return toKg(set.w, set.u) * set.reps;
  }
  function sessionStats(session) {
    let sets = 0, done = 0, volumeKg = 0;
    session.exercises.forEach((e) => e.sets.forEach((x) => {
      sets += 1;
      if (x.done) done += 1;
      volumeKg += setVolumeKg(x, e.measure);
    }));
    return { exercises: session.exercises.length, sets, done, volumeKg };
  }
  /* Training time, leaving out time spent paused. */
  function sessionDuration(s, now) {
    const end = s.endedAt || (s.status === 'paused' && s.pausedAt) || now || Date.now();
    return Math.max(0, end - s.startedAt - (s.pausedMs || 0));
  }
  function pauseSession(s, now) { if (s.status === 'active') { s.status = 'paused'; s.pausedAt = now || Date.now(); } return s; }
  function resumeSession(s, now) {
    if (s.status === 'paused') { s.pausedMs = (s.pausedMs || 0) + Math.max(0, (now || Date.now()) - s.pausedAt); s.pausedAt = null; s.status = 'active'; }
    return s;
  }
  /* Only finished sets are kept, and exercises with none are dropped. Finishing twice changes nothing. */
  function finishSession(s, now) {
    if (s.status === 'completed') return s;
    const t = now || Date.now();
    if (s.status === 'paused') resumeSession(s, t);
    s.exercises = s.exercises.map((e) => Object.assign({}, e, { sets: e.sets.filter((x) => x.done) })).filter((e) => e.sets.length);
    s.status = 'completed'; s.endedAt = t; s.updatedAt = t;
    return s;
  }
  const discardedSession = (s, now) => { const t = now || Date.now(); return { id: s.id, status: 'discarded', startedAt: s.startedAt, discardedAt: t, updatedAt: t }; };
  /* Totals for sessions that started in [fromMs, toMs). */
  function periodSummary(sessions, fromMs, toMs) {
    const out = { workouts: 0, durationMs: 0, sets: 0, volumeKg: 0 };
    (sessions || []).forEach((s) => {
      if (s.status !== 'completed' || s.startedAt < fromMs || s.startedAt >= toMs) return;
      const st = sessionStats(s);
      out.workouts += 1; out.durationMs += sessionDuration(s); out.sets += st.done; out.volumeKg += st.volumeKg;
    });
    return out;
  }
  function formatClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
    const two = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
  }
  /* "135 lb × 10". plain drops the unit, for the narrow Previous column. */
  function formatSet(set, measure, plain) {
    const weight = set.w != null ? (plain ? `${set.w}` : `${set.w} ${set.u}`) : '';
    if (measure === 'time') return set.secs != null ? formatClock(set.secs * 1000) : '';
    if (measure === 'distance') return set.dist != null ? `${set.dist} m` : '';
    if (measure === 'weight_distance') return [weight, set.dist != null ? `${set.dist} m` : ''].filter(Boolean).join(' × ');
    if (set.reps == null) return weight;
    if (measure === 'assisted' && weight && !plain) return `${weight} assist × ${set.reps}`;
    return weight ? `${weight} × ${set.reps}` : plain ? `${set.reps}` : `${set.reps} reps`;
  }

  /* ---------- Rest timer ----------
     Stores when the rest ends rather than counting down, so it's right even if the phone was asleep.
     rest = { endsAt, duration, pausedLeft } where pausedLeft is set only while paused. */
  const startRest = (seconds, now) => ({ endsAt: (now || Date.now()) + seconds * 1000, duration: seconds, pausedLeft: null });
  const restLeft = (r, now) => (r.pausedLeft != null ? r.pausedLeft : Math.max(0, r.endsAt - (now || Date.now())));
  function pauseRest(r, now) { if (r.pausedLeft == null) r.pausedLeft = restLeft(r, now); return r; }
  function resumeRest(r, now) { if (r.pausedLeft != null) { r.endsAt = (now || Date.now()) + r.pausedLeft; r.pausedLeft = null; } return r; }
  function adjustRest(r, seconds, now) {
    const left = Math.max(0, restLeft(r, now) + seconds * 1000);
    if (r.pausedLeft != null) r.pausedLeft = left; else r.endsAt = (now || Date.now()) + left;
    return r;
  }

  const api = { MUSCLES, EQUIPMENT, LEVELS, MEASURES, REST_CHOICES, TEMPLATES, SET_TYPES, VALUE_FIELDS, muscleLabel, equipmentLabel, levelLabel, measureFields,
    cleanNumber, toKg, fromKg, convertWeight, searchExercises, validateCustom, customFromForm,
    newRoutine, newSet, newItem, addSet, removeSet, moveItem, duplicateRoutine, routineStats, routineHasContent, routineFromTemplate,
    newSessionSet, sessionExercise, newSession, addSessionSet, removeSessionSet, lastPerformance, setHint, requiredField, completeSet, setVolumeKg,
    sessionStats, sessionDuration, pauseSession, resumeSession, finishSession, discardedSession, periodSummary, formatClock, formatSet,
    startRest, restLeft, pauseRest, resumeRest, adjustRest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LiftCore = api;
})(typeof self !== 'undefined' ? self : this);
