import { recommend, RUNNING_WARMTH_C } from './rules.js';
import { searchPlaces, fetchForecast, buildRun, upcomingDays, hhmm } from './weather.js';

// ---------- settings ----------
const KEY = 'runlayers.v1';
const DEFAULTS = { place: null, kit: 'mens', bias: 0, runTime: '06:30', runMins: 60, tempUnit: 'C', windUnit: 'mph', mode: 'now' };

function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* ignore */ }
  // Always open on "Going now"; the planned run is a per-visit switch, not a saved preference.
  return { ...DEFAULTS, ...saved, mode: 'now' };
}
function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(state.s)); } catch { /* private mode: keep in memory */ }
}

const state = {
  s: loadSettings(),
  planDay: null, // YYYY-MM-DD for a planned run; null = next occurrence of the start time. Not saved.
  forecast: null,
  loading: false,
  error: '',
  results: null,
  searching: false,
  toast: '',
};

// ---------- formatting ----------
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const signed = (n) => (n < 0 ? '−' : '') + Math.abs(n);
const temp = (c) => signed(Math.round(state.s.tempUnit === 'F' ? c * 9 / 5 + 32 : c)) + '°';
const tempDelta = (d) => Math.round(state.s.tempUnit === 'F' ? d * 9 / 5 : d) + '°';
const wind = (kmh) => state.s.windUnit === 'mph' ? `${Math.round(kmh / 1.609)} mph` : `${Math.round(kmh)} km/h`;

const ICONS = {
  head: 'M5 15a7 7 0 0 1 14 0M4 15h16v4H4zM12 4.5a1.5 1.5 0 1 0 .01 0',
  neck: 'M7 4h10l-1.5 7 1.5 9H7l1.5-9zM8.5 11h7',
  top: 'M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z',
  shell: 'M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3-4 3zM12 6v15',
  bra: 'M4 5v9a4 4 0 0 0 8 0 4 4 0 0 0 8 0V5M4 10h16',
  hands: 'M8 21v-5l-3-3.5a1.6 1.6 0 0 1 2.4-2.1L8 11V6a4 4 0 0 1 8 0v15z',
  legs: 'M7 3h10l1 18h-4l-2-11-2 11H6z',
  feet: 'M9 3h6v9l3 3a3 3 0 0 1-2 6h-6a4 4 0 0 1-4-4v-1l3-4zM9 7h6',
  light: 'M12 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8M12 2v3M12 19v3M2 12h3M19 12h3',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7',
  user: 'M12 4a4 4 0 1 1 0 8a4 4 0 1 1 0-8M4 21a8 8 0 0 1 16 0',
  drop: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  locate: 'M3 11 21 3l-8 18-2-8z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
};
const icon = (name, size = 22, w = 1.8) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;

// ---------- data ----------
async function loadForecast() {
  const p = state.s.place;
  if (!p) return;
  state.loading = true; state.error = ''; render();
  try {
    state.forecast = await fetchForecast(p.lat, p.lon);
  } catch (e) {
    state.error = navigator.onLine === false ? 'You’re offline. Connect to get today’s forecast.' : 'Couldn’t reach the forecast. Try again in a moment.';
  }
  state.loading = false; render();
}

function currentRun() {
  if (!state.forecast) return null;
  try {
    const run = buildRun(state.forecast, { runTime: state.s.runTime, runMins: state.s.runMins, mode: state.s.mode, day: state.planDay });
    return { run, rec: recommend(run.conditions, { kit: state.s.kit, bias: state.s.bias }) };
  } catch (e) {
    return { error: e.message };
  }
}

function setPlace(place) {
  state.s.place = place; state.results = null; saveSettings();
  state.forecast = null;
  location.hash = '#today';
  loadForecast();
}

// ---------- shared pieces ----------
const seg = (action, options, current) => `
  <div class="seg" role="group">
    ${options.map(([value, label]) => `<button type="button" data-action="${action}" data-v="${esc(value)}" aria-pressed="${String(value) === String(current)}">${esc(label)}</button>`).join('')}
  </div>`;

const biasBucket = () => (state.s.bias < 0 ? -2 : state.s.bias > 0 ? 2 : 0);

function locationBlock() {
  const r = state.results;
  return `
    <form class="search" data-form="search" role="search">
      <label class="label" for="loc">Where you run</label>
      <div class="field">
        <input id="loc" name="q" type="search" autocomplete="off" placeholder="Search a town or city" value="">
        <button type="submit" class="field-btn">Search</button>
      </div>
      <button type="button" class="link-btn" data-action="geolocate">${icon('locate', 16, 2)} Use my current location</button>
      ${state.searching ? '<p class="muted">Searching…</p>' : ''}
      ${r && !r.length ? '<p class="muted">No places found. Try a nearby town.</p>' : ''}
      ${r && r.length ? `<ul class="results">${r.map((p, i) => `
        <li><button type="button" data-action="pick-place" data-i="${i}"><strong>${esc(p.name)}</strong><span>${esc(p.detail)}</span></button></li>`).join('')}</ul>` : ''}
    </form>`;
}

