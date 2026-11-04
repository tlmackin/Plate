/* Run with: node --test tests/lift-core.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../lift-core.js');

const sandbox = { self: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'exercises.js'), 'utf8'), sandbox);
const LIB = JSON.parse(JSON.stringify(sandbox.self.PLATE_EXERCISES)); // plain arrays from this context, so deepEqual can compare them
const byId = (id) => LIB.find((e) => e.id === id);

test('service worker: its file list is real and includes the lift files', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  for (const f of ['lift-core.js', 'exercises.js', 'wods.js', 'lift.js']) assert.ok(shell.includes(f), f);
  shell.filter((f) => f !== './').forEach((f) => assert.ok(fs.existsSync(path.join(__dirname, '..', f)), f));
});

test('library: every exercise is complete and correctly classified', () => {
  assert.ok(LIB.length >= 140, `expected about 150 exercises, got ${LIB.length}`);
  const muscles = L.MUSCLES.map((m) => m.id), gear = L.EQUIPMENT.map((m) => m.id);
  const levels = L.LEVELS.map((m) => m.id), measures = L.MEASURES.map((m) => m.id);
  for (const e of LIB) {
    assert.ok(muscles.includes(e.primary), `${e.id} primary`);
    assert.ok(gear.includes(e.equipment), `${e.id} equipment`);
    assert.ok(levels.includes(e.level), `${e.id} level`);
    assert.ok(measures.includes(e.measure), `${e.id} measure`);
    e.secondary.forEach((m) => assert.ok(muscles.includes(m) && m !== e.primary, `${e.id} secondary ${m}`));
    assert.ok(e.steps.length >= 3, `${e.id} steps`);
    for (const k of ['form', 'mistakes', 'safety', 'variations']) assert.ok(e[k].length >= 1, `${e.id} ${k}`);
    [...e.steps, ...e.form, ...e.mistakes, ...e.safety, ...e.variations].forEach((s) => assert.ok(typeof s === 'string' && s.trim(), `${e.id} blank text`));
  }
});

test('library: no duplicate ids or names, and alternatives all exist', () => {
  assert.equal(new Set(LIB.map((e) => e.id)).size, LIB.length);
  assert.equal(new Set(LIB.map((e) => e.name.toLowerCase())).size, LIB.length);
  for (const e of LIB) {
    assert.ok(e.alternatives.length >= 1, `${e.id} alternatives`);
    e.alternatives.forEach((id) => {
      assert.ok(byId(id), `${e.id} points to missing ${id}`);
      assert.notEqual(id, e.id, `${e.id} lists itself`);
    });
  }
});

test('library: every muscle group and piece of equipment has exercises', () => {
  L.MUSCLES.forEach((m) => assert.ok(LIB.some((e) => e.primary === m.id), m.id));
  L.EQUIPMENT.forEach((m) => assert.ok(LIB.some((e) => e.equipment === m.id), m.id));
});

test('templates: every exercise exists and timed items get seconds', () => {
  for (const t of L.TEMPLATES) t.items.forEach(([id]) => assert.ok(byId(id), `${t.id} uses missing ${id}`));
  const r = L.routineFromTemplate(L.TEMPLATES.find((t) => t.id === 'full-body-a'), byId, { unit: 'kg', rest: 60 });
  assert.equal(r.items.length, 5);
  const plank = r.items.find((i) => i.exId === 'plank');
  assert.equal(plank.sets[0].secs, 30);
  assert.equal(plank.sets[0].reps, null);
  const squat = r.items.find((i) => i.exId === 'goblet-squat');
  assert.deepEqual([squat.sets.length, squat.sets[0].reps, squat.sets[0].w, squat.sets[0].u, squat.rest], [3, 10, null, 'kg', 60]);
});

test('templates: unknown exercises are skipped', () => {
  const r = L.routineFromTemplate({ name: 'X', items: [['nope', 3, 10], ['plank', 2, 30]] }, byId, {});
  assert.deepEqual(r.items.map((i) => i.exId), ['plank']);
});

test('search: finds names regardless of hyphens, spaces or case', () => {
  for (const q of ['pushup', 'push up', 'PUSH-UP']) assert.ok(L.searchExercises(LIB, { q }).some((e) => e.id === 'push-up'), q);
});

test('search: all words must match, across name, muscle and equipment', () => {
  const res = L.searchExercises(LIB, { q: 'dumbbell chest' });
  assert.ok(res.length && res.every((e) => e.equipment === 'dumbbell'));
  assert.equal(L.searchExercises(LIB, { q: 'zzzz' }).length, 0);
});

test('search: filters combine, and results are alphabetical', () => {
  const res = L.searchExercises(LIB, { muscle: 'chest', equipment: 'barbell' });
  assert.ok(res.length && res.every((e) => e.primary === 'chest' && e.equipment === 'barbell'));
  const names = L.searchExercises(LIB, {}).map((e) => e.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  assert.ok(L.searchExercises(LIB, { level: 'advanced' }).every((e) => e.level === 'advanced'));
});

test('search: a muscle filter means primary muscle only', () => {
  assert.ok(!L.searchExercises(LIB, { muscle: 'chest' }).some((e) => e.id === 'close-grip-bench-press'));
});

test('search: favorites and my-exercises scopes', () => {
  const mine = { id: 'custom:1', custom: true, name: 'Mine', primary: 'chest', secondary: [], equipment: 'other', level: 'beginner' };
  const all = LIB.concat(mine);
  assert.deepEqual(L.searchExercises(all, { favs: ['plank'] }).map((e) => e.id), ['plank']);
  assert.deepEqual(L.searchExercises(all, { mineOnly: true }).map((e) => e.id), ['custom:1']);
});

test('custom exercises: validation', () => {
  const ok = { name: 'Landmine Press', primary: 'shoulders', equipment: 'barbell' };
  assert.equal(L.validateCustom(ok, LIB), null);
  assert.match(L.validateCustom({ ...ok, name: '  ' }, LIB), /name/);
  assert.match(L.validateCustom({ ...ok, primary: '' }, LIB), /muscle/);
  assert.match(L.validateCustom({ ...ok, equipment: 'x' }, LIB), /equipment/);
  assert.match(L.validateCustom({ ...ok, name: 'barbell bench-press' }, LIB), /already in the library/);
});

test('custom exercises: editing may keep its own name', () => {
  const mine = L.customFromForm({ name: 'Landmine Press', primary: 'shoulders', equipment: 'barbell' });
  assert.equal(L.validateCustom({ name: 'landmine press', primary: 'shoulders', equipment: 'barbell' }, [mine], mine.id), null);
  assert.ok(L.validateCustom({ name: 'landmine press', primary: 'shoulders', equipment: 'barbell' }, [mine]));
});

test('custom exercises: form is normalized', () => {
  const c = L.customFromForm({ name: ' Thing ', primary: 'chest', equipment: 'other', secondary: ['chest', 'back', 'back', 'bogus'], measure: 'bad', level: 'bad' });
  assert.ok(c.id.startsWith('custom:') && c.custom);
  assert.deepEqual([c.name, c.secondary, c.measure, c.level], ['Thing', ['back'], 'weight_reps', 'beginner']);
  assert.equal(L.customFromForm({ name: 'A', primary: 'chest', equipment: 'other' }, 'custom:keep').id, 'custom:keep');
});

test('numbers: parses comma decimals and rejects bad input', () => {
  assert.equal(L.cleanNumber('135', 'w'), 135);
  assert.equal(L.cleanNumber('62,5', 'w'), 62.5);
  assert.equal(L.cleanNumber(' 7.5 ', 'w'), 7.5);
  assert.equal(L.cleanNumber('0', 'w'), 0);
  for (const bad of ['', '  ', null, undefined, 'abc', '-5', '12abc', 'Infinity']) assert.equal(L.cleanNumber(bad, 'w'), null, String(bad));
  assert.equal(L.cleanNumber('5001', 'w'), null);
  assert.equal(L.cleanNumber('1001', 'reps'), null);
});

test('units: conversions round-trip and use the exact factor', () => {
  assert.equal(L.convertWeight(100, 'kg', 'kg'), 100);
  assert.ok(Math.abs(L.toKg(135, 'lb') - 61.2349) < 0.001);
  assert.ok(Math.abs(L.convertWeight(L.convertWeight(137.5, 'lb', 'kg'), 'kg', 'lb') - 137.5) < 1e-9);
});

test('routines: sets copy the last target, and the last set cannot be removed', () => {
  const it = L.newItem(byId('barbell-bench-press'), { unit: 'lb', rest: 90 }, 1);
  Object.assign(it.sets[0], { w: 135, reps: 10 });
  L.addSet(it, 'lb');
  assert.deepEqual([it.sets[1].w, it.sets[1].reps], [135, 10]);
  assert.notEqual(it.sets[0].id, it.sets[1].id);
  L.removeSet(it, it.sets[0].id);
  assert.equal(it.sets.length, 1);
  L.removeSet(it, it.sets[0].id);
  assert.equal(it.sets.length, 1);
});

test('routines: moving items stays in bounds', () => {
  const a = ['x', 'y', 'z'];
  assert.deepEqual(L.moveItem(a, 0, 1), ['y', 'x', 'z']);
  assert.deepEqual(L.moveItem(a, 0, -1), ['y', 'x', 'z']);
  assert.deepEqual(L.moveItem(a, 2, 1), ['y', 'x', 'z']);
});

test('routines: a duplicate shares nothing with the original', () => {
  const r = L.newRoutine('Push');
  r.items.push(L.newItem(byId('push-up'), {}));
  const c = L.duplicateRoutine(r);
  assert.equal(c.name, 'Push copy');
  assert.notEqual(c.id, r.id);
  assert.notEqual(c.items[0].uid, r.items[0].uid);
  assert.notEqual(c.items[0].sets[0].id, r.items[0].sets[0].id);
  c.items[0].sets[0].reps = 99;
  assert.equal(r.items[0].sets[0].reps, null);
});

test('routines: stats and whether one is worth saving', () => {
  const r = L.newRoutine(' ');
  assert.equal(L.routineHasContent(r), false);
  r.items.push(L.newItem(byId('plank'), {}, 2), L.newItem(byId('side-plank'), {}, 3));
  assert.equal(L.routineHasContent(r), true);
  assert.deepEqual(L.routineStats(r), { exercises: 2, sets: 5, muscles: ['core'] });
  assert.equal(L.routineHasContent(L.newRoutine('Legs')), true);
});

/* ---- Workout of the day ---- */
const wodBox = { self: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'wods.js'), 'utf8'), wodBox);
const WODS = JSON.parse(JSON.stringify(wodBox.self.PLATE_WODS));
const wodOf = (format) => WODS.find((w) => w.format === format);

