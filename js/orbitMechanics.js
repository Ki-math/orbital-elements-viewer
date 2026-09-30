/**
 * orbitMechanics.js
 * 二体問題（摂動なし）の軌道計算。描画にもDOMにも依存しない純粋な関数だけを置く。
 *
 *   OrbitMechanics.MU                         地球の重力定数 [km^3/s^2]
 *   OrbitMechanics.RE                         地球赤道半径 [km]
 *   OrbitMechanics.perifocalBasis(raan, inc, argp)
 *                                             近点座標系などの単位ベクトルを ECI で返す
 *   OrbitMechanics.trueToMeanAnomaly(nu, e)   真近点角 → 平均近点角
 *   OrbitMechanics.meanToTrueAnomaly(M, e)    平均近点角 → 真近点角（ケプラー方程式を解く）
 *   OrbitMechanics.orbitSummary(el)           高度・周期・速度・状態ベクトルなどの諸元
 *
 * 単位：距離 km、時間 s、角度 rad。
 * 軌道要素 el = {a, e, inc, raan, argp, nu}
 */
(function (global) {
  'use strict';

  const MU = 398600.4418;   // km^3/s^2
  const RE = 6378.137;      // km

  /**
   * 軌道面まわりの単位ベクトルを ECI 座標で返す。
   * 近点座標系 → ECI の回転は R = Rz(Ω)·Rx(i)·Rz(ω)（3-1-3 回転）。
   *
   *   P : 近地点方向          Q : 軌道面内で P から 90° 進んだ方向
   *   W : 軌道面の法線（角運動量方向）
   *   N : 昇交点方向          M : 昇交点での進行方向（W × N）
   *   E : 昇交点での赤道面内の東向き方向
   */
  function perifocalBasis(raan, inc, argp) {
    const cO = Math.cos(raan), sO = Math.sin(raan);
    const ci = Math.cos(inc),  si = Math.sin(inc);
    const cw = Math.cos(argp), sw = Math.sin(argp);
    return {
      P: [cO * cw - sO * sw * ci,  sO * cw + cO * sw * ci, sw * si],
      Q: [-cO * sw - sO * cw * ci, -sO * sw + cO * cw * ci, cw * si],
      W: [sO * si, -cO * si, ci],
      N: [cO, sO, 0],
      M: [-sO * ci, cO * ci, si],
      E: [-sO, cO, 0],
    };
  }

  /** 真近点角 nu → 平均近点角 M（楕円軌道 0 <= e < 1） */
  function trueToMeanAnomaly(nu, e) {
    const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2),
                             Math.sqrt(1 + e) * Math.cos(nu / 2));
    return E - e * Math.sin(E);
  }

  /** 平均近点角 M → 真近点角 nu。ケプラー方程式 M = E - e sin E をニュートン法で解く */
  function meanToTrueAnomaly(M, e) {
    let E = e < 0.8 ? M : Math.PI;
    for (let k = 0; k < 30; k++) {
      const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-12) break;
    }
    return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2),
                          Math.sqrt(1 - e) * Math.cos(E / 2));
  }

  /**
   * 軌道要素から主要な諸元を計算する。
   * 戻り値：
   *   perigeeAlt, apogeeAlt  近地点・遠地点高度 [km]
   *   period                 周期 [s]
   *   radius, altitude       現在の地心距離・高度 [km]
   *   speed                  現在の速度 [km/s]
   *   flightPathAngle        飛行経路角 γ [rad]
   *   rECI, vECI             ECI 位置 [km]・速度 [km/s]
   *   basis                  perifocalBasis の結果
   */
  function orbitSummary(el) {
    const {a, e, inc, raan, argp, nu} = el;
    const p = a * (1 - e * e);                      // 半直弦
    const radius = p / (1 + e * Math.cos(nu));
    const basis = perifocalBasis(raan, inc, argp);
    const k = Math.sqrt(MU / p);
    const rECI = [0, 1, 2].map(j => radius * (Math.cos(nu) * basis.P[j] + Math.sin(nu) * basis.Q[j]));
    const vECI = [0, 1, 2].map(j => k * (-Math.sin(nu) * basis.P[j] + (e + Math.cos(nu)) * basis.Q[j]));
    return {
      semiLatusRectum: p,
      perigeeAlt: a * (1 - e) - RE,
      apogeeAlt: a * (1 + e) - RE,
      period: 2 * Math.PI * Math.sqrt(a ** 3 / MU),
      radius,
      altitude: radius - RE,
      speed: Math.sqrt(MU * (2 / radius - 1 / a)),
      flightPathAngle: Math.atan2(e * Math.sin(nu), 1 + e * Math.cos(nu)),
      rECI, vECI, basis,
    };
  }

  global.OrbitMechanics = {MU, RE, perifocalBasis, trueToMeanAnomaly, meanToTrueAnomaly, orbitSummary};
})(window);
