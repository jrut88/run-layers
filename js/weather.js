// Weather via Open-Meteo (free, no API key). https://open-meteo.com
import { feelsLike } from './rules.js';

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const HOUR = 3600_000;
const DAY = 24 * HOUR;

export async function searchPlaces(query) {
  const url = `${GEO_URL}?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Place search failed');
  const data = await res.json();
  return (data.results || []).map((r) => ({
    name: r.name,
    detail: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

export async function fetchForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    hourly: 'temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation_probability,precipitation,weather_code,is_day',
    daily: 'sunrise,sunset',
    timezone: 'auto',
    forecast_days: '3',
    wind_speed_unit: 'kmh',
  });
  const res = await fetch(`${FORECAST_URL}?${params}`);
  if (!res.ok) throw new Error('Forecast unavailable');
  const data = await res.json();
  data.fetchedAt = Date.now();
  return data;
}

// Open-Meteo returns local wall-clock strings ("2026-11-20T06:00") when timezone=auto.
// We treat them as UTC instants so all maths stays in the location's local time.
const parseLocal = (s) => Date.parse(s.length === 16 ? `${s}:00Z` : `${s}Z`);
export const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/**
 * Pick the run window from a forecast and summarise conditions for the rules engine.
 * mode 'planned' uses the next occurrence of runTime; 'now' starts immediately.
 */
export function buildRun(fc, { runTime = '06:30', runMins = 60, mode = 'planned' } = {}) {
  const nowLocal = Date.now() + fc.utc_offset_seconds * 1000;
  const todayStr = new Date(nowLocal).toISOString().slice(0, 10);
  let start;
  if (mode === 'now') start = nowLocal;
  else {
    start = parseLocal(`${todayStr}T${runTime}`);
    if (start + runMins * 60_000 < nowLocal) start += DAY;
  }
  const end = start + runMins * 60_000;

  const h = fc.hourly;
  const hours = [];
  for (let i = 0; i < h.time.length; i++) {
    const t = parseLocal(h.time[i]);
    if (t + HOUR > start && t < end) {
      const airC = h.temperature_2m[i];
      const windKmh = h.wind_speed_10m[i];
      hours.push({
        t,
        label: hhmm(t),
        airC,
        windKmh,
        gustKmh: h.wind_gusts_10m[i] ?? windKmh,
        feelsC: feelsLike(airC, windKmh),
        rainProb: h.precipitation_probability[i] ?? 0,
        precipMm: h.precipitation[i] ?? 0,
        code: h.weather_code[i],
        isDay: h.is_day[i] === 1,
        windDir: h.wind_direction_10m[i],
      });
    }
  }
  if (!hours.length) throw new Error('No forecast for that time yet');

  const coldest = hours.reduce((a, b) => (b.feelsC < a.feelsC ? b : a));
  const startDay = Math.floor(start / DAY);
  const todayDay = Math.floor(nowLocal / DAY);
  const dayLabel = startDay === todayDay ? 'Today' : startDay === todayDay + 1 ? 'Tomorrow' : WEEKDAYS[new Date(start).getUTCDay()];

  const dateStr = new Date(start).toISOString().slice(0, 10);
  const di = fc.daily.time.indexOf(dateStr);

  return {
    start,
    end,
    mode,
    dayLabel,
    weekday: WEEKDAYS[new Date(start).getUTCDay()],
    hours,
    sunrise: di >= 0 ? fc.daily.sunrise[di].slice(11, 16) : null,
    sunset: di >= 0 ? fc.daily.sunset[di].slice(11, 16) : null,
    windFrom: COMPASS[Math.round((hours[0].windDir ?? 0) / 45) % 8],
    conditions: {
      airC: coldest.airC,
      windKmh: coldest.windKmh,
      gustKmh: Math.max(...hours.map((x) => x.gustKmh)),
      rainProb: Math.max(...hours.map((x) => x.rainProb)),
      precipMm: hours.reduce((s, x) => s + x.precipMm, 0),
      snow: hours.some((x) => SNOW_CODES.has(x.code)),
      dark: hours.some((x) => !x.isDay),
      iceRisk: Math.min(...hours.map((x) => x.airC)) <= 1,
    },
  };
}
