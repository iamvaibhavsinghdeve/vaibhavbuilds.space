const SOURCES = [
  new URL('assets/vendor/three.module.min.js', location.href).href,
  'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js',
  'https://unpkg.com/three@0.169.0/build/three.module.js'
];

async function loadThree() {
  for (const url of SOURCES) {
    try {
      return await import(url);
    } catch (err) { /* try next source */ }
  }
  throw new Error('three.js unavailable');
}

const canvas = document.getElementById('stage');
const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const THEME_MS = 7000;

let THREE;
try {
  THREE = await loadThree();
} catch (err) {
  document.body.classList.add('no-3d');
  console.warn('3D scene skipped:', err.message);
}

/* ================= palette ================= */
const PALETTE = {
  light: {
    tileFace: '#ffffff',
    tileEdge: '#dfe6f2',
    body: '#cfd6e4',
    bodyDark: '#9aa5bb',
    dust: '#8fa0bd',
    shadow: 'rgba(23,32,55,0.30)',
    label: '#0d1526',
    dustOpacity: 0.5
  },
  dark: {
    tileFace: '#151d31',
    tileEdge: '#2a3752',
    body: '#8f99ad',
    bodyDark: '#2b3549',
    dust: '#5f74a8',
    shadow: 'rgba(0,0,0,0.62)',
    label: '#e9effc',
    dustOpacity: 0.7
  }
};

const BRANDS = [
  { slug: 'github', label: 'GitHub', color: '#181717' },
  { slug: 'react', label: 'React', color: '#61DAFB' },
  { slug: 'nodedotjs', label: 'Node.js', color: '#5FA04E' },
  { slug: 'mongodb', label: 'MongoDB', color: '#47A248' },
  { slug: 'nextdotjs', label: 'Next.js', color: '#000000' },
  { slug: 'springboot', label: 'Spring Boot', color: '#6DB33F' },
  { slug: 'shopify', label: 'Shopify', color: '#95BF47' },
  { slug: 'wordpress', label: 'WordPress', color: '#21759B' },
  { slug: 'visualstudiocode', label: 'VS Code', color: '#007ACC' },
  { slug: 'tailwindcss', label: 'Tailwind', color: '#06B6D4' }
];

/* tiles arc around the laptop: 5 left, 5 right */
const TILE_LAYOUT_WIDE = [
  [-1.98, 1.42, 0.35], [-2.36, 0.50, -0.15], [-2.46, -0.42, 0.5], [-2.30, -1.34, -0.3], [-1.90, -2.26, 0.2],
  [1.98, 1.54, 0.45], [2.36, 0.62, -0.2], [2.46, -0.30, 0.55], [2.30, -1.22, -0.25], [1.90, -2.14, 0.3]
];

/* phones get a near-square ring so the whole cluster stays inside the band above the copy */
const TILE_LAYOUT_NARROW = [
  [-1.55, 2.05, 0.30], [0.00, 2.48, -0.20], [1.55, 2.05, 0.35],
  [-2.18, 0.60, 0.15], [2.18, 0.60, -0.25],
  [-2.18, -0.60, -0.30], [2.18, -0.60, 0.40],
  [-1.55, -1.95, 0.25], [0.00, -2.42, -0.15], [1.55, -1.95, 0.30]
];

/* ================= colour helpers ================= */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function rgbStr(c) { return `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`; }
function mixRgb(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }
function lum(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
function glyphFor(hex, onDark) {
  if (!onDark) return hex;
  let c = hexToRgb(hex);
  for (let i = 0; i < 14 && lum(c) < 0.72; i++) c = mixRgb(c, [255, 255, 255], 0.14);
  return rgbStr(c);
}

/* ================= textures ================= */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

async function svgToImage(slug) {
  const res = await fetch(`assets/icons/${slug}.svg`);
  const text = await res.text();
  const sized = text.replace('<svg ', '<svg width="512" height="512" ');
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('icon ' + slug));
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(sized)));
  });
}

