/**
 * physics.js — 대기 안정도와 강수 시뮬레이터의 물리 엔진
 *
 * 교과서 값 (절대 변경 금지):
 *  - 건조 단열 감률 10 ℃/km
 *  - 습윤 단열 감률  5 ℃/km
 *  - 이슬점 감률     2 ℃/km (불포화 상승 시)
 *  - 상승 응결 고도 H(km) = (1/8) × (T − Td)
 *
 * 브라우저(<script src>)와 Node(require) 양쪽에서 동작한다.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Physics = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DRY_LAPSE = 10;   // ℃/km, 건조 단열 감률
  var MOIST_LAPSE = 5;  // ℃/km, 습윤 단열 감률
  var DEW_LAPSE = 2;    // ℃/km, 불포화 상승 시 이슬점 감률
  var LCL_FACTOR = 1 / 8; // H = (1/8)(T − Td)

  /** 상승 응결 고도 (km) */
  function lcl(T, Td) {
    return LCL_FACTOR * (T - Td);
  }

  /**
   * 지표 기온 T, 지표 이슬점 Td인 공기 덩어리를 높이 h(km)까지 올렸을 때의 상태.
   * 반환: { temp, dew, saturated, H }
   */
  function parcel(T, Td, h) {
    var H = lcl(T, Td);
    if (h < H) {
      return {
        temp: T - DRY_LAPSE * h,
        dew: Td - DEW_LAPSE * h,
        saturated: false,
        H: H
      };
    }
    var tempAtLCL = T - DRY_LAPSE * H; // = Td − 2H 와 동일 (응결 고도에서 기온 = 이슬점)
    var temp = tempAtLCL - MOIST_LAPSE * (h - H);
    return { temp: temp, dew: temp, saturated: true, H: H };
  }

  /**
   * 푄 현상: 지표 기온 T, 이슬점 Td인 공기가 높이 M(km)의 산을 넘을 때.
   * 풍상측 상승 → (응결 고도 도달 시) 응결·강수 → 정상 → 풍하측 건조 단열 하강.
   * 반환: { H, foehn, summitTemp, summitDew, arrivalTemp, arrivalDew, deltaT }
   */
  function foehn(T, Td, M) {
    var H = lcl(T, Td);
    if (H >= M) {
      // 응결 고도에 못 미침 → 구름·비 없음, 도착 온도 = 출발 온도
      return {
        H: H,
        foehn: false,
        summitTemp: T - DRY_LAPSE * M,
        summitDew: Td - DEW_LAPSE * M,
        arrivalTemp: T,
        arrivalDew: Td,
        deltaT: 0
      };
    }
    var summitTemp = T - DRY_LAPSE * H - MOIST_LAPSE * (M - H);
    var summitDew = summitTemp; // 정상까지 포화 유지 (이슬점 = 기온)
    var arrivalTemp = summitTemp + DRY_LAPSE * M;
    var arrivalDew = summitDew + DEW_LAPSE * M;
    return {
      H: H,
      foehn: true,
      summitTemp: summitTemp,
      summitDew: summitDew,
      arrivalTemp: arrivalTemp,
      arrivalDew: arrivalDew,
      deltaT: arrivalTemp - T
    };
  }

  /**
   * 푄 여정 중 임의 지점의 공기 덩어리 상태.
   * side: 'windward'(풍상측 상승) | 'leeward'(풍하측 하강), h: 현재 높이(km), M: 산 높이(km)
   */
  function foehnAt(T, Td, M, side, h) {
    var f = foehn(T, Td, M);
    if (side === 'windward') {
      var p = parcel(T, Td, h);
      p.raining = f.foehn && p.saturated;
      return p;
    }
    // 풍하측: 정상 상태에서 (M − h)만큼 하강. 하강은 즉시 불포화 → 건조 단열.
    var drop = M - h;
    return {
      temp: f.summitTemp + DRY_LAPSE * drop,
      dew: f.summitDew + DEW_LAPSE * drop,
      saturated: false,
      raining: false,
      H: f.H
    };
  }

  /** 주위(환경) 기온: 지표 기온 T0, 환경 기온 감률 gamma(℃/km), 높이 h(km) */
  function envTemp(T0, gamma, h) {
    return T0 - gamma * h;
  }

  /** 대기 안정도 판별: 'absolute-stable' | 'conditional' | 'absolute-unstable' */
  function stability(gamma) {
    if (gamma < MOIST_LAPSE) return 'absolute-stable';
    if (gamma > DRY_LAPSE) return 'absolute-unstable';
    return 'conditional';
  }

  /**
   * 자유 대류 시작 고도 (LFC, km): 이 높이 위에서 공기 덩어리 온도 > 주위 기온.
   *  - γ > 10 (절대 불안정): 0 (지표에서부터 스스로 상승)
   *  - γ < 5 (절대 안정) 또는 γ = 5: null (어디에서도 자유 상승 불가)
   *  - 5 < γ ≤ 10 (조건부): h = 5H / (γ − 5) — 응결 고도 위에서 덩어리(5 ℃/km)가
   *    주위(γ)보다 천천히 식어 언젠가 역전됨
   */
  function lfc(T0, Td, gamma) {
    if (gamma > DRY_LAPSE) return 0;
    if (gamma <= MOIST_LAPSE) return null;
    var H = lcl(T0, Td);
    var h = (MOIST_LAPSE * H) / (gamma - MOIST_LAPSE);
    return Math.max(h, H);
  }

  /** 공기 덩어리 온도 − 주위 기온 (℃). 양수면 부력 상승, 음수면 하강. */
  function buoyancy(T0, Td, gamma, h) {
    return parcel(T0, Td, h).temp - envTemp(T0, gamma, h);
  }

  return {
    DRY_LAPSE: DRY_LAPSE,
    MOIST_LAPSE: MOIST_LAPSE,
    DEW_LAPSE: DEW_LAPSE,
    lcl: lcl,
    parcel: parcel,
    foehn: foehn,
    foehnAt: foehnAt,
    envTemp: envTemp,
    stability: stability,
    lfc: lfc,
    buoyancy: buoyancy
  };
});
