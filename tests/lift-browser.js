/* Drives the real app in Chrome against an in-memory fake account, so it never touches the live Supabase project.
   Needs playwright-core, which isn't part of the app:  npm install playwright-core  (anywhere), then
     set NODE_PATH to that node_modules folder and run:  node tests/lift-browser.js [folder for screenshots] */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const shots = process.argv[2];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/json' };
let serverDelayMs = 0; // simulates a weak signal
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  setTimeout(() => {
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }, serverDelayMs);
});

/* The fake account: one set of rows that any number of "devices" share. */
const cloud = new Map();
let clock = Date.parse('2026-01-01T00:00:00Z');
const remotePush = (rows) => { rows.forEach((r) => { clock += 1000; cloud.set(r.key, { ...r, server_at: new Date(clock).toISOString() }); }); };
const remotePull = (since) => [...cloud.values()].filter((r) => !since || Date.parse(r.server_at) > Date.parse(since));
const FAKE = () => {
  window.__PLATE_FAKE_REMOTE = {
    getUser: () => (localStorage.getItem('hang') ? new Promise(() => {}) : Promise.resolve({ id: 'user-1', email: 'test@example.com' })), onAuth() {}, signOut: async () => {},
    push: (rows) => window.__remotePush(rows), pull: (since) => window.__remotePull(since),
    wipe: () => window.__remoteWipe(),
    friends: { myUsername: async () => 'tester', setUsername: async (u) => u, list: async () => [], request: async () => 'sent', accept: async () => {}, remove: async () => {}, day: async () => ({ entries: [], targets: {} }) },
  };
};

