/**
 * viewer.js
 * 軌道6要素ビューアの画面と3D表示。
 *
 * 構成
 *   1. 状態          state（表示中の6要素）と強調中の要素
 *   2. 操作パネル    スライダー・プリセット・用語集の生成と同期
 *   3. 3Dシーン      three.js の描画オブジェクト生成（sceneKit）
 *   4. シーン更新    6要素から全オブジェクトの位置を計算し直す（updateScene）
 *   5. 諸元・解説    右パネルの数値と左下の解説カード
 *   6. 強調表示      選んだ要素に関係するものだけを明るくする
 *   7. 視点・再生    カメラ移動と真近点角のアニメーション
 *   8. 起動
 *
 * 依存：THREE, THREE.OrbitControls, OrbitMechanics, OrbitContent
 */
(function () {
  'use strict';

  const {ELEMENTS, GROUPS, PRESETS} = window.OrbitContent;
  const OM = window.OrbitMechanics;
  const D2R = Math.PI / 180;
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

  /** state（deg）→ OrbitMechanics 用の要素（rad） */
  const toRadians = s => ({a: s.a, e: s.e, inc: s.i * D2R, raan: s.O * D2R, argp: s.w * D2R, nu: s.n * D2R});

  /** ユーザー操作で要素が変わったときの共通処理 */
  function setElement(key, value) {
    const E = ELEMENTS[key];
    state[key] = clamp(value, E.min, E.max);
    if (key === 'n') setPlaying(false);
    activePreset = null;
    pinnedKey = key;
    refreshAll();
    if (key === 'a' || key === 'e') zoomToFit();
  }

  function applyPreset(preset) {
    Object.assign(state, preset.el);
    activePreset = preset.id;
    pinnedKey = null;
    refreshAll();
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
    GROUPS.forEach((group, gi) => {
      const grp = document.createElement('div');
      grp.className = 'grp';
      grp.innerHTML = `<h3><span class="step">${gi + 1}</span>${group.title}<em>${group.note}</em></h3>`;
      group.keys.forEach(key => grp.appendChild(buildElementRow(key)));
      wrap.appendChild(grp);
    });
  }

  function buildElementRow(key) {
    const E = ELEMENTS[key];
    const row = document.createElement('div');
    row.className = 'el';
    row.dataset.k = key;
    row.style.setProperty('--c', `var(--c-${key})`);
    row.innerHTML = `
      <div class="el-head" tabindex="0" role="button" aria-pressed="false">
        <span class="sym">${E.sym}</span>
        <span class="nm"><b>${E.name}</b><small>${E.what}</small></span>
        <span class="val">
          <input class="num" id="num-${key}" type="number" min="${E.min}" max="${E.max}" step="${E.step}" aria-label="${E.name}">
          <span class="unit">${E.unit}</span>
        </span>
      </div>
      <input type="range" id="rng-${key}" min="${E.min}" max="${E.max}" step="${E.step}" aria-label="${E.name}">
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
    PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = p.name;
      b.dataset.id = p.id;
      b.addEventListener('click', () => applyPreset(p));
      wrap.appendChild(b);
    });
  }

  function bindGlossary() {
    document.querySelectorAll('#glossary .t').forEach(item => {
      const key = item.dataset.k || null;
      const enter = () => { hoveredKey = key; item.classList.add('on'); refreshFocus(); };
      const leave = () => { hoveredKey = null; item.classList.remove('on'); refreshFocus(); };
      item.addEventListener('mouseenter', enter);
      item.addEventListener('mouseleave', leave);
      item.addEventListener('focus', enter);
      item.addEventListener('blur', leave);
      item.addEventListener('click', () => { if (key) { pinnedKey = key; refreshFocus(); } });
    });
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
    const noNode = state.i <= 0.05 || state.i >= 179.95;
    const noPerigee = state.e < 1e-4;
    showWarning('O', noNode, '傾斜角が 0° / 180° のため軌道面と赤道面が重なり、昇交点が存在しません。Ω は形式上の値です。');
    showWarning('w', noPerigee, '離心率が 0 のため近地点が決まらず、ω は形式上の値です。');
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
  const COLOR = {a: 0xF2B84B, e: 0xF0795A, i: 0x3CC7B3, O: 0xA38BF6, w: 0x5AA9F2, n: 0xB9DB67,
                 orbit: 0xE7ECF4, muted: 0x8C99B0, grid: 0x34466A, equator: 0x7A90C0};
  const ARC_SEG = 64;

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
      tracked.push({mat, base, keys, dim});
    },
    line(nPts, color, base, keys, dim, onTop = false) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nPts * 3), 3));
      const m = new THREE.LineBasicMaterial({color, depthTest: !onTop});
      const l = new THREE.Line(g, m);
      l.frustumCulled = false;
      if (onTop) l.renderOrder = 10;
      sceneKit.track(m, base, keys, dim);
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
      const t = ang * k / n;
      pts.push(c.clone().addScaledVector(u, r * Math.cos(t)).addScaledVector(v, r * Math.sin(t)));
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
    orbit:    K.line(257, C.orbit, 1, ['a', 'e', 'n', 'w'], .4),
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

  // --- 3D 空間に貼り付く HTML ラベル ---
  const labels = {};
  function addLabel(id, html, color, keys, cls = '') {
    const el = document.createElement('div');
    el.className = 'lbl ' + cls;
    el.innerHTML = html;
    if (color) el.style.color = color;
    $('#labels').appendChild(el);
    labels[id] = {el, pos: new THREE.Vector3(), keys, focus: 1, hidden: false};
  }
  addLabel('x',    '♈ 春分点方向 X', '#AEB9CC', ['O']);
  addLabel('z',    '北極 Z', '#AEB9CC', null);
  addLabel('t90',  '90°', null, ['O'], 'tick');
  addLabel('t180', '180°', null, ['O'], 'tick');
  addLabel('t270', '270°', null, ['O'], 'tick');
  addLabel('asc',  '☊ 昇交点', 'var(--c-O)', ['O', 'i', 'w']);
  addLabel('desc', '☋ 降交点', 'var(--c-O)', ['O', 'i']);
  addLabel('peri', '近地点', 'var(--c-w)', ['a', 'e', 'w', 'n']);
  addLabel('apo',  '遠地点', 'var(--c-a)', ['a', 'e']);
  addLabel('sat',  '衛星', 'var(--c-n)', ['n']);
  addLabel('angO', '', 'var(--c-O)', ['O'], 'ang');
  addLabel('angI', '', 'var(--c-i)', ['i'], 'ang');
  addLabel('angW', '', 'var(--c-w)', ['w'], 'ang');
  addLabel('angN', '', 'var(--c-n)', ['n'], 'ang');
  addLabel('lenA', '<i>a</i>', 'var(--c-a)', ['a'], 'ang');
  addLabel('lenAE','<i>ae</i>', 'var(--c-e)', ['e'], 'ang');
  addLabel('eqPl', '赤道面', null, ['i', 'O'], 'plane');
  addLabel('orPl', '軌道面', 'var(--c-i)', ['i', 'O'], 'plane');

  /* =======================================================
     4. シーン更新（長さの単位は地球半径 RE = 1）
     ======================================================= */
  let sceneRadius = 3;
  let summary = null;

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
    for (let k = 0; k <= 256; k++) orbitPts.push(posAt(k / 256 * 2 * Math.PI));
    setPoints(obj.orbit, orbitPts);
    const ascPos = posAt(-argp), descPos = posAt(Math.PI - argp);
    const periPos = posAt(0), apoPos = posAt(Math.PI), satPos = posAt(nu);
    const centerPos = P.clone().multiplyScalar(-e * a / RE);
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
     5. 諸元・解説
     ======================================================= */
  const fmtKm = v => `${Math.round(v).toLocaleString('ja-JP')} km`;
  function fmtPeriod(s) {
    if (s < 3 * 3600) return `${(s / 60).toFixed(1)} 分`;
    if (s < 3 * 86400) return `${(s / 3600).toFixed(2)} 時間`;
    return `${(s / 86400).toFixed(2)} 日`;
  }

  function updateReadouts() {
    const s = summary;
    const gDeg = s.flightPathAngle / D2R;
    $('#r-hp').textContent = fmtKm(s.perigeeAlt);
    $('#r-ha').textContent = fmtKm(s.apogeeAlt);
    $('#r-T').textContent = fmtPeriod(s.period);
    $('#r-alt').textContent = fmtKm(s.altitude);
    $('#r-v').textContent = `${s.speed.toFixed(3)} km/s`;
    $('#r-g').textContent = `${gDeg >= 0 ? '+' : ''}${gDeg.toFixed(2)}°`;
    const fmt = (x, d) => x.toFixed(d).padStart(10);
    $('#r-sv').textContent =
      `r = [${s.rECI.map(x => fmt(x, 1)).join(',')} ] km\n` +
      `v = [${s.vECI.map(x => fmt(x, 4)).join(',')} ] km/s`;

    const alert = $('#r-alert');
    if (s.perigeeAlt < 0) alert.innerHTML = '<div class="alert bad">近地点が地表より下にあります。この軌道は地球に衝突します。</div>';
    else if (s.perigeeAlt < 150) alert.innerHTML = '<div class="alert warn">近地点高度が 150 km 未満です。大気抵抗ですぐに落下する高さです。</div>';
    else alert.innerHTML = '';
  }

  /** 現在の値が何を意味するかを一文で返す */
  function interpretValue(key) {
    const {a, e} = state, s = summary;
    switch (key) {
      case 'a':
        return `周期 ${fmtPeriod(s.period)}、平均的な高度はおよそ ${fmtKm(a - OM.RE)}`;
      case 'e':
        return e < 0.001 ? '実質的に円軌道。高度はほぼ一定です'
          : `近地点 ${fmtKm(s.perigeeAlt)} ↔ 遠地点 ${fmtKm(s.apogeeAlt)}（中心のずれ ae = ${fmtKm(a * e)}）`;
      case 'i': {
        const x = state.i;
        if (x < 0.05) return '赤道軌道（順行）。昇交点は存在しません';
        if (x > 179.95) return '赤道軌道（逆行）。昇交点は存在しません';
        if (x > 96 && x < 100.5 && a < 8200) return '逆行寄りの極軌道。太陽同期軌道に近い傾き';
        if (Math.abs(x - 90) < 0.5) return '極軌道。両極の真上を通ります';
        return x < 90 ? `順行軌道（東向き）。緯度 ±${x.toFixed(1)}° までの地域を通過`
                      : `逆行軌道（西向き）。緯度 ±${(180 - x).toFixed(1)}° までの地域を通過`;
      }
      case 'O':
        return (state.i < 0.05 || state.i > 179.95) ? '軌道面が赤道面と重なっているため、Ω は意味を持ちません'
          : `昇交点は ♈ から東へ ${state.O.toFixed(1)}° の方角`;
      case 'w': {
        if (e < 1e-4) return '円軌道なので近地点がなく、ω は意味を持ちません';
        const lat = Math.asin(Math.sin(state.i * D2R) * Math.sin(state.w * D2R)) / D2R;
        return `近地点は緯度 ${lat >= 0 ? '北' : '南'} ${Math.abs(lat).toFixed(1)}° の上空（遠地点はその反対側）`;
      }
      case 'n': {
        const x = state.n;
        const where = (x < 2 || x > 358) ? '近地点付近（最も速い）'
          : Math.abs(x - 180) < 2 ? '遠地点付近（最も遅い）'
          : x < 180 ? '近地点を過ぎて上昇中' : '近地点へ向けて降下中';
        return `${where}。速度 ${s.speed.toFixed(3)} km/s、高度 ${fmtKm(s.altitude)}`;
      }
    }
    return '';
  }

  const OVERVIEW_HTML = `
    <div class="ex-h"><b>6要素は「形 → 面 → 向き → 位置」の順に決まる</b></div>
    <div class="order">
      <span><i style="color:var(--c-a)">a</i>・<i style="color:var(--c-e)">e</i> 楕円の大きさと形</span><span class="arrow">→</span>
      <span><i style="color:var(--c-i)">i</i>・<i style="color:var(--c-O)">Ω</i> 軌道面を傾けて回す</span><span class="arrow">→</span>
      <span><i style="color:var(--c-w)">ω</i> 面内で楕円を回す</span><span class="arrow">→</span>
      <span><i style="color:var(--c-n)">ν</i> 衛星を置く</span>
    </div>
    <p class="tech">近点座標系 → ECI：R = R<sub>z</sub>(Ω) · R<sub>x</sub>(i) · R<sub>z</sub>(ω)（3-1-3 回転）</p>`;

  function renderExplain() {
    const box = $('#explain');
    const key = focusKey();
    if (!key) { box.innerHTML = OVERVIEW_HTML; return; }
    const E = ELEMENTS[key];
    box.innerHTML = `
      <div class="ex-h">
        <span class="s" style="color:var(--c-${key})">${E.sym}</span><b>${E.name}</b><span class="k">${E.what}</span>
        ${pinnedKey === key ? '<button class="x" type="button" id="unpin">強調を解除</button>' : ''}
      </div>
      <p class="ex-en">${E.en}</p>
      <p>${E.desc}</p>
      <p class="now">${interpretValue(key)}</p>`;
    const unpin = $('#unpin');
    if (unpin) unpin.addEventListener('click', () => { pinnedKey = null; refreshFocus(); });
  }

  /* =======================================================
     6. 強調表示
     ======================================================= */
  const isRelated = (keys, key) => !key || !keys || keys.includes(key);

  function refreshFocus() {
    const key = focusKey();
    tracked.forEach(t => { t.mat.opacity = isRelated(t.keys, key) ? t.base : t.base * t.dim; });
    for (const id in labels) labels[id].focus = isRelated(labels[id].keys, key) ? 1 : 0.1;
    document.querySelectorAll('.el').forEach(row => {
      const k = row.dataset.k;
      row.classList.toggle('on', k === key);
      row.classList.toggle('pin', k === pinnedKey);
      row.classList.toggle('dim', !!key && k !== key);
      row.querySelector('.el-head').setAttribute('aria-pressed', String(k === pinnedKey));
    });
    renderExplain();
  }

  /* =======================================================
     7. 視点・再生
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
      const t = toScene(v);
      if (Math.abs(t.clone().normalize().y) > 0.999) t.add(new THREE.Vector3(0.02, 0, 0.02));
      return t;
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
  let speedMode = 'lap';      // 'lap' = 1周8秒、数値 = 実時間の倍率
  const ICON_PLAY  = '<svg viewBox="0 0 10 10"><path d="M1 0l9 5-9 5z"/></svg><span>再生</span>';
  const ICON_PAUSE = '<svg viewBox="0 0 10 10"><path d="M1 0h3v10H1zM6 0h3v10H6z"/></svg><span>停止</span>';

  function setPlaying(on) {
    playing = on;
    $('#play').innerHTML = on ? ICON_PAUSE : ICON_PLAY;
  }

  /** 平均近点角を一定速度で進め、ケプラー方程式で真近点角に戻す */
  function advanceTrueAnomaly(dt) {
    if (!playing) return;
    const meanMotion = Math.sqrt(OM.MU / state.a ** 3);
    const dM = speedMode === 'lap' ? 2 * Math.PI * dt / 8 : meanMotion * dt * Number(speedMode);
    const M = OM.trueToMeanAnomaly(state.n * D2R, state.e) + dM;
    state.n = wrap360(OM.meanToTrueAnomaly(M, state.e) / D2R);
    setInputValue('n', state.n);
    updateScene();
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
    const t = (-Bq - Math.sqrt(disc)) / (2 * A);
    return t > 0 && t < 0.995;
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
    advanceTrueAnomaly(dt);
    stepCameraTween(now);
    controls.update();
    renderer.render(scene, camera);
    placeLabels();
    requestAnimationFrame(frame);
  }

  /* =======================================================
     8. 起動
     ======================================================= */
  buildElementRows();
  buildPresets();
  bindGlossary();
  bindSegmented('#views', kind => flyTo(viewDirection(kind), fitDistance()));
  bindSegmented('#speed', v => { speedMode = v; });
  $('#play').addEventListener('click', () => setPlaying(!playing));
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && pinnedKey) { pinnedKey = null; refreshFocus(); }
  });
  new ResizeObserver(resize).observe(stage);

  setPlaying(false);
  refreshAll();
  resize();
  flyTo(viewDirection('oblique'), fitDistance(), true);
  requestAnimationFrame(frame);
})();