test('wods: every workout is complete, and links only to real exercises', () => {
  assert.ok(WODS.length >= 20);
  assert.equal(new Set(WODS.map((w) => w.id)).size, WODS.length);
  assert.equal(new Set(WODS.map((w) => w.name)).size, WODS.length);
  const gear = L.WOD_EQUIPMENT.map((x) => x.id);
  for (const w of WODS) {
    assert.ok(L.WOD_FORMATS.some((f) => f.id === w.format), w.id);
    assert.ok(w.about.trim() && w.equipment.length && w.equipment.every((g) => gear.includes(g)), w.id);
    for (const level of ['beginner', 'intermediate', 'advanced']) {
      const [minutes, scheme, moves] = w.levels[level];
      assert.ok(minutes > 0 && scheme.trim() && moves.length, `${w.id} ${level}`);
      moves.forEach(([text, ex]) => {
        assert.ok(text.trim(), `${w.id} ${level}`);
        if (ex) assert.ok(byId(ex), `${w.id} ${level} links to missing ${ex}`);
      });
    }
  }
});

test('wods: levels really scale, so beginners never get more time pressure or an advanced lift', () => {
  const advanced = LIB.filter((e) => e.level === 'advanced').map((e) => e.id);
  for (const w of WODS) {
    assert.ok(w.levels.beginner[0] <= w.levels.intermediate[0] && w.levels.intermediate[0] <= w.levels.advanced[0], `${w.id} length grows with level`);
    w.levels.beginner[2].forEach(([, ex]) => assert.ok(!advanced.includes(ex), `${w.id} gives a beginner ${ex}`));
    assert.notDeepEqual(w.levels.beginner[2], w.levels.advanced[2], w.id);
  }
});

