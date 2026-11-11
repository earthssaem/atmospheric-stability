/**
 * tab-stability.js — 3. 대기 안정도
 * 같은 높이에서 공기 덩어리 기온과 주위 기온을 비교해 운동을 예상한다.
 * 운동은 physics.motionStep(교육용 정성 모형)으로 고정 시간 간격마다 계산하고, 모든 순간을 기록해
 * 되감기·단계 이동 때 그 순간의 그림·수치·그래프를 그대로 복원한다.
 */
'use strict';

const StabLab = (function () {
  const ZMAX = 6;
  const DT = 1 / 120;          // 계산 간격 (초)
  const LIFT = 0.6;            // 강제로 옮기는 속도 (화면 표현용)
  const MAX_FRAMES = 4800;
  const DEF = { T0: 30, Td0: 14, gamma: 8 };
  const PRESETS = [{ g: 4, label: '4 절대 안정' }, { g: 8, label: '8 조건부 불안정' }, { g: 12, label: '12 절대 불안정' }];
  const INV_EX = { base: 1.5, depth: 0.5, dT: 4 };
  const L = Object.assign(baseLab(), { id: 'stab' });
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
   * frame: {z, v, a, b, phase: 'free' | 'lift' | 'hold', note: null | 'ground' | 'top' | 'rest'} */
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
    if (r.firstStrat < 0 && fr.z > Hn + 0.02) r.firstStrat = i;
    if (r.firstCum < 0 && fr.phase === 'free' && fr.z > Hn + 0.3 && fr.v > 0.05 && fr.b > 0) r.firstCum = i;
    st.idx = i;
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
      fr = { z, v: phase === 'lift' ? dir * LIFT : 0, a: 0, b, phase, note };
      if (phase === 'hold') { L.emit('lift', { z, sat: z >= H() - 1e-9, key: condKey(), cls: Physics.stabilityClass(st.gamma).key, inv: st.inv.on }); }
    } else if (f0.phase === 'hold') {
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
  function liftTo(z) {
    z = clamp(z, 0, ZMAX);
    truncateToIdx();
    const r = st.run, f0 = cur();
    if (Math.abs(f0.z - z) < 1e-9) { st.notice = '이미 그 높이에 있어요.'; render(); return; }
    r.liftTarget = z; r.settled = false; r.rest = 0; r.pend = null;
    push({ z: f0.z, v: 0, a: 0, b: f0.b, phase: 'lift', note: null });
    st.paused = false; st.notice = '';
    render();
  }
  function release() {
    truncateToIdx();
    const r = st.run, f0 = cur();
    if (f0.phase === 'free') return;
    r.settled = false; r.rest = 0;
    r.pend = { z0: f0.z, key: condKey(), cls: Physics.stabilityClass(st.gamma).key, inv: st.inv.on };
    L.emit('release', { z: f0.z, b: f0.b, key: condKey() });
    push({ z: f0.z, v: f0.phase === 'lift' ? f0.v : 0, a: 0, b: f0.b, phase: 'free', note: null });
    st.paused = false; st.notice = '';
    render();
  }
  function holdStart() { st.holdBtn = true; liftTo(ZMAX); }
  function holdEnd() { if (!st.holdBtn) return; st.holdBtn = false; if (cur().phase === 'lift') release(); }
  function play() {
    if (!st.paused && moving()) { st.paused = true; render(); return; }
    if (st.paused) { st.paused = false; render(); return; }
    if (cur().phase === 'hold') { release(); return; }      // 붙잡고 있으면 다음 할 일은 놓아주기
    liftTo(st.target);                                       // 멈춰 있으면 목표 높이까지 올리기
  }
  function moving() { const r = st.run; return st.idx < r.frames.length - 1 || !r.settled && cur().phase !== 'hold'; }
  function pause() { if (st.holdBtn) holdEnd(); if (!st.paused) { st.paused = true; render(); } }
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
    ui.T0.set(DEF.T0); ui.Td0.setMax(DEF.T0); ui.Td0.set(DEF.Td0); ui.g.set(DEF.gamma); ui.tz.set(2); ui.tPath.set(false);
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
    ui.T0 = NumField({ label: '지표 기온 T<sub>0</sub>', min: 10, max: 40, step: 0.1, sliderStep: 0.5, decimals: 1, value: st.T0, unit: '℃', cls: 'tight', onCommit: v => setCond({ T0: v }) });
    ui.Td0 = NumField({ label: '지표 이슬점 Td<sub>0</sub>', min: 0, max: st.T0, step: 0.1, sliderStep: 0.5, decimals: 1, value: st.Td0, unit: '℃', cls: 'tight', onCommit: v => setCond({ Td0: v }) });
    ui.g = NumField({ label: '주위 기온 감률 γ', min: 2, max: 14, step: 0.1, sliderStep: 0.5, decimals: 1, value: st.gamma, unit: '℃/km', cls: 'tight', onCommit: v => setCond({ gamma: v }) });
    ui.T0.range.style.setProperty('--c', 'var(--temp)');
    ui.Td0.range.style.setProperty('--c', 'var(--dew)');
    ui.g.range.style.setProperty('--c', 'var(--env)');
    // 대표 감률 4 · 8 · 12 (지표 공기는 그대로 두고 주위 대기만 바꿈)
    ui.preset = (function () {
      const el = h('span', { class: 'presets', role: 'group', 'aria-label': '대표 감률 (같은 공기, 다른 대기)' });
      const btns = PRESETS.map(p => { const bt = Btn(String(p.g), 'sm', () => setCond({ gamma: p.g }), { title: `γ = ${p.g} ℃/km · ${p.label.replace(/^\d+ /, '')}`, 'aria-label': `감률 ${p.g} ℃/km ${p.label.replace(/^\d+ /, '')}` }); el.appendChild(bt); return bt; });
      return { el, set(v) { btns.forEach((bt, i) => { const on = v != null && Math.abs(PRESETS[i].g - v) < 1e-9; bt.classList.toggle('on', on); bt.setAttribute('aria-pressed', on ? 'true' : 'false'); }); } };
    })();
    ui.preset.set(st.gamma);
    ui.g.el.appendChild(ui.preset.el);
    const tail = h('div', { class: 'cond-tail' });
    ui.cmp = CompareUI(tail, saveCompare, () => { st.cmp = null; afterCompareChange(); });
    sh.cond.append(h('div', { class: 'cond-group' }, ui.T0.el, ui.Td0.el, ui.g.el), tail);

    ui.badge = h('span', { class: 'stab-badge' });
    sh.sceneHead.append(ui.badge);
    ui.tPath = Toggle('예상 경로와 판정 보기', st.showPath, v => { st.showPath = v; render(); });
    ui.legend = h('span', { class: 'legend' });
    sh.graphLegend.append(ui.legend);
    sh.graphHead.insertBefore(ui.tPath.el, sh.graphLegend);

    ui.ro = Readouts(sh.ro, [
      { key: 'z', label: '높이' },
      { key: 'Tp', label: '<i style="border-color:var(--temp)"></i>공기 덩어리 기온', cls: 'temp' },
      { key: 'Te', label: '<i style="border-color:var(--env)"></i>주위 기온', cls: 'env' },
      { key: 'd', label: '차이 (공기 − 주위)' },
      { key: 'm', label: '운동' }
    ]);
    ui.ctrl = ControlBar(sh.ctrl, { play, prev: () => step(-1), next: () => step(1), reset: resetMotion, defaults: resetDefaults });
    ui.ctrl.prev.innerHTML = '◀ 이전 단계'; ui.ctrl.next.innerHTML = '다음 단계 ▶';
    ui.ctrl.prev.title = ui.ctrl.next.title = '기록에서 출발 · 놓은 순간 · 방향이 바뀐 순간 · 멈춘 순간으로 이동';
    ui.tz = NumField({ label: '목표 높이', min: 0, max: ZMAX, step: 0.01, decimals: 2, value: st.target, unit: 'km', cls: 'compact', onCommit: v => { st.target = v; render(); } });
    ui.lift = Btn('공기 올리기', 'accent', () => liftTo(st.target));
    ui.rel = Btn('놓아주기', 'accent', release);
    ui.hold = Btn('누르는 동안 밀어 올리기', 'sm hold-btn', null, { title: '누르고 있는 동안 위로 밀어 올리고, 떼면 놓아줘요 (Space·Enter도 가능)' });
    holdButton(ui.hold, holdStart, holdEnd);
    ui.tl = h('input', { type: 'range', min: 0, max: 0, step: 1, value: 0, 'aria-label': '기록 되감기' });
    ui.tl.style.setProperty('--c', 'var(--ink)');
    ui.tl.addEventListener('input', () => seek(+ui.tl.value));
    ui.ctrl.slot.append(ui.tz.el, ui.lift, ui.rel, h('div', { class: 'progress' }, h('span', { class: 'lbl', text: '기록' }), ui.tl));
    sh.sceneHead.insertBefore(ui.hold, ui.badge);

    buildMore();
    buildChallenges();
    newRun();
    renderLegend();
    render();
  }

  function buildMore() {
    const m = sh.more;
    ui.guideBox = h('div');
    m.appendChild(Fold('안내 실험 — 같은 공기, 다른 대기', ui.guideBox, true));
    m.appendChild(Fold('대기 안정도와 판정 기준', h('div', { html: `
      <p>공기 덩어리를 강제로 올리거나 내렸을 때 <b>원래 위치로 돌아가려는</b> 상태를 안정, <b>멀어지려는</b> 상태를 불안정이라고 해요. 같은 높이에서 공기 덩어리가 주위보다 차가우면 아래로, 따뜻하면 위로 힘(부력)을 받아요.</p>
      <table class="stage-table"><thead><tr><th>주위 기온 감률 γ</th><th>불포화 공기</th><th>포화 공기</th><th>판정</th></tr></thead><tbody>
      <tr><td>γ &lt; 5</td><td>안정</td><td>안정</td><td>절대 안정</td></tr>
      <tr><td>γ = 5</td><td>안정</td><td>중립</td><td>경계값</td></tr>
      <tr><td>5 &lt; γ &lt; 10</td><td>안정</td><td>불안정</td><td>조건부 불안정</td></tr>
      <tr><td>γ = 10</td><td>중립</td><td>불안정</td><td>경계값</td></tr>
      <tr><td>γ &gt; 10</td><td>불안정</td><td>불안정</td><td>절대 불안정</td></tr></tbody></table>
      <p><b>상승 응결 고도</b>: 기온과 이슬점이 같아지는 높이 (구름 바닥)<br><b>자유 대류 고도</b>: 상승 경로에서 공기 덩어리가 주위보다 <b>따뜻해지기 시작</b>하는 높이 (이 위에서는 놓아도 스스로 올라가요)</p>
      <p class="note">교과서 그림 Ⅲ-14 · Ⅲ-15 · Ⅲ-16 · Ⅲ-17</p>` }), false));
    m.appendChild(Fold('구름 모양과 모형의 가정', h('div', { html: `
      <ul><li><b>안정한 대기</b>에서 넓은 공기층이 강제로 올라가 응결하면 연직 운동이 억제되어 옆으로 퍼진 얇은 <b>층운형 구름</b>이 생기기 쉬워요.</li>
      <li><b>불안정한 대기</b>에서는 응결 뒤에도 상승이 이어져 수직으로 두껍게 발달하는 <b>적운형 구름</b>이 생기기 쉬워요.</li>
      <li><b>조건부 불안정</b>: 응결 뒤에도 주위보다 차가운 구간(층운형)과, 더 올라가 주위보다 따뜻해지는 구간(적운형으로 발달)이 나뉘어요.</li>
      <li>장면 오른쪽의 구름은 지금 대기와 상승 과정에서 나타나는 <b>전형적인 모양을 보여 주는 정성적 표현</b>이에요. 공기 덩어리 하나가 구름 전체를 만든다는 뜻은 아니에요.</li>
      <li>이 탭은 강수가 없는 단순 모형이에요(응결수는 공기 덩어리에 남고, 내려오면 증발). 습윤 단열 감률 5 ℃/km는 교과서 모형 값이에요.</li>
      <li>움직이는 빠르기와 공기 덩어리 크기는 <b>교육용 표현</b>이에요. 기온 차가 클수록 더 세게 밀리고 공기 저항으로 점점 느려지도록 만들었을 뿐, 실제 상승 속도가 아니에요.</li></ul>` }), false));
    // 역전층 탐구 (심화)
    ui.invOn = Toggle('역전층 넣기', st.inv.on, v => { st.inv.on = v; syncInvUI(); conditionsChanged(); });
    ui.invBase = NumField({ label: '역전층 시작 높이', min: 0.2, max: 5, step: 0.1, decimals: 1, value: st.inv.base, unit: 'km', onCommit: v => { st.inv.base = v; if (st.inv.on) conditionsChanged(); } });
    ui.invDepth = NumField({ label: '역전층 두께', min: 0.1, max: 2, step: 0.1, decimals: 1, value: st.inv.depth, unit: 'km', onCommit: v => { st.inv.depth = v; if (st.inv.on) conditionsChanged(); } });
    ui.invDT = NumField({ label: '역전층 안에서 기온 증가', min: 0, max: 10, step: 0.5, decimals: 1, value: st.inv.dT, unit: '℃', onCommit: v => { st.inv.dT = v; if (st.inv.on) conditionsChanged(); } });
    ui.invInfo = h('div', { class: 'note' });
    const ex = Btn('예시 조건 넣기', 'sm accent', () => {
      st.T0 = 30; st.Td0 = 14; st.gamma = 12; st.inv = { on: true, base: 1.5, depth: 0.5, dT: 4 };
      ui.T0.set(30); ui.Td0.setMax(30); ui.Td0.set(14); ui.g.set(12); syncInvUI(); conditionsChanged();
      st.target = 0.5; ui.tz.set(0.5);
      st.notice = '예시: 감률 12 ℃/km 대기의 1.5~2.0 km에 기온이 4 ℃ 높아지는 역전층이 있어요. 0.50 km까지 올렸다 놓아 보세요.'; render();
    });
    ui.invFold = Fold('역전층 탐구 <span class="tag">심화</span>', h('div', null,
      h('p', { html: '기본 실험을 이해한 뒤 사용해요. <b>역전층</b>은 높이 올라갈수록 기온이 <b>높아지는</b> 층으로, 매우 안정해 아래에서 올라오던 공기의 상승을 막아요.' }),
      h('div', { class: 'ch-row' }, ui.invOn.el, ex),
      h('div', { class: 'inv-fields' }, ui.invBase.el, ui.invDepth.el, ui.invDT.el), ui.invInfo,
      h('p', { class: 'note', html: '주위 기온은 역전층 아래·안·위를 끊김 없이 이어서 계산해요. 운동은 그 높이의 주위 기온과 비교해 계산하고, 일정 감률용 자유 대류 고도 공식은 쓰지 않아요. 맑고 바람이 약한 날 새벽의 복사 냉각으로 지표 부근에 역전층이 잘 생기며, 오염 물질이 잘 퍼지지 못해 대기 오염이 심해질 수 있어요. (교과서 95쪽 역전층)' })), false);
    m.appendChild(ui.invFold);
    syncInvUI();
  }
  function syncInvUI() {
    ui.invOn.set(st.inv.on);
    ui.invBase.set(st.inv.base); ui.invDepth.set(st.inv.depth); ui.invDT.set(st.inv.dT);
    [ui.invBase, ui.invDepth, ui.invDT].forEach(f => f.setDisabled(!st.inv.on));
  }

  function buildChallenges() {
    const box = h('div');
    sh.more.appendChild(Fold('도전 활동 <span class="tag">선택</span>', box, false));
    ch = Challenges(box, L, [
      {
        id: 'stratus', title: '안정한 대기에서 강제 상승으로 구름 만들기',
        goal: '<b>절대 안정</b>한 대기(역전층 없이)에서 공기를 상승 응결 고도 위까지 <b>강제로 올린 뒤 놓아</b> 어떻게 움직이는지 확인하세요.',
        hints: ['감률 γ를 습윤 단열 감률(5 ℃/km)과 비교해 보세요.', 'γ < 5이면 포화되어도 공기 덩어리가 주위보다 차가워요. 응결 고도 위로 올려야 구름이 생겨요.', '응결 고도 H = (T₀ − Td₀)/8. 목표 높이를 H보다 높게!'],
        check(lab, since) {
          const ok = (e) => e.cls === 'absolute-stable' && !e.inv;
          const lifts = lab.since(since, 'lift').filter(e => ok(e) && e.sat);
          if (!lifts.length) return false;
          const outs = lab.since(lifts[0].seq, 'outcome').filter(e => e.cls === 'absolute-stable' && e.dir < 0 && e.z0 > Physics.lcl(st.T0, st.Td0));
          return outs.length > 0;
        },
        success: '안정한 대기에서는 응결 고도 위로 강제로 올려도 주위보다 차가워 다시 내려가요. 넓은 공기층이 이렇게 들려 올라가면 얇게 퍼진 층운형 구름이 생기기 쉬워요.'
      },
      {
        id: 'cond2', title: '조건부 불안정에서 두 높이에 놓았을 때 비교하기',
        goal: '<b>조건부 불안정</b> 대기에서 같은 공기를 서로 다른 두 높이에서 놓아, <b>한 번은 내려가고 한 번은 올라가는</b> 모습을 관찰하세요.',
        hints: ['두 높이에서 공기 덩어리 기온과 주위 기온을 비교해 보세요.', '응결 고도 위에서 공기 덩어리는 5 ℃/km, 주위는 γ ℃/km씩 식어 언젠가 공기 덩어리가 더 따뜻해져요.', '자유 대류 고도 = 5H/(γ − 5). 30 ℃·14 ℃·γ 8이면 약 3.33 km'],
        check(lab, since) {
          const outs = lab.since(since, 'outcome').filter(e => e.cls === 'conditional');
          const byKey = {};
          outs.forEach(e => { (byKey[e.key] = byKey[e.key] || []).push(e); });
          return Object.values(byKey).some(list => list.some(e => e.dir < 0 && e.z0 > 0.05) && list.some(e => e.dir > 0));
        },
        success: '자유 대류 고도보다 낮은 곳에서는 놓으면 내려가고, 높은 곳에서는 스스로 올라가요. 상승 응결 고도(구름 바닥)와 자유 대류 고도는 다른 높이예요.'
      },
      {
        id: 'cumulus', title: '불안정한 대기에서 스스로 올라가는 공기 관찰하기',
        goal: '<b>절대 불안정</b> 대기에서 공기를 응결 고도보다 낮은 곳까지 살짝 올렸다 놓아, 응결 고도를 지나 <b>스스로 계속 올라가는</b> 모습을 관찰하세요.',
        hints: ['감률 γ를 건조 단열 감률(10 ℃/km)과 비교해 보세요.', 'γ > 10이면 불포화일 때도 공기 덩어리가 주위보다 따뜻해져요.', '예: γ = 12, 목표 높이 0.50 km까지 올렸다 놓기'],
        check(lab, since) {
          const rel = lab.since(since, 'release').filter(e => e.z < Physics.lcl(st.T0, st.Td0));
          if (!rel.length) return false;
          return lab.since(rel[0].seq, 'freeRise').some(e => e.cls === 'absolute-unstable');
        },
        success: '불안정한 대기에서는 응결 뒤에도 상승이 이어져 구름이 수직으로 두껍게 발달해요(적운형).'
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
    const P = prof();
    for (let z = 0; z <= ZMAX; z++) {
      if (z > 0) s('line', { x1: 0, x2: W, y1: f.yOf(z), y2: f.yOf(z), stroke: '#fff', 'stroke-width': 1.5, opacity: 0.8 }, svg);
      txt({ x: 10, y: f.yOf(z) - 6, class: 'lb-sm tnum halo-sky', fill: '#485563' }, `주위 ${fT(Physics.envTemp(P, z))} ℃`, svg);
    }
    s('rect', { x: 0, y: y0, width: W, height: f.H - y0, fill: '#B9C6AE' }, svg);
    txt({ x: 12, y: y0 + 24, class: 'lb-sm', fill: '#3D4A3A' }, '지표 (0 km)', svg);
    E.typ = s('g', null, svg); E.typKey = null;
    E.typT = txt({ 'text-anchor': 'end', class: 'lb-sm halo-sky', fill: '#4E5D6A' }, '', svg);
    E.sLCL = s('line', { x1: 0, x2: W, stroke: 'var(--lcl)', 'stroke-width': 2.5, 'stroke-dasharray': '12 5 3 5' }, svg);
    E.sLCLt = txt({ class: 'lb-sm halo-sky', fill: '#7A4E10', 'text-anchor': 'end' }, '', svg);
    E.sLFC = s('g', null, svg);
    E.cmpTrail = s('line', { stroke: '#C65040', 'stroke-width': 6, opacity: 0.18, 'stroke-linecap': 'round' }, svg);
    E.trail = s('line', { stroke: '#4E5D6A', 'stroke-width': 2, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round', opacity: 0.85 }, svg);
    E.sNow = s('line', { 'data-role': 'now', x1: 0, x2: W, stroke: 'var(--ink)', 'stroke-width': 1.2, opacity: 0.45 }, svg);
    E.sNowTag = s('g', null, svg);
    E.sNowBg = s('rect', { rx: 6, height: 24, width: 70, fill: '#fff', stroke: '#C9C4B8' }, E.sNowTag);
    E.sNowT = txt({ class: 'lb-sm tnum', 'text-anchor': 'end' }, '', E.sNowTag);
    E.push = s('g', null, svg);       // 밀어 올리는 힘
    s('path', { d: 'M-14 0 h28 M-9 0 v14 M0 0 v16 M9 0 v14', stroke: '#263746', 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' }, E.push);
    s('path', { d: 'M-8 -6 L0 -14 L8 -6', stroke: '#263746', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, E.push);
    E.pushT = txt({ x: 16, y: 10, class: 'lb-sm halo-sky', fill: '#263746' }, '밀어 올림', E.push);
    E.buoy = s('g', null, svg);      // 부력 (힘)
    E.buoyP = s('path', { fill: '#1E6E64' }, E.buoy);
    E.buoyT = txt({ class: 'lb-sm halo-sky', fill: '#1E6E64' }, '부력', E.buoy);
    E.vel = s('g', null, svg);       // 이동 방향 (속도)
    E.velP = s('path', { fill: 'none', stroke: '#4E5D6A', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': '5 3' }, E.vel);
    E.velT = txt({ class: 'lb-sm halo-sky', fill: '#4E5D6A', 'text-anchor': 'end' }, '이동', E.vel);
    E.parcel = makeParcel(svg, { seed: 11 });
    E.px = W * 0.38;
    sa(E.parcel.g, { tabindex: 0, role: 'img', 'aria-label': '공기 덩어리' });
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
    E.Dp = s('path', { fill: 'none', stroke: 'var(--dew)', 'stroke-width': 2.5, 'stroke-dasharray': '9 6', opacity: 0.85 }, p);
    E.TpT = txt({ class: 'lb halo', fill: 'var(--temp)', 'text-anchor': 'end' }, '공기 덩어리', o);
    E.gNow = s('line', { 'data-role': 'now', x1: ax.X0, x2: ax.X1, stroke: 'var(--ink)', 'stroke-width': 1.2, opacity: 0.45 }, p);
    E.pts = PointPair(p, { dShape: 'square' });
    E.cmpPt = s('rect', { width: 10, height: 10, fill: '#fff', stroke: 'var(--env)', 'stroke-width': 2, opacity: 0.55 }, p);
    E.lblP = txt({ class: 'lb halo', fill: 'var(--temp)' }, '', o);
    E.lblE = txt({ class: 'lb halo', fill: 'var(--env)' }, '', o);
    E.lblD = txt({ class: 'lb halo', fill: '#4E5D6A', 'text-anchor': 'middle' }, '', o);
    E.edge = s('g', null, o);
    // 참고용 단열선
    const Hn = H(), tH = st.T0 - 10 * Hn;
    s('path', { d: pathD([[st.T0, 0], [st.T0 - 10 * ZMAX, ZMAX]], ax, f), stroke: '#C9C3B6', 'stroke-width': 1.5, 'stroke-dasharray': '4 5', fill: 'none' }, E.ref);
    if (Hn < ZMAX) s('path', { d: pathD([[tH, Hn], [tH - 5 * (ZMAX - Hn), ZMAX]], ax, f), stroke: '#B8C6D3', 'stroke-width': 1.5, 'stroke-dasharray': '4 5', fill: 'none' }, E.ref);
    const lz = Math.min(ZMAX - 0.4, Hn + 1.8);
    if (Hn < ZMAX - 1) txt({ x: ax.gx(st.T0 - 10 * lz) - 8, y: f.yOf(lz), 'text-anchor': 'end', class: 'lb-sm halo', fill: '#9C968A' }, '건조 단열선(참고)', o);
    if (Hn < ZMAX - 0.8) { const mz = Math.min(ZMAX - 0.2, Hn + 2.6); txt({ x: ax.gx(tH - 5 * (mz - Hn)) + 8, y: f.yOf(mz), class: 'lb-sm', fill: '#8EA0B0' }, '습윤 단열선(참고)', o); }
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
    ui.legend.innerHTML = legendHTML('var(--temp)', '', '공기 덩어리') + legendHTML('var(--dew)', 'dash', '이슬점') + legendHTML('var(--env)', '', '주위 기온') +
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
    sa(E.sLCLt, { x: f.sceneW - 80, y: yH - 7, opacity: Hn <= ZMAX ? 1 : 0 }); E.sLCLt.textContent = `상승 응결 고도 ${fZ(Hn)} km`;
    clear(E.sLFC);
    if (showAll) iv.warm.forEach(([a, c]) => {
      if (a > 1e-6 && a < ZMAX) { s('line', { x1: 0, x2: f.sceneW, y1: f.yOf(a), y2: f.yOf(a), stroke: 'var(--lfc)', 'stroke-width': 2.2, 'stroke-dasharray': '3 4 10 4' }, E.sLFC); }
      if (c < ZMAX - 1e-6) { s('line', { x1: 0, x2: f.sceneW, y1: f.yOf(c), y2: f.yOf(c), stroke: 'var(--lfc)', 'stroke-width': 1.5, 'stroke-dasharray': '2 4', opacity: 0.8 }, E.sLFC); }
    });
    // 전형적인 구름 모양 (정성적, 기록으로 결정)
    const typ = cloudType();
    const topZ = typ === 'cumulus' ? (iv.el != null && iv.el > Hn ? iv.el : ZMAX) : Hn;
    const tk = typ ? `${typ}|${Hn.toFixed(3)}|${topZ.toFixed(3)}` : '';
    if (tk !== E.typKey) {
      E.typKey = tk; clear(E.typ);
      const x0 = f.sceneW * 0.6, x1 = f.sceneW * 0.97;
      if (typ === 'stratus') layerCloud(E.typ, x0, x1, yH + 2, 18, 4, 0.9);
      if (typ === 'cumulus') puffCloud(E.typ, (x0 + x1) / 2, yH + 2, f.yOf(Math.min(topZ, ZMAX - 0.1)), (x1 - x0) / 2.6, 6, 0.9);
    }
    sa(E.typT, { x: f.sceneW - 8, y: typ === 'cumulus' ? f.yOf(Math.min(topZ, ZMAX - 0.1)) - 10 : yH + 26, opacity: typ ? 1 : 0 });
    E.typT.textContent = typ === 'cumulus' ? '적운형 (정성적 표현)' : '층운형 (정성적 표현)';
    // 지나온 경로 · 공기 덩어리 · 화살표
    sa(E.trail, { x1: E.px + 0, x2: E.px, y1: f.yOf(zMinH), y2: f.yOf(zMaxH), opacity: zMaxH > 0.01 ? 0.85 : 0 });
    if (st.cmp) { const zs = st.cmp.zs; sa(E.cmpTrail, { x1: E.px - 30, x2: E.px - 30, y1: f.yOf(Math.min(...zs)), y2: f.yOf(Math.max(...zs)), opacity: Math.max(...zs) > 0.01 ? 0.2 : 0 }); }
    else sa(E.cmpTrail, { opacity: 0 });
    const rad = 16 + 2.6 * z;
    E.parcel.set(E.px, yz, rad, par.saturated && z > Hn + 1e-9 ? clamp((z - Hn) / 1.5, 0.3, 1) : 0);
    sa(E.parcel.g, { 'aria-label': `공기 덩어리: 높이 ${fZ(z)} km, 기온 ${fT(par.T)} ℃, 주위 ${fT(env)} ℃` });
    sa(E.sNow, { y1: yz, y2: yz });
    sa(E.sNowBg, { x: f.sceneW - 76, y: yz - 12 }); sa(E.sNowT, { x: f.sceneW - 12, y: yz + 5 }); E.sNowT.textContent = `${fZ(z)} km`;
    const forced = fr.phase === 'lift' || fr.phase === 'hold';
    sa(E.push, { transform: `translate(${E.px} ${yz + rad + 18})`, opacity: forced ? 1 : 0 });
    E.pushT.textContent = fr.phase === 'hold' ? '붙잡아 둠' : '밀어 올림';
    if (fr.phase === 'lift' && fr.v < 0) E.pushT.textContent = '끌어 내림';
    const bl = Math.abs(b) < 0.05 ? 0 : clamp(10 + Math.abs(b) * 4, 14, 60);
    if (bl > 0) {
      const dir = b > 0 ? -1 : 1, x = E.px + rad + 22, y1 = yz, y2 = yz + dir * bl;
      sa(E.buoyP, { d: `M${x - 4} ${y1} L${x + 4} ${y1} L${x + 4} ${y2 - dir * 10} L${x + 10} ${y2 - dir * 10} L${x} ${y2} L${x - 10} ${y2 - dir * 10} L${x - 4} ${y2 - dir * 10} Z` });
      sa(E.buoyT, { x: x + 14, y: (y1 + y2) / 2 + 5 }); E.buoyT.textContent = b > 0 ? '부력 ↑' : '부력 ↓';
      sa(E.buoy, { opacity: 1 });
    } else sa(E.buoy, { opacity: 0 });
    const moveV = fr.phase === 'free' ? fr.v : 0;
    if (Math.abs(moveV) > 0.02) {
      const dir = moveV > 0 ? -1 : 1, len = clamp(12 + Math.abs(moveV) * 30, 16, 50), x = E.px - rad - 18;
      sa(E.velP, { d: `M${x} ${yz} L${x} ${yz + dir * len} M${x - 7} ${yz + dir * (len - 8)} L${x} ${yz + dir * len} L${x + 7} ${yz + dir * (len - 8)}` });
      sa(E.velT, { x: x - 8, y: yz + dir * len / 2 + 5 });
      sa(E.vel, { opacity: 1 });
    } else sa(E.vel, { opacity: 0 });

    /* 그래프 */
    sa(E.gLCL, { y1: yH, y2: yH, opacity: Hn <= ZMAX ? 1 : 0 });
    sa(E.gLCLt, { y: yH - 7 }); E.gLCLt.textContent = `상승 응결 고도 ${fZ(Hn)} km`;
    clear(E.gCross);
    sa(E.shade, { opacity: showAll ? 1 : 0 });
    if (showAll) {
      iv.warm.forEach(([a, c], i) => {
        if (a > 1e-6 && a < ZMAX) {
          s('line', { x1: ax.X0, x2: ax.X1, y1: f.yOf(a), y2: f.yOf(a), stroke: 'var(--lfc)', 'stroke-width': 2.2, 'stroke-dasharray': '3 4 10 4' }, E.gCross);
          const near = Math.abs(f.yOf(a) - yH) < 18;
          txt({ x: ax.X1 - 6, y: f.yOf(a) + (near ? 18 : -7), 'text-anchor': 'end', class: 'lb-sm halo', fill: 'var(--lfc)' }, `${i === 0 ? '자유 대류 고도' : '다시 따뜻해짐'} ${fApprox(a)} km`, E.gCross);
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
    const dp = hm > Hn ? [[st.Td0, 0], [tH, Hn], [Physics.parcel(st.T0, st.Td0, hm).T, hm]] : [[st.Td0, 0], [st.Td0 - 2 * hm, hm]];
    sa(E.Tp, { d: hm > 0.005 ? pathD(tp, ax, f) : '' });
    sa(E.Dp, { d: hm > 0.005 ? pathD(dp, ax, f) : '' });
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
    sa(E.lblD, { x: (xP + xE) / 2, y: clamp(yz + 22, ax.Y1 + 14, ax.Y0 - 6), opacity: Math.abs(xP - xE) > 46 ? 1 : 0 });
    E.lblD.textContent = same ? '같음' : `${signed(b, Math.max(1, fPair(par.T, env)[2]))} ℃`;
    if (st.cmp) {
      const c = st.cmp, Pc = Physics.makeProfile(c.T0, c.gamma, c.inv.on ? c.inv : null);
      sa(E.cmpPt, { x: ax.gx(Physics.envTemp(Pc, z)) - 5, y: yz - 5, opacity: 0.6 });
    } else sa(E.cmpPt, { opacity: 0 });
    clear(E.edge);
    edgeMarker(E.edge, ax, f, par.T, z, 'var(--temp)');
    edgeMarker(E.edge, ax, f, env, z, 'var(--env)');

    /* 수치 */
    ui.ro.set('z', `${fZ(z)}<small>km</small>`, `응결 고도 ${fZ(Hn)} km`);
    let cmpSub = '';
    if (st.cmp) { const c = st.cmp, Pc = Physics.makeProfile(c.T0, c.gamma, c.inv.on ? c.inv : null); cmpSub = `비교 ${fT(Physics.envTemp(Pc, z))} ℃`; }
    ui.ro.set('Tp', `${sP}<small>℃</small>`, par.saturated ? '포화 (응결 고도 위)' : '불포화');
    ui.ro.set('Te', `${sE}<small>℃</small>`, cmpSub || `이 높이 감률 ${fmt(Physics.envLapse(P, z), 1)} ℃/km`);
    ui.ro.set('d', `${same ? '0.0' : signed(b, Math.max(1, fPair(par.T, env)[2]))}<small>℃</small>`, same ? '부력 없음' : (b > 0 ? '위로 부력 ↑' : '아래로 부력 ↓'));
    const mv = motionText(fr, b);
    ui.ro.set('m', `<span style="font-size:21px">${mv.short}</span>`, mv.sub);
    renderGuide(fr, b, par, iv);
    renderBadge(iv);
    renderGuideBox(iv);
    if (ch) ch.check();
  }
  function motionText(fr, b) {
    if (fr.phase === 'lift') return { short: fr.v >= 0 ? '강제 상승' : '강제 하강', sub: '바깥 힘으로 옮기는 중' };
    if (fr.phase === 'hold') return { short: fr.note === 'top' ? '표시 상한' : '붙잡음', sub: '바깥 힘으로 고정' };
    if (fr.note === 'top') return { short: '표시 상한', sub: `${ZMAX} km에서 멈춤` };
    if (Math.abs(fr.v) < 0.01) return { short: '정지', sub: fr.note === 'ground' ? '지표' : (Math.abs(b) < 0.05 ? '주위와 같은 기온' : '') };
    return { short: fr.v > 0 ? '상승 중' : '하강 중', sub: (fr.v > 0) === (b > 0) ? '부력과 같은 방향' : '부력과 반대 → 느려짐' };
  }
  function renderGuide(fr, b, par, iv) {
    if (st.notice) { ui.ro.guide('안내', 'neutral', st.notice); return; }
    const vsTxt = `공기 ${fT(par.T)} ℃ · 주위 ${fT(par.T - b)} ℃`;
    let s1, c1, m;
    if (fr.phase === 'lift') { s1 = '강제 이동'; c1 = 'neutral'; m = `바깥 힘으로 ${fr.v >= 0 ? '밀어 올리는' : '끌어 내리는'} 중이에요. ${vsTxt}`; }
    else if (fr.phase === 'hold') {
      s1 = fr.note === 'top' ? '표시 상한' : '붙잡음'; c1 = 'neutral';
      m = fr.note === 'top' ? `표시 범위(${ZMAX} km)에 도달했어요. ${vsTxt}` : `목표 높이에서 붙잡고 있어요. ${vsTxt}. <b>놓아주기</b>를 누르면 어떻게 될까요?`;
    } else if (fr.note === 'top') { s1 = '표시 상한'; c1 = 'neutral'; m = `표시 범위에 도달했어요. 공기 덩어리는 여전히 주위보다 ${b > 0 ? '따뜻해 더 올라가려 해요' : '차가워요'}. (안정해져 멈춘 것이 아니에요)`; }
    else if (Math.abs(fr.v) < 0.01) {
      s1 = '정지'; c1 = 'neutral';
      if (fr.note === 'ground' || fr.z < 1e-6) m = st.run.frames.length > 1 ? '지표로 돌아와 멈췄어요.' : `같은 높이에서 공기 덩어리와 주위 기온을 비교해요. 목표 높이를 정하고 <b>공기 올리기</b>를 눌러 보세요.`;
      else if (Math.abs(b) < 0.05) m = `주위와 기온이 같은 높이(${fZ(fr.z)} km)에서 멈췄어요.`;
      else m = b > 0 ? '주위보다 따뜻해 곧 올라가기 시작해요.' : '주위보다 차가워 곧 내려가기 시작해요.';
    } else if (fr.v > 0) {
      s1 = '상승'; c1 = 'up';
      m = b > 0 ? `주위보다 따뜻해 위로 부력을 받아 <b>올라가요</b>. ${vsTxt}` : `주위보다 차가워 아래로 힘을 받아 <b>상승이 느려져요</b>. ${vsTxt}`;
    } else {
      s1 = '하강'; c1 = 'down';
      m = b < 0 ? `주위보다 차가워 <b>내려가요</b>. ${vsTxt}` : `주위보다 따뜻해 위로 힘을 받아 <b>하강이 느려져요</b>. ${vsTxt}`;
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
    const P = prof();
    if (st.inv.on) {
      const top = st.inv.base + st.inv.depth;
      const parts = iv.warm.map(([a, b2]) => `${fApprox(a)}~${b2 >= ZMAX - 1e-6 ? ZMAX : fApprox(b2)} km`);
      ui.invInfo.innerHTML = `주위 기온: ${fZ(st.inv.base)} km에서 ${fT(Physics.envTemp(P, st.inv.base))} ℃ → ${fZ(top)} km에서 ${fT(Physics.envTemp(P, top))} ℃ (역전층 감률 ${fmt(-st.inv.dT / st.inv.depth, 1)} ℃/km)<br>공기 덩어리가 주위보다 따뜻한 구간: <b>${parts.length ? parts.join(', ') : '없음'}</b>`;
    } else ui.invInfo.textContent = '역전층을 넣으면 공기 덩어리가 주위보다 따뜻한 구간이 여기에 나타나요.';
  }
  /** 안내 실험 상자: 지금 조건이 대표 조건이면 해 볼 실험 버튼 */
  function renderGuideBox(iv) {
    const key = `${st.T0}|${st.Td0}|${st.gamma}|${st.inv.on}|${st.showPath}`;
    if (ui.guideBox.dataset.key === key) return;
    ui.guideBox.dataset.key = key;
    clear(ui.guideBox);
    const isDef = st.T0 === 30 && st.Td0 === 14 && !st.inv.on;
    const add = (label, z, desc) => ui.guideBox.appendChild(h('div', { class: 'exp' }, h('div', null, h('div', { class: 't', html: label }), h('div', { class: 'd', html: desc })),
      Btn(`${fZ(z)} km까지 올리기`, 'sm accent', () => { resetMotion(); st.target = z; ui.tz.set(z); liftTo(z); sh.panel.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'center' }); })));
    ui.guideBox.appendChild(h('p', { class: 'note', html: '대표 감률 4 · 8 · 12 ℃/km를 바꿔도 지표 공기(30 ℃ · 14 ℃, 응결 고도 2 km)는 그대로예요. 올린 뒤 <b>놓아주기</b>를 눌러 움직임을 보세요.' }));
    const warmTxt = iv.warm.length ? iv.warm.map(([a, b2]) => `${fApprox(a)}~${b2 >= ZMAX - 1e-6 ? ZMAX : fApprox(b2)} km`).join(', ') : '없음';
    ui.guideBox.appendChild(h('p', { class: 'note', html: `지금 조건에서 공기 덩어리가 주위보다 따뜻한 구간(0~${ZMAX} km): <b>${warmTxt}</b>` }));
    if (!isDef) { ui.guideBox.appendChild(h('p', { class: 'note', text: '안내 실험은 지표 기온 30 ℃ · 이슬점 14 ℃(역전층 없음)에서 준비돼 있어요. 조건 기본값을 누르면 돌아가요.' })); return; }
    const c = Physics.stabilityClass(st.gamma).key;
    if (c === 'conditional' && Math.abs(st.gamma - 8) < 1e-9) {
      add('① 2.00 km에서 놓기', 2, '공기 10 ℃ · 주위 14 ℃ — 놓으면?');
      add('② 3.50 km에서 놓기', 3.5, '공기 2.5 ℃ · 주위 2 ℃ — 놓으면?');
      ui.guideBox.appendChild(h('p', { class: 'note', html: `자유 대류 고도는 약 ${fZ(iv.lfc)} km예요. 정확히 그 높이에 놓으면 두 기온이 같고 속도가 0이라 바로 움직이지 않을 수 있어, 조금 더 높은 3.50 km를 써요. <b>예상 경로와 판정 보기</b>로 확인해 보세요.` }));
    } else if (c === 'absolute-stable') add('2.50 km에서 놓기', 2.5, '응결 고도(2 km) 위로 강제로 올린 뒤 놓으면?');
    else if (c === 'absolute-unstable') add('0.50 km에서 놓기', 0.5, '응결 고도 아래에서 살짝 올렸다 놓으면?');
    else ui.guideBox.appendChild(h('p', { class: 'note', text: '대표 감률(4 · 8 · 12)을 고르면 안내 실험이 나타나요.' }));
  }
  function renderControls() {
    if (!ui.ctrl || !st.run) return;
    const r = st.run, fr = cur();
    const mv = moving();
    ui.ctrl.setPlay(!st.paused && mv, mv ? '▶ 재생' : (fr.phase === 'hold' ? '▶ 놓아주기' : '▶ 공기 올리기'));
    const keys = [...new Set(r.keys.concat([r.frames.length - 1]))];
    ui.ctrl.setStep(keys.some(k => k < st.idx), keys.some(k => k > st.idx));
    ui.rel.disabled = fr.phase === 'free';
    ui.lift.innerHTML = st.target < fr.z - 1e-9 ? '목표로 내리기' : '공기 올리기';
    ui.lift.disabled = Math.abs(st.target - fr.z) < 1e-9 && fr.phase !== 'free';
    ui.tl.max = Math.max(0, r.frames.length - 1);
    if (document.activeElement !== ui.tl) ui.tl.value = st.idx;
    ui.tl.style.setProperty('--fill', (r.frames.length > 1 ? st.idx / (r.frames.length - 1) * 100 : 0) + '%');
  }

  return {
    L, init, layout, tick, render,
    pause() { pause(); },
    onShow() { layout(); },
    hasFrame: () => !!(sh && sh.frame),
    api: { liftTo, release, play, step, seek, resetMotion, resetDefaults, setCond, saveCompare, st, H, cur: () => cur() }
  };
})();
