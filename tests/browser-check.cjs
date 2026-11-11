/**
 * tests/browser-check.cjs — 실제 브라우저(Chromium)에서 화면 상태를 확인하는 회귀 검사
 * 실행: node tests/browser-check.cjs   (Playwright가 설치된 환경에서)
 * 수치 칸·그래프·장면이 계산과 맞는지, 되감기·조건 변경·비교 기록·역전층 전환이 일관적인지 본다.
 */
'use strict';
const path = require('path');
const { chromium } = require('playwright');

const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
const ok = (c, label, detail) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label + (detail !== undefined ? ' → ' + JSON.stringify(detail) : '')); } };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.route('**/cdn.jsdelivr.net/**', r => r.abort());   // 글꼴을 못 불러와도 동작해야 함
  await page.goto(url);
  await page.waitForTimeout(300);

  const ro = (tab) => page.evaluate(t => {
    const out = {};
    document.querySelectorAll(`#lab-${t} .readouts .ro`).forEach((c, i) => { out[i] = c.querySelector('.v').textContent.replace(/\s+/g, ''); });
    out.guide = document.querySelector(`#lab-${t} .ro-guide`).textContent;
    return out;
  }, tab);
  const ev = (js) => page.evaluate(js);

  console.log('[응결 고도]');
  {
    let r = await ro('lcl');
    ok(r[0] === '0.00km' && r[1] === '20.0℃' && r[2] === '12.0℃' && r[3] === '8.0℃', '출발: 20.0 ℃ · 12.0 ℃ · 차 8.0 ℃', r);
    await ev('App.TABS.lcl.api.play()');
    await page.waitForTimeout(4500);
    r = await ro('lcl');
    ok(r[0] === '1.00km' && r[1] === '10.0℃' && r[2] === '10.0℃', '안내 실험은 1.00 km에서 정확히 멈춤 (10.0 ℃ · 10.0 ℃)', r);
    ok(/응결이 시작/.test(r.guide), '안내: 응결 시작', r.guide);
    const yLine = await ev(() => { const s = document.querySelector('#lab-lcl .scene-pane svg line[data-role="lcl"]'); const g = document.querySelector('#lab-lcl .graph-pane svg line[data-role="lcl"]'); return [s.getBoundingClientRect().top, g.getBoundingClientRect().top]; });
    ok(Math.abs(yLine[0] - yLine[1]) < 1, '구름 바닥과 그래프 응결 고도선이 실제 화면에서 같은 높이', yLine);
    await ev('App.TABS.lcl.api.setZ(2)');
    r = await ro('lcl');
    ok(r[1] === '5.0℃' && r[2] === '5.0℃', '2 km에서 기온·이슬점 모두 5.0 ℃', r);
    await ev('App.TABS.lcl.api.setCond(25, 15)');
    await page.click('#lab-lcl .ctrl-bar .btn.accent');
    r = await ro('lcl');
    const z = await ev('App.TABS.lcl.api.st.z');
    ok(z === 1.25 && r[1] === '12.5℃' && r[2] === '12.5℃' && r[4] === '100%', '25 ℃·15 ℃: 응결 고도로 이동 → 정확히 1.25 km, 포화', { z, r });
    await ev('App.TABS.lcl.api.setZ(1.2499)');
    r = await ro('lcl');
    ok(r[1] !== r[2], '응결 고도 바로 아래에서는 기온과 이슬점이 다르게 보임(자릿수 추가)', r);
    await ev('App.TABS.lcl.api.setCond(15, 15)');
    r = await ro('lcl');
    ok(r[0] === '0.00km' && /포화/.test(r.guide), '기온 = 이슬점: 0 km부터 포화', r);
    await ev('App.TABS.lcl.api.setCond(10, 0)'); await ev('App.TABS.lcl.api.setZ(5)');
    r = await ro('lcl');
    const inRange = await ev(() => { const c = [...document.querySelectorAll('#lab-lcl .graph-pane svg circle')].find(e => e.getAttribute('r') === '9' || e.getAttribute('r') === '7'); return !!c; });
    ok(r[1] === '−21.3℃' || r[1] === '−21.25℃' || r[1] === '−21.2℃', '10 ℃·0 ℃ 공기가 5 km에서 −21.25 ℃', r);
    const edge = await ev(() => document.querySelectorAll('#lab-lcl .graph-pane svg path[d*="l10 -7"], #lab-lcl .graph-pane svg path[d*="l-10 -7"]').length);
    ok(edge === 0 && inRange, '그래프 범위 안에 표시(가장자리 표시 없이)', { edge });
    // 이슬점 > 기온 입력 방지
    await ev('App.TABS.lcl.api.setCond(20, 12)');
    await ev('App.TABS.lcl.api.setCond(10, null)');
    const td = await ev('App.TABS.lcl.api.st.Td0');
    ok(td === 10, '기온을 이슬점보다 낮추면 이슬점도 기온에 맞춰짐', td);
  }

  console.log('[푄 현상]');
  {
    await page.click('#tab-btn-foehn'); await page.waitForTimeout(200);
    const go = k => ev(`App.TABS.foehn.api.goStage('${k}')`);
    await go('lcl'); let r = await ro('foehn');
    ok(r[1] === '1.00km' && r[2] === '10.0℃' && r[3] === '10.0℃', '응결 시작 1 km · 10 ℃ · 10 ℃', r);
    await go('summit'); r = await ro('foehn');
    ok(r[1] === '2.00km' && r[2] === '5.0℃' && r[3] === '5.0℃' && r[4] === '100%', '정상 2 km · 5 ℃ · 5 ℃ (포화)', r);
    await ev('App.TABS.foehn.api.setS(0.5 + 1e-4)'); r = await ro('foehn');
    ok(/불포화/.test(r.guide) || r[4] !== '100%', '하강을 시작하면 불포화', r);
    await go('arrive'); r = await ro('foehn');
    ok(r[1] === '0.00km' && r[2] === '25.0℃' && r[3] === '9.0℃', '풍하측 도착 25 ℃ · 9 ℃', r);
    ok(/5\.0 ℃ 높고/.test(r.guide) && /3\.0 ℃ 낮아요/.test(r.guide), '출발 대비 기온 +5, 이슬점 −3 설명', r.guide);
    // 되감기와 같은 위치 재접근
    const snap = () => ev(() => [document.querySelector('#lab-foehn .readouts').textContent, document.querySelector('#lab-foehn .scene-pane svg').innerHTML.length]);
    await ev('App.TABS.foehn.api.setS(0.3)'); const a = await snap();
    await ev('App.TABS.foehn.api.setS(1)'); await ev('App.TABS.foehn.api.setS(0.3)'); const b = await snap();
    ok(a[0] === b[0] && a[1] === b[1], '진행 0.3 → 도착 → 0.3 되감기: 그림·수치 같음', { a: a[1], b: b[1] });
    await ev('App.TABS.foehn.api.setS(0)'); await ev('App.TABS.foehn.api.setS(0.3)'); const c2 = await snap();
    ok(a[0] === c2[0] && a[1] === c2[1], '다른 순서로 같은 위치에 와도 같은 상태', { a: a[1], c: c2[1] });
    await ev('App.TABS.foehn.api.setCond({M: 1})');
    await go('summit'); r = await ro('foehn');
    ok(r[2] === '10.0℃' && r[3] === '10.0℃' && r[4] === '100%', '산 1 km: 정상에서 포화 도달', r);
    const lbl = await ev(() => [...document.querySelectorAll('#lab-foehn svg text')].map(t => t.textContent).join('|'));
    ok(/응결 시작 = 정상/.test(lbl) && !/정상보다 높음/.test(lbl), '산 = 응결 고도: "응결 시작 = 정상" (산보다 높다고 표시하지 않음)');
    await go('arrive'); r = await ro('foehn');
    ok(r[2] === '20.0℃' && r[3] === '12.0℃', '산 1 km: 도착 20 ℃ · 12 ℃', r);
    await ev('App.TABS.foehn.api.setCond({M: 0.5})');
    await go('lcl'); r = await ro('foehn');
    ok(/응결이 일어나지 않아요/.test(r.guide), '산 0.5 km: 응결 시작 단계 없음 안내', r.guide);
    await go('arrive'); r = await ro('foehn');
    ok(r[2] === '20.0℃' && r[3] === '12.0℃', '산 0.5 km: 도착 = 출발 (20 ℃ · 12 ℃)', r);
    // 조건 변경 시 이전 구름 기록이 남지 않음
    await ev('App.TABS.foehn.api.setCond({M: 2})'); await go('summit');
    const cloudsBefore = await ev(() => document.querySelector('#lab-foehn .scene-pane svg').querySelectorAll('clipPath circle').length);
    await ev('App.TABS.foehn.api.setCond({T0: 22})');
    const cloudsAfter = await ev(() => document.querySelector('#lab-foehn .scene-pane svg').querySelectorAll('clipPath circle').length);
    const sNow = await ev('App.TABS.foehn.api.st.s');
    ok(cloudsBefore > 0 && cloudsAfter === 0 && sNow === 0, '조건을 바꾸면 출발점으로, 이전 구름 없음', { cloudsBefore, cloudsAfter, sNow });
    // 비교 기록 유지
    await ev('App.TABS.foehn.api.setCond({T0: 20, Td0: 12, M: 2})'); await ev('App.TABS.foehn.api.saveCompare()');
    await ev('App.TABS.foehn.api.setCond({M: 3})');
    const cmp = await ev('JSON.stringify(App.TABS.foehn.api.st.cmp)');
    ok(/"M":2/.test(cmp) && /"T0":20/.test(cmp), '비교 저장 후 조건을 바꿔도 비교 조건 유지', cmp);
  }

  console.log('[대기 안정도]');
  {
    await page.click('#tab-btn-stab'); await page.waitForTimeout(200);
    await ev('App.TABS.stab.api.liftTo(2)');
    await page.waitForTimeout(3900);
    let r = await ro('stab');
    ok(r[0] === '2.00km' && r[1] === '10.0℃' && r[2] === '14.0℃', '2 km: 공기 10 ℃ · 주위 14 ℃', r);
    await ev('App.TABS.stab.api.release()'); await page.waitForTimeout(900);
    let z = await ev('App.TABS.stab.api.cur().z');
    ok(z < 2, '2 km에서 놓으면 하강', z);
    await ev('App.TABS.stab.api.resetMotion()'); await ev('App.TABS.stab.api.liftTo(3.5)'); await page.waitForTimeout(6300);
    r = await ro('stab');
    ok(r[0] === '3.50km' && r[1] === '2.5℃' && r[2] === '2.0℃', '3.5 km: 공기 2.5 ℃ · 주위 2.0 ℃', r);
    await ev('App.TABS.stab.api.release()'); await page.waitForTimeout(900);
    z = await ev('App.TABS.stab.api.cur().z');
    ok(z > 3.5, '3.5 km에서 놓으면 상승', z);
    await page.waitForTimeout(9000);
    r = await ro('stab');
    ok(/표시 범위/.test(r.guide) && r[0] === '6.00km', '상한 도달: "표시 범위에 도달했어요"', r);
    // 되감기
    const idxMid = await ev('Math.floor(App.TABS.stab.api.st.run.frames.length * 0.6)');
    await ev(`App.TABS.stab.api.seek(${idxMid})`); const a = await ro('stab');
    await ev(`App.TABS.stab.api.seek(0)`); await ev(`App.TABS.stab.api.seek(${idxMid})`); const b = await ro('stab');
    ok(JSON.stringify(a) === JSON.stringify(b), '기록 되감기: 같은 순간은 같은 수치', { a: a[0], b: b[0] });
    await page.click('#lab-stab .graph-pane input[type=checkbox]');
    const lbl = await ev(() => [...document.querySelectorAll('#lab-stab .graph-pane svg text')].map(t => t.textContent).join('|'));
    ok(/자유 대류 고도 약 3\.33 km/.test(lbl), '자유 대류 고도 약 3.33 km 표시', lbl.slice(0, 200));
    const badge = async g => { await ev(`App.TABS.stab.api.setCond({gamma: ${g}})`); return ev(() => document.querySelector('#lab-stab .stab-badge').textContent); };
    ok(/불포화 안정 · 포화 중립/.test(await badge(5)), 'γ = 5: 불포화 안정 · 포화 중립');
    ok(/불포화 중립 · 포화 불안정/.test(await badge(10)), 'γ = 10: 불포화 중립 · 포화 불안정');
    ok(/조건부 불안정/.test(await badge(8)), 'γ = 8: 조건부 불안정');
    const frames = await ev('App.TABS.stab.api.st.run.frames.length');
    ok(frames === 1, '조건 변경 시 이전 운동 기록 없음', frames);
    // 비교 저장 후 조건 변경
    await ev('App.TABS.stab.api.setCond({gamma: 4})'); await ev('App.TABS.stab.api.saveCompare()'); await ev('App.TABS.stab.api.setCond({gamma: 12})');
    const cmp = await ev('App.TABS.stab.api.st.cmp.gamma');
    ok(cmp === 4, '비교 기록(γ 4) 유지', cmp);
    // 역전층
    await page.evaluate(() => { const b = [...document.querySelectorAll('#lab-stab .fold .btn')].find(x => x.textContent.includes('예시 조건')); b.click(); });
    await ev('App.TABS.stab.api.liftTo(0.5)'); await page.waitForTimeout(1000); await ev('App.TABS.stab.api.release()');
    await page.waitForTimeout(16000);
    const zi = await ev('App.TABS.stab.api.cur().z');
    const maxZ = await ev('Math.max(...App.TABS.stab.api.st.run.frames.map(f => f.z))');
    ok(maxZ < 2 && Math.abs(zi - 30 / 18) < 0.12, '역전층에 막혀 응결 고도 아래 약 1.67 km 부근에 머묾', { zi, maxZ });
    r = await ro('stab');
    const info = await ev(() => document.querySelector('#lab-stab .fold .note').textContent);
    ok(/역전층/.test(await ev(() => document.querySelector('#lab-stab .stab-badge').textContent)), '역전층 배지 표시');
    void info; void r;
  }

  console.log('[장면 · 그래프 같은 높이 정렬]');
  for (const [t, act] of [['lcl', 'App.TABS.lcl.api.setZ(2.37)'], ['foehn', 'App.TABS.foehn.api.setS(0.33)'], ['stab', 'App.TABS.stab.api.seek(Math.floor(App.TABS.stab.api.st.run.frames.length / 2))']]) {
    await page.click('#tab-btn-' + t); await page.waitForTimeout(200);
    await ev(act); await page.waitForTimeout(100);
    const y = await ev(`(() => { const s = document.querySelector('#lab-${t} .scene-pane svg line[data-role="now"]').getBoundingClientRect(); const g = document.querySelector('#lab-${t} .graph-pane svg line[data-role="now"]').getBoundingClientRect(); return [s.top + s.height / 2, g.top + g.height / 2]; })()`);
    ok(Math.abs(y[0] - y[1]) < 1, `${t}: 장면과 그래프의 현재 높이선이 실제 화면에서 같은 높이`, y);
  }

  console.log('[공통]');
  {
    // 재생 연타해도 루프가 하나: 상태 확인
    await page.click('#tab-btn-lcl'); await ev('App.TABS.lcl.api.resetDefaults()');
    for (let i = 0; i < 7; i++) await page.click('#lab-lcl .ctrl-bar .play');
    await page.waitForTimeout(1000);
    const z1 = await ev('App.TABS.lcl.api.st.z');
    await page.waitForTimeout(500);
    const z2 = await ev('App.TABS.lcl.api.st.z');
    const playing = await ev('App.TABS.lcl.api.st.playing');
    ok(playing && Math.abs((z2 - z1) - 0.15) < 0.06, '재생 버튼 연타 후 속도 일정(루프 중복 없음)', { z1, z2 });
    await page.click('#tab-btn-foehn'); await page.click('#tab-btn-lcl');
    const p2 = await ev('App.TABS.lcl.api.st.playing');
    ok(!p2, '탭을 옮기면 진행이 멈춤 (돌아와 이어서 재생 가능)');
    ok(errors.length === 0, '콘솔 오류 없음', errors);
  }

  console.log(`\n결과: ${pass}개 통과, ${fail}개 실패`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
