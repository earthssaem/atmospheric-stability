/**
 * tab-cloud.js — 4. 구름의 종류
 * 같은 지표 공기를 감률이 다른 대기에서 올려, 대기 안정도에 따라 층운형 · 적운형 구름이 생기는 까닭을 본다.
 * 같은 높이에서 공기 덩어리 기온과 주위 기온을 비교해 운동을 예상한다.
 * 운동은 physics.motionStep(교육용 정성 모형)으로 고정 시간 간격마다 계산하고, 모든 순간을 기록해
 * 되감기·단계 이동 때 그 순간의 그림·수치·그래프를 그대로 복원한다.
 */
'use strict';

const CloudLab = (function () {
  const ZMAX = 6;
  const DT = 1 / 120;          // 계산 간격 (초)
  const LIFT = 0.6;            // 강제로 올리고 내리는 속도 (화면 표현용)
  const MAX_FRAMES = 4800;
  const DEF = { T0: 30, Td0: 14, gamma: 8 };
  const PRESETS = [{ g: 4, label: '4 절대 안정' }, { g: 8, label: '8 조건부 불안정' }, { g: 12, label: '12 절대 불안정' }];
  const INV_EX = { base: 1.5, depth: 0.5, dT: 4 };
  const L = Object.assign(baseLab(), { id: 'cloud' });
  const CASE_BTNS = [{ g: 4, k: 'absolute-stable', t: '절대 안정' }, { g: 8, k: 'conditional', t: '조건부 불안정' }, { g: 12, k: 'absolute-unstable', t: '절대 불안정' }];
  const st = {
    T0: DEF.T0, Td0: DEF.Td0, gamma: DEF.gamma,
    inv: { on: false, base: INV_EX.base, depth: INV_EX.depth, dT: INV_EX.dT },
    target: 2, paused: false, showPath: false, cmp: null, notice: '',
    run: null, idx: 0, acc: 0, holdBtn: false
  };
  L.st = st;
  let sh, ui = {}, E = {}, ax = null, ch = null;

  const prof = (o) => Physics.makeProfile((o || st).T0, (o || st).gamma, (o || st).inv && (o || st).inv.on ? (o || st).inv : null);
  const H = () => Physics.lcl(st.T0, st.Td0);
  const condKey = () => `${st.T0}|${st.Td0}|${st.gamma}|${st.inv.on ? [st.inv.base, st.inv.depth, st.inv.dT].join(',') : '-'}`;

  /* ───────── 기록(실행) ─────────
   * frame: {z, v, a, b, phase: 'free' | 'lift' | 'drag' | 'hold', dir: 위(1)·아래(−1)·멈춤(0), note: null | 'ground' | 'top' | 'rest'}
   *  - lift: 「공기 올리기」·「꾹 눌러 올리기」로 올리거나 내리는 중 / drag: 공기 덩어리를 직접 끌어 움직이는 중
   *  - hold: 사용자가 그 높이에 붙잡아 두고 관찰하는 중 (놓기 전까지 그대로) / free: 놓은 뒤 계산대로 움직임 */
  function newRun() {
    const P = prof();
    const b = Physics.buoyancy(st.T0, st.Td0, P, 0);
    st.run = { frames: [{ z: 0, v: 0, a: 0, b, phase: 'free', note: b <= 1e-9 ? 'ground' : null }], settled: b <= 1e-9, rest: 0, keys: [0], firstStrat: -1, firstCum: -1, pend: null, rose: false, liftTarget: null, steps: 0 };
    st.idx = 0; st.acc = 0;
  }
  const cur = () => st.run.frames[st.idx];
  function truncateToIdx() {
    const r = st.run;
    if (st.idx < r.frames.length - 1) {
      r.frames.length = st.idx + 1;
      r.keys = r.keys.filter(k => k <= st.idx);
      if (r.firstStrat > st.idx) r.firstStrat = -1;
      if (r.firstCum > st.idx) r.firstCum = -1;
      r.settled = false; r.rest = 0; r.pend = null;
    }
  }
  function push(fr) {
    const r = st.run;
    const prev = r.frames[r.frames.length - 1];
    r.frames.push(fr);
    const i = r.frames.length - 1;
    if (fr.phase !== prev.phase || (fr.phase === 'free' && prev.phase === 'free' && Math.sign(fr.v) !== Math.sign(prev.v) && Math.abs(prev.v) > 0.01) || (fr.note && fr.note !== prev.note)) r.keys.push(i);
    const Hn = H();
    st.idx = i;
    // 구름: 상승 응결 고도에 닿아 포화되면 층운형, 응결 고도 위에서 저절로 올라가면 적운형
    if (r.firstStrat < 0 && fr.z >= Hn - 1e-9 && fr.z > 1e-6) { r.firstStrat = i; r.stratForced = fr.phase !== 'free'; noteCloud('stratus'); }
    if (r.firstCum < 0 && fr.phase === 'free' && fr.z > Hn + 0.3 && fr.v > 0.05 && fr.b > 0) { r.firstCum = i; noteCloud('cumulus'); }
  }
  /** 구름이 생긴 순간: 도전 판정용 기록 */
  function noteCloud(kind) {
    L.emit('cloud', { kind, cls: Physics.stabilityClass(st.gamma).key, inv: st.inv.on, key: condKey() });
  }
  /** 계산 한 걸음 */
  function simStep() {
    const r = st.run, P = prof(), f0 = r.frames[r.frames.length - 1];
    let fr;
    if (f0.phase === 'lift') {
      const tgt = r.liftTarget;
      const dir = tgt >= f0.z ? 1 : -1;
      let z = f0.z + dir * LIFT * DT;
      let phase = 'lift', note = null;
      if ((dir > 0 && z >= tgt) || (dir < 0 && z <= tgt)) { z = tgt; phase = 'hold'; }
      if (z >= ZMAX) { z = ZMAX; phase = 'hold'; note = 'top'; }
      const b = Physics.buoyancy(st.T0, st.Td0, P, z);
      fr = { z, v: phase === 'lift' ? dir * LIFT : 0, a: 0, b, phase, dir: phase === 'lift' ? dir : 0, note };
      if (phase === 'hold') emitHeld(z);
    } else if (f0.phase === 'hold' || f0.phase === 'drag') {
      return false;
    } else {
      const m = Physics.motionStep(st.T0, st.Td0, P, { z: f0.z, v: f0.v }, DT, ZMAX);
      let note = null;
      if (m.hit === 'top') note = 'top';
      if (m.hit === 'ground' && m.v === 0 && Physics.buoyancy(st.T0, st.Td0, P, 0) <= 1e-9) note = 'ground';
      fr = { z: m.z, v: m.v, a: m.a, b: Physics.buoyancy(st.T0, st.Td0, P, m.z), phase: 'free', note };
      // 결과(놓은 뒤 방향) 기록
      if (r.pend && Math.abs(m.z - r.pend.z0) > 0.08) { L.emit('outcome', { z0: r.pend.z0, dir: Math.sign(m.z - r.pend.z0), key: r.pend.key, cls: r.pend.cls }); r.pend = null; }
      if (!r.rose && m.z > H() + 0.5 && m.v > 0) { r.rose = true; L.emit('freeRise', { key: condKey(), cls: Physics.stabilityClass(st.gamma).key }); }
      // 멈춤 판정
      if (note === 'top' || note === 'ground') { r.settled = true; }
      else if (Math.abs(m.v) < 0.004 && Math.abs(m.a) < 0.004) { r.rest += DT; if (r.rest > 0.5) { r.settled = true; fr.note = 'rest'; } }
      else r.rest = 0;
      if (r.settled && r.pend) { L.emit('outcome', { z0: r.pend.z0, dir: Math.sign(fr.z - r.pend.z0), key: r.pend.key, cls: r.pend.cls }); r.pend = null; }
    }
    r.steps += 1;
    if (r.frames.length >= MAX_FRAMES) { r.settled = true; fr.note = fr.note || 'limit'; }
    push(fr);
    return true;
  }

  /* ───────── 조작 ───────── */
  function emitHeld(z) { L.emit('lift', { z, sat: z >= H() - 1e-9, key: condKey(), cls: Physics.stabilityClass(st.gamma).key, inv: st.inv.on }); }
  /** 지금 높이에 붙잡아 두기 (올리거나 내리던 중이면 그 자리에서) */
  function holdHere() {
    const f0 = cur();
    if (f0.phase !== 'lift' && f0.phase !== 'drag') return;
    st.run.liftTarget = null;
    push({ z: f0.z, v: 0, a: 0, b: f0.b, phase: 'hold', dir: 0, note: f0.z >= ZMAX - 1e-9 ? 'top' : null });
    emitHeld(f0.z);
    render();
  }
  /* 공기 덩어리를 직접 끌어 움직이기 (손을 떼면 그 높이에 붙잡아 둠) */
  function dragBegin() {
    truncateToIdx();
    const r = st.run, f0 = cur();
    r.settled = false; r.rest = 0; r.pend = null; r.liftTarget = null;
    st.drag = { last: performance.now() };
    push({ z: f0.z, v: 0, a: 0, b: f0.b, phase: 'drag', dir: 0, note: null });
    st.paused = false; st.notice = '';
    render();
  }
  function dragTo(z) {
    if (!st.drag) return;
    z = Math.round(clamp(z, 0, ZMAX) * 100) / 100;
    const f0 = cur();
    if (Math.abs(z - f0.z) < 1e-9) return;
    st.drag.last = performance.now();
    push({ z, v: 0, a: 0, b: Physics.buoyancy(st.T0, st.Td0, prof(), z), phase: 'drag', dir: z > f0.z ? 1 : -1, note: z >= ZMAX - 1e-9 ? 'top' : null });
    render();
  }
  function dragEnd() { if (!st.drag) return; st.drag = null; holdHere(); }
  function liftTo(z) {
    z = clamp(z, 0, ZMAX);
    truncateToIdx();
    const r = st.run, f0 = cur();
    if (Math.abs(f0.z - z) < 1e-9) { st.notice = '이미 그 높이에 있어요.'; render(); return; }
    r.liftTarget = z; r.settled = false; r.rest = 0; r.pend = null;
    push({ z: f0.z, v: 0, a: 0, b: f0.b, phase: 'lift', dir: z > f0.z ? 1 : -1, note: null });
    st.paused = false; st.notice = '';
    render();
  }
  function release() {
    truncateToIdx();
    const r = st.run, f0 = cur();
    if (f0.phase === 'free') return;
    r.settled = false; r.rest = 0;
    r.pend = { z0: f0.z, key: condKey(), cls: Physics.stabilityClass(st.gamma).key, inv: st.inv.on };
    L.emit('release', { z: f0.z, b: f0.b, key: condKey(), cls: Physics.stabilityClass(st.gamma).key, inv: st.inv.on, lfc: Physics.buoyancyIntervals(st.T0, st.Td0, prof(), ZMAX).lfc });
    st.drag = null;
    push({ z: f0.z, v: f0.phase === 'lift' ? f0.v : 0, a: 0, b: f0.b, phase: 'free', dir: 0, note: null });
    st.paused = false; st.notice = '';
    render();
  }
  // 꾹 누르는 동안 올리고, 손을 떼면 그 높이에 붙잡아 둔다 (놓기는 따로)
  function holdStart() { st.holdBtn = true; liftTo(ZMAX); }
  function holdEnd() { if (!st.holdBtn) return; st.holdBtn = false; if (cur().phase === 'lift') holdHere(); }
  function play() {
    if (!st.paused && active()) { st.paused = true; render(); return; }
    if (st.paused) { st.paused = false; render(); return; }
    liftTo(st.target);                                       // 멈춰 있으면 목표 높이까지 올리기
  }
  /** 시간이 흐르는 중인가: 움직이는 중이거나, 기록을 이어 보는 중이거나, 붙잡아 두고 관찰하는 중 */
  function active() { const r = st.run, p = cur().phase; return st.idx < r.frames.length - 1 || p === 'hold' || p === 'drag' || !r.settled; }
  function pause() { if (st.holdBtn) holdEnd(); if (st.drag) dragEnd(); }    // 재생 버튼이 없는 탭: 다른 탭에 있는 동안은 계산하지 않고, 돌아오면 이어서 움직임
  function resetMotion() { newRun(); st.paused = false; st.notice = ''; L.emit('reset'); render(); }
  function seek(i) { st.idx = clamp(Math.round(i), 0, st.run.frames.length - 1); st.paused = true; render(); }
  function step(d) {
    const keys = st.run.keys.concat([st.run.frames.length - 1]);
    const uniq = [...new Set(keys)].sort((a, b) => a - b);
    if (d > 0) { const n = uniq.find(k => k > st.idx); if (n != null) seek(n); }
    else { const p = [...uniq].reverse().find(k => k < st.idx); if (p != null) seek(p); }
  }
  function tick(dt) {
    const r = st.run;
    if (st.paused) return;
    if (st.drag) {                                    // 누른 채 멈춰 있으면 '붙잡아 둔 상태'로 표시
      const f0 = cur();
      if (f0.dir !== 0 && performance.now() - st.drag.last > 300) { push(Object.assign({}, f0, { dir: 0 })); render(); }
      return;
    }
    if (st.idx < r.frames.length - 1) {          // 되감은 뒤 재생: 기록을 이어서 보여 줌
      st.idx = Math.min(r.frames.length - 1, st.idx + Math.round(dt / DT));
      render(); return;
    }
    if (r.settled && cur().phase !== 'lift') return;
    st.acc += dt;
    let n = 0;
    while (st.acc >= DT && n < 30) { st.acc -= DT; n += 1; if (!simStep()) { st.acc = 0; break; } if (r.settled) break; }
    if (n) render();
  }

  /* ───────── 조건 ───────── */
  function setCond(o) {
    st.notice = '';
    if (o.T0 != null) {
      st.T0 = o.T0; ui.Td0.setMax(o.T0);
      if (st.Td0 > o.T0) { st.Td0 = o.T0; ui.Td0.set(o.T0); st.notice = `이슬점이 기온보다 높을 수 없어 이슬점을 ${fT(o.T0)} ℃로 맞췄어요.`; ui.Td0.note(`기온에 맞춰 ${fT(o.T0)} ℃로 낮췄어요`); }
    }
    if (o.Td0 != null) st.Td0 = Math.min(o.Td0, st.T0);
    if (o.gamma != null) st.gamma = o.gamma;
    ui.T0.set(st.T0); ui.Td0.setMax(st.T0); ui.Td0.set(st.Td0); ui.g.set(st.gamma);
    conditionsChanged();
  }
  function conditionsChanged() {
    ui.preset.set(PRESETS.some(p => Math.abs(p.g - st.gamma) < 1e-9) ? st.gamma : null);
    newRun(); st.paused = false;
    L.emit('cond', { key: condKey() });
    rebuildAll();
  }
  function resetDefaults() {
    Object.assign(st, { T0: DEF.T0, Td0: DEF.Td0, gamma: DEF.gamma, target: 2, showPath: false, notice: '' });
    st.inv = { on: false, base: INV_EX.base, depth: INV_EX.depth, dT: INV_EX.dT };
    ui.T0.set(DEF.T0); ui.Td0.setMax(DEF.T0); ui.Td0.set(DEF.Td0); ui.g.set(DEF.gamma); ui.tz.set(2);
    syncInvUI();
    conditionsChanged();
  }
  const cmpLabel = c => `γ ${fmt(c.gamma, 1)} ℃/km${c.inv.on ? ' · 역전층' : ''} · ${fT(c.T0)} ℃/${fT(c.Td0)} ℃`;
  function saveCompare() {
    const r = st.run;
    st.cmp = { T0: st.T0, Td0: st.Td0, gamma: st.gamma, inv: Object.assign({}, st.inv), zs: r.frames.slice(0, st.idx + 1).map(f => f.z), label: '' };
    st.cmp.label = cmpLabel(st.cmp);
    L.emit('compare', {});
    afterCompareChange();
  }
  function afterCompareChange() { ui.cmp.show(st.cmp ? st.cmp.label : ''); renderLegend(); rebuildAll(); }

  /* ───────── 화면 만들기 ───────── */
  function init(root) {
    sh = makeShell(root, {
      ratio: '40%', zMax: ZMAX,
      sceneTitle: '대기 단면', graphTitle: '높이–온도 그래프',
      sceneLabel: '공기 덩어리와 주위 대기의 단면', graphLabel: '공기 덩어리 기온과 주위 기온의 높이에 따른 변화'
    });
    // 위쪽: 세 가지 대기 버튼만 (지표 공기 · 감률 직접 정하기 · 비교 · 역전층은 아래 「자유 탐구 · 도전」)
    ui.preset = (function () {
      const el = h('span', { class: 'case-btns', role: 'group', 'aria-label': '대기 고르기' });
      const btns = CASE_BTNS.map(c => { const bt = Btn(`${c.t}<small>기온 감률 ${c.g} ℃/km</small>`, '', () => setCond({ gamma: c.g })); el.appendChild(bt); return bt; });
      return { el, set() { const k = Physics.stabilityClass(st.gamma).key; btns.forEach((bt, i) => { const on = CASE_BTNS[i].k === k && !st.inv.on; bt.classList.toggle('on', on); bt.setAttribute('aria-pressed', on ? 'true' : 'false'); }); } };
    })();
    ui.condInfo = h('span', { class: 'cond-info' });
    sh.cond.append(h('div', { class: 'nf' }, h('span', { class: 'nf-label', text: '대기' }), ui.preset.el), ui.condInfo);
    ui.T0 = NumField({ label: '지표 기온 T<sub>0</sub>', min: 10, max: 40, step: 0.1, sliderStep: 0.5, decimals: 1, value: st.T0, unit: '℃', cls: 'tight', onCommit: v => setCond({ T0: v }) });
    ui.Td0 = NumField({ label: '지표 이슬점 Td<sub>0</sub>', min: 0, max: st.T0, step: 0.1, sliderStep: 0.5, decimals: 1, value: st.Td0, unit: '℃', cls: 'tight', onCommit: v => setCond({ Td0: v }) });
    ui.g = NumField({ label: '주위 기온 감률 γ', min: 2, max: 14, step: 0.1, sliderStep: 0.5, decimals: 1, value: st.gamma, unit: '℃/km', cls: 'tight', onCommit: v => setCond({ gamma: v }) });
    ui.T0.range.style.setProperty('--c', 'var(--temp)');
    ui.Td0.range.style.setProperty('--c', 'var(--dew)');
    ui.g.range.style.setProperty('--c', 'var(--env)');
    ui.preset.set();

    ui.badge = h('span', { class: 'stab-badge' });      // 대표 감률이 아니거나 역전층을 넣었을 때만 보임
    sh.sceneHead.append(ui.badge);
    ui.legend = h('span', { class: 'legend' });
    sh.graphLegend.append(ui.legend);

    ui.ro = Readouts(sh.ro, [
      { key: 'z', label: '높이' },
      { key: 'Tp', label: '<i style="border-color:var(--temp)"></i>공기 덩어리 기온', cls: 'temp' },
      { key: 'Te', label: '<i style="border-color:var(--env)"></i>주위 기온', cls: 'env' },
      { key: 'cloud', label: '구름' }
    ]);
    // 조작은 한 줄: 꾹 눌러 올리기(또는 끌기) → (손을 떼면 붙잡아 둠) → 놓기, 처음으로
    ui.hold = Btn('▲ 꾹 눌러 올리기', 'accent', null, { title: '누르고 있는 동안 올라가고, 손을 떼면 그 높이에 붙잡아 둬요 (Space·Enter 키도 가능)' });
    holdButton(ui.hold, holdStart, holdEnd);
    ui.rel = Btn('놓기', 'primary', release);
    ui.relHint = h('span', { class: 'rel-hint show' });
    ui.reset = Btn('↺ 처음으로', '', resetMotion, { title: '공기 덩어리를 지표로 되돌려요' });
    sh.ctrl.classList.add('act-bar');
    sh.ctrl.append(ui.hold, ui.rel, ui.relHint, h('div', { class: 'tail' }, ui.reset));
    // 자유 탐구용: 목표 높이까지 정확히 올리기
    ui.tz = NumField({ label: '목표 높이', min: 0, max: ZMAX, step: 0.01, decimals: 2, value: st.target, unit: 'km', cls: 'compact', onCommit: v => { st.target = v; render(); } });
    ui.lift = Btn('공기 올리기', 'sm accent', () => liftTo(st.target));

    buildMore();
    buildChallenges();
    newRun();
    renderLegend();
    render();
  }

  function buildMore() {
    const m = sh.more;
    // 역전층 탐구 (심화)
    ui.invOn = Toggle('역전층 넣기', st.inv.on, v => { st.inv.on = v; syncInvUI(); conditionsChanged(); });
    ui.invBase = NumField({ label: '시작 높이', min: 0.2, max: 5, step: 0.1, decimals: 1, value: st.inv.base, unit: 'km', cls: 'compact', onCommit: v => { st.inv.base = v; if (st.inv.on) conditionsChanged(); } });
    ui.invDepth = NumField({ label: '두께', min: 0.1, max: 2, step: 0.1, decimals: 1, value: st.inv.depth, unit: 'km', cls: 'compact', onCommit: v => { st.inv.depth = v; if (st.inv.on) conditionsChanged(); } });
    ui.invDT = NumField({ label: '기온 증가', min: 0, max: 10, step: 0.5, decimals: 1, value: st.inv.dT, unit: '℃', cls: 'compact', onCommit: v => { st.inv.dT = v; if (st.inv.on) conditionsChanged(); } });
    ui.invInfo = h('div', { class: 'note' });
    const ex = Btn('예시 조건 넣기', 'sm accent', () => {
      st.T0 = 30; st.Td0 = 14; st.gamma = 12; st.inv = { on: true, base: 1.5, depth: 0.5, dT: 4 };
      ui.T0.set(30); ui.Td0.setMax(30); ui.Td0.set(14); ui.g.set(12); syncInvUI(); conditionsChanged();
      st.target = 0.5; ui.tz.set(0.5);
      st.notice = '예시: 감률 12 ℃/km 대기의 1.5~2.0 km에 기온이 4 ℃ 높아지는 역전층이 있어요. 0.50 km까지 올렸다 놓아 보세요.'; render();
    });
    // 더 해 보기: 도전 1개 + 역전층(심화)
    ui.chBox = h('div');
    const invSec = h('div', { class: 'more-sec' },
      h('h4', { html: '역전층 넣어 보기 <span class="tag">심화</span>' }),
      h('p', { html: '<b>역전층</b>은 높이 올라갈수록 기온이 <b>높아지는</b> 층이에요. 매우 안정해서 아래에서 올라오던 공기의 상승을 막아요.' }),
      h('div', { class: 'ch-row' }, ui.invOn.el, ex),
      h('div', { class: 'inv-fields' }, ui.invBase.el, ui.invDepth.el, ui.invDT.el), ui.invInfo,
      h('p', { class: 'note', html: '맑고 바람이 약한 새벽 지표 부근에 잘 생기고, 오염 물질이 잘 퍼지지 못해요. (교과서 95쪽)' }));
    const cmpRow = h('div', { class: 'ch-row' });
    ui.cmp = CompareUI(cmpRow, saveCompare, () => { st.cmp = null; afterCompareChange(); });
    const freeSec = h('div', null,
      h('p', { class: 'note', text: '지표 공기와 감률을 직접 정하거나, 원하는 높이까지 정확히 올리거나, 결과를 옅은 선으로 남겨 비교할 때 써요.' }),
      h('div', { class: 'inv-fields' }, ui.T0.el, ui.Td0.el, ui.g.el),
      h('div', { class: 'ch-row' }, ui.tz.el, ui.lift),
      cmpRow, h('div', { class: 'ch-row' }, Btn('조건 기본값', 'sm', resetDefaults)));
    m.appendChild(Fold('자유 탐구 · 도전 <span class="tag">조건 직접 정하기 · 비교 · 도전 · 역전층</span>', h('div', null, freeSec, h('div', { class: 'more-sec' }, h('h4', { text: '도전' }), ui.chBox), invSec), false));
    syncInvUI();
  }
  function syncInvUI() {
    ui.invOn.set(st.inv.on);
    ui.invBase.set(st.inv.base); ui.invDepth.set(st.inv.depth); ui.invDT.set(st.inv.dT);
    [ui.invBase, ui.invDepth, ui.invDT].forEach(f => f.setDisabled(!st.inv.on));
  }

  function buildChallenges() {
    ch = Challenges(ui.chBox, L, [
      {
        id: 'lfc', title: '저절로 올라가기 시작하는 높이 찾기',
        goal: '<b>조건부 불안정</b> 대기에서 공기 덩어리를 <b>되도록 낮은 곳</b>에서 놓아, 강제로 올리는 힘 없이 <b>저절로 올라가</b> 적운형 구름이 생기게 하세요. (그 높이보다 0.3 km 이내에서 놓기)',
        hints: ['응결 고도 위에서 공기 덩어리 기온과 주위 기온을 높이마다 비교해 보세요.', '공기 덩어리가 주위보다 따뜻해지기 시작하는 높이를 찾아보세요. 그 높이부터는 놓아도 저절로 올라가요.', '그래프에 표시된 「주위보다 따뜻해지는 높이」 바로 위까지 올렸다 놓아 보세요.'],
        check(lab, since) {
          const rel = lab.since(since, 'release').filter(e => e.cls === 'conditional' && !e.inv && e.lfc != null && e.z >= e.lfc - 1e-9 && e.z <= e.lfc + 0.3);
          if (!rel.length) return false;
          return lab.since(rel[0].seq, 'cloud').some(e => e.kind === 'cumulus');
        },
        success: '공기 덩어리가 주위보다 따뜻해지는 높이보다 위에서는 강제로 올리는 힘이 없어도 저절로 올라가 적운형 구름이 발달해요.'
      }
    ]);
  }


  /* ───────── 그리기 ───────── */
  function xRange() {
    const vals = [];
    const add = (o) => {
      const P = Physics.makeProfile(o.T0, o.gamma, o.inv && o.inv.on ? o.inv : null);
      for (let z = 0; z <= ZMAX + 1e-9; z += 0.25) { vals.push(Physics.envTemp(P, z), Physics.parcel(o.T0, o.Td0, z).T); }
      vals.push(o.Td0);
    };
    add(st);
    if (st.cmp) add(st.cmp);
    return niceRange(Math.min(...vals), Math.max(...vals), 30);
  }
  function layout() { const f = layoutShell(sh); if (!f) return; rebuildAll(); }
  function rebuildAll() { if (!sh.frame) { render(); return; } buildScene(sh.frame); buildGraph(sh.frame); render(); }

  function buildScene(f) {
    const svg = sh.sceneSvg; clear(svg);
    const W = f.sceneW, y0 = f.yOf(0);
    s('rect', { x: 0, y: 0, width: W, height: y0, fill: skyGradient(svg, 'ssky') }, svg);
    if (st.inv.on) {
      const yb = f.yOf(st.inv.base), yt = f.yOf(Math.min(ZMAX, st.inv.base + st.inv.depth));
      s('rect', { x: 0, y: yt, width: W, height: yb - yt, fill: '#F2E2CF', opacity: 0.75 }, svg);
      txt({ x: 10, y: (yt + yb) / 2 + 5, class: 'lb-sm halo-sky', fill: '#8A5A2B' }, `역전층 (+${fT(st.inv.dT)} ℃)`, svg);
    }
    E.typ = s('g', { class: 'cloud-sh' }, svg); E.typKey = null;        // 구름 (글자 · 선보다 아래에 그림, 옅은 하늘에서도 보이게 그림자)
    const P = prof();
    for (let z = 0; z <= ZMAX; z++) {
      if (z > 0) s('line', { x1: 0, x2: W, y1: f.yOf(z), y2: f.yOf(z), stroke: '#fff', 'stroke-width': 1.5, opacity: 0.8 }, svg);
      txt({ x: 10, y: f.yOf(z) - 6, class: 'lb-sm tnum halo-sky', fill: '#485563' }, `주위 ${fT(Physics.envTemp(P, z))} ℃`, svg);
    }
    s('rect', { x: 0, y: y0, width: W, height: f.H - y0, fill: '#B9C6AE' }, svg);
    txt({ x: 12, y: y0 + 24, class: 'lb-sm', fill: '#3D4A3A' }, '지표 (0 km)', svg);
    E.typT = txt({ 'text-anchor': 'end', class: 'lb-sm halo-sky', fill: '#4E5D6A' }, '', svg);
    E.sLCL = s('line', { x1: 0, x2: W, stroke: 'var(--lcl)', 'stroke-width': 2.5, 'stroke-dasharray': '12 5 3 5' }, svg);
    E.sLCLt = txt({ class: 'lb-sm halo-sky', fill: '#7A4E10', 'text-anchor': 'end' }, '', svg);
    E.sLFC = s('g', null, svg);
    E.cmpTrail = s('line', { stroke: '#C65040', 'stroke-width': 6, opacity: 0.18, 'stroke-linecap': 'round' }, svg);
    E.trail = s('line', { stroke: '#4E5D6A', 'stroke-width': 2, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round', opacity: 0.85 }, svg);
    E.marks = s('g', null, svg); E.marksKey = null; E.markEls = [];   // 지나온 높이(1 km마다)의 공기 덩어리 기온
    E.sNow = s('line', { 'data-role': 'now', x1: 0, x2: W, stroke: 'var(--ink)', 'stroke-width': 1.2, opacity: 0.45 }, svg);
    E.buoy = s('g', null, svg);      // 부력 (힘)
    E.buoyP = s('path', { fill: '#1E6E64' }, E.buoy);
    E.buoyT = txt({ class: 'lb-sm halo-sky', fill: '#1E6E64' }, '부력', E.buoy);
    E.parcel = makeParcel(svg, { seed: 11, drag: true });
    E.envLbls = [...svg.querySelectorAll('text')].filter(t => t.textContent.startsWith('주위 '));
    E.px = W * 0.38;
    sa(E.parcel.g, { tabindex: 0, role: 'slider', 'aria-label': '공기 덩어리 높이 (끌거나 위·아래 화살표 키로 올리고 내리기)', 'aria-valuemin': 0, 'aria-valuemax': ZMAX });
    const pg = E.parcel.g;
    let pid = null;
    pg.addEventListener('pointerdown', ev => { pid = ev.pointerId; try { pg.setPointerCapture(pid); } catch (e) { /* 무시 */ } ev.preventDefault(); dragBegin(); });
    pg.addEventListener('pointermove', ev => { if (pid !== ev.pointerId || !st.drag) return; dragTo(sh.frame.hOf(svgPoint(svg, ev).y)); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => pg.addEventListener(t, ev => { if (pid === ev.pointerId) { pid = null; dragEnd(); } }));
    pg.addEventListener('keydown', e => {
      const k = { ArrowUp: 0.05, ArrowDown: -0.05, PageUp: 0.5, PageDown: -0.5 }[e.key];
      if (k == null) return;
      e.preventDefault();
      if (!st.drag) dragBegin();
      dragTo(cur().z + k);
    });
    pg.addEventListener('keyup', e => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) dragEnd(); });
    pg.addEventListener('blur', () => dragEnd());
  }
  function buildGraph(f) {
    const svg = sh.graphSvg; clear(svg);
    const xr = xRange();
    const g = s('g', null, svg);
    ax = drawAxes(g, f, xr);
    const p = ax.plot, o = ax.over;
    E.shade = s('g', null, ax.bg);
    E.ref = s('g', null, ax.bg);
    E.cmpG = s('g', { opacity: 0.35 }, p);
    E.gLCL = s('line', { x1: ax.X0, x2: ax.X1, stroke: 'var(--lcl)', 'stroke-width': 2, 'stroke-dasharray': '12 5 3 5' }, p);
    E.gLCLt = txt({ x: ax.X0 + 8, class: 'lb-sm halo', fill: '#7A4E10' }, '', o);
    E.gCross = s('g', null, o);
    E.env = s('path', { fill: 'none', stroke: 'var(--env)', 'stroke-width': 3.5, 'stroke-linejoin': 'round' }, p);
    E.envT = txt({ class: 'lb halo', fill: 'var(--env)' }, '주위 기온', o);
    E.ghost = s('path', { fill: 'none', stroke: 'var(--temp)', 'stroke-width': 2.2, 'stroke-dasharray': '1 6', 'stroke-linecap': 'round', opacity: 0.55 }, p);
    E.Tp = s('path', { fill: 'none', stroke: 'var(--temp)', 'stroke-width': 4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, p);
    E.TpT = txt({ class: 'lb halo', fill: 'var(--temp)', 'text-anchor': 'end' }, '공기 덩어리', o);
    E.gNow = s('line', { 'data-role': 'now', x1: ax.X0, x2: ax.X1, stroke: 'var(--ink)', 'stroke-width': 1.2, opacity: 0.45 }, p);
    E.pts = PointPair(p, { dShape: 'square' });
    E.cmpPt = s('rect', { width: 10, height: 10, fill: '#fff', stroke: 'var(--env)', 'stroke-width': 2, opacity: 0.55 }, p);
    E.lblP = txt({ class: 'lb halo', fill: 'var(--temp)' }, '', o);
    E.lblE = txt({ class: 'lb halo', fill: 'var(--env)' }, '', o);
    E.edge = s('g', null, o);
    // 참고용 단열선
    const Hn = H(), tH = st.T0 - 10 * Hn;
    s('path', { d: pathD([[st.T0, 0], [st.T0 - 10 * ZMAX, ZMAX]], ax, f), stroke: '#C9C3B6', 'stroke-width': 1.5, 'stroke-dasharray': '4 5', fill: 'none' }, E.ref);
    if (Hn < ZMAX) s('path', { d: pathD([[tH, Hn], [tH - 5 * (ZMAX - Hn), ZMAX]], ax, f), stroke: '#B8C6D3', 'stroke-width': 1.5, 'stroke-dasharray': '4 5', fill: 'none' }, E.ref);
    const lz = Math.min(ZMAX - 0.4, Hn + 1.8);
    const refL = [];
    if (Hn < ZMAX - 1) refL.push(txt({ x: ax.gx(st.T0 - 10 * lz) - 8, y: f.yOf(lz), 'text-anchor': 'end', class: 'lb-sm halo', fill: '#9C968A' }, '건조 단열선', o));
    if (Hn < ZMAX - 0.8) { const mz = Math.min(ZMAX - 0.2, Hn + 2.6); refL.push(txt({ x: ax.gx(tH - 5 * (mz - Hn)) + 8, y: f.yOf(mz), class: 'lb-sm halo', fill: '#8EA0B0' }, '습윤 단열선', o)); }
    untangle(svg, refL, ax);   // 좁은 화면: 축 밖으로 나가거나 눈금 글자와 겹치지 않게
    // 고정 그림(주위 기온선)
    const P = prof();
    const ep = [];
    for (let z = 0; z <= ZMAX + 1e-9; z += 0.05) ep.push([Physics.envTemp(P, z), z]);
    if (P.inv) { ep.push([Physics.envTemp(P, P.inv.base), P.inv.base], [Physics.envTemp(P, P.inv.base + P.inv.depth), P.inv.base + P.inv.depth]); ep.sort((a, b) => a[1] - b[1]); }
    sa(E.env, { d: pathD(ep, ax, f) });
    const ez = ZMAX - 0.35;
    sa(E.envT, { x: ax.gx(Physics.envTemp(P, ez)) + 10, y: f.yOf(ez) });
    // 판정 영역 칠하기 (예상 경로 보기)
    clear(E.shade);
    const N = 240;
    let seg = [], sign = 0;
    const flush = () => {
      if (seg.length > 1) s('path', { d: pathD(seg.map(q => [q[1], q[0]]).concat(seg.slice().reverse().map(q => [q[2], q[0]])), ax, f) + ' Z', fill: sign > 0 ? '#F3D0C8' : '#DCE2E8', opacity: 0.75 }, E.shade);
      seg = [];
    };
    for (let i = 0; i <= N; i++) {
      const z = ZMAX * i / N, pt = Physics.parcel(st.T0, st.Td0, z).T, et = Physics.envTemp(P, z);
      const sg = pt - et > 1e-9 ? 1 : (pt - et < -1e-9 ? -1 : 0);
      if (sg !== 0 && sg !== sign && seg.length) { seg.push([z, pt, et]); flush(); }
      if (sg !== 0) sign = sg;
      seg.push([z, pt, et]);
    }
    flush();
    // 비교: 저장된 주위 기온·공기 덩어리 경로
    clear(E.cmpG);
    if (st.cmp) {
      const c = st.cmp, Pc = Physics.makeProfile(c.T0, c.gamma, c.inv.on ? c.inv : null);
      const ce = [], cp = [];
      for (let z = 0; z <= ZMAX + 1e-9; z += 0.05) { ce.push([Physics.envTemp(Pc, z), z]); cp.push([Physics.parcel(c.T0, c.Td0, z).T, z]); }
      s('path', { d: pathD(ce, ax, f), fill: 'none', stroke: 'var(--env)', 'stroke-width': 3, 'stroke-dasharray': '10 4' }, E.cmpG);
      if (c.T0 !== st.T0 || c.Td0 !== st.Td0) s('path', { d: pathD(cp, ax, f), fill: 'none', stroke: 'var(--temp)', 'stroke-width': 2.5 }, E.cmpG);
    }
  }
  function renderLegend() {
    ui.legend.innerHTML = legendHTML('var(--temp)', '', '공기 덩어리') + legendHTML('var(--env)', '', '주위 기온') +
      (st.cmp ? legendHTML('var(--env)', 'dash faint', '비교(옅은 선)') : '');
  }

  function cloudType() {
    const r = st.run;
    if (r.firstCum >= 0 && st.idx >= r.firstCum) return 'cumulus';
    if (r.firstStrat >= 0 && st.idx >= r.firstStrat) return 'stratus';
    return null;
  }
  function render() {
    renderControls();
    if (!sh || !sh.frame || !ax || !st.run) return;
    const f = sh.frame, P = prof(), Hn = H();
    const fr = cur();
    const z = fr.z, yz = f.yOf(z);
    const par = Physics.parcel(st.T0, st.Td0, z);
    const env = Physics.envTemp(P, z);
    const b = par.T - env;
    const iv = Physics.buoyancyIntervals(st.T0, st.Td0, P, ZMAX);
    const showAll = st.showPath;
    const r = st.run;
    let zMinH = 0, zMaxH = 0;
    for (let i = 0; i <= st.idx; i++) { const zz = r.frames[i].z; if (zz > zMaxH) zMaxH = zz; }

    /* 장면 */
    const yH = f.yOf(Math.min(Hn, ZMAX));
    sa(E.sLCL, { y1: yH, y2: yH, opacity: Hn <= ZMAX ? 1 : 0 });
    sa(E.sLCLt, { x: f.sceneW - 80 }); E.sLCLt.textContent = `상승 응결 고도 ${fZ(Hn)} km`;
    clear(E.sLFC);
    if (showAll) iv.warm.forEach(([a, c]) => {
      if (a > 1e-6 && a < ZMAX) { s('line', { x1: 0, x2: f.sceneW, y1: f.yOf(a), y2: f.yOf(a), stroke: 'var(--lfc)', 'stroke-width': 2.2, 'stroke-dasharray': '3 4 10 4' }, E.sLFC); }
      if (c < ZMAX - 1e-6) { s('line', { x1: 0, x2: f.sceneW, y1: f.yOf(c), y2: f.yOf(c), stroke: 'var(--lfc)', 'stroke-width': 1.5, 'stroke-dasharray': '2 4', opacity: 0.8 }, E.sLFC); }
    });
    // 구름 (정성적 표현, 기록으로 결정): 응결 고도에 닿아 포화되면 얇은 층운형,
    // 응결 고도 위에서 저절로 올라가면 공기 덩어리를 따라 위로 자라는 적운형 (강제로 올려 층운형이 먼저 생겼으면 그 위로 발달)
    const typ = cloudType();
    let topZ = Hn;
    if (typ === 'cumulus') { let mz = Hn; for (let i = r.firstCum; i <= st.idx; i++) mz = Math.max(mz, r.frames[i].z); topZ = clamp(Math.round(mz * 20) / 20, Hn + 0.4, ZMAX); }
    const layer = typ === 'stratus' || (typ === 'cumulus' && r.stratForced);
    const yTop = f.yOf(Math.min(topZ, ZMAX - 0.05));
    const tk = typ ? `${typ}|${layer}|${Hn.toFixed(3)}|${topZ.toFixed(2)}` : '';
    if (tk !== E.typKey) {
      E.typKey = tk; clear(E.typ);
      if (layer) layerCloud(E.typ, f.sceneW * 0.16, f.sceneW * 0.92, yH + 2, 18, 4, typ === 'cumulus' ? 0.8 : 0.92);
      if (typ === 'cumulus') puffCloud(E.typ, E.px, yH + 2, yTop + 6, Math.max(38, f.sceneW * 0.14), 6, 0.94);
    }
    sa(E.typT, { x: f.sceneW - 8, y: typ === 'cumulus' ? Math.max(yTop + 6, (yTop + yH) / 2) : yH - 28, opacity: typ ? 1 : 0 });
    E.typT.textContent = typ === 'cumulus' ? (layer ? '층운형 → 적운형' : '적운형 구름') : '층운형 구름';
    // 지나온 경로 · 공기 덩어리 · 화살표
    sa(E.trail, { x1: E.px + 0, x2: E.px, y1: f.yOf(zMinH), y2: f.yOf(zMaxH), opacity: zMaxH > 0.01 ? 0.85 : 0 });
    // 지나온 높이(1 km마다)의 공기 덩어리 기온: 왼쪽 주위 기온과 같은 줄에서 비교 (교과서 그림처럼)
    const kMax = Math.min(ZMAX, Math.floor(zMaxH + 1e-9));
    const mk = `${zMaxH > 0.01 ? kMax : -1}|${st.T0}|${st.Td0}`;
    if (E.marksKey !== mk) {
      E.marksKey = mk; clear(E.marks); E.markEls = [];
      if (zMaxH > 0.01) for (let k = 0; k <= kMax; k++) {
        const y = f.yOf(k), g = s('g', null, E.marks);
        s('circle', { cx: E.px, cy: y, r: 4, fill: 'var(--temp)', stroke: '#fff', 'stroke-width': 1.5 }, g);
        const t = txt({ x: E.px + 10, y: y - 6, class: 'lb-sm tnum halo-sky', fill: '#A2392B' }, `공기 ${fT(Physics.parcel(st.T0, st.Td0, k).T)} ℃`, g);
        E.markEls.push({ g, t, y });
      }
    }
    if (st.cmp) { const zs = st.cmp.zs; sa(E.cmpTrail, { x1: E.px - 30, x2: E.px - 30, y1: f.yOf(Math.min(...zs)), y2: f.yOf(Math.max(...zs)), opacity: Math.max(...zs) > 0.01 ? 0.2 : 0 }); }
    else sa(E.cmpTrail, { opacity: 0 });
    const rad = 16 + 2.6 * z;
    E.markEls.forEach(m => sa(m.g, { opacity: Math.abs(m.y - yz) < rad + 10 ? 0 : 1 }));
    E.parcel.set(E.px, yz, rad, par.saturated && z > Hn + 1e-9 ? clamp((z - Hn) / 1.5, 0.3, 1) : 0);
    sa(E.parcel.g, { 'aria-label': `공기 덩어리: 높이 ${fZ(z)} km, 기온 ${fT(par.T)} ℃, 주위 ${fT(env)} ℃ (끌거나 위·아래 화살표 키로 올리고 내리기)` });
    sa(E.sNow, { y1: yz, y2: yz });
    sa(E.parcel.g, { 'aria-valuenow': z.toFixed(2) });
    const bl = Math.abs(b) < 0.05 ? 0 : clamp(10 + Math.abs(b) * 4, 14, 60);
    if (bl > 0) {
      const dir = b > 0 ? -1 : 1, x = E.px + rad + 22, y1 = yz, y2 = yz + dir * bl;
      sa(E.buoyP, { d: `M${x - 4} ${y1} L${x + 4} ${y1} L${x + 4} ${y2 - dir * 10} L${x + 10} ${y2 - dir * 10} L${x} ${y2} L${x - 10} ${y2 - dir * 10} L${x - 4} ${y2 - dir * 10} Z` });
      sa(E.buoyT, { x: x + 14, y: (y1 + y2) / 2 + 5 }); E.buoyT.textContent = b > 0 ? '부력 ↑' : '부력 ↓';
      sa(E.buoy, { opacity: 1 });
    } else sa(E.buoy, { opacity: 0 });
    // 좁은 화면 겹침 정리: 공기 덩어리·화살표 둘레의 글자는 비켜 두거나 잠시 숨김 (같은 값은 현재 수치·그래프에 있음)
    const near = [{ x: E.px - rad - 9, y: yz - rad - 9, width: 2 * rad + 18, height: 2 * rad + 18 }];
    if (shown(E.buoy)) { const bb = bbox(E.buoy); if (bb) near.push(bb); }
    E.envLbls.forEach(t => { const bb = bbox(t); sa(t, { opacity: bb && near.some(n => overlap(bb, n)) ? 0 : 1 }); });
    // 공기 덩어리 기온 글자와 이어 읽히지 않게 좌우로 여유를 두고 피함
    const markBoxes = E.markEls.filter(m => shown(m.g)).map(m => bbox(m.t)).filter(Boolean).map(bb => ({ x: bb.x - 14, y: bb.y + 3, width: bb.width + 28, height: bb.height - 6 }));
    if (typ) { const ty = +E.typT.getAttribute('y'); dodge(E.typT, typ === 'cumulus' ? [ty, ty - 18, ty + 18] : [ty, ty - 18, yH + 44, yH + 62], near.concat(markBoxes)); }
    if (Hn <= ZMAX) dodge(E.sLCLt, [yH - 7, yH + 18, yH + 32], (shown(E.typT) ? near.concat([bbox(E.typT)]) : near).concat(markBoxes, E.envLbls.filter(shown).map(bbox)));
    else sa(E.sLCLt, { opacity: 0 });

    /* 그래프 */
    sa(E.gLCL, { y1: yH, y2: yH, opacity: Hn <= ZMAX ? 1 : 0 });
    sa(E.gLCLt, { y: yH - 7 }); E.gLCLt.textContent = `상승 응결 고도 ${fZ(Hn)} km`;
    clear(E.gCross);
    sa(E.shade, { opacity: showAll ? 1 : 0 });
    {                                                   // 공기 덩어리가 주위보다 따뜻해지는 높이: 늘 표시 (조건부 불안정 · 역전층)
      iv.warm.forEach(([a, c], i) => {
        if (a > 1e-6 && a < ZMAX) {
          s('line', { x1: ax.X0, x2: ax.X1, y1: f.yOf(a), y2: f.yOf(a), stroke: 'var(--lfc)', 'stroke-width': 2.2, 'stroke-dasharray': '3 4 10 4' }, E.gCross);
          const near = Math.abs(f.yOf(a) - yH) < 18;
          txt({ x: ax.X1 - 6, y: f.yOf(a) + (near ? 18 : -7), 'text-anchor': 'end', class: 'lb-sm halo', fill: 'var(--lfc)' }, `${i === 0 ? '주위보다 따뜻해지는 높이' : '다시 따뜻해짐'} ${fApprox(a)} km`, E.gCross);
        }
        if (c < ZMAX - 1e-6) {
          s('line', { x1: ax.X0, x2: ax.X1, y1: f.yOf(c), y2: f.yOf(c), stroke: 'var(--lfc)', 'stroke-width': 1.5, 'stroke-dasharray': '2 4', opacity: 0.8 }, E.gCross);
          txt({ x: ax.X1 - 6, y: f.yOf(c) - 7, 'text-anchor': 'end', class: 'lb-sm halo', fill: 'var(--lfc)' }, `주위와 같아짐 ${fApprox(c)} km`, E.gCross);
        }
      });

    }
    const tH = st.T0 - 10 * Hn;
    const full = Hn < ZMAX ? [[st.T0, 0], [tH, Hn], [tH - 5 * (ZMAX - Hn), ZMAX]] : [[st.T0, 0], [st.T0 - 10 * ZMAX, ZMAX]];
    sa(E.ghost, { d: showAll ? pathD(full, ax, f) : '' });
    const hm = zMaxH;
    const tp = hm > Hn ? [[st.T0, 0], [tH, Hn], [Physics.parcel(st.T0, st.Td0, hm).T, hm]] : [[st.T0, 0], [Physics.parcel(st.T0, st.Td0, hm).T, hm]];
    sa(E.Tp, { d: hm > 0.005 ? pathD(tp, ax, f) : '' });
    const nz = Math.min(0.35, hm);
    sa(E.TpT, { x: ax.gx(Physics.parcel(st.T0, st.Td0, nz).T) - 10, y: f.yOf(nz) + 4, opacity: hm > 0.6 && Math.abs(z - nz) > 0.4 ? 1 : 0 });
    sa(E.gNow, { y1: yz, y2: yz });
    const xP = ax.gx(par.T), xE = ax.gx(env);
    const same = Math.abs(b) < 1e-9;
    E.pts.set(xP, xE, yz, false);
    const [sP, sE] = fPair(par.T, env);
    const left = xP < xE;
    const ly = clamp(yz - 12, ax.Y1 + 14, ax.Y0 - 8);
    sa(E.lblP, { x: xP + (left ? -12 : 12), y: ly, 'text-anchor': left ? 'end' : 'start' }); E.lblP.textContent = `${sP} ℃`;
    sa(E.lblE, { x: xE + (left ? 12 : -12), y: ly, 'text-anchor': left ? 'start' : 'end' }); E.lblE.textContent = `${sE} ℃`;
    if (st.cmp) {
      const c = st.cmp, Pc = Physics.makeProfile(c.T0, c.gamma, c.inv.on ? c.inv : null);
      sa(E.cmpPt, { x: ax.gx(Physics.envTemp(Pc, z)) - 5, y: yz - 5, opacity: 0.6 });
    } else sa(E.cmpPt, { opacity: 0 });
    clear(E.edge);
    edgeMarker(E.edge, ax, f, par.T, z, 'var(--temp)');
    edgeMarker(E.edge, ax, f, env, z, 'var(--env)');
    untangle(sh.graphSvg, [...E.gCross.querySelectorAll('text'), E.lblP, E.lblE], ax);   // 「주위보다 따뜻해지는 높이」 · 값 글자가 다른 글자와 겹치지 않게

    /* 수치 */
    ui.ro.set('z', `${fZ(z)}<small>km</small>`, `응결 고도 ${fZ(Hn)} km`);
    let cmpSub = '';
    if (st.cmp) { const c = st.cmp, Pc = Physics.makeProfile(c.T0, c.gamma, c.inv.on ? c.inv : null); cmpSub = `비교 ${fT(Physics.envTemp(Pc, z))} ℃`; }
    const tiny = Math.abs(b) < 0.05;
    ui.ro.set('Tp', `${sP}<small>℃</small>`, tiny ? '주위와 같다' : (b < 0 ? '주위보다 낮다 ↓' : '주위보다 높다 ↑'));
    ui.ro.set('Te', `${sE}<small>℃</small>`, cmpSub || `감률 ${fmt(Physics.envLapse(P, z), 1)} ℃/km`);
    const ct = cloudType();
    ui.ro.set('cloud', `<span style="font-size:21px">${ct === 'cumulus' ? '적운형' : (ct === 'stratus' ? '층운형' : '없음')}</span>`,
      ct === 'cumulus' ? (r.stratForced ? '층운형 위로 발달' : '위로 두껍게 발달') : (ct === 'stratus' ? '얇게 옆으로 퍼짐' : (par.saturated ? '포화' : '응결 고도 아래')));
    void same;
    renderGuide(fr, b, par, iv);
    renderBadge(iv);
    if (ch) ch.check();
  }
  const overlap = (a, b) => !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
  const shown = el => el && el.getAttribute('opacity') !== '0';
  const bbox = el => { try { const b = el.getBBox(); return b.width ? b : null; } catch (e) { return null; } };
  /** 글자를 후보 높이 중 겹치지 않는 곳에 두고, 자리가 없으면 잠시 숨김 */
  function dodge(el, ys, avoid) {
    for (const y of ys) {
      sa(el, { y });
      const bb = bbox(el);
      if (!bb || !avoid.some(b => b && overlap(bb, b))) { sa(el, { opacity: 1 }); return; }
    }
    sa(el, { y: ys[0], opacity: 0 });
  }

  function renderGuide(fr, b, par, iv) {
    if (st.notice) { ui.ro.guide('안내', 'neutral', st.notice); return; }
    const vsTxt = `공기 ${fT(par.T)} ℃ · 주위 ${fT(par.T - b)} ℃`;
    let s1, c1, m;
    if ((fr.phase === 'lift' || fr.phase === 'drag') && fr.dir !== 0) {
      s1 = fr.dir > 0 ? '올리는 중' : '내리는 중'; c1 = 'neutral';
      m = fr.dir > 0 && par.saturated
        ? '공기 덩어리를 올리는 중이에요. 상승 응결 고도에 닿아 <b>포화</b>되어 구름이 생겼어요.'
        : `공기 덩어리를 ${fr.dir > 0 ? '올리는' : '내리는'} 중이에요. 그동안에도 부력은 계속 작용해요.`;
    } else if (fr.phase === 'hold' || fr.phase === 'drag') {
      s1 = st.paused ? '일시정지' : '붙잡아 둔 상태'; c1 = 'neutral';
      m = (fr.note === 'top' ? `표시 범위(${ZMAX} km)에 붙잡아 뒀어요. ` : '붙잡아 둔 상태예요. ') + `${vsTxt}.` + (par.saturated ? ' 포화되어 구름이 생겼어요.' : '') + ' 놓으면 어떻게 될까요?';
    } else if (fr.note === 'top') { s1 = '표시 상한'; c1 = 'neutral'; m = `표시 범위에 도달했어요. 공기 덩어리는 여전히 주위보다 ${b > 0 ? '따뜻해 더 올라가려 해요' : '차가워요'}. (안정해져 멈춘 것이 아니에요)`; }
    else if (Math.abs(fr.v) < 0.01) {
      s1 = '정지'; c1 = 'neutral';
      if (fr.note === 'ground' || fr.z < 1e-6) m = st.run.frames.length > 1 ? ('지표로 돌아와 멈췄어요.' + (cloudType() === 'stratus' ? ' 연직 운동이 억제되어 구름은 <b>얇은 층운형</b>으로 남아요.' : '')) : '<b>꾹 눌러 올리기</b>로 공기 덩어리를 올려 보세요. 같은 높이에서 공기 덩어리와 주위 기온을 비교해요.';
      else if (Math.abs(b) < 0.05) m = `주위와 기온이 같은 높이(${fZ(fr.z)} km)에서 멈췄어요.`;
      else m = b > 0 ? '주위보다 따뜻해 곧 올라가기 시작해요.' : '주위보다 차가워 곧 내려가기 시작해요.';
    } else if (fr.v > 0) {
      s1 = '상승'; c1 = 'up';
      m = b > 0
        ? (par.saturated ? '주위보다 따뜻해 <b>저절로 올라가요</b>. 응결 고도 위에서도 계속 올라가 구름이 위로 <b>두껍게</b> 발달해요(적운형).' : '주위보다 따뜻해 위로 부력을 받아 <b>올라가요</b>.')
        : '주위보다 차가워 아래로 힘을 받아 <b>상승이 느려져요</b>.';
    } else {
      s1 = '하강'; c1 = 'down';
      m = b < 0 ? '주위보다 차가워 <b>내려가요</b>.' : '주위보다 따뜻해 위로 힘을 받아 <b>하강이 느려져요</b>.';
    }
    ui.ro.guide(s1, c1, m);
  }
  function renderBadge(iv) {
    const c = Physics.stabilityClass(st.gamma);
    const g = fmt(st.gamma, 1);
    const T = {
      'absolute-stable': `절대 안정 (γ = ${g} < 5)`,
      'moist-neutral': `경계 γ = 5: 불포화 안정 · 포화 중립`,
      'conditional': `조건부 불안정 (5 < γ = ${g} < 10)`,
      'dry-neutral': `경계 γ = 10: 불포화 중립 · 포화 불안정`,
      'absolute-unstable': `절대 불안정 (γ = ${g} > 10)`
    }[c.key];
    const html = st.inv.on ? `${T.split(' (')[0]} + 역전층` : T;
    if (ui.badge.textContent !== stripTags(html)) ui.badge.innerHTML = html;
    ui.badge.className = 'stab-badge ' + c.key;
    ui.badge.hidden = !st.inv.on && CASE_BTNS.some(x => Math.abs(x.g - st.gamma) < 1e-9);   // 위쪽 버튼으로 이미 보이면 숨김
    ui.preset.set();
    ui.condInfo.textContent = `지표 공기 ${fT(st.T0)} ℃ · 이슬점 ${fT(st.Td0)} ℃ → 상승 응결 고도 ${fZ(H())} km`;
    const P = prof();
    if (st.inv.on) {
      const top = st.inv.base + st.inv.depth;
      const parts = iv.warm.map(([a, b2]) => `${fApprox(a)}~${b2 >= ZMAX - 1e-6 ? ZMAX : fApprox(b2)} km`);
      ui.invInfo.innerHTML = `주위 기온: ${fZ(st.inv.base)} km에서 ${fT(Physics.envTemp(P, st.inv.base))} ℃ → ${fZ(top)} km에서 ${fT(Physics.envTemp(P, top))} ℃ (역전층 감률 ${fmt(-st.inv.dT / st.inv.depth, 1)} ℃/km)<br>공기 덩어리가 주위보다 따뜻한 구간: <b>${parts.length ? parts.join(', ') : '없음'}</b>`;
    } else ui.invInfo.textContent = '역전층을 넣으면 공기 덩어리가 주위보다 따뜻한 구간이 여기에 나타나요.';
  }
  function renderControls() {
    if (!ui.rel || !st.run) return;
    const r = st.run, fr = cur();
    ui.rel.disabled = fr.phase === 'free';          // 이미 자유롭게 움직이는 중에는 놓기 끔
    ui.lift.innerHTML = st.target < fr.z - 1e-9 ? '공기 내리기' : '공기 올리기';
    const hint = fr.phase === 'lift' || fr.phase === 'drag' ? ''
      : fr.phase === 'hold' ? '놓으면 공기 덩어리가 어떻게 움직일까요? 구름은 어떻게 될까요?'
      : (!r.settled ? '' : (r.frames.length <= 1 ? '「꾹 눌러 올리기」를 누르고 있거나 공기 덩어리를 끌어 올려 보세요.' : '다시 하려면 「↺ 처음으로」를 누르세요.'));
    if (ui.relHint.textContent !== hint) ui.relHint.textContent = hint;
  }

  return {
    L, init, layout, tick, render,
    pause() { pause(); },
    onShow() { layout(); },
    hasFrame: () => !!(sh && sh.frame),
    api: { liftTo, release, play, step, seek, resetMotion, resetDefaults, setCond, saveCompare, st, H, cur: () => cur() }
  };
})();