test('wods: each format and common equipment are covered', () => {
  L.WOD_FORMATS.forEach((f) => assert.ok(WODS.filter((w) => w.format === f.id).length >= 5, f.id));
  assert.ok(WODS.filter((w) => w.equipment.includes('none')).length >= 5, 'enough to do with no gear');
});

test('daily pick: same date gives the same workout, and every workout gets a turn', () => {
  assert.equal(L.wodForDate(WODS, '2026-11-04').id, L.wodForDate(WODS, '2026-11-04').id);
  assert.notEqual(L.wodForDate(WODS, '2026-11-04').id, L.wodForDate(WODS, '2026-11-05').id);
  const seen = new Set();
  const d = new Date(Date.UTC(2026, 0, 1));
  for (let i = 0; i < WODS.length; i++) { seen.add(L.wodForDate(WODS, d.toISOString().slice(0, 10)).id); d.setUTCDate(d.getUTCDate() + 1); }
  assert.equal(seen.size, WODS.length);
  assert.equal(L.wodForDate([], '2026-11-04'), null);
  assert.equal(L.wodForDate(WODS, '1960-01-01') != null, true, 'dates before 1970 still work');
});

test('wod session: copies its version, so later edits to the list cannot change a result', () => {
  const w = JSON.parse(JSON.stringify(wodOf('amrap')));
  const s = L.newWodSession(w, 'intermediate', 1000000, 10);
  assert.deepEqual([s.status, s.name, s.startedAt, s.wod.level, s.wod.minutes, s.exercises.length], ['active', w.name, 1010000, 'intermediate', w.levels.intermediate[0], 0]);
  w.levels.intermediate[2][0][0] = 'changed';
  assert.notEqual(s.wod.moves[0][0], 'changed');
  assert.equal(L.newWodSession(w, 'nonsense', 1000000).wod.level, 'beginner');
});

