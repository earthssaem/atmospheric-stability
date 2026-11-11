/**
 * tab-lcl.js — 1. 응결 고도
 * 공기가 상승할 때 기온(10 ℃/km)과 이슬점(2 ℃/km)이 다르게 낮아져 같아지는 높이 = 상승 응결 고도.
 * 모형: 강수 없이 응결·증발만 일어나는 닫힌 공기 덩어리 (같은 높이로 돌아오면 같은 상태)
 */
'use strict';

const LclLab = (function () {
  const ZMAX = 5;
  const SPEED = 0.3;         // 재생 속도 (km/초, 화면 표현용)
  const DEF = { T0: 20, Td0: 12 };
  const L = Object.assign(baseLab(), { id: 'lcl' });
  const st = {
    T0: DEF.T0, Td0: DEF.Td0, z: 0, dir: 0,
    playing: false, guided: true, revealed: false,
    showLCL: true, showPath: false, cmp: null, notice: ''
  };
  L.st = st;
  let sh, ui = {}, E = {}, ax = null, xr = null, ch = null;

  const H = () => Physics.lcl(st.T0, st.Td0);
  const lclVisible = () => (st.guided ? st.revealed : st.showLCL);
  const pathVisible = () => st.showPath;

  /* ───────── 화면 만들기 ───────── */
  function init(root) {
    sh = makeShell(root, {
      ratio: '40%', zMax: ZMAX,
      sceneTitle: '대기 단면', graphTitle: '높이–온도 그래프',
      sceneLabel: '공기 덩어리가 상승하는 대기 단면', graphLabel: '높이에 따른 기온과 이슬점 그래프'
    });
    // 시작 조건
    ui.mode = Seg([{ value: true, label: '안내 실험' }, { value: false, label: '자유 탐구' }], true, v => setMode(v), { label: '실험 방식' });
    ui.T0 = NumField({ label: '지표 기온 T<sub>0</sub>', min: 0, max: 40, step: 0.1, sliderStep: 0.5, decimals: 1, value: st.T0, unit: '℃', onCommit: v => setCond(v, null) });
    ui.Td0 = NumField({ label: '지표 이슬점 Td<sub>0</sub>', min: 0, max: st.T0, step: 0.1, sliderStep: 0.5, decimals: 1, value: st.Td0, unit: '℃', onCommit: v => setCond(null, v) });
    ui.T0.range.style.setProperty('--c', 'var(--temp)');
    ui.Td0.range.style.setProperty('--c', 'var(--dew)');
    const tail = h('div', { class: 'cond-tail' });
    ui.cmp = CompareUI(tail, saveCompare, () => { st.cmp = null; afterCompareChange(); });
    sh.cond.append(ui.mode.el, h('div', { class: 'cond-group' }, ui.T0.el, ui.Td0.el), tail);

    // 그래프 머리: 범례 + 표시 선택
    ui.tLCL = Toggle('응결 고도 표시', st.showLCL, v => { st.showLCL = v; render(); });
    ui.tPath = Toggle('예상 경로', st.showPath, v => { st.showPath = v; render(); });
    ui.legend = h('span', { class: 'legend' });
    sh.graphLegend.append(ui.legend);
    sh.sceneHead.append(h('span', { style: { marginLeft: 'auto' } }, ui.tLCL.el));
    sh.graphHead.insertBefore(ui.tPath.el, sh.graphLegend);

    // 현재 수치
    ui.ro = Readouts(sh.ro, [
      { key: 'z', label: '높이' },
      { key: 'T', label: '<i style="border-color:var(--temp)"></i>기온 T', cls: 'temp' },
      { key: 'Td', label: '<i class="dash" style="border-color:var(--dew)"></i>이슬점 Td', cls: 'dew' },
      { key: 'gap', label: '기온 − 이슬점' },
      { key: 'rh', label: '상대 습도' }
    ]);
    // 조작부
    ui.ctrl = ControlBar(sh.ctrl, { play, prev: () => step(-1), next: () => step(1), reset: resetMotion, defaults: resetDefaults });
    ui.zf = NumField({ label: '높이', min: 0, max: ZMAX, step: 0.01, decimals: 2, value: 0, unit: 'km', cls: 'compact', onCommit: v => { pause(); setZ(v); } });
    ui.goLCL = Btn('응결 고도로 이동', 'accent', () => { pause(); setZ(H()); });
    ui.ctrl.slot.append(ui.zf.el, ui.goLCL);

    // 펼쳐 보기
    buildMore();
    buildChallenges();
    renderLegend();
    render();
  }

  function buildMore() {
    const m = sh.more;
    m.appendChild(Fold('관찰 안내', h('div', { html: `
      <ul><li><b style="color:var(--temp)">기온(빨간 점)</b>과 <b style="color:var(--dew)">이슬점(파란 점)</b> 사이가 어떻게 바뀌나요?</li>
      <li>두 점이 만나는 높이와 장면의 <b>구름 바닥</b>이 같은 가로선 위에 있나요?</li></ul>` }), true));
    ui.foldLCL = Fold('상승 응결 고도 구하기', h('div', { html: `
      <p>불포화 공기는 1 km 오를 때마다 기온이 10 ℃, 이슬점이 2 ℃ 낮아져 두 값의 차이가 <b>8 ℃씩</b> 줄어요. 응결 고도 위에서는 둘 다 5 ℃/km씩 낮아져요.</p>
      <div class="eq">(T<sub>0</sub> − 10H) = (Td<sub>0</sub> − 2H) &nbsp;→&nbsp; <b>H(km) = (T<sub>0</sub> − Td<sub>0</sub>) / 8</b></div>
      <p id="lcl-calc"></p>
      <p class="note">교과서 그림 Ⅲ-12</p>` }), false);
    ui.foldLCL.addEventListener('toggle', () => {
      if (ui.foldLCL.open && st.guided && !st.revealed) { ui.foldLCL.open = false; ui.ro.guide('', '', '먼저 공기를 올려 기온과 이슬점이 같아지는 높이를 찾아보세요. 그 높이에 닿으면 이 설명을 볼 수 있어요.'); }
    });
    m.appendChild(ui.foldLCL);
    // 더 해 보기: 실험 2개 + 도전 1개
    const exps = [
      { t: '이슬점을 높이면 구름 바닥은?', d: '기온 20 ℃ · 이슬점 12 ℃ → 16 ℃', run: () => setupExperiment({ T0: 20, Td0: 12 }, { T0: 20, Td0: 16 }, '이슬점 12 ℃ 공기를 비교용으로 남겼어요. 이슬점 16 ℃ 공기를 올려 구름 바닥을 비교해 보세요.') },
      { t: '기온을 높이면 구름 바닥은?', d: '이슬점 12 ℃ · 기온 20 ℃ → 24 ℃', run: () => setupExperiment({ T0: 20, Td0: 12 }, { T0: 24, Td0: 12 }, '기온 20 ℃ 공기를 비교용으로 남겼어요. 기온 24 ℃ 공기를 올려 구름 바닥을 비교해 보세요.') }
    ];
    ui.moreBox = h('div', null, expList(exps));
    m.appendChild(Fold('더 해 보기 <span class="tag">선택</span>', ui.moreBox, false));
  }

  function buildChallenges() {
    ch = Challenges(ui.moreBox, L, [
      {
        id: 'base2', title: '구름 바닥을 2.00 km로 맞추기',
        goal: '응결 고도가 정확히 <b>2.00 km</b>가 되도록 조건을 정하고, 공기를 올려 구름 바닥을 확인하세요.',
        hints: ['구름 바닥은 기온과 이슬점이 같아지는 높이예요. 지표에서 두 값의 차이를 보세요.',
          '올라갈 때 기온은 10 ℃/km, 이슬점은 2 ℃/km씩 낮아져 차이가 1 km마다 8 ℃씩 줄어요.',
          'H = (T₀ − Td₀) / 8 → 2.00 km가 되려면 T₀ − Td₀ = 16 ℃'],
        check: (lab, since) => lab.since(since, 'reachLCL').some(e => Math.abs(e.H - 2) < 1e-6),
        success: '구름 바닥 2.00 km! 기온과 이슬점의 차이가 16 ℃이면 2 km 올라가야 두 값이 같아져요.'
      }
    ]);
  }

  /* ───────── 상태 바꾸기 ───────── */
  function setMode(guided) {
    st.guided = guided;
    pause();
    if (guided) { st.showPath = false; ui.tPath.set(false); }
    else { st.showLCL = true; st.showPath = true; ui.tLCL.set(true); ui.tPath.set(true); }
    resetMotion();
  }
  function setCond(T0, Td0) {
    st.notice = '';
    if (T0 != null) {
      st.T0 = T0;
      ui.Td0.setMax(T0);
      if (st.Td0 > T0) { st.Td0 = T0; ui.Td0.set(T0); st.notice = `이슬점이 기온보다 높을 수 없어 이슬점을 ${fT(T0)} ℃로 맞췄어요.`; ui.Td0.note(`기온에 맞춰 ${fT(T0)} ℃로 낮췄어요`); }
    }
    if (Td0 != null) st.Td0 = Math.min(Td0, st.T0);
    ui.T0.set(st.T0); ui.Td0.setMax(st.T0); ui.Td0.set(st.Td0);
    if (st.guided) { st.guided = false; ui.mode.set(false); st.showLCL = true; st.showPath = true; ui.tLCL.set(true); ui.tPath.set(true); }
    conditionsChanged();
  }
  function conditionsChanged() {
    pause();
    st.z = 0; st.dir = 0; st.revealed = !st.guided;
    L.emit('cond', { T0: st.T0, Td0: st.Td0 });
    rebuildGraph();
    render();
  }
  function setupExperiment(base, cur, msg) {
    if (st.guided) { st.guided = false; ui.mode.set(false); }
    st.showLCL = true; st.showPath = true; ui.tLCL.set(true); ui.tPath.set(true);
    st.cmp = base ? { T0: base.T0, Td0: base.Td0, zRec: ZMAX, label: `${fT(base.T0)} ℃ · ${fT(base.Td0)} ℃` } : null;
    st.T0 = cur.T0; st.Td0 = cur.Td0;
    ui.T0.set(cur.T0); ui.Td0.setMax(cur.T0); ui.Td0.set(cur.Td0);
    afterCompareChange(true);
    conditionsChanged();
    st.notice = msg;
    render();
    sh.panel.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'center' });
  }
  function saveCompare() {
    st.cmp = { T0: st.T0, Td0: st.Td0, zRec: st.z, label: `${fT(st.T0)} ℃ · ${fT(st.Td0)} ℃` };
    L.emit('compare', {});
    afterCompareChange();
  }
  function afterCompareChange(skipRender) {
    ui.cmp.show(st.cmp ? st.cmp.label : '');
    renderLegend();
    rebuildGraph();
    if (!skipRender) render();
  }
  function resetMotion() { pause(); st.z = 0; st.dir = 0; st.notice = ''; if (st.guided) st.revealed = false; L.emit('reset'); render(); }
  function resetDefaults() {
    st.T0 = DEF.T0; st.Td0 = DEF.Td0; ui.T0.set(DEF.T0); ui.Td0.setMax(DEF.T0); ui.Td0.set(DEF.Td0);
    st.guided = true; ui.mode.set(true); st.showPath = false; ui.tPath.set(false); st.showLCL = true; ui.tLCL.set(true);
    st.notice = '';
    conditionsChanged();
  }

  function setZ(z, opts) {
    z = clamp(z, 0, ZMAX);
    const Hn = H();
    if (opts && opts.snap && Math.abs(z - Hn) < 0.02) z = Hn;      // 응결 고도 가까이에서는 정확히 맞춤
    const prev = st.z;
    if (Math.abs(z - prev) < 1e-12) { render(); return; }
    st.dir = z > prev ? 1 : -1;
    st.z = z;
    st.notice = '';
    if (prev < Hn - 1e-9 && z >= Hn - 1e-9) { st.revealed = true; L.emit('reachLCL', { H: Hn, T0: st.T0, Td0: st.Td0 }); }
    if (Hn <= 1e-9 && z > 0) { if (!st.revealed) L.emit('reachLCL', { H: Hn, T0: st.T0, Td0: st.Td0 }); st.revealed = true; }
    L.seq += 1; L.lastMove = { seq: L.seq, z };
    render();
  }

  /* ───────── 재생 · 단계 ───────── */
  function stages() {
    const Hn = H();
    const arr = [0, Hn, Math.min(ZMAX, Hn + 1), ZMAX].filter(v => v <= ZMAX + 1e-9);
    return arr.filter((v, i) => arr.findIndex(w => Math.abs(w - v) < 1e-9) === i);
  }
  function play() {
    if (st.playing) { pause(); return; }
    if (st.z >= ZMAX - 1e-9) { st.z = 0; st.dir = 0; if (st.guided) st.revealed = false; }
    st.playing = true; render();
  }
  function pause() { if (st.playing) { st.playing = false; render(); } }
  function step(d) {
    pause();
    const S = stages();
    if (d > 0) { const n = S.find(v => v > st.z + 1e-9); if (n != null) setZ(n); }
    else { const p = [...S].reverse().find(v => v < st.z - 1e-9); if (p != null) setZ(p); }
  }
  function tick(dt) {
    if (!st.playing) return;
    const Hn = H();
    const target = st.guided && st.z < Hn - 1e-9 ? Hn : ZMAX;   // 안내 실험은 응결 고도에서 정확히 멈춤
    const nz = Math.min(target, st.z + SPEED * dt);
    if (nz >= target - 1e-12) { st.playing = false; setZ(target); }
    else setZ(nz);
  }

  /* ───────── 그리기 ───────── */
  function xRange() {
    const vals = [st.T0, st.Td0, Physics.parcel(st.T0, st.Td0, ZMAX).T];
    if (st.cmp) vals.push(st.cmp.T0, st.cmp.Td0, Physics.parcel(st.cmp.T0, st.cmp.Td0, ZMAX).T);
    return niceRange(Math.min(...vals), Math.max(...vals), 25);
  }
  function layout() {
    const f = layoutShell(sh);
    if (!f) return;
    buildScene(f);
    rebuildGraph();
    render();
  }
  function buildScene(f) {
    const svg = sh.sceneSvg;
    clear(svg);
    const sky = skyGradient(svg, 'lclsky');
    const y0 = f.yOf(0);
    s('rect', { x: 0, y: 0, width: f.sceneW, height: y0, fill: sky }, svg);
    for (let z = 1; z <= ZMAX; z++) s('line', { x1: 0, x2: f.sceneW, y1: f.yOf(z), y2: f.yOf(z), stroke: '#fff', 'stroke-width': 1.5, opacity: 0.8 }, svg);
    s('path', { d: `M0 ${y0} L0 ${y0 - 10} Q${f.sceneW * 0.25} ${y0 - 22} ${f.sceneW * 0.5} ${y0 - 10} T${f.sceneW} ${y0 - 14} L${f.sceneW} ${y0} Z`, fill: '#C9D8C3' }, svg);
    s('rect', { x: 0, y: y0, width: f.sceneW, height: f.H - y0, fill: '#B9C9AE' }, svg);
    txt({ x: 12, y: y0 + 24, class: 'lb-sm', fill: '#3D4A3A' }, '지표 (0 km)', svg);
    if (f.stacked) for (let z = 0; z <= ZMAX; z++) txt({ x: f.sceneW - 8, y: f.yOf(z) - 5, 'text-anchor': 'end', class: 'tk' }, z + ' km', svg);
    E.cloud = s('g', null, svg); E.cloudKey = null;
    E.sLCL = s('g', null, svg);
    E.sLCLline = s('line', { 'data-role': 'lcl', x1: 0, x2: f.sceneW, stroke: 'var(--lcl)', 'stroke-width': 2.5, 'stroke-dasharray': '12 5 3 5' }, E.sLCL);
    E.sLCLtext = txt({ x: 10, class: 'lb halo-sky', fill: '#7A4E10' }, '', E.sLCL);
    E.trail = s('line', { stroke: '#5F6E7B', 'stroke-width': 2, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round', opacity: 0.8 }, svg);
    E.sNow = s('line', { 'data-role': 'now', x1: 0, x2: f.sceneW, stroke: 'var(--ink)', 'stroke-width': 1.2, opacity: 0.45 }, svg);
    E.sNowTag = s('g', null, svg);
    E.sNowTagBg = s('rect', { rx: 6, height: 24, fill: '#fff', stroke: '#C9C4B8' }, E.sNowTag);
    E.sNowTagT = txt({ class: 'lb-sm tnum', 'text-anchor': 'end' }, '', E.sNowTag);
    E.parcel = makeParcel(svg, { drag: true, seed: 3 });
    E.px = f.sceneW * 0.46;
    // 끌기 + 키보드
    const pg = E.parcel.g;
    sa(pg, { tabindex: 0, role: 'slider', 'aria-label': '공기 덩어리 높이', 'aria-valuemin': 0, 'aria-valuemax': ZMAX });
    dragZ(pg, svg, f);
    pg.addEventListener('keydown', e => {
      const k = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.5, PageDown: -0.5 }[e.key];
      if (k != null) { e.preventDefault(); pause(); setZ(Math.round((st.z + k) * 100) / 100, { snap: true }); }
      if (e.key === 'Home') { e.preventDefault(); pause(); setZ(0); }
      if (e.key === 'End') { e.preventDefault(); pause(); setZ(ZMAX); }
    });
  }
  function dragZ(target, svg, f) {
    let id = null;
    target.addEventListener('pointerdown', ev => { id = ev.pointerId; target.setPointerCapture(id); pause(); ev.preventDefault(); });
    target.addEventListener('pointermove', ev => {
      if (id !== ev.pointerId) return;
      const p = svgPoint(svg, ev);
      setZ(Math.round(clamp(sh.frame.hOf(p.y), 0, ZMAX) * 100) / 100, { snap: true });
    });
    const end = ev => { if (id === ev.pointerId) id = null; };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => target.addEventListener(t, end));
  }
  function rebuildGraph() {
    const f = sh.frame;
    if (!f) return;
    xr = xRange();
    const svg = sh.graphSvg;
    clear(svg);
    const g = s('g', null, svg);
    ax = drawAxes(g, f, xr);
    // 참고용 건조 단열선 (옅게)
    for (let t0 = xr.min; t0 <= xr.max + 50; t0 += 10) s('line', { x1: ax.gx(t0), y1: f.yOf(0), x2: ax.gx(t0 - 10 * ZMAX), y2: f.yOf(ZMAX), stroke: '#C9C3B6', 'stroke-width': 1, 'stroke-dasharray': '3 5' }, ax.bg);
    const t0r = Math.ceil((xr.min + 48) / 10) * 10;
    if (ax.gx(t0r - 46) < ax.X1 - 130) txt({ x: ax.gx(t0r - 46) + 6, y: f.yOf(4.6) + 4, class: 'lb-sm halo', fill: '#9C968A' }, '건조 단열선(참고)', ax.over);
    const p = ax.plot;
    E.cmpT = s('path', { fill: 'none', stroke: 'var(--temp)', 'stroke-width': 2.5, opacity: 0.32 }, p);
    E.cmpTf = s('path', { fill: 'none', stroke: 'var(--temp)', 'stroke-width': 2, opacity: 0.25, 'stroke-dasharray': '2 5' }, p);
    E.cmpD = s('path', { fill: 'none', stroke: 'var(--dew)', 'stroke-width': 2.5, opacity: 0.32, 'stroke-dasharray': '8 6' }, p);
    E.cmpDf = s('path', { fill: 'none', stroke: 'var(--dew)', 'stroke-width': 2, opacity: 0.25, 'stroke-dasharray': '2 5' }, p);
    E.cmpLCL = s('line', { x1: ax.X0, x2: ax.X1, stroke: 'var(--lcl)', 'stroke-width': 1.5, opacity: 0.4, 'stroke-dasharray': '12 5 3 5' }, p);
    E.ghostT = s('path', { fill: 'none', stroke: 'var(--temp)', 'stroke-width': 2, opacity: 0.4, 'stroke-dasharray': '1 6', 'stroke-linecap': 'round' }, p);
    E.ghostD = s('path', { fill: 'none', stroke: 'var(--dew)', 'stroke-width': 2, opacity: 0.4, 'stroke-dasharray': '1 6', 'stroke-linecap': 'round' }, p);
    E.gLCL = s('line', { 'data-role': 'lcl', x1: ax.X0, x2: ax.X1, stroke: 'var(--lcl)', 'stroke-width': 2.5, 'stroke-dasharray': '12 5 3 5' }, p);
    E.gNow = s('line', { 'data-role': 'now', x1: ax.X0, x2: ax.X1, stroke: 'var(--ink)', 'stroke-width': 1.2, opacity: 0.45 }, p);
    E.T = s('path', { fill: 'none', stroke: 'var(--temp)', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, p);
    E.D = s('path', { fill: 'none', stroke: 'var(--dew)', 'stroke-width': 3, 'stroke-dasharray': '9 6', 'stroke-linejoin': 'round' }, p);
    E.gap = s('line', { stroke: '#7E8891', 'stroke-width': 2 }, p);
    E.cmpPtT = s('circle', { r: 5, fill: '#fff', stroke: 'var(--temp)', 'stroke-width': 2, opacity: 0.6 }, p);
    E.cmpPtD = s('rect', { width: 8, height: 8, fill: '#fff', stroke: 'var(--dew)', 'stroke-width': 2, opacity: 0.6 }, p);
    E.ptD = s('path', { fill: 'var(--dew)', stroke: '#fff', 'stroke-width': 1.5 }, p);
    E.ptT = s('circle', { r: 7, fill: 'var(--temp)', stroke: '#fff', 'stroke-width': 2 }, p);
    E.ptBoth = s('g', null, p);
    s('circle', { r: 9, fill: '#fff', stroke: 'var(--temp)', 'stroke-width': 3 }, E.ptBoth);
    s('path', { d: 'M0 -5 L5 0 L0 5 L-5 0 Z', fill: 'var(--dew)' }, E.ptBoth);
    const o = ax.over;
    E.gapT = txt({ 'text-anchor': 'middle', class: 'lb halo', fill: '#4E5D6A' }, '', o);
    E.lblT = txt({ class: 'lb halo', fill: 'var(--temp)' }, '', o);
    E.lblD = txt({ class: 'lb halo', fill: 'var(--dew)', 'text-anchor': 'end' }, '', o);
    E.lblSame = txt({ class: 'lb halo', fill: 'var(--ink)' }, '', o);
    E.lblOverlap = txt({ class: 'lb-sm halo', fill: '#4E5D6A', 'text-anchor': 'end' }, '기온 = 이슬점', o);
    E.gLCLt = txt({ 'text-anchor': 'start', class: 'lb halo', fill: '#7A4E10' }, '', o);
    E.lineT = txt({ class: 'lb-sm halo', fill: 'var(--temp)' }, '기온', o);
    E.lineD = txt({ class: 'lb-sm halo', fill: 'var(--dew)', 'text-anchor': 'end' }, '이슬점', o);
    E.edge = s('g', null, o);
    // 그래프에서 높이 고르기 (끌기 대안)
    const hit = s('rect', { x: ax.X0, y: ax.Y1, width: ax.X1 - ax.X0, height: ax.Y0 - ax.Y1, fill: 'transparent', class: 'drag' }, svg);
    dragZ(hit, svg, f);
  }
  function renderLegend() {
    ui.legend.innerHTML = legendHTML('var(--temp)', '', '기온') + legendHTML('var(--dew)', 'dash', '이슬점') +
      (st.cmp ? legendHTML('#E3A99F', 'faint', '비교(옅은 선)') : '');
  }

  function render() {
    if (!sh || !sh.frame || !ax) { renderControls(); return; }
    const f = sh.frame, Hn = H();
    const p = Physics.parcel(st.T0, st.Td0, st.z);
    const sat = p.saturated;
    const showL = lclVisible();
    const yz = f.yOf(st.z), yH = f.yOf(Hn);

    /* 장면 */
    const r = 16 + 3.2 * st.z;    // 정성적 팽창
    E.parcel.set(E.px, yz, r, sat && st.z > Hn + 1e-9 ? clamp((st.z - Hn) / 1.2, 0.3, 1) : 0);
    sa(E.parcel.g, { 'aria-valuenow': st.z.toFixed(2), 'aria-valuetext': `높이 ${fZ(st.z)} km, 기온 ${fT(p.T)} ℃, 이슬점 ${fT(p.Td)} ℃` });
    sa(E.trail, { x1: E.px, x2: E.px, y1: f.yOf(0), y2: yz });
    sa(E.sNow, { y1: yz, y2: yz });
    E.sNowTagT.textContent = `${fZ(st.z)} km`;
    const tw = 70;
    sa(E.sNowTagBg, { x: f.sceneW - tw - 6, y: yz - 12, width: tw });
    sa(E.sNowTagT, { x: f.sceneW - 12, y: yz + 5 });
    // 공기 덩어리 속 응결: 구름 바닥 = 응결 고도 (덩어리가 응결 고도 위에 있을 때만)
    const ck = sat && st.z > 1e-9 ? `${Math.round(yz)}|${Math.round(yH)}|${Math.round(r)}` : '';
    if (ck !== E.cloudKey) {
      E.cloudKey = ck;
      clear(E.cloud);
      if (ck) puffCloud(E.cloud, E.px, yH + 1, Math.min(yz - r * 1.1, yH - 14), r * 1.35, 9, 0.95);
    }
    sa(E.sLCL, { opacity: showL ? 1 : 0 });
    sa(E.sLCLline, { y1: yH, y2: yH });
    sa(E.sLCLtext, { y: yH - 8 });
    E.sLCLtext.textContent = st.z >= Hn - 1e-9 ? '구름 바닥 = 상승 응결 고도' : '상승 응결 고도';

    /* 그래프 */
    const hb = Math.min(st.z, Hn);
    const tH = st.T0 - 10 * Hn;
    sa(E.T, { d: st.z > Hn ? pathD([[st.T0, 0], [tH, Hn], [p.T, st.z]], ax, f) : pathD([[st.T0, 0], [p.T, st.z]], ax, f) });
    sa(E.D, { d: st.z > Hn ? pathD([[st.Td0, 0], [tH, Hn], [p.T, st.z]], ax, f) : pathD([[st.Td0, 0], [p.Td, st.z]], ax, f) });
    if (pathVisible()) {
      sa(E.ghostT, { d: pathD([[st.T0, 0], [tH, Hn], [Physics.parcel(st.T0, st.Td0, ZMAX).T, ZMAX]], ax, f), opacity: 0.45 });
      sa(E.ghostD, { d: pathD([[st.Td0, 0], [tH, Hn], [Physics.parcel(st.T0, st.Td0, ZMAX).T, ZMAX]], ax, f), opacity: 0.45 });
    } else { sa(E.ghostT, { opacity: 0 }); sa(E.ghostD, { opacity: 0 }); }
    sa(E.gLCL, { y1: yH, y2: yH, opacity: showL ? 1 : 0 });
    sa(E.gLCLt, { x: ax.X0 + 8, y: yH - 8, opacity: showL ? 1 : 0 });
    E.gLCLt.textContent = `상승 응결 고도 ${fZ(Hn)} km`;
    sa(E.gNow, { y1: yz, y2: yz });
    const xT = ax.gx(p.T), xD = ax.gx(p.Td);
    const same = sat;
    sa(E.ptT, { cx: xT, cy: yz, opacity: same ? 0 : 1 });
    sa(E.ptD, { d: `M${xD} ${yz - 7} L${xD + 7} ${yz} L${xD} ${yz + 7} L${xD - 7} ${yz} Z`, opacity: same ? 0 : 1 });
    sa(E.ptBoth, { transform: `translate(${xT} ${yz})`, opacity: same ? 1 : 0 });
    sa(E.gap, { x1: xD + 8, x2: xT - 8, y1: yz, y2: yz, opacity: !same && xT - xD > 24 ? 1 : 0 });
    const [sT, sD] = fPair(p.T, p.Td);
    const gapV = p.T - p.Td;
    sa(E.gapT, { x: (xT + xD) / 2, y: yz - 10, opacity: !same && xT - xD > 50 ? 1 : 0 });
    E.gapT.textContent = `차 ${fPair(gapV, 0)[0]} ℃`;
    const ly = clamp(yz + 22, ax.Y1 + 14, ax.Y0 - 6);
    sa(E.lblT, { x: xT + 12, y: same ? -99 : ly, opacity: same ? 0 : 1 }); E.lblT.textContent = `${sT} ℃`;
    sa(E.lblD, { x: xD - 12, y: same ? -99 : ly, opacity: same ? 0 : 1 }); E.lblD.textContent = `${sD} ℃`;
    E.lblSame.textContent = `기온 = 이슬점 ${fT(p.T)} ℃`;
    const flip = xT + 14 + 150 > ax.X1;
    sa(E.lblSame, { x: flip ? xT - 14 : xT + 14, 'text-anchor': flip ? 'end' : 'start', y: yz - 10, opacity: same ? 1 : 0 });
    // 겹친 구간 표시
    const ov = st.z - Hn;
    if (ov > 0.35) {
      const zm = Hn + ov * 0.55;
      sa(E.lblOverlap, { x: ax.gx(Physics.parcel(st.T0, st.Td0, zm).T) - 12, y: f.yOf(zm), opacity: 1 });
      E.lblOverlap.textContent = '기온 = 이슬점 (함께 5 ℃/km)';
    } else sa(E.lblOverlap, { opacity: 0 });
    // 선 이름 (지표 가까이)
    const zl = Math.min(0.35, Math.max(0.15, Hn * 0.4));
    const showNames = st.z > zl + 0.05;
    sa(E.lineT, { x: ax.gx(st.T0 - 10 * Math.min(zl, Hn)) + 8, y: f.yOf(zl) + 4, opacity: showNames && Hn > 0.2 ? 1 : 0 });
    sa(E.lineD, { x: ax.gx(st.Td0 - 2 * Math.min(zl, Hn)) - 8, y: f.yOf(zl) + 4, opacity: showNames && Hn > 0.2 ? 1 : 0 });
    // 비교
    let cmpSubT = '', cmpSubD = '', cmpSubGap = '';
    if (st.cmp) {
      const c = st.cmp, Hc = Physics.lcl(c.T0, c.Td0), tHc = c.T0 - 10 * Hc, top = Physics.parcel(c.T0, c.Td0, ZMAX).T;
      const full = [[c.T0, 0], [tHc, Hc], [top, ZMAX]], fullD = [[c.Td0, 0], [tHc, Hc], [top, ZMAX]];
      const zr = clamp(c.zRec, 0, ZMAX);
      const cut = (arr, zc) => { const out = [arr[0]]; for (let i = 1; i < arr.length; i++) { if (arr[i][1] <= zc) out.push(arr[i]); else { const a = arr[i - 1], b = arr[i]; const t = (zc - a[1]) / (b[1] - a[1]); out.push([lerp(a[0], b[0], t), zc]); break; } } return out; };
      sa(E.cmpT, { d: zr > 0 ? pathD(cut(full, zr), ax, f) : '' });
      sa(E.cmpD, { d: zr > 0 ? pathD(cut(fullD, zr), ax, f) : '' });
      sa(E.cmpTf, { d: pathD(full, ax, f) });
      sa(E.cmpDf, { d: pathD(fullD, ax, f) });
      sa(E.cmpLCL, { y1: f.yOf(Hc), y2: f.yOf(Hc), opacity: 0.45 });
      const pc = Physics.parcel(c.T0, c.Td0, st.z);
      sa(E.cmpPtT, { cx: ax.gx(pc.T), cy: yz, opacity: 0.8 });
      sa(E.cmpPtD, { x: ax.gx(pc.Td) - 4, y: yz - 4, opacity: pc.saturated ? 0 : 0.8 });
      const [a1, b1] = fPair(pc.T, p.T);
      cmpSubT = `비교 ${a1} ℃`; void b1;
      cmpSubD = `비교 ${fPair(pc.Td, p.Td)[0]} ℃`;
      cmpSubGap = `비교 ${fT(pc.T - pc.Td)} ℃`;
    } else {
      ['cmpT', 'cmpD', 'cmpTf', 'cmpDf'].forEach(k => sa(E[k], { d: '' }));
      sa(E.cmpLCL, { opacity: 0 }); sa(E.cmpPtT, { opacity: 0 }); sa(E.cmpPtD, { opacity: 0 });
    }
    clear(E.edge);
    edgeMarker(E.edge, ax, f, p.T, st.z, 'var(--temp)');
    if (!same) edgeMarker(E.edge, ax, f, p.Td, st.z, 'var(--dew)');

    /* 수치 */
    const rh = Physics.relHumidity(p.T, p.Td);
    ui.ro.set('z', `${fZ(st.z)}<small>km</small>`, showL ? `응결 고도 ${fZ(Hn)} km` : '');
    ui.ro.set('T', `${sT}<small>℃</small>`, cmpSubT);
    ui.ro.set('Td', `${sD}<small>℃</small>`, cmpSubD);
    ui.ro.set('gap', `${fPair(gapV, 0)[0]}<small>℃</small>`, cmpSubGap);
    ui.ro.set('rh', `${fmt(rh, 0)}<small>%</small>`, sat ? '포화' : '불포화');
    renderGuide(p, Hn);
    renderControls();
    const calc = document.getElementById('lcl-calc');
    if (calc) calc.innerHTML = `지금 조건: H = (${fT(st.T0)} − ${fT(st.Td0)}) / 8 = <b>${fZ(Hn)} km</b>`;
    if (ch) ch.check();
  }
  function renderGuide(p, Hn) {
    let state, cls, msg;
    const atH = Math.abs(st.z - Hn) < 1e-9;
    if (st.notice) { ui.ro.guide('안내', 'neutral', st.notice); return; }
    if (st.z >= ZMAX - 1e-9) { ui.ro.guide('표시 상한', 'neutral', `표시 범위(${ZMAX} km)에 도달했어요. ↺ 움직임 처음으로 또는 ◀ 이전 단계로 돌아가 보세요.`); return; }
    if (p.saturated) {
      state = '포화'; cls = 'sat';
      if (st.z <= 1e-9) msg = '처음부터 기온과 이슬점이 같아요(상대 습도 100 %). 올리면 곧바로 응결이 시작돼요.';
      else if (atH) msg = st.guided ? '기온과 이슬점이 같아져 응결이 시작돼요. 구름 바닥과 그래프의 교점이 같은 높이예요. <b>▶ 계속 올리기</b>로 이어서 보세요.' : '기온과 이슬점이 같아져 응결이 시작돼요.';
      else if (st.dir < 0) msg = '내려가는 동안 물방울이 증발하며 기온과 이슬점이 함께 5 ℃/km씩 높아져요.';
      else msg = '응결열이 방출되어 기온이 더 완만하게 내려가요. 기온과 이슬점이 함께 5 ℃/km씩 낮아져요.';
    } else {
      state = '불포화'; cls = 'unsat';
      if (st.z <= 1e-9) msg = `지표에서 기온과 이슬점의 차이는 <b>${fT(st.T0 - st.Td0)} ℃</b>예요. <b>▶ 재생</b>으로 공기를 올려 보세요.`;
      else if (st.dir < 0) msg = '공기가 내려가며 기온(+10 ℃/km)이 이슬점(+2 ℃/km)보다 빨리 높아져 차이가 커져요.';
      else msg = '공기가 상승하며 기온과 이슬점의 차이가 줄어들어요. (기온 −10 ℃/km, 이슬점 −2 ℃/km)';
    }
    ui.ro.guide(state, cls, msg);
  }
  function renderControls() {
    if (!ui.ctrl) return;
    const Hn = H();
    const atTop = st.z >= ZMAX - 1e-9;
    const label = atTop ? '↺ 처음부터 재생' : (st.guided && Math.abs(st.z - Hn) < 1e-9 && st.z > 0 ? '▶ 계속 올리기' : '▶ 재생');
    ui.ctrl.setPlay(st.playing, label);
    const S = stages();
    ui.ctrl.setStep(S.some(v => v < st.z - 1e-9), S.some(v => v > st.z + 1e-9));
    ui.zf.set(st.z);
    ui.goLCL.hidden = st.guided && !st.revealed;
    ui.goLCL.disabled = Math.abs(st.z - Hn) < 1e-9;
    ui.tLCL.el.hidden = st.guided;
    ui.tPath.el.querySelector('span').innerHTML = st.guided ? '전체 경로 보기' : '예상 경로';
    ui.foldLCL.classList.toggle('waiting', st.guided && !st.revealed);
    ui.foldLCL.querySelector('summary').innerHTML = st.guided && !st.revealed ? '상승 응결 고도 구하기 <span class="tag">응결 고도에 닿은 뒤 볼 수 있어요</span>' : '상승 응결 고도 구하기';
  }

  return {
    L, init, layout, tick, render,
    pause() { pause(); },
    onShow() { layout(); },
    hasFrame: () => !!(sh && sh.frame),
    api: { setZ, setCond, play, step, resetMotion, resetDefaults, saveCompare, st, H }
  };
})();

function legendHTML(color, cls, label) {
  return `<span><i class="${cls}" style="border-color:${color}"></i>${label}</span>`;
}
