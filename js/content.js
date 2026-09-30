/**
 * content.js
 * 画面に表示する要素の定義・グループ分け・代表軌道のプリセット。
 * 文言や範囲を変えたいときはこのファイルだけを編集すればよい。
 *
 * 状態のキー：a [km], e [-], i [deg], O = Ω [deg], w = ω [deg], n = ν [deg]
 */
(function (global) {
  'use strict';

  /** 各軌道要素の表示情報とスライダー範囲 */
  const ELEMENTS = {
    a: {sym: 'a', name: '軌道長半径', en: 'semi-major axis', what: '軌道の大きさ',
        unit: 'km', min: 6500, max: 60000, step: 1, dec: 0,
        desc: '楕円の長い方の直径の半分。大きいほど地球から遠く、1周にかかる時間が長くなります。周期は a だけで決まります。'},
    e: {sym: 'e', name: '離心率', en: 'eccentricity', what: '軌道のつぶれ具合',
        unit: '', min: 0, max: 0.95, step: 0.0001, dec: 4,
        desc: '0 で真円、1 に近づくほど細長い楕円。地球は楕円の中心ではなく焦点にあるので、中心からのずれ ae が生まれます。'},
    i: {sym: 'i', name: '軌道傾斜角', en: 'inclination', what: '軌道面の傾き',
        unit: '°', min: 0, max: 180, step: 0.1, dec: 1,
        desc: '赤道面と軌道面のなす角。昇交点で2つの面の接線がなす角として測ります。0° は赤道軌道、90° は極軌道、90° を超えると逆行（西向き）です。'},
    O: {sym: 'Ω', name: '昇交点赤経', en: 'RAAN（Right Ascension of the Ascending Node）', what: 'どの方角に向けて傾けるか',
        unit: '°', min: 0, max: 360, step: 0.1, dec: 1,
        desc: '衛星が南から北へ赤道面を横切る点が昇交点 ☊。春分点方向 ♈ から東回りに測ったその方角です。軌道面を地軸のまわりに回す角と考えると分かりやすいです。'},
    w: {sym: 'ω', name: '近地点引数', en: 'argument of perigee', what: '軌道面の中での楕円の向き',
        unit: '°', min: 0, max: 360, step: 0.1, dec: 1,
        desc: '昇交点から衛星の進行方向に測った、近地点までの角度。軌道面を固定したまま、その面の中で楕円を回します。'},
    n: {sym: 'ν', name: '真近点角', en: 'true anomaly', what: 'いま衛星がどこにいるか',
        unit: '°', min: 0, max: 360, step: 0.1, dec: 1,
        desc: '近地点から進行方向に測った衛星の位置角。6要素のうち、これだけが時間とともに変わります。近地点付近では速く、遠地点付近ではゆっくり進みます。'},
  };

  /** 「形 → 面 → 向き → 位置」の組み立て順 */
  const GROUPS = [
    {title: '大きさと形',   note: '楕円そのもの',           keys: ['a', 'e']},
    {title: '軌道面の傾き', note: '楕円を載せる面',         keys: ['i', 'O']},
    {title: '面内の向き',   note: '面の中で楕円を回す',     keys: ['w']},
    {title: '衛星の位置',   note: '時間で変わる唯一の要素', keys: ['n']},
  ];

  /** 代表的な軌道（Ω・ω・ν は見やすさ優先の例示値） */
  const PRESETS = [
    {id: 'iss', name: 'ISS',             el: {a: 6778,  e: 0.0005, i: 51.64, O: 60,  w: 90,  n: 30}},
    {id: 'sso', name: '太陽同期 700 km', el: {a: 7078,  e: 0.001,  i: 98.19, O: 100, w: 90,  n: 30}},
    {id: 'gps', name: 'GPS',             el: {a: 26560, e: 0.01,   i: 55,    O: 30,  w: 40,  n: 60}},
    {id: 'geo', name: '静止軌道',        el: {a: 42164, e: 0,      i: 0,     O: 0,   w: 0,   n: 45}},
    {id: 'gto', name: 'GTO',             el: {a: 24371, e: 0.7302, i: 28.5,  O: 30,  w: 180, n: 20}},
    {id: 'mol', name: 'モルニヤ',        el: {a: 26600, e: 0.74,   i: 63.4,  O: 60,  w: 270, n: 180}},
  ];

  global.OrbitContent = {ELEMENTS, GROUPS, PRESETS};
})(window);