test('wod clock: get ready, then counts, and pausing holds it', () => {
  const T = 1000000;
  const s = L.newWodSession(wodOf('emom'), 'beginner', T, 10);
  const mins = s.wod.minutes;
  let c = L.wodClock(s, T + 3000);
  assert.deepEqual([c.ready, c.readyMs, c.elapsedMs], [true, 7000, 0]);
  c = L.wodClock(s, T + 10000 + 65000);
  assert.deepEqual([c.ready, c.elapsedMs, c.minute, c.minuteLeftMs, c.timeUp], [false, 65000, 2, 55000, false]);
  L.pauseSession(s, T + 10000 + 65000);
  assert.equal(L.wodClock(s, T + 500000).elapsedMs, 65000);
  L.resumeSession(s, T + 500000);
  assert.equal(L.wodClock(s, T + 501000).elapsedMs, 66000);
  c = L.wodClock(s, T + 9e8);
  assert.deepEqual([c.timeUp, c.leftMs, c.minute, c.minuteLeftMs], [true, 0, mins, 0]);
});

test('wod score: reads each format, and rejects nonsense', () => {
  assert.deepEqual(L.readWodScore('for_time', { mins: '12', secs: '5' }, 15).score, { secs: 725, capped: false });
  assert.deepEqual(L.readWodScore('for_time', { mins: '', secs: '45' }, 15).score, { secs: 45, capped: false });
  assert.deepEqual(L.readWodScore('for_time', { capped: true }, 15).score, { secs: 900, capped: true });
  for (const bad of [{ mins: '', secs: '' }, { mins: '0', secs: '0' }, { mins: '5', secs: '60' }, { mins: 'x', secs: '1' }, { mins: '-1', secs: '1' }, { mins: '1.5', secs: '1' }]) assert.ok(L.readWodScore('for_time', bad, 15).error, JSON.stringify(bad));
  assert.deepEqual(L.readWodScore('amrap', { rounds: '4', reps: '' }, 12).score, { rounds: 4, reps: 0 });
  assert.deepEqual(L.readWodScore('amrap', { rounds: '0', reps: '7' }, 12).score, { rounds: 0, reps: 7 });
  for (const bad of [{ rounds: '', reps: '3' }, { rounds: '0', reps: '0' }, { rounds: '2.5', reps: '' }]) assert.ok(L.readWodScore('amrap', bad, 12).error, JSON.stringify(bad));
  assert.deepEqual(L.readWodScore('emom', { done: '8' }, 10).score, { done: 8, of: 10 });
  for (const bad of ['', '0', '11', 'x']) assert.ok(L.readWodScore('emom', { done: bad }, 10).error, bad);
});

