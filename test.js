/**
 * test.js — 계산 모듈 검증 (교과서 수치와 경계값)
 * 실행: node test.js
 */
'use strict';
const P = require('./physics.js');

let passed = 0, failed = 0;
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; console.error('  ✗ ' + label + (detail !== undefined ? ' → ' + JSON.stringify(detail) : '')); }
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

console.log('[응결 고도] 20 ℃ · 12 ℃');
{
  ok(near(P.lcl(20, 12), 1), '응결 고도 1 km');
  const a = P.parcel(20, 12, 1);
  ok(near(a.T, 10) && near(a.Td, 10) && a.saturated, '1 km에서 기온·이슬점 모두 10 ℃, 포화', a);
  const b = P.parcel(20, 12, 2);
  ok(near(b.T, 5) && near(b.Td, 5) && b.saturated, '2 km에서 기온·이슬점 모두 5 ℃', b);
  const c = P.parcel(20, 12, 0.5);
  ok(near(c.T, 15) && near(c.Td, 11) && !c.saturated, '0.5 km 불포화: 기온 15 ℃, 이슬점 11 ℃', c);
  const d = P.parcel(20, 12, 0.999);
  ok(!d.saturated && d.T > d.Td, '응결 고도 바로 아래(0.999 km)는 불포화', d);
}

console.log('[응결 고도] 25 ℃ · 15 ℃ — 1.25 km에 정확히');
{
  const H = P.lcl(25, 15);
  ok(near(H, 1.25), '응결 고도 1.25 km');
  const p = P.parcel(25, 15, H);
  ok(p.saturated && near(p.T, 12.5) && near(p.Td, 12.5), '정확히 1.25 km에서 포화, 12.5 ℃', p);
}

console.log('[응결 고도] 시작 기온 = 시작 이슬점');
{
  ok(near(P.lcl(15, 15), 0), '응결 고도 0 km');
  const p0 = P.parcel(15, 15, 0);
  ok(p0.saturated && !p0.condensing, '지표에서부터 포화 (아직 응결 진행 전)', p0);
  const p1 = P.parcel(15, 15, 1);
  ok(near(p1.T, 10) && near(p1.Td, 10), '1 km 오르면 둘 다 5 ℃ 낮아짐', p1);
  ok(P.clampDew(10, 12).Td0 === 10 && P.clampDew(10, 12).adjusted, '이슬점 > 기온이면 기온에 맞춤');
  ok(!P.clampDew(10, 10).adjusted, '이슬점 = 기온은 허용');
}

console.log('[축 범위가 필요한 값]');
{
  ok(near(P.parcel(10, 0, 5).T, -21.25), '10 ℃·0 ℃ 공기가 5 km에서 −21.25 ℃');
  ok(near(P.envTemp(P.makeProfile(10, 12), 5), -50), '지표 10 ℃·감률 12에서 5 km 주위 기온 −50 ℃');
}

console.log('[높새바람] 20 ℃ · 12 ℃ · 산 2 km');
{
  const f = P.foehn(20, 12, 2);
  ok(f.reachesSat && f.precipitates, '포화 도달, 강수 있음');
  ok(near(f.lclPoint.z, 1) && near(f.lclPoint.T, 10) && near(f.lclPoint.Td, 10), '응결 시작 1 km · 10 ℃ · 10 ℃', f.lclPoint);
  ok(near(f.summit.T, 5) && near(f.summit.Td, 5) && f.summit.saturated, '정상 2 km · 5 ℃ · 5 ℃ (포화)', f.summit);
  ok(near(f.arrival.T, 25) && near(f.arrival.Td, 9), '영서 도착 25 ℃ · 9 ℃', f.arrival);
  ok(near(f.dT, 5) && near(f.dTd, -3), '기온 +5 ℃, 이슬점 −3 ℃');
  const top = P.foehnAt(f, 'down', 2), justDown = P.foehnAt(f, 'down', 1.999);
  ok(top.saturated, '정상에서 기온 = 이슬점 → 포화');
  ok(!justDown.saturated && justDown.T > justDown.Td, '하강을 시작하면 불포화', justDown);
  const mid = P.foehnAt(f, 'down', 1);
  ok(near(mid.T, 15) && near(mid.Td, 7), '하강 중 1 km: 15 ℃ · 7 ℃ (기온이 더 빨리 상승)', mid);
  ok(P.relHumidity(f.arrival.T, f.arrival.Td) < P.relHumidity(20, 12), '도착 상대 습도 < 출발 상대 습도');
  const up15 = P.foehnAt(f, 'up', 1.5);
  ok(up15.precipitating && up15.saturated, '풍상측 포화 상승 구간에서 강수');
}

