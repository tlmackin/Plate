/* Plate — core logic (pure functions, no DOM). Shared by the app and the tests. */
(function (root) {
  'use strict';

  const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
  const num = (v) => {
    const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const kcalFromMacros = (p, c, f) => 4 * (p || 0) + 4 * (c || 0) + 9 * (f || 0);

  /* ---------- Food model ----------
     food = {
       key, source: 'off'|'usda'|'custom', name, brand, barcode,
       nut:   { kcal, p, c, f }   nutrients per ONE base unit
       units: [{ label, factor }] factor = how many base units this choice is
       defUnit: index of the default unit
     }
     For OFF/USDA the base unit is 1 gram; for custom foods without grams it is 1 serving.
  */

  function gramUnits(extra) {
    const units = [];
    (extra || []).forEach((u) => {
      if (u && u.factor > 0 && !units.some((x) => x.label === u.label)) units.push(u);
    });
    units.push({ label: '100 g', factor: 100 }, { label: 'g', factor: 1 }, { label: 'oz', factor: 28.3495 });
    return units;
  }

  /* Open Food Facts product -> food (or null if no usable nutrition) */
  function fromOFF(p) {
    if (!p) return null;
    const n = p.nutriments || {};
    const name = (p.product_name || p.product_name_en || p.generic_name || '').trim();
    const brand = String(p.brands || '').split(',')[0].trim();
    const code = String(p.code || p._id || '');
    const servG = num(p.serving_quantity);
    const servLabel = (p.serving_size || '').trim();

    let kcal100 = num(n['energy-kcal_100g']);
    if (kcal100 == null && num(n['energy_100g']) != null) kcal100 = num(n['energy_100g']) / 4.184; // kJ
    const p100 = num(n.proteins_100g), c100 = num(n.carbohydrates_100g), f100 = num(n.fat_100g);
    const has100 = [kcal100, p100, c100, f100].some((v) => v != null);

    if (has100) {
      const pp = p100 || 0, cc = c100 || 0, ff = f100 || 0;
      const kk = kcal100 != null ? kcal100 : kcalFromMacros(pp, cc, ff);
      const extra = [];
      if (servG && servG > 0) extra.push({ label: `serving${servLabel ? ' (' + servLabel + ')' : ` (${r1(servG)} g)`}`, factor: servG });
      return {
        key: 'off:' + code, source: 'off', name: name || 'Unnamed product', brand, barcode: code,
        nut: { kcal: kk / 100, p: pp / 100, c: cc / 100, f: ff / 100 },
        units: gramUnits(extra), defUnit: 0,
      };
    }

    // Only per-serving values available
    let ks = num(n['energy-kcal_serving']);
    if (ks == null && num(n['energy_serving']) != null) ks = num(n['energy_serving']) / 4.184;
    const ps = num(n.proteins_serving), cs = num(n.carbohydrates_serving), fs = num(n.fat_serving);
    if ([ks, ps, cs, fs].some((v) => v != null)) {
      const pp = ps || 0, cc = cs || 0, ff = fs || 0;
      return {
        key: 'off:' + code, source: 'off', name: name || 'Unnamed product', brand, barcode: code,
        nut: { kcal: ks != null ? ks : kcalFromMacros(pp, cc, ff), p: pp, c: cc, f: ff },
        units: [{ label: servLabel ? `serving (${servLabel})` : 'serving', factor: 1 }], defUnit: 0,
      };
    }
    return null;
  }

  /* USDA FoodData Central search hit -> food */
  const USDA_IDS = {
    kcal: [1008, 2047, 2048], kcalNum: ['208', '957', '958'],
    p: [1003], pNum: ['203'], c: [1005], cNum: ['205'], f: [1004], fNum: ['204'],
  };
  function usdaVal(list, ids, nums, wantKcal) {
    for (const x of list) {
      const id = Number(x.nutrientId != null ? x.nutrientId : x.nutrient && x.nutrient.id);
      const nb = String(x.nutrientNumber != null ? x.nutrientNumber : (x.nutrient && x.nutrient.number) || '');
      const unit = String(x.unitName || (x.nutrient && x.nutrient.unitName) || '').toUpperCase();
      if (ids.includes(id) || nums.includes(nb)) {
        if (wantKcal && unit === 'KJ') continue;
        const v = num(x.value != null ? x.value : x.amount);
        if (v != null) return v;
      }
    }
    return null;
  }
  function fromUSDA(h) {
    if (!h) return null;
    const list = h.foodNutrients || [];
    const p = usdaVal(list, USDA_IDS.p, USDA_IDS.pNum) || 0;
    const c = usdaVal(list, USDA_IDS.c, USDA_IDS.cNum) || 0;
    const f = usdaVal(list, USDA_IDS.f, USDA_IDS.fNum) || 0;
    let k = usdaVal(list, USDA_IDS.kcal, USDA_IDS.kcalNum, true);
    if (k == null) k = kcalFromMacros(p, c, f);
    const extra = [];
    (h.foodMeasures || [])
      .filter((m) => num(m.gramWeight) > 0)
      .sort((a, b) => (a.rank || 99) - (b.rank || 99))
      .slice(0, 6)
      .forEach((m) => {
        const t = String(m.disseminationText || m.modifier || '').trim();
        if (t && !/quantity not specified/i.test(t)) extra.push({ label: `${t} (${r1(m.gramWeight)} g)`, factor: num(m.gramWeight) });
      });
    const ss = num(h.servingSize), su = String(h.servingSizeUnit || '').toLowerCase();
    if (ss && (su === 'g' || su === 'ml' || su === 'grm' || su === 'mlt')) {
      const hh = (h.householdServingFullText || '').trim();
      extra.unshift({ label: `serving${hh ? ' (' + hh + ')' : ''} (${r1(ss)} ${su.startsWith('m') ? 'ml' : 'g'})`, factor: ss });
    }
    return {
      key: 'usda:' + h.fdcId, source: 'usda', name: titleCase(h.description || 'Food'),
      brand: h.brandOwner || h.brandName || '', barcode: h.gtinUpc || '',
      nut: { kcal: k / 100, p: p / 100, c: c / 100, f: f / 100 },
      units: gramUnits(extra), defUnit: 0,
    };
  }
  function titleCase(s) {
    s = String(s);
    if (s !== s.toUpperCase()) return s;
    return s.toLowerCase().replace(/(^|[\s,(\/-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  }

  /* Manual entry -> food. form = {name, brand, barcode, servingLabel, servingGrams, kcal, p, c, f} (per serving) */
  function fromManual(form, existingKey) {
    const kcal = num(form.kcal), p = num(form.p) || 0, c = num(form.c) || 0, f = num(form.f) || 0;
    const k = kcal != null ? kcal : kcalFromMacros(p, c, f);
    const label = (form.servingLabel || '').trim() || 'serving';
    const g = num(form.servingGrams);
    const key = existingKey || 'custom:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const base = {
      key, source: 'custom', name: String(form.name || '').trim() || 'My food', brand: String(form.brand || '').trim(),
      barcode: String(form.barcode || '').replace(/\D/g, ''),
      form: { servingLabel: label, servingGrams: g || '', kcal: r1(k), p, c, f },
    };
    if (g && g > 0) {
      return Object.assign(base, {
        nut: { kcal: k / g, p: p / g, c: c / g, f: f / g },
        units: [{ label: `${label} (${r1(g)} g)`, factor: g }, { label: 'g', factor: 1 }, { label: 'oz', factor: 28.3495 }],
        defUnit: 0,
      });
    }
    return Object.assign(base, { nut: { kcal: k, p, c, f }, units: [{ label, factor: 1 }], defUnit: 0 });
  }

  /* ---------- Entries & totals ---------- */
  function entryNut(e) {
    const u = (e.food.units && e.food.units[e.unit]) || { factor: 1 };
    const m = u.factor * (num(e.qty) || 0);
    const n = e.food.nut;
    return { kcal: n.kcal * m, p: n.p * m, c: n.c * m, f: n.f * m };
  }
  function sumEntries(entries) {
    return (entries || []).reduce((t, e) => {
      const n = entryNut(e);
      t.kcal += n.kcal; t.p += n.p; t.c += n.c; t.f += n.f; return t;
    }, { kcal: 0, p: 0, c: 0, f: 0 });
  }
  function amountLabel(e) {
    const u = e.food.units[e.unit] || { label: '' };
    const q = r1(e.qty);
    if (u.label === 'g' || u.label === 'oz') return `${q} ${u.label}`;
    if (u.label === '100 g') return `${r1(q * 100)} g`;
    return `${q} × ${u.label}`;
  }

  /* ---------- Dates (local time, YYYY-MM-DD) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const weekStart = (s) => { const d = parseYmd(s); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return ymd(d); }; // Monday
  const weekDays = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

  /* ---------- Barcodes ---------- */
  function barcodeVariants(code) {
    const c = String(code || '').replace(/\D/g, '');
    const out = [c];
    if (c.length === 12) out.push('0' + c);           // UPC-A -> EAN-13
    if (c.length === 13 && c[0] === '0') out.push(c.slice(1));
    if (c.length === 8) out.push(c.padStart(13, '0'));
    return [...new Set(out.filter(Boolean))];
  }

  /* ---------- Report ---------- */
  const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
  function weekReport(days, getDay, targets) {
    const rows = days.map((date) => {
      const entries = getDay(date) || [];
      return { date, entries, tot: sumEntries(entries) };
    });
    const logged = rows.filter((r) => r.entries.length);
    const avg = { kcal: 0, p: 0, c: 0, f: 0 };
    logged.forEach((r) => { for (const k in avg) avg[k] += r.tot[k] / logged.length; });
    return { rows, avg, daysLogged: logged.length, targets };
  }
  function csvEscape(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function reportCSV(rep, who) {
    const L = [];
    L.push(['Food log' + (who ? ' — ' + who : ''), `${rep.rows[0].date} to ${rep.rows[rep.rows.length - 1].date}`].map(csvEscape).join(','));
    const t = rep.targets || {};
    L.push(['Daily targets', `${t.kcal || ''} kcal`, `P ${t.p || ''} g`, `C ${t.c || ''} g`, `F ${t.f || ''} g`].map(csvEscape).join(','));
    L.push('');
    L.push('DAILY TOTALS');
    L.push(['Date', 'Day', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Items logged'].join(','));
    rep.rows.forEach((r) => {
      L.push([r.date, parseYmd(r.date).toLocaleDateString('en-US', { weekday: 'short' }), Math.round(r.tot.kcal), r1(r.tot.p), r1(r.tot.c), r1(r.tot.f), r.entries.length].map(csvEscape).join(','));
    });
    L.push(['Average (days logged: ' + rep.daysLogged + ')', '', Math.round(rep.avg.kcal), r1(rep.avg.p), r1(rep.avg.c), r1(rep.avg.f), ''].map(csvEscape).join(','));
    L.push('');
    L.push('FOOD DETAIL');
    L.push(['Date', 'Meal', 'Food', 'Brand', 'Amount', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)'].join(','));
    rep.rows.forEach((r) => {
      MEALS.forEach((m) => {
        r.entries.filter((e) => e.meal === m).forEach((e) => {
          const n = entryNut(e);
          L.push([r.date, m, e.food.name, e.food.brand || '', amountLabel(e), Math.round(n.kcal), r1(n.p), r1(n.c), r1(n.f)].map(csvEscape).join(','));
        });
      });
    });
    return '﻿' + L.join('\r\n');
  }

  /* ---------- Friends ---------- */
  const normalizeUsername = (s) => String(s == null ? '' : s).trim().replace(/^@+/, '').toLowerCase();
  const validUsername = (s) => /^[a-z0-9_]{3,20}$/.test(s);

  /* A friend's day comes from someone else's account, so it's untrusted: keep only the fields the
     diary displays, as the expected types, so malformed data can't break or inject into the page. */
  function cleanSharedDay(raw) {
    const obj = (v) => (v && typeof v === 'object' ? v : {});
    const n0 = (v) => num(v) || 0;
    const str = (v) => (typeof v === 'string' ? v : '');
    const r = obj(raw), t = obj(r.targets);
    const entries = (Array.isArray(r.entries) ? r.entries : []).filter((e) => e && e.food && MEALS.includes(e.meal)).map((e) => {
      const nut = obj(e.food.nut);
      return {
        meal: e.meal, qty: n0(e.qty), unit: Number.isInteger(e.unit) ? e.unit : 0,
        food: {
          name: str(e.food.name) || 'Food', brand: str(e.food.brand),
          nut: { kcal: n0(nut.kcal), p: n0(nut.p), c: n0(nut.c), f: n0(nut.f) },
          units: (Array.isArray(e.food.units) ? e.food.units : []).map((u) => ({ label: str(obj(u).label), factor: n0(obj(u).factor) })),
        },
      };
    });
    return { entries, targets: { kcal: n0(t.kcal), p: n0(t.p), c: n0(t.c), f: n0(t.f) } };
  }

  const api = { r1, num, kcalFromMacros, fromOFF, fromUSDA, fromManual, entryNut, sumEntries, amountLabel,
    ymd, parseYmd, addDays, weekStart, weekDays, barcodeVariants, MEALS, weekReport, reportCSV, titleCase,
    normalizeUsername, validUsername, cleanSharedDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Core = api;
})(typeof self !== 'undefined' ? self : this);