test('wod score: reads naturally', () => {
  assert.equal(L.formatWodScore('for_time', { secs: 725, capped: false }), '12:05');
  assert.equal(L.formatWodScore('for_time', { secs: 900, capped: true }), 'Time cap');
  assert.equal(L.formatWodScore('amrap', { rounds: 1, reps: 0 }), '1 round');
  assert.equal(L.formatWodScore('amrap', { rounds: 4, reps: 7 }), '4 rounds + 7 reps');
  assert.equal(L.formatWodScore('emom', { done: 8, of: 10 }), '8/10 minutes');
});

function wodResult(w, level, score, startedAt) {
  const s = L.newWodSession(w, level, startedAt);
  return L.finishWod(s, score, startedAt + 600000);
}

test('wod best: right direction per format, and never compared across levels', () => {
  const t = wodOf('for_time'), a = wodOf('amrap');
  const list = [
    wodResult(t, 'beginner', { secs: 700, capped: false }, 1000000), wodResult(t, 'beginner', { secs: 650, capped: false }, 2000000),
    wodResult(t, 'beginner', { secs: 900, capped: true }, 3000000), wodResult(t, 'advanced', { secs: 100, capped: false }, 4000000),
    wodResult(a, 'beginner', { rounds: 3, reps: 9 }, 5000000), wodResult(a, 'beginner', { rounds: 4, reps: 0 }, 6000000),
  ];
  assert.equal(L.bestWodResult(list, t.id, 'beginner').wod.score.secs, 650);
  assert.equal(L.bestWodResult(list, t.id, 'advanced').wod.score.secs, 100);
  assert.equal(L.bestWodResult(list, t.id, 'intermediate'), null);
  assert.equal(L.bestWodResult(list, a.id, 'beginner').wod.score.rounds, 4);
  assert.deepEqual(L.wodResults(list, t.id, 'beginner').map((s) => s.startedAt), [3000000, 2000000, 1000000]);
  assert.equal(L.bestWodResult([list[2]], t.id, 'beginner'), null, 'only hitting the cap is not a best');
});

test('wod finish: time matches the score, and finishing twice changes nothing', () => {
  const T = 1000000;
  const s = L.newWodSession(wodOf('for_time'), 'beginner', T);
  L.finishWod(s, { secs: 300, capped: false }, T + 999999);
  assert.equal(s.status, 'completed');
  assert.equal(L.sessionDuration(s), 300000);
  const end = s.endedAt;
  L.finishWod(s, { secs: 1, capped: false }, T + 2e6);
  assert.deepEqual([s.endedAt, s.wod.score.secs], [end, 300]);
  const a = L.newWodSession(wodOf('amrap'), 'beginner', T);
  L.finishWod(a, { rounds: 2, reps: 0 }, T + 60000);
  assert.equal(L.sessionDuration(a), 60000, 'stopping early counts the time actually done');
  const logged = L.newWodSession(wodOf('amrap'), 'beginner', T);
  logged.wod.logged = true;
  L.finishWod(logged, { rounds: 2, reps: 0 }, T + 5);
  assert.equal(L.sessionDuration(logged), logged.wod.minutes * 60000);
});

test('wod results stay out of lifting numbers but count as workouts', () => {
  const r = wodResult(wodOf('amrap'), 'beginner', { rounds: 3, reps: 0 }, 1000000);
  assert.equal(L.lastPerformance([r], 'plank'), null);
  const sum = L.periodSummary([r], 0, 9e12);
  assert.deepEqual([sum.workouts, sum.sets, sum.volumeKg], [1, 0, 0]);
  assert.ok(sum.durationMs > 0);
});

