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
  for (const f of ['lift-core.js', 'exercises.js', 'lift.js']) assert.ok(shell.includes(f), f);
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

test('routines: an item keeps working after its exercise is gone', () => {
  const it = L.newItem({ id: 'custom:x', name: 'Gone', primary: 'chest', measure: 'time' }, {});
  assert.deepEqual([it.name, it.primary, L.measureFields(it.measure)], ['Gone', 'chest', ['secs']]);
});
