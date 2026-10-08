/* =========================================================
   HVAC — Three.js scenes (lazy-loaded ES module)
   morph : particle cloud morphing between HVAC icons (auto-cycles)
   house : cut-away home with air flowing through ducts (drag to orbit)
   ========================================================= */
import * as THREE from '../vendor/three.module.min.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const COLORS = {
  cool: new THREE.Color(0x8be8ff),
  heat: new THREE.Color(0xff8a3d),
  lime: new THREE.Color(0xc6f432),
};
const currentMode = () => document.documentElement.dataset.mode || 'cool';

export function mount(canvas, opts = {}) {
  const scenes = { morph: morphScene, house: houseScene };
  const fn = scenes[canvas.dataset.scene];
  if (fn) fn(canvas, opts);
}

/* ---------- shared renderer / loop ---------- */
function base(canvas, { fov = 35, z = 10 } = {}) {
  const mobile = innerWidth < 768;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
  camera.position.z = z;

  const size = { w: 1, h: 1 };
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    size.w = w; size.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  // pointer (-1..1 relative to canvas), plus drag-to-rotate
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, drag: 0, dragV: 0, down: false, lastX: 0 };
  addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1.5, 1.5);
    pointer.ty = clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -1.5, 1.5);
    if (pointer.down) {
      const dx = e.clientX - pointer.lastX;
      pointer.dragV = dx * 0.008;
      pointer.drag += pointer.dragV;
      pointer.lastX = e.clientX;
    }
  }, { passive: true });
  const host = canvas.parentElement;
  host.addEventListener('pointerdown', (e) => { pointer.down = true; pointer.lastX = e.clientX; });
  addEventListener('pointerup', () => { pointer.down = false; });
  addEventListener('pointercancel', () => { pointer.down = false; });

  const loop = (fn) => {
    const clock = new THREE.Clock();
    let t = 0;
    const tick = () => {
      requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (!visible || document.hidden) return;
      t += dt;
      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;
      if (!pointer.down) { pointer.dragV *= 0.94; pointer.drag += pointer.dragV; }
      fn(dt, t);
      renderer.render(scene, camera);
    };
    tick();
  };
  return { renderer, scene, camera, pointer, loop, mobile, size };
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/* =========================================================
   SHAPES for the morph scene (points sampled on outlines)
   ========================================================= */
function sampleSegments(segs, n, { jitter = 0.04, depth = 0.25 } = {}) {
  const lens = segs.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1], (b[2] || 0) - (a[2] || 0)));
  const total = lens.reduce((s, l) => s + l, 0);
  const cum = [];
  lens.reduce((s, l, i) => (cum[i] = s + l), 0);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = Math.random() * total;
    let k = cum.findIndex((c) => c >= r);
    if (k < 0) k = segs.length - 1;
    const [a, b] = segs[k];
    const t = Math.random();
    out[i * 3] = a[0] + (b[0] - a[0]) * t + (Math.random() - 0.5) * jitter;
    out[i * 3 + 1] = a[1] + (b[1] - a[1]) * t + (Math.random() - 0.5) * jitter;
    out[i * 3 + 2] = (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * t + (Math.random() - 0.5) * depth;
  }
  return out;
}
const poly = (pts, closed = false) => {
  const s = [];
  for (let i = 0; i < pts.length - 1; i++) s.push([pts[i], pts[i + 1]]);
  if (closed) s.push([pts[pts.length - 1], pts[0]]);
  return s;
};
const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

