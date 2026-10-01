/**
 * viewer.js
 * 軌道6要素ビューアの画面と3D表示。
 *
 * 構成
 *   1. 状態          state（表示中の6要素）、強調中の要素、J2 モードの状態
 *   2. 操作パネル    スライダー・プリセット・用語集の生成と同期
 *   3. 3Dシーン      three.js の描画オブジェクト生成（sceneKit）
 *   4. シーン更新    6要素から全オブジェクトの位置を計算し直す（updateScene）
 *   5. J2 モード     交点の後退：Ω・ω の永年変化、残像、昇交点の軌跡
 *   6. 諸元・解説    右パネルの数値と左下の解説カード
 *   7. 強調表示      選んだ要素に関係するものだけを明るくする
 *   8. 視点・再生    カメラ移動と時間の進め方
 *   9. 言語切り替え
 *  10. 起動
 *
 * 依存：THREE, THREE.OrbitControls, OrbitMechanics, OrbitContent, I18n
 */
(function () {
  'use strict';

  const {ELEMENTS, GROUPS, PRESETS, GLOSSARY, EQUINOX_FIGURE} = window.OrbitContent;
  const OM = window.OrbitMechanics;
  const t = (key, ...args) => window.I18n.t(key, ...args);
  const loc = obj => obj[window.I18n.lang];          // {ja, en} から現在の言語を取り出す
  const D2R = Math.PI / 180, DAY = 86400;
  const $ = sel => document.querySelector(sel);
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const wrap360 = x => ((x % 360) + 360) % 360;

  /* =======================================================
     1. 状態
     ======================================================= */
  const state = {...PRESETS[0].el};   // a, e, i, O, w, n（角度は deg）
  let activePreset = PRESETS[0].id;
  let pinnedKey = null;               // クリックで固定した要素
  let hoveredKey = null;              // マウスが乗っている要素
  const focusKey = () => hoveredKey || pinnedKey;

  /** J2 モード：elapsed は経過時間 [s]、dO は Ω の累積変化 [deg]（360°で折り返さない） */
  const j2 = {on: false, elapsed: 0, dO: 0, start: {...state}, lastGhostAt: 0};

  /** state（deg）→ OrbitMechanics 用の要素（rad） */
  const toRadians = s => ({a: s.a, e: s.e, inc: s.i * D2R, raan: s.O * D2R, argp: s.w * D2R, nu: s.n * D2R});

  /** ユーザー操作で要素が変わったときの共通処理 */
  function setElement(key, value) {
    const E = ELEMENTS[key];
    state[key] = clamp(value, E.min, E.max);
    if (key === 'n') setPlaying(false);
    activePreset = null;
    pinnedKey = key;
    resetJ2Timeline();
    refreshAll();
    recordJ2Frame(true);
    if (key === 'a' || key === 'e') zoomToFit();
  }

  function applyPreset(preset) {
    Object.assign(state, preset.el);
    activePreset = preset.id;
    pinnedKey = null;
    resetJ2Timeline();
    refreshAll();
    recordJ2Frame(true);
    zoomToFit();
  }

  function refreshAll() {
    syncInputs();
    markPresets();
    updateScene();
    refreshFocus();
  }

  /* =======================================================
     2. 操作パネル
     ======================================================= */
  function buildElementRows() {
    const wrap = $('#elements');
    wrap.innerHTML = '';
    GROUPS.forEach((group, gi) => {
      const g = loc(group);
      const grp = document.createElement('div');
      grp.className = 'grp';
      grp.innerHTML = `<h3><span class="step">${gi + 1}</span>${g.title}<em>${g.note}</em></h3>`;
      group.keys.forEach(key => grp.appendChild(buildElementRow(key)));
      wrap.appendChild(grp);
    });
  }

  function buildElementRow(key) {
    const E = ELEMENTS[key], L = loc(E);
    const row = document.createElement('div');
    row.className = 'el';
    row.dataset.k = key;
    row.style.setProperty('--c', `var(--c-${key})`);
    row.innerHTML = `
      <div class="el-head" tabindex="0" role="button" aria-pressed="false">
        <span class="sym">${E.sym}</span>
        <span class="nm"><b>${L.name}</b><small>${L.what}</small></span>
        <span class="val">
          <input class="num" id="num-${key}" type="number" min="${E.min}" max="${E.max}" step="${E.step}" aria-label="${L.name}">
          <span class="unit">${E.unit}</span>
        </span>
      </div>
      <input type="range" id="rng-${key}" min="${E.min}" max="${E.max}" step="${E.step}" aria-label="${L.name}">
      <div class="warn" id="warn-${key}" hidden></div>`;

    const head = row.querySelector('.el-head');
    const togglePin = () => { pinnedKey = pinnedKey === key ? null : key; refreshFocus(); };
    head.addEventListener('click', ev => { if (!ev.target.closest('input')) togglePin(); });
    head.addEventListener('keydown', ev => {
      if ((ev.key === 'Enter' || ev.key === ' ') && !ev.target.closest('input')) { ev.preventDefault(); togglePin(); }
    });
    bindHover(row, key);

    const rng = row.querySelector('input[type=range]');
    const num = row.querySelector('.num');
    rng.addEventListener('input', () => setElement(key, parseFloat(rng.value)));
    num.addEventListener('change', () => {
      const v = parseFloat(num.value);
      if (Number.isNaN(v)) syncInputs(); else setElement(key, v);
    });
    return row;
  }

  function buildPresets() {
    const wrap = $('#presets');
    wrap.innerHTML = '';
    PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = loc(p);
      b.dataset.id = p.id;
      b.addEventListener('click', () => applyPreset(p));
      wrap.appendChild(b);
    });
  }

  function buildGlossary() {
    const wrap = $('#glossary');
    wrap.innerHTML = '';
    GLOSSARY.forEach(item => {
      const L = loc(item);
      const div = document.createElement('div');
      div.className = 't';
      div.tabIndex = 0;
      div.dataset.k = item.key;
      div.style.setProperty('--c', item.color);
      div.innerHTML = `
        <dt><span class="dot"></span>${L.term}<span class="en">${L.alt}</span></dt>
        <dd>${L.body}${item.figure === 'equinox' ? equinoxFigure() : ''}</dd>`;
      const key = item.key || null;
      const enter = () => { hoveredKey = key; div.classList.add('on'); refreshFocus(); };
      const leave = () => { hoveredKey = null; div.classList.remove('on'); refreshFocus(); };
      div.addEventListener('mouseenter', enter);
      div.addEventListener('mouseleave', leave);
      div.addEventListener('focus', enter);
      div.addEventListener('blur', leave);
      div.addEventListener('click', () => { if (key) { pinnedKey = key; refreshFocus(); } });
      wrap.appendChild(div);
    });
  }

  /** 春分点の説明図（地球の公転軌道上で、春分点方向が変わらないことを示す） */
  function equinoxFigure() {
    const f = loc(EQUINOX_FIGURE);
    return `
      <div class="fig"><svg viewBox="0 0 320 132" role="img" aria-label="${f.aria}">
        <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#AEB9CC"/></marker></defs>
        <g font-family="IBM Plex Sans JP,sans-serif" font-size="10">
          <ellipse cx="160" cy="62" rx="120" ry="40" fill="none" stroke="#34466A" stroke-width="1.2"/>
          <text x="316" y="18" fill="#5A6883" text-anchor="end">${f.orbit}</text>
          <circle cx="160" cy="62" r="10" fill="#F2B84B"/>
          <text x="160" y="84" fill="#F2B84B" text-anchor="middle">${f.sun}</text>
          <circle cx="40" cy="62" r="6" fill="#3F6FB8"/>
          <line x1="48" y1="62" x2="146" y2="62" stroke="#AEB9CC" stroke-width="1.5" marker-end="url(#ah)"/>
          <text x="97" y="55" fill="#E7ECF4" font-size="11" text-anchor="middle">${f.dir}</text>
          <text x="40" y="84" fill="#8C99B0" text-anchor="middle">${f.day}</text>
          <circle cx="160" cy="102" r="6" fill="#3F6FB8"/>
          <line x1="168" y1="102" x2="236" y2="102" stroke="#AEB9CC" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#ah)"/>
          <text x="160" y="124" fill="#8C99B0" text-anchor="middle">${f.later}</text>
          <text x="242" y="106" fill="#8C99B0">${f.same}</text>
        </g>
      </svg></div>`;
  }

  function bindHover(el, key) {
    el.addEventListener('mouseenter', () => { hoveredKey = key; refreshFocus(); });
    el.addEventListener('mouseleave', () => { hoveredKey = null; refreshFocus(); });
  }

  function markPresets() {
    document.querySelectorAll('#presets .chip').forEach(b => b.classList.toggle('on', b.dataset.id === activePreset));
  }

  /** スライダー・数値欄を state に合わせる */
  function syncInputs() {
    for (const key in ELEMENTS) setInputValue(key, state[key]);
    showWarning('O', state.i <= 0.05 || state.i >= 179.95, t('warnNoNode'));
    showWarning('w', state.e < 1e-4, t('warnNoPerigee'));
  }

  function setInputValue(key, value) {
    const E = ELEMENTS[key];
    const rng = $('#rng-' + key), num = $('#num-' + key);
    rng.value = value;
    if (document.activeElement !== num) num.value = value.toFixed(E.dec);
    rng.closest('.el').style.setProperty('--p', ((value - E.min) / (E.max - E.min) * 100) + '%');
  }

  function showWarning(key, visible, text) {
    const w = $('#warn-' + key);
    w.hidden = !visible;
    w.textContent = text;
  }

  /* =======================================================
     3. 3Dシーン
     ======================================================= */
  const stage = $('#stage');
  const renderer = new THREE.WebGLRenderer({canvas: $('#cv'), antialias: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x0A0F1C, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 2000);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  Object.assign(controls, {enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: 1.8, maxDistance: 300});
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 0.75);
  sun.position.set(4, 3, 5);
  scene.add(sun);

  /** ECI（X=春分点, Z=北極）→ three.js 座標（Y が上） */
  const toScene = v => new THREE.Vector3(v[0], v[2], -v[1]);
  const COLOR = {a: 0xF2B84B, e: 0xF0795A, i: 0x3CC7B3, O: 0xA38BF6, w: 0x5AA9F2, n: 0xB9DB67, j2: 0xE58BD0,
                 orbit: 0xE7ECF4, muted: 0x8C99B0, grid: 0x34466A, equator: 0x7A90C0};
  const ARC_SEG = 64, ORBIT_PTS = 257;

  /**
   * sceneKit：描画オブジェクトを作るヘルパー群。
   * 作ったマテリアルはすべて tracked に登録し、強調表示のときに透明度を切り替える。
   *   keys = そのオブジェクトが関係する要素（null なら常に表示）
   *   dim  = 関係しない要素を強調中のときの透明度倍率
   */
  const tracked = [];
  const sceneKit = {
    track(mat, base, keys, dim = 0.1) {
      mat.transparent = true;
      mat.opacity = base;
      const entry = {mat, base, keys, dim};
      tracked.push(entry);
      return entry;
    },
    line(nPts, color, base, keys, dim, onTop = false) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nPts * 3), 3));
      const m = new THREE.LineBasicMaterial({color, depthTest: !onTop});
      const l = new THREE.Line(g, m);
      l.frustumCulled = false;
      if (onTop) l.renderOrder = 10;
      l.userData.track = sceneKit.track(m, base, keys, dim);
      scene.add(l);
      return l;
    },
    sector(color, base, keys) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ARC_SEG + 2) * 3), 3));
      const idx = [];
      for (let k = 1; k <= ARC_SEG; k++) idx.push(0, k, k + 1);
      g.setIndex(idx);
      const m = new THREE.MeshBasicMaterial({color, side: THREE.DoubleSide, depthWrite: false});
      const s = new THREE.Mesh(g, m);
      s.frustumCulled = false;
      s.renderOrder = 5;
      sceneKit.track(m, base, keys, 0.06);
      scene.add(s);
      return s;
    },
    ball(color, base, keys, dim) {
      const m = new THREE.MeshBasicMaterial({color});
      const b = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), m);
      sceneKit.track(m, base, keys, dim);
      scene.add(b);
      return b;
    },
    cone(color, keys) {
      const m = new THREE.MeshBasicMaterial({color, depthTest: false});
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 14), m);
      c.renderOrder = 11;
      sceneKit.track(m, 1, keys, 0.08);
      scene.add(c);
      return c;
    },
    disc(color, base, keys, dim) {
      const m = new THREE.MeshBasicMaterial({color, side: THREE.DoubleSide, depthWrite: false});
      const d = new THREE.Mesh(new THREE.CircleGeometry(1, 128), m);
      sceneKit.track(m, base, keys, dim);
      scene.add(d);
      return d;
    },
  };

  // --- 形状を書き換える小道具 ---
  function setPoints(line, pts) {
    const a = line.geometry.attributes.position.array;
    const n = Math.min(pts.length, a.length / 3);
    for (let k = 0; k < n; k++) { a[3 * k] = pts[k].x; a[3 * k + 1] = pts[k].y; a[3 * k + 2] = pts[k].z; }
    line.geometry.setDrawRange(0, n);
    line.geometry.attributes.position.needsUpdate = true;
  }
  function setSector(mesh, center, pts) {
    const a = mesh.geometry.attributes.position.array;
    a[0] = center.x; a[1] = center.y; a[2] = center.z;
    pts.forEach((p, k) => { a[3 * (k + 1)] = p.x; a[3 * (k + 1) + 1] = p.y; a[3 * (k + 1) + 2] = p.z; });
    mesh.geometry.attributes.position.needsUpdate = true;
  }
  const UP = new THREE.Vector3(0, 1, 0);
  function placeCone(cone, pos, dir, size) {
    cone.position.copy(pos);
    cone.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
    cone.scale.setScalar(size);
  }
  function orientDisc(disc, u, v, w, radius) {
    disc.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, w));
    disc.scale.setScalar(radius);
  }
  /** 中心 c、面内の直交単位ベクトル u→v の向きに、半径 r・角度 ang の弧 */
  function arcPoints(c, u, v, r, ang, n = ARC_SEG) {
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const s = ang * k / n;
      pts.push(c.clone().addScaledVector(u, r * Math.cos(s)).addScaledVector(v, r * Math.sin(s)));
    }
    return pts;
  }
  /** 弧の終端の位置と接線方向（矢印の向き） */
  function arcTip(u, v, r, ang) {
    return {
      pos: new THREE.Vector3().addScaledVector(u, r * Math.cos(ang)).addScaledVector(v, r * Math.sin(ang)),
      dir: u.clone().multiplyScalar(-Math.sin(ang)).addScaledVector(v, Math.cos(ang)),
    };
  }

  // --- 地球（半径 1 = RE） ---
  function buildEarth() {
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40),
      new THREE.MeshPhongMaterial({color: 0x1A3260, emissive: 0x0A1630, shininess: 12})));
    const sph = (lat, lon, r = 1.003) =>
      toScene([r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)]);
    const seg = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      if (lat === 0) continue;
      for (let k = 0; k < 96; k++) seg.push(sph(lat * D2R, k / 96 * 2 * Math.PI), sph(lat * D2R, (k + 1) / 96 * 2 * Math.PI));
    }
    for (let lon = 0; lon < 360; lon += 30) {
      for (let k = 0; k < 48; k++) seg.push(sph((-90 + k / 48 * 180) * D2R, lon * D2R), sph((-90 + (k + 1) / 48 * 180) * D2R, lon * D2R));
    }
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg),
      new THREE.LineBasicMaterial({color: COLOR.grid, transparent: true, opacity: .7})));
    const eq = [];
    for (let k = 0; k <= 128; k++) eq.push(sph(0, k / 128 * 2 * Math.PI, 1.004));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(eq), new THREE.LineBasicMaterial({color: 0x6F86B3})));
  }
  buildEarth();

  // --- 軌道と補助線 ---
  const K = sceneKit, C = COLOR, N2 = ARC_SEG * 2 + 1;
  const obj = {
    // 基準
    pole:     K.line(2, C.muted, .6, null),
    xAxis:    K.line(2, C.muted, .95, ['O'], .25, true),
    xCone:    K.cone(C.muted, ['O']),
    // 面
    eqDisc:   K.disc(C.equator, .07, ['i', 'O'], .35),
    eqRing:   K.line(N2, C.equator, .45, ['i', 'O'], .4),
    orbDisc:  K.disc(C.i, .10, ['i', 'O'], .25),
    orbRing:  K.line(N2, C.i, .5, ['i', 'O'], .3),
    nodeLine: K.line(2, C.O, .55, ['O', 'i', 'w'], .15),
    ascNode:  K.ball(C.O, 1, ['O', 'i', 'w'], .15),
    descNode: K.ball(C.O, .5, ['O', 'i'], .15),
    // 楕円
    orbit:    K.line(ORBIT_PTS, C.orbit, 1, ['a', 'e', 'n', 'w'], .4),
    apsides:  K.line(2, C.a, .45, ['a', 'w', 'e'], .12),
    semiMaj:  K.line(2, C.a, 1, ['a'], .06, true),
    aeSeg:    K.line(2, C.e, 1, ['e'], .06, true),
    center:   K.ball(C.e, 1, ['e'], .08),
    perigee:  K.ball(C.w, 1, ['a', 'e', 'w', 'n'], .2),
    apogee:   K.ball(C.a, 1, ['a', 'e'], .2),
    // 衛星
    sat:      K.ball(C.n, 1, ['n'], .5),
    radius:   K.line(2, C.n, .8, ['n'], .15),
    // 角度（弧・扇形・矢印）
    arcO: K.line(ARC_SEG + 1, C.O, 1, ['O'], .12, true), secO: K.sector(C.O, .22, ['O']), coneO: K.cone(C.O, ['O']),
    arcI: K.line(ARC_SEG + 1, C.i, 1, ['i'], .12, true), secI: K.sector(C.i, .28, ['i']),
    refEq:  K.line(2, C.equator, .9, ['i'], .1, true),
    refOrb: K.line(2, C.i, .9, ['i'], .1, true),
    arcW: K.line(ARC_SEG + 1, C.w, 1, ['w'], .12, true), secW: K.sector(C.w, .22, ['w']), coneW: K.cone(C.w, ['w']),
    arcN: K.line(ARC_SEG + 1, C.n, 1, ['n'], .12, true), secN: K.sector(C.n, .18, ['n']), coneN: K.cone(C.n, ['n']),
  };
  const velArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xE7ECF4, .3, .15);
  K.track(velArrow.line.material, .9, ['n'], .2);
  K.track(velArrow.cone.material, .9, ['n'], .2);
  scene.add(velArrow);

  // --- 3D 空間に貼り付く HTML ラベル（textKey は i18n のキー、空なら毎回 innerHTML を書き換える） ---
  const labels = {};
  function addLabel(id, textKey, color, keys, cls = '') {
    const el = document.createElement('div');
    el.className = 'lbl ' + cls;
    if (color) el.style.color = color;
    $('#labels').appendChild(el);
    labels[id] = {el, textKey, pos: new THREE.Vector3(), keys, focus: 1, hidden: false};
  }
  function renderLabelTexts() {
    for (const id in labels) if (labels[id].textKey) labels[id].el.innerHTML = t(labels[id].textKey);
  }
  addLabel('x',    'lblX', '#AEB9CC', ['O']);
  addLabel('z',    'lblZ', '#AEB9CC', null);
  addLabel('t90',  null, null, ['O'], 'tick');
  addLabel('t180', null, null, ['O'], 'tick');
  addLabel('t270', null, null, ['O'], 'tick');
  addLabel('asc',  'lblAsc', 'var(--c-O)', ['O', 'i', 'w']);
  addLabel('desc', 'lblDesc', 'var(--c-O)', ['O', 'i']);
  addLabel('peri', 'lblPeri', 'var(--c-w)', ['a', 'e', 'w', 'n']);
  addLabel('apo',  'lblApo', 'var(--c-a)', ['a', 'e']);
  addLabel('sat',  'lblSat', 'var(--c-n)', ['n']);
  addLabel('angO', null, 'var(--c-O)', ['O'], 'ang');
  addLabel('angI', null, 'var(--c-i)', ['i'], 'ang');
  addLabel('angW', null, 'var(--c-w)', ['w'], 'ang');
  addLabel('angN', null, 'var(--c-n)', ['n'], 'ang');
  addLabel('lenA', null, 'var(--c-a)', ['a'], 'ang');
  addLabel('lenAE', null, 'var(--c-e)', ['e'], 'ang');
  addLabel('eqPl', 'lblEq', null, ['i', 'O'], 'plane');
  addLabel('orPl', 'lblOrb', 'var(--c-i)', ['i', 'O'], 'plane');
  labels.t90.el.textContent = '90°';
  labels.t180.el.textContent = '180°';
  labels.t270.el.textContent = '270°';
  labels.lenA.el.innerHTML = '<i>a</i>';
  labels.lenAE.el.innerHTML = '<i>ae</i>';

  /* =======================================================
     4. シーン更新（長さの単位は地球半径 RE = 1）
     ======================================================= */
  let sceneRadius = 3;
  let summary = null;
  const frame3d = {orbitPts: [], ascPos: new THREE.Vector3()};   // J2 の残像・軌跡が参照する最新形状

  function updateScene() {
    const el = toRadians(state);
    const {a, e, inc, argp, nu} = el;
    summary = OM.orbitSummary(el);
    const B = summary.basis;
    const P = toScene(B.P), Q = toScene(B.Q), W = toScene(B.W);
    const N = toScene(B.N), M = toScene(B.M), E = toScene(B.E);
    const X = toScene([1, 0, 0]), Y = toScene([0, 1, 0]), Z = toScene([0, 0, 1]);
    const O0 = new THREE.Vector3();

    const RE = OM.RE;
    const p = summary.semiLatusRectum / RE, rp = a * (1 - e) / RE, ra = a * (1 + e) / RE;
    const posAt = f => {
      const r = p / (1 + e * Math.cos(f));
      return P.clone().multiplyScalar(r * Math.cos(f)).addScaledVector(Q, r * Math.sin(f));
    };
    const R = Math.max(ra * 1.12, 2.3);            // 面の円盤の半径
    const ms = Math.max(0.045, R * 0.017);         // 点や矢印の基準サイズ
    sceneRadius = R;

    // 基準軸と面
    setPoints(obj.pole, [Z.clone().multiplyScalar(-1.6), Z.clone().multiplyScalar(1.6)]);
    const xEnd = X.clone().multiplyScalar(R * 1.1);
    setPoints(obj.xAxis, [O0, xEnd]);
    placeCone(obj.xCone, xEnd, X, ms * 1.4);
    orientDisc(obj.eqDisc, X, Y, Z, R);
    setPoints(obj.eqRing, arcPoints(O0, X, Y, R, 2 * Math.PI, ARC_SEG * 2));
    orientDisc(obj.orbDisc, N, M, W, R);
    setPoints(obj.orbRing, arcPoints(O0, N, M, R, 2 * Math.PI, ARC_SEG * 2));
    setPoints(obj.nodeLine, [N.clone().multiplyScalar(-R), N.clone().multiplyScalar(R)]);

    // 楕円と特徴点
    const orbitPts = [];
    for (let k = 0; k < ORBIT_PTS; k++) orbitPts.push(posAt(k / (ORBIT_PTS - 1) * 2 * Math.PI));
    setPoints(obj.orbit, orbitPts);
    const ascPos = posAt(-argp), descPos = posAt(Math.PI - argp);
    const periPos = posAt(0), apoPos = posAt(Math.PI), satPos = posAt(nu);
    const centerPos = P.clone().multiplyScalar(-e * a / RE);
    frame3d.orbitPts = orbitPts;
    frame3d.ascPos.copy(ascPos);
    obj.ascNode.position.copy(ascPos);    obj.ascNode.scale.setScalar(ms * .85);
    obj.descNode.position.copy(descPos);  obj.descNode.scale.setScalar(ms * .7);
    obj.center.position.copy(centerPos);  obj.center.scale.setScalar(ms * .55);
    obj.perigee.position.copy(periPos);   obj.perigee.scale.setScalar(ms * .8);
    obj.apogee.position.copy(apoPos);     obj.apogee.scale.setScalar(ms * .8);
    obj.sat.position.copy(satPos);        obj.sat.scale.setScalar(ms * 1.25);
    setPoints(obj.apsides, [periPos, apoPos]);
    setPoints(obj.semiMaj, [centerPos, periPos]);
    setPoints(obj.aeSeg, [centerPos, O0]);
    setPoints(obj.radius, [O0, satPos]);
    const velDir = P.clone().multiplyScalar(-Math.sin(nu)).addScaledVector(Q, e + Math.cos(nu)).normalize();
    velArrow.position.copy(satPos);
    velArrow.setDirection(velDir);
    velArrow.setLength(ms * 7, ms * 2.2, ms * 1.3);

    // 角度 Ω：X 軸 → 昇交点（赤道面内）
    const arcR = clamp(rp * 0.6, 1.35, 4.2);
    drawAngle(obj.arcO, obj.secO, obj.coneO, X, Y, arcR, el.raan, state.O, ms);
    // 角度 ω：昇交点 → 近地点（軌道面内）
    drawAngle(obj.arcW, obj.secW, obj.coneW, N, M, arcR * 1.02, argp, state.w, ms);
    // 角度 ν：近地点 → 衛星（軌道面内）
    const nuR = arcR * 1.32;
    drawAngle(obj.arcN, obj.secN, obj.coneN, P, Q, nuR, nu, state.n, ms);
    // 角度 i：昇交点で、赤道面の東向き → 軌道の進行方向
    const incR = clamp(ascPos.length() * 0.42, 0.45, 2.6);
    const incPts = arcPoints(ascPos, E, Z, incR, inc);
    setPoints(obj.arcI, incPts);
    setSector(obj.secI, ascPos, incPts);
    setPoints(obj.refEq, [ascPos, ascPos.clone().addScaledVector(E, incR * 1.45)]);
    setPoints(obj.refOrb, [ascPos, ascPos.clone().addScaledVector(M, incR * 1.45)]);

    // ラベル位置
    const pushOut = (v, d) => v.clone().multiplyScalar(1 + d / Math.max(v.length(), 1e-6));
    const midArc = (u, v, r, ang) => new THREE.Vector3().addScaledVector(u, r * Math.cos(ang / 2)).addScaledVector(v, r * Math.sin(ang / 2));
    labels.x.pos.copy(X).multiplyScalar(R * 1.1 + ms * 3);
    labels.z.pos.copy(Z).multiplyScalar(1.78);
    labels.t90.pos.copy(Y).multiplyScalar(R * 1.05);
    labels.t180.pos.copy(X).multiplyScalar(-R * 1.05);
    labels.t270.pos.copy(Y).multiplyScalar(-R * 1.05);
    labels.asc.pos.copy(pushOut(ascPos, ms * 4));
    labels.desc.pos.copy(pushOut(descPos, ms * 4));
    labels.peri.pos.copy(pushOut(periPos, ms * 4));
    labels.apo.pos.copy(pushOut(apoPos, ms * 4));
    labels.sat.pos.copy(pushOut(satPos, ms * 4.5));
    labels.angO.pos.copy(midArc(X, Y, arcR * 1.2, el.raan));
    labels.angW.pos.copy(midArc(N, M, arcR * 0.72, argp));
    labels.angN.pos.copy(midArc(P, Q, nuR * 1.14, nu));
    labels.angI.pos.copy(ascPos).addScaledVector(E, incR * 1.25 * Math.cos(inc / 2)).addScaledVector(Z, incR * 1.25 * Math.sin(inc / 2));
    labels.angO.el.innerHTML = `<i>Ω</i>${state.O.toFixed(1)}°`;
    labels.angW.el.innerHTML = `<i>ω</i>${state.w.toFixed(1)}°`;
    labels.angN.el.innerHTML = `<i>ν</i>${state.n.toFixed(1)}°`;
    labels.angI.el.innerHTML = `<i>i</i>${state.i.toFixed(1)}°`;
    labels.lenA.pos.copy(centerPos).lerp(periPos, .5).addScaledVector(W, ms * 2.5);
    labels.lenAE.pos.copy(centerPos).multiplyScalar(.5).addScaledVector(W, -ms * 2.5);
    labels.lenAE.hidden = e < 0.03;
    labels.eqPl.pos.copy(E).multiplyScalar(-R * 0.9);
    labels.orPl.pos.copy(M).multiplyScalar(R * 0.9);

    updateReadouts();
    updateJ2Readouts();
    renderExplain();
  }

  /** 原点まわりの角度を弧・扇形・矢印で描く（小さい角度では矢印を隠す） */
  function drawAngle(arcLine, sector, cone, u, v, r, angRad, angDeg, ms) {
    const pts = arcPoints(new THREE.Vector3(), u, v, r, angRad);
    setPoints(arcLine, pts);
    setSector(sector, new THREE.Vector3(), pts);
    const tip = arcTip(u, v, r, angRad);
    placeCone(cone, tip.pos, tip.dir, ms * 1.1);
    cone.visible = angDeg > 3;
  }

  /* =======================================================
     5. J2 モード（交点の後退）
     ======================================================= */
  const GHOST_COUNT = 36;          // 残像として残す過去の軌道の数
  const GHOST_STEP_DEG = 10;       // Ω がこれだけ変わるごとに残像を1本残す
  const TRACE_MAX = 3000;          // 昇交点の軌跡の最大点数

  const ghosts = [];               // {line, mat, age}
  for (let k = 0; k < GHOST_COUNT; k++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ORBIT_PTS * 3), 3));
    const mat = new THREE.LineBasicMaterial({color: COLOR.j2, transparent: true, opacity: 0, depthWrite: false});
    const line = new THREE.Line(g, mat);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    ghosts.push({line, mat});
  }
  let ghostHead = 0, ghostUsed = 0;

  const trace = {line: K.line(TRACE_MAX, COLOR.j2, .95, ['O', 'i'], .15), pts: []};
  trace.line.visible = false;

  /** J2 の永年変化率 [deg/day] */
  function j2RatesDegPerDay() {
    const r = OM.j2SecularRates(state.a, state.e, state.i * D2R);
    return {raan: r.raanDot / D2R * DAY, argp: r.argpDot / D2R * DAY};
  }

  function clearGhostsAndTrace() {
    ghosts.forEach(g => { g.line.visible = false; });
    ghostHead = 0; ghostUsed = 0;
    trace.pts = [];
    setPoints(trace.line, []);
  }

  /** 手動で要素を変えたとき：その状態を J2 の開始状態にする */
  function resetJ2Timeline() {
    j2.elapsed = 0;
    j2.dO = 0;
    j2.lastGhostAt = 0;
    j2.start = {...state};
    clearGhostsAndTrace();
  }

  function restoreJ2Start() {
    Object.assign(state, j2.start);
    j2.elapsed = 0; j2.dO = 0; j2.lastGhostAt = 0;
    clearGhostsAndTrace();
    syncInputs();
    updateScene();
    recordJ2Frame(true);
  }

  function setJ2(on) {
    j2.on = on;
    $('#j2-on').checked = on;
    $('#j2').classList.toggle('on', on);
    $('#j2-body').hidden = !on;
    $('#j2-hint').hidden = on;
    trace.line.visible = on;
    document.querySelectorAll('#speed [data-j2-only]').forEach(b => { b.hidden = !on; });
    if (!on && isDayScale()) selectSpeed('lap');
    resetJ2Timeline();
    if (on) recordJ2Frame(true);
    updateJ2Readouts();
    updateGhostOpacity();
    renderExplain();
  }

  /** 1フレーム分の J2 による Ω・ω の変化 */
  function advanceJ2(dtSim) {
    const rates = OM.j2SecularRates(state.a, state.e, state.i * D2R);
    const dO = rates.raanDot * dtSim / D2R;
    const noNode = state.i <= 0.05 || state.i >= 179.95;
    state.O = wrap360(state.O + dO);
    if (state.e >= 1e-4 && !noNode) state.w = wrap360(state.w + rates.argpDot * dtSim / D2R);
    j2.dO += dO;
    j2.elapsed += dtSim;
  }

  /** 昇交点の軌跡に点を足し、Ω が一定量変わったら残像を残す */
  function recordJ2Frame(force = false) {
    if (!j2.on) return;
    const last = trace.pts[trace.pts.length - 1];
    if (force || !last || last.distanceToSquared(frame3d.ascPos) > 1e-5) {
      trace.pts.push(frame3d.ascPos.clone());
      if (trace.pts.length > TRACE_MAX) trace.pts.shift();
      setPoints(trace.line, trace.pts);
    }
    if (force || Math.abs(j2.dO - j2.lastGhostAt) >= GHOST_STEP_DEG) {
      j2.lastGhostAt = j2.dO;
      pushGhost(frame3d.orbitPts);
    }
  }

  function pushGhost(pts) {
    const g = ghosts[ghostHead];
    setPoints(g.line, pts);
    g.line.visible = true;
    g.order = performance.now();
    ghostHead = (ghostHead + 1) % GHOST_COUNT;
    ghostUsed = Math.min(GHOST_COUNT, ghostUsed + 1);
    updateGhostOpacity();
  }

  /** 新しい残像ほど濃く、古いほど薄く。別の要素を強調中はさらに薄くする */
  function updateGhostOpacity() {
    const key = focusKey();
    const focus = (!key || key === 'O' || key === 'i') ? 1 : 0.25;
    for (let age = 0; age < ghostUsed; age++) {
      const idx = (ghostHead - 1 - age + GHOST_COUNT) % GHOST_COUNT;
      ghosts[idx].mat.opacity = (0.32 - 0.26 * age / GHOST_COUNT) * focus;
    }
  }

  function updateJ2Readouts() {
    if (!j2.on) return;
    const r = j2RatesDegPerDay();
    const dirText = Math.abs(r.raan) < 1e-4 ? t('stopped') : r.raan < 0 ? t('west') : t('east');
    $('#j2-raan').textContent = t('perDay', r.raan);
    $('#j2-argp').textContent = t('perDay', r.argp);
    $('#j2-cycle').textContent = t('dayCount', Math.abs(r.raan) < 1e-4 ? Infinity : 360 / Math.abs(r.raan));
    $('#j2-elapsed').textContent = t('elapsed', j2.elapsed / DAY);
    $('#j2-dO').textContent = t('deltaO', j2.dO, dirText);

    const notes = [];
    const sunRate = 360 / OM.SIDEREAL_YEAR_DAYS;
    if (Math.abs(r.raan - sunRate) < 0.02) notes.push(t('j2Sso'));
    if (Math.abs(Math.cos(state.i * D2R)) < 0.005) notes.push(t('j2Polar'));
    if (state.e >= 1e-3 && Math.abs(r.argp) < 0.02 && Math.abs(Math.cos(state.i * D2R)) > 0.005) notes.push(t('j2Critical'));
    $('#j2-note').textContent = notes.join(' ');
    $('#j2-frozen').hidden = !(playing && isDayScale());
  }

  /* =======================================================
     6. 諸元・解説
     ======================================================= */
  function fmtPeriod(s) {
    if (s < 3 * 3600) return t('minutes', s / 60);
    if (s < 3 * 86400) return t('hours', s / 3600);
    return t('days', s / 86400);
  }

  function updateReadouts() {
    const s = summary;
    const gDeg = s.flightPathAngle / D2R;
    $('#r-hp').textContent = t('km', s.perigeeAlt);
    $('#r-ha').textContent = t('km', s.apogeeAlt);
    $('#r-T').textContent = fmtPeriod(s.period);
    $('#r-alt').textContent = t('km', s.altitude);
    $('#r-v').textContent = `${s.speed.toFixed(3)} km/s`;
    $('#r-g').textContent = `${gDeg >= 0 ? '+' : ''}${gDeg.toFixed(2)}°`;
    const fmt = (x, d) => x.toFixed(d).padStart(10);
    $('#r-sv').textContent =
      `r = [${s.rECI.map(x => fmt(x, 1)).join(',')} ] km\n` +
      `v = [${s.vECI.map(x => fmt(x, 4)).join(',')} ] km/s`;

    const alert = $('#r-alert');
    if (s.perigeeAlt < 0) alert.innerHTML = `<div class="alert bad">${t('alertCrash')}</div>`;
    else if (s.perigeeAlt < 150) alert.innerHTML = `<div class="alert warn">${t('alertLow')}</div>`;
    else alert.innerHTML = '';
  }

  /** 現在の値が何を意味するかを一文で返す */
  function interpretValue(key) {
    const {a, e} = state, s = summary;
    switch (key) {
      case 'a':
        return t('itA', fmtPeriod(s.period), t('km', a - OM.RE));
      case 'e':
        return e < 0.001 ? t('itECirc') : t('itE', t('km', s.perigeeAlt), t('km', s.apogeeAlt), t('km', a * e));
      case 'i': {
        const x = state.i;
        if (x < 0.05) return t('itIEqPro');
        if (x > 179.95) return t('itIEqRetro');
        if (x > 96 && x < 100.5 && a < 8200) return t('itISso');
        if (Math.abs(x - 90) < 0.5) return t('itIPolar');
        return x < 90 ? t('itIPro', x.toFixed(1)) : t('itIRetro', (180 - x).toFixed(1));
      }
      case 'O':
        return (state.i < 0.05 || state.i > 179.95) ? t('itONone') : t('itO', state.O.toFixed(1));
      case 'w': {
        if (e < 1e-4) return t('itWNone');
        const lat = Math.asin(Math.sin(state.i * D2R) * Math.sin(state.w * D2R)) / D2R;
        return t('itW', lat >= 0, Math.abs(lat).toFixed(1));
      }
      case 'n': {
        const x = state.n;
        const where = (x < 2 || x > 358) ? t('itNPeri') : Math.abs(x - 180) < 2 ? t('itNApo')
          : x < 180 ? t('itNUp') : t('itNDown');
        return t('itN', where, s.speed.toFixed(3), t('km', s.altitude));
      }
    }
    return '';
  }

  function overviewHtml() {
    return `
      <div class="ex-h"><b>${t('overviewTitle')}</b></div>
      <div class="order">
        <span><i style="color:var(--c-a)">a</i>・<i style="color:var(--c-e)">e</i> ${t('ovShape')}</span><span class="arrow">→</span>
        <span><i style="color:var(--c-i)">i</i>・<i style="color:var(--c-O)">Ω</i> ${t('ovPlane')}</span><span class="arrow">→</span>
        <span><i style="color:var(--c-w)">ω</i> ${t('ovOrient')}</span><span class="arrow">→</span>
        <span><i style="color:var(--c-n)">ν</i> ${t('ovPlace')}</span>
      </div>
      <p class="tech">${t('ovTech')}</p>`;
  }

  function j2CardHtml() {
    const r = j2RatesDegPerDay();
    const still = Math.abs(r.raan) < 1e-4;
    const dir = still ? t('stopped') : r.raan < 0 ? t('west') : t('east');
    return `
      <div class="ex-h"><span class="s" style="color:var(--c-j2)">J₂</span><b>${t('j2CardTitle')}</b></div>
      <p>${t('j2CardBody')}</p>
      <p class="now">${t('j2CardNow', t('perDay', r.raan), dir, t('dayCount', still ? Infinity : 360 / Math.abs(r.raan)))}</p>`;
  }

  function renderExplain() {
    const box = $('#explain');
    const key = focusKey();
    if (!key) { box.innerHTML = j2.on ? j2CardHtml() : overviewHtml(); return; }
    const E = ELEMENTS[key], L = loc(E);
    box.innerHTML = `
      <div class="ex-h">
        <span class="s" style="color:var(--c-${key})">${E.sym}</span><b>${L.name}</b><span class="k">${L.what}</span>
        ${pinnedKey === key ? `<button class="x" type="button" id="unpin">${t('unpin')}</button>` : ''}
      </div>
      <p class="ex-en">${L.alt}</p>
      <p>${L.desc}</p>
      <p class="now">${interpretValue(key)}</p>`;
    const unpin = $('#unpin');
    if (unpin) unpin.addEventListener('click', () => { pinnedKey = null; refreshFocus(); });
  }

  /* =======================================================
     7. 強調表示
     ======================================================= */
  const isRelated = (keys, key) => !key || !keys || keys.includes(key);

  function refreshFocus() {
    const key = focusKey();
    tracked.forEach(tr => { tr.mat.opacity = isRelated(tr.keys, key) ? tr.base : tr.base * tr.dim; });
    for (const id in labels) labels[id].focus = isRelated(labels[id].keys, key) ? 1 : 0.1;
    document.querySelectorAll('.el').forEach(row => {
      const k = row.dataset.k;
      row.classList.toggle('on', k === key);
      row.classList.toggle('pin', k === pinnedKey);
      row.classList.toggle('dim', !!key && k !== key);
      row.querySelector('.el-head').setAttribute('aria-pressed', String(k === pinnedKey));
    });
    updateGhostOpacity();
    renderExplain();
  }

  /* =======================================================
     8. 視点・再生
     ======================================================= */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let camTween = null;

  function flyTo(dir, dist, instant = false) {
    const to = dir.clone().normalize().multiplyScalar(dist);
    if (instant || reduceMotion) { camera.position.copy(to); controls.update(); return; }
    camTween = {from: camera.position.clone(), to, t0: performance.now(), dur: 750};
  }

  function stepCameraTween(now) {
    if (!camTween) return;
    const u = clamp((now - camTween.t0) / camTween.dur, 0, 1);
    const s = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;   // easeInOutQuad
    const dir = camTween.from.clone().normalize().lerp(camTween.to.clone().normalize(), s);
    if (dir.lengthSq() < 1e-6) dir.copy(camTween.to).normalize();
    const len = camTween.from.length() + (camTween.to.length() - camTween.from.length()) * s;
    camera.position.copy(dir.normalize().multiplyScalar(len));
    if (u >= 1) camTween = null;
  }

  const fitDistance = () => sceneRadius * 3.0 + 1;
  const zoomToFit = () => flyTo(camera.position.clone(), fitDistance());

  /** 視点プリセットのカメラ方向（真上・真下は OrbitControls が不安定なので少しずらす） */
  function viewDirection(kind) {
    const B = OM.perifocalBasis(state.O * D2R, state.i * D2R, state.w * D2R);
    const nudge = v => {
      const tv = toScene(v);
      if (Math.abs(tv.clone().normalize().y) > 0.999) tv.add(new THREE.Vector3(0.02, 0, 0.02));
      return tv;
    };
    switch (kind) {
      case 'north': return nudge([0.01, -0.01, 1]);
      case 'node':  return nudge([B.N[0], B.N[1], 0.02]);
      case 'plane': return nudge(B.W);
      default:      return toScene([1.15, 0.95, 0.72]);
    }
  }

  function bindSegmented(id, onSelect) {
    const seg = $(id);
    seg.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      onSelect(b.dataset.v);
    });
  }

  let playing = false;
  let speedMode = 'lap';      // 'lap' = 1周8秒、数値 = 実時間の倍率（86400 = 1日/秒）

  function selectSpeed(v) {
    speedMode = v;
    document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  }

  /** 現在の再生速度（実時間の何倍か） */
  const simRate = () => speedMode === 'lap' ? summary.period / 8 : Number(speedMode);
  /** 日単位の再生か。このときは1秒に何十周もするので衛星の位置を固定する */
  const isDayScale = () => speedMode !== 'lap' && Number(speedMode) >= DAY;

  function setPlaying(on) {
    playing = on;
    const icon = on ? '<path d="M1 0h3v10H1zM6 0h3v10H6z"/>' : '<path d="M1 0l9 5-9 5z"/>';
    $('#play').innerHTML = `<svg viewBox="0 0 10 10">${icon}</svg><span>${t(on ? 'pause' : 'play')}</span>`;
    if (j2.on) updateJ2Readouts();
  }

  /** 時間を dt [s] 進める。真近点角はケプラー方程式で、Ω・ω は J2 の永年変化で動かす */
  function advanceTime(dt) {
    if (!playing) return;
    const dtSim = dt * simRate();
    if (!isDayScale()) {
      const meanMotion = Math.sqrt(OM.MU / state.a ** 3);
      const M = OM.trueToMeanAnomaly(state.n * D2R, state.e) + meanMotion * dtSim;
      state.n = wrap360(OM.meanToTrueAnomaly(M, state.e) / D2R);
    }
    if (j2.on) advanceJ2(dtSim);
    if (j2.on) syncInputs(); else setInputValue('n', state.n);
    updateScene();
    recordJ2Frame();
  }

  /* ---------- 描画ループ ---------- */
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }

  /** カメラから点までの線分が地球（半径1）に遮られるか */
  const tmpV = new THREE.Vector3();
  function hiddenByEarth(pt) {
    const c = camera.position, d = tmpV.copy(pt).sub(c);
    const A = d.dot(d), Bq = 2 * c.dot(d), Cq = c.dot(c) - 1;
    const disc = Bq * Bq - 4 * A * Cq;
    if (disc < 0) return false;
    const s = (-Bq - Math.sqrt(disc)) / (2 * A);
    return s > 0 && s < 0.995;
  }

  const projV = new THREE.Vector3();
  function placeLabels() {
    const w = stage.clientWidth, h = stage.clientHeight;
    for (const id in labels) {
      const lb = labels[id];
      if (lb.hidden) { lb.el.style.opacity = 0; continue; }
      projV.copy(lb.pos).project(camera);
      if (projV.z > 1) { lb.el.style.opacity = 0; continue; }
      const x = (projV.x + 1) / 2 * w, y = (1 - projV.y) / 2 * h;
      lb.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
      lb.el.style.opacity = lb.focus * (hiddenByEarth(lb.pos) ? 0.25 : 1);
    }
  }

  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    advanceTime(dt);
    stepCameraTween(now);
    controls.update();
    renderer.render(scene, camera);
    placeLabels();
    requestAnimationFrame(frame);
  }

  /* =======================================================
     9. 言語切り替え
     ======================================================= */
  function applyLanguage() {
    window.I18n.applyStatic();
    document.querySelectorAll('#lang button').forEach(b => b.classList.toggle('on', b.dataset.v === window.I18n.lang));
    buildElementRows();
    buildPresets();
    buildGlossary();
    renderLabelTexts();
    setPlaying(playing);
    syncInputs();
    markPresets();
    updateScene();
    refreshFocus();
  }

  /* =======================================================
     10. 起動
     ======================================================= */
  bindSegmented('#views', kind => flyTo(viewDirection(kind), fitDistance()));
  bindSegmented('#speed', v => { speedMode = v; if (j2.on) updateJ2Readouts(); });
  bindSegmented('#lang', lang => window.I18n.setLang(lang));
  window.I18n.onChange(applyLanguage);
  $('#play').addEventListener('click', () => setPlaying(!playing));
  $('#j2-on').addEventListener('change', ev => setJ2(ev.target.checked));
  $('#j2-reset').addEventListener('click', restoreJ2Start);
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && pinnedKey) { pinnedKey = null; refreshFocus(); }
  });
  new ResizeObserver(resize).observe(stage);

  applyLanguage();
  resize();
  flyTo(viewDirection('oblique'), fitDistance(), true);
  requestAnimationFrame(frame);
})();