const LENGTHS = [[30, '30 min'], [45, '45 min'], [60, '1 hr'], [90, '1.5 hr'], [120, '2 hr']];

function planPanel(cur) {
  if (state.s.mode !== 'planned') return '';
  const days = state.forecast ? upcomingDays(state.forecast) : [];
  const sel = state.planDay || (cur && cur.run ? new Date(cur.run.start).toISOString().slice(0, 10) : '');
  return `
    <div class="card plan" aria-label="Plan your run">
      ${days.length ? `<div class="chips" role="group" aria-label="Day">${days.map((d) => `<button type="button" class="chip" data-action="plan-day" data-v="${d.date}" aria-pressed="${d.date === sel}">${esc(d.label)}</button>`).join('')}</div>` : ''}
      <div class="list-plain">
        <label class="kv" for="runTime"><span>Start</span><input id="runTime" type="time" value="${esc(state.s.runTime)}" data-change="runTime"></label>
        <label class="kv" for="runMins"><span>Length</span>
          <select id="runMins" data-change="runMins">${LENGTHS.map(([m, l]) => `<option value="${m}" ${m === Number(state.s.runMins) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
    </div>`;
}

function alertCard(a) {
  return `<div class="alert">${'<span class="alert-icon">' + icon(a.kind === 'ice' ? 'alert' : 'drop', 20, 2) + '</span>'}<span><strong>${esc(a.title)}</strong> ${esc(a.body)}</span></div>`;
}

// ---------- views ----------
function viewToday() {
  const p = state.s.place;
  if (!p) {
    return `
      <header class="head"><h1>What to wear</h1></header>
      <section class="card pad onboarding">
        <h2>Let’s get your kit sorted</h2>
        <p class="muted">Tell us where you run and we’ll check the wind, rain and temperature each morning.</p>
        ${locationBlock()}
      </section>`;
  }
  const cur = currentRun();
  const top = `
    <header class="head">
      <div class="row-between">
        <span class="muted">${esc(p.name)}</span>
        <a href="#profile" class="icon-btn" aria-label="Profile">${icon('user')}</a>
      </div>
      <h1>${cur && cur.run ? (state.s.mode === 'now' ? 'Running now' : `${esc(cur.run.dayLabel)}, ${esc(state.s.runTime)} run`) : 'Your run'}</h1>
      ${seg('mode', [['now', 'Going now'], ['planned', 'Planned']], state.s.mode)}
    </header>
    ${planPanel(cur)}`;

  if (state.loading && !state.forecast) return top + `<section class="card pad skeleton" aria-busy="true"><span class="muted">Checking the forecast…</span></section>`;
  if (state.error && !state.forecast) return top + `<section class="card pad"><p>${esc(state.error)}</p><button type="button" class="btn" data-action="refresh">Try again</button></section>`;
  if (!cur) return top;
  if (cur.error) return top + `<section class="card pad"><p>${esc(cur.error)}</p></section>`;

  const { run, rec } = cur;
  const c = run.conditions;
  const chill = Math.round(c.airC) - rec.feels;
  let chillLine = chill >= 1
    ? `Wind knocks ${tempDelta(chill)} off the ${temp(c.airC)} air. Once you’re moving it’ll feel about ${temp(rec.moving)}.`
    : `Hardly any wind chill. Once you’re moving it’ll feel about ${temp(rec.moving)}.`;
  if (state.s.bias < 0) chillLine += ' Dressed a notch warmer — you run cold.';
  if (state.s.bias > 0) chillLine += ' Dressed a notch lighter — you run warm.';

  return top + `
    <section class="card hero" aria-label="Conditions for your run">
      <div class="stack-4"><span class="muted">Feels like</span><span class="big">${temp(rec.feels)}</span></div>
      <p class="lead">${esc(chillLine)}</p>
      <div class="stats">
        <div><span class="muted sm">Air</span><strong>${temp(c.airC)}</strong></div>
        <div><span class="muted sm">Gusts</span><strong class="${rec.windy ? 'hot' : ''}">${wind(c.gustKmh)}</strong></div>
        <div><span class="muted sm">Rain</span><strong class="${rec.wet ? 'hot' : ''}">${Math.round(c.rainProb)}%</strong></div>
      </div>
    </section>
    ${rec.alerts.map(alertCard).join('')}
    <section class="kit" aria-label="Your kit">
      <div class="row-between baseline pad-x"><h2>${esc(rec.headline)}</h2><span class="muted sm">${rec.wear.length} items</span></div>
      <ul class="card list">
        ${rec.wear.map((w) => `
          <li class="item">
            <span class="item-icon ${w.flag ? 'flagged' : ''}">${icon(w.icon)}</span>
            <div class="item-body">
              <div class="item-zone"><span class="muted sm">${esc(w.zone)}</span>${w.flag ? `<span class="tag">${esc(w.flag)}</span>` : ''}</div>
              <strong>${esc(w.name)}</strong>
              <span class="muted">${esc(w.note)}</span>
            </div>
          </li>`).join('')}
      </ul>
      ${rec.skip.length ? `<div class="skip"><span class="muted sm">Leave at home</span><span>${rec.skip.map(esc).join(' · ')}</span></div>` : ''}
    </section>
    <section class="adjust pad-x" aria-label="Adjust for you">
      <h2 class="h3">Adjust for you</h2>
      ${seg('kit', [['mens', 'Men’s kit'], ['womens', 'Women’s kit']], state.s.kit)}
      ${seg('bias', [[-2, 'I run cold'], [0, 'Neutral'], [2, 'I run warm']], biasBucket())}
    </section>
    <p class="footnote">
      Forecast by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> · updated ${state.forecast ? new Date(state.forecast.fetchedAt).toTimeString().slice(0, 5) : '—'}
      <button type="button" class="link-btn" data-action="refresh" ${state.loading ? 'disabled' : ''}>${icon('refresh', 14, 2)} ${state.loading ? 'Refreshing…' : 'Refresh'}</button>
    </p>`;
}

function viewConditions() {
  const head = `<header class="head"><span class="muted">${state.s.place ? esc(state.s.place.name) : ''}</span><h1>Conditions</h1></header>`;
  const cur = currentRun();
  if (!cur || cur.error) return head + `<section class="card pad"><p class="muted">${state.s.place ? (state.loading ? 'Checking the forecast…' : esc(cur?.error || state.error || 'No forecast yet.')) : 'Set where you run on the Profile tab first.'}</p></section>`;
  const { run, rec } = cur;
  const c = run.conditions;
  return head + `
    <p class="muted pad-x sub">${esc(run.dayLabel)} · ${hhmm(run.start)}–${hhmm(run.end)}</p>
    <section class="card pad steps" aria-label="How we get your number">
      <h2 class="h3">How we get your number</h2>
      <div class="step"><span class="step-n">${temp(c.airC)}</span><div><strong>Air temperature</strong><span class="muted">The coldest point of your run.</span></div></div>
      <div class="step"><span class="step-n">${temp(rec.feels)}</span><div><strong>With wind chill</strong><span class="muted">${wind(c.windKmh)} of wind. Your headline number.</span></div></div>
      <div class="step"><span class="step-n">${temp(rec.moving)}</span><div><strong>Once you’re moving</strong><span class="muted">Running adds about ${tempDelta(RUNNING_WARMTH_C)}. We dress you for this.</span></div></div>
    </section>
    <section class="kit" aria-label="During your run">
      <h2 class="pad-x">During your run</h2>
      <div class="card table" role="table">
        <div class="tr th" role="row"><span role="columnheader">Time</span><span role="columnheader">Feels</span><span role="columnheader">Wind</span><span role="columnheader">Rain</span></div>
        ${run.hours.map((h) => `<div class="tr" role="row"><span role="cell">${h.label}</span><strong role="cell">${temp(h.feelsC)}</strong><span role="cell">${wind(h.windKmh)}</span><span role="cell" class="${h.rainProb >= 50 ? 'hot' : ''}">${Math.round(h.rainProb)}%</span></div>`).join('')}
      </div>
    </section>
    ${rec.alerts.map(alertCard).join('')}
    <section class="card list-plain">
      <div class="kv"><span class="muted">Wind from the</span><strong>${esc(run.windFrom)}</strong></div>
      <div class="kv"><span class="muted">Gusts up to</span><strong class="${rec.windy ? 'hot' : ''}">${wind(c.gustKmh)}</strong></div>
      ${run.sunrise ? `<div class="kv"><span class="muted">Sunrise · sunset</span><strong>${run.sunrise} · ${run.sunset}</strong></div>` : ''}
    </section>
    <p class="footnote">Tip: head out into the wind and come home with it behind you — you finish sweaty, not frozen.</p>`;
}

function viewProfile() {
  const s = state.s;
  return `
    <header class="head"><h1>Profile</h1></header>
    <div class="profile">
      ${s.place ? `<div class="card pad current-place"><span class="muted sm">Running from</span><strong>${esc(s.place.name)}</strong>${s.place.detail ? `<span class="muted sm">${esc(s.place.detail)}</span>` : ''}</div>` : ''}
      ${locationBlock()}
      <fieldset><legend class="label">Kit profile</legend>
        ${seg('kit', [['mens', 'Men’s kit'], ['womens', 'Women’s kit']], s.kit)}
        <p class="muted sm pad-x">Changes the products we suggest — sports bra, cuts, wind-block briefs. The weather rules stay the same.</p>
      </fieldset>
      <fieldset><legend class="label">How you feel the cold</legend>
        ${seg('bias', [[-2, 'I run cold'], [0, 'Neutral'], [2, 'I run warm']], biasBucket())}
      </fieldset>
      <div><span class="label">Units</span>
        <div class="card list-plain">
          <div class="kv"><span>Temperature</span>${seg('tempUnit', [['C', '°C'], ['F', '°F']], s.tempUnit)}</div>
          <div class="kv"><span>Wind</span>${seg('windUnit', [['mph', 'mph'], ['kmh', 'km/h']], s.windUnit)}</div>
        </div>
      </div>
      <section class="card dark-card">
        <div><strong>How did your last run feel?</strong><span>We’ll nudge your recommendations.</span></div>
        <div class="fb">
          <button type="button" data-action="feedback" data-v="-1">Too cold</button>
          <button type="button" data-action="feedback" data-v="0" class="light">Just right</button>
          <button type="button" data-action="feedback" data-v="1">Too warm</button>
        </div>
      </section>
    </div>`;
}

const TABS = [
  ['today', 'Today', 'top'],
  ['conditions', 'Conditions', 'wind'],
  ['profile', 'Profile', 'user'],
];

function render() {
  const tab = (location.hash || '#today').slice(1);
  const view = tab === 'conditions' ? viewConditions() : tab === 'profile' ? viewProfile() : viewToday();
  const app = document.getElementById('app');
  const q = document.getElementById('loc');
  const keepQuery = q ? q.value : '';
  app.innerHTML = `
    <main class="screen">${view}</main>
    <nav class="tabbar" aria-label="Main">
      ${TABS.map(([id, label, ic]) => `<a href="#${id}" ${id === (['conditions', 'profile'].includes(tab) ? tab : 'today') ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`).join('')}
    </nav>
    ${state.toast ? `<div class="toast" role="status">${esc(state.toast)}</div>` : ''}`;
  const q2 = document.getElementById('loc');
  if (q2 && keepQuery) q2.value = keepQuery;
}

// ---------- events ----------
let toastTimer;
function toast(msg) {
  state.toast = msg; render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = ''; render(); }, 2600);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const v = b.dataset.v;
  switch (b.dataset.action) {
    case 'mode': state.s.mode = v; break;
    case 'plan-day': state.planDay = v; render(); return;
    case 'kit': state.s.kit = v; break;
    case 'bias': state.s.bias = Number(v); break;
    case 'tempUnit': state.s.tempUnit = v; break;
    case 'windUnit': state.s.windUnit = v; break;
    case 'refresh': loadForecast(); return;
    case 'pick-place': {
      const p = state.results[Number(b.dataset.i)];
      setPlace(p); return;
    }
    case 'geolocate': {
      if (!navigator.geolocation) { toast('Location isn’t available on this device.'); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => setPlace({ name: 'Current location', detail: '', lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => toast('Couldn’t get your location. Search instead.'),
        { timeout: 10000, maximumAge: 600000 },
      );
      return;
    }
    case 'feedback': {
      const d = Number(v);
      if (d === 0) { toast('Nice — we’ll keep it like that.'); return; }
      state.s.bias = Math.max(-4, Math.min(4, state.s.bias + d));
      saveSettings();
      toast(d < 0 ? 'Got it — we’ll dress you a little warmer.' : 'Got it — we’ll go a little lighter.');
      return;
    }
    default: return;
  }
  saveSettings(); render();
});

document.addEventListener('change', (e) => {
  const k = e.target.dataset.change;
  if (!k) return;
  state.s[k] = k === 'runMins' ? Number(e.target.value) : e.target.value;
  saveSettings(); render();
});

document.addEventListener('submit', async (e) => {
  if (e.target.dataset.form !== 'search') return;
  e.preventDefault();
  const q = new FormData(e.target).get('q').trim();
  if (q.length < 2) return;
  state.searching = true; state.results = null; render();
  try { state.results = await searchPlaces(q); }
  catch { toast('Search failed. Check your connection.'); }
  state.searching = false; render();
});

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.forecast && Date.now() - state.forecast.fetchedAt > 30 * 60_000) loadForecast();
});

render();
loadForecast();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