function glyphTexture(img, brand, theme) {
  const onDark = theme === 'dark';
  const c = makeCanvas(256, 256);
  const x = c.getContext('2d');

  x.drawImage(img, 53, 53, 150, 150);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = glyphFor(brand.color, onDark);
  x.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function labelTexture(brand, theme) {
  const c = makeCanvas(512, 128);
  const x = c.getContext('2d');
  x.fillStyle = PALETTE[theme].label;
  x.font = '700 48px Inter, "Segoe UI", system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(brand.label, 256, 66);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function codeScreenTexture() {
  const W = 1400, H = 900;
  const c = makeCanvas(W, H);
  const x = c.getContext('2d');
  const mono = '"SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

  x.fillStyle = '#0e1526'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#151d31'; x.fillRect(0, 0, 46, H);
  x.fillStyle = '#111a2c'; x.fillRect(46, 0, 300, H);

  x.fillStyle = '#3b4a68';
  for (let i = 0; i < 7; i++) x.fillRect(14, 90 + i * 52, 18, 18);
  x.fillStyle = '#4ea1ff'; x.fillRect(14, 90, 18, 18);

  x.fillStyle = '#61708f';
  x.font = `600 20px ${mono}`;
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.fillText('EXPLORER', 70, 60);

  const tree = [
    ['v', 'src', '#8fa3c8', 1], ['>', 'components', '#61708f', 2], ['>', 'pages', '#61708f', 2],
    ['>', 'hooks', '#61708f', 2], ['>', 'utils', '#61708f', 2], ['>', 'services', '#61708f', 2],
    ['*', 'App.jsx', '#e8effc', 2], ['*', 'main.jsx', '#8fa3c8', 2], ['*', 'package.json', '#8fa3c8', 1]
  ];
  x.font = `500 24px ${mono}`;
  tree.forEach(([mark, name, col, depth], i) => {
    const yy = 116 + i * 44;
    x.fillStyle = '#4b5c7d'; x.fillText(mark, 70 + (depth - 1) * 22, yy);
    x.fillStyle = col; x.fillText(name, 102 + (depth - 1) * 22, yy);
  });

  x.fillStyle = '#0b1220'; x.fillRect(346, 0, W - 346, 62);
  x.fillStyle = '#0e1526'; x.fillRect(346, 0, 250, 62);
  x.fillStyle = '#e8effc'; x.font = `600 24px ${mono}`;
  x.fillText('App.jsx', 420, 40);
  x.fillStyle = '#4ea1ff'; x.fillRect(346, 58, 250, 4);

  const K = '#c586c0', S = '#ce9178', T = '#4ec9b0', P = '#d4d4d4', N = '#9cdcfe', C = '#61708f', F = '#dcdcaa';
  const lines = [
    [['import', K], [' React ', P], ['from', K], [" 'react'", S]],
    [['import', K], [' { Routes, Route } ', P], ['from', K], [" 'react-router-dom'", S]],
    [['import', K], [' Home ', P], ['from', K], [" './pages/Home'", S]],
    [],
    [['function', K], [' App', F], ['() {', P]],
    [['    return (', P]],
    [['      <', T], ['Routes', N], ['>', T]],
    [['        <', T], ['Route', N], [' path=', P], ['="/"', S], [' element=', P], ['={<', T], ['Home', N], [' />} />', T]],
    [['      </', T], ['Routes', N], ['>', T]],
    [['    )', P]],
    [['  }', P]],
    [],
    [['export default', K], [' App', P]]
  ];

  x.font = `500 27px ${mono}`;
  lines.forEach((runs, i) => {
    const yy = 130 + i * 52;
    x.fillStyle = '#3d4c6b';
    x.textAlign = 'right';
    x.fillText(String(i + 1), 396, yy);
    x.textAlign = 'left';
    let xx = 640;
    runs.forEach(([txt, col]) => { x.fillStyle = col; x.fillText(txt, xx, yy); xx += x.measureText(txt).width; });
  });

  x.fillStyle = C; x.fillRect(640, 130 + 13 * 52 - 24, 14, 30);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function keyboardTexture() {
  const W = 1400, H = 900;
  const c = makeCanvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#b9c2d2'; x.fillRect(0, 0, W, H);

  const rows = 5;
  const keyW = 74, keyH = 74, gap = 14;
  const totalW = 13 * (keyW + gap) - gap;
  for (let r = 0; r < rows; r++) {
    const count = r === rows - 1 ? 9 : 13;
    const rowW = count * (keyW + gap) - gap;
    const ox = (W - rowW) / 2;
    for (let k = 0; k < count; k++) {
      x.fillStyle = '#2c3648';
      roundRect(x, ox + k * (keyW + gap), 120 + r * (keyH + gap), keyW, keyH, 10);
      x.fill();
    }
  }
  x.fillStyle = 'rgba(44,54,72,0.55)';
  roundRect(x, W / 2 - 190, 120 + rows * (keyH + gap) + 40, 380, 190, 16);
  x.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function radialSpriteTexture(stops) {
  const c = makeCanvas(256, 256);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([at, col]) => g.addColorStop(at, col));
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ================= scene ================= */
function initScene(THREE) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  camera.position.set(0, 1.55, 9.0);
  camera.lookAt(0, 0.28, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899bb, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(4, 6, 8);
  const rim = new THREE.DirectionalLight(0xbcd4ff, 1.1);
  rim.position.set(-6, 2, -4);
  scene.add(key, rim);

  const stage = new THREE.Group();
  scene.add(stage);

  /* ---- geometry helpers ---- */
  function roundedRectShape(w, h, r) {
    const s = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  function roundedBox(w, h, d, r) {
    const bt = Math.min(0.02, d * 0.22);
    const g = new THREE.ExtrudeGeometry(roundedRectShape(w, h, r), {
      depth: d, bevelEnabled: true, bevelThickness: bt, bevelSize: Math.min(0.02, r * 0.4),
      bevelSegments: 2, curveSegments: 10
    });
    g.translate(0, 0, -d / 2 - bt);
    g.computeVertexNormals();
    return g;
  }

  /* ---- materials that follow the theme ---- */
  const matBody = new THREE.MeshStandardMaterial({ color: PALETTE.light.body, roughness: 0.38, metalness: 0.55 });
  const matBodyDark = new THREE.MeshStandardMaterial({ color: PALETTE.light.bodyDark, roughness: 0.5, metalness: 0.4 });
  const matTile = new THREE.MeshStandardMaterial({ color: PALETTE.light.tileFace, roughness: 0.42, metalness: 0.08 });

  /* ---- laptop ---- */
  const laptop = new THREE.Group();
  const base = new THREE.Mesh(roundedBox(2.62, 1.72, 0.1, 0.07), matBody);
  base.rotation.x = -Math.PI / 2;
  laptop.add(base);

  const deck = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.6), new THREE.MeshStandardMaterial({
    map: keyboardTexture(), roughness: 0.75, metalness: 0.05, transparent: false
  }));
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 0.052;
  laptop.add(deck);

  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.04, -0.83);
  lidPivot.rotation.x = -0.17;
  laptop.add(lidPivot);

  const lid = new THREE.Mesh(roundedBox(2.62, 1.72, 0.075, 0.06), matBodyDark);
  lid.position.y = 1.72 / 2;
  lidPivot.add(lid);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.44, 1.56),
    new THREE.MeshBasicMaterial({ map: codeScreenTexture() })
  );
  screen.position.set(0, 1.72 / 2, 0.045);
  lidPivot.add(screen);

  laptop.rotation.set(0.03, -0.34, 0);
  laptop.position.y = -0.1;
  stage.add(laptop);

  /* ---- contact shadow ---- */
  const shadow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialSpriteTexture([[0, 'rgba(0,0,0,0.55)'], [0.55, 'rgba(0,0,0,0.22)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true, depthWrite: false, opacity: 0.5
  }));
  shadow.scale.set(3.5, 1.05, 1);
  shadow.position.set(0, -1.62, -0.5);
  stage.add(shadow);

  /* ---- icon tiles ---- */
  const tiles = [];
  const tileGeo = roundedBox(0.62, 0.62, 0.12, 0.15);
  const faceGeo = new THREE.PlaneGeometry(0.56, 0.56);
  const labelGeo = new THREE.PlaneGeometry(0.92, 0.23);

  async function buildTiles() {
    for (let i = 0; i < BRANDS.length; i++) {
      const brand = BRANDS[i];
      let img = null;
      try { img = await svgToImage(brand.slug); } catch (err) { console.warn('icon missing:', brand.slug); }
      const [x, y, z] = TILE_LAYOUT_WIDE[i];

      const group = new THREE.Group();
      group.position.set(x, y, z);

      const box = new THREE.Mesh(tileGeo, matTile);
      group.add(box);

      const variants = {};
      const labels = {};
      if (img) {
        for (const theme of ['light', 'dark']) {
          variants[theme] = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({
            map: glyphTexture(img, brand, theme), transparent: true, depthWrite: false,
            opacity: theme === 'light' ? 1 : 0
          }));
          variants[theme].position.z = 0.082;
          group.add(variants[theme]);

          labels[theme] = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({
            map: labelTexture(brand, theme), transparent: true, depthWrite: false,
            opacity: theme === 'light' ? 1 : 0
          }));
          labels[theme].position.set(0, -0.45, 0.082);
          group.add(labels[theme]);
        }
      }

      stage.add(group);
      tiles.push({
        group, variants, labels,
        home: new THREE.Vector3(x, y, z),
        homeTarget: new THREE.Vector3(x, y, z),
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 0.45,
        amp: 0.05 + Math.random() * 0.05,
        born: false
      });
    }
  }
  buildTiles().then(resize);

  /* ---- drifting dust ---- */
  const DUST = 140;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 16;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 11;
    dustPos[i * 3 + 2] = -2 - Math.random() * 9;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    color: PALETTE.light.dust, size: 0.055, sizeAttenuation: true,
    transparent: true, opacity: PALETTE.light.dustOpacity, depthWrite: false
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  /* ================= theme ================= */
  const themeFrom = {
    body: new THREE.Color(PALETTE.light.body), bodyDark: new THREE.Color(PALETTE.light.bodyDark),
    tile: new THREE.Color(PALETTE.light.tileFace), dust: new THREE.Color(PALETTE.light.dust)
  };
  const themeTo = {
    body: new THREE.Color(PALETTE.light.body), bodyDark: new THREE.Color(PALETTE.light.bodyDark),
    tile: new THREE.Color(PALETTE.light.tileFace), dust: new THREE.Color(PALETTE.light.dust)
  };

  let themeName = 'light';
  let mix = 0;            // 0 = light, 1 = dark
  let mixTarget = 0;
  let mixFrom = 0;
  let mixStart = -1;

  function applyTheme(name) {
    themeName = name;
    root.dataset.theme = name;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', name === 'light' ? '#f5f7fb' : '#05070f');

    // start the tween from wherever the materials are right now, so an
    // interrupted switch does not snap back to the light palette
    themeFrom.body.copy(matBody.color);
    themeFrom.bodyDark.copy(matBodyDark.color);
    themeFrom.tile.copy(matTile.color);
    themeFrom.dust.copy(dustMat.color);

    mixFrom = mix;
    mixTarget = name === 'dark' ? 1 : 0;
    mixStart = clock.getElapsedTime();

    themeTo.body.set(PALETTE[name].body);
    themeTo.bodyDark.set(PALETTE[name].bodyDark);
    themeTo.tile.set(PALETTE[name].tileFace);
    themeTo.dust.set(PALETTE[name].dust);

    for (const t of tiles) {
      if (t.variants.light) t.variants.light.material.opacity = name === 'light' ? 1 : 0;
      if (t.variants.dark) t.variants.dark.material.opacity = name === 'dark' ? 1 : 0;
      if (t.labels.light) t.labels.light.material.opacity = name === 'light' ? 1 : 0;
      if (t.labels.dark) t.labels.dark.material.opacity = name === 'dark' ? 1 : 0;
    }
    shadow.material.opacity = name === 'light' ? 0.2 : 0.48;
  }

  let timer = null;
  function startCycle() {
    if (reduceMotion || timer) return;
    timer = setInterval(() => applyTheme(themeName === 'light' ? 'dark' : 'light'), THEME_MS);
  }
  function stopCycle() { clearInterval(timer); timer = null; }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCycle(); else startCycle();
  });

  /* ================= framing ================= */
  const heroEl = document.querySelector('.hero');
  const copyEl = heroEl ? heroEl.firstElementChild : null;
  const topbarEl = document.querySelector('.topbar');
  const CLUSTER_H = 5.2, TILE_MAX_X = 2.46, TILE_HALF = 0.31;
  let baseScale = 1;
  let tileScale = 1;
  let narrow = false;

  function clusterExtent(layout, half) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of layout) {
      if (x - half < minX) minX = x - half;
      if (x + half > maxX) maxX = x + half;
      if (y - half < minY) minY = y - half;
      if (y + half > maxY) maxY = y + half;
    }
    return { w: maxX - minX, h: maxY - minY, cy: (minY + maxY) / 2 };
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);

    const aspect = w / Math.max(1, h);
    narrow = aspect < 1.15;
    camera.aspect = aspect;
    camera.fov = narrow ? 52 : 40;
    camera.position.z = narrow ? 11.2 : 9.0;
    camera.lookAt(0, 0.28, 0);
    camera.updateProjectionMatrix();

    const visH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const visW = visH * aspect;

    const layout = narrow ? TILE_LAYOUT_NARROW : TILE_LAYOUT_WIDE;
    tileScale = narrow ? 1.15 : 1;
    tiles.forEach((t, i) => {
      const [x, y, z] = layout[i];
      t.homeTarget.set(x, y, z);
      for (const key in t.labels) t.labels[key].visible = !narrow;
    });

    if (narrow) {
      // the 3D gets whatever sits between the topbar and the headline, so it can
      // never collide with the copy at any viewport size
      const worldPerPx = visH / h;
      const topPx = topbarEl ? topbarEl.getBoundingClientRect().bottom : h * 0.06;
      const heroPx = copyEl ? copyEl.getBoundingClientRect().top : h * 0.46;
      const bandPx = Math.max(h * 0.18, heroPx - topPx);
      const ext = clusterExtent(layout, TILE_HALF * tileScale);

      baseScale = Math.min((visW * 0.94) / ext.w, (bandPx * worldPerPx * 0.95) / ext.h);
      root.style.setProperty('--band-p', ((topPx + bandPx) / h * 100).toFixed(1) + '%');

      const bandCenterY = 0.28 + (h / 2 - (topPx + bandPx / 2)) * worldPerPx;
      stage.position.x = 0;
      stage.position.y = bandCenterY - ext.cy * baseScale;
    } else {
      const clusterW = 2 * (TILE_MAX_X + TILE_HALF);
      baseScale = Math.min((visW * 0.54) / clusterW, (visH * 0.8) / CLUSTER_H);
      stage.position.x = visW * 0.20;
      stage.position.y = -visH * 0.02;
    }
  }
  window.addEventListener('resize', resize);
  resize();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
  // the copy slides up during the entrance, so re-measure the band once it settles
  setTimeout(resize, 1700);

  /* ================= parallax ================= */
  const pointer = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };
  function onMove(cx, cy) {
    pointer.x = (cx / window.innerWidth) * 2 - 1;
    pointer.y = (cy / window.innerHeight) * 2 - 1;
  }
  if (!reduceMotion) {
    window.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY), { passive: true });
    window.addEventListener('touchmove', (e) => { if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  }

  /* ================= loop ================= */
  const clock = new THREE.Clock();
  const tmpColor = new THREE.Color();

  canvas.classList.add('is-live');
  startCycle();

  function loop() {
    requestAnimationFrame(loop);

    const t = clock.getElapsedTime();
    const intro = reduceMotion ? 1 : Math.min(1, t / 1.5);
    stage.scale.setScalar(baseScale * (0.9 + 0.1 * intro));

    if (mixStart >= 0) {
      const k = Math.min(1, (t - mixStart) / 0.9);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      mix = mixFrom + (mixTarget - mixFrom) * e;
      if (k >= 1) mixStart = -1;
    }

    matBody.color.copy(tmpColor.copy(themeFrom.body).lerp(themeTo.body, mix));
    matBodyDark.color.copy(tmpColor.copy(themeFrom.bodyDark).lerp(themeTo.bodyDark, mix));
    matTile.color.copy(tmpColor.copy(themeFrom.tile).lerp(themeTo.tile, mix));
    dustMat.color.copy(tmpColor.copy(themeFrom.dust).lerp(themeTo.dust, mix));
    dustMat.opacity = PALETTE.light.dustOpacity + (PALETTE.dark.dustOpacity - PALETTE.light.dustOpacity) * mix;

    if (!reduceMotion) {
      laptop.position.y = -0.1 + Math.sin(t * 0.7) * 0.05;
      laptop.rotation.y = -0.34 + Math.sin(t * 0.45) * 0.05;
      lidPivot.rotation.x = -0.17 + Math.sin(t * 0.6) * 0.012;

      tiles.forEach((tile, i) => {
        const appear = reduceMotion ? 1 : Math.max(0, Math.min(1, (t - 0.25 - i * 0.09) / 0.6));
        const ease = 1 - Math.pow(1 - appear, 3);
        tile.home.lerp(tile.homeTarget, 0.14);
        tile.group.scale.setScalar(ease * tileScale);
        tile.group.position.x = tile.home.x;
        tile.group.position.y = tile.home.y + Math.sin(t * tile.speed + tile.phase) * tile.amp;
        tile.group.position.z = tile.home.z + Math.cos(t * tile.speed * 0.8 + tile.phase) * tile.amp * 0.6;
        tile.group.rotation.z = Math.sin(t * tile.speed * 0.9 + tile.phase) * 0.07;
        tile.group.rotation.y = Math.sin(t * tile.speed * 0.6 + tile.phase * 1.4) * 0.16;
        tile.group.rotation.x = Math.cos(t * tile.speed * 0.5 + tile.phase) * 0.09;
      });

      dust.rotation.y = t * 0.012;
      dust.position.y = Math.sin(t * 0.15) * 0.25;

      eased.x += (pointer.x - eased.x) * 0.05;
      eased.y += (pointer.y - eased.y) * 0.05;
      stage.rotation.y = eased.x * 0.16;
      stage.rotation.x = eased.y * 0.1;
    } else {
      tiles.forEach((tile) => {
        tile.home.copy(tile.homeTarget);
        tile.group.position.copy(tile.home);
        tile.group.scale.setScalar(tileScale);
      });
    }

    renderer.render(scene, camera);
  }
  loop();
}


if (THREE) initScene(THREE);
