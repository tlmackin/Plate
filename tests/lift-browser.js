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
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

/* The fake account: one set of rows that any number of "devices" share. */
const cloud = new Map();
let clock = Date.parse('2026-01-01T00:00:00Z');
const remotePush = (rows) => { rows.forEach((r) => { clock += 1000; cloud.set(r.key, { ...r, server_at: new Date(clock).toISOString() }); }); };
const remotePull = (since) => [...cloud.values()].filter((r) => !since || Date.parse(r.server_at) > Date.parse(since));
const FAKE = () => {
  window.__PLATE_FAKE_REMOTE = {
    getUser: async () => ({ id: 'user-1', email: 'test@example.com' }), onAuth() {},
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
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 780 }, colorScheme: opts.colorScheme || 'light', reducedMotion: 'reduce', serviceWorkers: 'block', hasTouch: true });
  await ctx.route(/supabase\.co|openfoodfacts|nal\.usda/, (r) => { ctx.__leaked = true; r.abort(); });
  await ctx.exposeFunction('__remotePush', remotePush);
  await ctx.exposeFunction('__remotePull', remotePull);
  await ctx.exposeFunction('__remoteWipe', () => cloud.clear());
  await ctx.addInitScript(FAKE);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
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

  await step('Lift tab opens on routines with templates', async () => {
    await tab(a, 'lift');
    await a.waitForSelector('text=+ New routine');
    assert.equal(await a.locator('[data-template]').count(), 9);
    await shot(a, '01-routines');
  });

  await step('library: lists 148, search ignores hyphens, filters combine', async () => {
    await a.click('[data-pane="exercises"]');
    await a.waitForSelector('.lift-count');
    assert.match(await a.textContent('.lift-count'), /^148 /);
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
    await a.waitForSelector('[data-routine]:has-text("Push Day A")');
  });

  let b;
  await step('sync: routine, custom exercise and favorite reach a second device', async () => {
    assert.equal(await synced(a), 0);
    b = await device(browser, base);
    await tab(b, 'lift');
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

  await step('small phones: no sideways scrolling, and all 7 tabs fit', async () => {
    const small = await device(browser, base, { viewport: { width: 320, height: 568 } });
    for (const t of ['diary', 'foods', 'lift', 'friends', 'report', 'settings']) { await tab(small, t); assert.ok((await overflow(small)) <= 0, t); }
    await tab(small, 'lift');
    const box = await small.evaluate(() => [...document.querySelectorAll('.tab')].map((t) => { const r = t.getBoundingClientRect(); return [r.left, r.right]; }));
    assert.equal(box.length, 7);
    box.forEach(([l, r]) => assert.ok(l >= 0 && r <= 320));
    const labels = await small.evaluate(() => [...document.querySelectorAll('.tab span')].map((s) => s.scrollWidth <= s.parentElement.clientWidth));
    assert.ok(labels.every(Boolean), 'tab labels fit');
    await shot(small, '05-small');
    await small.click('[data-routine]:has-text("Push Day A")');
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
