// Static site builder — zero dependencies.
// Usage: node build.mjs        (writes the finished .html pages to the project root)
//
// src/pages/*.html start with a meta comment:
//   <!--meta {"title":"…","desc":"…","nav":"home","preload":[{"href":"…","srcset":"…","sizes":"…"}]} -->
// Partials are injected with {{> name}} and responsive images are written as
// <x-img name="tech-1" alt="…" sizes="50vw" class="…" eager>  →  <img srcset=…>
// Also writes assets/css/style.min.css and cache-busts CSS/JS URLs with a content hash.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const images = JSON.parse(readFileSync(join(src, 'images.json'), 'utf8'));
const SITE = 'https://www.hvac-comfort.com';
const partial = (n) => readFileSync(join(src, 'partials', n + '.html'), 'utf8');
const attr = (s, k) => (s.match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1];

/* ---- CSS minify (comments, whitespace) ---- */
const css = readFileSync(join(root, 'assets/css/style.css'), 'utf8');
const minCss = css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([{}:;,>])\s*/g, '$1')
  .replace(/;}/g, '}')
  .trim();
writeFileSync(join(root, 'assets/css/style.min.css'), minCss);

/* ---- cache-busting version from asset contents ---- */
const hash = createHash('sha1');
for (const f of ['assets/css/style.css', 'assets/js/main.js', 'assets/js/chatbot.js', 'assets/js/scenes.js']) hash.update(readFileSync(join(root, f)));
const version = hash.digest('hex').slice(0, 8);

function img(tag) {
  const name = attr(tag, 'name');
  const dims = images[name];
  if (!dims) throw new Error(`Unknown image: ${name}`);
  const eager = /\beager\b/.test(tag);
  const cls = attr(tag, 'class');
  const sizes = attr(tag, 'sizes') || '(max-width: 900px) 100vw, 50vw';
  const set = [`assets/img/${name}-sm.webp 640w`];
  if (existsSync(join(root, `assets/img/${name}-md.webp`))) set.push(`assets/img/${name}-md.webp 960w`);
  set.push(`assets/img/${name}.webp ${dims[0]}w`);
  return `<img src="assets/img/${name}.webp" srcset="${set.join(', ')}" sizes="${sizes}" width="${dims[0]}" height="${dims[1]}" alt="${attr(tag, 'alt') || ''}"${cls ? ` class="${cls}"` : ''} ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

const pages = readdirSync(join(src, 'pages')).filter((f) => f.endsWith('.html'));
const urls = [];

for (const file of pages) {
  let html = readFileSync(join(src, 'pages', file), 'utf8');
  const m = html.match(/^<!--meta (.*?) -->\s*/s);
  const meta = m ? JSON.parse(m[1]) : {};
  html = html.replace(/^<!--meta .*? -->\s*/s, '');

  const preload = (meta.preload || [])
    .map((p) => `<link rel="preload" as="image" href="${p.href}"${p.srcset ? ` imagesrcset="${p.srcset}" imagesizes="${p.sizes || '100vw'}"` : ''} fetchpriority="high">\n`)
    .join('');

  let page = partial('layout').replace('{{content}}', html);
  page = page.replace(/\{\{> (\w+)\}\}/g, (_, n) => partial(n));
  // nav active state
  page = page.replace(/data-nav="(\w+)"/g, (s, n) => (n === meta.nav ? `${s} aria-current="page"` : s));
  page = page
    .replace(/\{\{title\}\}/g, meta.title || 'HVAC')
    .replace(/\{\{desc\}\}/g, meta.desc || '')
    .replace(/\{\{page\}\}/g, meta.nav || '')
    .replace(/\{\{url\}\}/g, `${SITE}/${file === 'index.html' ? '' : file}`)
    .replace(/\{\{year\}\}/g, String(new Date().getFullYear()))
    .replace(/\{\{preload\}\}/g, preload)
    .replace(/\{\{v\}\}/g, version)
    .replace(/<x-img\b[^>]*>/g, img);

  writeFileSync(join(root, file), page);
  if (file !== '404.html') urls.push(`${SITE}/${file === 'index.html' ? '' : file}`);
  console.log('built', file);
}

writeFileSync(
  join(root, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${u}</loc></url>`)
    .join('\n')}\n</urlset>\n`
);
console.log(`built sitemap.xml · style.min.css ${Math.round(minCss.length / 1024)}KB (from ${Math.round(css.length / 1024)}KB) · v=${version}`);