const SHAPES = {
  snowflake(n) {
    const segs = [];
    const R = 2.5;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const arm = (p) => rot(p, a);
      segs.push([arm([0, 0]), arm([0, R])]);
      [[0.42, 0.42], [0.68, 0.3], [0.86, 0.18]].forEach(([d, l]) => {
        const base = [0, R * d];
        segs.push([arm(base), arm([-R * l * Math.sin(Math.PI / 3), R * d + R * l * Math.cos(Math.PI / 3)])]);
        segs.push([arm(base), arm([R * l * Math.sin(Math.PI / 3), R * d + R * l * Math.cos(Math.PI / 3)])]);
      });
    }
    const hex = Array.from({ length: 6 }, (_, i) => rot([0, R * 0.26], (i * Math.PI) / 3 + Math.PI / 6));
    segs.push(...poly(hex, true));
    return sampleSegments(segs, n, { jitter: 0.06, depth: 0.35 });
  },
  flame(n) {
    const out = new Float32Array(n * 3);
    const c = -0.85, R = 1.45, tip = 2.55;
    const width = (y) => (y <= c ? Math.sqrt(Math.max(0, R * R - (y - c) * (y - c))) : R * Math.pow(1 - (y - c) / (tip - c), 1.35));
    for (let i = 0; i < n; i++) {
      const inner = Math.random() < 0.28;
      const sc = inner ? 0.48 : 1;
      let y, w;
      do { y = c - R + Math.random() * (tip - c + R); w = width(y); } while (Math.random() * R > w);
      const th = Math.random() * Math.PI * 2;
      const lean = 0.35 * Math.sin((y - c) * 1.7) * clamp((y - c) / (tip - c));
      const rr = w * (0.92 + Math.random() * 0.08);
      out[i * 3] = (Math.cos(th) * rr + lean) * sc;
      out[i * 3 + 1] = y * sc + (inner ? -0.55 : 0);
      out[i * 3 + 2] = Math.sin(th) * rr * 0.55 * sc;
    }
    return out;
  },
  leaf(n) {
    const pts = [];
    const L = 2.4;
    for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([1.45 * Math.sin(Math.PI * t) * (1 - 0.25 * t), -L + 2 * L * t]); }
    for (let i = 40; i >= 0; i--) { const t = i / 40; pts.push([-1.45 * Math.sin(Math.PI * t) * (1 - 0.25 * t), -L + 2 * L * t]); }
    const segs = poly(pts);
    segs.push([[0, -L - 0.6], [0, L * 0.92]]); // midrib + stem
    for (let k = 1; k <= 5; k++) {
      const y = -L + (2 * L * k) / 6.2;
      const w = 1.45 * Math.sin(Math.PI * ((y + L) / (2 * L))) * 0.82;
      segs.push([[0, y], [w, y + 0.55]]);
      segs.push([[0, y], [-w, y + 0.55]]);
    }
    const out = sampleSegments(segs, n, { jitter: 0.05, depth: 0.2 });
    for (let i = 0; i < n; i++) out[i * 3 + 2] += 0.18 * out[i * 3] * out[i * 3]; // gentle curl
    // rotate the leaf 35°
    for (let i = 0; i < n; i++) { const [x, y] = rot([out[i * 3], out[i * 3 + 1]], -0.6); out[i * 3] = x; out[i * 3 + 1] = y; }
    return out;
  },
  house(n) {
    const w = 1.9, d = 1.4, y0 = -2.0, y1 = 0.2, ridge = 1.75;
    const P = (x, y, z) => [x, y, z];
    const segs = [];
    const box = [[-w, -d], [w, -d], [w, d], [-w, d]];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = box[i], [bx, bz] = box[(i + 1) % 4];
      segs.push([P(ax, y0, az), P(bx, y0, bz)], [P(ax, y1, az), P(bx, y1, bz)], [P(ax, y0, az), P(ax, y1, az)]);
    }
    // roof (gable along x)
    segs.push([P(-w - 0.2, ridge, 0), P(w + 0.2, ridge, 0)]);
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => segs.push([P(sx * (w + 0.2), ridge, 0), P(sx * (w + 0.2), y1 - 0.15, sz * (d + 0.3))])));
    segs.push([P(-w - 0.2, y1 - 0.15, d + 0.3), P(w + 0.2, y1 - 0.15, d + 0.3)], [P(-w - 0.2, y1 - 0.15, -d - 0.3), P(w + 0.2, y1 - 0.15, -d - 0.3)]);
    // door + windows on front (z = d)
    segs.push(...poly([P(-0.35, y0, d), P(-0.35, -0.9, d), P(0.35, -0.9, d), P(0.35, y0, d)]));
    [[-1.35], [0.85]].forEach(([x]) => segs.push(...poly([P(x, -1.2, d), P(x + 0.5, -1.2, d), P(x + 0.5, -0.5, d), P(x, -0.5, d)], true)));
    // chimney
    segs.push(...poly([P(1.0, 1.15, -0.5), P(1.0, 2.0, -0.5), P(1.4, 2.0, -0.5), P(1.4, 0.85, -0.5)]));
    // outdoor AC unit
    segs.push(...poly([P(w + 0.4, y0, 0.2), P(w + 1.2, y0, 0.2), P(w + 1.2, -1.3, 0.2), P(w + 0.4, -1.3, 0.2)], true));
    const out = sampleSegments(segs, n, { jitter: 0.035, depth: 0.04 });
    for (let i = 0; i < n; i++) out[i * 3 + 1] += 0.2;
    return out;
  },
  shield(n) {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const x = -1.9 + 3.8 * t;
      pts.push([x, 1.8 + 0.25 * Math.cos(Math.PI * (x / 1.9))]);
    }
    for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([1.9 * (1 - t) * Math.cos(t * 0.9), 1.8 - 4.4 * Math.pow(t, 1.1)]); }
    for (let i = 40; i >= 0; i--) { const t = i / 40; pts.push([-1.9 * (1 - t) * Math.cos(t * 0.9), 1.8 - 4.4 * Math.pow(t, 1.1)]); }
    const segs = poly(pts, true);
    segs.push([[-0.85, -0.1], [-0.2, -0.8]], [[-0.2, -0.8], [1.0, 0.75]]);
    return sampleSegments(segs, n, { jitter: 0.06, depth: 0.3 });
  },
  fan(n) {
    const segs = [];
    const ring = Array.from({ length: 64 }, (_, i) => [2.5 * Math.cos((i / 64) * Math.PI * 2), 2.5 * Math.sin((i / 64) * Math.PI * 2)]);
    segs.push(...poly(ring, true));
    const hub = Array.from({ length: 20 }, (_, i) => [0.35 * Math.cos((i / 20) * Math.PI * 2), 0.35 * Math.sin((i / 20) * Math.PI * 2)]);
    segs.push(...poly(hub, true));
    const blade = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24; blade.push([-0.25 - 0.75 * Math.sin(Math.PI * t) + 0.3 * t, 0.35 + 1.95 * t]); }
    for (let i = 24; i >= 0; i--) { const t = i / 24; blade.push([0.25 + 0.6 * Math.sin(Math.PI * t) - 0.2 * t, 0.35 + 1.95 * t]); }
    for (let b = 0; b < 3; b++) segs.push(...poly(blade.map((p) => rot(p, (b * Math.PI * 2) / 3))));
    return sampleSegments(segs, n, { jitter: 0.05, depth: 0.3 });
  },
};
const SHAPE_COLORS = {
  snowflake: [0x8be8ff, 0xffffff],
  flame: [0xff7a2f, 0xffd166],
  leaf: [0xc6f432, 0x6fdc8c],
  house: [0xc6f432, 0xffffff],
  shield: [0xc6f432, 0xe9ffd1],
  fan: [0xc6f432, 0x8be8ff],
};

