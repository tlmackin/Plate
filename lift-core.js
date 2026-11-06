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

  /* ---------- Workout of the day ----------
     Everyone gets the same workout on the same date, in the version for their level. A result is a
     normal completed session with a wod field and no exercises, so sync, history and weekly totals all
     apply, and it keeps its own copy of the workout as it was that day.
     wod field = { id, format, scoreType, level, minutes, every, work, rest, count, scheme, moves, strength, rounds, logged, score }
     Scores by type: time { secs, capped }, rounds { rounds, reps }, minutes { done, of }, reps { reps }, load { w, unit }.
     Results saved before scoreType existed are read from their format. */
  const WOD_FORMATS = [
    { id: 'for_time', label: 'For time', short: 'Finish as fast as you can' },
    { id: 'amrap', label: 'AMRAP', short: 'As many rounds as possible' },
    { id: 'emom', label: 'EMOM', short: 'Work at the start of each interval, and rest for what is left' },
    { id: 'intervals', label: 'Intervals', short: 'Go hard while the clock says work, and recover when it says rest' },
    { id: 'tabata', label: 'Tabata', short: '20 seconds of work, then 10 seconds of rest' },
    { id: 'death_by', label: 'Death by', short: 'More reps every minute, until you can no longer finish them inside the minute' },
    { id: 'for_load', label: 'For load', short: 'Build to a heavy weight with good form' },
  ];
  const WOD_SCORE = { for_time: 'time', amrap: 'rounds', emom: 'minutes', intervals: 'reps', tabata: 'reps', death_by: 'rounds', for_load: 'load' };
  const WOD_EQUIPMENT = [['none', 'No equipment'], ['dumbbell', 'Dumbbells'], ['kettlebell', 'Kettlebell'], ['barbell', 'Barbell'], ['pullup', 'Pull-up bar'],
    ['rower', 'Rowing machine'], ['bike', 'Air bike'], ['jumprope', 'Jump rope'], ['box', 'Box'], ['wallball', 'Wall ball'], ['other', 'Other equipment']].map(([id, lbl]) => ({ id, label: lbl }));
  const wodFormatLabel = (id) => label(WOD_FORMATS, id);
  /* w is a workout, a saved wod field, or just a format id. */
  const wodScoreType = (w) => (typeof w === 'string' ? WOD_SCORE[w] || w : w.scoreType || WOD_SCORE[w.format] || 'time');

  /* The date picks the workout, using the calendar day itself so that time zones and devices agree.
     The rotation runs three training days, then a rest day. Retired workouts stay findable for old
     results and the list, but never come up as the day's workout. */
  const mod = (n, m) => ((n % m) + m) % m;
  const dayNumber = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
  const ymdOf = (day) => new Date(day * 86400000).toISOString().slice(0, 10);
  const wodRotation = (list) => (list || []).filter((w) => !w.retired);
  function wodDay(list, ymd) {
    const rot = wodRotation(list);
    if (!rot.length) return { wod: null, rest: false };
    const day = dayNumber(ymd);
    const pos = mod(day, 4);
    if (pos === 3) return { wod: null, rest: true };
    return { wod: rot[mod(Math.floor(day / 4) * 3 + pos, rot.length)], rest: false };
  }
  const wodForDate = (list, ymd) => wodDay(list, ymd).wod;
  /* The next day with a workout, for showing what's coming on a rest day. */
  function nextWodDay(list, ymd) {
    const start = dayNumber(ymd);
    for (let i = 1; i <= 4; i++) { const d = wodDay(list, ymdOf(start + i)); if (d.wod) return { ymd: ymdOf(start + i), wod: d.wod }; }
    return null;
  }

  /* One level of a workout, filled in with the timing it shares with the other levels.
     Old workouts store a level as [minutes, scheme, moves]. Intervals work out their own length. */
  function wodVersion(wod, level) {
    const lv = wod.levels[level] ? level : 'beginner';
    const v = wod.levels[lv];
    const o = Array.isArray(v) ? { minutes: v[0], scheme: v[1], moves: v[2] } : Object.assign({}, v);
    ['every', 'work', 'rest', 'count'].forEach((k) => { if (o[k] == null && wod[k] != null) o[k] = wod[k]; });
    if (wod.format === 'tabata') { if (o.work == null) o.work = 20; if (o.rest == null) o.rest = 10; }
    if (wod.format === 'intervals' || wod.format === 'tabata') o.minutes = (o.count * o.work + (o.count - 1) * (o.rest || 0)) / 60;
    else { delete o.work; delete o.rest; delete o.count; }
    if (wod.format === 'emom' || wod.format === 'death_by') o.every = o.every || 60; else delete o.every;
    o.level = lv; o.format = wod.format; o.scoreType = wodScoreType(wod);
    return o;
  }
  /* "EMOM · 12 minutes", "Every 3 minutes · 6 rounds", "Tabata · 8 rounds of 0:20 on, 0:10 off". */
  function wodFormatLine(v) {
    const span = (secs) => (secs % 60 === 0 ? `${secs / 60} minute${secs === 60 ? '' : 's'}` : formatClock(secs * 1000));
    switch (v.format) {
      case 'for_time': return `For time · ${v.minutes} minute cap`;
      case 'amrap': return `AMRAP · ${v.minutes} minutes`;
      case 'emom': return v.every && v.every !== 60 ? `Every ${span(v.every)} · ${Math.round((v.minutes * 60) / v.every)} rounds` : `EMOM · ${v.minutes} minutes`;
      case 'intervals': case 'tabata': return `${wodFormatLabel(v.format)} · ${v.count} rounds of ${formatClock(v.work * 1000)} on, ${formatClock((v.rest || 0) * 1000)} off`;
      case 'death_by': return `Death by · up to ${v.minutes} minutes`;
      case 'for_load': return `For load · ${v.minutes} minutes`;
      default: return wodFormatLabel(v.format);
    }
  }
  /* Workouts write weights in pounds as {women/men} or {one}, and show them in the viewer's unit.
     Kilos round to whole numbers up to 25 kg, like dumbbells, kettlebells and balls, and to 2.5 kg above. */
  const WEIGHT_TOKEN = /\{(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?\}/g;
  function wodText(text, unit) {
    const kg = unit === 'kg';
    const show = (lb) => {
      if (!kg) return String(Number(lb));
      const k = Number(lb) * KG_PER_LB;
      return String(k < 25 ? Math.max(1, Math.round(k)) : Math.round(k / 2.5) * 2.5);
    };
    return String(text == null ? '' : text).replace(WEIGHT_TOKEN, (_, a, b) => `${b ? `${show(a)}/${show(b)}` : show(a)} ${kg ? 'kg' : 'lb'}`);
  }
  const wodHasSplitWeights = (texts) => texts.some((t) => /\{\d+(?:\.\d+)?\/\d/.test(String(t)));

  /* countdownSec: a short "get ready" before the clock starts. */
  function newWodSession(wod, level, now, countdownSec) {
    const t = (now || Date.now()) + (countdownSec || 0) * 1000;
    const v = wodVersion(wod, level);
    const s = newSession(null, null, {}, t);
    s.name = wod.name;
    const copy = (x) => JSON.parse(JSON.stringify(x));
    s.wod = { id: wod.id, format: wod.format, scoreType: v.scoreType, level: v.level, minutes: v.minutes, scheme: v.scheme, moves: copy(v.moves),
      rounds: 0, logged: false, score: null };
    ['every', 'work', 'rest', 'count'].forEach((k) => { if (v[k] != null) s.wod[k] = v[k]; });
    if (v.strength) s.wod.strength = copy(v.strength);
    return s;
  }
  /* Everything the timer shows, worked out from the session so it stays right after a reload or a pause.
     minute is the current interval for EMOM and death-by; round and phase are for intervals and Tabata. */
  function wodClock(s, now) {
    const w = s.wod;
    const t = now || Date.now();
    const totalMs = Math.round(w.minutes * 60000);
    const every = (w.every || 60) * 1000;
    const intervals = w.work ? w.count : Math.max(1, Math.round(totalMs / every));
    if (t < s.startedAt) {
      return { ready: true, readyMs: s.startedAt - t, elapsedMs: 0, leftMs: totalMs, timeUp: false, intervals, minute: 1, minuteLeftMs: every,
        round: 1, phase: 'work', phaseLeftMs: (w.work || 0) * 1000 };
    }
    const elapsedMs = sessionDuration(s, t);
    const timeUp = elapsedMs >= totalMs;
    const c = { ready: false, readyMs: 0, elapsedMs, leftMs: Math.max(0, totalMs - elapsedMs), timeUp, intervals,
      minute: Math.min(intervals, Math.floor(elapsedMs / every) + 1), minuteLeftMs: timeUp ? 0 : every - (elapsedMs % every) };
    if (w.work) {
      const period = (w.work + (w.rest || 0)) * 1000;
      const idx = Math.min(w.count - 1, Math.floor(elapsedMs / period));
      const within = elapsedMs - idx * period;
      c.round = idx + 1;
      c.phase = timeUp ? 'done' : within < w.work * 1000 ? 'work' : 'rest';
      c.phaseLeftMs = timeUp ? 0 : c.phase === 'work' ? w.work * 1000 - within : period - within;
    }
    return c;
  }
  /* type: a score type, a format id, or a wod field. ctx: the time cap in minutes, or
     { minutes, intervals, unit }. form fields: mins, secs, capped, rounds, reps, done, load.
     Returns { score } or { error }. */
  function readWodScore(type, form, ctx) {
    const kind = wodScoreType(type);
    const o = typeof ctx === 'object' && ctx ? ctx : { minutes: ctx };
    const blank = (v) => String(v == null ? '' : v).trim() === '';
    const whole = (v) => { const n = cleanNumber(v, 'reps'); return n != null && Number.isInteger(n) ? n : null; };
    if (kind === 'time') {
      if (form.capped) return { score: { secs: Math.round(o.minutes * 60), capped: true } };
      const m = blank(form.mins) ? 0 : whole(form.mins);
      const sec = blank(form.secs) ? 0 : whole(form.secs);
      if (m == null || sec == null || sec > 59) return { error: 'Enter your time in minutes and seconds' };
      if (m * 60 + sec <= 0) return { error: 'Enter your time' };
      return { score: { secs: m * 60 + sec, capped: false } };
    }
    if (kind === 'rounds') {
      const r = whole(form.rounds);
      const reps = blank(form.reps) ? 0 : whole(form.reps);
      if (r == null || reps == null) return { error: 'Enter the rounds you finished' };
      if (r === 0 && reps === 0) return { error: 'Enter the rounds or reps you finished' };
      return { score: { rounds: r, reps } };
    }
    if (kind === 'reps') {
      const reps = whole(form.reps);
      if (reps == null || reps < 1) return { error: 'Enter your total reps' };
      return { score: { reps } };
    }
    if (kind === 'load') {
      const w = cleanNumber(form.load, 'w');
      if (w == null || w <= 0) return { error: 'Enter the heaviest weight you lifted' };
      return { score: { w, unit: o.unit === 'kg' ? 'kg' : 'lb' } };
    }
    const of = o.intervals || o.minutes;
    const done = whole(form.done);
    if (done == null || done < 1 || done > of) return { error: `Enter a number from 1 to ${of}` };
    return { score: { done, of } };
  }
  /* A single number where higher is better. A finished time always beats hitting the cap. */
  function wodScoreValue(w, score) {
    const kind = wodScoreType(w);
    if (kind === 'time') return score.capped ? -Infinity : -score.secs;
    if (kind === 'rounds') return score.rounds * 10000 + score.reps;
    if (kind === 'reps') return score.reps;
    if (kind === 'load') return toKg(score.w, score.unit);
    return score.done;
  }
  /* unit: show a load in this unit instead of the one it was entered in. */
  function formatWodScore(w, score, unit) {
    if (!score) return '';
    const kind = wodScoreType(w);
    const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
    if (kind === 'time') return score.capped ? 'Time cap' : formatClock(score.secs * 1000);
    if (kind === 'rounds') {
      const main = typeof w === 'object' && w.format === 'death_by' ? plural(score.rounds, 'full minute') : plural(score.rounds, 'round');
      return `${main}${score.reps ? ` + ${score.reps} reps` : ''}`;
    }
    if (kind === 'reps') return plural(score.reps, 'rep');
    if (kind === 'load') {
      const to = unit === 'kg' || unit === 'lb' ? unit : score.unit;
      const n = Math.round(convertWeight(score.w, score.unit, to) * 10) / 10;
      return `${n} ${to}`;
    }
    const intervalsOf = typeof w === 'object' && w.every && w.every !== 60;
    return `${score.done}/${score.of} ${intervalsOf ? 'rounds' : 'minutes'}`;
  }
  /* Results for one workout at one level, newest first. Levels are never compared with each other. */
  const wodResults = (sessions, wodId, level) => (sessions || [])
    .filter((s) => s.status === 'completed' && s.wod && s.wod.id === wodId && s.wod.level === level && s.wod.score)
    .sort((a, b) => b.startedAt - a.startedAt);
  /* Ties go to the earliest result. Hitting the cap isn't a best worth showing. */
  function bestWodResult(sessions, wodId, level) {
    let best = null;
    wodResults(sessions, wodId, level).forEach((s) => {
      const v = wodScoreValue(s.wod, s.wod.score);
      if (v === -Infinity) return;
      if (!best || v >= wodScoreValue(best.wod, best.wod.score)) best = s;
    });
    return best;
  }
  function finishWod(s, score, now) {
    if (s.status === 'completed') return s;
    const t = now || Date.now();
    if (s.status === 'paused') resumeSession(s, t);
    const planned = Math.round(s.wod.minutes * 60000);
    const timed = wodScoreType(s.wod) === 'time';
    const ran = timed ? (score.capped ? planned : score.secs * 1000) : s.wod.logged ? planned : Math.min(planned, Math.max(0, t - s.startedAt - (s.pausedMs || 0)));
    if (s.wod.logged) s.startedAt = t - ran;
    s.wod.score = score;
    s.exercises = [];
    s.status = 'completed'; s.endedAt = s.startedAt + (s.pausedMs || 0) + ran; s.updatedAt = t;
    return s;
  }

  const api = { WOD_FORMATS, WOD_EQUIPMENT, wodFormatLabel, wodScoreType, wodDay, wodForDate, nextWodDay, wodVersion, wodFormatLine, wodText, wodHasSplitWeights,
    newWodSession, wodClock, readWodScore, wodScoreValue, formatWodScore, wodResults, bestWodResult, finishWod,
    MUSCLES, EQUIPMENT, LEVELS, MEASURES, REST_CHOICES, TEMPLATES, SET_TYPES, VALUE_FIELDS, muscleLabel, equipmentLabel, levelLabel, measureFields,
    cleanNumber, toKg, fromKg, convertWeight, searchExercises, validateCustom, customFromForm,
    newRoutine, newSet, newItem, addSet, removeSet, moveItem, duplicateRoutine, routineStats, routineHasContent, routineFromTemplate,
    newSessionSet, sessionExercise, newSession, addSessionSet, removeSessionSet, lastPerformance, setHint, requiredField, completeSet, setVolumeKg,
    sessionStats, sessionDuration, pauseSession, resumeSession, finishSession, discardedSession, periodSummary, formatClock, formatSet,
    startRest, restLeft, pauseRest, resumeRest, adjustRest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LiftCore = api;
})(typeof self !== 'undefined' ? self : this);