console.log('[높새바람] 산 높이 = 응결 고도 (1 km)');
{
  const f = P.foehn(20, 12, 1);
  ok(f.reachesSat && !f.precipitates, '정상에서 처음 포화, 강수 구간 길이 0');
  ok(f.summit.saturated && near(f.summit.T, 10), '정상 10 ℃ 포화', f.summit);
  ok(near(f.arrival.T, 20) && near(f.arrival.Td, 12), '도착 20 ℃ · 12 ℃ (수분 손실 없음)', f.arrival);
  ok(!P.foehnAt(f, 'up', 1).precipitating, '정상에서도 강수 없음');
}

console.log('[높새바람] 산 0.5 km — 응결 고도에 못 미침');
{
  const f = P.foehn(20, 12, 0.5);
  ok(!f.reachesSat && !f.precipitates && f.lclPoint === null, '전체 경로 불포화');
  ok(!f.summit.saturated && near(f.summit.T, 15) && near(f.summit.Td, 11), '정상 15 ℃ · 11 ℃', f.summit);
  ok(near(f.arrival.T, 20) && near(f.arrival.Td, 12), '도착 = 출발 (20 ℃ · 12 ℃)', f.arrival);
}

console.log('[높새바람] 처음부터 포화 (15 ℃ · 15 ℃, 산 2 km)');
{
  const f = P.foehn(15, 15, 2);
  ok(f.start.saturated && near(f.lclPoint.z, 0), '출발부터 포화, 응결 시작 0 km');
  ok(near(f.summit.T, 5) && near(f.arrival.T, 25) && near(f.arrival.Td, 9), '정상 5 ℃, 도착 25 ℃ · 9 ℃', f.arrival);
}

console.log('[대기 안정도] 30 ℃ · 14 ℃ · 감률 8 ℃/km');
{
  const prof = P.makeProfile(30, 8);
  ok(near(P.lcl(30, 14), 2), '응결 고도 2 km');
  ok(near(P.parcel(30, 14, 2).T, 10) && near(P.envTemp(prof, 2), 14), '2 km: 공기 10 ℃ · 주위 14 ℃');
  ok(P.buoyancy(30, 14, prof, 2) < 0, '2 km에서 놓으면 하강 방향');
  ok(near(P.parcel(30, 14, 3.5).T, 2.5) && near(P.envTemp(prof, 3.5), 2), '3.5 km: 공기 2.5 ℃ · 주위 2 ℃');
  ok(P.buoyancy(30, 14, prof, 3.5) > 0, '3.5 km에서 놓으면 상승 방향');
  const iv = P.buoyancyIntervals(30, 14, prof, 6);
  ok(near(iv.lfc, 10 / 3, 1e-9), '자유 대류 고도 약 3.33 km', iv);
  ok(iv.el === null, '6 km까지 계속 따뜻함');
  ok(near(P.buoyancy(30, 14, prof, 10 / 3), 0, 1e-9), '자유 대류 고도에서 두 기온이 같음');
}