/* ---- Workouts ---- */
const bench = () => byId('barbell-bench-press');
function routineWithBench() {
  const r = L.newRoutine('Push');
  const it = L.newItem(bench(), { unit: 'lb', rest: 120 }, 2);
  it.sets.forEach((s) => { s.w = 135; s.reps = 10; });
  it.note = 'Pause';
  r.items.push(it);
  return r;
}
function doneSession(startedAt, sets, exId = 'barbell-bench-press') {
  const s = L.newSession(null, null, {}, startedAt);
  const ex = L.sessionExercise(byId(exId), { unit: 'lb' }, 0);
  ex.sets = sets.map(([w, reps, type]) => Object.assign(L.newSessionSet('lb'), { w, reps, type: type || 'normal', done: true, doneAt: startedAt }));
  s.exercises.push(ex);
  return L.finishSession(s, startedAt + 3600000);
}

test('session: starting from a routine copies the plan into targets, leaving results blank', () => {
  const s = L.newSession(routineWithBench(), byId, { unit: 'kg' }, 1000);
  assert.deepEqual([s.status, s.name, s.startedAt], ['active', 'Push', 1000]);
  const ex = s.exercises[0];
  assert.deepEqual([ex.exId, ex.rest, ex.note, ex.equipment, ex.secondary.includes('triceps')], ['barbell-bench-press', 120, 'Pause', 'barbell', true]);
  const set = ex.sets[0];
  assert.deepEqual([set.w, set.reps, set.done, set.u, set.target.w, set.target.reps, set.target.u], [null, null, false, 'lb', 135, 10, 'lb']);
});

test('session: changing the routine later cannot change the session', () => {
  const r = routineWithBench();
  const s = L.newSession(r, byId, {});
  r.items[0].sets[0].w = 999; r.items[0].name = 'Renamed'; r.name = 'Renamed';
  assert.deepEqual([s.name, s.exercises[0].name, s.exercises[0].sets[0].target.w], ['Push', 'Barbell Bench Press', 135]);
});

test('session: an exercise missing from the library still starts', () => {
  const r = L.newRoutine('X');
  r.items.push(L.newItem({ id: 'custom:gone', name: 'Gone', primary: 'chest', measure: 'weight_reps' }, {}));
  const s = L.newSession(r, () => undefined, {});
  assert.deepEqual([s.exercises[0].name, s.exercises[0].secondary], ['Gone', []]);
});

test('previous: finds the latest finished performance, ignoring others', () => {
  const old = doneSession(1000, [[100, 5]]);
  const latest = doneSession(5000, [[110, 5], [115, 3]]);
  const other = doneSession(9000, [[50, 5]], 'plank');
  const active = L.newSession(routineWithBench(), byId, {}, 9500);
  active.exercises[0].sets[0].done = true;
  const p = L.lastPerformance([old, latest, other, active], 'barbell-bench-press');
  assert.deepEqual([p.at, p.sets.map((x) => x.w)], [5000, [110, 115]]);
  assert.equal(L.lastPerformance([old], 'squat'), null);
  assert.equal(L.lastPerformance([latest], 'barbell-bench-press', latest.id), null);
});

test('hint: the plan wins over last time, field by field', () => {
  const set = L.newSessionSet('lb', { w: null, u: 'lb', reps: 8, secs: null, dist: null });
  const h = L.setHint(set, { w: 145, u: 'lb', reps: 5 });
  assert.deepEqual([h.w, h.reps], [145, 8]);
  assert.deepEqual(L.setHint(L.newSessionSet('lb'), null), { w: null, reps: null, secs: null, dist: null });
});

test('hint: a weight in another unit is converted, not relabeled', () => {
  const h = L.setHint(L.newSessionSet('kg'), { w: 135, u: 'lb', reps: 10 });
  assert.equal(h.w, 61.2);
  const p = { w: 135, u: 'lb', reps: 10 };
  L.setHint(L.newSessionSet('kg'), p);
  assert.equal(p.w, 135, 'the old record is untouched');
});

test('complete: blanks fill from the hint, typed values win', () => {
  const set = L.newSessionSet('lb');
  set.w = 140;
  assert.equal(L.completeSet(set, { w: 135, reps: 10 }, 'weight_reps', 42), true);
  assert.deepEqual([set.w, set.reps, set.done, set.doneAt], [140, 10, true, 42]);
});

