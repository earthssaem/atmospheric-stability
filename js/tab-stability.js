/**
 * tab-stability.js — 3. 대기 안정도
 * 원래 위치에서 주위와 기온이 같던 공기 덩어리를 강제로 올리거나 내린 뒤 놓아,
 * 원래 위치로 되돌아가는지(안정) · 멀어지는지(불안정) · 그 자리에 머무는지(중립) 본다.
 * 기온 감률 γ를 건조 · 습윤 단열 감률과 비교해 A 절대 안정 · B 절대 불안정 · C 조건부 불안정을 구분한다.
 * 계산은 physics.displaced · displacedStep(교육용 정성 모형)에서 가져오고, 모든 순간을 기록해 되감기 · 단계 이동에 쓴다.
 */
'use strict';

const StabLab = (function () {
  const ZMAX = 4, Z0 = 2, TZ0 = 10;   // 움직일 수 있는 범위 0~4 km, 원래 위치 2 km, 그 높이의 기온 10 ℃ (처음에는 공기 덩어리 = 주위)
  const ZVIEW = 4.5;                   // 그림 위쪽 여유 (4 km에 닿은 공기 덩어리가 잘리지 않게)
  const DT = 1 / 120;                  // 계산 간격 (초)
  const LIFT = 0.6;                    // 강제로 올리고 내리는 속도 (화면 표현용)
  const MAX_FRAMES = 4800;
  const XR = { min: -20, max: 40, step: 10 };
  const DEF = { gamma: 8, sat: false, dz: 1 };
  const PRESETS = [
    { g: 4, t: '절대 안정 (A 구간)' }, { g: 8, t: '조건부 불안정 (C 구간)' },
    { g: 10, t: '건조 단열 감률과 같음' }, { g: 12, t: '절대 불안정 (B 구간)' }
  ];
  const CLS = { stable: '안정', unstable: '불안정', neutral: '중립' };
  const ZONE = {
    'absolute-stable': { k: 'A', t: 'A 절대 안정' },
    'moist-neutral': { k: '', t: '경계 γ = 5' },
    'conditional': { k: 'C', t: 'C 조건부 불안정' },
    'dry-neutral': { k: '', t: '경계 γ = 10' },
    'absolute-unstable': { k: 'B', t: 'B 절대 불안정' }
  };
  const C_DRY = '#C9771F', C_MOIST = '#2F78B5', C_ORIGIN = '#2F7F73';
  const L = Object.assign(baseLab(), { id: 'stab' });
  const st = {
    gamma: DEF.gamma, sat: DEF.sat, dz: DEF.dz,
    paused: false, cmp: null, notice: '', showZones: true, reveal: false,
    seen: {},                 // 관찰한 결과: stable · unstable · neutral (위로 올렸다 놓은 실험), A · B · C 구간
    run: null, idx: 0, acc: 0, drag: null
  };
  L.st = st;
  let sh, ui = {}, E = {}, ax = null, ch = null;

  const lapse = (o) => Physics.adiabatLapse((o || st).sat);
  const at = (z, o) => Physics.displaced(TZ0, Z0, (o || st).gamma, (o || st).sat, z);
  const cls = () => Physics.stabilityFor(st.gamma, st.sat);          // stable | unstable | neutral
  const zone = () => Physics.stabilityClass(st.gamma).key;
  const condKey = () => `${st.gamma}|${st.sat}`;
  const edgeNote = z => (z >= ZMAX - 1e-9 ? 'top' : (z <= 1e-9 ? 'ground' : null));
  const satName = (sat) => (sat ? '습윤' : '건조');

  /* ───────── 기록(실행) ─────────
   * frame: {z, v, a, b, phase: 'free' | 'lift' | 'drag' | 'hold', dir: 위(1)·아래(−1)·멈춤(0), note: null | 'top' | 'ground' | 'rest' | 'limit'}
   *  - lift: 「강제 상승」·「강제 하강」으로 움직이는 중 / drag: 직접 끌어 움직이는 중
   *  - hold: 그 높이에 붙잡아 두고 관찰하는 중 / free: 놓은 뒤 계산대로 움직임
   * rel: 마지막으로 놓은 순간 {z, b, idx, out: null | 'back' | 'away' | 'stay' | 'origin'} */
  function newRun() {
    st.run = { frames: [{ z: Z0, v: 0, a: 0, b: 0, phase: 'free', dir: 0, note: null }], settled: true, rest: 0, keys: [0], liftTarget: null, rel: null };
    st.idx = 0; st.acc = 0;
  }
  const cur = () => st.run.frames[st.idx];
  function truncateToIdx() {
    const r = st.run;
    if (st.idx < r.frames.length - 1) {
      r.frames.length = st.idx + 1;
      r.keys = r.keys.filter(k => k <= st.idx);
      if (r.rel && r.rel.idx > st.idx) r.rel = null;
      r.settled = false; r.rest = 0;
    }
  }
  function push(fr) {
    const r = st.run;
    const prev = r.frames[r.frames.length - 1];
    r.frames.push(fr);
    const i = r.frames.length - 1;
    if (fr.phase !== prev.phase || (fr.phase === 'free' && prev.phase === 'free' && Math.sign(fr.v) !== Math.sign(prev.v) && Math.abs(prev.v) > 0.01) || (fr.note && fr.note !== prev.note)) r.keys.push(i);
    st.idx = i;
  }
  /** 놓은 뒤의 결과 판정: 원래 위치로 되돌아옴 · 멀어짐 · 그대로 머묾 */
  function judge(fr) {
    const r = st.run, rel = r.rel;
    if (!rel || rel.out) return;
    const d0 = Math.abs(rel.z - Z0), d = Math.abs(fr.z - Z0);
    const outward = rel.b * (rel.z - Z0) > 1e-9;           // 놓은 순간 힘이 원래 위치에서 먼 쪽을 향함
    let out = null;
    if (d0 < 0.02) { if (r.settled) out = 'origin'; }
    else if (d < d0 - 0.2 || (r.settled && d < d0 - 0.02)) out = 'back';
    else if (d > d0 + 0.2 || ((fr.note === 'top' || fr.note === 'ground') && outward)) out = 'away';
    else if (r.settled) out = 'stay';
    if (!out) return;
    rel.out = out; rel.outIdx = st.run.frames.length - 1;
    if (out === 'origin') return;
    const c = cls(), zk = zone();
    L.emit('outcome', { out, cls: c, zone: zk, sat: st.sat, gamma: st.gamma, up: rel.z > Z0, key: condKey() });
    const expect = { stable: 'back', unstable: 'away', neutral: 'stay' }[c];
    if (out === expect) {
      if (rel.z > Z0) st.seen[c] = true;
      const zz = ZONE[zk].k;
      if (zz) st.seen[zz] = true;
    }
    renderTables();
  }
  /** 계산 한 걸음 */
  function simStep() {
    const r = st.run, f0 = r.frames[r.frames.length - 1];
    let fr;
    if (f0.phase === 'lift') {
      const tgt = r.liftTarget, dir = tgt >= f0.z ? 1 : -1;
      let z = f0.z + dir * LIFT * DT, phase = 'lift';
      if ((dir > 0 && z >= tgt) || (dir < 0 && z <= tgt)) { z = tgt; phase = 'hold'; }
      fr = { z, v: phase === 'lift' ? dir * LIFT : 0, a: 0, b: at(z).b, phase, dir: phase === 'lift' ? dir : 0, note: edgeNote(z) };
      if (phase === 'hold') { r.liftTarget = null; emitHeld(z); }
    } else if (f0.phase === 'hold' || f0.phase === 'drag') {
      return false;
    } else {
      const m = Physics.displacedStep(st.gamma, st.sat, Z0, { z: f0.z, v: f0.v }, DT, 0, ZMAX);
      fr = { z: m.z, v: m.v, a: m.a, b: m.b, phase: 'free', dir: 0, note: m.hit };
      if (m.hit) r.settled = true;
      else if (Math.abs(m.v) < 0.003 && Math.abs(m.a) < 0.003) { r.rest += DT; if (r.rest > 0.5) { r.settled = true; fr.note = 'rest'; } }
      else r.rest = 0;
    }
    if (r.frames.length >= MAX_FRAMES - 1) { r.settled = true; fr.note = fr.note || 'limit'; }
    push(fr);
    if (fr.phase === 'free') judge(fr);
    return true;
  }

  /* ───────── 조작 ───────── */
  function emitHeld(z) { L.emit('held', { z, dz: z - Z0, cls: cls(), zone: zone(), sat: st.sat }); }
  /** 지금 높이에 붙잡아 두기 (올리거나 내리던 중이면 그 자리에서) */
  function holdHere() {
    const f0 = cur();
    if (f0.phase !== 'lift' && f0.phase !== 'drag') return;
    st.run.liftTarget = null;
    push({ z: f0.z, v: 0, a: 0, b: f0.b, phase: 'hold', dir: 0, note: edgeNote(f0.z) });
    emitHeld(f0.z);
    render();
  }
  /* 공기 덩어리를 직접 끌어 움직이기 (손을 떼면 그 높이에 붙잡아 둠) */
  function dragBegin() {
    truncateToIdx();
    const r = st.run, f0 = cur();
    r.settled = false; r.rest = 0; r.liftTarget = null;
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
    push({ z, v: 0, a: 0, b: at(z).b, phase: 'drag', dir: z > f0.z ? 1 : -1, note: edgeNote(z) });
    render();
  }
  function dragEnd() { if (!st.drag) return; st.drag = null; holdHere(); }
  function liftTo(z) {
    z = clamp(z, 0, ZMAX);
    truncateToIdx();
    const r = st.run, f0 = cur();
    if (Math.abs(f0.z - z) < 1e-9) { st.notice = '이미 그 높이에 있어요. 놓기를 눌러 보세요.'; render(); return; }
    r.liftTarget = z; r.settled = false; r.rest = 0;
    push({ z: f0.z, v: 0, a: 0, b: f0.b, phase: 'lift', dir: z > f0.z ? 1 : -1, note: null });
    st.paused = false; st.notice = '';
    render();
  }
  /** 강제 상승(1) · 강제 하강(−1): 원래 위치에서 정한 거리만큼. 놓은 뒤 다른 곳에 있으면 원래 위치에서 새로 시작 */
  function force(dir) {
    truncateToIdx();
    const f0 = cur();
    if (f0.phase === 'free' && Math.abs(f0.z - Z0) > 0.005) newRun();
    liftTo(Z0 + dir * st.dz);
  }
  function release() {
    truncateToIdx();
    const r = st.run, f0 = cur();
    if (f0.phase === 'free') return;
    st.drag = null;
    r.settled = false; r.rest = 0; r.liftTarget = null;
    r.rel = { z: f0.z, b: f0.b, idx: r.frames.length, out: null };
    L.emit('release', { z: f0.z, dz: f0.z - Z0, cls: cls(), zone: zone(), sat: st.sat, gamma: st.gamma, key: condKey() });
    push({ z: f0.z, v: 0, a: 0, b: f0.b, phase: 'free', dir: 0, note: null });   // 멈춘 채로 놓는다 (밀어 준 빠르기 없음)
    st.paused = false; st.notice = '';
    render();
  }
  function play() {
    if (!st.paused && active()) { st.paused = true; render(); return; }
    if (st.paused) { st.paused = false; render(); return; }
    force(1);
  }
  /** 시간이 흐르는 중인가: 움직이는 중이거나, 기록을 이어 보는 중이거나, 붙잡아 두고 관찰하는 중 */
  function active() { const r = st.run, p = cur().phase; return st.idx < r.frames.length - 1 || p !== 'free' || !r.settled; }
  function pause() { if (st.drag) dragEnd(); if (!st.paused) { st.paused = true; render(); } }
  function resetMotion() { newRun(); st.paused = false; st.notice = ''; L.emit('reset'); render(); }
  function seek(i) { st.idx = clamp(Math.round(i), 0, st.run.frames.length - 1); st.paused = true; render(); }
  function step(d) {
    const uniq = [...new Set(st.run.keys.concat([st.run.frames.length - 1]))].sort((a, b) => a - b);
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
    if (st.idx < r.frames.length - 1) {               // 되감은 뒤 재생: 기록을 이어서 보여 줌
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
    if (o.gamma != null) st.gamma = o.gamma;
    if (o.sat != null) st.sat = !!o.sat;
    ui.g.set(st.gamma); ui.sat.set(st.sat);
    conditionsChanged();
  }
  function conditionsChanged() {
    ui.preset.set(PRESETS.some(p => Math.abs(p.g - st.gamma) < 1e-9) ? st.gamma : null);
    newRun(); st.paused = false;
    L.emit('cond', { key: condKey() });
    rebuildAll();
  }
  function resetDefaults() {
    Object.assign(st, { gamma: DEF.gamma, sat: DEF.sat, dz: DEF.dz, showZones: true, notice: '' });
    ui.g.set(DEF.gamma); ui.sat.set(DEF.sat); ui.dz.set(DEF.dz); ui.tZone.set(true);
    conditionsChanged();
  }
  const cmpLabel = c => `γ ${fmt(c.gamma, 1)} ℃/km · ${c.sat ? '포화' : '불포화'}`;
  function saveCompare() {
    const r = st.run;
    st.cmp = { gamma: st.gamma, sat: st.sat, zs: r.frames.slice(0, st.idx + 1).map(f => f.z), label: '' };
    st.cmp.label = cmpLabel(st.cmp);
    L.emit('compare', {});
    afterCompareChange();
  }
  function afterCompareChange() { ui.cmp.show(st.cmp ? st.cmp.label : ''); renderLegend(); rebuildAll(); }

  /* ───────── 화면 만들기 ───────── */
  function init(root) {
    sh = makeShell(root, {
      ratio: '40%', zMax: ZVIEW,
      sceneTitle: '대기 단면', graphTitle: '높이–온도 그래프',
      sceneLabel: '원래 위치에서 강제로 움직인 공기 덩어리와 주위 대기의 단면', graphLabel: '공기 덩어리 기온과 주위 기온, 건조·습윤 단열선의 높이에 따른 변화'
    });
    ui.g = NumField({ label: '주위 기온 감률 γ', min: 2, max: 14, step: 0.1, sliderStep: 0.5, decimals: 1, value: st.gamma, unit: '℃/km', cls: 'tight', onCommit: v => setCond({ gamma: v }) });
    ui.g.range.style.setProperty('--c', 'var(--env)');
    ui.preset = (function () {
      const el = h('span', { class: 'presets', role: 'group', 'aria-label': '대표 감률' });
      const btns = PRESETS.map(p => { const bt = Btn(String(p.g), 'sm', () => setCond({ gamma: p.g }), { title: `γ = ${p.g} ℃/km · ${p.t}`, 'aria-label': `감률 ${p.g} ℃/km ${p.t}` }); el.appendChild(bt); return bt; });
      return { el, set(v) { btns.forEach((bt, i) => { const on = v != null && Math.abs(PRESETS[i].g - v) < 1e-9; bt.classList.toggle('on', on); bt.setAttribute('aria-pressed', on ? 'true' : 'false'); }); } };
    })();
    ui.preset.set(st.gamma);
    ui.g.el.appendChild(ui.preset.el);
    ui.sat = Seg([
      { value: false, label: '불포화 <small>10 ℃/km</small>', title: '불포화 공기: 건조 단열 감률(10 ℃/km)로 기온이 변해요' },
      { value: true, label: '포화 <small>5 ℃/km</small>', title: '포화 공기: 습윤 단열 감률(5 ℃/km)로 기온이 변해요' }
    ], st.sat, v => setCond({ sat: v }), { label: '공기 덩어리 상태', cls: 'sat-seg' });
    const satField = h('div', { class: 'nf' }, h('span', { class: 'nf-label', text: '공기 덩어리' }), ui.sat.el);
    const tail = h('div', { class: 'cond-tail' });
    ui.cmp = CompareUI(tail, saveCompare, () => { st.cmp = null; afterCompareChange(); });
    sh.cond.append(h('div', { class: 'cond-group' }, ui.g.el, satField), tail);

    ui.badge = h('span', { class: 'stab-badge' });
    ui.zoneBadge = h('span', { class: 'stab-badge' });
    sh.sceneHead.append(ui.badge, ui.zoneBadge);
    ui.tZone = Toggle('A·B·C 구간 보기', st.showZones, v => { st.showZones = v; render(); });
    ui.legend = h('span', { class: 'legend' });
    sh.graphLegend.append(ui.legend);
    sh.graphHead.insertBefore(ui.tZone.el, sh.graphLegend);

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
    ui.tl = h('input', { type: 'range', min: 0, max: 0, step: 1, value: 0, 'aria-label': '기록 되감기' });
    ui.tl.style.setProperty('--c', 'var(--ink)');
    ui.tl.addEventListener('input', () => seek(+ui.tl.value));
    ui.ctrl.slot.append(h('div', { class: 'progress' }, h('span', { class: 'lbl', text: '기록' }), ui.tl));
    // 공기 덩어리 조작 줄: 강제 상승 · 강제 하강 → (그 높이에 붙잡아 둠) → 놓기
    ui.dz = NumField({ label: '움직일 거리', min: 0.25, max: 2, step: 0.05, decimals: 2, value: st.dz, unit: 'km', cls: 'compact', onCommit: v => { st.dz = v; render(); } });
    ui.up = Btn('▲ 강제 상승', 'accent', () => force(1), { title: '원래 위치보다 정한 거리만큼 위로 올려 붙잡아 둬요' });
    ui.down = Btn('▼ 강제 하강', 'accent', () => force(-1), { title: '원래 위치보다 정한 거리만큼 아래로 내려 붙잡아 둬요' });
    ui.rel = Btn('놓기', 'primary', release);
    ui.relHint = h('span', { class: 'rel-hint', text: '놓으면 원래 위치로 되돌아가는지, 멀어지는지, 그대로 머무는지 보세요.' });
    ui.manip = h('div', { class: 'ctrl-bar manip-bar', role: 'group', 'aria-label': '공기 덩어리 조작' },
      h('span', { class: 'manip-title', text: '공기 덩어리' }), ui.dz.el, ui.up, ui.down, h('span', { class: 'manip-sep', 'aria-hidden': 'true' }), ui.rel, ui.relHint);
    sh.ctrl.after(ui.manip);
    sh.bottomEl = ui.manip;

    buildMore();
    buildChallenges();
    newRun();
    renderLegend();
    render();
  }

  function buildMore() {
    const m = sh.more;
    ui.revealT = Toggle('빈칸 모두 보기', st.reveal, v => { st.reveal = v; renderTables(true); });
    ui.tbl1 = h('div');
    m.appendChild(Fold('안정 · 불안정 · 중립 정리', h('div', null,
      h('p', { html: '공기 덩어리를 강제로 상승시키거나 하강시켰을 때, <b>원래 위치로 되돌아가려</b> 하거나 <b>원래 위치에서 멀어지려는</b> 경향을 대기 안정도라고 해요. 움직인 공기 덩어리의 기온을 <b>같은 높이의 주위 기온</b>과 비교해 판단해요.' }),
      h('div', { class: 'ch-row' }, ui.revealT.el, h('span', { class: 'note', text: '공기 덩어리를 위로 올렸다 놓아 결과를 보면 그 칸의 빈칸이 채워져요.' })),
      ui.tbl1), true, 'wide'));
    ui.tbl2 = h('div');
    m.appendChild(Fold('기온 감률에 따른 대기 안정도 <span class="tag">A · B · C 구간</span>', ui.tbl2, true));
    ui.chBox = h('div');
    m.appendChild(Fold('더 해 보기 <span class="tag">도전 2</span>', ui.chBox, false));
  }

  const blank = (k, ans) => (st.reveal || st.seen[k] ? `<span class="blank filled">${ans}</span>` : '<span class="blank" aria-label="빈칸"></span>');
  /** 정리 표 두 개: 지금 조건에 해당하는 칸을 밝게, 관찰한 칸은 빈칸을 채운다 */
  function renderTables(force) {
    if (!ui.tbl1) return;
    const c = cls(), zk = zone(), zz = ZONE[zk].k;
    const key = [c, zk, st.sat, st.reveal, JSON.stringify(st.seen)].join('|');
    if (!force && ui.tbl1.dataset.key === key) return;
    ui.tbl1.dataset.key = key;
    const ref = `${satName(st.sat)} 단열 감률`;
    const col = (k, cells) => cells.map(x => `<td class="${k === c ? 'cur' : ''}">${x}</td>`).join('');
    ui.tbl1.innerHTML = `<table class="stab-table"><thead><tr><th></th>${['stable', 'unstable', 'neutral'].map(k => `<th class="${k === c ? 'cur' : ''} c-${k}">${CLS[k]}</th>`).join('')}</tr></thead><tbody>
      <tr><th>정의</th>${col('stable', ['공기 덩어리를 상승·하강시켰을 때 <b>원래 위치로 되돌아가려는</b> 상태'])}${col('unstable', ['원래 위치에서 <b>멀어지는 방향</b>으로 계속 상승·하강하려는 상태'])}${col('neutral', ['상승·하강시킨 위치에 <b>그대로 머무르려는</b> 상태'])}</tr>
      <tr><th>강제 상승시킨<br>공기 덩어리의 기온</th>${col('stable', [`주위 기온보다 ${blank('stable', '낮다')}`])}${col('unstable', [`주위 기온보다 ${blank('unstable', '높다')}`])}${col('neutral', [`주위 기온과 ${blank('neutral', '같다')}`])}</tr>
      <tr><th>기온 감률 비교</th>${col('stable', [`기온 감률 ${blank('stable', '&lt;')} ${ref}`])}${col('unstable', [`기온 감률 ${blank('unstable', '&gt;')} ${ref}`])}${col('neutral', [`기온 감률 ${blank('neutral', '=')} ${ref}`])}</tr>
      <tr><th>특징</th>${col('stable', ['공기의 연직 운동이 억제되어 대류가 잘 일어나지 않고, 대기 오염 물질의 농도가 높아지며, 공기가 포화된 경우 <b>층운형</b> 구름이 생길 수 있다.'])}${col('unstable', ['공기의 연직 운동이 활발하여 대류가 잘 일어나고, 대기 오염 물질이 잘 퍼져 나가며, 공기가 포화된 경우 <b>적운형</b> 구름이 생길 수 있다.'])}${col('neutral', ['공기의 대류가 약하며, 대기의 혼합이 잘 일어나지 않는다.'])}</tr>
      </tbody></table>
      <p class="note">지금은 <b>${st.sat ? '포화' : '불포화'} 공기</b>라서 ${ref}(${lapse()} ℃/km)과 비교해요. ${st.sat ? '불포화 공기는 건조 단열 감률(10 ℃/km)과 비교해요.' : '포화된 공기는 습윤 단열 감률(5 ℃/km)과 비교해요.'}</p>`;
    const row = (k, name, cond, desc, g) => `<div class="zone-row${zz === k ? ' cur' : ''} z-${k}"><div class="zone-head"><span class="zone-k">${k}</span><b>${name}</b></div>
      <div class="zone-body"><div>→ ${cond}</div><div>→ ${desc}</div></div><button type="button" class="btn sm" data-g="${g}">γ ${g}로 보기</button></div>`;
    ui.tbl2.innerHTML = `<p>건조 단열 감률(10 ℃/km)과 습윤 단열 감률(5 ℃/km)을 기준으로 주위 기온 감률을 세 구간으로 나눠요. 그래프에서 기온선이 어느 구간에 놓이는지 보세요.</p>
      ${row('A', 'A 구간: 절대 안정', `기온 감률 ${blank('A', '&lt;')} 습윤 단열 감률`, '공기의 포화 여부에 관계없이 원래 위치로 되돌아가려 한다.', 4)}
      ${row('B', 'B 구간: 절대 불안정', `기온 감률 ${blank('B', '&gt;')} 건조 단열 감률`, '공기의 포화 여부에 관계없이 원래 위치에서 멀어지려 한다.', 12)}
      ${row('C', 'C 구간: 조건부 불안정', `습윤 단열 감률 ${blank('C', '&lt;')} 기온 감률 ${blank('C', '&lt;')} 건조 단열 감률`, '공기 덩어리의 포화 여부에 따라 안정도가 달라진다. <b>불포화 상태면 안정</b>하고, <b>포화 상태면 불안정</b>하다.', 8)}
      <p class="note">${zz ? `지금 γ = ${fmt(st.gamma, 1)} ℃/km는 <b>${ZONE[zk].t}</b> 구간이에요.` : `지금 γ = ${fmt(st.gamma, 1)} ℃/km는 구간의 <b>경계값</b>이에요(${zk === 'moist-neutral' ? '포화 공기만 중립' : '불포화 공기만 중립'}).`} 빈칸은 그 구간에서 공기 덩어리를 놓아 보면 채워져요.</p>`;
    ui.tbl2.querySelectorAll('button[data-g]').forEach(b => b.addEventListener('click', () => setCond({ gamma: +b.dataset.g })));
  }

  function buildChallenges() {
    ch = Challenges(ui.chBox, L, [
      {
        id: 'cond', title: '같은 대기, 다른 결과 — 조건부 불안정',
        goal: '기온 감률이 <b>5와 10 사이</b>인 같은 대기에서 <b>불포화 공기</b>는 원래 위치로 되돌아오고, <b>포화 공기</b>는 멀어지는 것을 둘 다 관찰하세요.',
        hints: ['감률 γ를 건조 단열 감률(10)과 습윤 단열 감률(5) 사이로 정해 보세요.', '불포화 공기는 1 km에 10 ℃, 포화 공기는 5 ℃씩 기온이 변해요.', '예: γ = 8에서 불포화로 강제 상승 → 놓기, 포화로 바꿔 강제 상승 → 놓기'],
        check(lab, since) {
          const o = lab.since(since, 'outcome').filter(e => e.zone === 'conditional');
          return o.some(e => !e.sat && e.out === 'back') && o.some(e => e.sat && e.out === 'away' && o.some(u => !u.sat && u.out === 'back' && u.gamma === e.gamma));
        },
        success: '조건부 불안정한 대기는 공기가 불포화면 안정하고, 포화되면 불안정해요.'
      },
      {
        id: 'neutral', title: '포화 공기가 그대로 머무는 대기 찾기',
        goal: '<b>포화된 공기 덩어리</b>를 강제로 움직인 뒤 놓았을 때 <b>그 자리에 그대로 머무는</b> 기온 감률을 찾아보세요.',
        hints: ['공기 덩어리와 주위 기온이 어느 높이에서나 같으면 힘을 받지 않아요.', '포화 공기는 습윤 단열 감률로 기온이 변해요.', '기온 감률을 5 ℃/km로 맞추고 포화 공기를 움직였다 놓아 보세요.'],
        check(lab, since) { return lab.since(since, 'outcome').some(e => e.sat && e.out === 'stay'); },
        success: '기온 감률이 습윤 단열 감률(5 ℃/km)과 같으면 포화 공기는 중립이에요.'
      }
    ]);
  }

  /* ───────── 그리기 ───────── */
  function layout() { const f = layoutShell(sh); if (!f) return; rebuildAll(); }
  function rebuildAll() { if (!sh.frame) { render(); return; } buildScene(sh.frame); buildGraph(sh.frame); render(); }

  function buildScene(f) {
    const svg = sh.sceneSvg; clear(svg);
    const W = f.sceneW, y0 = f.yOf(0);
    s('rect', { x: 0, y: 0, width: W, height: y0, fill: skyGradient(svg, 'stsky') }, svg);
    for (let z = 1; z <= ZMAX; z++) s('line', { x1: 0, x2: W, y1: f.yOf(z), y2: f.yOf(z), stroke: '#fff', 'stroke-width': 1.5, opacity: 0.8 }, svg);
    E.envLbls = [];
    for (let z = 0; z <= ZMAX; z++) E.envLbls.push(txt({ x: 10, y: f.yOf(z) - 6, class: 'lb-sm tnum halo-sky', fill: '#485563' }, `주위 ${fT(at(z).Te)} ℃`, svg));
    s('rect', { x: 0, y: y0, width: W, height: f.H - y0, fill: '#B9C6AE' }, svg);
    txt({ x: 12, y: y0 + 24, class: 'lb-sm', fill: '#3D4A3A' }, '지표 (0 km)', svg);
    E.px = W * 0.4;
    const yO = f.yOf(Z0);
    s('line', { x1: 0, x2: W, y1: yO, y2: yO, stroke: C_ORIGIN, 'stroke-width': 2, 'stroke-dasharray': '9 6', opacity: 0.9 }, svg);
    E.originT = txt({ x: W - 10, y: yO + 20, 'text-anchor': 'end', class: 'lb-sm halo-sky', fill: C_ORIGIN }, `원래 위치 ${fZ(Z0)} km (공기 = 주위 ${fT(TZ0)} ℃)`, svg);
    E.ghost = s('circle', { cx: E.px, cy: yO, r: 18 + 2.5 * Z0, fill: 'none', stroke: C_ORIGIN, 'stroke-width': 1.5, 'stroke-dasharray': '3 4', opacity: 0.7 }, svg);
    E.cmpTrail = s('line', { stroke: '#C65040', 'stroke-width': 6, opacity: 0, 'stroke-linecap': 'round' }, svg);
    E.trail = s('line', { stroke: '#4E5D6A', 'stroke-width': 2, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round', opacity: 0 }, svg);
    E.sNow = s('line', { 'data-role': 'now', x1: 0, x2: W, stroke: 'var(--ink)', 'stroke-width': 1.2, opacity: 0.45 }, svg);
    E.sNowTag = s('g', null, svg);
    E.sNowBg = s('rect', { rx: 6, height: 24, width: 70, fill: '#fff', stroke: '#C9C4B8' }, E.sNowTag);
    E.sNowT = txt({ class: 'lb-sm tnum', 'text-anchor': 'end' }, '', E.sNowTag);
    E.buoy = s('g', null, svg);      // 부력 (힘)
    E.buoyP = s('path', { fill: '#1E6E64' }, E.buoy);
    E.buoyT = txt({ class: 'lb-sm halo-sky', fill: '#1E6E64' }, '부력', E.buoy);
    E.vel = s('g', null, svg);       // 이동 방향 (속도)
    E.velP = s('path', { fill: 'none', stroke: '#4E5D6A', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, E.vel);
    E.velT = txt({ class: 'lb-sm halo-sky', fill: '#4E5D6A', 'text-anchor': 'end' }, '이동', E.vel);
    E.parcel = makeParcel(svg, { seed: 17, drag: true });
    E.ring = s('circle', { r: 24, fill: 'none', stroke: '#3B5266', 'stroke-width': 1.75, class: 'manip-ring', opacity: 0 }, E.parcel.g);
    E.status = txt({ class: 'manip-status halo-sky', 'text-anchor': 'middle' }, '', svg);
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
    const g = s('g', null, svg);
    ax = drawAxes(g, f, XR);
    const p = ax.plot, o = ax.over;
    // A · B · C 구간: 원래 위치의 점을 지나는 건조 · 습윤 단열선으로 나눔 (교과서 그림처럼 그 점 위쪽만 칠함)
    E.zones = s('g', null, ax.bg);
    const lo = XR.min - 200, hi = XR.max + 200, zt = ZVIEW + 2;
    const dryT = z => TZ0 - Physics.DRY * (z - Z0), moistT = z => TZ0 - Physics.MOIST * (z - Z0);
    const poly = (pts, fill) => s('path', { d: pathD(pts, ax, f) + ' Z', fill, opacity: 0.6 }, E.zones);
    const O = [TZ0, Z0];
    poly([O, [dryT(zt), zt], [lo, zt], [lo, Z0]], '#F8DCC8');               // B 절대 불안정
    poly([O, [dryT(zt), zt], [moistT(zt), zt]], '#EEF2E2');                 // C 조건부 불안정
    poly([O, [moistT(zt), zt], [hi, zt], [hi, Z0]], '#D9E8F5');             // A 절대 안정
    E.zoneLbl = s('g', null, o);
    const zl = ZVIEW - 0.22;
    txt({ x: ax.X1 - 8, y: f.yOf(zl), 'text-anchor': 'end', class: 'lb-sm halo', fill: '#1F5A88' }, 'A 절대 안정', E.zoneLbl);
    // C 구간 이름: 기온선이 C 구간을 지나면 더 넓은 쪽 틈에, 좁으면 글자 하나만
    { const xd = ax.gx(dryT(zl)), xm = ax.gx(moistT(zl)), xe = ax.gx(at(zl).Te);
      let a = xd, c = xm;
      if (xe > xd + 1 && xe < xm - 1) { if (xe - xd > xm - xe) c = xe; else a = xe; }
      const w = c - a, full = w > 128;
      if (w > 22) txt({ x: (a + c) / 2, y: f.yOf(zl), 'text-anchor': 'middle', class: 'lb-sm halo', fill: '#4E6A2A' }, full ? 'C 조건부 불안정' : 'C', E.zoneLbl); }
    txt({ x: ax.X0 + 8, y: f.yOf(Z0 + 0.3), class: 'lb-sm halo', fill: '#9C4A1E' }, 'B 절대 불안정', E.zoneLbl);
    E.cmpG = s('g', { opacity: 0.4 }, p);
    s('line', { x1: ax.X0, x2: ax.X1, y1: f.yOf(Z0), y2: f.yOf(Z0), stroke: C_ORIGIN, 'stroke-width': 1.5, 'stroke-dasharray': '9 6', opacity: 0.8 }, p);
    // 건조 · 습윤 단열선 (원래 위치의 점을 지남): 지금 공기 덩어리 상태의 선을 진하게
    E.dry = s('path', { d: pathD([[dryT(0), 0], [dryT(ZVIEW), ZVIEW]], ax, f), fill: 'none', stroke: C_DRY, 'stroke-dasharray': '10 6' }, p);
    E.moist = s('path', { d: pathD([[moistT(0), 0], [moistT(ZVIEW), ZVIEW]], ax, f), fill: 'none', stroke: C_MOIST, 'stroke-dasharray': '10 6' }, p);
    E.dryT = txt({ x: ax.gx(dryT(0.25)) + 10, y: f.yOf(0.25) + 4, class: 'lb-sm halo', fill: C_DRY }, '건조 단열선', o);
    E.moistT = txt({ x: ax.gx(moistT(0.8)) - 10, y: f.yOf(0.8) + 4, 'text-anchor': 'end', class: 'lb-sm halo', fill: C_MOIST }, '습윤 단열선', o);
    // 주위 기온선
    E.env = s('path', { d: pathD([[at(0).Te, 0], [at(ZVIEW).Te, ZVIEW]], ax, f), fill: 'none', stroke: 'var(--env)', 'stroke-width': 3.5 }, p);
    E.envT = txt({ class: 'lb halo', fill: 'var(--env)' }, `기온선 (γ ${fmt(st.gamma, 1)})`, o);
    E.Tp = s('path', { fill: 'none', stroke: 'var(--temp)', 'stroke-width': 4.5, 'stroke-linecap': 'round' }, p);
    E.gNow = s('line', { 'data-role': 'now', x1: ax.X0, x2: ax.X1, stroke: 'var(--ink)', 'stroke-width': 1.2, opacity: 0.45 }, p);
    s('circle', { cx: ax.gx(TZ0), cy: f.yOf(Z0), r: 4.5, fill: C_ORIGIN }, p);
    E.pts = PointPair(p, { dShape: 'square' });
    E.lblP = txt({ class: 'lb halo', fill: 'var(--temp)' }, '', o);
    E.lblE = txt({ class: 'lb halo', fill: 'var(--env)' }, '', o);
    E.lblD = txt({ class: 'lb halo', fill: '#4E5D6A', 'text-anchor': 'middle' }, '', o);
    E.edge = s('g', null, o);
    clear(E.cmpG);
    if (st.cmp) {
      const c = st.cmp;
      s('path', { d: pathD([[at(0, c).Te, 0], [at(ZVIEW, c).Te, ZVIEW]], ax, f), fill: 'none', stroke: 'var(--env)', 'stroke-width': 3, 'stroke-dasharray': '10 4' }, E.cmpG);
    }
  }
  function renderLegend() {
    ui.legend.innerHTML = legendHTML('var(--temp)', '', '공기 덩어리') + legendHTML('var(--env)', '', '주위 기온') +
      legendHTML(C_DRY, 'dash', '건조 단열선') + legendHTML(C_MOIST, 'dash', '습윤 단열선') +
      (st.cmp ? legendHTML('var(--env)', 'dash faint', '비교') : '');
  }

  function render() {
    renderControls();
    if (!sh || !sh.frame || !ax || !st.run) return;
    const f = sh.frame, r = st.run, fr = cur();
    const z = fr.z, yz = f.yOf(z), dz = z - Z0;
    const d = at(z), b = d.b, c = cls();
    let zMinH = Z0, zMaxH = Z0;
    for (let i = 0; i <= st.idx; i++) { const zz = r.frames[i].z; if (zz > zMaxH) zMaxH = zz; if (zz < zMinH) zMinH = zz; }

    /* 장면 */
    const rad = 18 + 2.5 * z;
    E.parcel.set(E.px, yz, rad, st.sat ? 0.85 : 0);
    sa(E.parcel.g, { 'aria-label': `공기 덩어리: 높이 ${fZ(z)} km, 기온 ${fT(d.T)} ℃, 주위 ${fT(d.Te)} ℃ (끌거나 위·아래 화살표 키로 올리고 내리기)`, 'aria-valuenow': z.toFixed(2) });
    sa(E.ghost, { opacity: Math.abs(dz) > 0.02 ? 0.7 : 0 });
    sa(E.trail, { x1: E.px, x2: E.px, y1: f.yOf(zMinH), y2: f.yOf(zMaxH), opacity: zMaxH - zMinH > 0.01 ? 0.85 : 0 });
    if (st.cmp && st.cmp.zs.length > 1) { const zs = st.cmp.zs; sa(E.cmpTrail, { x1: E.px - 34, x2: E.px - 34, y1: f.yOf(Math.min(...zs)), y2: f.yOf(Math.max(...zs)), opacity: 0.2 }); }
    else sa(E.cmpTrail, { opacity: 0 });
    sa(E.sNow, { y1: yz, y2: yz });
    sa(E.sNowBg, { x: f.sceneW - 76, y: yz - 12 }); sa(E.sNowT, { x: f.sceneW - 12, y: yz + 5 }); E.sNowT.textContent = `${fZ(z)} km`;
    const manip = fr.phase !== 'free';
    sa(E.ring, { r: (rad + 6).toFixed(1), opacity: manip ? 0.9 : 0 });
    const bl = Math.abs(b) < 0.05 ? 0 : clamp(10 + Math.abs(b) * 4, 14, 60);
    if (bl > 0) {
      const dir = b > 0 ? -1 : 1, x = E.px + rad + 22, y1 = yz, y2 = yz + dir * bl;
      sa(E.buoyP, { d: `M${x - 4} ${y1} L${x + 4} ${y1} L${x + 4} ${y2 - dir * 10} L${x + 10} ${y2 - dir * 10} L${x} ${y2} L${x - 10} ${y2 - dir * 10} L${x - 4} ${y2 - dir * 10} Z` });
      sa(E.buoyT, { x: x + 14, y: (y1 + y2) / 2 + 5 }); E.buoyT.textContent = b > 0 ? '부력 ↑' : '부력 ↓';
      sa(E.buoy, { opacity: 1 });
    } else sa(E.buoy, { opacity: 0 });
    // 이동 방향(속도): 놓은 뒤에는 빠르기에 따라, 사용자가 움직이는 중에는 작고 가는 화살표
    const userDir = (fr.phase === 'lift' || fr.phase === 'drag') ? fr.dir : 0;
    const moveV = fr.phase === 'free' ? fr.v : 0;
    if (userDir !== 0 || Math.abs(moveV) > 0.02) {
      const up = userDir !== 0 ? userDir > 0 : moveV > 0;
      const dir = up ? -1 : 1, len = userDir !== 0 ? 24 : clamp(12 + Math.abs(moveV) * 30, 16, 50), x = E.px - rad - 16;
      const hw = userDir !== 0 ? 5 : 7;
      sa(E.velP, { d: `M${x} ${yz} L${x} ${yz + dir * len} M${x - hw} ${yz + dir * (len - hw - 1)} L${x} ${yz + dir * len} L${x + hw} ${yz + dir * (len - hw - 1)}`,
        'stroke-width': userDir !== 0 ? 1.75 : 2.5, 'stroke-dasharray': userDir !== 0 ? 'none' : '5 3', stroke: userDir !== 0 ? '#6F7A84' : '#4E5D6A' });
      sa(E.velT, { x: x - 7, y: yz + dir * len / 2 + 5, fill: userDir !== 0 ? '#6F7A84' : '#4E5D6A' });
      sa(E.vel, { opacity: 1 });
    } else sa(E.vel, { opacity: 0 });
    // 공기 덩어리 둘레의 글자는 겹치면 잠시 숨김 (같은 값은 현재 수치 · 그래프에 있음)
    const near = [{ x: E.px - rad - 9, y: yz - rad - 9, width: 2 * rad + 18, height: 2 * rad + 18 }];
    [E.buoy, E.vel].forEach(el => { if (shown(el)) { const bb = bbox(el); if (bb) near.push(bb); } });
    E.envLbls.forEach(t => { const bb = bbox(t); sa(t, { opacity: bb && near.some(n => overlap(bb, n)) ? 0 : 1 }); });
    { const bb = bbox(E.originT); sa(E.originT, { opacity: bb && near.concat([bbox(E.sNowTag)]).some(n => n && overlap(bb, n)) ? 0 : 1 }); }
    placeStatus(f, fr, yz, rad);

    /* 그래프 */
    const active = st.sat ? E.moist : E.dry, other = st.sat ? E.dry : E.moist;
    sa(active, { 'stroke-width': 3, opacity: 1 }); sa(other, { 'stroke-width': 1.6, opacity: 0.45 });
    sa(st.sat ? E.moistT : E.dryT, { opacity: 1 }); sa(st.sat ? E.dryT : E.moistT, { opacity: 0.5 });
    sa(E.zones, { opacity: st.showZones ? 1 : 0 }); sa(E.zoneLbl, { opacity: st.showZones ? 1 : 0 });
    sa(E.Tp, { d: zMaxH - zMinH > 0.005 ? pathD([[at(zMinH).T, zMinH], [at(zMaxH).T, zMaxH]], ax, f) : '' });
    sa(E.gNow, { y1: yz, y2: yz });
    { const ez = [3.4, 1.15, 0.55].find(q => Math.abs(q - z) > 0.5); sa(E.envT, { x: ax.gx(at(ez).Te) + 10, y: f.yOf(ez) }); }
    const xP = ax.gx(d.T), xE = ax.gx(d.Te);
    const same = Math.abs(b) < 1e-9, tiny = Math.abs(b) < 0.05;   // tiny: 소수 첫째 자리에서 0.0으로 보이는 차이
    E.pts.set(xP, xE, yz, same);
    const [sP, sE, dig] = fPair(d.T, d.Te);
    const left = xP < xE;
    const ly = clamp(yz - 12, ax.Y1 + 14, ax.Y0 - 8);
    sa(E.lblP, { x: xP + (left ? -12 : 12), y: ly, 'text-anchor': left ? 'end' : 'start', opacity: same ? 0 : 1 }); E.lblP.textContent = `${sP} ℃`;
    sa(E.lblE, { x: xE + (left ? 12 : -12), y: ly, 'text-anchor': same ? 'start' : (left ? 'start' : 'end') }); E.lblE.textContent = same ? `${sE} ℃ (같음)` : `${sE} ℃`;
    if (same) sa(E.lblE, { x: xE + 14 });
    sa(E.lblD, { x: (xP + xE) / 2, y: clamp(yz + 22, ax.Y1 + 14, ax.Y0 - 6), opacity: Math.abs(xP - xE) > 46 ? 1 : 0 });
    E.lblD.textContent = `${signed(b, Math.max(1, dig))} ℃`;
    clear(E.edge);
    edgeMarker(E.edge, ax, f, d.T, z, 'var(--temp)');
    edgeMarker(E.edge, ax, f, d.Te, z, 'var(--env)');

    /* 수치 */
    ui.ro.set('z', `${fZ(z)}<small>km</small>`, Math.abs(dz) < 0.005 ? '원래 위치' : `원래 위치 ${signed(dz, 2)}`);
    ui.ro.set('Tp', `${sP}<small>℃</small>`, st.sat ? '포화 · 5 ℃/km' : '불포화 · 10 ℃/km');
    ui.ro.set('Te', `${sE}<small>℃</small>`, `감률 ${fmt(st.gamma, 1)} ℃/km`);
    ui.ro.set('d', `${same ? '0.0' : signed(b, Math.max(1, dig))}<small>℃</small>`, tiny ? '주위와 같다' : (b > 0 ? '주위보다 높다 ↑' : '주위보다 낮다 ↓'));
    const mv = motionText(fr);
    ui.ro.set('m', `<span style="font-size:21px">${mv.short}</span>`, mv.sub);
    renderGuide(fr, d);
    renderBadge(c);
    renderTables();
    if (ch) ch.check();
  }
  const overlap = (a, b) => !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
  const shown = el => el && el.getAttribute('opacity') !== '0';
  const bbox = el => { try { const b = el.getBBox(); return b.width ? b : null; } catch (e) { return null; } };
  /** 공기 덩어리 아래(자리가 없으면 위) 상태 문구 */
  function placeStatus(f, fr, yz, rad) {
    const t = E.status;
    let text = '';
    if ((fr.phase === 'lift' || fr.phase === 'drag') && fr.dir !== 0) text = fr.dir > 0 ? '올리는 중' : '내리는 중';
    else if (fr.phase === 'hold' || fr.phase === 'drag') text = '이 높이에 붙잡아 둔 상태';
    if (t.textContent !== text) t.textContent = text;
    if (!text) { sa(t, { opacity: 0 }); return; }
    sa(t, { x: 0, y: 0 });
    const b0 = bbox(t) || { x: -text.length * 7, y: -14, width: text.length * 14, height: 18 };
    const PAD = 3, GAP = 11;
    const boxes = [{ x: E.px - rad - GAP, y: yz - rad - GAP, width: 2 * (rad + GAP), height: 2 * (rad + GAP) }];
    const add = el => { if (shown(el)) { const bb = bbox(el); if (bb) boxes.push(bb); } };
    add(E.buoy); add(E.vel); add(E.sNowTag); add(E.originT); E.envLbls.forEach(add);
    if (Math.abs(fr.z - Z0) > 0.005) boxes.push({ x: 0, y: f.yOf(Z0) - 3, width: f.sceneW, height: 6 });   // 원래 위치 선 위에는 두지 않음
    const yGround = f.yOf(0);
    const rectAt = (cx, by) => ({ x: cx + b0.x - PAD, y: by + b0.y - PAD, width: b0.width + 2 * PAD, height: b0.height + 2 * PAD });
    const fits = (cx, by) => {
      const rr = rectAt(cx, by);
      if (rr.x < 2 || rr.x + rr.width > f.sceneW - 2 || rr.y < 2 || rr.y + rr.height > yGround - 2) return false;
      return !boxes.some(bb => overlap(rr, bb));
    };
    const below = yz + rad + GAP + PAD - b0.y, above = yz - rad - GAP - PAD - b0.y - b0.height;
    const ys = [];
    for (let k = 0; k < 6; k++) ys.push(below + k * 10);
    for (let k = 0; k < 5; k++) ys.push(above - k * 10);
    const half = b0.width / 2 + PAD + 2;
    const xs = [E.px, E.px - half + rad, E.px + half - rad].map(x => clamp(x, half, f.sceneW - half));
    let pos = null;
    for (const by of ys) { for (const cx of xs) if (fits(cx, by)) { pos = [cx, by]; break; } if (pos) break; }
    if (!pos) pos = [xs[0], below + b0.height + 2 * PAD + 2 * GAP + 2 * rad > yGround ? above : below];
    sa(t, { x: pos[0].toFixed(1), y: pos[1].toFixed(1), opacity: 1 });
  }
  /** 놓은 뒤 지금 원래 위치 쪽으로 가는 중인가 (+1 되돌아감, −1 멀어짐, 0 멈춤) */
  function heading(fr) {
    if (fr.phase !== 'free' || Math.abs(fr.v) < 0.01) return 0;
    return Math.sign(fr.v) === -Math.sign(fr.z - Z0) ? 1 : -1;
  }
  /** 지금 보고 있는 순간까지 확정된 결과 (되감아 본 순간에는 그때까지의 결과만) */
  function outcomeAt() {
    const rel = st.run.rel;
    if (!rel || !rel.out || st.idx < rel.outIdx) return null;
    return rel.out;
  }
  const justReleased = (fr) => { const rel = st.run.rel; return fr.phase === 'free' && rel && st.idx === rel.idx; };
  function motionText(fr) {
    if ((fr.phase === 'lift' || fr.phase === 'drag') && fr.dir !== 0) return { short: fr.dir > 0 ? '강제 상승' : '강제 하강', sub: fr.dir > 0 ? '직접 올리는 중' : '직접 내리는 중' };
    if (fr.phase === 'hold' || fr.phase === 'drag') return { short: '붙잡아 둠', sub: Math.abs(fr.z - Z0) < 0.005 ? '원래 위치' : '놓으면?' };
    if (justReleased(fr)) return { short: '놓은 순간', sub: '멈춘 채로 놓음' };
    const hd = heading(fr);
    if (hd > 0) return { short: '되돌아가는 중', sub: '원래 위치 쪽으로' };
    if (hd < 0) return { short: '멀어지는 중', sub: '원래 위치에서 먼 쪽으로' };
    const out = outcomeAt();
    if (out === 'back') return { short: '되돌아옴', sub: '원래 위치에서 멈춤' };
    if (out === 'away') return { short: '멀어짐', sub: fr.note === 'top' ? '위쪽 끝(4 km)' : (fr.note === 'ground' ? '지표에 닿음' : '원래 위치에서 멀리') };
    if (out === 'stay') return { short: '그대로 머묾', sub: '놓은 자리' };
    return { short: '정지', sub: Math.abs(fr.z - Z0) < 0.005 ? '원래 위치' : '' };
  }
  function renderGuide(fr, d) {
    if (st.notice) { ui.ro.guide('안내', 'neutral', st.notice); return; }
    const b = d.b, L0 = lapse(), g = fmt(st.gamma, 1);
    const vs = `공기 ${fT(d.T)} ℃ · 주위 ${fT(d.Te)} ℃`;
    const atOrigin = Math.abs(fr.z - Z0) < 0.005;
    if ((fr.phase === 'lift' || fr.phase === 'drag') && fr.dir !== 0) {
      ui.ro.guide(fr.dir > 0 ? '올리는 중' : '내리는 중', 'neutral',
        `${st.sat ? '포화된 공기는 1 km에 5 ℃씩' : '불포화 공기는 1 km에 10 ℃씩'} ${fr.dir > 0 ? '낮아지고' : '높아지고'}, 주위 기온은 1 km에 ${g} ℃씩 ${fr.dir > 0 ? '낮아져요' : '높아져요'}. ${vs}`);
      return;
    }
    if (fr.phase === 'hold' || fr.phase === 'drag') {
      const s1 = st.paused ? '일시정지' : '붙잡아 둔 상태';
      if (atOrigin) { ui.ro.guide(s1, 'neutral', '원래 위치예요. 위나 아래로 움직인 뒤 놓아 보세요.'); return; }
      const m = Math.abs(b) < 0.05   // 소수 첫째 자리에서 같아 보이면 같다고 안내
        ? `공기 덩어리와 주위 기온이 ${fT(d.T)} ℃로 <b>같아요</b> → 힘을 받지 않아요.`
        : `공기 덩어리(${fT(d.T)} ℃)가 주위(${fT(d.Te)} ℃)보다 <b>${b < 0 ? '낮아요' : '높아요'}</b> → ${b < 0 ? '무거워 아래로' : '가벼워 위로'} 힘을 받아요.`;
      ui.ro.guide(s1, 'neutral', `${m} 놓으면 어떻게 될까요?`);
      return;
    }
    const hd = heading(fr);
    if (hd !== 0) {
      ui.ro.guide(hd > 0 ? '되돌아가는 중' : '멀어지는 중', hd > 0 ? 'down' : 'up',
        `주위보다 ${b < 0 ? '차가워 아래로' : '따뜻해 위로'} 힘을 받아 원래 위치${hd > 0 ? ' 쪽으로 <b>되돌아가요</b>' : '에서 <b>멀어져요</b>'}. ${vs}`);
      return;
    }
    const out = outcomeAt(), rel = st.run.rel, up = rel && rel.z > Z0;
    const ref = `${satName(st.sat)} 단열 감률 ${L0}`;
    if (out === 'back') {
      ui.ro.guide('안정', 'down', `원래 위치로 되돌아왔어요 → <b>안정</b>. ${up ? '위로 올린 공기 덩어리가 주위보다 차가웠기' : '아래로 내린 공기 덩어리가 주위보다 따뜻했기'} 때문이에요. (기온 감률 ${g} &lt; ${ref})`);
    } else if (out === 'away') {
      const edge = st.run.frames[st.idx].note === 'top' ? ' 표시 범위 위쪽 끝(4 km)에서 멈췄지만 실제로는 더 올라가요.' : '';
      ui.ro.guide('불안정', 'up', `원래 위치에서 멀어졌어요 → <b>불안정</b>. ${up ? '위로 올린 공기 덩어리가 주위보다 따뜻해 계속 올라갔어요' : '아래로 내린 공기 덩어리가 주위보다 차가워 계속 내려갔어요'}. (기온 감률 ${g} &gt; ${ref})${edge}`);
    } else if (out === 'stay') {
      ui.ro.guide('중립', 'neutral', `놓은 자리에 그대로 머물러요 → <b>중립</b>. 어느 높이에서나 공기 덩어리와 주위 기온이 같아요. (기온 감률 ${g} = ${ref})`);
    } else if (out === 'origin') {
      ui.ro.guide('정지', 'neutral', '원래 위치에서는 주위와 기온이 같아 움직이지 않아요. 먼저 <b>강제 상승</b>이나 <b>강제 하강</b>을 눌러 보세요.');
    } else if (atOrigin && !rel) {
      ui.ro.guide('준비', 'neutral', `원래 위치(${fZ(Z0)} km)에서는 공기 덩어리와 주위 기온이 ${fT(TZ0)} ℃로 같아요. <b>강제 상승</b>이나 <b>강제 하강</b>으로 움직인 뒤 놓아 보세요.`);
    } else {
      ui.ro.guide('정지', 'neutral', vs);
    }
  }
  function renderBadge(c) {
    const op = { stable: '&lt;', unstable: '&gt;', neutral: '=' }[c];
    const html = `${st.sat ? '포화' : '불포화'} 공기: ${CLS[c]} (γ ${op} ${lapse()})`;
    if (ui.badge.innerHTML !== html) ui.badge.innerHTML = html;
    ui.badge.className = 'stab-badge st-' + c;
    ui.badge.title = `기온 감률 ${fmt(st.gamma, 1)} ℃/km를 ${satName(st.sat)} 단열 감률 ${lapse()} ℃/km와 비교`;
    const zk = zone();
    if (ui.zoneBadge.textContent !== ZONE[zk].t) ui.zoneBadge.textContent = ZONE[zk].t;
    ui.zoneBadge.className = 'stab-badge ' + zk;
  }
  function renderControls() {
    if (!ui.ctrl || !st.run) return;
    const r = st.run, fr = cur();
    const mv = active();
    ui.ctrl.setPlay(!st.paused && mv, mv ? '▶ 재생' : '▶ 강제 상승');
    const keys = [...new Set(r.keys.concat([r.frames.length - 1]))];
    ui.ctrl.setStep(keys.some(k => k < st.idx), keys.some(k => k > st.idx));
    ui.rel.disabled = fr.phase === 'free';
    ui.relHint.classList.toggle('show', fr.phase !== 'free' && Math.abs(fr.z - Z0) > 0.005);
    ui.tl.max = Math.max(0, r.frames.length - 1);
    if (document.activeElement !== ui.tl) ui.tl.value = st.idx;
    ui.tl.style.setProperty('--fill', (r.frames.length > 1 ? st.idx / (r.frames.length - 1) * 100 : 0) + '%');
  }

  return {
    L, init, layout, tick, render,
    pause() { pause(); },
    onShow() { layout(); },
    hasFrame: () => !!(sh && sh.frame),
    api: { force, liftTo, release, play, step, seek, resetMotion, resetDefaults, setCond, saveCompare, st, Z0, cur: () => cur() }
  };
})();
