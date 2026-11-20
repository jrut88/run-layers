# Run Layers

What to wear for your run, from the forecast. Pick where you run and when, and Run Layers checks the temperature, wind chill, gusts and rain for your run window and builds a head-to-toe kit list.

- **Feels-like with wind chill**, then about +10° for the warmth you make once moving
- **Uses the coldest, windiest, wettest point of your run**, not just the start
- **Men's and women's kit profiles**: different products (sports bra, cuts, wind-block briefs), same weather rules
- **"I run cold / warm"** adjustment, nudged over time by "How did your last run feel?"
- Rain, snow, gusts and ice are the only things shown in colour
- Installable on your phone's home screen (PWA), with no account and no API key

Weather comes from [Open-Meteo](https://open-meteo.com/), which is free for non-commercial use. Commercial use needs their paid plan.

## Run it

No build step or dependencies; it's plain HTML, CSS and ES modules.

```bash
npm start            # serves on http://localhost:5173
npm test             # rules engine tests (Node 20+)
```

To use it on your phone, host the folder on any static host (GitHub Pages, Netlify, Cloudflare Pages), open it in Safari or Chrome, and choose **Add to Home Screen**. Location and the service worker need HTTPS.

## Where things live

| File | What it does |
| --- | --- |
| `js/rules.js` | The kit rules engine: thresholds, wind chill, what to wear. Pure functions; tune it here. |
| `js/weather.js` | Open-Meteo place search and forecast, and working out the run window |
| `js/app.js` | Screens (Today, Conditions, Profile), settings stored in `localStorage` |
| `styles.css` | Design tokens and layout |
| `sw.js`, `manifest.webmanifest` | Offline shell and home-screen install |

## The rules

Thresholds use the feels-like temperature (°C) after your cold/warm adjustment:

| Feels like | Top | Legs | Head | Hands |
| --- | --- | --- | --- | --- |
| 14° and up | Tee | Shorts | none | none |
| 8° to 14° | Long sleeve | Shorts | none | none |
| 3° to 8° | Long sleeve, no base | Shorts or ¾ | Ear band | Light gloves below 7° |
| −3° to 3° | Merino base + long sleeve | Tights | Beanie below 2° | Light gloves |
| Below −3° | Base + thermal mid + windproof | Tights, thermal below −5° | Beanie | Thermal gloves |

Overrides: rain ≥ 50% or ≥ 0.5 mm → waterproof jacket, cap, merino socks. Gusts ≥ 25 mph → windproof shell and ears covered. Before sunrise → head torch.

## Ideas for later

- Morning push notification with the kit (needs a small server or a native wrapper)
- "My wardrobe": map recommendations to the actual kit you own
- Strava or Garmin sync to learn from your real runs