test('complete: refused without the required value, but weight is optional', () => {
  const none = L.newSessionSet('lb');
  assert.equal(L.completeSet(none, {}, 'weight_reps'), false);
  assert.equal(none.done, false);
  const band = L.newSessionSet('lb'); band.reps = 15;
  assert.equal(L.completeSet(band, {}, 'weight_reps'), true);
  const timed = L.newSessionSet('lb');
  assert.equal(L.completeSet(timed, {}, 'time'), false);
  timed.secs = 30;
  assert.equal(L.completeSet(timed, {}, 'time'), true);
  const carry = L.newSessionSet('lb'); carry.w = 50;
  assert.equal(L.completeSet(carry, {}, 'weight_distance'), false);
  carry.dist = 40;
  assert.equal(L.completeSet(carry, {}, 'weight_distance'), true);
  assert.deepEqual(['weight_reps', 'reps', 'assisted', 'time', 'distance', 'weight_distance'].map(L.requiredField), ['reps', 'reps', 'reps', 'secs', 'dist', 'dist']);
});

test('volume: only finished work sets with weight and reps count', () => {
  const set = (o) => Object.assign(L.newSessionSet('lb'), { w: 100, reps: 10, done: true }, o);
  const lb100x10 = 100 * 0.45359237 * 10;
  assert.ok(Math.abs(L.setVolumeKg(set({}), 'weight_reps') - lb100x10) < 1e-9);
  assert.ok(Math.abs(L.setVolumeKg(set({ type: 'drop' }), 'weight_reps') - lb100x10) < 1e-9);
  assert.equal(L.setVolumeKg(set({ u: 'kg' }), 'weight_reps'), 1000);
  assert.equal(L.setVolumeKg(set({ done: false }), 'weight_reps'), 0);
  assert.equal(L.setVolumeKg(set({ type: 'warmup' }), 'weight_reps'), 0);
  assert.equal(L.setVolumeKg(set({}), 'assisted'), 0);
  assert.equal(L.setVolumeKg(set({}), 'time'), 0);
  assert.equal(L.setVolumeKg(set({}), 'weight_distance'), 0);
  assert.equal(L.setVolumeKg(set({ w: null }), 'reps'), 0);
  assert.ok(L.setVolumeKg(set({ w: 25 }), 'reps') > 0, 'added weight counts');
});

test('stats: mixed units add up correctly', () => {
  const s = doneSession(0, [[100, 10]]);
  const ex = L.sessionExercise(bench(), { unit: 'kg' }, 1);
  Object.assign(ex.sets[0], { w: 100, reps: 2, done: true });
  s.exercises.push(ex);
  const st = L.sessionStats(s);
  assert.deepEqual([st.exercises, st.sets, st.done], [2, 2, 2]);
  assert.ok(Math.abs(st.volumeKg - (453.59237 + 200)) < 1e-6);
});

test('duration: paused time is left out, and the clock stops while paused', () => {
  const T = 1000000;
  const s = L.newSession(null, null, {}, T);
  assert.equal(L.sessionDuration(s, T + 60000), 60000);
  L.pauseSession(s, T + 60000);
  assert.equal(L.sessionDuration(s, T + 999999), 60000);
  L.pauseSession(s, T + 70000);
  assert.equal(s.pausedAt, T + 60000, 'pausing twice keeps the first time');
  L.resumeSession(s, T + 120000);
  assert.deepEqual([s.status, s.pausedMs, s.pausedAt], ['active', 60000, null]);
  assert.equal(L.sessionDuration(s, T + 180000), 120000);
  L.resumeSession(s, T + 200000);
  assert.equal(s.pausedMs, 60000, 'resuming twice adds nothing');
});

test('finish: keeps finished sets only, and finishing twice changes nothing', () => {
  const T = 1000000;
  const s = L.newSession(routineWithBench(), byId, {}, T);
  s.exercises.push(L.sessionExercise(byId('plank'), {}, 2));
  s.exercises[0].sets[0].done = true;
  L.pauseSession(s, T + 1000);
  L.finishSession(s, T + 5000);
  assert.deepEqual([s.status, s.endedAt, s.pausedMs, s.exercises.length, s.exercises[0].sets.length], ['completed', T + 5000, 4000, 1, 1]);
  assert.equal(L.sessionDuration(s, T + 999999), 1000);
  L.finishSession(s, T + 9000);
  assert.equal(s.endedAt, T + 5000);
});

