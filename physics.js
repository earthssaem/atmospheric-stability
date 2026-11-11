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

  /* ─────────────── 상대 습도 · 포화 수증기압 ─────────────── */

  /** 물(과냉각 물방울 포함)에 대한 포화 수증기압 (hPa) — Magnus 식 */
  function satVaporWater(T) {
    return 6.112 * Math.exp((17.62 * T) / (243.12 + T));
  }
  /** 얼음(빙정)에 대한 포화 수증기압 (hPa) — Magnus 식 */
  function satVaporIce(T) {
    return 6.112 * Math.exp((22.46 * T) / (272.62 + T));
  }
  /**
   * 상대 습도 (%) = 현재 수증기압 / 포화 수증기압 × 100.
   * 현재 수증기압은 이슬점에서의 포화 수증기압과 같다.
   */
  function relHumidity(T, Td) {
    if (Td >= T) return 100;
    return (100 * satVaporWater(Td)) / satVaporWater(T);
  }

  /**
   * 빙정설: 기온 T(℃), 실제 수증기압 e(hPa)인 구름 속 공기의 상태.
   *  - 'super-both' : 물방울·빙정 모두에 대해 과포화 (둘 다 성장)
   *  - 'ice-grows'  : 빙정에 대해 과포화, 과냉각 물방울에 대해 불포화 → 물방울 증발, 빙정 성장
   *  - 'sub-both'   : 둘 다 불포화 (둘 다 증발/승화)
   */
  function iceProcessState(T, e) {
    var ew = satVaporWater(T);
    var ei = satVaporIce(T);
    if (e > ew) return 'super-both';
    if (e > ei) return 'ice-grows';
    return 'sub-both';
  }

  /* ─────────────── 측정 자료(기온 분포) 해석 ─────────────── */

  /** 두 높이(m) 사이의 기온 감률 (℃/km). 높이 올라갈수록 기온이 낮아지면 양수. */
  function lapseRate(z1, T1, z2, T2) {
    return ((T1 - T2) / (z2 - z1)) * 1000;
  }

  /**
   * 기온 감률로 본 층의 상태. stability()와 같지만 역전층(기온 감률 < 0)을 따로 알려 준다.
   * 반환: { stability, inversion }
   */
  function layerState(gamma) {
    return { stability: stability(gamma), inversion: gamma < 0 };
  }

  /** 교과서 탐구(단열선도를 이용하여 대기 안정도 해석하기) 측정 자료 — 높이(m)별 기온(℃) */
  var SOUNDINGS = {
    heights: [0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500],
    ga: [12.0, 12.5, 13.0, 13.5, 14.0, 14.5, 15.0, 14.3, 13.6, 12.9, 12.2],
    na: [16.0, 15.7, 15.4, 15.1, 14.8, 14.5, 14.2, 13.9, 13.6, 13.3, 13.0]
  };

  /* ─────────────── 안개 모형 (수업용 단순 모형) ─────────────── */

  /**
   * 복사 안개: 저녁 18시 기온 T0에서 밤새 복사 냉각될 때 hour(18시 기준 경과 시간, 0~15) 후 지표 부근 기온.
   * 맑고 바람이 약할수록 많이 식는다. 새벽 6시(12시간 후)까지 drop만큼 식고, 해가 뜬 뒤(12.5시간 후~) 다시 오른다.
   * drop: 새벽까지의 냉각량 (℃) — radiationDrop(sky, wind)
   */
  var NIGHT_TAU = 5; // 냉각 시간 규모 (h)
  function radiationDrop(sky, wind) {
    if (sky === 'clear' && wind === 'calm') return 11;
    if (sky === 'clear') return 4;
    if (wind === 'calm') return 3;
    return 2;
  }
  function nightTemp(T0, hour, drop) {
    var norm = 1 - Math.exp(-12 / NIGHT_TAU);
    var cool = function (t) { return (drop * (1 - Math.exp(-t / NIGHT_TAU))) / norm; };
    if (hour <= 12.5) return T0 - cool(Math.min(hour, 12.5));
    // 일출(6시 30분) 이후 시간당 2.5 ℃씩 승온
    return T0 - cool(12.5) + 2.5 * (hour - 12.5);
  }

  /**
   * 이류 안개: 기온 Tair인 온난 습윤한 공기가 수온 Tsea인 차가운 바다 위를 x(km)만큼 이동했을 때의 기온.
   * 바다 쪽으로 열을 빼앗겨 수온에 가까워진다 (L: 적응 거리, km).
   */
  var ADVECTION_L = 60;
  function advectionTemp(Tair, Tsea, x) {
    return Tsea + (Tair - Tsea) * Math.exp(-x / ADVECTION_L);
  }
  /** 이류 안개가 생기기 시작하는 이동 거리 (km). 수온이 이슬점보다 높으면 null(안개 없음). */
  function advectionFogStart(Tair, Td, Tsea) {
    if (Td >= Tair) return 0;
    if (Tsea >= Td) return null;
    return -ADVECTION_L * Math.log((Td - Tsea) / (Tair - Tsea));
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
    buoyancy: buoyancy,
    satVaporWater: satVaporWater,
    satVaporIce: satVaporIce,
    relHumidity: relHumidity,
    iceProcessState: iceProcessState,
    lapseRate: lapseRate,
    layerState: layerState,
    SOUNDINGS: SOUNDINGS,
    radiationDrop: radiationDrop,
    nightTemp: nightTemp,
    advectionTemp: advectionTemp,
    advectionFogStart: advectionFogStart,
    ADVECTION_L: ADVECTION_L
  };
});
