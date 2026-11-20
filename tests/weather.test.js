import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRun, upcomingDays } from '../js/weather.js';

// A tiny fake Open-Meteo forecast: 3 days of hourly data, UTC, so no network is needed.
function fakeForecast() {
  const days = ['2026-11-20', '2026-11-21', '2026-11-22'];
  const time = [];
  days.forEach((d) => { for (let h = 0; h < 24; h++) time.push(`${d}T${String(h).padStart(2, '0')}:00`); });
  const n = time.length;
  const fill = (v) => Array(n).fill(v);
  return {
    utc_offset_seconds: 0,
    hourly: {
      time,
      temperature_2m: time.map((t) => (Number(t.slice(11, 13)) < 9 ? 1 : 8)),
      wind_speed_10m: fill(12),
      wind_gusts_10m: fill(20),
      wind_direction_10m: fill(45),
      precipitation_probability: fill(0),
      precipitation: fill(0),
      weather_code: fill(0),
      is_day: time.map((t) => (Number(t.slice(11, 13)) >= 8 && Number(t.slice(11, 13)) < 16 ? 1 : 0)),
    },
    daily: { time: days, sunrise: days.map((d) => `${d}T07:40`), sunset: days.map((d) => `${d}T16:00`) },
  };
}
const NOW = Date.parse('2026-11-20T10:00:00Z'); // Friday 10:00

test('planned with no day picks the next occurrence of the start time', () => {
  const run = buildRun(fakeForecast(), { runTime: '06:30', runMins: 60, mode: 'planned', now: NOW });
  assert.equal(run.dayLabel, 'Tomorrow');
  assert.deepEqual(run.hours.map((h) => h.label), ['06:00', '07:00']);
  assert.equal(run.conditions.dark, true);
});

test('planned with a chosen day and time uses exactly that window', () => {
  const run = buildRun(fakeForecast(), { runTime: '17:00', runMins: 60, mode: 'planned', day: '2026-11-22', now: NOW });
  assert.equal(run.dayLabel, 'Sunday');
  assert.deepEqual(run.hours.map((h) => h.label), ['17:00']);
});

test('a chosen time that has already passed is an error', () => {
  assert.throws(
    () => buildRun(fakeForecast(), { runTime: '06:30', runMins: 60, mode: 'planned', day: '2026-11-20', now: NOW }),
    /passed/,
  );
});

test('going now starts from the current hour', () => {
  const run = buildRun(fakeForecast(), { runMins: 45, mode: 'now', now: NOW });
  assert.equal(run.dayLabel, 'Today');
  assert.equal(run.hours[0].label, '10:00');
});

test('day chips are labelled Today, Tomorrow, then weekday', () => {
  assert.deepEqual(upcomingDays(fakeForecast(), NOW).map((d) => d.label), ['Today', 'Tomorrow', 'Sun']);
});
