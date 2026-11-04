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

  const api = { MUSCLES, EQUIPMENT, LEVELS, MEASURES, REST_CHOICES, TEMPLATES, muscleLabel, equipmentLabel, levelLabel, measureFields,
    cleanNumber, toKg, fromKg, convertWeight, searchExercises, validateCustom, customFromForm,
    newRoutine, newSet, newItem, addSet, removeSet, moveItem, duplicateRoutine, routineStats, routineHasContent, routineFromTemplate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LiftCore = api;
})(typeof self !== 'undefined' ? self : this);
