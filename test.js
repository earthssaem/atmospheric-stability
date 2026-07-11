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

console.log('');
console.log(`결과: ${passed}개 통과, ${failed}개 실패`);
process.exit(failed > 0 ? 1 : 0);
