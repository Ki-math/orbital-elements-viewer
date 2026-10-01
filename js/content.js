/**
 * content.js
 * 画面に表示する「内容」の定義：要素の説明、グループ分け、代表軌道、用語集。
 * 文言はすべて {ja, en} の2言語で持つ。文言や範囲を変えたいときはこのファイルだけを編集する。
 *
 * 状態のキー：a [km], e [-], i [deg], O = Ω [deg], w = ω [deg], n = ν [deg]
 */
(function (global) {
  'use strict';

  /** 各軌道要素の表示情報とスライダー範囲。alt はもう一方の言語での名称 */
  const ELEMENTS = {
    a: {sym: 'a', unit: 'km', min: 6500, max: 60000, step: 1, dec: 0,
        ja: {name: '軌道長半径', alt: 'semi-major axis', what: '軌道の大きさ',
             desc: '楕円の長い方の直径の半分。大きいほど地球から遠く、1周にかかる時間が長くなります。周期は a だけで決まります。'},
        en: {name: 'Semi-major axis', alt: '軌道長半径', what: 'Size of the orbit',
             desc: 'Half of the longest diameter of the ellipse. A larger value means farther from Earth and a longer trip around it. The period depends on a alone.'}},
    e: {sym: 'e', unit: '', min: 0, max: 0.95, step: 0.0001, dec: 4,
        ja: {name: '離心率', alt: 'eccentricity', what: '軌道のつぶれ具合',
             desc: '0 で真円、1 に近づくほど細長い楕円。地球は楕円の中心ではなく焦点にあるので、中心からのずれ ae が生まれます。'},
        en: {name: 'Eccentricity', alt: '離心率', what: 'How stretched the ellipse is',
             desc: '0 is a perfect circle; values near 1 give a long, thin ellipse. Earth sits at a focus, not at the center, so the center is offset from Earth by ae.'}},
    i: {sym: 'i', unit: '°', min: 0, max: 180, step: 0.1, dec: 1,
        ja: {name: '軌道傾斜角', alt: 'inclination', what: '軌道面の傾き',
             desc: '赤道面と軌道面のなす角。昇交点で2つの面の接線がなす角として測ります。0° は赤道軌道、90° は極軌道、90° を超えると逆行（西向き）です。'},
        en: {name: 'Inclination', alt: '軌道傾斜角', what: 'Tilt of the orbital plane',
             desc: 'The angle between the equatorial plane and the orbital plane, measured at the ascending node. 0° is equatorial, 90° is polar, and above 90° the orbit runs westward (retrograde).'}},
    O: {sym: 'Ω', unit: '°', min: 0, max: 360, step: 0.1, dec: 1,
        ja: {name: '昇交点赤経', alt: 'RAAN（Right Ascension of the Ascending Node）', what: 'どの方角に向けて傾けるか',
             desc: '衛星が南から北へ赤道面を横切る点が昇交点 ☊。春分点方向 ♈ から東回りに測ったその方角です。軌道面を地軸のまわりに回す角と考えると分かりやすいです。'},
        en: {name: 'RAAN', alt: '昇交点赤経（Right Ascension of the Ascending Node）', what: 'Which direction the tilt faces',
             desc: 'The ascending node ☊ is where the satellite crosses the equator going north. RAAN is its direction, measured eastward from the vernal equinox ♈. Think of it as spinning the tilted plane around Earth’s axis.'}},
    w: {sym: 'ω', unit: '°', min: 0, max: 360, step: 0.1, dec: 1,
        ja: {name: '近地点引数', alt: 'argument of perigee', what: '軌道面の中での楕円の向き',
             desc: '昇交点から衛星の進行方向に測った、近地点までの角度。軌道面を固定したまま、その面の中で楕円を回します。'},
        en: {name: 'Argument of perigee', alt: '近地点引数', what: 'Orientation of the ellipse within the plane',
             desc: 'The angle from the ascending node to perigee, measured in the direction of motion. It rotates the ellipse inside the plane without moving the plane.'}},
    n: {sym: 'ν', unit: '°', min: 0, max: 360, step: 0.1, dec: 1,
        ja: {name: '真近点角', alt: 'true anomaly', what: 'いま衛星がどこにいるか',
             desc: '近地点から進行方向に測った衛星の位置角。6要素のうち、これだけが時間とともに変わります。近地点付近では速く、遠地点付近ではゆっくり進みます。'},
        en: {name: 'True anomaly', alt: '真近点角', what: 'Where the satellite is now',
             desc: 'The satellite’s angle from perigee, measured in the direction of motion. It is the only element that changes with time in a pure two-body orbit: fast near perigee, slow near apogee.'}},
  };

  /** 「形 → 面 → 向き → 位置」の組み立て順 */
  const GROUPS = [
    {keys: ['a', 'e'], ja: {title: '大きさと形',   note: '楕円そのもの'},           en: {title: 'Size and shape',   note: 'the ellipse itself'}},
    {keys: ['i', 'O'], ja: {title: '軌道面の傾き', note: '楕円を載せる面'},         en: {title: 'Orbital plane',    note: 'the plane holding the ellipse'}},
    {keys: ['w'],      ja: {title: '面内の向き',   note: '面の中で楕円を回す'},     en: {title: 'In-plane orientation', note: 'rotate the ellipse in the plane'}},
    {keys: ['n'],      ja: {title: '衛星の位置',   note: '時間で変わる唯一の要素'}, en: {title: 'Satellite position',   note: 'the only element that moves'}},
  ];

  /** 代表的な軌道。ISS は 2026-09-30 の TLE の値、その他の Ω・ω・ν は見やすさ優先の例示値 */
  const PRESETS = [
    {id: 'iss', ja: 'ISS',             en: 'ISS',            el: {a: 6797,  e: 0.0007, i: 51.63, O: 139.1, w: 206.2, n: 30}},
    {id: 'sso', ja: '太陽同期 700 km', en: 'Sun-sync 700 km', el: {a: 7078,  e: 0.001,  i: 98.19, O: 100,   w: 90,    n: 30}},
    {id: 'gps', ja: 'GPS',             en: 'GPS',            el: {a: 26560, e: 0.01,   i: 55,    O: 30,    w: 40,    n: 60}},
    {id: 'geo', ja: '静止軌道',        en: 'GEO',            el: {a: 42164, e: 0,      i: 0,     O: 0,     w: 0,     n: 45}},
    {id: 'gto', ja: 'GTO',             en: 'GTO',            el: {a: 24371, e: 0.7302, i: 28.5,  O: 30,    w: 180,   n: 20}},
    {id: 'mol', ja: 'モルニヤ',        en: 'Molniya',        el: {a: 26600, e: 0.74,   i: 63.4,  O: 60,    w: 270,   n: 180}},
  ];

  /**
   * 用語集。key は関係する要素（カーソルを合わせると3D図のその要素が光る）、color はドットの色。
   * figure: 'equinox' のものは春分点の説明図を付ける。
   */
  const GLOSSARY = [
    {key: 'O', color: '#AEB9CC', figure: 'equinox',
     ja: {term: '春分点 ♈', alt: 'vernal equinox',
          body: '宇宙空間での<b>方角の基準（0°）</b>です。春分の日に地球から見た太陽の方向で、恒星に対してほぼ動きません。地球が自転しても公転しても向きが変わらないので、地図の「北」のように使えます。図の ♈ 矢印（X軸）がこれです。'},
     en: {term: 'Vernal equinox ♈', alt: '春分点',
          body: 'The <b>reference direction (0°)</b> in space: the direction of the Sun seen from Earth at the March equinox. It is nearly fixed against the stars and does not turn with Earth’s spin or orbit, so it works like “north” on a map. It is the ♈ arrow (X axis) in the view.'}},
    {key: 'O', color: 'var(--c-O)',
     ja: {term: '赤経', alt: 'right ascension',
          body: '宇宙空間での<b>東西方向の角度</b>。春分点を 0° として、赤道面上を東回り（北極から見て反時計回り）に測ります。地球の経度に似ていますが、地球と一緒には回りません。'},
     en: {term: 'Right ascension', alt: '赤経',
          body: 'The <b>east–west angle</b> in space, measured eastward along the equator (counter-clockwise seen from the north pole) from the vernal equinox. Like longitude, but it does not rotate with Earth.'}},
    {key: 'O', color: 'var(--c-O)',
     ja: {term: '昇交点 ☊ ／ 降交点 ☋', alt: 'ascending / descending node',
          body: '軌道が赤道面を横切る2点。衛星が<b>南から北へ</b>抜ける点が昇交点、北から南へ抜ける点が降交点です。2点を結ぶ直線を<b>交点線</b>と呼び、赤道面と軌道面の交わる線でもあります。'},
     en: {term: 'Ascending ☊ / descending ☋ node', alt: '昇交点／降交点',
          body: 'The two points where the orbit crosses the equatorial plane. Crossing <b>south to north</b> is the ascending node; north to south is the descending node. The line joining them, the <b>line of nodes</b>, is where the two planes meet.'}},
    {key: 'O', color: 'var(--c-O)',
     ja: {term: 'RAAN（昇交点赤経 Ω）', alt: 'Right Ascension of the Ascending Node',
          body: '英語名を分解すると「昇交点（Ascending Node）の赤経（Right Ascension）」。つまり<b>昇交点が春分点から東へ何度の方角にあるか</b>です。傾けた軌道面を地軸のまわりにどれだけ回したかを表します。'},
     en: {term: 'RAAN (Ω)', alt: '昇交点赤経',
          body: 'Read the name literally: the right ascension of the ascending node, i.e. <b>how many degrees east of the vernal equinox the ascending node lies</b>. It tells how far the tilted plane has been turned around Earth’s axis.'}},
    {key: 'i', color: 'var(--c-i)',
     ja: {term: '赤道面 ／ 軌道面', alt: 'equatorial / orbital plane',
          body: '赤道面は地球の赤道を含む平面（図の青い円盤）。軌道面は衛星の軌道を含む平面（緑の円盤）。この2枚の面のなす角が軌道傾斜角 <i>i</i> です。'},
     en: {term: 'Equatorial / orbital plane', alt: '赤道面／軌道面',
          body: 'The equatorial plane contains Earth’s equator (blue disc). The orbital plane contains the orbit (green disc). The angle between them is the inclination <i>i</i>.'}},
    {key: 'i', color: 'var(--c-i)',
     ja: {term: '順行 ／ 逆行', alt: 'prograde / retrograde',
          body: '地球の自転と同じ東向きに回るのが順行（<i>i</i> &lt; 90°）、西向きに回るのが逆行（<i>i</i> &gt; 90°）。太陽同期軌道は <i>i</i> ≈ 98° のわずかな逆行軌道です。'},
     en: {term: 'Prograde / retrograde', alt: '順行／逆行',
          body: 'Prograde orbits go east like Earth’s spin (<i>i</i> &lt; 90°); retrograde orbits go west (<i>i</i> &gt; 90°). Sun-synchronous orbits are slightly retrograde, around <i>i</i> ≈ 98°.'}},
    {key: 'w', color: 'var(--c-w)',
     ja: {term: '近地点 ／ 遠地点', alt: 'perigee / apogee',
          body: '楕円軌道で地球に最も近い点と最も遠い点。一般の天体では近点・遠点（periapsis / apoapsis）と呼びます。2点を結ぶ直線が<b>長軸線</b>で、その長さの半分が <i>a</i> です。'},
     en: {term: 'Perigee / apogee', alt: '近地点／遠地点',
          body: 'The closest and farthest points of the orbit from Earth (periapsis / apoapsis for a general body). The line through them is the <b>line of apsides</b>; half its length is <i>a</i>.'}},
    {key: 'e', color: 'var(--c-e)',
     ja: {term: '焦点', alt: 'focus',
          body: '楕円には焦点が2つあり、地球の中心はその片方に位置します（ケプラーの第1法則）。楕円の中心から焦点までの距離が <i>ae</i> です。'},
     en: {term: 'Focus', alt: '焦点',
          body: 'An ellipse has two foci, and Earth’s center sits at one of them (Kepler’s first law). The distance from the ellipse’s center to that focus is <i>ae</i>.'}},
    {key: 'n', color: 'var(--c-n)',
     ja: {term: '3種類の近点角', alt: 'true / eccentric / mean anomaly',
          body: 'どれも「近地点から衛星がどれだけ進んだか」を表す角度です。<b>真近点角 ν</b> は実際の幾何学的な角度。<b>平均近点角 M</b> は時間に比例して一定の速さで増える架空の角度。<b>離心近点角 E</b> は両者をつなぐ補助角で、ケプラー方程式 M = E − e sin E で結ばれます。円軌道では3つとも一致します。'},
     en: {term: 'Three anomalies', alt: '真／離心／平均近点角',
          body: 'All three measure how far the satellite has moved from perigee. The <b>true anomaly ν</b> is the actual geometric angle. The <b>mean anomaly M</b> is a fictitious angle that grows at a constant rate with time. The <b>eccentric anomaly E</b> links them through Kepler’s equation M = E − e sin E. On a circular orbit all three are equal.'}},
    {key: 'O', color: 'var(--c-j2)',
     ja: {term: 'J2 摂動 ／ 交点の後退', alt: 'J2 perturbation / nodal regression',
          body: '地球は赤道が約21 km膨らんだ形をしています。この<b>赤道の膨らみ</b>が傾いた軌道面を赤道側へ引くため、軌道面はコマの首振りのように地軸のまわりを回ります。順行軌道では Ω が西向きに減り（交点の後退）、逆行軌道では東向きに増えます。高度が低く、傾斜角が小さいほど速く回ります。'},
     en: {term: 'J2 perturbation / nodal regression', alt: 'J2 摂動／交点の後退',
          body: 'Earth bulges about 21 km at the equator. This <b>equatorial bulge</b> pulls a tilted orbit toward the equator, so the plane precesses around Earth’s axis like a spinning top. Prograde orbits drift westward (Ω decreases: nodal regression); retrograde orbits drift eastward. Lower and less inclined orbits precess faster.'}},
    {key: 'O', color: 'var(--c-j2)',
     ja: {term: '太陽同期軌道', alt: 'sun-synchronous orbit',
          body: 'J2 による Ω の回転を、地球の公転と同じ<b>1日約 +0.986°（1年で1周）</b>に合わせた軌道。軌道面と太陽の向きの関係が保たれ、毎回同じ地方時に同じ場所の上空を通ります。低軌道では <i>i</i> ≈ 97〜99° になります。'},
     en: {term: 'Sun-synchronous orbit', alt: '太陽同期軌道',
          body: 'An orbit whose J2-driven Ω rotation matches Earth’s motion around the Sun, <b>about +0.986° per day (one turn per year)</b>. The plane keeps the same angle to the Sun, so the satellite passes over each place at the same local time. In low orbit this needs <i>i</i> ≈ 97–99°.'}},
    {key: '', color: 'var(--muted)',
     ja: {term: '地心赤道慣性系（ECI）', alt: 'Earth-Centered Inertial',
          body: '地球の中心を原点とし、X軸を春分点方向、Z軸を北極方向、Y軸をそれらと直交する向きに取った座標系。地球の自転と一緒に回らないため、軌道を記述する標準の座標系です。'},
     en: {term: 'Earth-Centered Inertial (ECI)', alt: '地心赤道慣性系',
          body: 'A frame with its origin at Earth’s center, X toward the vernal equinox, Z toward the north pole and Y completing the right-handed set. It does not rotate with Earth, so it is the standard frame for describing orbits.'}},
  ];

  /** 春分点の説明図の文字（言語ごと） */
  const EQUINOX_FIGURE = {
    ja: {orbit: '地球の公転軌道', sun: '太陽', dir: '♈ 春分点方向', day: '春分の日', later: '3か月後', same: '向きは同じ',
         aria: '春分の日に地球から太陽を見た方向が春分点方向。3か月後の地球から見ても同じ向きを指す'},
    en: {orbit: 'Earth’s orbit', sun: 'Sun', dir: '♈ equinox direction', day: 'March equinox', later: '3 months later', same: 'same direction',
         aria: 'The vernal equinox direction is the Sun’s direction at the March equinox, and it still points the same way three months later'},
  };

  global.OrbitContent = {ELEMENTS, GROUPS, PRESETS, GLOSSARY, EQUINOX_FIGURE};
})(window);
