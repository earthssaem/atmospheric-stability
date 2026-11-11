/**
 * tab3-stability.js — 3. 대기 안정도와 구름의 생성 (절대 안정 · 조건부 불안정 · 절대 불안정, 층운형/적운형, 역전층)
 */
'use strict';

(function () {
  const TAB = 'tab3';
  const HMAX = 6;
  const st = {
    gamma: 8, T: 30, Td: 14,
    h: 0, v: 0, forcing: false, pokeTarget: null,
    cloudTop: null, hMax: 0
  };
  const G = { W: 520, H: 690, yGround: 630, yTop: 54, x: 290 };
  G.yOf = h => G.yGround - h * (G.yGround - G.yTop) / HMAX;
  const E = {};
  const ui = {};

  const PRESETS = [
    { g: 4, label: '절대 안정', fig: '그림 Ⅲ-15', T: 30, Td: 14 },
    { g: 8, label: '조건부 불안정', fig: '그림 Ⅲ-17', T: 30, Td: 14 },
    { g: 12, label: '절대 불안정', fig: '그림 Ⅲ-16', T: 30, Td: 14 },
    { g: -5, label: '역전층', fig: '기온이 위로 갈수록 높음', T: 20, Td: 12 }
  ];

  registerMissions(TAB, [
    {
      title: '층운형 구름을 만들어라',
      desc: '안정한 대기를 만든 뒤 ✊ 강제 상승으로 공기를 상승 응결 고도 위까지 밀어 올려, 옆으로 퍼지는 층운형 구름을 만드세요.',
      hint: 'γ를 5 ℃/km보다 작게(예: 절대 안정 프리셋) 하고, ✊ 강제 상승 버튼을 누른 채로 점선(상승 응결 고도) 위까지 올려 보세요.'
    },
    {
      title: '적운형 구름을 만들어라',
      desc: '불안정한 대기에서 공기 덩어리가 스스로 상승해 수직으로 두껍게 발달하는 적운형 구름을 만드세요.',
      hint: 'γ를 10 ℃/km보다 크게(예: 절대 불안정 프리셋) 하고 👉 살짝 밀기! 공기 덩어리가 주위보다 따뜻해져 스스로 계속 올라가요.'
    },
    {
      title: '조건부 불안정에서 적운을 발달시켜라',
      desc: 'γ를 5~10 ℃/km 사이로 설정하세요. 살짝 밀면 되돌아오지만, 강제 상승으로 자유 대류 고도를 넘기면? 적운형 구름까지 발달시키세요!',
      hint: '조건부 불안정(예: γ = 8)에서는 불포화일 때 안정하지만 포화되면 불안정해요. ✊ 강제 상승을 누른 채 "자유 대류 고도" 점선을 넘긴 뒤 손을 떼 보세요.'
    }
  ], { onModeChange: () => render() });

  /* ───────── 화면 만들기 ───────── */
  function init(panel) {
    LessonHead(panel, {
      tag: '7차시 · 대기 안정도와 구름',
      q: '같은 상승인데 왜 어떤 날은 층운, 어떤 날은 적운이 생길까?',
      sub: '주위 공기의 기온 감률(γ)을 바꾸고 공기 덩어리를 밀어 올려, 되돌아오는지 스스로 올라가는지 확인해 보세요.',
      missionTab: TAB
    });
    panel.appendChild(h('div', { class: 'mission-card', id: 'mission-' + TAB }));

    const ws = h('div', { class: 'workspace ws-3' });
    const side = h('div', { class: 'side' });

    const cSet = Card({ title: '대기 조건' });
    ui.sG = Slider({ label: '주위 기온 감률 γ', min: -6, max: 14, step: 0.5, value: st.gamma, unit: ' ℃/km', digits: 1, color: 'var(--env)',
      onInput: v => { st.gamma = v; resetSim(); render(); } });
    ui.presets = h('div', { class: 'chip-row' });
    PRESETS.forEach(p => {
      const b = h('button', { type: 'button', class: 'chip', html: `${p.label} ${fmt(p.g, 0)}<small>${p.fig}</small>` });
      b.addEventListener('click', () => {
        st.gamma = p.g; st.T = p.T; st.Td = p.Td;
        ui.sG.set(p.g); ui.sT.set(p.T); clampTd(); ui.sTd.set(st.Td);
        resetSim(); render();
      });
      b.dataset.g = p.g;
      ui.presets.appendChild(b);
    });
    ui.sT = Slider({ label: '지표 기온', min: 10, max: 40, step: 1, value: st.T, unit: ' ℃', colorize: tempColor,
      onInput: v => { st.T = v; clampTd(); resetSim(); render(); } });
    ui.sTd = Slider({ label: '지표 이슬점', min: 0, max: 29, step: 1, value: st.Td, unit: ' ℃', color: 'var(--dew)', colorize: () => 'var(--dew)',
      onInput: v => { st.Td = v; resetSim(); render(); } });
    cSet.body.append(h('div', { class: 'controls' }, ui.sG.el, ui.presets, ui.sT.el, ui.sTd.el));
    side.appendChild(cSet.el);

    const cAct = Card({ title: '공기 덩어리 움직이기' });
    ui.poke = Btn('👉 살짝 밀기', '', () => { st.pokeTarget = Math.max(0.5, st.h + 0.0001); st.forcing = false; });
    ui.force = Btn('✊ 강제 상승 (누르고 있기)', 'warm');
    holdButton(ui.force, () => { st.forcing = true; st.pokeTarget = null; }, () => { st.forcing = false; });
    const reset = Btn('↺ 처음으로', 'ghost', () => { resetSim(); render(); });
    ui.vs = h('div', { class: 'vs-box' });
    cAct.body.append(h('div', { class: 'btn-row' }, ui.poke, reset), h('div', { class: 'btn-row', style: { marginTop: '8px' } }, ui.force), ui.vs);
    side.appendChild(cAct.el);


    const cScene = Card({ title: '하늘 장면', cls: 'viz', pad: false });
    E.scene = svgRoot(G.W, G.H, '대기 안정도 하늘 장면', 'cap');
    cScene.body.appendChild(h('div', { class: 'svg-wrap' }, E.scene));
    const cGraph = Card({
      title: '높이–온도 그래프', cls: 'viz', pad: false,
      legend: legendItem('var(--env)', '기온 변화선(주위)') + legendItem('var(--dry)', '건조 단열선', 'dash') + legendItem('var(--moist)', '습윤 단열선', 'dash')
    });
    E.graph = svgRoot(G.W, G.H, '대기 안정도 높이-온도 그래프', 'cap');
    cGraph.body.appendChild(h('div', { class: 'svg-wrap' }, E.graph));
    // 안정도 판정 (교과서 그림 Ⅲ-14)
    ui.badge = h('div', { class: 'state-chip' });
    E.mini = svgRoot(300, 210, '기온 감률과 단열 감률 비교 그림 (교과서 그림 Ⅲ-14)');
    ui.rule = h('div', { class: 'note-sm' });
    cGraph.body.appendChild(h('div', { class: 'judge-box' },
      h('div', { class: 'judge-mini' }, E.mini,
        h('div', { class: 'legend', style: { marginLeft: 0 }, html: legendItem('var(--dry)', '건조 10') + legendItem('var(--moist)', '습윤 5') + legendItem('var(--env)', '주위 γ') })),
      h('div', { class: 'judge-text' }, h('div', { class: 'calc-title', text: '안정도 판정 (교과서 그림 Ⅲ-14)' }), ui.badge, ui.rule)));

    ws.append(side, cScene.el, cGraph.el);
    panel.appendChild(ws);

    panel.appendChild(h('div', { class: 'info-grid' },
      ConceptCard('대기 안정도', [
        '공기 덩어리를 강제로 올리거나 내렸을 때 <b>원래 위치로 되돌아가려는</b> 상태 = 안정, <b>멀어지려는</b> 상태 = 불안정',
        '공기 덩어리의 기온과 주위 기온 비교: 올렸을 때 주위보다 <b>차가우면 하강</b>(안정), <b>따뜻하면 계속 상승</b>(불안정)',
        '<b>γ &lt; 5</b>(습윤 단열 감률보다 작음) → <span style="color:#18548f;font-weight:800">절대 안정</span>',
        '<b>γ &gt; 10</b>(건조 단열 감률보다 큼) → <span style="color:#9a3d0b;font-weight:800">절대 불안정</span>',
        '<b>5 &lt; γ &lt; 10</b> → <span style="color:#2d6a1f;font-weight:800">조건부 불안정</span>: 불포화면 안정, 포화되면 불안정'
      ], '교과서 그림 Ⅲ-14 대기 안정도'),
      ConceptCard('안정도와 구름 · 역전층', [
        '절대 안정: 강제 상승으로 구름이 생겨도 연직 운동이 억제되어 <b>두께가 얇은 층운형 구름</b>',
        '절대 불안정: 상승 응결 고도에 도달한 뒤에도 계속 상승 → <b>두께가 두꺼운 적운형 구름</b>',
        '조건부 불안정: 상승 응결 고도에서 층운형 구름이 생긴 뒤, 주위보다 따뜻해지는 높이(자유 대류 고도)를 넘으면 <b>스스로 상승하며 적운형 구름</b>',
        '<b>역전층</b>: 높이 올라갈수록 기온이 높아지는 매우 안정한 층. 바람이 약하고 맑은 날 새벽 지표 복사 냉각으로 잘 생기며, 오염 물질이 확산되지 않아 <b>대기 오염이 심해질 수 있다</b>.'
      ], '교과서 그림 Ⅲ-15 · Ⅲ-16 · Ⅲ-17'),
      ThinkCard('스스로 확인하기', [
        { q: '대기 안정도를 판단하는 방법을 기온 감률과 단열 감률을 이용하여 설명해 보자.', a: '기온 감률이 습윤 단열 감률보다 작으면 절대 안정, 건조 단열 감률보다 크면 절대 불안정, 건조 단열 감률보다 작고 습윤 단열 감률보다 크면 조건부 불안정 상태이다. 조건부 불안정 상태일 때 공기 덩어리가 불포화 상태이면 안정하고, 포화 상태이면 불안정하다.' },
        { q: '절대 안정 상태인 대기와 절대 불안정 상태인 대기에서 구름이 생성되는 과정을 단열 변화와 관련지어 설명해 보자.', a: '절대 안정이면 강제로 상승한 공기 덩어리의 온도가 주위보다 항상 낮아 원래 위치로 되돌아가려 하므로 연직 운동이 억제되어 두께가 얇은 층운형 구름이 생긴다. 절대 불안정이면 공기 덩어리의 온도가 주위보다 항상 높아 연직 운동이 활발해져 두께가 두꺼운 적운형 구름이 생긴다.' }
      ])
    ));

    buildScene();
    buildGraph();
    buildMini();
    clampTd();
    render();
  }

  function clampTd() {
    ui.sTd.setMax(st.T - 1);
    if (st.Td > st.T - 1) st.Td = st.T - 1;
    ui.sTd.set(st.Td);
  }

  function buildScene() {
    const svg = E.scene;
    const d = skyDefs(svg, '#5aa1dc', '#e5f3ff');
    E.cloudFill = d.cloud;
    s('rect', { x: 0, y: 0, width: G.W, height: G.yGround, fill: d.sky }, svg);
    s('path', { d: `M0 ${G.yGround} L0 606 Q80 590 160 604 T330 598 T520 594 L520 ${G.yGround} Z`, fill: '#a9cfe2', opacity: 0.8 }, svg);
    s('rect', { x: 0, y: G.yGround, width: G.W, height: G.H - G.yGround, fill: '#79b95c' }, svg);
    txt({ x: G.W - 12, y: G.H - 20, 'text-anchor': 'end', class: 't-tick', fill: '#fff' }, '지표', svg);
    // 높이 눈금 + 주위 기온 칸
    s('rect', { x: 58, y: G.yTop - 30, width: 74, height: G.yGround - G.yTop + 44, rx: 10, fill: '#fff', 'fill-opacity': 0.55 }, svg);
    E.gammaT = txt({ x: 95, y: G.yTop - 12, 'text-anchor': 'middle', class: 't-lbl', 'font-size': 13.5, fill: '#226b36' }, '', svg);
    E.envLabels = [];
    for (let k = 0; k <= HMAX; k++) {
      const y = G.yOf(k);
      if (k > 0) s('line', { x1: 132, y1: y, x2: G.W, y2: y, stroke: '#fff', 'stroke-opacity': 0.5, 'stroke-dasharray': '2 6' }, svg);
      txt({ x: 52, y: y + 5, 'text-anchor': 'end', class: 't-tick', fill: '#1f3c58' }, k + ' km', svg);
      E.envLabels.push(txt({ x: 95, y: y + 6, 'text-anchor': 'middle', class: 't-lbl', 'font-size': 16, fill: '#226b36' }, '', svg));
    }
    E.cloud = s('g', null, svg);
    E.lcl = s('line', { x1: 132, x2: G.W, stroke: '#a77800', 'stroke-width': 2.5, 'stroke-dasharray': '9 6' }, svg);
    E.lclT = txt({ x: G.W - 8, 'text-anchor': 'end', class: 't-lbl halo-sky', fill: '#7a5800' }, '', svg);
    E.lfc = s('line', { x1: 132, x2: G.W, stroke: '#c0530f', 'stroke-width': 2.5, 'stroke-dasharray': '3 6' }, svg);
    E.lfcT = txt({ x: G.W - 8, 'text-anchor': 'end', class: 't-lbl halo-sky', fill: '#a8460b' }, '', svg);
    E.cloudT = txt({ x: G.x, 'text-anchor': 'middle', class: 't-lbl halo', 'font-size': 17 }, '', svg);

    E.parcel = makeParcel(svg, { seed: 13, molecules: 10 });
    E.arrow = s('path', { fill: 'none', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
    E.say = s('g', null, svg);
    E.sayBg = s('rect', { rx: 10, fill: '#fff', 'fill-opacity': 0.95, stroke: '#c8d6e4' }, E.say);
    E.say1 = txt({ class: 't-lbl', 'font-size': 16 }, '', E.say);
    E.say2 = txt({ class: 't-lbl', 'font-size': 15 }, '', E.say);
  }

  function buildGraph() {
    const ax = makeAxes(E.graph, {
      X0: 84, X1: 500, Y0: G.yGround, Y1: G.yTop, xmin: -40, xmax: 40, xstep: 10,
      ymin: 0, ymax: HMAX, ystep: 1, minorY: 0.5, xlabel: '기온 (℃)', ylabel: '높이 (km)'
    });
    E.ax = ax;
    const p = ax.plot;
    E.gWarm = s('g', null, ax.bgLayer);
    E.gLcl = s('line', { x1: ax.X0, x2: ax.X1, stroke: '#a77800', 'stroke-width': 2, 'stroke-dasharray': '8 6' }, p);
    E.gLfc = s('line', { x1: ax.X0, x2: ax.X1, stroke: '#c0530f', 'stroke-width': 2, 'stroke-dasharray': '3 6' }, p);
    E.gDry = s('polyline', { fill: 'none', stroke: '#ec7a1c', 'stroke-width': 3, 'stroke-dasharray': '10 7' }, p);
    E.gMoist = s('polyline', { fill: 'none', stroke: '#2d7dd2', 'stroke-width': 3, 'stroke-dasharray': '10 7' }, p);
    E.gEnv = s('polyline', { fill: 'none', stroke: '#2e9b47', 'stroke-width': 5 }, p);
    E.gTrailDry = s('polyline', { fill: 'none', stroke: '#ec7a1c', 'stroke-width': 7, 'stroke-opacity': 0.55, 'stroke-linecap': 'round' }, p);
    E.gTrailMoist = s('polyline', { fill: 'none', stroke: '#2d7dd2', 'stroke-width': 7, 'stroke-opacity': 0.55, 'stroke-linecap': 'round' }, p);
    E.gEnvDot = s('circle', { r: 7, fill: '#2e9b47', stroke: '#fff', 'stroke-width': 2 }, p);
    E.gDot = s('circle', { r: 8.5, stroke: '#fff', 'stroke-width': 2.5 }, p);
    E.gLclT = txt({ x: ax.X0 + 8, class: 't-lbl halo', fill: '#7a5800', 'font-size': 14 }, '', ax.over);
    E.gLfcUp = txt({ x: ax.X1 - 8, 'text-anchor': 'end', class: 't-lbl halo', fill: '#b42318', 'font-size': 15 }, '불안정 ↑', ax.over);
    E.gLfcDn = txt({ x: ax.X1 - 8, 'text-anchor': 'end', class: 't-lbl halo', fill: '#1d5ea8', 'font-size': 15 }, '안정 ↓', ax.over);
    E.gEnvT = txt({ class: 't-lbl halo', fill: '#226b36', 'font-size': 15 }, '', ax.over);
    // 영역 범례
    const lg = s('g', null, ax.over);
    const ly = ax.Y0 - 62;
    s('rect', { x: ax.X0 + 8, y: ly, width: 222, height: 52, rx: 8, fill: '#fff', 'fill-opacity': 0.92, stroke: '#dbe4ee' }, lg);
    s('rect', { x: ax.X0 + 18, y: ly + 9, width: 16, height: 12, fill: '#f6b4a6' }, lg);
    txt({ x: ax.X0 + 40, y: ly + 20, class: 't-lbl', 'font-size': 13.5, fill: '#7a2a1a' }, '덩어리가 주위보다 따뜻 (상승)', lg);
    s('rect', { x: ax.X0 + 18, y: ly + 30, width: 16, height: 12, fill: '#a9cdf2' }, lg);
    txt({ x: ax.X0 + 40, y: ly + 41, class: 't-lbl', 'font-size': 13.5, fill: '#1d4f86' }, '덩어리가 주위보다 차가움 (하강)', lg);
  }

  /* 교과서 그림 Ⅲ-14 같은 판정 그림 */
  function buildMini() {
    const svg = E.mini;
    const O = { x: 214, y: 186 }, kx = 3.7, ky = 33;
    E.miniO = O; E.miniK = { kx, ky };
    const P = (L, z) => [O.x - kx * L * z, O.y - ky * z];
    const top = 5.2;
    const dry = P(10, top), moist = P(5, top);
    const clip = uid('mc');
    s('rect', { x: 18, y: 8, width: 278, height: 180 }, s('clipPath', { id: clip }, svg));
    const g = s('g', { 'clip-path': `url(#${clip})` }, svg);
    s('rect', { x: 18, y: 8, width: 278, height: 180, fill: '#dfeefc' }, g);
    s('path', { d: `M${O.x} ${O.y} L${dry[0]} ${dry[1]} L-200 ${dry[1]} L-200 ${O.y} Z`, fill: '#fde3cf' }, g);
    s('path', { d: `M${O.x} ${O.y} L${dry[0]} ${dry[1]} L${moist[0]} ${moist[1]} Z`, fill: '#e2f3dc' }, g);
    s('line', { x1: O.x, y1: O.y, x2: dry[0], y2: dry[1], stroke: '#ec7a1c', 'stroke-width': 3 }, g);
    s('line', { x1: O.x, y1: O.y, x2: moist[0], y2: moist[1], stroke: '#2d7dd2', 'stroke-width': 3 }, g);
    E.miniEnv = s('line', { x1: O.x, y1: O.y, stroke: '#2e9b47', 'stroke-width': 5, 'stroke-linecap': 'round' }, g);
    txt({ x: 30, y: 150, class: 't-lbl', 'font-size': 15, fill: '#9a3d0b' }, '절대', g);
    txt({ x: 30, y: 168, class: 't-lbl', 'font-size': 15, fill: '#9a3d0b' }, '불안정', g);
    txt({ x: 120, y: 44, class: 't-lbl halo', 'font-size': 14, fill: '#2d6a1f', 'text-anchor': 'middle' }, '조건부 불안정', g);
    txt({ x: 252, y: 70, class: 't-lbl', 'font-size': 15, fill: '#18548f', 'text-anchor': 'middle' }, '절대 안정', g);
    s('line', { x1: 18, y1: 8, x2: 18, y2: 188, stroke: '#7d90a3', 'stroke-width': 1.5 }, svg);
    s('line', { x1: 18, y1: 188, x2: 296, y2: 188, stroke: '#7d90a3', 'stroke-width': 1.5 }, svg);
    txt({ x: 14, y: 20, 'text-anchor': 'end', class: 't-tick', 'font-size': 11 }, '', svg);
    txt({ x: 8, y: 98, class: 't-tick', 'font-size': 12, transform: 'rotate(-90 8 98)', 'text-anchor': 'middle' }, '높이', svg);
    txt({ x: 280, y: 204, class: 't-tick', 'font-size': 12, 'text-anchor': 'end' }, '온도 →', svg);
  }

  /* ───────── 시뮬레이션 ───────── */
  function resetSim() { st.h = 0; st.v = 0; st.forcing = false; st.pokeTarget = null; st.cloudTop = null; st.hMax = 0; }

  function cloudType() {
    const stab = Physics.stability(st.gamma);
    if (stab === 'absolute-stable') return 'stratus';
    if (stab === 'absolute-unstable') return 'cumulus';
    const lfc = Physics.lfc(st.T, st.Td, st.gamma);
    return (lfc != null && st.cloudTop != null && st.cloudTop > lfc + 0.02) ? 'cumulus' : 'stratus';
  }

  function step(dt) {
    const H = Physics.lcl(st.T, st.Td);
    if (st.pokeTarget != null) {
      st.h = Math.min(st.pokeTarget, st.h + 1.4 * dt);
      if (st.h >= st.pokeTarget) { st.pokeTarget = null; st.v = 0; }
    } else if (st.forcing) {
      st.h = Math.min(HMAX, st.h + 0.7 * dt);
      st.v = 0;
    } else {
      const b = Physics.buoyancy(st.T, st.Td, st.gamma, st.h);
      st.v += 0.9 * b * dt;
      st.v *= Math.exp(-1.1 * dt);
      st.v = clamp(st.v, -1.6, 1.6);
      st.h += st.v * dt;
      if (st.h <= 0) { st.h = 0; st.v = 0; }
      if (st.h >= HMAX) { st.h = HMAX; st.v = 0; }
    }
    st.hMax = Math.max(st.hMax, st.h);
    if (st.h > H) st.cloudTop = Math.max(st.cloudTop == null ? H : st.cloudTop, Math.min(st.h, HMAX));
  }
  function tick(dt) {
    const moving = st.forcing || st.pokeTarget != null || st.h > 0 || Math.abs(st.v) > 1e-4;
    if (moving) { step(dt); render(); }
    E.parcel.tick(dt);
  }

  /* ───────── 그리기 ───────── */
  let cloudKey = '', warmKey = '';
  function render() {
    if (!E.scene) return;
    const { gamma, T, Td, h } = st;
    const H = Physics.lcl(T, Td);
    const lfc = Physics.lfc(T, Td, gamma);
    const par = Physics.parcel(T, Td, h);
    const env = Physics.envTemp(T, gamma, h);
    const buoy = par.temp - env;
    const stab = Physics.stability(gamma);

    // 슬라이더 색 · 프리셋 강조
    const stabColor = stab === 'absolute-stable' ? '#2d7dd2' : stab === 'absolute-unstable' ? '#d9572a' : '#2e9b47';
    ui.sG.input.style.setProperty('--c', stabColor);
    ui.presets.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', +b.dataset.g === gamma && st.T === PRESETS.find(p => p.g === +b.dataset.g).T && st.Td === PRESETS.find(p => p.g === +b.dataset.g).Td));

    // 판정
    let label, cls, rule;
    if (gamma < 0) { label = `역전층 · 절대 안정 (γ = ${fmt(gamma, 1)})`; cls = 'stable'; rule = '높이 올라갈수록 기온이 <b>높아지는</b> 층 → 매우 안정. 공기 덩어리를 올리면 주위보다 훨씬 차가워 바로 되돌아와요.'; }
    else if (stab === 'absolute-stable') { label = `절대 안정 (γ = ${fmt(gamma, 1)} < 5)`; cls = 'stable'; rule = 'γ가 <b>습윤 단열 감률(5)보다 작아</b> 포화 여부와 관계없이 덩어리가 주위보다 차가워요 → 되돌아옴'; }
    else if (stab === 'absolute-unstable') { label = `절대 불안정 (γ = ${fmt(gamma, 1)} > 10)`; cls = 'unstable'; rule = 'γ가 <b>건조 단열 감률(10)보다 커서</b> 포화 여부와 관계없이 덩어리가 주위보다 따뜻해요 → 계속 상승'; }
    else { label = `조건부 불안정 (5 ≤ γ = ${fmt(gamma, 1)} ≤ 10)`; cls = 'cond'; rule = '불포화면 안정(10 > γ), <b>포화되면 불안정</b>(5 < γ). 자유 대류 고도를 넘으면 스스로 상승해요.'; }
    if (gamma === 5) rule += ' <br>(γ = 5: 포화 공기에 대해 <b>중립</b>)';
    if (gamma === 10) rule += ' <br>(γ = 10: 불포화 공기에 대해 <b>중립</b>)';
    ui.badge.className = 'state-chip ' + cls;
    ui.badge.innerHTML = `<span style="font-size:17px">${label}</span>`;
    ui.rule.innerHTML = rule;
    const O = E.miniO, k = E.miniK, top = 5.2;
    sa(E.miniEnv, { x2: O.x - k.kx * gamma * top, y2: O.y - k.ky * top });

    // 비교 상자
    const free = st.pokeTarget == null && !st.forcing;
    let verdict = '';
    if (h <= 0.001 && free) verdict = '<span class="muted">공기 덩어리가 지표에 있어요. 👉 밀거나 ✊ 강제로 올려 보세요.</span>';
    else if (st.forcing) verdict = '✊ 강제로 올리는 중…';
    else if (st.pokeTarget != null) verdict = '👉 밀어 올리는 중…';
    else if (buoy > 0.05) verdict = `<b style="color:#b42318">주위보다 ${fmt(buoy)} ℃ 따뜻 → 스스로 상승!</b>`;
    else if (buoy < -0.05) verdict = `<b style="color:#1d5ea8">주위보다 ${fmt(-buoy)} ℃ 차가움 → 원래 위치로 하강</b>`;
    else verdict = '주위와 기온이 같음 → 그 자리에 머무름(중립)';
    ui.vs.innerHTML = `<div class="vs-row"><div><span class="k">공기 덩어리</span><b style="color:${tempColor(par.temp)}">${fmt(par.temp)} ℃</b></div>
      <div class="vs-mid">vs</div><div><span class="k">주위 공기</span><b style="color:#226b36">${fmt(env)} ℃</b></div></div>
      <div class="vs-h">높이 ${fmt(h, 2)} km · ${par.saturated && h > 0 ? '<span style="color:var(--moist-ink)">포화</span>' : '<span style="color:var(--dry-ink)">불포화</span>'}</div>
      <div class="vs-verdict">${verdict}</div>`;

    // 장면: 주위 기온 칸
    E.gammaT.textContent = `γ = ${fmt(gamma, 1)} ℃/km`;
    E.envLabels.forEach((t, k2) => { t.textContent = `${fmt(T - gamma * k2, 0)} ℃`; });

    // 점선
    const yH = G.yOf(Math.min(H, HMAX));
    sa(E.lcl, { y1: yH, y2: yH, opacity: H <= HMAX ? 1 : 0 });
    sa(E.lclT, { y: yH - 9, opacity: H <= HMAX ? 1 : 0 }); E.lclT.textContent = `상승 응결 고도 ${fmt(H, 2)} km`;
    const showLfc = stab === 'conditional' && lfc != null && lfc <= HMAX;
    const yL = showLfc ? G.yOf(lfc) : 0;
    sa(E.lfc, { y1: yL, y2: yL, opacity: showLfc ? 1 : 0 });
    sa(E.lfcT, { y: (Math.abs(yL - yH) < 24 ? yL - 30 : yL - 9), opacity: showLfc ? 1 : 0 }); E.lfcT.textContent = `자유 대류 고도 ${fmt(lfc || 0, 2)} km`;

    // 구름
    const hasCloud = st.cloudTop != null && st.cloudTop > H + 0.05;
    const ctype = hasCloud ? cloudType() : null;
    const ck = hasCloud ? `${ctype}|${H.toFixed(3)}|${st.cloudTop.toFixed(2)}` : 'none';
    if (ck !== cloudKey) {
      cloudKey = ck;
      E.cloud.innerHTML = '';
      if (hasCloud) {
        const baseY = G.yOf(H) + 2;
        if (ctype === 'stratus') {
          const th = clamp((st.cloudTop - H) * 95, 16, 40);
          stratusCloud(E.cloud, 142, G.W - 14, baseY, th, 'white', 31);
        } else {
          cumulusCloud(E.cloud, G.x, baseY, G.yOf(Math.min(st.cloudTop, HMAX)) - 10, 210, 'white', 37);
        }
      }
    }
    sa(E.cloudT, { y: G.yOf(H) + 26, opacity: hasCloud ? 1 : 0, fill: ctype === 'stratus' ? '#17599f' : '#a8460b' });
    E.cloudT.textContent = ctype === 'stratus' ? '층운형 구름 — 옆으로 얇게 퍼짐' : '적운형 구름 — 위로 두껍게 발달!';

    // 공기 덩어리
    const r = 22 + 3.5 * h;
    const py = G.yOf(h) - r;
    E.parcel.setState({ r, sat: par.saturated && h > 0, temp: par.temp });
    E.parcel.g.setAttribute('transform', `translate(${G.x} ${py.toFixed(1)})`);

    // 화살표와 말풍선
    const ax = G.x + r + 22;
    if (free && h > 0.02 && Math.abs(buoy) > 0.05) {
      const up = buoy > 0, c = up ? '#d9382a' : '#2563eb', cy = py;
      const d = up
        ? `M ${ax} ${cy + 22} L ${ax} ${cy - 22} M ${ax - 11} ${cy - 9} L ${ax} ${cy - 24} L ${ax + 11} ${cy - 9}`
        : `M ${ax} ${cy - 22} L ${ax} ${cy + 22} M ${ax - 11} ${cy + 9} L ${ax} ${cy + 24} L ${ax + 11} ${cy + 9}`;
      sa(E.arrow, { d, stroke: c, opacity: 1 });
      const tx = ax + 18, ty = clamp(cy - 10, 30, G.yGround - 60);
      sa(E.say, { opacity: 1 });
      sa(E.sayBg, { x: tx - 8, y: ty - 18, width: Math.min(G.W - tx + 2, 170), height: 50 });
      sa(E.say1, { x: tx, y: ty, fill: c }); E.say1.textContent = up ? `주위보다 +${fmt(buoy)} ℃` : `주위보다 −${fmt(-buoy)} ℃`;
      sa(E.say2, { x: tx, y: ty + 22, fill: c }); E.say2.textContent = up ? '→ 스스로 상승' : '→ 원래 위치로';
    } else {
      sa(E.arrow, { opacity: 0 }); sa(E.say, { opacity: 0 });
    }

    renderGraph(H, lfc, par, env, stab);
    missionLive(H, ctype, hasCloud, stab);
  }

  function renderGraph(H, lfc, par, env, stab) {
    const ax = E.ax, { gamma, T, h } = st;
    const tH = T - 10 * H;
    sa(E.gEnv, { points: pts([[T, 0], [T - gamma * HMAX, HMAX]], ax) });
    sa(E.gDry, { points: pts([[T, 0], [T - 10 * Math.min(H, HMAX), Math.min(H, HMAX)]], ax) });
    sa(E.gMoist, { points: H < HMAX ? pts([[tH, H], [tH - 5 * (HMAX - H), HMAX]], ax) : '' });
    sa(E.gLcl, { y1: ax.gy(H), y2: ax.gy(H), opacity: H <= HMAX ? 1 : 0 });
    sa(E.gLclT, { y: ax.gy(H) + 18, opacity: H <= HMAX ? 1 : 0 }); E.gLclT.textContent = `상승 응결 고도 ${fmt(H, 2)} km`;
    const showLfc = stab === 'conditional' && lfc != null && lfc <= HMAX;
    sa(E.gLfc, { y1: ax.gy(lfc || 0), y2: ax.gy(lfc || 0), opacity: showLfc ? 1 : 0 });
    sa(E.gLfcUp, { y: ax.gy(lfc || 0) - 8, opacity: showLfc ? 1 : 0 });
    sa(E.gLfcDn, { y: ax.gy(lfc || 0) + 20, opacity: showLfc ? 1 : 0 });
    // 'γ =' 글자는 기온 변화선이 그래프 안에 있는 높이에 붙인다
    let hl = 5.4;
    if (T - gamma * hl > 37) hl = (T - 37) / gamma;
    if (T - gamma * hl < -37) hl = (T + 37) / gamma;
    sa(E.gEnvT, { x: ax.gx(T - gamma * hl) + (gamma >= 0 ? 10 : -10), y: ax.gy(hl), 'text-anchor': gamma >= 0 ? 'start' : 'end' });
    E.gEnvT.textContent = `γ = ${fmt(gamma, 1)}`;

    // 덩어리가 주위보다 따뜻/차가운 구간 칠하기
    const wk = `${gamma}|${T}|${st.Td}`;
    if (wk !== warmKey) {
      warmKey = wk;
      E.gWarm.innerHTML = '';
      const N = 300;
      let seg = [], sign = 0;
      const flush = () => {
        if (seg.length < 2) { seg = []; return; }
        const up = seg.map(q => [q[1], q[0]]);
        const down = seg.map(q => [q[2], q[0]]).reverse();
        s('polygon', { points: pts(up.concat(down), ax), fill: sign > 0 ? '#f6b4a6' : '#a9cdf2', opacity: 0.55 }, E.gWarm);
        seg = [];
      };
      for (let i = 0; i <= N; i++) {
        const z = HMAX * i / N;
        const pt = Physics.parcel(T, st.Td, z).temp, et = Physics.envTemp(T, gamma, z);
        const sg = pt - et > 1e-9 ? 1 : pt - et < -1e-9 ? -1 : 0;
        if (sg !== sign && seg.length) { seg.push([z, pt, et]); flush(); }
        sign = sg || sign;
        seg.push([z, pt, et]);
      }
      flush();
    }

    // 궤적 (지나온 길)
    const hm = st.hMax;
    const hb = Math.min(hm, H);
    sa(E.gTrailDry, { points: hm > 0 ? pts([[T, 0], [T - 10 * hb, hb]], ax) : '' });
    sa(E.gTrailMoist, { points: hm > H ? pts([[tH, H], [tH - 5 * (hm - H), hm]], ax) : '' });
    sa(E.gDot, { cx: ax.gx(par.temp), cy: ax.gy(h), fill: par.saturated && h > 0 ? '#2d7dd2' : '#ec7a1c' });
    sa(E.gEnvDot, { cx: ax.gx(env), cy: ax.gy(h) });
  }

  /* ───────── 미션 ───────── */
  function thickness() { const H = Physics.lcl(st.T, st.Td); return st.cloudTop == null ? 0 : Math.min(st.cloudTop, HMAX) - H; }
  const checkers = [
    () => st.cloudTop != null && cloudType() === 'stratus' && thickness() >= TUNING.tab3.m1_minThickness,
    () => st.cloudTop != null && cloudType() === 'cumulus' && thickness() >= TUNING.tab3.m2_minThickness,
    () => Physics.stability(st.gamma) === 'conditional' && st.cloudTop != null && cloudType() === 'cumulus' && thickness() >= TUNING.tab3.m3_minThickness
  ];
  function missionLive(H, ctype, hasCloud, stab) {
    if (!missionOn(TAB)) return;
    const idx = currentMission(TAB);
    const typeTxt = hasCloud ? (ctype === 'stratus' ? '층운형' : '적운형') : '없음';
    const th = hasCloud ? thickness() : 0;
    if (idx === 0) setMissionLive(TAB, `지금 구름: ${typeTxt} (두께 ${fmt(th, 2)} km)`);
    if (idx === 1) setMissionLive(TAB, `지금 구름: ${typeTxt} (두께 ${fmt(th, 2)} km / 목표 ${fmt(TUNING.tab3.m2_minThickness, 1)} km 이상)`);
    if (idx === 2) setMissionLive(TAB, `안정도: ${stab === 'conditional' ? '<span class="good">조건부 불안정 ✓</span>' : '<span class="bad">조건부 불안정이 아니에요</span>'} · 구름: ${typeTxt}`);
    checkMission(TAB, checkers);
  }

  registerTab(TAB, { init, tick, onShow: render, onHide: () => { st.forcing = false; } });
})();