console.log('[대기 안정도] 감률 경계값 5 · 10 ℃/km');
{
  ok(P.stabilityFor(5, false) === 'stable' && P.stabilityFor(5, true) === 'neutral', 'γ = 5: 불포화 안정 · 포화 중립');
  ok(P.stabilityFor(10, false) === 'neutral' && P.stabilityFor(10, true) === 'unstable', 'γ = 10: 불포화 중립 · 포화 불안정');
  ok(P.stabilityClass(4).key === 'absolute-stable', 'γ = 4 절대 안정');
  ok(P.stabilityClass(5).key === 'moist-neutral', 'γ = 5 경계(포화 중립)');
  ok(P.stabilityClass(8).key === 'conditional', 'γ = 8 조건부 불안정');
  ok(P.stabilityClass(10).key === 'dry-neutral', 'γ = 10 경계(불포화 중립)');
  ok(P.stabilityClass(12).key === 'absolute-unstable', 'γ = 12 절대 불안정');
  ok(P.buoyancyIntervals(30, 14, P.makeProfile(30, 5), 6).lfc === null, 'γ = 5: 어디서도 주위보다 따뜻하지 않음');
  ok(near(P.buoyancyIntervals(30, 14, P.makeProfile(30, 10), 6).lfc, 2), 'γ = 10: 응결 고도(2 km)부터 따뜻해짐');
  ok(P.buoyancyIntervals(30, 14, P.makeProfile(30, 12), 6).lfc === 0, 'γ = 12: 지표부터 따뜻해짐');
  ok(P.buoyancyIntervals(30, 14, P.makeProfile(30, 4), 6).lfc === null, 'γ = 4: 자유 대류 고도 없음');
}

console.log('[운동 모형] 같은 조건에서 놓았을 때');
{
  const prof = P.makeProfile(30, 8);
  const run = (z0, sec) => { let s = { z: z0, v: 0 }; for (let i = 0; i < sec * 120; i++) s = P.motionStep(30, 14, prof, s, 1 / 120, 6); return s; };
  ok(run(2, 1).z < 2, '2 km에서 놓으면 내려감');
  ok(run(3.5, 1).z > 3.5, '3.5 km에서 놓으면 올라감');
  const eq = run(10 / 3, 1);
  ok(Math.abs(eq.z - 10 / 3) < 1e-6, '자유 대류 고도에 정확히 놓으면(속도 0) 바로 움직이지 않음', eq);
  const top = run(3.5, 30);
  ok(top.z === 6 && top.hit === 'top', '표시 상한(6 km)에서 멈춤 — 상한 도달로 구별', top);
  const g = run(0, 1);
  ok(g.z === 0, '지표의 공기는 그대로 있음');
}

console.log('[역전층] 주위 기온 분포의 연속성과 운동');
{
  const prof = P.makeProfile(30, 12, { base: 1.5, depth: 0.5, dT: 4 });
  const e = z => P.envTemp(prof, z);
  ok(near(e(1.5), 12) && near(e(2), 16), '역전층 아래 12 ℃ → 위 16 ℃');
  ok(near(e(1.5 - 1e-9), e(1.5), 1e-6) && near(e(2 + 1e-9), e(2), 1e-6), '경계에서 끊김 없음');
  ok(near(e(3), 4), '역전층 위는 다시 12 ℃/km 감소');
  ok(P.envLapse(prof, 1.75) === -8, '역전층 안 감률 −8 ℃/km');
  const iv = P.buoyancyIntervals(30, 14, prof, 6);
  ok(iv.lfc === 0 && near(iv.el, 30 / 18, 1e-9), '지표부터 따뜻하다가 약 1.67 km에서 주위와 같아짐', iv);
  ok(iv.warm.length === 2 && near(iv.warm[1][0], 2 + 6 / 7, 1e-9), '역전층 위 약 2.86 km부터 다시 따뜻함', iv.warm);
  let s = { z: 0.3, v: 0 }, maxZ = 0;
  for (let i = 0; i < 120 * 40; i++) { s = P.motionStep(30, 14, prof, s, 1 / 120, 6); maxZ = Math.max(maxZ, s.z); }
  ok(maxZ < 2 && Math.abs(s.z - 30 / 18) < 0.05, '역전층에 막혀 응결 고도 아래(약 1.67 km 부근)에 머묾', { maxZ, z: s.z });
  const flat = P.makeProfile(30, 12, { base: 1.5, depth: 0, dT: 4 });
  ok(flat.inv === null && near(P.envTemp(flat, 3), -6), '두께 0이면 일정 감률과 같음');
}

console.log('[상대 습도]');
{
  ok(P.relHumidity(10, 10) === 100, '기온 = 이슬점 → 100 %');
  const rh = P.relHumidity(20, 12);
  ok(rh > 55 && rh < 65, '20 ℃ · 12 ℃ → 약 60 %', rh);
}

console.log('');
console.log(`결과: ${passed}개 통과, ${failed}개 실패`);
process.exit(failed > 0 ? 1 : 0);
