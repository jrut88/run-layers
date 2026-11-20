import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feelsLike, recommend } from '../js/rules.js';

const base = { airC: 10, windKmh: 0, gustKmh: 0, rainProb: 0, precipMm: 0, snow: false, dark: false, iceRisk: false };
const names = (r) => r.wear.map((w) => w.name);

test('wind chill only applies at 10° and below with wind', () => {
  assert.equal(feelsLike(15, 30), 15);
  assert.equal(feelsLike(5, 3), 5);
  assert.equal(Math.round(feelsLike(1, 8 * 1.609)), -3);
  assert.equal(Math.round(feelsLike(-4, 11 * 1.609)), -10);
});

test('mild and dry: tee or long sleeve, shorts, nothing on head', () => {
  const r = recommend({ ...base, airC: 15 }, { kit: 'mens' });
  assert.ok(names(r).includes('Short-sleeve tech tee'));
  assert.ok(names(r).includes('Running shorts'));
  assert.deepEqual(r.skip, ['Hat', 'Neck gaiter', 'Jacket', 'Gloves']);
});

test('cold and dry: base layer, beanie, gloves, tights', () => {
  const r = recommend({ ...base, airC: 1, windKmh: 13 }, { kit: 'mens' });
  assert.equal(r.feels, -3);
  const n = names(r);
  ['Merino base layer', 'Thermal beanie', 'Lightweight running gloves', 'Running tights', 'Merino crew socks'].forEach((x) => assert.ok(n.includes(x), x));
  assert.ok(!r.wet);
});

test('rain forces a jacket, cap and merino socks, flagged', () => {
  const r = recommend({ ...base, airC: 7, windKmh: 32, gustKmh: 55, rainProb: 80 }, { kit: 'mens' });
  const jacket = r.wear.find((w) => w.name === 'Waterproof running jacket');
  assert.equal(jacket.flag, 'Rain');
  assert.ok(names(r).includes('Merino mid-cushion socks'));
  assert.ok(r.alerts.some((a) => a.kind === 'rain'));
});

test('freezing: thermal tights and wind briefs for men', () => {
  const r = recommend({ ...base, airC: -4, windKmh: 18 }, { kit: 'mens' });
  assert.ok(names(r).includes('Thermal tights'));
  assert.match(r.wear.find((w) => w.zone === 'Legs').note, /wind-block briefs/);
});

test('women’s kit adds a sports bra and keeps rules the same', () => {
  const m = recommend({ ...base, airC: 1, windKmh: 13 }, { kit: 'mens' });
  const w = recommend({ ...base, airC: 1, windKmh: 13 }, { kit: 'womens' });
  assert.ok(names(w).includes('High-support sports bra'));
  assert.equal(w.headline, m.headline);
});

test('running cold shifts you a notch warmer', () => {
  const neutral = recommend({ ...base, airC: 4 }, { bias: 0 });
  const cold = recommend({ ...base, airC: 4 }, { bias: -2 });
  assert.ok(!names(neutral).includes('Merino base layer'));
  assert.ok(names(cold).includes('Merino base layer'));
});

test('dark runs get a head torch', () => {
  assert.ok(names(recommend({ ...base, dark: true })).includes('Head torch + reflective detail'));
  assert.ok(!names(recommend(base)).includes('Head torch + reflective detail'));
});