/* =========================================================
   MORPH SCENE
   ========================================================= */
function morphScene(canvas, { reduced }) {
  const { scene, camera, pointer, loop, mobile } = base(canvas, { fov: 35, z: 12 });
  const names = (canvas.dataset.shapes || 'snowflake,flame,leaf,house').split(',').map((s) => s.trim()).filter((s) => SHAPES[s]);
  const N = mobile ? 2600 : 5200;
  const shapes = names.map((nm) => SHAPES[nm](N));
  const cols = names.map((nm) => SHAPE_COLORS[nm].map((c) => new THREE.Color(c)));

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(shapes[0].slice(), 3));
  geo.setAttribute('aTo', new THREE.BufferAttribute((shapes[1] || shapes[0]).slice(), 3));
  const rnd = new Float32Array(N);
  for (let i = 0; i < N; i++) rnd[i] = Math.random();
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));

  const uniforms = {
    uMix: { value: 0 },
    uTime: { value: 0 },
    uSize: { value: mobile ? 52 : 60 },
    uPR: { value: Math.min(devicePixelRatio, 2) },
    uA1: { value: cols[0][0].clone() }, uA2: { value: cols[0][1].clone() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aTo; attribute float aRand;
      uniform float uMix, uTime, uSize, uPR;
      varying float vR; varying float vA;
      void main(){
        float d = clamp((uMix - aRand * 0.35) / 0.65, 0.0, 1.0);
        d = d * d * (3.0 - 2.0 * d);
        vec3 p = mix(position, aTo, d);
        float k = sin(d * 3.14159);
        p += k * vec3(sin(aRand * 40.0 + uTime), cos(aRand * 31.0 + uTime * 1.3), sin(aRand * 17.0 + uTime * 0.7)) * 0.9;
        p += 0.035 * vec3(sin(uTime * 1.2 + aRand * 20.0), cos(uTime + aRand * 15.0), sin(uTime * 0.8 + aRand * 9.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPR * (0.45 + aRand * 0.75) / -mv.z;
        vR = aRand; vA = 0.45 + 0.55 * aRand;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uA1, uA2;
      varying float vR; varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(mix(uA1, uA2, vR), a * vA);
      }`,
  });
  const group = new THREE.Group();
  const points = new THREE.Points(geo, mat);
  group.add(points);
  scene.add(group);

  // ambient dust
  const dustN = mobile ? 150 : 300;
  const dpos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dpos[i * 3] = (Math.random() - 0.5) * 18; dpos[i * 3 + 1] = (Math.random() - 0.5) * 10; dpos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 2; }
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dust = new THREE.Points(dgeo, new THREE.PointsMaterial({ size: 0.05, map: dotTexture(), color: 0xc6f432, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  let seg = 0;
  const setSeg = (i) => {
    seg = i;
    geo.attributes.position.array.set(shapes[i]);
    geo.attributes.aTo.array.set(shapes[Math.min(i + 1, shapes.length - 1)]);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aTo.needsUpdate = true;
  };
  const tmp1 = new THREE.Color(), tmp2 = new THREE.Color();
  const HOLD = 3.2, MORPH = 1.8;

  loop((dt, t) => {
    uniforms.uTime.value = t;
    const cycle = HOLD + MORPH;
    const tt = (reduced ? 0 : t) % (cycle * names.length);
    const i = Math.floor(tt / cycle);
    let s = i + smooth(HOLD, cycle, tt - i * cycle);
    if (s >= names.length) s = 0;
    if (names.length < 2) s = 0;
    // the last shape morphs back to the first
    const idx = Math.floor(s);
    const frac = s - idx;
    if (idx === names.length - 1) {
      if (seg !== -1) {
        geo.attributes.position.array.set(shapes[idx]);
        geo.attributes.aTo.array.set(shapes[0]);
        geo.attributes.position.needsUpdate = geo.attributes.aTo.needsUpdate = true;
        seg = -1;
      }
    } else if (idx !== seg) setSeg(Math.min(idx, names.length - 1));
    uniforms.uMix.value = frac;
    const nextIdx = (idx + 1) % names.length;
    tmp1.copy(cols[idx][0]).lerp(cols[nextIdx][0], frac);
    tmp2.copy(cols[idx][1]).lerp(cols[nextIdx][1], frac);
    uniforms.uA1.value.copy(tmp1);
    uniforms.uA2.value.copy(tmp2);

    // fit to viewport (narrow screens)
    const halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z * camera.aspect;
    group.scale.setScalar(Math.min(1, (halfW * 0.82) / 2.7));
    group.rotation.y = Math.sin(t * 0.3) * 0.45 + pointer.x * 0.35 + pointer.drag;
    group.rotation.x = -pointer.y * 0.2 + Math.sin(t * 0.25) * 0.08;
    if (!pointer.down) pointer.drag *= 0.96;
    dust.rotation.y = t * 0.02;
  });
  canvas.classList.add('is-live');
}

/* =========================================================
   HOUSE SCENE — how air moves through a home
   ========================================================= */
function houseScene(canvas, { reduced }) {
  const { scene, camera, pointer, loop, mobile } = base(canvas, { fov: 32, z: 14 });
  camera.position.set(0, 3.2, 13.5);
  camera.lookAt(0, -0.4, 0);
  const world = new THREE.Group();
  scene.add(world);
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dl = new THREE.DirectionalLight(0xffffff, 1.6);
  dl.position.set(5, 8, 6);
  scene.add(dl);

  const W = 2.6, D = 2.0, Y0 = -1.9, Y1 = 0.5, RIDGE = 2.0;
  // translucent walls
  const wallMat = new THREE.MeshBasicMaterial({ color: 0x1b6a3e, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  const walls = new THREE.Mesh(new THREE.BoxGeometry(W * 2, Y1 - Y0, D * 2), wallMat);
  walls.position.y = (Y0 + Y1) / 2;
  world.add(walls);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xc6f432, transparent: true, opacity: 0.85 });
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(walls.geometry), edgeMat);
  edges.position.copy(walls.position);
  world.add(edges);
  // roof
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-D - 0.3, 0);
  roofShape.lineTo(0, RIDGE - Y1);
  roofShape.lineTo(D + 0.3, 0);
  roofShape.lineTo(-D - 0.3, 0);
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: W * 2 + 0.4, bevelEnabled: false });
  roofGeo.translate(0, 0, -(W * 2 + 0.4) / 2);
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshBasicMaterial({ color: 0x0f3d26, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  roof.rotation.y = Math.PI / 2;
  roof.position.y = Y1;
  world.add(roof);
  const roofEdges = new THREE.LineSegments(new THREE.EdgesGeometry(roofGeo), edgeMat);
  roofEdges.rotation.copy(roof.rotation);
  roofEdges.position.copy(roof.position);
  world.add(roofEdges);
  // interior floor divider (two rooms)
  const divGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.2, Y0, -D), new THREE.Vector3(0.2, Y1, -D), new THREE.Vector3(0.2, Y1, D), new THREE.Vector3(0.2, Y0, D)]);
  world.add(new THREE.Line(divGeo, new THREE.LineBasicMaterial({ color: 0xc6f432, transparent: true, opacity: 0.3 })));

  // ground grid
  const grid = new THREE.GridHelper(16, 32, 0x2f7a50, 0x1b4d33);
  grid.position.y = Y0 - 0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.45;
  world.add(grid);

  // equipment
  const unitMat = new THREE.MeshStandardMaterial({ color: 0xe9efe8, metalness: 0.5, roughness: 0.35 });
  const outdoor = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 1.1), unitMat);
  outdoor.position.set(W + 1.4, Y0 + 0.5, 0.6);
  world.add(outdoor);
  const fanTop = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.03, 0.18), new THREE.MeshStandardMaterial({ color: 0x0f3d26 }));
    b.rotation.y = (i * Math.PI) / 3;
    fanTop.add(b);
  }
  fanTop.position.set(outdoor.position.x, Y0 + 1.03, outdoor.position.z);
  world.add(fanTop);
  const handler = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.8), new THREE.MeshStandardMaterial({ color: 0xc6f432, metalness: 0.3, roughness: 0.45 }));
  handler.position.set(-1.8, Y0 + 0.55, -1.1);
  world.add(handler);

  // ducts & flows
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const routes = [
    { kind: 'supply', pts: [V(-1.8, Y0 + 1.1, -1.1), V(-1.8, Y1 - 0.15, -1.1), V(-0.6, Y1 - 0.2, -0.4), V(1.4, Y1 - 0.2, -0.2), V(1.6, Y1 - 0.5, 0.6)] },
    { kind: 'supply', pts: [V(-1.8, Y1 - 0.15, -1.1), V(-2.1, Y1 - 0.2, 0.2), V(-1.4, Y1 - 0.45, 1.1)] },
    { kind: 'return', pts: [V(1.5, Y0 + 0.15, 1.2), V(0.6, Y0 + 0.12, 0.4), V(-0.8, Y0 + 0.12, -0.6), V(-1.5, Y0 + 0.4, -1.1)] },
    { kind: 'refrig', pts: [V(W + 1.0, Y0 + 0.3, 0.6), V(W + 0.2, Y0 + 0.2, 0.2), V(0.8, Y0 + 0.08, -1.6), V(-1.4, Y0 + 0.3, -1.4)] },
  ];
  const tubeMat = new THREE.MeshBasicMaterial({ color: 0x8fb89e, transparent: true, opacity: 0.22, depthWrite: false });
  const flows = [];
  const tex = dotTexture();
  routes.forEach((r) => {
    const curve = new THREE.CatmullRomCurve3(r.pts);
    world.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, r.kind === 'refrig' ? 0.04 : 0.11, 8), tubeMat));
    const samples = curve.getSpacedPoints(240);
    const M = mobile ? 45 : 80;
    const off = Float32Array.from({ length: M }, () => Math.random());
    const pos = new Float32Array(M * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size: r.kind === 'refrig' ? 0.12 : 0.2, map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff });
    world.add(new THREE.Points(g, m));
    flows.push({ r, samples, off, pos, g, m, speed: r.kind === 'refrig' ? 0.12 : 0.2 });
  });
  // room air clouds (vents pushing conditioned air)
  const cloudN = mobile ? 120 : 220;
  const cpos = new Float32Array(cloudN * 3);
  const cdata = Array.from({ length: cloudN }, () => ({ room: Math.random() < 0.5 ? 0 : 1, t: Math.random(), x: Math.random(), z: Math.random() }));
  const cgeo = new THREE.BufferGeometry();
  cgeo.setAttribute('position', new THREE.BufferAttribute(cpos, 3));
  const cmat = new THREE.PointsMaterial({ size: 0.14, map: tex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  world.add(new THREE.Points(cgeo, cmat));

  const supply = (currentMode() === 'heat' ? COLORS.heat : COLORS.cool).clone();
  let target = supply.clone();
  addEventListener('hvac:mode', (e) => { target = (e.detail === 'heat' ? COLORS.heat : COLORS.cool).clone(); });
  const returnCol = new THREE.Color(0xffc56b);

  world.rotation.y = -0.6;
  loop((dt, t) => {
    // pull the camera back on tall/narrow viewports so the whole house fits
    const k = Math.max(1, 1.35 / camera.aspect);
    camera.position.set(0, 3.2 * k, 13.5 * k);
    camera.lookAt(0, -0.4, 0);
    supply.lerp(target, 0.04);
    if (!reduced) world.rotation.y += dt * 0.12;
    world.rotation.y += pointer.dragV * 0.5;
    world.rotation.x = 0.05 - pointer.y * 0.08;
    fanTop.rotation.y -= dt * 8;
    flows.forEach((f) => {
      const n = f.samples.length - 1;
      for (let i = 0; i < f.off.length; i++) {
        const u = (f.off[i] + t * f.speed) % 1;
        const p = f.samples[Math.floor(u * n)];
        f.pos[i * 3] = p.x; f.pos[i * 3 + 1] = p.y; f.pos[i * 3 + 2] = p.z;
      }
      f.g.attributes.position.needsUpdate = true;
      f.m.color.copy(f.r.kind === 'supply' ? supply : f.r.kind === 'return' ? returnCol : COLORS.lime);
    });
    cmat.color.copy(supply);
    for (let i = 0; i < cloudN; i++) {
      const c = cdata[i];
      c.t += dt * 0.18;
      if (c.t > 1) { c.t = 0; c.x = Math.random(); c.z = Math.random(); }
      const x0 = c.room ? 1.6 : -1.4, z0 = c.room ? 0.6 : 1.1;
      cpos[i * 3] = x0 + (c.x - 0.5) * 2.2 * c.t;
      cpos[i * 3 + 1] = Y1 - 0.5 - c.t * 2.0;
      cpos[i * 3 + 2] = z0 - c.z * 1.4 * c.t;
    }
    cgeo.attributes.position.needsUpdate = true;
  });
  canvas.classList.add('is-live');
}
