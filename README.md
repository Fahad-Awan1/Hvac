# HVAC — Comfort, Engineered

Static multi-page website for an HVAC business. Plain HTML/CSS/JS, no framework, no runtime CDN dependencies.

## Run locally
The 3D scenes use ES modules, so open the site through a local server (not by double-clicking the file):

```
python -m http.server 8000      # then visit http://localhost:8000
```

## Editing pages
Edit the sources in `src/`, then rebuild:

```
node build.mjs
```

- `src/pages/*.html`: page content (first line holds the title/description/nav meta)
- `src/partials/`: shared layout, header, footer and icon sprite
- `<x-img name="tech-1" alt="…">` becomes a responsive `<img>` with `srcset`, width/height and lazy-loading
- Do **not** edit the root `*.html` files directly; they are overwritten on build.
- Homepage hero thermostat: the headline/button text for each state (too cold / just right / too warm) lives in the `data-thermo-states` JSON block in `src/pages/index.html`; background photos are `assets/img/bg-cold|bg-ok|bg-hot(.webp / -sm.webp)`.
- Homepage "Whatever the weather, home stays 72°" section: each season's badge, outside value, tag note, equipment name and tag position (`data-x` / `data-y`) are `data-` attributes on the `.story__season` figures in `src/pages/index.html`; photos are `assets/img/home-summer|winter|spring|evening`.

## Structure
| Path | Purpose |
|---|---|
| `assets/css/style.css` | Design system, all sections, responsive rules |
| `assets/js/main.js` | Smooth scroll, reveals, pinned/horizontal sections, cursor, calculators, quiz, booking, filters |
| `assets/js/scenes.js` | Three.js scenes (fan, particle morph, house airflow), lazy-loaded only when visible |
| `assets/js/chatbot.js` | "Breeze" hardcoded chat assistant (edit `INTENTS` to change answers) |
| `assets/vendor/` | Lenis + Three.js, served locally |
| `assets/img/` | WebP images (`*-sm.webp` = 640px mobile versions) |

## Performance notes
- `node build.mjs` also writes `assets/css/style.min.css` (the pages load this) and adds a `?v=` content hash to CSS/JS URLs, so browsers can cache them for a year and still get updates instantly.
- Fonts are self-hosted (`assets/fonts`) and preloaded, so there's no render-blocking Google Fonts request.
- Images come in three sizes: `-sm` (640–760px), `-md` (960/1100px) and full. The `<x-img>` tag adds all of them automatically. After adding new photos, create the `-sm` / `-md` versions too.
- Three.js (3D) loads only on pages with a 3D scene, after the page is interactive. The homepage loads no 3D at all.
- Scroll effects use cached measurements and run only when the page actually scrolls; marquees are pure CSS animations.
- `.htaccess` (Apache/cPanel) and `_headers` (Netlify/Cloudflare Pages) turn on compression and caching. Keep them when uploading.

## Before going live
- Replace placeholder phone, email, address, licence number and `SITE` URL in `build.mjs`
- Connect forms (booking, contact, subscribe) to a backend or a form service such as Formspree; they currently show success states only
- Update the demo ZIP coverage regex in `main.js` (`[data-area]`) and `chatbot.js`
