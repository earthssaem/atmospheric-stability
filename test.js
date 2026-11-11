/**
 * test.js — 물리 엔진 검증 테스트 (교과서 검증 케이스)
 * 실행: node test.js
 */
'use strict';
const P = require('./physics.js');

let passed = 0;
let failed = 0;

function approx(actual, expected, tol, label) {
  tol = tol == null ? 1e-9 : tol;
  if (Math.abs(actual - expected) <= tol) {
    passed++;
    console.log(`  ✓ ${label}: ${actual}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}: 기대 ${expected}, 실제 ${actual}`);
  }
}

function equal(actual, expected, label) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${label}: ${actual}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}: 기대 ${expected}, 실제 ${actual}`);
  }
}

console.log('[검증 1] 탭 1 — T=20 ℃, Td=12 ℃');
{
  approx(P.lcl(20, 12), 1.0, 0, 'H = 1.0 km');
  const at1 = P.parcel(20, 12, 1);
  approx(at1.temp, 10, 0, '1 km에서 풍선 온도 10 ℃');
  equal(at1.saturated, true, '1 km에서 포화 시작');
  approx(at1.dew, 10, 0, '1 km에서 이슬점 = 기온 = 10 ℃');
  const at3 = P.parcel(20, 12, 3);
  approx(at3.temp, 0, 0, '3 km에서 풍선 온도 0 ℃ (10 − 5×2)');
  const at05 = P.parcel(20, 12, 0.5);
  approx(at05.temp, 15, 0, '0.5 km(불포화)에서 온도 15 ℃');
  approx(at05.dew, 11, 0, '0.5 km에서 이슬점 11 ℃ (2 ℃/km)');
  equal(at05.saturated, false, '0.5 km는 불포화');
}

console.log('[검증 2] 탭 2 — 출발 T=20 ℃, Td=14 ℃, 산 2 km');
{
  const f = P.foehn(20, 14, 2);
  approx(f.H, 0.75, 0, 'H = 0.75 km');
  equal(f.foehn, true, '푄 발생');
  approx(f.summitTemp, 6.25, 1e-9, '정상 온도 6.25 ℃ (20 − 10×0.75 − 5×1.25)');
  approx(f.arrivalTemp, 26.25, 1e-9, '도착 온도 26.25 ℃ (6.25 + 10×2)');
  approx(f.arrivalDew, 10.25, 1e-9, '도착 이슬점 10.25 ℃ (6.25 + 2×2)');
  approx(f.deltaT, 6.25, 1e-9, '기온 상승 +6.25 ℃');
}

console.log('[검증 2-1] 탭 2 — 산 높이 < 응결 고도 → 푄 없음');
{
  const f = P.foehn(20, 4, 1); // H = 2 km > 산 1 km
  approx(f.H, 2.0, 0, 'H = 2.0 km');
  equal(f.foehn, false, '푄 미발생');
  approx(f.arrivalTemp, 20, 0, '도착 온도 = 출발 온도 20 ℃');
  approx(f.arrivalDew, 4, 0, '도착 이슬점 = 출발 이슬점 4 ℃');
  approx(f.summitTemp, 10, 0, '정상 온도 10 ℃ (건조 단열만)');
}

console.log('[검증 3] 탭 3 — γ=8 ℃/km, 지표 30 ℃ / Td 22 ℃');
{
  approx(P.lcl(30, 22), 1.0, 0, 'H = 1.0 km');
  const p05 = P.parcel(30, 22, 0.5);
  approx(p05.temp, 25, 0, '0.5 km에서 덩어리 25 ℃');
  approx(P.envTemp(30, 8, 0.5), 26, 0, '0.5 km에서 주위 26 ℃');
  approx(P.buoyancy(30, 22, 8, 0.5), -1, 0, '0.5 km 부력 −1 ℃ → 복귀(안정)');
  const p2 = P.parcel(30, 22, 2);
  approx(p2.temp, 15, 0, '2 km에서 덩어리 15 ℃');
  approx(P.envTemp(30, 8, 2), 14, 0, '2 km에서 주위 14 ℃');
  approx(P.buoyancy(30, 22, 8, 2), 1, 0, '2 km 부력 +1 ℃ → 자유 상승(불안정)');
  approx(P.lfc(30, 22, 8), 5 / 3, 1e-9, '자유 대류 시작 고도 = 5H/(γ−5) = 1.667 km');
}

console.log('[검증 4] 안정도 판별');
{
  equal(P.stability(4), 'absolute-stable', 'γ=4 → 절대 안정');
  equal(P.stability(8), 'conditional', 'γ=8 → 조건부 불안정');
  equal(P.stability(12), 'absolute-unstable', 'γ=12 → 절대 불안정');
  equal(P.lfc(30, 22, 4), null, '절대 안정 → 자유 대류 없음');
  approx(P.lfc(30, 22, 12), 0, 0, '절대 불안정 → 지표부터 자유 상승');
}

console.log('[검증 5] 탭 1 미션 3 정답 케이스 — T=30, Td=22, 4 km');
{
  const p = P.parcel(30, 22, 4);
  approx(p.temp, 5, 0, '4 km 온도 = 30 − 10×1 − 5×3 = 5 ℃');
}

console.log('[검증 6] 탭 2 미션 3 — 이슬점이 높을수록 온도 차 증가');
{
  const dLow = P.foehn(20, 8, 2).deltaT;   // H = 1.5
  const dHigh = P.foehn(20, 19, 2).deltaT; // H = 0.125
  if (dHigh > dLow) {
    passed++;
    console.log(`  ✓ Td 19 ℃(ΔT=${dHigh}) > Td 8 ℃(ΔT=${dLow})`);
  } else {
    failed++;
    console.error(`  ✗ ΔT 비교 실패: ${dHigh} <= ${dLow}`);
  }
  approx(P.foehn(20, 19, 2).deltaT, 5 * (2 - 0.125), 1e-9, 'ΔT 최댓값 = 5(M − H) = 9.375 ℃');
}

console.log('[검증 7] 교과서 그림 Ⅲ-15·16·17 — 지표 30 ℃, 상승 응결 고도 2 km (Td = 14 ℃)');
{
  approx(P.lcl(30, 14), 2, 0, 'H = ⅛(30 − 14) = 2 km');
  approx(P.parcel(30, 14, 1).temp, 20, 0, '1 km 덩어리 20 ℃');
  approx(P.parcel(30, 14, 3).temp, 5, 0, '3 km 덩어리 5 ℃ (습윤 단열)');
  approx(P.envTemp(30, 4, 2), 22, 0, '그림 Ⅲ-15: γ=4, 2 km 주위 22 ℃ (덩어리 10 ℃ → 안정)');
  approx(P.envTemp(30, 12, 1), 18, 0, '그림 Ⅲ-16: γ=12, 1 km 주위 18 ℃ (덩어리 20 ℃ → 불안정)');
  approx(P.lfc(30, 14, 8), 10 / 3, 1e-9, '그림 Ⅲ-17: γ=8, 안정/불안정 경계 3.33 km');
  equal(P.stability(-5), 'absolute-stable', '역전층(γ<0)도 절대 안정');
  equal(P.layerState(-5).inversion, true, '역전층 표시');
}

console.log('[검증 8] 상대 습도 · 포화 수증기압');
{
  approx(P.relHumidity(20, 20), 100, 0, '기온 = 이슬점 → 100 %');
  const rh = P.relHumidity(20, 14);
  if (rh > 60 && rh < 75) { passed++; console.log(`  ✓ 20 ℃ / 14 ℃ → ${rh.toFixed(1)} %`); }
  else { failed++; console.error(`  ✗ 상대 습도 범위 밖: ${rh}`); }
  approx(P.satVaporWater(0), 6.112, 1e-9, '0 ℃ 포화 수증기압 6.11 hPa');
  approx(P.satVaporIce(0), 6.112, 1e-9, '0 ℃에서 물과 얼음 포화 수증기압 같음');
  let best = { T: 0, d: 0 };
  for (let T = -40; T <= 0; T += 0.5) {
    const d = P.satVaporWater(T) - P.satVaporIce(T);
    if (d > best.d) best = { T, d };
  }
  if (best.T >= -14 && best.T <= -10 && best.d > 0.25 && best.d < 0.3) {
    passed++; console.log(`  ✓ 포화 수증기압 차 최대: ${best.T} ℃에서 ${best.d.toFixed(3)} hPa (교과서 그림 Ⅲ-21)`);
  } else { failed++; console.error(`  ✗ 포화 수증기압 차 최대 위치 이상: ${JSON.stringify(best)}`); }
  equal(P.iceProcessState(-12, 2.3), 'ice-grows', '−12 ℃, 2.3 hPa → 빙정에 과포화·물방울에 불포화');
  equal(P.iceProcessState(-12, 2.6), 'super-both', '−12 ℃, 2.6 hPa → 둘 다 과포화');
  equal(P.iceProcessState(-12, 2.0), 'sub-both', '−12 ℃, 2.0 hPa → 둘 다 불포화');
}

console.log('[검증 9] 탐구 — (가)·(나) 지점 기온 감률');
{
  const S = P.SOUNDINGS;
  approx(P.lapseRate(0, S.ga[0], 300, S.ga[6]), -10, 1e-9, '(가) 0~300 m: −10 ℃/km (역전층)');
  equal(P.layerState(P.lapseRate(0, S.ga[0], 300, S.ga[6])).stability, 'absolute-stable', '(가) 0~300 m 절대 안정');
  approx(P.lapseRate(300, S.ga[6], 500, S.ga[10]), 14, 1e-9, '(가) 300~500 m: 14 ℃/km');
  equal(P.stability(14), 'absolute-unstable', '(가) 300~500 m 절대 불안정');
  approx(P.lapseRate(0, S.na[0], 500, S.na[10]), 6, 1e-9, '(나) 0~500 m: 6 ℃/km');
  equal(P.stability(6), 'conditional', '(나) 조건부 불안정');
}

console.log('[검증 10] 안개 모형');
{
  approx(P.nightTemp(16, 0, 11), 16, 1e-9, '18시 기온 = 출발 기온');
  approx(P.nightTemp(16, 12, 11), 5, 1e-9, '맑고 바람 약함: 새벽 6시까지 11 ℃ 냉각');
  approx(P.advectionTemp(24, 12, 0), 24, 1e-9, '이류 출발점 기온');
  const x = P.advectionFogStart(24, 18, 12);
  approx(P.advectionTemp(24, 12, x), 18, 1e-9, '이류 안개 시작 지점에서 기온 = 이슬점');
  equal(P.advectionFogStart(24, 18, 19), null, '수온 > 이슬점이면 이류 안개 없음');
}

console.log('');
console.log(`결과: ${passed}개 통과, ${failed}개 실패`);
process.exit(failed > 0 ? 1 : 0);
