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

  /* ───────────── 대기 안정도 개념 실험: 원래 위치에서 강제로 움직인 공기 덩어리 ─────────────
   * 원래 위치 z0에서 주위와 기온(T)이 같던 공기 덩어리를 강제로 올리거나 내린다.
   * 불포화 공기는 건조 단열 감률, 포화 공기는 습윤 단열 감률로 기온이 변한다(움직이는 동안 상태는 그대로라고 가정).
   * 주위 기온은 z0를 지나는 일정 감률 γ의 직선이다. 공기 − 주위 = (γ − 단열 감률) × (z − z0). */
  function adiabatLapse(saturated) { return saturated ? MOIST : DRY; }
  function displaced(T, z0, gamma, saturated, z) {
    var Tp = T - adiabatLapse(saturated) * (z - z0), Te = T - gamma * (z - z0);
    return { T: Tp, Te: Te, b: Tp - Te };
  }
  /* 운동(교육용 정성 모형): 가속도 = k × (공기 − 주위) − c × 속도.
   * 안정할 때는 되돌아오며 원래 위치를 지나치지 않도록 임계 감쇠 c = 2√(k·(단열 감률 − γ))를 쓰고,
   * 불안정·중립일 때는 c를 그대로 쓴다. 계수는 보기 좋은 빠르기를 위한 값으로 실제 속도를 뜻하지 않는다. */
  var MOTION_DISP = { k: 0.5, c: 2.4 };
  function displacedStep(gamma, saturated, z0, s, dt, zmin, zmax) {
    var d = gamma - adiabatLapse(saturated);
    var b = d * (s.z - z0);
    var c = d < -EPS ? 2 * Math.sqrt(MOTION_DISP.k * -d) : MOTION_DISP.c;
    var a = MOTION_DISP.k * b - c * s.v;
    var v = s.v + a * dt;
    var z = s.z + v * dt;
    var hit = null;
    if (z <= zmin) { z = zmin; if (v < 0) v = 0; hit = 'ground'; }
    if (z >= zmax) { z = zmax; if (v > 0) v = 0; hit = 'top'; }
    return { z: z, v: v, a: a, b: d * (z - z0), hit: hit };
  }

  /* ───────────── 안개: 지표 부근의 공기가 포화되는 과정 ─────────────
   * 공기 속 수증기의 양을 수증기압 q(hPa)로 나타낸다. q가 포화 수증기압 E(T)보다 크면 E(T)만 수증기로 남고
   * 나머지(q − E)는 응결해 안개 물방울이 된다. 안개가 생기는 두 가지 방법(교과서):
   *  ① 공기의 냉각: 수증기량은 그대로인 채 기온이 이슬점까지 내려감 (포화 수증기압 곡선 그래프에서 왼쪽으로)
   *  ② 수증기량의 증가: 기온은 그대로인 채 수증기가 늘어 포화 수증기압에 이름 (그래프에서 위로)
   * 안개마다 처음 기온·이슬점과 냉각·증발 정도는 과정을 보여 주려고 고른 교육용 값이다. */
  function dewPointOf(e) { var a = Math.log(e / 6.112); return 243.12 * a / (17.62 - a); }
  function moistAir(T, q) {
    var E = satVapor(T), sat = q >= E - 1e-9, e = Math.min(q, E);
    return { T: T, q: q, e: e, E: E, Td: sat ? T : dewPointOf(e), rh: sat ? 100 : 100 * e / E, saturated: sat, water: Math.max(0, q - E) };
  }
  var FOG = {
    radiation: { group: 'cool', T0: 15, Td0: 10, drop: { 'clear|calm': 5.6, 'clear|windy': 3, 'cloudy|calm': 2.5, 'cloudy|windy': 1.5 } },
    advection: { group: 'cool', T0: 18, Td0: 14, warmEnd: 0.35, k: 4.5 },
    upslope: { group: 'cool', T0: 16, Td0: 12 },
    steam: { group: 'vapor', T0: 2, Td0: -3, waterStart: 0.3, mix: 0.6, k: 3.5 },
    frontal: { group: 'vapor', T0: 5, Td0: 1, add: { weak: 1.2, strong: 3.5 } }
  };
  /** 처음에 빠르고 차츰 느려지는 변화 (0 → 1) */
  function easeOut(s, k) { return (1 - Math.exp(-k * s)) / (1 - Math.exp(-k)); }
  /**
   * 안개 과정의 진행 정도 s(0~1)에서 공기의 상태
   * o: radiation {sky: 'clear'|'cloudy', wind: 'calm'|'windy'} · advection {sea: 찬 해수면 ℃} · upslope {M: 산 높이 km}
   *    steam {water: 수면 ℃} · frontal {rain: 'weak'|'strong'}
   */
  function fogAt(kind, o, s) {
    var c = FOG[kind], r;
    s = Math.max(0, Math.min(1, s));
    if (kind === 'radiation') {                 // 밤사이 지표면 복사 냉각: 맑고 바람이 약할수록 많이 식는다
      r = moistAir(c.T0 - c.drop[o.sky + '|' + o.wind] * easeOut(s, 1.2), satVapor(c.Td0));
    } else if (kind === 'advection') {          // 따뜻한 바다 위(그대로) → 찬 해수면 위에서 해수면 온도 쪽으로 식는다
      var T = s > c.warmEnd ? o.sea + (c.T0 - o.sea) * Math.exp(-c.k * (s - c.warmEnd)) : c.T0;
      r = moistAir(T, satVapor(c.Td0)); r.x = s; r.overCold = s > c.warmEnd;
    } else if (kind === 'upslope') {            // 산 사면을 따라 상승: 응결 고도 모형(건조 단열 10, 이슬점 2 ℃/km)과 같음
      var z = s * o.M, p = parcel(c.T0, c.Td0, z);
      var q = p.saturated ? satVapor(c.T0 - DRY * p.H) : satVapor(p.Td);   // 응결 고도 위에서는 그때의 수증기량을 지닌 채 포화
      r = moistAir(p.T, q); r.z = z; r.H = p.H;
    } else if (kind === 'steam') {              // 찬 공기가 따뜻한 수면 위로: 증발한 수증기가 더해진다 (기온은 그대로라고 봄)
      var q0 = satVapor(c.Td0), qMax = q0 + c.mix * Math.max(0, satVapor(o.water) - q0);
      var q2 = s > c.waterStart ? q0 + (qMax - q0) * easeOut((s - c.waterStart) / (1 - c.waterStart), c.k) : q0;
      r = moistAir(c.T0, q2); r.x = s; r.overWater = s > c.waterStart;
    } else {                                    // 전선 안개: 빗방울이 찬 공기층에서 증발해 수증기가 늘어난다
      r = moistAir(c.T0, satVapor(c.Td0) + c.add[o.rain] * easeOut(s, 1.2));
    }
    r.kind = kind; r.group = c.group; r.s = s;
    return r;
  }
  /** 처음으로 포화되는(안개가 생기기 시작하는) 진행 정도. 끝까지 포화되지 않으면 null */
  function fogOnset(kind, o) {
    if (fogAt(kind, o, 0).saturated) return 0;
    var N = 400, prev = 0;
    for (var i = 1; i <= N; i++) {
      var s = i / N;
      if (fogAt(kind, o, s).saturated) {
        var a = prev, b = s;
        for (var k = 0; k < 40; k++) { var m = (a + b) / 2; if (fogAt(kind, o, m).saturated) b = m; else a = m; }
        return b;
      }
      prev = s;
    }
    return null;
  }

  return {
    DRY: DRY, MOIST: MOIST, DEW: DEW, EPS: EPS, MOTION: MOTION, MOTION_DISP: MOTION_DISP, FOG: FOG,
    dewPointOf: dewPointOf, moistAir: moistAir, fogAt: fogAt, fogOnset: fogOnset,
    adiabatLapse: adiabatLapse, displaced: displaced, displacedStep: displacedStep,
    lcl: lcl, clampDew: clampDew, parcel: parcel,
    foehn: foehn, foehnAt: foehnAt,
    satVapor: satVapor, relHumidity: relHumidity,
    stabilityFor: stabilityFor, stabilityClass: stabilityClass,
    makeProfile: makeProfile, envTemp: envTemp, envLapse: envLapse,
    buoyancy: buoyancy, buoyancyIntervals: buoyancyIntervals,
    motionStep: motionStep
  };
});
