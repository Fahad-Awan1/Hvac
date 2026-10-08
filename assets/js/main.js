/* =========================================================
   HVAC — core interactions
   One rAF loop drives smooth scroll and every scroll-linked effect.
   Performance rules used throughout:
   • layout is measured once (load / resize) and cached — never per frame
   • scroll effects only run on frames where the scroll position changed
   • marquees are pure CSS animations (compositor, no main-thread work)
   • Three.js and non-critical images load after the page is interactive
   ========================================================= */
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const nf = new Intl.NumberFormat('en-US'); // reused: toLocaleString() per frame is slow
  const VERSION = (document.currentScript && new URL(document.currentScript.src).searchParams.get('v')) || ''; // cache-bust for scenes.js
  const store = {
    get: (k, s = sessionStorage) => { try { return s.getItem(k); } catch { return null; } },
    set: (k, v, s = sessionStorage) => { try { s.setItem(k, v); } catch { /* storage blocked */ } },
  };
  const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const whenIdle = (fn, timeout = 1500) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 200));
  const afterLoad = (fn) => (document.readyState === 'complete' ? fn() : addEventListener('load', fn, { once: true }));

  /* ---------- Layout cache ---------- */
  let vh = innerHeight;
  let vw = innerWidth;
  let desktop = vw > 900;
  const sizers = [];   // change element sizes (run first)
  const measures = []; // read positions (run after sizers)
  const docTop = (el) => { let t = 0; for (let n = el; n; n = n.offsetParent) t += n.offsetTop; return t; };
  let force = true;
  function remeasure() {
    vh = innerHeight; vw = innerWidth; desktop = vw > 900;
    sizers.forEach((f) => f());
    measures.forEach((f) => f());
    force = true;
  }
  addEventListener('resize', debounce(remeasure), { passive: true });
  afterLoad(remeasure);
  if ('ResizeObserver' in window) new ResizeObserver(debounce(remeasure, 250)).observe(document.body);

  /* ---------- Smooth scroll ---------- */
  // Lenis only smooths wheel/trackpad input; on touch devices native scrolling is smoother and cheaper.
  let lenis = null;
  if (window.Lenis && !reduced && finePointer) {
    lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1 });
    window.__lenis = lenis;
  }
  const scrollToEl = (el) => {
    if (!el) return;
    // respect each section's scroll-margin-top (e.g. service blocks sit below the sticky header + sub-nav)
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 100;
    if (lenis) lenis.scrollTo(el, { offset: -margin, duration: 1.2 });
    else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - margin, behavior: reduced ? 'auto' : 'smooth' });
  };

  /* ---------- Main loop ---------- */
  const tickers = new Set();       // run every frame (cursor)
  const scrollTickers = new Set(); // run only when the scroll position changed
  let scrollY = window.scrollY;
  // Native scroll: read window.scrollY only after a scroll event (idle frames do no DOM reads).
  // Lenis: use its own animated value (no DOM read at all).
  let scrollDirty = true;
  addEventListener('scroll', () => { scrollDirty = true; }, { passive: true });
  const readScroll = () => {
    if (lenis && typeof lenis.animatedScroll === 'number') return lenis.animatedScroll;
    if (!scrollDirty) return scrollY;
    scrollDirty = false;
    return window.scrollY;
  };
  function frame(t) {
    if (lenis) lenis.raf(t);
    const y = readScroll();
    if (y !== scrollY || force) {
      scrollY = y;
      force = false;
      scrollTickers.forEach((fn) => fn());
    }
    tickers.forEach((fn) => fn(t));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---------- Preloader & page entry ---------- */
  function intro() {
    root.classList.add('ready');
    window.dispatchEvent(new Event('hvac:ready'));
    if (root.classList.contains('is-entering')) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        root.classList.add('is-entered');
        root.classList.remove('is-entering');
      }));
    }
    initReveals();
  }

  const pre = $('.preloader');
  if (pre && !root.classList.contains('no-preload')) {
    const num = $('.preloader__num', pre);
    const bar = $('.preloader__bar', pre);
    const imgs = $$('img[fetchpriority="high"]');
    let loaded = 0;
    const total = imgs.length + 1;
    const bump = () => { loaded++; };
    imgs.forEach((im) => (im.complete ? bump() : (im.addEventListener('load', bump, { once: true }), im.addEventListener('error', bump, { once: true }))));
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(bump);
    const start = performance.now();
    let shown = 0, finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(backstop);
      num.textContent = '100';
      store.set('hvac-loaded', '1');
      pre.classList.add('is-done');
      setTimeout(intro, 250);
      setTimeout(() => pre.remove(), 1100);
    };
    // timer backstop: finishes even if animation frames are paused (e.g. a background tab)
    const backstop = setTimeout(finish, 2600);
    const tick = () => {
      if (finished) return;
      const elapsed = performance.now() - start;
      // short by design: at least 0.6s for the animation, never more than 2s
      const target = Math.min(loaded / total, elapsed / 600) * 100;
      const cap = elapsed > 2000 ? 100 : target;
      shown = lerp(shown, cap, 0.2);
      if (cap >= 100 && shown > 99.4) shown = 100;
      num.textContent = Math.round(shown);
      bar.style.strokeDashoffset = 553 - (553 * shown) / 100;
      if (shown < 100) return requestAnimationFrame(tick);
      finish();
    };
    requestAnimationFrame(tick);
  } else {
    pre?.remove();
    intro();
  }

  /* ---------- Page transitions ---------- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    // placeholder links (href="#") do nothing
    if (a.getAttribute('href') === '#') { e.preventDefault(); return; }
    // same-page anchors → smooth scroll (never a full reload)
    if (url.pathname === location.pathname && url.search === location.search) {
      const el = url.hash.length > 1 && document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (el) { e.preventDefault(); closeMenu(); scrollToEl(el); history.replaceState(null, '', url.hash); }
      return;
    }
    if (reduced) return;
    e.preventDefault();
    closeMenu();
    store.set('hvac-pt', '1');
    root.classList.add('is-leaving');
    setTimeout(() => { location.href = url.href; }, 360);
  });
  addEventListener('pageshow', (e) => { if (e.persisted) root.classList.remove('is-leaving', 'is-entering'); });

  /* ---------- Prefetch internal pages (hover / touch, and nav links when idle) ---------- */
  const prefetched = new Set([location.pathname]);
  const saveData = navigator.connection && (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType || ''));
  const prefetch = (href) => {
    const url = new URL(href, location.href);
    if (saveData || url.origin !== location.origin || !/\.html$|\/$/.test(url.pathname) || prefetched.has(url.pathname)) return;
    prefetched.add(url.pathname);
    const l = document.createElement('link');
    l.rel = 'prefetch';
    l.href = url.pathname;
    document.head.appendChild(l);
  };
  const onIntent = (e) => { const a = e.target.closest && e.target.closest('a[href]'); if (a) prefetch(a.href); };
  document.addEventListener('pointerover', onIntent, { passive: true });
  document.addEventListener('touchstart', onIntent, { passive: true });
  afterLoad(() => setTimeout(() => whenIdle(() => $$('.nav a[href]').forEach((a) => prefetch(a.href)), 3000), 1500));
  // arriving with a hash → scroll after layout settles
  if (location.hash) {
    addEventListener('load', () => setTimeout(() => scrollToEl(document.getElementById(location.hash.slice(1))), 300));
  }

  /* ---------- Header ---------- */
  const header = $('.header');
  if (header) {
    let lastY = 0, scrolled = null, hidden = false;
    scrollTickers.add(() => {
      const s = scrollY > 30;
      if (s !== scrolled) { scrolled = s; header.classList.toggle('is-scrolled', s); }
      let h = hidden;
      if (root.classList.contains('menu-open') || scrollY < 300) h = false;
      else if (scrollY > lastY + 6) h = true;
      else if (scrollY < lastY - 6) h = false;
      if (h !== hidden) { hidden = h; header.classList.toggle('is-hidden', h); }
      if (Math.abs(scrollY - lastY) > 6) lastY = scrollY;
    });
  }

  /* ---------- Mobile menu ---------- */
  const burger = $('.burger');
  const menu = $('#menu');
  function closeMenu() {
    if (!root.classList.contains('menu-open')) return;
    root.classList.remove('menu-open');
    burger?.setAttribute('aria-expanded', 'false');
    menu?.setAttribute('aria-hidden', 'true');
    lenis?.start();
  }
  burger?.addEventListener('click', () => {
    const open = !root.classList.contains('menu-open');
    root.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.setAttribute('aria-hidden', String(!open));
    open ? lenis?.stop() : lenis?.start();
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); closeDropdowns(); } });

  /* ---------- Services sub-menus ---------- */
  // phone menu: the Services row expands/collapses its list of services
  $$('.menu__row').forEach((btn) => btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    btn.closest('.menu__group').classList.toggle('is-open', open);
  }));
  // desktop dropdown: opens on hover/focus (CSS); on touch screens the first tap opens it instead of navigating
  const navItems = $$('.nav__item');
  function closeDropdowns() {
    navItems.forEach((it) => { it.classList.remove('is-open'); $('.nav__parent', it)?.setAttribute('aria-expanded', 'false'); });
  }
  navItems.forEach((item) => {
    const parent = $('.nav__parent', item);
    item.addEventListener('mouseenter', () => parent.setAttribute('aria-expanded', 'true'));
    item.addEventListener('mouseleave', () => { if (!item.classList.contains('is-open')) parent.setAttribute('aria-expanded', 'false'); });
    parent.addEventListener('click', (e) => {
      if (finePointer || item.classList.contains('is-open')) return; // mouse users (or second tap) go to the page
      e.preventDefault();
      closeDropdowns();
      item.classList.add('is-open');
      parent.setAttribute('aria-expanded', 'true');
    });
    // picking a service closes the panel
    $$('.nav__sub a', item).forEach((a) => a.addEventListener('click', () => { closeDropdowns(); a.blur(); }));
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.nav__item')) closeDropdowns(); });

  /* ---------- Split headings ---------- */
  function split(el) {
    let i = 0;
    const walk = (node, into) => {
      node.childNodes.forEach((n) => {
        if (n.nodeType === 3) {
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) return into.appendChild(document.createTextNode(' '));
            const w = document.createElement('span');
            w.className = 'w';
            const inner = document.createElement('span');
            inner.textContent = part;
            inner.style.setProperty('--i', i++);
            w.appendChild(inner);
            into.appendChild(w);
          });
        } else if (n.nodeName === 'BR') {
          into.appendChild(n.cloneNode());
        } else if (n.nodeType === 1) {
          const c = n.cloneNode(false);
          walk(n, c);
          into.appendChild(c);
        }
      });
    };
    const frag = document.createElement('div');
    walk(el, frag);
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    el.innerHTML = '';
    while (frag.firstChild) el.appendChild(frag.firstChild);
    $$('.w', el).forEach((w) => w.setAttribute('aria-hidden', 'true'));
    el.classList.add('split');
  }
  $$('[data-split]').forEach(split);

  /* ---------- Reveals, counters, bars ---------- */
  function countUp(el) {
    if (el.dataset.counted) return; // may be triggered by its own observer and by a revealed parent
    el.dataset.counted = '1';
    const end = parseFloat(el.dataset.count);
    const dur = 2000;
    const t0 = performance.now();
    const step = (t) => {
      const p = clamp((t - t0) / dur);
      const e = 1 - Math.pow(2, -10 * p);
      el.textContent = nf.format(Math.round(end * (p === 1 ? 1 : e)));
      if (p < 1) requestAnimationFrame(step);
    };
    reduced ? (el.textContent = nf.format(end)) : requestAnimationFrame(step);
  }
  function initReveals() {
    // A fully clipped element can read as non-intersecting, so clip reveals watch their parent instead.
    const targets = new Map();   // observed element → elements it reveals
    const pending = new Set();   // observed elements not yet revealed
    const reveal = (t) => {
      if (!pending.has(t)) return;
      pending.delete(t);
      io.unobserve(t);
      (targets.get(t) || []).forEach((el) => {
        el.classList.add('in');
        $$('[data-count]', el).forEach(countUp);
        if (el.matches('[data-count]')) countUp(el);
        $$('[data-bar]', el).forEach((b) => { b.style.width = b.dataset.bar + '%'; });
      });
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) reveal(en.target); });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    $$('[data-reveal], [data-split], .stat, .bar, [data-count]').forEach((el) => {
      const t = el.matches('[data-reveal="clip"]') ? el.parentElement : el;
      if (!targets.has(t)) targets.set(t, []);
      targets.get(t).push(el);
      pending.add(t);
      io.observe(t);
    });
    // Safety net: if the page jumps past an element (anchor link, fast fling) its observer may never
    // fire — reveal anything already above the bottom of the viewport (cached positions, throttled).
    const tops = new Map();
    const measureTops = () => pending.forEach((t) => tops.set(t, docTop(t)));
    measures.push(measureTops);
    measureTops();
    let lastCheck = 0;
    scrollTickers.add(() => {
      const now = performance.now();
      if (!pending.size || now - lastCheck < 150) return;
      lastCheck = now;
      pending.forEach((t) => { if ((tops.get(t) ?? Infinity) < scrollY + vh * 0.9) reveal(t); });
    });
  }

  /* ---------- Parallax ---------- */
  // Generic helper: cache an element's document position; run `fn(top, height)` on scroll when near the viewport.
  function onScrollWithin(el, fn, margin = 100) {
    const box = { top: 0, h: 0 };
    measures.push(() => { box.top = docTop(el); box.h = el.offsetHeight; });
    scrollTickers.add(() => {
      const rTop = box.top - scrollY; // equivalent of getBoundingClientRect().top, without a layout read
      if (rTop + box.h < -margin || rTop > vh + margin) return;
      fn(rTop, box.h);
    });
  }

  if (!reduced) {
    $$('[data-parallax]').forEach((el) => {
      const k = parseFloat(el.dataset.parallax);
      onScrollWithin(el, (top, h) => { el.style.translate = `0 ${((top + h / 2 - vh / 2) * k).toFixed(1)}px`; });
    });
    // inner image parallax for service blocks
    $$('.svc__media img').forEach((img) => {
      onScrollWithin(img.parentElement, (top, h) => {
        img.style.transform = `translateY(${(-7 + ((top + h / 2 - vh / 2) / vh) * 12).toFixed(2)}%)`;
      }, 0);
    });
  }

  /* ---------- Marquees: pure CSS animation (runs on the compositor) ---------- */
  // Set up lazily, the first time a marquee nears the viewport: sections skipped by content-visibility
  // have no layout yet, and measuring them early returns 0px (which made the strip race).
  const phone = matchMedia('(max-width: 640px)').matches;
  const setupMarquee = (track) => {
    const group = track.firstElementChild;
    const gw = group.scrollWidth;
    if (gw < 50) return false; // not laid out yet — try again on the next intersection
    // repeat the group's items so one group is wider than the screen, then clone it once
    const kids = [...group.children];
    const reps = Math.min(4, Math.ceil((vw * 1.15) / gw)); // just wider than the screen: keeps the GPU layer small
    for (let r = 1; r < reps; r++) kids.forEach((k) => { const c = k.cloneNode(true); c.setAttribute('aria-hidden', 'true'); group.appendChild(c); });
    const clone = group.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.appendChild(clone);
    const speed = parseFloat(track.dataset.speed || '0.8'); // ~px per frame at 60fps
    track.style.setProperty('--marquee-dur', `${((gw * reps) / (Math.abs(speed) * 60)).toFixed(1)}s`);
    track.classList.add('is-marquee');
    if (speed < 0) track.classList.add('is-reverse');
    return true;
  };
  $$('[data-marquee]').forEach((track) => {
    if (!track.firstElementChild || reduced) return;
    if (phone && track.closest('.reviews')) return; // phones: reviews are a swipeable row instead (CSS)
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !track.classList.contains('is-marquee') && !setupMarquee(track)) return;
      // pause when off-screen so the compositor does no work for it
      track.classList.toggle('is-paused', !e.isIntersecting);
    }, { rootMargin: '150px 0px' }).observe(track);
  });

  /* ---------- Custom cursor ---------- */
  if (finePointer && !reduced) {
    const cur = $('.cursor');
    if (cur) {
      root.classList.add('has-cursor');
      const dot = $('.cursor__dot', cur);
      const ring = $('.cursor__ring', cur);
      const label = $('.cursor__label', cur);
      let mx = -100, my = -100, rx = -100, ry = -100;
      addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
      tickers.add(() => {
        if (Math.abs(rx - mx) < 0.1 && Math.abs(ry - my) < 0.1) return; // settled: no DOM writes
        rx = lerp(rx, mx, 0.18); ry = lerp(ry, my, 0.18);
        dot.style.transform = `translate3d(${mx}px,${my}px,0)`;
        ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
      });
      document.addEventListener('pointerover', (e) => {
        const lab = e.target.closest('[data-cursor]');
        const hov = e.target.closest('a, button, input, select, textarea, label, summary, [role="button"]');
        cur.classList.toggle('has-label', !!lab);
        cur.classList.toggle('is-hover', !!hov && !lab);
        label.textContent = lab ? lab.dataset.cursor : '';
      });
      document.addEventListener('pointerleave', () => { mx = my = -100; });
    }
  }

  /* ---------- Magnetic buttons & tilt cards ---------- */
  if (finePointer && !reduced) {
    // rects are measured once on enter, not on every pointermove
    $$('.magnetic').forEach((el) => {
      let r;
      el.addEventListener('pointerenter', () => { el.style.transform = ''; r = el.getBoundingClientRect(); });
      el.addEventListener('pointermove', (e) => {
        if (!r) return;
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * 0.22}px, ${y * 0.3}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; r = null; });
    });
    $$('[data-tilt]').forEach((el) => {
      let r;
      el.addEventListener('pointerenter', () => { r = el.getBoundingClientRect(); });
      el.addEventListener('pointermove', (e) => {
        if (!r) return;
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateX(${(-py * 9).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg) translateZ(0)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ---------- Climate mode switch (services 3D house) ---------- */
  function setMode(mode) {
    root.dataset.mode = mode;
    store.set('hvac-mode', mode, localStorage);
    $$('[data-mode-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modeBtn === mode)));
    window.dispatchEvent(new CustomEvent('hvac:mode', { detail: mode }));
  }
  $$('[data-mode-btn]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.modeBtn)));
  if ($('[data-mode-btn]')) setMode(root.dataset.mode || 'cool');

  /* ---------- Hero thermostat ---------- */
  const thermo = $('[data-thermo]');
  if (thermo) {
    const MIN = 60, MAX = 85, R = 160, C = 200, A0 = -135, A1 = 135;
    const STATES = JSON.parse($('[data-thermo-states]', thermo).textContent);
    const q = (k) => $(`[data-${k}]`, thermo);
    const dial = $('.dial', thermo);
    const hit = q('dial-hit'), knob = q('dial-knob'), prog = q('dial-prog');
    const tempOut = q('dial-temp'), pill = q('dial-state');
    const swap = $('.hero__swap', thermo), title = q('thermo-title'), lead = q('thermo-lead'), cta = q('thermo-cta');
    const bgCold = $('.hero__bg .is-cold', thermo), bgHot = $('.hero__bg .is-hot', thermo);
    // the cold/warm photos aren't needed for first paint: load them once the page is up
    afterLoad(() => whenIdle(() => [bgCold, bgHot].forEach((im) => {
      if (im.dataset.srcset) { im.srcset = im.dataset.srcset; im.removeAttribute('data-srcset'); }
      if (im.dataset.src) { im.src = im.dataset.src; im.removeAttribute('data-src'); }
    }), 800));

    const pt = (deg, r = R) => { const a = (deg * Math.PI) / 180; return [C + r * Math.sin(a), C - r * Math.cos(a)]; };
    const arcD = (() => { const [x0, y0] = pt(A0), [x1, y1] = pt(A1); return `M${x0} ${y0} A${R} ${R} 0 1 1 ${x1} ${y1}`; })();
    q('dial-track').setAttribute('d', arcD);
    prog.setAttribute('d', arcD);
    let ticks = '';
    for (let i = 0; i <= 50; i++) {
      const d = A0 + (i / 50) * 270, major = i % 10 === 0;
      const [x0, y0] = pt(d, 178), [x1, y1] = pt(d, major ? 188 : 184);
      ticks += `<line class="dial__tick${major ? ' is-major' : ''}" x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"/>`;
    }
    q('dial-ticks').innerHTML = ticks;
    [['dial-min', A0], ['dial-max', A1]].forEach(([k, d]) => { const [x, y] = pt(d, 150); q(k).setAttribute('x', x); q(k).setAttribute('y', y + 30); });

    let temp = 72, state = null, swapT;
    const render = (t) => {
      temp = clamp(t, MIN, MAX);
      const k = (temp - MIN) / (MAX - MIN);
      const [x, y] = pt(A0 + k * 270);
      knob.setAttribute('cx', x); knob.setAttribute('cy', y);
      hit.setAttribute('cx', x); hit.setAttribute('cy', y);
      prog.style.strokeDashoffset = 1 - k;
      tempOut.textContent = Math.round(temp);
      // crossfade the photos: cold below 70°, warm above 74°
      bgCold.style.opacity = clamp((70 - temp) / 5).toFixed(3);
      bgHot.style.opacity = clamp((temp - 74) / 5).toFixed(3);

      const s = temp <= 67.5 ? 'cold' : temp >= 74.5 ? 'hot' : 'ok';
      const d = STATES[s];
      hit.setAttribute('aria-valuenow', Math.round(temp));
      hit.setAttribute('aria-valuetext', `${Math.round(temp)} degrees, ${d.pill.toLowerCase()}`);
      if (s === state) return;
      const first = state === null;
      state = s;
      thermo.style.setProperty('--t-accent', d.accent);
      thermo.style.setProperty('--t-dial', d.dial);
      pill.textContent = d.pill;
      const apply = () => {
        title.innerHTML = d.title;
        lead.textContent = d.lead;
        cta.firstElementChild.textContent = d.cta;
        cta.href = d.href;
        swap.classList.remove('is-swapping');
      };
      if (first) return apply();
      swap.classList.add('is-swapping');
      clearTimeout(swapT);
      swapT = setTimeout(apply, 300);
    };
    render(72);

    let dragging = false, touched = false;
    const fromPointer = (e) => {
      const r = dial.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
      const deg = clamp((Math.atan2(x, -y) * 180) / Math.PI, A0, A1);
      render(MIN + ((deg - A0) / 270) * (MAX - MIN));
    };
    dial.addEventListener('pointerdown', (e) => { dragging = touched = true; dial.setPointerCapture(e.pointerId); fromPointer(e); });
    dial.addEventListener('pointermove', (e) => { if (dragging) fromPointer(e); });
    const release = () => { if (dragging) { dragging = false; render(Math.round(temp)); } };
    dial.addEventListener('pointerup', release);
    dial.addEventListener('pointercancel', release);
    hit.addEventListener('keydown', (e) => {
      const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 }[e.key];
      if (!step) return;
      e.preventDefault();
      touched = true;
      render(Math.round(temp) + step);
    });

    // One-time demo sweep after the intro so visitors notice the dial is interactive
    if (!reduced) {
      const demo = [[72, 80, 1400], [80, 63, 2000], [63, 72, 1200]];
      let i = 0;
      const run = () => {
        if (touched || i >= demo.length) return;
        const [a, b, dur] = demo[i++];
        const t0 = performance.now();
        const step = (t) => {
          if (touched) return;
          const p = clamp((t - t0) / dur);
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          render(lerp(a, b, e));
          if (p < 1) requestAnimationFrame(step); else setTimeout(run, 1600);
        };
        requestAnimationFrame(step);
      };
      const start = () => setTimeout(run, 1200);
      root.classList.contains('ready') ? start() : addEventListener('hvac:ready', start, { once: true });
    }
  }

  /* ---------- Horizontal pinned services (desktop) / native swipe (mobile) ---------- */
  const hs = $('[data-hscroll]');
  if (hs) {
    const track = $('.hscroll__track', hs);
    const bar = $('.hscroll__bar span', hs);
    const vp = $('.hscroll__viewport', hs);
    let dist = 0, wasDesktop = null;
    sizers.push(() => {
      if (!desktop) {
        if (wasDesktop !== false) { hs.style.height = ''; track.style.transform = ''; }
        wasDesktop = false;
        return;
      }
      wasDesktop = true;
      dist = Math.max(0, track.scrollWidth - vw);
      hs.style.height = `${dist + vh}px`;
    });
    onScrollWithin(hs, (top, h) => {
      if (!desktop) return;
      const p = clamp(-top / (h - vh || 1));
      track.style.transform = `translate3d(${(-p * dist).toFixed(1)}px,0,0)`;
      bar.style.transform = `scaleX(${p.toFixed(4)})`;
    }, 0);
    // mobile: progress bar follows the native horizontal swipe (scroll event, not per-frame)
    vp.addEventListener('scroll', () => {
      if (desktop) return;
      const max = vp.scrollWidth - vp.clientWidth;
      bar.style.transform = `scaleX(${max > 0 ? (vp.scrollLeft / max).toFixed(4) : 0})`;
    }, { passive: true });
  }

  /* ---------- Process line draw ---------- */
  const pline = $('.process__line');
  if (pline) {
    onScrollWithin(pline, (top) => pline.style.setProperty('--draw', (1 - clamp((vh * 0.9 - top) / (vh * 0.6))).toFixed(3)), 0);
  }

  /* ---------- Timeline fill (about) ---------- */
  const tl = $('.timeline');
  if (tl) {
    onScrollWithin(tl, (top, h) => tl.style.setProperty('--tl', clamp((vh * 0.85 - top) / (h + vh * 0.3)).toFixed(3)), 0);
  }

  /* ---------- Range inputs fill ---------- */
  const paintRange = (inp) => {
    const p = ((inp.value - inp.min) / (inp.max - inp.min)) * 100;
    inp.style.setProperty('--p', p + '%');
  };
  $$('input[type="range"]').forEach((inp) => { paintRange(inp); inp.addEventListener('input', () => paintRange(inp)); });

  const money = (n) => '$' + nf.format(Math.round(n));
  function tweenText(el, to, fmt) {
    const from = parseFloat(el.dataset.v || '0');
    el.dataset.v = to;
    const t0 = performance.now();
    const step = (t) => {
      const p = clamp((t - t0) / 700);
      el.textContent = fmt(lerp(from, to, 1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- Savings calculator ---------- */
  const calc = $('[data-calc="savings"]');
  if (calc) {
    const out = (k) => $(`[data-out="${k}"]`, calc);
    const res = (k) => $(`[data-res="${k}"]`);
    const gauge = $('.gauge__fill');
    const run = () => {
      const bill = +calc.bill.value;
      const age = +calc.age.value;
      const size = +($('input[name="size"]:checked', calc)?.value || 1);
      out('bill').textContent = money(bill);
      out('age').textContent = age + (age === 1 ? ' yr' : ' yrs');
      const oldSeer = Math.max(8, 16 - age * 0.38);  // efficiency loss with age
      const newSeer = 20;
      const hvacShare = 0.48 * size;                 // HVAC ≈ half of a utility bill
      const gain = 1 - oldSeer / newSeer;
      const yearly = bill * 12 * Math.min(hvacShare, 0.6) * gain;
      tweenText(res('yearly'), yearly, money);
      tweenText(res('ten'), yearly * 10 * 1.03, money);
      tweenText(res('gain'), gain * 100, (v) => Math.round(v) + '%');
      tweenText(res('co2'), (yearly / 0.16) * 0.85, (v) => nf.format(Math.round(v)) + ' lbs');
      gauge?.style.setProperty('--g', (1 - clamp(yearly / 2600)).toFixed(3));
    };
    calc.addEventListener('input', run);
    run();
  }

  /* ---------- Financing calculator ---------- */
  const fin = $('[data-calc="finance"]');
  if (fin) {
    const run = () => {
      const amt = +fin.amount.value;
      const months = +fin.term.value;
      const apr = +($('input[name="apr"]:checked', fin)?.value || 0);
      $('[data-out="amount"]', fin).textContent = money(amt);
      $('[data-out="term"]', fin).textContent = months + ' months';
      const r = apr / 100 / 12;
      const pay = r === 0 ? amt / months : (amt * r) / (1 - Math.pow(1 + r, -months));
      tweenText($('[data-res="monthly"]'), pay, (v) => '$' + v.toFixed(0));
      $('[data-res="total"]').textContent = money(pay * months);
    };
    fin.addEventListener('input', run);
    run();
  }

  /* ---------- Billing toggle (plans) ---------- */
  const bill = $('[data-billing]');
  if (bill) {
    bill.addEventListener('click', () => {
      const yearly = bill.getAttribute('aria-checked') !== 'true';
      bill.setAttribute('aria-checked', String(yearly));
      $$('[data-price-m]').forEach((el) => {
        const v = yearly ? +el.dataset.priceY : +el.dataset.priceM;
        tweenText(el, v, (n) => '$' + Math.round(n));
      });
      $$('[data-per]').forEach((el) => { el.textContent = yearly ? '/year' : '/month'; });
    });
  }

  /* ---------- Repair-or-replace quiz ---------- */
  const quiz = $('[data-quiz]');
  if (quiz) {
    const Q = [
      { q: 'How old is your current system?', o: [['Under 8 years', 0], ['8–14 years', 2], ['15+ years', 4]] },
      { q: 'How often has it needed repairs lately?', o: [['Rarely or never', 0], ['Once a year', 2], ['Several times a year', 4]] },
      { q: 'How have your energy bills changed?', o: [['About the same', 0], ['Slowly creeping up', 1], ['Noticeably higher', 3]] },
      { q: 'How comfortable is your home?', o: [['Even and comfortable', 0], ['A few hot or cold rooms', 2], ['Struggles to keep up', 3]] },
      { q: 'Does it use R-22 refrigerant (installed before 2010)?', o: [['No / not sure', 0], ['Yes', 3]] },
    ];
    const card = $('.quiz__card', quiz);
    let i = 0, score = 0;
    const render = () => {
      if (i >= Q.length) return result();
      const it = Q[i];
      card.innerHTML = `<div class="quiz__meta"><span>Question ${i + 1} of ${Q.length}</span><span>${Math.round((i / Q.length) * 100)}%</span></div>
        <div class="quiz__bar"><span style="width:${(i / Q.length) * 100}%"></span></div>
        <p class="quiz__q">${it.q}</p>
        <div class="quiz__opts">${it.o.map((o, k) => `<button type="button" data-k="${k}">${o[0]}</button>`).join('')}</div>`;
    };
    const result = () => {
      const replace = score >= 9;
      const maybe = score >= 5 && !replace;
      const title = replace ? 'Time to replace' : maybe ? 'Repair for now, plan ahead' : 'A repair should do it';
      const text = replace
        ? 'Your system is likely costing more to keep alive than a new high-efficiency unit would. Upgrading could cut energy use by up to 40% and qualify for rebates.'
        : maybe
          ? 'A professional repair and tune-up should restore performance. Start budgeting for a replacement in the next 2–4 years.'
          : 'Your system has plenty of life left. A targeted repair plus routine maintenance will keep it running efficiently.';
      card.innerHTML = `<div class="quiz__result"><div class="quiz__bar"><span style="width:100%"></span></div>
        <span class="chip">Our recommendation</span><h3>${title}</h3><p>${text}</p>
        <a class="btn btn--lime" href="contact.html#book">Book a Free Assessment <svg class="ic"><use href="#i-arrow"/></svg></a>
        <button type="button" class="btn btn--ghost" data-restart>Retake</button></div>`;
    };
    card.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-restart')) { i = 0; score = 0; return render(); }
      score += Q[i].o[+b.dataset.k][1];
      i++;
      render();
    });
    render();
  }

  /* ---------- Services sub-nav highlight ---------- */
  const subLinks = $$('.subnav a');
  if (subLinks.length) {
    const map = new Map(subLinks.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (!en.isIntersecting) return;
        subLinks.forEach((a) => a.classList.remove('is-active'));
        const a = map.get(en.target.id);
        if (a) { a.classList.add('is-active'); a.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---------- Project filters & modal ---------- */
  const filters = $('.filters');
  if (filters) {
    const cards = $$('.pgrid-all .pcard');
    filters.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      $$('button', filters).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const f = b.dataset.filter;
      cards.forEach((c) => {
        const show = f === 'all' || c.dataset.cat === f;
        c.classList.toggle('is-hidden', !show);
        if (show) { c.classList.remove('in'); requestAnimationFrame(() => c.classList.add('in')); }
      });
    });
  }
  const modal = $('.modal');
  if (modal) {
    const box = $('.modal__content', modal);
    let lastFocus;
    const open = (card) => {
      lastFocus = card;
      const d = card.dataset;
      const img = $('img', card);
      box.innerHTML = `<img src="${img.currentSrc || img.src}" alt="${img.alt}">
        <div class="modal__body"><span class="tag">${d.cat}</span><h3 id="modal-title">${$('h3', card).textContent}</h3>
        <p>${d.desc}</p>
        <dl><div><dt>Location</dt><dd>${d.loc}</dd></div><div><dt>Duration</dt><dd>${d.time}</dd></div>
        <div><dt>System</dt><dd>${d.sys}</dd></div><div><dt>Result</dt><dd>${d.result}</dd></div></dl>
        <a href="contact.html#book" class="btn btn--dark">Start a similar project <svg class="ic"><use href="#i-arrow"/></svg></a></div>`;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      lenis?.stop();
      $('.modal__close', modal).focus();
    };
    const close = () => {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      lenis?.start();
      lastFocus?.focus();
    };
    $$('[data-project]').forEach((c) => c.addEventListener('click', (e) => { e.preventDefault(); open(c); }));
    modal.addEventListener('click', (e) => { if (e.target.closest('.modal__close') || e.target.classList.contains('modal__bg')) close(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('is-open')) close(); });
  }

  /* ---------- Before / after ---------- */
  $$('.ba').forEach((ba) => {
    const inp = $('input', ba);
    const set = () => ba.style.setProperty('--pos', inp.value + '%');
    inp.addEventListener('input', set);
    set();
  });

  /* ---------- Forms ---------- */
  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const phoneOk = (v) => v.replace(/\D/g, '').length >= 7;

  $$('[data-form="subscribe"]').forEach((f) => {
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = $('.form-msg', f);
      if (!emailOk(f.email.value.trim())) { msg.className = 'form-msg bad'; msg.textContent = 'Please enter a valid email address.'; return; }
      msg.className = 'form-msg ok';
      msg.textContent = "You're in! Expect seasonal tips & member-only offers.";
      f.reset();
    });
  });

  // Service-area checker
  const area = $('[data-area]');
  if (area) {
    const zips = /^(627\d\d|625\d\d|626\d\d)$/; // demo coverage
    area.addEventListener('submit', (e) => {
      e.preventDefault();
      const z = area.zip.value.trim();
      const out = $('.area__res');
      if (!/^\d{5}$/.test(z)) { out.textContent = 'Please enter a 5-digit ZIP code.'; return; }
      out.textContent = zips.test(z)
        ? `✓ Great news, we serve ${z}! Same-day appointments available.`
        : `We may still be able to help in ${z}. Call (555) 014-2290 to confirm.`;
    });
  }

  // Multi-step booking
  const book = $('[data-booking]');
  if (book) {
    const steps = $$('.bstep', book);
    const dots = $$('.booking__steps li', book.closest('.booking'));
    let cur = 0;
    // build next 7 days + slots
    const days = $('.days', book);
    if (days) {
      const fmtD = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
      const fmtM = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
      const now = new Date();
      days.innerHTML = Array.from({ length: 7 }, (_, k) => {
        const d = new Date(now); d.setDate(now.getDate() + k + 1);
        const label = `${fmtD.format(d)}, ${fmtM.format(d)}`;
        return `<label class="opt"><input type="radio" name="date" value="${label}" ${k === 0 ? 'checked' : ''}><span><small>${fmtD.format(d)}</small><b>${d.getDate()}</b><small>${fmtM.format(d).split(' ')[0]}</small></span></label>`;
      }).join('');
    }
    // preselect service from URL (?service=…)
    const qs = new URLSearchParams(location.search).get('service');
    if (qs && /^[a-z]+$/.test(qs)) { const r = $(`input[name="service"][data-v="${qs}"]`, book); if (r) r.checked = true; }

    const show = (n) => {
      steps[cur].classList.remove('is-current');
      cur = n;
      steps[cur].classList.add('is-current');
      dots.forEach((d, k) => { d.classList.toggle('is-done', k < cur); d.classList.toggle('is-current', k === cur); });
      if (n === steps.length - 1) summary();
      scrollToEl(book.closest('.booking'));
    };
    const validate = () => {
      const st = steps[cur];
      const err = $('.bstep__err', st);
      if (err) err.textContent = '';
      let ok = true;
      $$('[data-req="radio"]', st).forEach((g) => {
        if (!$('input:checked', g)) { ok = false; if (err) err.textContent = 'Please choose an option to continue.'; }
      });
      $$('.field', st).forEach((fd) => {
        const inp = $('input, select, textarea', fd);
        if (!inp || !inp.required) return;
        const v = inp.value.trim();
        let m = '';
        if (!v) m = 'This field is required.';
        else if (inp.type === 'email' && !emailOk(v)) m = 'Enter a valid email.';
        else if (inp.type === 'tel' && !phoneOk(v)) m = 'Enter a valid phone number.';
        fd.classList.toggle('is-invalid', !!m);
        $('.err', fd).textContent = m;
        if (m) ok = false;
      });
      return ok;
    };
    const summary = () => {
      const fd = new FormData(book);
      const rows = [['Service', fd.get('service')], ['Date', fd.get('date')], ['Time', fd.get('time')], ['Name', fd.get('name')], ['Phone', fd.get('phone')], ['Address', fd.get('address')]];
      $('.summary', book).innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${(v || '—').toString().replace(/</g, '&lt;')}</dd></div>`).join('');
    };
    book.addEventListener('click', (e) => {
      if (e.target.closest('[data-next]')) { if (validate()) show(cur + 1); }
      if (e.target.closest('[data-prev]')) show(cur - 1);
    });
    book.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validate()) return;
      const name = (new FormData(book).get('name') || '').toString().split(' ')[0];
      book.innerHTML = `<div class="success"><div class="success__icon"><svg class="ic"><use href="#i-check"/></svg></div>
        <h2>You're booked${name ? ', ' + name.replace(/</g, '') : ''}!</h2>
        <p>We've received your request. A comfort advisor will call within 15 minutes to confirm your arrival window.</p>
        <a href="index.html" class="btn btn--dark">Back to Home <svg class="ic"><use href="#i-arrow"/></svg></a></div>`;
      dots.forEach((d) => { d.classList.add('is-done'); d.classList.remove('is-current'); });
    });
  }

  // Simple contact form
  $$('[data-form="contact"]').forEach((f) => {
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      let ok = true;
      $$('.field', f).forEach((fd) => {
        const inp = $('input, select, textarea', fd);
        if (!inp?.required) return;
        const v = inp.value.trim();
        const m = !v ? 'This field is required.' : inp.type === 'email' && !emailOk(v) ? 'Enter a valid email.' : '';
        fd.classList.toggle('is-invalid', !!m);
        $('.err', fd).textContent = m;
        if (m) ok = false;
      });
      const msg = $('.form-msg', f);
      if (!ok) return;
      msg.className = 'form-msg';
      msg.style.color = 'var(--green-3)';
      msg.textContent = "Thanks! We'll reply within one business hour.";
      f.reset();
    });
  });

  /* ---------- Lazy map ---------- */
  $$('[data-map]').forEach((btn) => btn.addEventListener('click', () => {
    const wrap = btn.closest('.map');
    wrap.innerHTML = `<iframe title="Office location map" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=-89.70%2C39.76%2C-89.60%2C39.82&layer=mapnik&marker=39.7817%2C-89.6501"></iframe>`;
  }));

  /* ---------- Chat openers ---------- */
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-chat]')) window.dispatchEvent(new CustomEvent('hvac:chat-open'));
  });

  /* ---------- Three.js scenes: loaded after the page is interactive, only when near the viewport ---------- */
  const canvases = $$('canvas[data-scene]');
  if (canvases.length) {
    if (!('WebGLRenderingContext' in window)) {
      root.classList.add('no-webgl');
    } else {
      let mod;
      const fail = (err) => { console.warn('3D scene unavailable', err); root.classList.add('no-webgl'); };
      const io = new IntersectionObserver((ents) => {
        ents.forEach((en) => {
          if (!en.isIntersecting) return;
          io.unobserve(en.target);
          (mod ||= import(`./scenes.js?v=${VERSION}`))
            .then((m) => { try { m.mount(en.target, { reduced }); } catch (err) { fail(err); } })
            .catch(fail);
        });
      }, { rootMargin: '200px 0px' });
      afterLoad(() => whenIdle(() => canvases.forEach((c) => io.observe(c)), 1200));
    }
  }

  remeasure(); // initial layout cache (one read pass), refreshed again on load/resize
})();
