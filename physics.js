/**
 * physics.js — 대기 안정도 탐구실의 계산 모듈 (화면 코드와 분리, 브라우저·Node 공용)
 *
 * 교과서 단순화 모형 값 (미래엔 지구시스템과학 93~96쪽):
 *  - 건조 단열 감률 10 ℃/km
 *  - 습윤 단열 감률  5 ℃/km  (이 앱에서 쓰는 교과서 모형의 평균값)
 *  - 불포화 공기의 이슬점 변화율: 상승 −2 ℃/km, 하강 +2 ℃/km
 *  - 상승 응결 고도 H(m) = 125 × (T₀ − Td₀) — 함수는 km 값 (T₀ − Td₀) / 8 을 돌려준다
 *
 * 기호: T₀·Td₀ = 처음(지표) 기온·이슬점, T·Td = 이동 중 현재 기온·이슬점, z = 높이(km)
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Physics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DRY = 10;       // ℃/km
  var MOIST = 5;      // ℃/km
  var DEW = 2;        // ℃/km (불포화)
  var EPS = 1e-9;     // 같다고 보는 오차 (반올림 전 값 비교용)

  /* ───────────── 시작 조건 ───────────── */

  /** 상승 응결 고도 (km) */
  function lcl(T0, Td0) { return (T0 - Td0) / 8; }

  /** Td₀ ≤ T₀ 검증: 이슬점이 기온보다 높으면 기온에 맞춘다 */
  function clampDew(T0, Td0) {
    if (Td0 > T0) return { Td0: T0, adjusted: true };
    return { Td0: Td0, adjusted: false };
  }

  /* ───────────── 닫힌 공기 덩어리 (강수 없음: 응결 고도와 기본 안정도 실험) ─────────────
   * 응결한 물방울이 공기 덩어리 안에 남아 있다고 가정한다.
   * 그래서 같은 높이로 돌아오면 같은 상태가 된다(내려가면 다시 증발). */
  function parcel(T0, Td0, z) {
    var H = lcl(T0, Td0);
    if (z < H - EPS) {
      return { z: z, T: T0 - DRY * z, Td: Td0 - DEW * z, saturated: false, H: H, condensing: false };
    }
    var T = T0 - DRY * H - MOIST * (z - H);
    return { z: z, T: T, Td: T, saturated: true, H: H, condensing: z > H + EPS };
  }

  /* ───────────── 푄 현상 (풍상측에서 강수로 수분을 잃는 모형) ─────────────
   * 출발과 도착의 높이는 같은 0 km. 산 높이 M(km).
   * 풍상측에서 포화된 뒤 응결한 물은 모두 비로 떨어진다고 가정한다.
   * 정상에서 하강을 시작하면 곧바로 불포화가 되어 건조 단열 변화를 한다. */
  function foehn(T0, Td0, M) {
    var H = lcl(T0, Td0);
    var reachesSat = H <= M + EPS;        // 정상까지 오르는 동안 포화에 도달 (H = M 포함)
    var precipitates = H < M - EPS;       // 포화된 채로 상승하는 구간이 있어 강수가 생김
    var summit;
    if (reachesSat) {
      var Ts = T0 - DRY * H - MOIST * (M - H);
      summit = { z: M, T: Ts, Td: Ts, saturated: true };
    } else {
      summit = { z: M, T: T0 - DRY * M, Td: Td0 - DEW * M, saturated: false };
    }
    var arrival = { z: 0, T: summit.T + DRY * M, Td: summit.Td + DEW * M, saturated: false };
    // 처음부터 포화(T₀ = Td₀)이고 산이 없다면 도착도 포화 — 이 앱의 산 높이는 0보다 크므로 해당 없음
    arrival.saturated = arrival.T - arrival.Td <= EPS;
    return {
      T0: T0, Td0: Td0, M: M, H: H,
      reachesSat: reachesSat,
      precipitates: precipitates,
      start: { z: 0, T: T0, Td: Td0, saturated: T0 - Td0 <= EPS },
      lclPoint: reachesSat ? { z: H, T: T0 - DRY * H, Td: T0 - DRY * H, saturated: true } : null,
      summit: summit,
      arrival: arrival,
      dT: arrival.T - T0,
      dTd: arrival.Td - Td0
    };
  }

  /** 푄 현상 경로 위의 상태. side: 'up'(풍상측 상승) | 'down'(풍하측 하강) */
  function foehnAt(f, side, z) {
    if (side === 'up') {
      var p = parcel(f.T0, f.Td0, z);
      return { z: z, T: p.T, Td: p.Td, saturated: p.saturated, precipitating: p.condensing, side: 'up' };
    }
    var drop = f.M - z;
    var T = f.summit.T + DRY * drop, Td = f.summit.Td + DEW * drop;
    return { z: z, T: T, Td: Td, saturated: f.summit.saturated && drop <= EPS, precipitating: false, side: 'down' };
  }

  /* ───────────── 상대 습도 ─────────────
   * 상대 습도(%) = 현재 수증기압 / 포화 수증기압 × 100.
   * 현재 수증기압 = 이슬점에서의 포화 수증기압. 포화 수증기압은 Magnus 식(물 기준)으로 계산. */
  function satVapor(T) { return 6.112 * Math.exp((17.62 * T) / (243.12 + T)); }
  function relHumidity(T, Td) {
    if (Td >= T - EPS) return 100;
    return (100 * satVapor(Td)) / satVapor(T);
  }

  /* ───────────── 대기 안정도 판정 ─────────────
   * 불포화 공기: γ < 10 안정, γ = 10 중립, γ > 10 불안정
   * 포화 공기:   γ < 5  안정, γ = 5  중립, γ > 5  불안정 */
  function compare(g, ref) { return g < ref - EPS ? 'stable' : (g > ref + EPS ? 'unstable' : 'neutral'); }
  function stabilityFor(gamma, saturated) { return compare(gamma, saturated ? MOIST : DRY); }
  function stabilityClass(gamma) {
    var unsat = compare(gamma, DRY), sat = compare(gamma, MOIST);
    var key;
    if (sat === 'stable') key = 'absolute-stable';
    else if (sat === 'neutral') key = 'moist-neutral';          // γ = 5
    else if (unsat === 'stable') key = 'conditional';           // 5 < γ < 10
    else if (unsat === 'neutral') key = 'dry-neutral';          // γ = 10
    else key = 'absolute-unstable';
    return { key: key, unsat: unsat, sat: sat };
  }

  /* ───────────── 주위 기온 분포 (일정 감률 + 선택적 역전층) ─────────────
   * profile = { T0, gamma, inv: null | { base, depth, dT } }
   * 역전층: base(km)부터 depth(km) 두께 동안 기온이 dT(℃)만큼 높아진다. 위아래는 같은 감률 γ. 경계에서 연속. */
  function makeProfile(T0, gamma, inv) {
    var useInv = inv && inv.depth > EPS;
    return { T0: T0, gamma: gamma, inv: useInv ? { base: inv.base, depth: inv.depth, dT: inv.dT } : null };
  }
  function envTemp(P, z) {
    if (!P.inv || z <= P.inv.base) return P.T0 - P.gamma * z;
    var Tb = P.T0 - P.gamma * P.inv.base;
    var top = P.inv.base + P.inv.depth;
    if (z <= top) return Tb + P.inv.dT * (z - P.inv.base) / P.inv.depth;
    return Tb + P.inv.dT - P.gamma * (z - top);
  }
  /** 그 높이의 주위 기온 감률 (℃/km, 위로 갈수록 기온이 낮아지면 양수) */
  function envLapse(P, z) {
    if (P.inv && z > P.inv.base && z < P.inv.base + P.inv.depth) return -P.inv.dT / P.inv.depth;
    return P.gamma;
  }
  /** 공기 덩어리 기온 − 주위 기온 (℃). 양수면 위로 부력, 음수면 아래로. */
  function buoyancy(T0, Td0, P, z) { return parcel(T0, Td0, z).T - envTemp(P, z); }

  /**
   * 0~zmax에서 공기 덩어리가 주위보다 따뜻한 구간과 경계 높이.
   * 공기 덩어리 기온과 주위 기온이 모두 구간별 직선이므로 경계(응결 고도, 역전층 위아래) 사이에서 정확히 계산한다.
   * 반환: { warm: [[z1, z2], ...], lfc: 처음으로 따뜻해지기 시작하는 높이 | null, el: 그 구간이 끝나는 높이 | null }
   */
  function buoyancyIntervals(T0, Td0, P, zmax) {
    var bps = [0, zmax];
    var H = lcl(T0, Td0);
    if (H > 0 && H < zmax) bps.push(H);
    if (P.inv) {
      if (P.inv.base > 0 && P.inv.base < zmax) bps.push(P.inv.base);
      var top = P.inv.base + P.inv.depth;
      if (top > 0 && top < zmax) bps.push(top);
    }
    bps.sort(function (a, b) { return a - b; });
    var warm = [];
    function add(a, b) {
      if (b - a <= EPS) return;
      var last = warm[warm.length - 1];
      if (last && Math.abs(last[1] - a) <= 1e-7) last[1] = b; else warm.push([a, b]);
    }
    for (var i = 0; i < bps.length - 1; i++) {
      var a = bps[i], c = bps[i + 1];
      if (c - a <= EPS) continue;
      // 구간 안쪽 값으로 기울기를 구한다(경계의 꺾임을 피함)
      var ba = buoyancyIn(T0, Td0, P, a, a, c), bc = buoyancyIn(T0, Td0, P, c, a, c);
      var pa = ba > EPS, pc = bc > EPS;
      if (pa && pc) add(a, c);
      else if (!pa && pc) add(a + (0 - ba) / (bc - ba) * (c - a), c);
      else if (pa && !pc) add(a, a + (0 - ba) / (bc - ba) * (c - a));
    }
    var lfc = warm.length ? warm[0][0] : null;
    var el = warm.length && warm[0][1] < zmax - 1e-7 ? warm[0][1] : null;
    return { warm: warm, lfc: lfc, el: el };
  }
  // 구간 [a, c] 안에서의 직선을 끝점까지 연장한 부력 값
  function buoyancyIn(T0, Td0, P, z, a, c) {
    var m1 = a + (c - a) * 0.25, m2 = a + (c - a) * 0.75;
    var b1 = buoyancy(T0, Td0, P, m1), b2 = buoyancy(T0, Td0, P, m2);
    return b1 + (b2 - b1) * (z - m1) / (m2 - m1);
  }

  /* ───────────── 공기 덩어리 운동 (교육용 정성 모형) ─────────────
   * 가속도 = k × (공기 덩어리 기온 − 주위 기온) − c × 속도.
   * k, c는 움직임을 보기 좋게 만드는 표현용 계수로, 실제 상승 속도를 뜻하지 않는다. */
  var MOTION = { k: 0.18, c: 0.9 };
  function motionStep(T0, Td0, P, s, dt, zmax) {
    var b = buoyancy(T0, Td0, P, s.z);
    var a = MOTION.k * b - MOTION.c * s.v;
    var v = s.v + a * dt;
    var z = s.z + v * dt;
    var hit = null;
    if (z <= 0) { z = 0; if (v < 0) v = 0; hit = 'ground'; }
    if (z >= zmax) { z = zmax; if (v > 0) v = 0; hit = 'top'; }
    return { z: z, v: v, a: a, b: b, hit: hit };
  }

  return {
    DRY: DRY, MOIST: MOIST, DEW: DEW, EPS: EPS, MOTION: MOTION,
    lcl: lcl, clampDew: clampDew, parcel: parcel,
    foehn: foehn, foehnAt: foehnAt,
    satVapor: satVapor, relHumidity: relHumidity,
    stabilityFor: stabilityFor, stabilityClass: stabilityClass,
    makeProfile: makeProfile, envTemp: envTemp, envLapse: envLapse,
    buoyancy: buoyancy, buoyancyIntervals: buoyancyIntervals,
    motionStep: motionStep
  };
});
