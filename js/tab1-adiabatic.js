/**
 * tab1-adiabatic.js — 1. 단열 변화 (단열 팽창·압축, 건조/습윤 단열 감률, 이슬점 감률, 상승 응결 고도)
 */
'use strict';

(function () {
  const TAB = 'tab1';
  const st = { T: 25, Td: 15, h: 0, auto: 0, lastDir: 0, moveTimer: 0, prevSat: false, flash: 0 };
  const G = { yGround: 580, yTop: 50, x: 280, W: 520, H: 640 };
  G.yOf = h => G.yGround - h * (G.yGround - G.yTop) / 5;
  G.hOf = y => (G.yGround - y) / ((G.yGround - G.yTop) / 5);
  const E = {}; // 화면 요소
  let ui = {};

  registerMissions(TAB, [
    {
      title: '구름을 만들어라',
      desc: '공기 덩어리를 상승 응결 고도(H) 위로 올려 구름을 만들어 보세요.',
      hint: '점선(상승 응결 고도)보다 높이 공기 덩어리를 올리면 수증기가 응결해요. 덩어리를 위로 끌거나 ▲ 자동 상승을 눌러 보세요!'
    },
    {
      title: '구름 밑면을 정확히 2.0 km에 맞춰라',
      desc: '상승 응결 고도 H가 정확히 2.0 km가 되도록 기온과 이슬점을 맞춘 뒤, 공기 덩어리를 올려 구름을 만드세요.',
      hint: 'H = ⅛(T − Td)이므로 H = 2.0 km가 되려면 T − Td = 16 ℃여야 해요. 예: T = 26 ℃, Td = 10 ℃.'
    },
    {
      title: '4 km 상공에서 공기 덩어리 기온을 5 ℃로!',
      desc: '지표 기온은 30 ℃로 고정! 이슬점을 조절해 공기 덩어리가 4.0 km에 있을 때 기온이 정확히 5.0 ℃가 되게 하세요.',
      hint: '이슬점을 바꾸면 상승 응결 고도가 바뀌어 건조 단열(10 ℃/km) 구간과 습윤 단열(5 ℃/km) 구간의 길이가 달라져요. 4 km 기온 = 30 − 10×H − 5×(4 − H). 이 값이 5가 되는 H는? 그때 Td는?'
    }
  ], {
    afterRender: () => applyLock(),
    onModeChange: () => { applyLock(); render(); }
  });

  function applyLock() {
    if (!ui.sT) return;
    const lock = isMissionActive(TAB, 2);
    if (lock && st.T !== TUNING.tab1.m3_fixedT) {
      st.T = TUNING.tab1.m3_fixedT;
      ui.sT.set(st.T);
      clampTd();
    }
    ui.sT.setDisabled(lock);
    render();
  }
  function clampTd() {
    ui.sTd.setMax(st.T - 1);
    if (st.Td > st.T - 1) st.Td = st.T - 1;
    ui.sTd.set(st.Td);
  }

  /* ───────── 화면 만들기 ───────── */
  function init(panel) {
    LessonHead(panel, {
      tag: '5~6차시 · 단열 변화',
      q: '공기 덩어리가 올라가면 왜 구름이 생길까?',
      sub: '공기 덩어리를 위아래로 움직이며 기온 · 이슬점 · 상대 습도가 어떻게 변하는지 관찰해 보세요.',
      missionTab: TAB
    });
    panel.appendChild(h('div', { class: 'mission-card', id: 'mission-' + TAB }));

    const ws = h('div', { class: 'workspace ws-3' });
    const side = h('div', { class: 'side' });

    // 조건 설정
    const cSet = Card({ title: '조건 설정' });
    ui.sT = Slider({ label: '지표 기온 T', min: 10, max: 40, step: 1, value: st.T, unit: ' ℃', colorize: tempColor,
      onInput: v => { st.T = v; clampTd(); render(); } });
    ui.sTd = Slider({ label: '지표 이슬점 T<sub>d</sub>', min: 0, max: 24, step: 1, value: st.Td, unit: ' ℃', colorize: tempColor, color: 'var(--dew)',
      onInput: v => { st.Td = v; render(); } });
    ui.sH = Slider({ label: '공기 덩어리 높이', min: 0, max: 5, step: 0.05, value: 0, unit: ' km', digits: 2, color: 'var(--ink-2)',
      onInput: v => { stopAuto(); moveTo(v); } });
    ui.bUp = Btn('▲ 자동 상승', '', () => toggleAuto(1));
    ui.bDown = Btn('▼ 자동 하강', 'ghost', () => toggleAuto(-1));
    const bGround = Btn('지표로', 'ghost', () => { stopAuto(); moveTo(0); });
    cSet.body.append(h('div', { class: 'controls' }, ui.sT.el, ui.sTd.el, ui.sH.el,
      h('div', { class: 'btn-row' }, ui.bUp, ui.bDown, bGround)));
    side.appendChild(cSet.el);

    // 상태
    const cState = Card({ title: '공기 덩어리 상태' });
    ui.roH = h('div', { class: 'v num' }); ui.roT = h('div', { class: 'v num' });
    ui.roTd = h('div', { class: 'v num' }); ui.roRH = h('div', { class: 'v num' });
    ui.rhBar = h('span');
    ui.chip = h('div', { class: 'state-chip' });
    ui.change = h('div', { class: 'state-chip neutral', style: { marginTop: '6px' } });
    cState.body.append(
      h('div', { class: 'readout' },
        h('div', { class: 'ro' }, h('div', { class: 'k', text: '높이' }), ui.roH),
        h('div', { class: 'ro' }, h('div', { class: 'k', text: '상대 습도' }), ui.roRH, h('div', { class: 'rh-bar', style: { marginTop: '4px', height: '8px' } }, ui.rhBar)),
        h('div', { class: 'ro' }, h('div', { class: 'k', text: '기온' }), ui.roT),
        h('div', { class: 'ro' }, h('div', { class: 'k', text: '이슬점' }), ui.roTd)
      ),
      h('div', { style: { marginTop: '10px' } }, ui.chip), ui.change
    );
    side.appendChild(cState.el);


    // 장면
    const cScene = Card({ title: '하늘 장면 <span style="font-weight:600;color:var(--muted)">— 공기 덩어리를 끌어 올려 보세요</span>', cls: 'viz', pad: false });
    E.scene = svgRoot(G.W, G.H, '공기 덩어리가 상승하는 하늘 장면', 'cap');
    cScene.body.appendChild(h('div', { class: 'svg-wrap' }, E.scene));
    // 그래프
    const cGraph = Card({
      title: '높이–온도 그래프', cls: 'viz', pad: false,
      legend: legendItem('var(--dry)', '기온(불포화)') + legendItem('var(--moist)', '기온(포화)') + legendItem('var(--dew)', '이슬점', 'dash')
    });
    E.graph = svgRoot(G.W, G.H, '높이에 따른 공기 덩어리의 기온과 이슬점 그래프', 'cap');
    cGraph.body.appendChild(h('div', { class: 'svg-wrap' }, E.graph));
    ui.calc = h('div', { class: 'calc' });
    cGraph.body.appendChild(h('div', { class: 'calc-box' }, h('div', { class: 'calc-title', text: '계산 과정' }), ui.calc));

    ws.append(side, cScene.el, cGraph.el);
    panel.appendChild(ws);

    panel.appendChild(h('div', { class: 'info-grid' },
      ConceptCard('단열 변화', [
        '공기 덩어리가 <b>상승</b>하면 주위 기압이 낮아져 <b>팽창</b>하고, 분자의 운동 에너지가 줄어 기온이 낮아진다 → <b>단열 팽창</b>',
        '공기 덩어리가 <b>하강</b>하면 <b>압축</b>되어 기온이 높아진다 → <b>단열 압축</b>',
        '외부와 열을 주고받지 않고 부피 변화로 온도가 변하는 현상 = <b>단열 변화</b>'
      ], '교과서 그림 Ⅲ-9 단열 변화'),
      ConceptCard('단열 감률과 상승 응결 고도', [
        '<span style="color:var(--dry-ink);font-weight:800">불포화</span>: 기온 <b>10 ℃/km</b>(건조 단열 감률), 이슬점 <b>2 ℃/km</b>(이슬점 감률)씩 낮아진다.',
        '<span style="color:var(--moist-ink);font-weight:800">포화</span>: 응결열이 방출되어 기온이 <b>5 ℃/km</b>(습윤 단열 감률)씩 천천히 낮아지고, 이슬점도 5 ℃/km씩 낮아진다.',
        '기온 = 이슬점이 되는 높이(상대 습도 100 %) = <b>상승 응결 고도</b> → 구름이 생기기 시작',
        '(T − 10H) = (T<sub>d</sub> − 2H) 에서 <b>H(km) = ⅛(T − T<sub>d</sub>)</b>'
      ], '교과서 그림 Ⅲ-10 · Ⅲ-11 · Ⅲ-12'),
      ThinkCard('확인 문제', [
        { q: '지표면에서 기온이 20 ℃인 공기 덩어리가 불포화 상태로 높이 1 km까지 상승하면 기온은 몇 ℃가 될까?', a: '건조 단열 감률(10 ℃/km)에 따라 20 − 10 × 1 = <b>10 ℃</b>' },
        { q: '포화된 공기 덩어리가 상승할 때 불포화 공기보다 기온이 천천히 낮아지는 까닭은?', a: '수증기가 응결하면서 <b>응결열(숨은열)</b>이 방출되어 단열 팽창에 의한 기온 하강을 부분적으로 상쇄하기 때문이다.' },
        { q: '공기 덩어리가 상승하면 상대 습도는 어떻게 변할까?', a: '기온이 이슬점보다 빠르게 낮아져(10 ℃/km > 2 ℃/km) 포화 수증기압이 작아지므로 상대 습도가 <b>증가</b>하고, 상승 응결 고도에서 100 %가 된다.' }
      ])
    ));

    buildScene();
    buildGraph();
    clampTd();
    render();
  }

  function buildScene() {
    const svg = E.scene;
    const d = skyDefs(svg, '#5aa3df', '#e6f4ff');
    E.cloudFill = d.cloud;
    const gg = s('linearGradient', { id: 't1ground', x1: 0, y1: 0, x2: 0, y2: 1 }, d.defs);
    s('stop', { offset: '0%', 'stop-color': '#8fcf6e' }, gg);
    s('stop', { offset: '100%', 'stop-color': '#5fa847' }, gg);

    s('rect', { x: 0, y: 0, width: G.W, height: G.yGround, fill: d.sky, rx: 0 }, svg);
    // 해
    s('circle', { cx: 455, cy: 92, r: 40, fill: '#fff6c9', opacity: 0.45 }, svg);
    s('circle', { cx: 455, cy: 92, r: 24, fill: '#ffe27a' }, svg);
    // 높이 눈금
    for (let k = 0; k <= 5; k++) {
      const y = G.yOf(k);
      if (k > 0) s('line', { x1: 64, y1: y, x2: G.W, y2: y, stroke: '#fff', 'stroke-opacity': 0.5, 'stroke-dasharray': '2 6' }, svg);
      txt({ x: 56, y: y + 5, 'text-anchor': 'end', class: 't-tick', fill: '#1f3c58' }, k + ' km', svg);
    }
    // 먼 산 + 땅
    s('path', { d: `M0 ${G.yGround} L0 548 Q60 520 120 540 T240 530 T360 544 T520 526 L520 ${G.yGround} Z`, fill: '#a9cfe2', opacity: 0.8 }, svg);
    s('path', { d: `M0 ${G.yGround} L0 562 Q90 548 170 560 T330 556 T520 552 L520 ${G.yGround} Z`, fill: '#7fbf68' }, svg);
    s('rect', { x: 0, y: G.yGround, width: G.W, height: G.H - G.yGround, fill: 'url(#t1ground)' }, svg);
    txt({ x: G.W - 12, y: G.H - 18, 'text-anchor': 'end', class: 't-tick', fill: '#fff' }, '지표 (0 km)', svg);

    // 오른쪽 감률 막대 (교과서 그림 Ⅲ-12처럼)
    E.barDry = s('line', { x1: 500, x2: 500, stroke: '#ec7a1c', 'stroke-width': 6, 'stroke-linecap': 'round' }, svg);
    E.barMoist = s('line', { x1: 500, x2: 500, stroke: '#2d7dd2', 'stroke-width': 6, 'stroke-linecap': 'round' }, svg);
    E.barDryT = txt({ 'text-anchor': 'middle', class: 't-lbl halo-sky', 'font-size': 13.5, fill: '#a8500a' }, '건조 단열 감률 10 ℃/km', svg);
    E.barMoistT = txt({ 'text-anchor': 'middle', class: 't-lbl halo-sky', 'font-size': 13.5, fill: '#17599f' }, '습윤 단열 감률 5 ℃/km', svg);

    E.cloud = s('g', null, svg);
    // 상승 응결 고도
    E.lcl = s('line', { x1: 64, x2: 492, stroke: '#a77800', 'stroke-width': 2.5, 'stroke-dasharray': '9 6' }, svg);
    E.lclT = txt({ x: 486, 'text-anchor': 'end', class: 't-lbl halo-sky', fill: '#7a5800' }, '', svg);

    // 공기 덩어리
    E.parcel = makeParcel(svg, { grab: true, seed: 5 });
    // 덩어리 옆 설명
    E.tag = s('g', null, svg);
    E.tagBg = s('rect', { rx: 10, fill: '#fff', 'fill-opacity': 0.93, stroke: '#c8d6e4' }, E.tag);
    E.tagT = txt({ class: 't-big', 'text-anchor': 'end' }, '', E.tag);
    E.tagTd = txt({ class: 't-lbl', 'text-anchor': 'end', 'font-size': 16 }, '', E.tag);
    E.tagMove = txt({ class: 't-lbl', 'text-anchor': 'end', 'font-size': 14 }, '', E.tag);
    E.flash = txt({ x: G.x, 'text-anchor': 'middle', class: 't-lbl halo', fill: '#17599f', 'font-size': 18, opacity: 0 }, '기온 = 이슬점 → 응결 시작!', svg);

    // 드래그
    let drag = false;
    E.parcel.g.addEventListener('pointerdown', ev => { drag = true; stopAuto(); E.parcel.g.setPointerCapture(ev.pointerId); ev.preventDefault(); });
    E.parcel.g.addEventListener('pointermove', ev => {
      if (!drag) return;
      const p = svgPoint(E.scene, ev);
      moveTo(Math.round(clamp(G.hOf(p.y), 0, 5) * 20) / 20);
    });
    ['pointerup', 'pointercancel'].forEach(t => E.parcel.g.addEventListener(t, () => { drag = false; }));
  }

  function buildGraph() {
    const ax = makeAxes(E.graph, {
      X0: 84, X1: 500, Y0: G.yGround, Y1: G.yTop, xmin: -30, xmax: 40, xstep: 10,
      ymin: 0, ymax: 5, ystep: 1, minorY: 0.5, xlabel: '온도 (℃)', ylabel: '높이 (km)'
    });
    E.ax = ax;
    // 배경 건조 단열선 (10 ℃/km)
    for (let T0 = -20; T0 <= 90; T0 += 10) {
      s('line', { x1: ax.gx(T0), y1: ax.gy(0), x2: ax.gx(T0 - 50), y2: ax.gy(5), stroke: '#ec7a1c', 'stroke-opacity': 0.18, 'stroke-width': 1.5, 'stroke-dasharray': '6 5' }, ax.bgLayer);
    }
    const p = ax.plot;
    E.gLcl = s('line', { x1: ax.X0, x2: ax.X1, stroke: '#a77800', 'stroke-width': 2, 'stroke-dasharray': '8 6' }, p);
    // 앞으로의 경로(흐리게)
    E.gGhostT = s('polyline', { fill: 'none', stroke: '#8aa0b5', 'stroke-width': 2.5, 'stroke-dasharray': '2 6', 'stroke-linecap': 'round' }, p);
    E.gGhostD = s('polyline', { fill: 'none', stroke: '#b9a3e4', 'stroke-width': 2.5, 'stroke-dasharray': '2 6', 'stroke-linecap': 'round' }, p);
    // 지나온 경로
    E.gDew = s('polyline', { fill: 'none', stroke: '#8656d0', 'stroke-width': 3.5, 'stroke-dasharray': '9 6', 'stroke-linecap': 'round' }, p);
    E.gDry = s('polyline', { fill: 'none', stroke: '#ec7a1c', 'stroke-width': 5, 'stroke-linecap': 'round' }, p);
    E.gMoist = s('polyline', { fill: 'none', stroke: '#2d7dd2', 'stroke-width': 5, 'stroke-linecap': 'round' }, p);
    E.gDewSat = s('polyline', { fill: 'none', stroke: '#8656d0', 'stroke-width': 2.2, 'stroke-dasharray': '7 7' }, p);
    E.gMeet = s('circle', { r: 9, fill: 'none', stroke: '#a77800', 'stroke-width': 2.5 }, p);
    E.gDotD = s('circle', { r: 7, fill: '#8656d0', stroke: '#fff', 'stroke-width': 2 }, p);
    E.gDotT = s('circle', { r: 8, stroke: '#fff', 'stroke-width': 2.5 }, p);
    E.gLabT = txt({ class: 't-lbl halo' }, '', ax.over);
    E.gLabD = txt({ class: 't-lbl halo', fill: '#6a3fb5' }, '', ax.over);
    E.gLclT = txt({ x: ax.X0 + 8, 'text-anchor': 'start', class: 't-lbl halo', fill: '#7a5800' }, '', ax.over);
    E.gMeetT = txt({ class: 't-lbl halo', fill: '#7a5800', 'font-size': 14 }, '기온 = 이슬점', ax.over);
  }

  /* ───────── 움직임 ───────── */
  function moveTo(h) {
    h = clamp(h, 0, 5);
    if (Math.abs(h - st.h) > 1e-6) {
      st.lastDir = h > st.h ? 1 : -1;
      st.moveTimer = 1.4;
    }
    st.h = h;
    render();
  }
  function toggleAuto(dir) { st.auto = st.auto === dir ? 0 : dir; syncAutoBtns(); }
  function stopAuto() { if (st.auto) { st.auto = 0; syncAutoBtns(); } }
  function syncAutoBtns() {
    ui.bUp.innerHTML = st.auto === 1 ? '⏸ 멈춤' : '▲ 자동 상승';
    ui.bDown.innerHTML = st.auto === -1 ? '⏸ 멈춤' : '▼ 자동 하강';
  }

  function tick(dt) {
    if (st.auto) {
      const nh = st.h + st.auto * 0.45 * dt;
      if (nh >= 5 || nh <= 0) { moveTo(clamp(nh, 0, 5)); stopAuto(); } else moveTo(nh);
    }
    if (st.moveTimer > 0) { st.moveTimer -= dt; if (st.moveTimer <= 0) render(); }
    if (st.flash > 0) {
      st.flash -= dt;
      E.flash.setAttribute('opacity', clamp(st.flash, 0, 1).toFixed(2));
    }
    E.parcel.tick(dt);
  }

  /* ───────── 그리기 ───────── */
  let cloudKey = '';
  function render() {
    if (!E.scene) return;
    const { T, Td, h } = st;
    const p = Physics.parcel(T, Td, h);
    const H = p.H;
    const rh = Physics.relHumidity(p.temp, p.dew);

    // 슬라이더(자동 상승 중에도 위치 표시)
    if (Math.abs(ui.sH.value - h) > 0.024) ui.sH.set(Math.round(h * 20) / 20);

    // 상태 표시
    ui.roH.innerHTML = `${fmt(h, 2)}<small>km</small>`;
    ui.roT.innerHTML = `${fmt(p.temp)}<small>℃</small>`; ui.roT.style.color = tempColor(p.temp);
    ui.roTd.innerHTML = `${fmt(p.dew)}<small>℃</small>`; ui.roTd.style.color = 'var(--dew)';
    ui.roRH.innerHTML = `${fmt(rh, 0)}<small>%</small>`; ui.roRH.style.color = 'var(--moist-ink)';
    ui.rhBar.style.width = rh.toFixed(1) + '%';
    if (p.saturated && h > 0) {
      ui.chip.className = 'state-chip sat';
      ui.chip.innerHTML = '<span>포화 · 습윤 단열 변화<br><small>기온·이슬점 모두 5 ℃/km씩 하강 → 구름 생성</small></span>';
    } else {
      ui.chip.className = 'state-chip unsat';
      ui.chip.innerHTML = '<span>불포화 · 건조 단열 변화<br><small>기온 10 ℃/km, 이슬점 2 ℃/km씩 하강</small></span>';
    }
    const moving = st.moveTimer > 0 && st.lastDir !== 0;
    ui.change.style.display = moving ? '' : 'none';
    if (moving) {
      ui.change.innerHTML = st.lastDir > 0 ? '⬆ 상승 → 단열 팽창 → 기온 하강' : '⬇ 하강 → 단열 압축 → 기온 상승';
      ui.change.className = 'state-chip ' + (st.lastDir > 0 ? 'sat' : 'unsat');
    }

    // 계산 과정
    const hb = Math.min(h, H);
    let calc = `<div class="row"><span class="lbl">응결 고도</span><span class="eq">H = ⅛(${fmt(T, 0)} − ${fmt(Td, 0)}) = <span class="res">${fmt(H, 2)} km</span></span></div>`;
    if (h <= H) {
      calc += `<div class="row"><span class="lbl">기온</span><span class="eq">${fmt(T, 0)} − <span class="dry">10</span>×${fmt(h, 2)} = <span class="res">${fmt(p.temp, 2)} ℃</span></span></div>`;
      calc += `<div class="row"><span class="lbl">이슬점</span><span class="eq">${fmt(Td, 0)} − <span class="dry">2</span>×${fmt(h, 2)} = <span class="res">${fmt(p.dew, 2)} ℃</span></span></div>`;
    } else {
      calc += `<div class="row"><span class="lbl">기온</span><span class="eq">${fmt(T, 0)} − <span class="dry">10</span>×${fmt(hb, 2)} − <span class="moist">5</span>×(${fmt(h, 2)} − ${fmt(H, 2)}) = <span class="res">${fmt(p.temp, 2)} ℃</span></span></div>`;
      calc += `<div class="row"><span class="lbl">이슬점</span><span class="eq">포화 상태 → 기온과 같음 = <span class="res">${fmt(p.dew, 2)} ℃</span></span></div>`;
    }
    ui.calc.innerHTML = calc;

    // 장면: 감률 막대
    const yH = G.yOf(Math.min(H, 5));
    sa(E.barDry, { y1: G.yGround - 4, y2: yH + 4 });
    sa(E.barMoist, { y1: yH - 4, y2: G.yTop + 4, opacity: H < 5 ? 1 : 0 });
    const midDry = (G.yGround + yH) / 2, midMoist = (yH + G.yTop) / 2;
    sa(E.barDryT, { x: 0, y: 0, transform: `translate(487 ${midDry}) rotate(-90)`, opacity: (G.yGround - yH) > 175 ? 1 : 0 });
    sa(E.barMoistT, { x: 0, y: 0, transform: `translate(487 ${midMoist}) rotate(-90)`, opacity: (yH - G.yTop) > 175 ? 1 : 0 });
    // 응결 고도
    sa(E.lcl, { y1: yH, y2: yH, opacity: H <= 5 ? 1 : 0 });
    sa(E.lclT, { y: yH - 9, opacity: H <= 5 ? 1 : 0 });
    E.lclT.textContent = `상승 응결 고도 ${fmt(H, 2)} km`;

    // 구름: 상승 응결 고도부터 덩어리 높이까지
    const key = h > H ? `${H.toFixed(3)}|${Math.min(h, 5).toFixed(2)}` : 'none';
    if (key !== cloudKey) {
      cloudKey = key;
      E.cloud.innerHTML = '';
      if (h > H + 0.02) {
        const baseY = G.yOf(H), topY = G.yOf(Math.min(h, 5)) - 26;
        cumulusCloud(E.cloud, G.x, baseY + 2, topY, 260, 'white', 21);
      }
    }
    // 처음 포화되는 순간 알림
    if (p.saturated && h > 0 && !st.prevSat) { st.flash = 2.2; sa(E.flash, { y: yH + 36 }); }
    st.prevSat = p.saturated && h > 0;

    // 공기 덩어리 (높을수록 팽창)
    const r = 24 + 5 * h;
    const y = G.yOf(h) - r;
    E.parcel.setState({ r, sat: p.saturated && h > 0, temp: p.temp });
    E.parcel.g.setAttribute('transform', `translate(${G.x} ${y.toFixed(1)})`);

    // 설명 꼬리표 (덩어리 왼쪽)
    const tx = G.x - r - 16, ty = clamp(y, 86, G.yGround - 60);
    const lines = moving ? 3 : 2;
    sa(E.tagBg, { x: tx - 158, y: ty - 30, width: 166, height: lines === 3 ? 80 : 58 });
    sa(E.tagT, { x: tx, y: ty - 2, fill: tempColor(p.temp) }); E.tagT.textContent = `기온 ${fmt(p.temp)} ℃`;
    sa(E.tagTd, { x: tx, y: ty + 20, fill: '#6a3fb5' }); E.tagTd.textContent = `이슬점 ${fmt(p.dew)} ℃`;
    sa(E.tagMove, { x: tx, y: ty + 41, fill: st.lastDir > 0 ? '#17599f' : '#a8500a', opacity: moving ? 1 : 0 });
    E.tagMove.textContent = st.lastDir > 0 ? '↑ 단열 팽창 · 냉각' : '↓ 단열 압축 · 승온';

    renderGraph(p, H);
    missionLive(p, H);
  }

  function renderGraph(p, H) {
    const ax = E.ax, { T, Td, h } = st;
    const Hc = Math.min(H, 5);
    sa(E.gLcl, { y1: ax.gy(Hc), y2: ax.gy(Hc), opacity: H <= 5 ? 1 : 0 });
    sa(E.gLclT, { y: ax.gy(Hc) - 8, opacity: H <= 5 ? 1 : 0 });
    E.gLclT.textContent = `상승 응결 고도 H = ${fmt(H, 2)} km`;
    // 전체 경로(흐리게)
    const tLCL = T - 10 * Hc;
    sa(E.gGhostT, { points: pts(H < 5 ? [[T, 0], [tLCL, Hc], [tLCL - 5 * (5 - Hc), 5]] : [[T, 0], [T - 50, 5]], ax) });
    sa(E.gGhostD, { points: pts([[Td, 0], [Td - 2 * Hc, Hc]], ax) });
    // 지나온 경로
    const hb = Math.min(h, H);
    sa(E.gDry, { points: pts([[T, 0], [T - 10 * hb, hb]], ax) });
    sa(E.gDew, { points: pts([[Td, 0], [Td - 2 * hb, hb]], ax) });
    if (h > H) {
      sa(E.gMoist, { points: pts([[tLCL, H], [p.temp, h]], ax) });
      sa(E.gDewSat, { points: pts([[tLCL, H], [p.temp, h]], ax) });
    } else { sa(E.gMoist, { points: '' }); sa(E.gDewSat, { points: '' }); }
    sa(E.gMeet, { cx: ax.gx(tLCL), cy: ax.gy(Hc), opacity: H <= 5 ? 1 : 0 });
    sa(E.gMeetT, { x: ax.gx(tLCL) - 14, y: ax.gy(Hc) + 22, 'text-anchor': 'end', opacity: H <= 5 ? 1 : 0 });
    // 현재 점
    const sat = p.saturated && h > 0;
    sa(E.gDotT, { cx: ax.gx(p.temp), cy: ax.gy(h), fill: sat ? '#2d7dd2' : '#ec7a1c' });
    sa(E.gDotD, { cx: ax.gx(p.dew), cy: ax.gy(h), opacity: sat ? 0 : 1 });
    const ly = clamp(ax.gy(h) - 14, ax.Y1 + 16, ax.Y0 - 8);
    sa(E.gLabT, { x: ax.gx(p.temp) + 12, y: ly, fill: sat ? '#17599f' : '#a8500a' });
    E.gLabT.textContent = sat ? `기온 = 이슬점 ${fmt(p.temp)} ℃` : `기온 ${fmt(p.temp)} ℃`;
    sa(E.gLabD, { x: ax.gx(p.dew) - 12, y: ly, 'text-anchor': 'end', opacity: sat ? 0 : 1 });
    E.gLabD.textContent = `이슬점 ${fmt(p.dew)} ℃`;
  }

  /* ───────── 미션 ───────── */
  const checkers = [
    () => st.h > 0 && st.h >= Physics.lcl(st.T, st.Td),
    () => {
      const H = Physics.lcl(st.T, st.Td);
      return Math.abs(H - TUNING.tab1.m2_targetH) <= TUNING.tab1.m2_tolH && st.h >= H && st.h > 0;
    },
    () => {
      const c = TUNING.tab1;
      if (st.T !== c.m3_fixedT || Math.abs(st.h - c.m3_targetHeight) > c.m3_tolHeight) return false;
      return Math.abs(Physics.parcel(st.T, st.Td, st.h).temp - c.m3_targetTemp) <= c.m3_tolTemp;
    }
  ];
  function missionLive(p, H) {
    if (!missionOn(TAB)) return;
    const idx = currentMission(TAB), c = TUNING.tab1;
    if (idx === 0) setMissionLive(TAB, `공기 덩어리 높이 ${fmt(st.h, 2)} km / 상승 응결 고도 ${fmt(H, 2)} km`);
    if (idx === 1) {
      const ok = Math.abs(H - c.m2_targetH) <= c.m2_tolH;
      setMissionLive(TAB, `지금 상승 응결 고도 H = <span class="${ok ? 'good' : 'bad'}">${fmt(H, 2)} km</span> (목표 ${fmt(c.m2_targetH, 1)} km)`);
    }
    if (idx === 2) setMissionLive(TAB, `공기 덩어리: ${fmt(st.h, 2)} km에서 ${fmt(p.temp, 2)} ℃ (목표: ${fmt(c.m3_targetHeight, 1)} km에서 ${fmt(c.m3_targetTemp, 1)} ℃)`);
    checkMission(TAB, checkers);
  }

  registerTab(TAB, { init, tick, onShow: render });
})();