test('discard: leaves a marker with no workout data', () => {
  const s = doneSession(1000, [[100, 5]]);
  const d = L.discardedSession(s, 2000);
  assert.deepEqual(d, { id: s.id, status: 'discarded', startedAt: 1000, discardedAt: 2000, updatedAt: 2000 });
  assert.equal(L.lastPerformance([d], 'barbell-bench-press'), null);
  assert.equal(L.periodSummary([d], 0, 9999).workouts, 0);
});

test('adding a set: starts from the last set, undone', () => {
  const ex = L.sessionExercise(bench(), { unit: 'kg' }, 1);
  Object.assign(ex.sets[0], { w: 60, reps: 5, done: true });
  L.addSessionSet(ex, 'lb');
  const added = ex.sets[1];
  assert.deepEqual([added.w, added.reps, added.done, added.u, added.target.w, added.target.reps], [null, null, false, 'kg', 60, 5]);
  assert.notEqual(added.id, ex.sets[0].id);
  const empty = L.sessionExercise(bench(), {}, 1);
  L.removeSessionSet(empty, empty.sets[0].id);
  L.addSessionSet(empty, 'kg');
  assert.equal(empty.sets[0].u, 'kg');
});

test('period summary: counts only finished workouts in range', () => {
  const inside = doneSession(5000, [[100, 10]]);
  const list = [doneSession(1000, [[100, 10]]), inside, doneSession(9000, [[100, 10]]), L.newSession(null, null, {}, 5000)];
  const out = L.periodSummary(list, 2000, 9000);
  assert.deepEqual([out.workouts, out.sets, out.durationMs], [1, 1, 3600000]);
});

test('format: sets read naturally for every kind of exercise', () => {
  const f = (o, m, plain) => L.formatSet(Object.assign({ w: null, u: 'lb', reps: null, secs: null, dist: null }, o), m, plain);
  assert.equal(f({ w: 135, reps: 10 }, 'weight_reps'), '135 lb × 10');
  assert.equal(f({ w: 135, reps: 10 }, 'weight_reps', true), '135 × 10');
  assert.equal(f({ reps: 12 }, 'reps'), '12 reps');
  assert.equal(f({ reps: 12 }, 'reps', true), '12');
  assert.equal(f({ w: 40, reps: 8 }, 'assisted'), '40 lb assist × 8');
  assert.equal(f({ secs: 75 }, 'time'), '1:15');
  assert.equal(f({ dist: 500 }, 'distance'), '500 m');
  assert.equal(f({ w: 50, dist: 40 }, 'weight_distance'), '50 lb × 40 m');
  assert.equal(L.formatClock(3725000), '1:02:05');
  assert.equal(L.formatClock(-5), '0:00');
});

test('rest timer: counts from a fixed end time, and survives pausing', () => {
  const T = 1000000;
  const r = L.startRest(90, T);
  assert.equal(L.restLeft(r, T + 30000), 60000);
  assert.equal(L.restLeft(r, T + 500000), 0, 'never negative, however long the phone slept');
  L.pauseRest(r, T + 30000);
  assert.equal(L.restLeft(r, T + 500000), 60000);
  L.adjustRest(r, 15, T + 500000);
  assert.equal(L.restLeft(r, T + 500000), 75000);
  L.resumeRest(r, T + 500000);
  assert.equal(L.restLeft(r, T + 510000), 65000);
  L.adjustRest(r, -15, T + 510000);
  assert.equal(L.restLeft(r, T + 510000), 50000);
  L.adjustRest(r, -999, T + 510000);
  assert.equal(L.restLeft(r, T + 510000), 0);
});

test('routines: an item keeps working after its exercise is gone', () => {
  const it = L.newItem({ id: 'custom:x', name: 'Gone', primary: 'chest', measure: 'time' }, {});
  assert.deepEqual([it.name, it.primary, L.measureFields(it.measure)], ['Gone', 'chest', ['secs']]);
});