const results = [];
const failures = [];
async function step(name, fn) {
  try { await fn(); results.push(name); console.log('ok   ' + name); }
  catch (e) { failures.push(name); console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').slice(0, 6).join('\n     ')); }
}

async function device(browser, base, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 780 }, colorScheme: opts.colorScheme || 'light', reducedMotion: 'reduce', serviceWorkers: opts.sw ? 'allow' : 'block', hasTouch: true });
  await ctx.route(/supabase\.co|openfoodfacts|nal\.usda/, (r) => { ctx.__leaked = true; r.abort(); });
  await ctx.exposeFunction('__remotePush', remotePush);
  await ctx.exposeFunction('__remotePull', remotePull);
  await ctx.exposeFunction('__remoteWipe', () => cloud.clear());
  await ctx.addInitScript(FAKE);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  page.dialogs = [];
  page.on('dialog', (d) => { page.dialogs.push(d.message()); d.accept(); });
  await page.goto(base);
  await page.waitForSelector('body.in-app');
  return page;
}
const tab = (page, t) => page.click(`.tab[data-tab="${t}"]`);
const synced = (page) => page.evaluate(async () => { await window.__plate.Sync.run(); return window.__plate.meta.dirty.length; });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name + '.png') }); };
const topSheet = (page) => page.locator('.sheet').last();

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const a = await device(browser, base);

  await step('existing tabs all still open without errors', async () => {
    for (const t of ['foods', 'friends', 'report', 'settings', 'diary']) {
      await tab(a, t);
      await a.waitForFunction((x) => document.querySelector(`.tab[data-tab="${x}"]`).classList.contains('active'), t);
    }
    await tab(a, 'add');
    await a.waitForSelector('.sheet');
    await a.goBack();
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    assert.deepEqual(a.errors, []);
  });

  await step('a food diary entry still saves and syncs', async () => {
    await a.evaluate(() => window.__plate.DB.set('day:2026-01-01', []));
    await tab(a, 'foods');
    await a.click('button[data-p="mine"]');
    await a.click('#newfood');
    await a.fill('#ff-name', 'Test oats');
    await a.fill('#ff-k', '150');
    await a.click('#ff-save');
    await a.waitForSelector('text=Test oats');
    assert.equal(await synced(a), 0);
    assert.ok(cloud.has('myFoods'));
  });

  await step('a save and its upload flag land together, even if the page closes straight after', async () => {
    const check = await a.evaluate(async () => {
      const { DB } = window.__plate;
      await DB.setBoth('zz:a', 1, 'zz:b', 2);
      const both = [await DB.get('zz:a'), await DB.get('zz:b')];
      await DB.del('zz:a'); await DB.del('zz:b');
      return both;
    });
    assert.deepEqual(check, [1, 2]);
    await a.reload();
    await a.waitForSelector('body.in-app');
    await tab(a, 'foods');
    await a.click('button[data-p="mine"]');
    await a.click('#newfood');
    await a.fill('#ff-name', 'Flag check');
    await a.fill('#ff-k', '10');
    await a.evaluate(() => document.querySelector('#ff-save').click());
    await a.waitForFunction(async () => (await window.__plate.DB.get('_meta')).dirty.includes('myFoods'));
    await a.reload();
    await a.waitForSelector('body.in-app');
    await a.waitForFunction(() => window.__plate.Sync.state === 'ok');
    assert.equal(await synced(a), 0);
    assert.ok(cloud.get('myFoods').value.some((f) => f.name === 'Flag check'), 'it still reaches the account after a reload');
  });

  await step('Lift tab opens on Workout, with an empty week and no pretend history', async () => {
    await tab(a, 'lift');
    await a.waitForSelector('#wk-empty');
    assert.match((await a.textContent('.nutgrid')).replace(/\s+/g, ''), /0workouts0minutes0sets0lbvolume/);
    assert.equal(await a.locator('[data-summary]').count(), 0);
    await shot(a, '00-workout-empty');
  });

  await step('routines pane lists templates', async () => {
    await a.click('[data-pane="routines"]');
    await a.waitForSelector('text=+ New routine');
    assert.equal(await a.locator('[data-template]').count(), 9);
    await shot(a, '01-routines');
  });

  await step('library: lists 174, search ignores hyphens, filters combine', async () => {
    await a.click('[data-pane="exercises"]');
    await a.waitForSelector('.lift-count');
    assert.match(await a.textContent('.lift-count'), /^174 /);
    await shot(a, '02-library');
    await a.fill('.lift-q', 'pushup');
    await a.waitForSelector('[data-ex="push-up"]');
    assert.equal(await a.evaluate(() => document.activeElement.classList.contains('lift-q')), true, 'typing keeps focus');
    await a.fill('.lift-q', '');
    await a.selectOption('[data-f="muscle"]', 'chest');
    await a.selectOption('[data-f="equipment"]', 'barbell');
    assert.match(await a.textContent('.lift-count'), /^3 /);
    await a.fill('.lift-q', 'nothing like this');
    await a.waitForSelector('text=No exercises match');
    await a.fill('.lift-q', '');
    await a.selectOption('[data-f="muscle"]', '');
    await a.selectOption('[data-f="equipment"]', '');
  });

  await step('exercise detail: instructions, diagram, alternatives, favorite', async () => {
    await a.fill('.lift-q', 'bench press');
    await a.click('[data-ex="barbell-bench-press"]');
    const s = topSheet(a);
    await s.locator('text=How to do it').waitFor();
    for (const h of ['Good form', 'Common mistakes', 'Safety', 'Variations', 'Alternatives']) assert.equal(await s.locator(`h2:text-is("${h}")`).count(), 1, h);
    assert.equal(await s.locator('.bm-r.on-p').count(), 1, 'chest is on the front view only');
    assert.equal(await s.locator('.bm-r.on-s').count(), 3, 'triceps on the back view, shoulders on both');
    await shot(a, '03-detail');
    await s.locator('#ex-fav').click();
    await s.locator('text=In your favorites').waitFor();
    await s.locator('[data-alt]').first().click();
    await a.waitForFunction(() => document.querySelectorAll('.sheet').length === 2);
    await a.goBack();
    await a.waitForFunction(() => document.querySelectorAll('.sheet').length === 1);
    await a.goBack();
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    await a.fill('.lift-q', '');
    await a.click('[data-scope="favs"]');
    assert.match(await a.textContent('.lift-count'), /^1 /);
    await a.click('[data-scope="all"]');
  });

  await step('custom exercise: duplicate refused, odd text is shown as text, editable', async () => {
    await a.click('#ex-new');
    await a.fill('#cx-name', 'barbell bench-press');
    await a.selectOption('#cx-primary', 'shoulders');
    await a.selectOption('#cx-equipment', 'barbell');
    await a.click('#cx-save');
    await a.waitForSelector('#toast.show:has-text("already in the library")');
    await a.fill('#cx-name', '<img src=x onerror=window.__xss=1>Landmine');
    await a.click('.lift-chip[data-m="triceps"]');
    await a.click('#cx-save');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    await a.fill('.lift-q', 'landmine');
    const row = a.locator('[data-ex^="custom:"]');
    await row.waitFor();
    await row.click();
    await topSheet(a).locator('#ex-edit').waitFor();
    assert.equal(await a.evaluate(() => window.__xss), undefined);
    assert.equal(await a.locator('.sheet img').count(), 0);
    await topSheet(a).locator('#ex-edit').click();
    await topSheet(a).locator('#cx-name').fill('Landmine Press');
    await topSheet(a).locator('#cx-save').click();
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    await a.waitForSelector('text=Landmine Press');
    await a.fill('.lift-q', '');
  });

  await step('routine: build, targets, copy set, reorder, and save on back button', async () => {
    await a.click('[data-pane="routines"]');
    await a.click('#rt-new');
    await a.fill('#rt-name', 'Push Day');
    await a.click('#rt-add');
    const pk = topSheet(a);
    await pk.locator('.lift-q').fill('barbell bench');
    await pk.locator('[data-pick="barbell-bench-press"]').click();
    await pk.locator('.lift-q').fill('plank');
    await pk.locator('[data-pick="plank"]').click();
    await pk.locator('.lift-q').fill('landmine');
    await pk.locator('[data-pick^="custom:"]').click();
    assert.match(await pk.locator('#pk-done').textContent(), /Add 3 exercises/);
    await pk.locator('#pk-done').click();
    await a.waitForFunction(() => document.querySelectorAll('.lift-item').length === 3);
    const names = () => a.locator('.lift-item h2').allTextContents();
    const hits = (await names()).join();
    assert.ok(/Barbell Bench Press/.test(hits) && /Forearm Plank/.test(hits), hits);
    const bench = a.locator('.lift-item', { hasText: 'Barbell Bench Press' });
    await bench.locator('[data-field="w"]').first().fill('135');
    await bench.locator('[data-field="reps"]').first().fill('10');
    assert.equal(await a.evaluate(() => document.activeElement.dataset.field), 'reps', 'typing keeps focus');
    await bench.locator('[data-rmset]').nth(2).click();
    await bench.locator('[data-rmset]').nth(1).click();
    await bench.locator('[data-addset]').click();
    assert.equal(await bench.locator('[data-field="w"]').nth(1).inputValue(), '135', 'new set copies the last');
    assert.equal(await a.locator('.lift-item', { hasText: 'Forearm Plank' }).locator('[data-field="secs"]').count(), 3, 'timed exercise records seconds');
    await bench.locator('select[data-rest]').selectOption('180');
    await bench.locator('[data-note]').fill('Pause on chest');
    await shot(a, '04-editor');
    await a.locator('.lift-item', { hasText: 'Forearm Plank' }).locator('[data-move="-1"]').click();
    const order = await names();
    assert.equal(order.indexOf('Forearm Plank') < order.indexOf('Barbell Bench Press'), true, order.join());
    assert.equal(await a.locator('.lift-item').first().locator('[data-move="-1"]').isDisabled(), true);
    await a.goBack();
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    await a.waitForSelector('[data-routine]:has-text("Push Day")');
    assert.match(await a.textContent('[data-routine]'), /3 exercises · 8 sets/);
  });

  await step('routine: survives a reload and reopens intact', async () => {
    await a.reload();
    await a.waitForSelector('body.in-app');
    await tab(a, 'lift');
    await a.click('[data-pane="routines"]');
    await a.click('[data-routine]:has-text("Push Day")');
    const bench = a.locator('.lift-item', { hasText: 'Barbell Bench Press' });
    assert.equal(await bench.locator('[data-field="w"]').first().inputValue(), '135');
    assert.equal(await bench.locator('select[data-rest]').inputValue(), '180');
    assert.equal(await bench.locator('[data-note]').inputValue(), 'Pause on chest');
    await a.click('#rt-done');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
  });

  await step('routine: an edit saves itself if the app closes before leaving the screen', async () => {
    await a.click('[data-routine]:has-text("Push Day")');
    await a.fill('#rt-name', 'Push Day A');
    await a.waitForFunction(async () => (await Object.values(window.__plate.S) && (await window.__plate.DB.keys()).length) > 0);
    await a.waitForTimeout(900); // the auto-save delay
    await a.reload();
    await a.waitForSelector('body.in-app');
    await tab(a, 'lift');
    await a.click('[data-pane="routines"]');
    await a.waitForSelector('[data-routine]:has-text("Push Day A")');
  });

  let b;
  await step('sync: routine, custom exercise and favorite reach a second device', async () => {
    assert.equal(await synced(a), 0);
    b = await device(browser, base);
    await tab(b, 'lift');
    await b.click('[data-pane="routines"]');
    await b.waitForSelector('[data-routine]:has-text("Push Day A")', { timeout: 5000 });
    await b.click('[data-pane="exercises"]');
    await b.fill('.lift-q', 'landmine');
    await b.waitForSelector('text=Landmine Press');
    await b.fill('.lift-q', '');
    await b.click('[data-scope="favs"]');
    assert.match(await b.textContent('.lift-count'), /^1 /);
    await b.click('[data-scope="all"]');
    assert.ok([...cloud.keys()].every((k) => !k.startsWith('_')), 'nothing local-only is uploaded');
  });

  await step('history safety: deleting a custom exercise leaves routines readable', async () => {
    await a.click('[data-pane="exercises"]');
    await a.fill('.lift-q', 'landmine');
    await a.click('[data-ex^="custom:"]');
    await topSheet(a).locator('#ex-edit').click();
    await topSheet(a).locator('#cx-del').click();
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    await a.fill('.lift-q', '');
    await a.click('[data-pane="routines"]');
    await a.click('[data-routine]:has-text("Push Day A")');
    assert.equal(await a.locator('.lift-item h2:has-text("Landmine Press")').count(), 1);
    await a.click('#rt-done');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
  });

  await step('template: copying makes an independent routine in the chosen unit', async () => {
    await a.selectOption('#pf-unit', 'kg');
    await a.click('[data-template="full-body-a"]');
    await topSheet(a).locator('text=example to adapt').waitFor();
    await a.click('#tp-use');
    await a.waitForFunction(() => document.querySelectorAll('.lift-item').length === 5);
    assert.equal(await a.locator('.lift-item').first().locator('em').first().textContent(), 'kg');
    assert.equal(await a.locator('.lift-item').first().locator('[data-field="reps"]').first().inputValue(), '10');
    await a.click('#rt-done');
    await a.waitForSelector('[data-routine]:has-text("Full Body A")');
    await a.click('[data-routine]:has-text("Push Day A")');
    assert.equal(await a.locator('.lift-item', { hasText: 'Barbell Bench Press' }).locator('em').first().textContent(), 'lb', 'old targets keep their unit');
    await a.click('#rt-done');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
  });

  await step('routine: duplicate is separate, and deletes reach the other device', async () => {
    await a.click('[data-routine]:has-text("Full Body A")');
    await a.click('#rt-dup');
    await a.waitForFunction(() => document.querySelector('#rt-name') && document.querySelector('#rt-name').value === 'Full Body A copy');
    await a.click('#rt-done');
    await a.waitForSelector('[data-routine]:has-text("Full Body A copy")');
    assert.equal(await a.locator('[data-routine]').count(), 3);
    assert.equal(await synced(a), 0);
    await b.evaluate(() => window.__plate.Sync.run());
    await b.click('[data-pane="routines"]');
    await b.waitForSelector('[data-routine]:has-text("Full Body A copy")');
    await a.click('[data-routine]:has-text("Full Body A copy")');
    await a.click('#rt-del');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    assert.equal(await a.locator('[data-routine]').count(), 2);
    assert.equal(await synced(a), 0);
    await b.evaluate(() => window.__plate.Sync.run());
    await b.waitForFunction(() => document.querySelectorAll('[data-routine]').length === 2);
  });

  await step('an empty new routine is not saved', async () => {
    await a.click('#rt-new');
    await a.click('#rt-done');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    assert.equal(await a.locator('[data-routine]').count(), 2);
  });

  await step('backup includes lifting data, and restoring brings it back', async () => {
    const data = await a.evaluate(async () => {
      const { DB } = window.__plate; const out = {};
      for (const k of (await DB.keys()).filter((x) => !x.startsWith('_'))) out[k] = await DB.get(k);
      return out;
    });
    assert.ok(Object.keys(data).some((k) => k.startsWith('wo:r:')) && 'wo:favs' in data && 'wo:exercises' in data);
  });

  /* ---------------- Phase 2: live workouts ---------------- */
  const workoutRow = (page, name, n) => page.locator('.wk-ex', { hasText: name }).locator('.wk-row:not(.wk-head)').nth(n);
  const stats = (page) => page.textContent('#wk-stats');
  const sessionDocs = () => [...cloud.entries()].filter(([k]) => k.startsWith('wo:s:')).map(([, r]) => r.value);

  await step('workout: start from a routine, targets show as prompts, nothing pre-filled as done', async () => {
    await a.selectOption('#pf-unit', 'lb'); // the template test above switched to kg
    await a.click('[data-pane="workout"]');
    await a.click('[data-start]:has-text("Push Day A")');
    await a.waitForSelector('.wk-ex');
    assert.equal(await a.inputValue('#wk-name'), 'Push Day A');
    assert.match(await stats(a), /3 exercises · 0\/8 sets · 0 lb/);
    const first = workoutRow(a, 'Barbell Bench Press', 0);
    assert.equal(await first.locator('[data-field="w"]').getAttribute('placeholder'), '135');
    assert.equal(await first.locator('[data-field="w"]').inputValue(), '');
    assert.equal(await a.locator('.wk-row.done').count(), 0);
    assert.equal(await a.locator('.wk-exname:has-text("Landmine Press")').count(), 1, 'a deleted custom exercise still works');
  });

  await step('workout: one tap records the planned numbers, and starts the rest timer', async () => {
    const first = workoutRow(a, 'Barbell Bench Press', 0);
    await first.locator('[data-done]').click();
    await a.waitForSelector('.wk-row.done');
    assert.equal(await workoutRow(a, 'Barbell Bench Press', 0).locator('[data-field="w"]').inputValue(), '135');
    assert.match(await stats(a), /1\/8 sets · 1,350 lb/);
    await a.waitForSelector('#wk-resttime');
    assert.match(await a.textContent('#wk-resttime'), /^(3:00|2:5\d)$/, 'uses this exercise\'s 3 minute rest');
    await shot(a, '08-workout');
  });

  await step('workout: typed numbers win, and stats update while typing', async () => {
    const second = workoutRow(a, 'Barbell Bench Press', 1);
    await second.locator('[data-field="w"]').fill('145');
    assert.equal(await a.evaluate(() => document.activeElement.dataset.field), 'w', 'typing keeps the keyboard open');
    await second.locator('[data-done]').click();
    await a.waitForFunction(() => /2\/8 sets · 2,800 lb/.test(document.querySelector('#wk-stats').textContent));
  });

  await step('workout: a set needs its required value, and timed exercises record time', async () => {
    const plank = workoutRow(a, 'Forearm Plank', 0);
    await plank.locator('[data-done]').click();
    await a.waitForSelector('#toast.show:has-text("Enter seconds first")');
    assert.equal(await a.evaluate(() => document.activeElement.dataset.field), 'secs');
    assert.equal(await plank.locator('.wk-check.on').count(), 0);
    await plank.locator('[data-field="secs"]').fill('45');
    await plank.locator('[data-done]').click();
    await a.waitForFunction(() => /3\/8 sets · 2,800 lb/.test(document.querySelector('#wk-stats').textContent));
    await workoutRow(a, 'Forearm Plank', 0).locator('[data-done]').click(); // undo
    await a.waitForFunction(() => /2\/8 sets/.test(document.querySelector('#wk-stats').textContent));
    assert.equal(await workoutRow(a, 'Forearm Plank', 0).locator('[data-field="secs"]').inputValue(), '45', 'undo keeps the number');
    await workoutRow(a, 'Forearm Plank', 0).locator('[data-done]').click();
    await a.waitForFunction(() => /3\/8 sets/.test(document.querySelector('#wk-stats').textContent));
  });

  await step('workout: a warm-up is marked and leaves volume out; sets can be added and removed', async () => {
    await a.locator('.wk-ex', { hasText: 'Barbell Bench Press' }).locator('[data-addset]').click();
    await a.waitForFunction(() => /3\/9 sets/.test(document.querySelector('#wk-stats').textContent));
    const row = workoutRow(a, 'Barbell Bench Press', 2);
    assert.equal(await row.locator('[data-field="w"]').getAttribute('placeholder'), '145', 'a new set offers the last set\'s weight');
    await row.locator('select[data-type]').selectOption('warmup');
    await a.waitForFunction(() => [...document.querySelectorAll('.wk-type.marked')].some((x) => x.textContent.includes('W')));
    await workoutRow(a, 'Barbell Bench Press', 2).locator('[data-done]').click();
    await a.waitForFunction(() => /4\/9 sets · 2,800 lb/.test(document.querySelector('#wk-stats').textContent));
    await workoutRow(a, 'Barbell Bench Press', 2).locator('[data-rmset]').click();
    await a.waitForFunction(() => /3\/8 sets · 2,800 lb/.test(document.querySelector('#wk-stats').textContent));
  });

  await step('workout: exercises can be added, reordered and removed mid-workout', async () => {
    await a.click('#wk-add');
    await topSheet(a).locator('.lift-q').fill('lateral raise');
    await topSheet(a).locator('[data-pick="dumbbell-lateral-raise"]').click();
    await topSheet(a).locator('#pk-done').click();
    await a.waitForFunction(() => document.querySelectorAll('.wk-ex').length === 4);
    await a.locator('.wk-ex', { hasText: 'Dumbbell Lateral Raise' }).locator('[data-move="-1"]').click();
    const names = await a.locator('.wk-exname').allTextContents();
    assert.ok(names.indexOf('Dumbbell Lateral Raise') < names.indexOf('Landmine Press'), names.join());
    await a.locator('.wk-ex', { hasText: 'Dumbbell Lateral Raise' }).locator('[data-rmex]').click();
    await a.waitForFunction(() => document.querySelectorAll('.wk-ex').length === 3);
    assert.equal(a.dialogs.filter((d) => /Remove Dumbbell/.test(d)).length, 0, 'no warning when nothing was finished');
  });

  await step('rest timer: adjust, pause, skip, restart by hand, and it never blocks the screen', async () => {
    const left = async () => a.textContent('#wk-resttime');
    const before = await left();
    await a.click('[data-rest-add="15"]');
    assert.notEqual(await left(), before);
    await a.click('[data-rest-toggle]');
    await a.waitForSelector('[data-rest-toggle]:has-text("Resume")');
    const held = await left();
    await a.waitForTimeout(2100);
    assert.equal(await left(), held, 'paused means paused');
    await workoutRow(a, 'Barbell Bench Press', 0).locator('[data-field="reps"]').fill('10'); // still usable underneath
    await a.click('[data-rest-toggle]');
    await a.click('[data-rest-skip]');
    await a.waitForSelector('[data-rest-start="60"]');
    await a.click('[data-rest-start="30"]');
    await a.waitForSelector('#wk-resttime');
    await a.click('[data-rest-add="-15"]');
    await a.click('[data-rest-add="-15"]');
    await a.waitForSelector('#toast.show:has-text("Rest finished")', { timeout: 4000 });
    await a.waitForSelector('[data-rest-start="60"]');
  });

  await step('recovery: a reload right after typing loses nothing, on any screen', async () => {
    await a.click('[data-rest-start="120"]');
    await workoutRow(a, 'Landmine Press', 0).locator('[data-field="w"]').fill('55');
    await a.reload(); // no waiting: the auto-save delay hasn't passed
    await a.waitForSelector('body.in-app');
    assert.ok(await a.isVisible('.tab[data-tab="diary"].active'), 'the app opens on Diary as usual');
    await a.waitForSelector('#lift-mini:not([hidden])');
    assert.match(await a.textContent('#lift-mini'), /Push Day A.*Rest/s);
    await a.click('#lift-mini');
    await a.waitForSelector('.wk-ex');
    assert.equal(await workoutRow(a, 'Landmine Press', 0).locator('[data-field="w"]').inputValue(), '55');
    assert.equal(await a.locator('.wk-row.done').count(), 3);
    assert.equal(await a.locator('#wk-resttime').count(), 1, 'the rest timer kept running');
    await a.click('[data-rest-skip]');
  });

  await step('minimize: back button keeps it, other tabs work, and only one workout can run', async () => {
    await a.goBack();
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    await a.waitForSelector('#lift-mini:not([hidden])');
    await tab(a, 'foods');
    await tab(a, 'lift');
    await a.click('[data-pane="workout"]');
    await a.waitForSelector('[data-open]');
    await a.click('[data-start]:has-text("Push Day A")');
    await a.waitForSelector('.wk-ex');
    assert.equal(await a.locator('.wk-row.done').count(), 3, 'reopened the same workout');
    assert.equal(sessionDocs().length <= 1, true);
    await a.goBack();
    await a.waitForFunction(() => !document.querySelector('.sheet'));
  });

  await step('sync: a workout in progress reaches the other device', async () => {
    assert.equal(await synced(a), 0);
    assert.equal(sessionDocs().filter((s) => s.status === 'active').length, 1);
    await b.evaluate(() => window.__plate.Sync.run());
    await b.waitForSelector('#lift-mini:not([hidden])');
    assert.match(await b.textContent('#lift-mini'), /Push Day A/);
  });

  await step('pause: the clock stops, the work stays editable, and it survives a reload', async () => {
    await a.click('#lift-mini');
    await a.waitForSelector('#wk-pause');
    await a.click('#wk-pause');
    await a.waitForSelector('#wk-pause:has-text("Resume")');
    const held = await a.textContent('#wk-elapsed');
    await a.waitForTimeout(2100);
    assert.equal(await a.textContent('#wk-elapsed'), held);
    await a.waitForSelector('text=Paused. The clock has stopped');
    await a.reload();
    await a.waitForSelector('#lift-mini:has-text("Paused")');
    await a.click('#lift-mini');
    await a.click('#wk-pause');
    await a.waitForSelector('#wk-pause:has-text("Pause")');
    const t1 = await a.textContent('#wk-elapsed');
    await a.waitForFunction((x) => document.querySelector('#wk-elapsed').textContent !== x, t1, { timeout: 4000 });
  });

  await step('finish: warns about unfinished sets, keeps only finished ones, and double taps save once', async () => {
    await a.fill('#wk-note', 'Felt strong');
    await a.evaluate(() => { const f = document.querySelector('#wk-finish'); f.click(); f.click(); });
    await a.waitForSelector('text=Workout complete');
    assert.equal(await a.locator('.wk-sumex').count(), 2, 'Landmine had no finished sets');
    assert.equal(await a.locator('text=Workout complete').count(), 1);
    assert.match((await a.textContent('.wk-grid3')).replace(/\s+/g, ''), /3sets2,800lb/);
    assert.ok(a.dialogs.some((d) => /5 unfinished sets won't be saved/.test(d)));
    assert.equal(await a.locator('.wk-sumex li').count(), 3);
    assert.match(await a.locator('.wk-sumex', { hasText: 'Barbell Bench Press' }).textContent(), /135 lb × 10.*145 lb × 10/s);
    assert.match(await a.locator('.wk-sumex', { hasText: 'Forearm Plank' }).textContent(), /0:45/);
    await shot(a, '09-summary');
    await a.click('#sm-done');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    assert.equal(await a.locator('#lift-mini:not([hidden])').count(), 0);
    assert.equal(await synced(a), 0);
    const docs = sessionDocs();
    assert.equal(docs.length, 1, `one record, got ${docs.length}`);
    assert.equal(docs[0].status, 'completed');
    assert.equal(docs[0].note, 'Felt strong');
  });

  await step('finished workouts show in this week and recent, and leave the other device\'s bar', async () => {
    await tab(a, 'lift');
    await a.waitForSelector('[data-summary]:has-text("Push Day A")');
    const week = (await a.textContent('.nutgrid')).replace(/\s+/g, '');
    assert.match(week, /^1workouts/);
    assert.match(week, /3sets2,800lbvolume/);
    await a.click('[data-summary]');
    await topSheet(a).locator('text=Felt strong').waitFor();
    await a.goBack();
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    await b.evaluate(() => window.__plate.Sync.run());
    await b.waitForFunction(() => { const m = document.querySelector('#lift-mini'); return !m || m.hidden; });
  });

  await step('previous: the next workout shows last time, and one tap reuses it', async () => {
    await a.click('[data-start]:has-text("Push Day A")');
    await a.waitForSelector('.wk-ex');
    const one = workoutRow(a, 'Barbell Bench Press', 0), two = workoutRow(a, 'Barbell Bench Press', 1);
    assert.equal((await one.locator('[data-use-prev]').textContent()).trim(), '135 × 10');
    assert.equal((await two.locator('[data-use-prev]').textContent()).trim(), '145 × 10');
    assert.equal(await two.locator('[data-field="w"]').getAttribute('placeholder'), '135', 'the plan comes first');
    await two.locator('[data-use-prev]').click();
    await a.waitForFunction(() => [...document.querySelectorAll('.wk-ex [data-field="w"]')].some((x) => x.value === '145'));
    assert.equal(await workoutRow(a, 'Barbell Bench Press', 1).locator('.wk-check.on').count(), 0, 'reusing doesn\'t complete the set');
  });

  await step('discard: asks first, then it\'s gone everywhere and never counts', async () => {
    await workoutRow(a, 'Barbell Bench Press', 1).locator('[data-done]').click();
    await a.waitForSelector('.wk-row.done');
    await a.click('#wk-discard');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    assert.ok(a.dialogs.some((d) => /Discard this workout/.test(d)));
    assert.equal(await synced(a), 0);
    assert.deepEqual(sessionDocs().map((s) => s.status).sort(), ['completed', 'discarded']);
    assert.equal(Object.keys(sessionDocs().find((s) => s.status === 'discarded')).includes('exercises'), false, 'its data is really gone');
    await a.waitForFunction(() => document.querySelectorAll('[data-summary]').length === 1);
    assert.equal(await a.locator('#lift-mini:not([hidden])').count(), 0);
  });

  await step('empty workout: finishing with nothing done is refused; last time fills in sets', async () => {
    await a.click('#wk-empty');
    await a.waitForSelector('#wk-add');
    await a.click('#wk-finish');
    await a.waitForSelector('#toast.show:has-text("Complete at least one set")');
    await a.click('#wk-add');
    await topSheet(a).locator('.lift-q').fill('barbell bench');
    await topSheet(a).locator('[data-pick="barbell-bench-press"]').click();
    await topSheet(a).locator('#pk-done').click();
    await a.waitForSelector('.wk-ex');
    assert.equal(await a.locator('.wk-row:not(.wk-head)').count(), 2, 'as many sets as last time');
    assert.equal(await workoutRow(a, 'Barbell Bench Press', 1).locator('[data-field="w"]').getAttribute('placeholder'), '145');
    await workoutRow(a, 'Barbell Bench Press', 1).locator('[data-done]').click();
    await a.waitForSelector('.wk-row.done');
    assert.equal(await workoutRow(a, 'Barbell Bench Press', 1).locator('[data-field="w"]').inputValue(), '145');
    await a.click('#wk-finish');
    await a.waitForSelector('text=Workout complete');
    await a.click('#sm-del');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    await a.waitForFunction(() => document.querySelectorAll('[data-summary]').length === 1);
  });

  await step('history stays accurate after the routine changes', async () => {
    await a.click('[data-pane="routines"]');
    await a.click('[data-routine]:has-text("Push Day A")');
    await a.fill('#rt-name', 'Renamed Routine');
    await a.locator('.lift-item', { hasText: 'Barbell Bench Press' }).locator('[data-rmitem]').click();
    await a.click('#rt-done');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    await a.click('[data-pane="workout"]');
    await a.click('[data-summary]');
    await topSheet(a).locator('text=Barbell Bench Press').waitFor();
    assert.match(await topSheet(a).textContent(), /Push Day A/);
    await a.goBack();
    await a.waitForFunction(() => !document.querySelector('.sheet'));
  });

  await step('sign-out warns about a running workout, and it comes back after signing in', async () => {
    await a.click('#wk-empty');
    await a.waitForSelector('#wk-add');
    await a.goBack();
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    await tab(a, 'settings');
    await a.click('#a-out');
    await a.waitForFunction(() => document.body.classList.contains('in-app') && document.querySelector('.tab[data-tab="diary"].active'));
    assert.ok(a.dialogs.some((d) => /workout in progress/.test(d)));
    await a.waitForSelector('#lift-mini:not([hidden])', { timeout: 5000 });
    await a.click('#lift-mini');
    await a.click('#wk-discard');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    assert.equal(await synced(a), 0);
  });

  await step('small phones: the live workout fits at 320px', async () => {
    const small = await device(browser, base, { viewport: { width: 320, height: 568 } });
    await tab(small, 'lift');
    await small.click('#wk-empty');
    await small.click('#wk-add');
    await topSheet(small).locator('.lift-q').fill('barbell bench');
    await topSheet(small).locator('[data-pick="barbell-bench-press"]').click();
    await topSheet(small).locator('.lift-q').fill('plank');
    await topSheet(small).locator('[data-pick="plank"]').click();
    await topSheet(small).locator('#pk-done').click();
    await small.waitForSelector('.wk-ex');
    await workoutRow(small, 'Barbell Bench Press', 0).locator('[data-field="w"]').fill('137.5');
    await workoutRow(small, 'Barbell Bench Press', 0).locator('[data-field="reps"]').fill('10');
    await workoutRow(small, 'Barbell Bench Press', 0).locator('[data-done]').click();
    await small.waitForSelector('#wk-resttime');
    const over = await small.evaluate(() => { const s = document.querySelector('.sheet'); return s.scrollWidth - s.clientWidth; });
    assert.ok(over <= 0, `overflows by ${over}`);
    const size = await workoutRow(small, 'Barbell Bench Press', 0).locator('[data-done]').boundingBox();
    assert.ok(size.width >= 38 && size.height >= 40, 'the complete button is easy to hit');
    const clipped = await small.evaluate(() => [...document.querySelectorAll('.wk-in input')].filter((i) => i.scrollWidth > i.clientWidth).map((i) => i.value));
    assert.deepEqual(clipped, [], 'typed numbers are fully visible');
    const headers = await small.evaluate(() => [...document.querySelector('.wk-head').children].map((c) => c.scrollWidth <= c.clientWidth + 1));
    assert.ok(headers.every(Boolean), `column headings fit: ${headers}`);
    await shot(small, '10-small-workout');
    await small.click('#wk-discard');
    await small.waitForFunction(() => !document.querySelector('.sheet'));
    await small.context().close();
  });

  await step('dark mode: live workout renders', async () => {
    const dark = await device(browser, base, { colorScheme: 'dark' });
    await tab(dark, 'lift');
    await dark.click('#wk-empty');
    await dark.click('#wk-add');
    await topSheet(dark).locator('.lift-q').fill('barbell bench');
    await topSheet(dark).locator('[data-pick="barbell-bench-press"]').click();
    await topSheet(dark).locator('#pk-done').click();
    await workoutRow(dark, 'Barbell Bench Press', 0).locator('[data-done]').click();
    await shot(dark, '11-dark-workout');
    await dark.click('#wk-discard');
    await dark.waitForFunction(() => !document.querySelector('.sheet'));
    assert.deepEqual(dark.errors, []);
    await dark.context().close();
  });

  /* ---------------- Workout of the day ---------------- */
  const wodBox = { self: {} };
  require('node:vm').runInNewContext(fs.readFileSync(path.join(ROOT, 'wods.js'), 'utf8'), wodBox);
  const WODS = wodBox.self.PLATE_WODS;
  const LC = require(path.join(ROOT, 'lift-core.js'));
  const dayNow = await a.evaluate(() => window.__plate.C.ymd(new Date()));
  /* Today may be a rest day. Then the checks that need a workout card use the next day's workout. */
  const today = LC.wodDay(WODS, dayNow);
  const cardWod = today.wod || LC.nextWodDay(WODS, dayNow).wod;
  const version = (w, level) => LC.wodVersion(w, level);
  const wodResultDocs = () => sessionDocs().filter((s) => s.status === 'completed' && s.wod);
  /* Skips the 10 second "get ready" and any part of the clock, without waiting for real minutes. */
  const shiftClock = (page, ms) => page.evaluate(async (delta) => {
    const { DB } = window.__plate;
    for (const k of await DB.keys()) {
      if (typeof k !== 'string' || !k.startsWith('wo:s:')) continue;
      const s = await DB.get(k);
      if (s && (s.status === 'active' || s.status === 'paused')) { s.startedAt -= delta; s.updatedAt = Date.now(); await DB.set(k, s); }
    }
  }, ms);
  const openWodPane = async (page) => { await tab(page, 'lift'); await page.click('[data-pane="wod"]'); await page.waitForSelector('.wod-today'); };
  const closeAll = async (page) => { while (await page.locator('.sheet').count()) { await page.goBack(); await page.waitForTimeout(150); } };
  /* The card for cardWod: on the pane itself, or in its detail sheet on a rest day. */
  const openCard = async (page) => {
    await openWodPane(page);
    if (today.wod) return page.locator('.wod-today');
    await page.click('.wod-rest [data-wod]');
    await topSheet(page).locator('[data-level]').first().waitFor();
    return topSheet(page);
  };
  const startFromList = async (page, w) => { await page.click(`#wod-list [data-wod="${w.id}"]`); await topSheet(page).locator('[data-wod-start]').click(); await page.waitForSelector('#wod-time'); };

  await step('WOD: today shows a workout, or a rest day with what is next, starting at Beginner', async () => {
    await openWodPane(a);
    if (today.rest) {
      assert.equal((await a.textContent('.wod-name')).trim(), 'Rest day');
      assert.match(await a.textContent('.wod-rest [data-wod]'), new RegExp(`${cardWod.name}[\\s\\S]*Tomorrow`));
    } else assert.equal((await a.textContent('.wod-name')).trim(), today.wod.name);
    const card = await openCard(a);
    assert.equal(await card.locator('[data-level="beginner"]').getAttribute('aria-pressed'), 'true');
    assert.equal((await card.locator('.wod-scheme').last().textContent()).trim(), LC.wodText(version(cardWod, 'beginner').scheme, 'lb'));
    assert.ok(await card.locator('.wod-warmup').count(), 'has a warm-up');
    await shot(a, '12-wod');
    await closeAll(a);
  });

  await step('WOD: each level changes the workout, and the choice is saved and synced', async () => {
    let card = await openCard(a);
    await card.locator('[data-level="advanced"]').click();
    const adv = version(cardWod, 'advanced');
    await a.waitForFunction((x) => [...document.querySelectorAll('.wod-scheme')].some((n) => n.textContent.trim() === x), LC.wodText(adv.scheme, 'lb'));
    assert.equal(await card.locator('.wod-moves').last().locator('li').count(), adv.moves.length);
    await a.waitForTimeout(300); // let the save land, as any real tap would
    await a.reload();
    await a.waitForSelector('body.in-app');
    card = await openCard(a);
    assert.equal(await card.locator('[data-level="advanced"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await synced(a), 0);
    await b.evaluate(() => window.__plate.Sync.run());
    const cardB = await openCard(b);
    await cardB.locator('[data-level="advanced"][aria-pressed="true"]').waitFor();
    await closeAll(b);
    await card.locator('[data-level="beginner"]').click();
    await card.locator('[data-level="beginner"][aria-pressed="true"]').waitFor();
    await closeAll(a);
  });

  await step('WOD: a movement opens its how-to, and every WOD can be browsed and filtered', async () => {
    const card = await openCard(a);
    await card.locator('.wod-move').first().click();
    await topSheet(a).locator('text=How to do it').waitFor();
    await closeAll(a);
    assert.equal(await a.locator('#wod-list [data-wod]').count(), WODS.length);
    assert.equal(await a.locator('#wod-list [data-wod]:has-text("Original set")').count(), WODS.filter((w) => w.retired).length);
    await a.selectOption('#wf-format', 'emom');
    assert.equal(await a.locator('#wod-list [data-wod]').count(), WODS.filter((w) => w.format === 'emom').length);
    await a.selectOption('#wf-gear', 'none');
    assert.equal(await a.locator('#wod-list [data-wod]').count(), WODS.filter((w) => w.format === 'emom' && w.equipment.includes('none')).length);
    await a.selectOption('#wf-format', '');
    await a.selectOption('#wf-gear', '');
  });

  await step('WOD swaps: a movement you can\'t do yet lists easier options, each with its how-to', async () => {
    const withPull = WODS.find((w) => !w.retired && version(w, 'beginner').moves.concat(version(w, 'intermediate').moves).some(([, ex]) => ex === 'pull-up'));
    await a.click(`#wod-list [data-wod="${withPull.id}"]`);
    await topSheet(a).locator('[data-level="intermediate"]').click();
    await topSheet(a).locator('[data-swap="pull-up"]').click();
    await topSheet(a).locator('text=Instead of Pull-Up').waitFor();
    const names = await topSheet(a).locator('[data-alt] .name').allTextContents();
    assert.ok(names.includes('Jumping Pull-Up') && names.includes('Inverted Row'), names.join(', '));
    await a.waitForTimeout(400);
    await shot(a, '17-wod-swaps');
    await topSheet(a).locator('[data-alt]:has-text("Jumping Pull-Up")').click();
    await topSheet(a).locator('text=How to do it').waitFor();
    await closeAll(a);
    /* The same swaps show on the exercise itself, outside of WODs. */
    await a.click('[data-pane="exercises"]');
    await a.fill('.lift-q', 'pull-up');
    await a.locator('[data-ex="pull-up"]').click();
    await topSheet(a).locator('text=Can\'t do it yet? Try').waitFor();
    await closeAll(a);
    await a.fill('.lift-q', '');
    await openWodPane(a);
    const card = await openCard(a);
    await card.locator('[data-level="beginner"]').click();
    await closeAll(a);
  });

  const amrap = WODS.find((w) => !w.retired && w.format === 'amrap' && LC.wodScoreType(w) === 'rounds');
  await step('WOD timer: gets ready, counts rounds, survives a reload, and only one can run', async () => {
    await startFromList(a, amrap);
    assert.match(await a.textContent('#wod-label'), /Get ready/);
    assert.equal(await a.isDisabled('#wod-pause'), true, 'no pausing before it starts');
    await a.click('#wod-more');
    await a.click('#wod-more');
    await a.click('#wod-more');
    await a.click('#wod-less');
    assert.equal((await a.textContent('#wod-rounds')).trim(), '2');
    await shiftClock(a, 11000);
    await a.reload();
    await a.waitForSelector('#lift-mini:not([hidden])');
    assert.match(await a.textContent('#lift-mini'), new RegExp(amrap.name));
    await a.click('#lift-mini');
    await a.waitForSelector('#wod-time');
    assert.match(await a.textContent('#wod-label'), /Time left/);
    assert.equal((await a.textContent('#wod-rounds')).trim(), '2');
    await shot(a, '13-wod-timer');
    await a.click('#wod-pause');
    await a.waitForSelector('#wod-label:has-text("Paused")');
    const held = await a.textContent('#wod-time');
    await a.waitForTimeout(2100);
    assert.equal(await a.textContent('#wod-time'), held);
    await a.click('#wod-pause');
    await a.goBack();
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    await openWodPane(a);
    await a.click(`#wod-list [data-wod="${amrap.id}"]`);
    await topSheet(a).locator('[data-wod-start]').click();
    await a.waitForSelector('#toast.show:has-text("Finish or discard")');
    await a.waitForSelector('#wod-rounds');
    assert.equal((await a.textContent('#wod-rounds')).trim(), '2', 'reopened the running WOD');
  });

  await step('WOD result: rounds carry over, double taps save once, and it lands in history', async () => {
    await a.click('#wod-finish');
    assert.equal(await topSheet(a).locator('#wr-rounds').inputValue(), '2');
    await topSheet(a).locator('#wr-reps').fill('7');
    await topSheet(a).locator('#wr-note').fill('Scaled the swings');
    await a.evaluate(() => { const b = document.querySelector('#wr-save'); b.click(); b.click(); });
    await a.waitForSelector('text=WOD complete');
    assert.match((await a.textContent('.wk-grid3')).replace(/\s+/g, ' '), /2 rounds \+ 7 reps/);
    assert.equal(await a.locator('.wod-best').count(), 0, 'a first result is not called a new best');
    await shot(a, '14-wod-summary');
    await a.click('#sm-done');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    assert.equal(await synced(a), 0);
    assert.equal(wodResultDocs().length, 1);
    assert.deepEqual(wodResultDocs()[0].wod.score, { rounds: 2, reps: 7 });
    assert.equal(wodResultDocs()[0].note, 'Scaled the swings');
    await a.click('[data-pane="workout"]');
    await a.waitForSelector(`[data-summary]:has-text("${amrap.name}")`);
    assert.match(await a.locator(`[data-summary]:has-text("${amrap.name}")`).textContent(), /WOD · Beginner · 2 rounds \+ 7 reps/);
    await a.locator(`[data-summary]:has-text("${amrap.name}")`).click();
    await topSheet(a).locator('text=Scaled the swings').waitFor();
    await a.goBack();
    await a.waitForFunction(() => !document.querySelector('.sheet'));
  });

  await step('WOD result: a better score is called out, but only against the same level', async () => {
    const logIt = async (rounds) => {
      await openWodPane(a);
      await a.click(`#wod-list [data-wod="${amrap.id}"]`);
      await topSheet(a).locator('[data-wod-log]').click();
      await topSheet(a).locator('#wr-rounds').fill(String(rounds));
      await topSheet(a).locator('#wr-save').click();
      await a.waitForSelector('text=WOD complete');
    };
    await logIt(5);
    assert.equal(await a.locator('.wod-best').count(), 1);
    await a.click('#sm-done');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    await logIt(1);
    assert.equal(await a.locator('.wod-best').count(), 0, 'a lower score is not a best');
    await a.click('#sm-done');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    await a.click(`#wod-list [data-wod="${amrap.id}"]`);
    await topSheet(a).locator('[data-level="advanced"]').click();
    await topSheet(a).locator('[data-level="advanced"][aria-pressed="true"]').waitFor();
    await closeAll(a);
    await logIt(1);
    assert.equal(await a.locator('.wod-best').count(), 0, 'no best on a level\'s first result, whatever the other levels scored');
    await a.click('#sm-done');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    await openWodPane(a);
    await a.click(`#wod-list [data-wod="${amrap.id}"]`);
    await topSheet(a).locator('[data-level="beginner"]').click();
    await topSheet(a).locator('text=Best:').waitFor();
    assert.match(await topSheet(a).locator('.wod-results').textContent(), /Best: 5 rounds/);
    await closeAll(a);
  });

  await step('WOD timer: time running out sounds once and asks for a result', async () => {
    const emom = WODS.find((w) => !w.retired && w.format === 'emom' && !w.every);
    const mins = version(emom, 'beginner').minutes;
    await startFromList(a, emom);
    await a.goBack();
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    await shiftClock(a, 10000 + mins * 60000 - 1500);
    await a.reload();
    await a.waitForSelector('#lift-mini:not([hidden])');
    await a.click('#lift-mini');
    await a.waitForSelector('#wr-done', { timeout: 6000 });
    assert.equal(await a.inputValue('#wr-done'), String(mins));
    await a.fill('#wr-done', '99');
    await a.click('#wr-save');
    await a.waitForSelector(`#toast.show:has-text("Enter a number from 1 to ${mins}")`);
    await a.fill('#wr-done', '3');
    await a.click('#wr-save');
    await a.waitForSelector('text=WOD complete');
    assert.equal(await a.locator('.sheet').count(), 1, 'timer and form both closed');
    await a.click('#sm-done');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    assert.equal(await a.locator('#lift-mini:not([hidden])').count(), 0);
  });

  await step('WOD timer: Tabata switches between work and rest, and scores total reps', async () => {
    await openWodPane(a);
    const tab8 = WODS.find((w) => !w.retired && w.format === 'tabata');
    await startFromList(a, tab8);
    await a.goBack();
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    await shiftClock(a, 10000 + 25000);
    await a.reload();
    await a.waitForSelector('#lift-mini:not([hidden])');
    await a.click('#lift-mini');
    await a.waitForSelector('#wod-label:has-text("Rest · round 1 of 16")');
    await shot(a, '18-wod-tabata');
    await shiftClock(a, 6000);
    await a.waitForSelector('#wod-label:has-text("Work · round 2 of 16")');
    await a.click('#wod-finish');
    await topSheet(a).locator('#wr-reps').fill('150');
    await topSheet(a).locator('#wr-save').click();
    await a.waitForSelector('text=WOD complete');
    assert.match((await a.textContent('.wk-grid3')).replace(/\s+/g, ' '), /150 reps/);
    await a.click('#sm-done');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
  });

  await step('WOD for load: the heaviest lift is the score, shown in your unit', async () => {
    const heavy = WODS.find((w) => !w.retired && w.format === 'for_load');
    await openWodPane(a);
    await a.click(`#wod-list [data-wod="${heavy.id}"]`);
    await topSheet(a).locator('[data-wod-log]').click();
    await topSheet(a).locator('#wr-load').fill('225');
    await topSheet(a).locator('#wr-save').click();
    await a.waitForSelector('text=WOD complete');
    assert.match((await a.textContent('.wk-grid3')).replace(/\s+/g, ' '), /225 lb/);
    await a.click('#sm-done');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    assert.equal(await synced(a), 0);
    assert.deepEqual(wodResultDocs().find((s) => s.wod.id === heavy.id).wod.score, { w: 225, unit: 'lb' });
  });

  await step('WOD timer: a for-time workout stops when you say, and discard leaves no result', async () => {
    const ft = WODS.find((w) => !w.retired && w.format === 'for_time');
    assert.equal(await synced(a), 0);
    const before = wodResultDocs().length;
    await openWodPane(a);
    await startFromList(a, ft);
    await a.click('#wod-discard');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    assert.equal(await a.locator('#lift-mini:not([hidden])').count(), 0);
    await startFromList(a, ft);
    await a.goBack();
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    await shiftClock(a, 10000 + 125000);
    await a.reload();
    await a.waitForSelector('#lift-mini:not([hidden])');
    await a.click('#lift-mini');
    await a.waitForSelector('#wod-finish:has-text("Done")');
    await a.click('#wod-finish');
    assert.equal(await a.inputValue('#wr-mins'), '2');
    await a.fill('#wr-mins', '4');
    await a.fill('#wr-secs', '30');
    await a.click('#wr-save');
    await a.waitForSelector('text=WOD complete');
    assert.match((await a.textContent('.wk-grid3')).replace(/\s+/g, ' '), /4:30.*4:30/, 'score and time agree');
    await a.click('#sm-done');
    await a.waitForFunction(() => !document.querySelector('.sheet'));
    assert.equal(await synced(a), 0);
    assert.equal(wodResultDocs().length, before + 1);
    assert.deepEqual(a.errors, []);
  });

  await step('WOD: fits at 320px and works in dark mode', async () => {
    const small = await device(browser, base, { viewport: { width: 320, height: 568 } });
    const card = await openCard(small);
    assert.ok((await overflow(small)) <= 0);
    const cut = await small.evaluate(() => [...document.querySelectorAll('.wod-levels, .lift-panes')].map((s) => s.scrollWidth - s.clientWidth));
    assert.ok(cut.every((n) => n <= 0), `levels and tabs all visible without scrolling: ${cut}`);
    const sheetOver = await small.evaluate(() => { const s = document.querySelector('.sheet'); return s ? s.scrollWidth - s.clientWidth : 0; });
    assert.ok(sheetOver <= 0, `card overflows by ${sheetOver}`);
    await card.locator('.wod-warmup summary').click();
    await shot(small, '15-wod-small');
    await closeAll(small);
    await startFromList(small, amrap);
    const over = await small.evaluate(() => { const s = document.querySelector('.sheet'); return s.scrollWidth - s.clientWidth; });
    assert.ok(over <= 0, `overflows by ${over}`);
    await small.click('#wod-discard');
    await small.waitForFunction(() => !document.querySelector('.sheet'));
    assert.equal(await synced(small), 0);
    await small.context().close();
    const dark = await device(browser, base, { colorScheme: 'dark' });
    await openCard(dark);
    await shot(dark, '16-wod-dark');
    assert.deepEqual(dark.errors, []);
    await dark.context().close();
  });

  await step('offline: the installed app opens, and logs a workout that syncs later', async () => {
    const off = await device(browser, base, { sw: true });
    await off.evaluate(() => navigator.serviceWorker.ready);
    await off.reload();
    await off.waitForFunction(() => navigator.serviceWorker.controller);
    await off.waitForSelector('body.in-app');
    await off.waitForTimeout(500);
    await off.context().setOffline(true);
    await off.reload();
    await off.waitForSelector('body.in-app');
    await tab(off, 'lift');
    await off.click('[data-pane="exercises"]');
    assert.match(await off.textContent('.lift-count'), /^174 /);
    await off.click('[data-pane="workout"]');
    await off.click('#wk-empty');
    await off.click('#wk-add');
    await topSheet(off).locator('.lift-q').fill('plank');
    await topSheet(off).locator('[data-pick="plank"]').click();
    await topSheet(off).locator('#pk-done').click();
    await workoutRow(off, 'Forearm Plank', 0).locator('[data-field="secs"]').fill('60');
    await workoutRow(off, 'Forearm Plank', 0).locator('[data-done]').click();
    await off.waitForSelector('.wk-row.done');
    await off.reload();
    await off.waitForSelector('#lift-mini:not([hidden])');
    await off.context().setOffline(false);
    await off.click('#lift-mini');
    await off.waitForSelector('.wk-row.done');
    await off.click('#wk-discard');
    await off.waitForFunction(() => !document.querySelector('.sheet'));
    await off.context().close();
  });

  await step('weak signal: the installed app still opens promptly', async () => {
    const slow = await device(browser, base, { sw: true });
    await slow.evaluate(() => navigator.serviceWorker.ready);
    await slow.reload();
    await slow.waitForFunction(() => navigator.serviceWorker.controller);
    await slow.waitForSelector('body.in-app');
    await slow.waitForTimeout(500);
    serverDelayMs = 30000;
    try {
      const t0 = Date.now();
      await slow.reload({ waitUntil: 'commit', timeout: 15000 });
      await slow.waitForSelector('body.in-app', { timeout: 15000 });
      const took = Date.now() - t0;
      assert.ok(took < 10000, `took ${took} ms with a 30 second network`);
    } finally { serverDelayMs = 0; }
    await slow.context().close();
  });

  await step('weak signal: a stuck sign-in check still opens the phone\'s data', async () => {
    const stuck = await device(browser, base);
    await stuck.evaluate(() => localStorage.setItem('hang', '1'));
    const t0 = Date.now();
    await stuck.reload();
    await stuck.waitForSelector('body.in-app', { timeout: 8000 });
    assert.ok(Date.now() - t0 < 7000);
    await stuck.evaluate(() => localStorage.removeItem('hang'));
    await stuck.context().close();
  });

  await step('small phones: no sideways scrolling, and all 7 tabs fit', async () => {
    const small = await device(browser, base, { viewport: { width: 320, height: 568 } });
    for (const t of ['diary', 'foods', 'lift', 'friends', 'report', 'settings']) { await tab(small, t); assert.ok((await overflow(small)) <= 0, t); }
    await tab(small, 'lift');
    await small.click('[data-pane="routines"]');
    const box = await small.evaluate(() => [...document.querySelectorAll('.tab')].map((t) => { const r = t.getBoundingClientRect(); return [r.left, r.right]; }));
    assert.equal(box.length, 7);
    box.forEach(([l, r]) => assert.ok(l >= 0 && r <= 320));
    const labels = await small.evaluate(() => [...document.querySelectorAll('.tab span')].map((s) => s.scrollWidth <= s.parentElement.clientWidth));
    assert.ok(labels.every(Boolean), 'tab labels fit');
    await shot(small, '05-small');
    await small.click('[data-routine]:has-text("Renamed Routine")');
    await small.waitForSelector('.lift-item');
    const sheetOverflow = await small.evaluate(() => { const s = document.querySelector('.sheet'); return s.scrollWidth - s.clientWidth; });
    assert.ok(sheetOverflow <= 0, `editor overflows by ${sheetOverflow}`);
    await shot(small, '06-small-editor');
    assert.deepEqual(small.errors, []);
    await small.context().close();
  });

  await step('dark mode renders', async () => {
    const dark = await device(browser, base, { colorScheme: 'dark' });
    await tab(dark, 'lift');
    await dark.click('[data-pane="exercises"]');
    await dark.fill('.lift-q', 'deadlift');
    await dark.click('[data-ex="conventional-deadlift"]');
    await topSheet(dark).locator('text=How to do it').waitFor();
    await shot(dark, '07-dark-detail');
    await dark.context().close();
  });

  await step('erase removes lifting data everywhere', async () => {
    await tab(a, 'settings');
    await a.click('#wipe');
    await a.waitForSelector('#toast.show:has-text("Erased")');
    await tab(a, 'lift');
    await a.click('[data-pane="workout"]');
    await a.waitForSelector('#wk-empty');
    assert.equal(await a.locator('[data-summary]').count(), 0, 'workouts are gone');
    await a.click('[data-pane="routines"]');
    await a.waitForSelector('text=+ New routine');
    assert.equal(await a.locator('[data-routine]').count(), 0);
    assert.equal(cloud.size, 0);
  });

  await step('no page errors, and the live backend was never contacted', async () => {
    assert.deepEqual(a.errors, []);
    assert.deepEqual(b.errors, []);
    assert.ok(!a.context().__leaked && !b.context().__leaked);
  });

  await browser.close();
  server.close();
  console.log(`\n${results.length} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
