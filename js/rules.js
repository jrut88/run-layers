// Kit rules engine. Pure functions, no DOM — easy to test and tune.
// All thresholds are in °C and km/h; convert for display elsewhere.

export const GUST_WINDY_KMH = 40; // ≈ 25 mph
export const RAIN_PROB_WET = 50; // %
export const PRECIP_WET_MM = 0.5; // mm over the run window
export const RUNNING_WARMTH_C = 10; // how much warmer you feel once moving

/** Wind chill (JAG/TI formula used by the Met Office and Environment Canada). */
export function feelsLike(airC, windKmh) {
  if (airC > 10 || windKmh <= 4.8) return airC;
  const v = Math.pow(windKmh, 0.16);
  return 13.12 + 0.6215 * airC - 11.37 * v + 0.3965 * airC * v;
}

export function headlineFor(f) {
  if (f >= 14) return 'T-shirt weather';
  if (f >= 9) return 'Long-sleeve morning';
  if (f >= 3) return 'Light layers';
  if (f >= -3) return 'Base-layer day';
  return 'Full thermals';
}

/**
 * @param {object} c conditions for the run window
 *   { airC, windKmh, gustKmh, rainProb, precipMm, snow, dark, iceRisk }
 *   airC/windKmh should be the coldest/windiest moment of the run.
 * @param {object} p profile { kit: 'mens'|'womens', bias: number }
 *   bias < 0 = runs cold (dress warmer), > 0 = runs warm.
 */
export function recommend(c, p = {}) {
  const women = p.kit === 'womens';
  const bias = Number(p.bias) || 0;
  const feels = Math.round(feelsLike(c.airC, c.windKmh));
  const f = feels + bias;
  const wet = !!c.snow || c.rainProb >= RAIN_PROB_WET || c.precipMm >= PRECIP_WET_MM;
  const windy = c.gustKmh >= GUST_WINDY_KMH;
  const wetTag = c.snow ? 'Snow' : 'Rain';

  const wear = [];
  const skip = [];
  const add = (zone, icon, name, note, flag = '') => wear.push({ zone, icon, name, note, flag });

  // Head & ears
  if (wet && f < 3) add('Head', 'head', 'Peaked cap + ear band', 'Peak keeps it out of your eyes; band covers your ears.', wetTag);
  else if (wet) add('Head', 'head', 'Peaked running cap', `Keeps the ${wetTag.toLowerCase()} off your face.`, wetTag);
  else if (f < 2) add('Head', 'head', 'Thermal beanie', 'Pull it over your ears — no headband needed.');
  else if (f < 8 || windy) add('Ears', 'head', women ? 'Ear-warmer band (ponytail-friendly)' : 'Ear-warmer band', 'Ears go first; your head can still vent heat.', windy ? 'Wind' : '');
  else skip.push('Hat');

  // Neck
  if (f < -3 || (windy && f < 5)) add('Neck', 'neck', 'Neck gaiter', 'Over your mouth for the first kilometre, then down.', windy ? 'Wind' : '');
  else skip.push('Neck gaiter');

  // Top, inside out
  if (women) add('Under', 'bra', 'High-support sports bra', 'Wicking fabric, so sweat doesn’t chill you.');
  if (f >= 14) add('Top', 'top', 'Short-sleeve tech tee', 'You’ll warm up within a kilometre.');
  else if (f >= 3) add('Top', 'top', 'Long-sleeve tech top', 'No base layer needed today.');
  else if (f >= -3) {
    add('Base layer', 'top', 'Merino base layer', 'Holds warmth even when damp.');
    add('Top', 'top', 'Long-sleeve tech top', 'Over the base layer.');
  } else {
    add('Base layer', 'top', 'Merino base layer', 'Holds warmth even when damp.');
    add('Mid layer', 'top', 'Brushed thermal top', 'Fleece-backed for real cold.');
  }
  if (wet) add('Outer', 'shell', 'Waterproof running jacket', 'Taped seams, with vents so you don’t boil.', wetTag);
  else if (windy || f < -3) add('Outer', 'shell', 'Windproof shell', 'Blocks the wind chill; packs into its pocket.', windy ? 'Wind' : '');
  else skip.push('Jacket');

  // Hands
  if (f < -3) add('Hands', 'hands', 'Thermal gloves or mitts', 'Mitts keep fingers together and warmer.');
  else if (f < 7) add('Hands', 'hands', 'Lightweight running gloves', 'Tuck them in your waistband once warm.');
  else skip.push('Gloves');

  // Legs
  if (f >= 8) add('Legs', 'legs', 'Running shorts', 'No thermals — legs make their own heat.');
  else if (f >= 3) add('Legs', 'legs', women ? '¾ tights or shorts' : 'Shorts or ¾ tights', 'No thermals yet. A comfort call.');
  else if (f >= -5) add('Legs', 'legs', 'Running tights', 'No thermals needed until about −5°.');
  else add('Legs', 'legs', 'Thermal tights', women ? 'Yes, thermals today. Fleece-lined.' : 'Yes, thermals today. Add wind-block briefs.');

  // Socks
  if (wet) add('Socks', 'feet', 'Merino mid-cushion socks', 'Stays warm when soaked. Skip cotton.', wetTag);
  else if (f < 0) add('Socks', 'feet', 'Merino crew socks', 'Higher cuff closes the gap at your ankle.');
  else add('Socks', 'feet', 'Lightweight technical socks', 'Thin and quick-drying.');

  // Visibility
  if (c.dark) add('Be seen', 'light', 'Head torch + reflective detail', 'It’ll be dark for some of your run.');

  const alerts = [];
  if (wet) alerts.push({ kind: c.snow ? 'snow' : 'rain', title: c.snow ? 'Snow on your run.' : 'Rain on your run.', body: 'Jacket on, cap to keep it off your face.' });
  if (c.iceRisk) alerts.push({ kind: 'ice', title: 'Ice possible.', body: 'Near freezing — watch bridges and pavements.' });

  return {
    feels,
    adjusted: f,
    moving: feels + RUNNING_WARMTH_C,
    headline: headlineFor(f),
    wet,
    windy,
    wear,
    skip,
    alerts,
  };
}
