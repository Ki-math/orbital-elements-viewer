/**
 * i18n.js
 * 画面の固定文言（ボタン、見出し、警告、解説の言い回し）の日英辞書と、言語の切り替え。
 *
 *   I18n.lang                 現在の言語 'ja' | 'en'
 *   I18n.t(key, ...args)      文言を取り出す（値が関数なら args を渡して呼ぶ）
 *   I18n.setLang(lang)        言語を切り替え、登録済みのリスナーを呼ぶ
 *   I18n.onChange(fn)         切り替え時に呼ぶ関数を登録
 *   I18n.applyStatic(root)    data-i18n / data-i18n-aria 属性を持つ要素の文言を書き換える
 *
 * 要素の説明や用語集など「内容」の文言は content.js 側に {ja, en} で持たせている。
 */
(function (global) {
  'use strict';

  const STRINGS = {
    ja: {
      title: '軌道6要素ビューア',
      lead: 'スライダーを動かすと、その要素に関係する線と角度だけが強調されます。行の名前をクリックすると強調を固定できます（Esc で解除）。',
      presets: '代表的な軌道',
      readouts: 'この軌道の諸元',
      glossary: '用語集　カーソルを合わせると図の該当部分が光ります',
      langLabel: '表示言語',
      canvasAria: '軌道の3D表示。ドラッグで回転、ホイールでズーム',
      play: '再生', pause: '停止',
      speedAria: '再生速度', viewsAria: '視点',
      speedLap: '1周8秒', speedDay: '1日/秒', speedDay10: '10日/秒',
      viewOblique: '斜めから', viewNorth: '北極の上から', viewNode: '昇交点方向から', viewPlane: '軌道面の真上から',
      unpin: '強調を解除',
      // 諸元
      rPerigee: '近地点高度', rApogee: '遠地点高度', rPeriod: '周期',
      rAlt: 'いまの高度', rSpeed: 'いまの速度', rGamma: '飛行経路角 γ',
      alertCrash: '近地点が地表より下にあります。この軌道は地球に衝突します。',
      alertLow: '近地点高度が 150 km 未満です。大気抵抗ですぐに落下する高さです。',
      warnNoNode: '傾斜角が 0° / 180° のため軌道面と赤道面が重なり、昇交点が存在しません。Ω は形式上の値です。',
      warnNoPerigee: '離心率が 0 のため近地点が決まらず、ω は形式上の値です。',
      footer: '二体問題 μ = 398600.4418 km³/s²　Rₑ = 6378.137 km　J₂ = 1.0826×10⁻³<br>座標系：地心赤道慣性系（X = 春分点方向, Z = 北極）',
      // 3D ラベル
      lblX: '♈ 春分点方向 X', lblZ: '北極 Z', lblAsc: '☊ 昇交点', lblDesc: '☋ 降交点',
      lblPeri: '近地点', lblApo: '遠地点', lblSat: '衛星', lblEq: '赤道面', lblOrb: '軌道面',
      // 単位・書式
      km: v => `${Math.round(v).toLocaleString('ja-JP')} km`,
      minutes: v => `${v.toFixed(1)} 分`, hours: v => `${v.toFixed(2)} 時間`, days: v => `${v.toFixed(2)} 日`,
      // 概要カード
      overviewTitle: '6要素は「形 → 面 → 向き → 位置」の順に決まる',
      ovShape: '楕円の大きさと形', ovPlane: '軌道面を傾けて回す', ovOrient: '面内で楕円を回す', ovPlace: '衛星を置く',
      ovTech: '近点座標系 → ECI：R = R<sub>z</sub>(Ω) · R<sub>x</sub>(i) · R<sub>z</sub>(ω)（3-1-3 回転）',
      // 値の解釈
      itA: (T, h) => `周期 ${T}、平均的な高度はおよそ ${h}`,
      itECirc: '実質的に円軌道。高度はほぼ一定です',
      itE: (hp, ha, ae) => `近地点 ${hp} ↔ 遠地点 ${ha}（中心のずれ ae = ${ae}）`,
      itIEqPro: '赤道軌道（順行）。昇交点は存在しません',
      itIEqRetro: '赤道軌道（逆行）。昇交点は存在しません',
      itISso: '逆行寄りの極軌道。太陽同期軌道に近い傾き',
      itIPolar: '極軌道。両極の真上を通ります',
      itIPro: x => `順行軌道（東向き）。緯度 ±${x}° までの地域を通過`,
      itIRetro: x => `逆行軌道（西向き）。緯度 ±${x}° までの地域を通過`,
      itONone: '軌道面が赤道面と重なっているため、Ω は意味を持ちません',
      itO: x => `昇交点は ♈ から東へ ${x}° の方角`,
      itWNone: '円軌道なので近地点がなく、ω は意味を持ちません',
      itW: (north, lat) => `近地点は緯度 ${north ? '北' : '南'} ${lat}° の上空（遠地点はその反対側）`,
      itNPeri: '近地点付近（最も速い）', itNApo: '遠地点付近（最も遅い）',
      itNUp: '近地点を過ぎて上昇中', itNDown: '近地点へ向けて降下中',
      itN: (where, v, h) => `${where}。速度 ${v} km/s、高度 ${h}`,
      // J2
      j2Title: 'J2 摂動（地球の扁平）',
      j2Toggle: '交点の後退を表示',
      j2Hint: 'オンにして再生すると、赤道の膨らみによって軌道面が回る様子を表示します。日単位の速度も選べます。',
      j2RaanDot: 'Ω の変化（dΩ/dt）', j2ArgpDot: 'ω の変化（dω/dt）',
      j2Cycle: '交点が1周する日数', j2Elapsed: '経過時間', j2DeltaO: 'Ω の累積変化',
      j2Reset: '開始状態に戻す',
      perDay: v => `${v >= 0 ? '+' : ''}${v.toFixed(3)} °/日`,
      west: '西向き', east: '東向き', stopped: '停止',
      dayCount: v => Number.isFinite(v) ? `${v.toLocaleString('ja-JP', {maximumFractionDigits: 1})} 日` : '— （回らない）',
      elapsed: d => `${d.toFixed(2)} 日`,
      deltaO: (v, dir) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}°（${dir}）`,
      j2Frozen: '衛星の位置は日単位の再生中は固定しています（1秒に何十周もするため）。',
      j2Sso: '太陽同期：Ω が地球の公転と同じ速さで回っています。',
      j2Critical: '臨界傾斜角：ω がほとんど回りません（モルニヤ軌道が使う性質）。',
      j2Polar: '極軌道：赤道の膨らみの引っぱりが打ち消し合い、Ω は回りません。',
      j2CardTitle: 'J2 摂動：交点の後退',
      j2CardBody: '赤道の膨らみが傾いた軌道面を赤道側へ引くため、軌道面はコマの首振りのように地軸のまわりを回ります。ピンクの線が昇交点の軌跡、薄いピンクの楕円が過去の軌道面です。',
      j2CardNow: (rate, dir, cycle) => `いま：dΩ/dt = ${rate}（${dir}）、1周 ${cycle}`,
    },

    en: {
      title: 'Orbital Elements Viewer',
      lead: 'Move a slider and only the lines and angles tied to that element light up. Click an element’s name to keep it highlighted (Esc to release).',
      presets: 'Example orbits',
      readouts: 'Orbit summary',
      glossary: 'Glossary — hover a term to highlight it in the view',
      langLabel: 'Language',
      canvasAria: '3D view of the orbit. Drag to rotate, scroll to zoom',
      play: 'Play', pause: 'Pause',
      speedAria: 'Playback speed', viewsAria: 'Viewpoint',
      speedLap: '1 orbit / 8 s', speedDay: '1 day/s', speedDay10: '10 days/s',
      viewOblique: 'Oblique', viewNorth: 'From north pole', viewNode: 'Along node line', viewPlane: 'Face-on to orbit',
      unpin: 'Release',
      rPerigee: 'Perigee altitude', rApogee: 'Apogee altitude', rPeriod: 'Period',
      rAlt: 'Current altitude', rSpeed: 'Current speed', rGamma: 'Flight-path angle γ',
      alertCrash: 'Perigee is below the surface. This orbit hits the Earth.',
      alertLow: 'Perigee is below 150 km. Atmospheric drag would bring it down almost at once.',
      warnNoNode: 'With inclination 0° / 180° the orbit lies in the equatorial plane, so there is no ascending node. Ω is only nominal.',
      warnNoPerigee: 'With eccentricity 0 there is no perigee, so ω is only nominal.',
      footer: 'Two-body, μ = 398600.4418 km³/s², Rₑ = 6378.137 km, J₂ = 1.0826×10⁻³<br>Frame: Earth-centered inertial (X = vernal equinox, Z = north pole)',
      lblX: '♈ Vernal equinox X', lblZ: 'North pole Z', lblAsc: '☊ Asc. node', lblDesc: '☋ Desc. node',
      lblPeri: 'Perigee', lblApo: 'Apogee', lblSat: 'Satellite', lblEq: 'Equatorial plane', lblOrb: 'Orbital plane',
      km: v => `${Math.round(v).toLocaleString('en-US')} km`,
      minutes: v => `${v.toFixed(1)} min`, hours: v => `${v.toFixed(2)} h`, days: v => `${v.toFixed(2)} days`,
      overviewTitle: 'The six elements build an orbit in order: shape → plane → orientation → position',
      ovShape: 'size and shape', ovPlane: 'tilt and turn the plane', ovOrient: 'rotate ellipse in plane', ovPlace: 'place the satellite',
      ovTech: 'Perifocal → ECI: R = R<sub>z</sub>(Ω) · R<sub>x</sub>(i) · R<sub>z</sub>(ω) (3-1-3 rotation)',
      itA: (T, h) => `Period ${T}; mean altitude about ${h}`,
      itECirc: 'Effectively circular; altitude stays nearly constant',
      itE: (hp, ha, ae) => `Perigee ${hp} ↔ apogee ${ha} (center offset ae = ${ae})`,
      itIEqPro: 'Equatorial, prograde. There is no ascending node',
      itIEqRetro: 'Equatorial, retrograde. There is no ascending node',
      itISso: 'Slightly retrograde polar orbit, close to sun-synchronous',
      itIPolar: 'Polar orbit; passes over both poles',
      itIPro: x => `Prograde (eastward); covers latitudes up to ±${x}°`,
      itIRetro: x => `Retrograde (westward); covers latitudes up to ±${x}°`,
      itONone: 'The orbit lies in the equatorial plane, so Ω has no meaning',
      itO: x => `The ascending node lies ${x}° east of ♈`,
      itWNone: 'A circular orbit has no perigee, so ω has no meaning',
      itW: (north, lat) => `Perigee is over latitude ${lat}° ${north ? 'N' : 'S'} (apogee on the opposite side)`,
      itNPeri: 'Near perigee (fastest)', itNApo: 'Near apogee (slowest)',
      itNUp: 'Past perigee, climbing', itNDown: 'Descending toward perigee',
      itN: (where, v, h) => `${where}. Speed ${v} km/s, altitude ${h}`,
      j2Title: 'J2 perturbation (Earth’s oblateness)',
      j2Toggle: 'Show nodal regression',
      j2Hint: 'Turn this on and press Play to watch the equatorial bulge turn the orbital plane. Day-scale speeds become available.',
      j2RaanDot: 'Ω rate (dΩ/dt)', j2ArgpDot: 'ω rate (dω/dt)',
      j2Cycle: 'Days for one node cycle', j2Elapsed: 'Elapsed time', j2DeltaO: 'Total change in Ω',
      j2Reset: 'Back to start',
      perDay: v => `${v >= 0 ? '+' : ''}${v.toFixed(3)} °/day`,
      west: 'westward', east: 'eastward', stopped: 'none',
      dayCount: v => Number.isFinite(v) ? `${v.toLocaleString('en-US', {maximumFractionDigits: 1})} days` : '— (no rotation)',
      elapsed: d => `${d.toFixed(2)} days`,
      deltaO: (v, dir) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}° (${dir})`,
      j2Frozen: 'At day-scale speeds the satellite is held still (it would circle dozens of times per second).',
      j2Sso: 'Sun-synchronous: Ω turns at the same rate as Earth around the Sun.',
      j2Critical: 'Critical inclination: ω barely moves (the property Molniya orbits use).',
      j2Polar: 'Polar orbit: the bulge’s pull cancels out, so Ω does not turn.',
      j2CardTitle: 'J2 perturbation: nodal regression',
      j2CardBody: 'The equatorial bulge pulls the tilted orbit toward the equator, so the plane precesses around Earth’s axis like a spinning top. The pink line traces the ascending node; faint pink ellipses are earlier orbital planes.',
      j2CardNow: (rate, dir, cycle) => `Now: dΩ/dt = ${rate} (${dir}), one cycle in ${cycle}`,
    },
  };

  const STORAGE_KEY = 'orbital-elements-viewer.lang';
  const listeners = [];

  function initialLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'ja' || saved === 'en') return saved;
    } catch (_) { /* ストレージが使えない環境では無視 */ }
    return (navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en';
  }

  const I18n = {
    lang: initialLang(),

    t(key, ...args) {
      const v = STRINGS[I18n.lang][key] ?? STRINGS.ja[key];
      return typeof v === 'function' ? v(...args) : v;
    },

    setLang(lang) {
      if (lang !== 'ja' && lang !== 'en') return;
      I18n.lang = lang;
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) { /* 保存できなくても動作は続ける */ }
      listeners.forEach(fn => fn(lang));
    },

    onChange(fn) { listeners.push(fn); },

    applyStatic(root = document) {
      document.documentElement.lang = I18n.lang;
      document.title = I18n.t('title');
      root.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = I18n.t(el.dataset.i18n); });
      root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', I18n.t(el.dataset.i18nAria)); });
    },
  };

  global.I18n = I18n;
})(window);
