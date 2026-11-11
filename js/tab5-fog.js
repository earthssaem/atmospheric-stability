/**
 * tab5-fog.js — 5. 안개의 생성 (복사 안개 · 이류 안개 · 활승 안개)
 * 안개 = 지표 부근의 공기가 이슬점까지 냉각되어 수증기가 응결한 것
 */
'use strict';

(function () {
  const TAB = 'tab5';
  const COAST = 150; // 이류 안개: 차가운 바다를 건너 해안까지의 거리 (km)
  const st = {
    kind: 'rad',
    p: { rad: 0, adv: 0, up: 0 },  // 진행도 0~1
    playing: false,
    rad: { sky: 'cloudy', wind: 'strong', T0: 16, Td: 4 },
    adv: { Tair: 24, Td: 18, Tsea: 20, fogReach: 0 },
    up: { T: 18, Td: 10, M: 1.5, top: 0 }
  };
  const E = {}, ui = {};
  const W = 800, HH = 460;

  registerMissions(TAB, [
    {
      title: '밤사이 분지에 복사 안개를 만들어라',
      desc: '복사 안개 실험에서 하늘·바람·이슬점을 조절하고 밤을 지나게 해 새벽에 안개가 끼게 하세요.',
      hint: '복사 안개는 <b>바람이 거의 없고 맑은 날</b> 밤에 지표면이 복사 냉각되어 생겨요. 또 공기가 충분히 습해야(이슬점이 높아야) 기온이 이슬점까지 내려갈 수 있어요.'
    },
    {
      title: '해무(이류 안개)가 해안을 덮게 하라',
      desc: '이류 안개 실험에서 온난 습윤한 공기가 차가운 바다를 건너 해안(150 km)에 닿기 전에 안개가 생기도록 하세요.',
      hint: '공기는 차가운 바다 위를 지나며 바닷물 온도에 가까워질 때까지 식어요. 바닷물 온도가 공기의 <b>이슬점보다 충분히 낮아야</b> 안개가 생겨요.'
    },
    {
      title: '산 중턱 0.5 km부터 활승 안개가 끼게 하라',
      desc: '활승 안개 실험에서 안개가 높이 0.5 km에서부터 생기도록 기온과 이슬점을 맞춘 뒤, 공기를 산 위로 올려 보내세요.',
      hint: '산 사면을 오르는 공기는 단열 팽창으로 식어 상승 응결 고도에서 응결해요. H = ⅛(T − Td) = 0.5 km가 되려면 T − Td = ?'
    }
  ], { onModeChange: () => render() });

  /* ───────── 화면 만들기 ───────── */
  function init(panel) {
    LessonHead(panel, {
      tag: '9차시 · 안개의 생성',
      q: '안개는 언제, 어떻게 생길까?',
      sub: '지표 부근의 공기가 이슬점까지 냉각되는 세 가지 방법을 실험해 보세요.',
      missionTab: TAB
    });
    panel.appendChild(h('div', { class: 'mission-card', id: 'mission-' + TAB }));
    ui.kindSeg = Seg([
      { value: 'rad', label: '🌙 복사 안개' }, { value: 'adv', label: '🌊 이류 안개' }, { value: 'up', label: '⛰️ 활승 안개' }
    ], st.kind, v => { st.kind = v; st.playing = false; syncKind(); render(); }, 'kind-seg');
    panel.appendChild(h('div', { class: 'kind-row' }, ui.kindSeg.el, ui.kindDesc = h('span', { class: 'kind-desc' })));

    const ws = h('div', { class: 'workspace ws-wide' });
    const side = h('div', { class: 'side' });
    const cSet = Card({ title: '조건 설정' });
    ui.ctrlRad = h('div', { class: 'controls' });
    ui.ctrlAdv = h('div', { class: 'controls' });
    ui.ctrlUp = h('div', { class: 'controls' });
    // 복사 안개
    ui.radSky = Seg([{ value: 'clear', label: '☀️ 맑음' }, { value: 'cloudy', label: '☁️ 흐림' }], st.rad.sky, v => { st.rad.sky = v; render(); }, 'block');
    ui.radWind = Seg([{ value: 'calm', label: '바람 약함' }, { value: 'strong', label: '🌬️ 바람 강함' }], st.rad.wind, v => { st.rad.wind = v; render(); }, 'block');
    ui.radT0 = Slider({ label: '저녁 6시 기온', min: 10, max: 25, step: 1, value: st.rad.T0, unit: ' ℃', colorize: tempColor,
      onInput: v => { st.rad.T0 = v; clampRad(); render(); } });
    ui.radTd = Slider({ label: '이슬점', min: 0, max: 20, step: 1, value: st.rad.Td, unit: ' ℃', color: 'var(--dew)', colorize: () => 'var(--dew)',
      note: '저녁 기온보다 5 ℃ 이상 낮게만 정할 수 있어요.', onInput: v => { st.rad.Td = v; render(); } });
    ui.ctrlRad.append(h('div', { class: 'ctrl' }, h('div', { class: 'ctrl-top' }, h('label', { text: '하늘 상태' })), ui.radSky.el),
      h('div', { class: 'ctrl' }, h('div', { class: 'ctrl-top' }, h('label', { text: '바람' })), ui.radWind.el), ui.radT0.el, ui.radTd.el);
    // 이류 안개
    ui.advT = Slider({ label: '공기 기온', min: 15, max: 28, step: 1, value: st.adv.Tair, unit: ' ℃', colorize: tempColor,
      onInput: v => { st.adv.Tair = v; clampAdv(); resetProgress(); } });
    ui.advTd = Slider({ label: '공기 이슬점', min: 8, max: 27, step: 1, value: st.adv.Td, unit: ' ℃', color: 'var(--dew)', colorize: () => 'var(--dew)',
      onInput: v => { st.adv.Td = v; resetProgress(); } });
    ui.advSea = Slider({ label: '차가운 바다 수온', min: 5, max: 25, step: 0.5, value: st.adv.Tsea, unit: ' ℃', digits: 1, color: '#1f6fae', colorize: tempColor,
      onInput: v => { st.adv.Tsea = v; resetProgress(); } });
    ui.ctrlAdv.append(ui.advT.el, ui.advTd.el, ui.advSea.el);
    // 활승 안개
    ui.upT = Slider({ label: '지표 기온', min: 10, max: 30, step: 1, value: st.up.T, unit: ' ℃', colorize: tempColor,
      onInput: v => { st.up.T = v; clampUp(); resetProgress(); } });
    ui.upTd = Slider({ label: '지표 이슬점', min: 0, max: 29, step: 1, value: st.up.Td, unit: ' ℃', color: 'var(--dew)', colorize: () => 'var(--dew)',
      onInput: v => { st.up.Td = v; resetProgress(); } });
    ui.upM = Slider({ label: '산 높이', min: 0.5, max: 2, step: 0.1, value: st.up.M, unit: ' km', digits: 1, color: '#4f8a3a',
      onInput: v => { st.up.M = v; resetProgress(); } });
    ui.ctrlUp.append(ui.upT.el, ui.upTd.el, ui.upM.el);

    ui.play = Btn('▶ 진행', 'big', togglePlay);
    ui.prog = Slider({ label: '진행', min: 0, max: 1000, step: 1, value: 0, color: 'var(--ink-2)', format: () => progLabel(),
      onInput: v => { st.playing = false; ui.play.innerHTML = '▶ 진행'; st.p[st.kind] = v / 1000; render(); } });
    cSet.body.append(ui.ctrlRad, ui.ctrlAdv, ui.ctrlUp, h('div', { class: 'controls', style: { marginTop: '14px' } }, ui.play, ui.prog.el));
    side.appendChild(cSet.el);

    const cState = Card({ title: '지표 부근 공기' });
    ui.fogChip = h('div', { class: 'state-chip' });
    ui.roT = h('div', { class: 'v num' }); ui.roTd = h('div', { class: 'v num' });
    ui.roRH = h('div', { class: 'v num' }); ui.rhBar = h('span'); ui.roX = h('div', { class: 'v num' }); ui.roXk = h('div', { class: 'k' });
    cState.body.append(ui.fogChip, h('div', { class: 'readout', style: { marginTop: '10px' } },
      h('div', { class: 'ro' }, ui.roXk, ui.roX),
      h('div', { class: 'ro' }, h('div', { class: 'k', text: '상대 습도' }), ui.roRH, h('div', { class: 'rh-bar', style: { marginTop: '4px', height: '8px' } }, ui.rhBar)),
      h('div', { class: 'ro' }, h('div', { class: 'k', text: '기온' }), ui.roT),
      h('div', { class: 'ro' }, h('div', { class: 'k', text: '이슬점' }), ui.roTd)
    ));
    side.appendChild(cState.el);

    const cScene = Card({ title: '장면', cls: 'viz', pad: false });
    ui.sceneTitle = cScene.head.querySelector('.card-title');
    E.scenes = {};
    ['rad', 'adv', 'up'].forEach(k => { E.scenes[k] = svgRoot(W, HH, '안개 장면'); cScene.body.appendChild(h('div', { class: 'svg-wrap scene-' + k }, E.scenes[k])); });
    const cChart = Card({ title: '기온과 이슬점', cls: 'viz', pad: false, legend: legendItem('var(--hot)', '기온') + legendItem('var(--dew)', '이슬점', 'dash') });
    ui.chartTitle = cChart.head.querySelector('.card-title');
    E.charts = {};
    ['rad', 'adv', 'up'].forEach(k => { E.charts[k] = svgRoot(440, 400, '기온과 이슬점 그래프'); cChart.body.appendChild(h('div', { class: 'svg-wrap chart-' + k }, E.charts[k])); });
    ui.chartNote = h('div', { class: 'result-box' });
    cChart.body.appendChild(ui.chartNote);
    ws.append(side, cScene.el, cChart.el);
    panel.appendChild(ws);

    panel.appendChild(h('div', { class: 'info-grid' },
      ConceptCard('안개의 생성', [
        '지표면 부근에서 수증기가 응결해 생긴 작은 물방울이 공기 중에 떠 있는 것 = <b>안개</b>',
        '<b>복사 안개</b>: 바람이 거의 없고 맑은 날 밤, 지표면의 복사 냉각으로 기온이 이슬점까지 내려가 생긴다.',
        '<b>이류 안개</b>: 온난 습윤한 공기가 차가운 지표(바다) 위로 이동하며 냉각되어 생긴다. 차가운 해류가 흐르는 바다·연안의 이류 안개 = <b>해무</b>',
        '<b>활승 안개</b>: 지표 부근의 온난 습윤한 공기가 산 사면을 따라 상승하며 <b>단열 팽창</b>으로 냉각되어 생긴다.',
        '복사 안개와 이류 안개는 주로 <b>대기가 안정할 때</b> 지표면 부근의 공기가 냉각되어 생긴다.'
      ], '교과서 그림 Ⅲ-18 · Ⅲ-19 · Ⅲ-20'),
      ConceptCard('안개의 또 다른 종류', [
        '<b>증발 안개</b>(김 안개): 찬 공기가 따뜻한 수면 위를 이동할 때 수면에서 증발한 수증기가 응결해 생긴다.',
        '<b>전선 안개</b>(강수 안개): 전선 부근에서 내린 빗방울이 차가운 하층 대기에서 증발하여 공기가 포화되어 생긴다. 한랭 전선보다 온난 전선에서 더 많이 발생한다.',
        '증발 안개와 전선 안개는 공기가 식는 것이 아니라 <b>수증기량이 증가</b>해 생긴다.',
        '안개는 지표 부근에서, 구름은 높은 고도에서 응결한 것으로 <b>본질적으로는 같다</b>.'
      ]),
      ThinkCard('어떤 안개일까?', [
        { q: '맑고 바람이 없는 가을날 새벽, 분지 마을에 짙게 낀 안개는?', a: '<b>복사 안개</b> — 밤새 지표면이 복사 냉각되어 지표 부근 공기가 이슬점까지 식었다.' },
        { q: '따뜻하고 습한 남풍이 차가운 바다 위로 불어올 때 해안에 밀려든 안개는?', a: '<b>이류 안개(해무)</b> — 온난 습윤한 공기가 차가운 해수면 위를 이동하며 냉각되었다.' },
        { q: '습한 공기가 산 사면을 타고 올라가며 산 중턱에 낀 안개는?', a: '<b>활승 안개</b> — 공기가 사면을 따라 상승하며 단열 팽창으로 냉각되었다.' },
        { q: '추운 겨울 아침, 따뜻한 강물 위에 피어오르는 김 같은 안개는?', a: '<b>증발 안개</b> — 찬 공기가 따뜻한 수면 위를 지날 때 수면에서 증발한 수증기가 응결했다.' }
      ])
    ));

    buildRad(); buildAdv(); buildUp();
    clampRad(); clampAdv(); clampUp();
    syncKind();
    render();
  }

  function clampRad() { ui.radTd.setMax(st.rad.T0 - 5); if (st.rad.Td > st.rad.T0 - 5) st.rad.Td = st.rad.T0 - 5; ui.radTd.set(st.rad.Td); }
  function clampAdv() { ui.advTd.setMax(st.adv.Tair - 1); if (st.adv.Td > st.adv.Tair - 1) st.adv.Td = st.adv.Tair - 1; ui.advTd.set(st.adv.Td); }
  function clampUp() { ui.upTd.setMax(st.up.T - 1); if (st.up.Td > st.up.T - 1) st.up.Td = st.up.T - 1; ui.upTd.set(st.up.Td); }

  const DESC = {
    rad: '맑고 바람 없는 밤, 지표면이 열을 내보내며(복사 냉각) 식어 생기는 안개',
    adv: '온난 습윤한 공기가 차가운 바다 위로 이동하며 식어 생기는 안개 (해무)',
    up: '습한 공기가 산 사면을 타고 올라가며 단열 팽창으로 식어 생기는 안개'
  };
  function syncKind() {
    ['rad', 'adv', 'up'].forEach(k => {
      const on = st.kind === k;
      E.scenes[k].parentNode.style.display = on ? '' : 'none';
      E.charts[k].parentNode.style.display = on ? '' : 'none';
    });
    ui.ctrlRad.style.display = st.kind === 'rad' ? '' : 'none';
    ui.ctrlAdv.style.display = st.kind === 'adv' ? '' : 'none';
    ui.ctrlUp.style.display = st.kind === 'up' ? '' : 'none';
    ui.kindDesc.textContent = DESC[st.kind];
    ui.sceneTitle.innerHTML = '<span class="dot"></span>' + { rad: '분지 마을의 밤', adv: '차가운 바다와 해안', up: '산 사면' }[st.kind];
    ui.chartTitle.innerHTML = '<span class="dot"></span>' + { rad: '시각에 따른 기온·이슬점', adv: '이동 거리에 따른 기온·이슬점', up: '높이에 따른 기온·이슬점' }[st.kind];
    ui.prog.set(Math.round(st.p[st.kind] * 1000));
    ui.play.innerHTML = '▶ 진행';
  }
  function resetProgress() { st.p[st.kind] = 0; st.adv.fogReach = 0; st.up.top = 0; st.playing = false; ui.play.innerHTML = '▶ 진행'; ui.prog.set(0); render(); }
  function togglePlay() {
    if (st.playing) { st.playing = false; ui.play.innerHTML = '▶ 진행'; return; }
    if (st.p[st.kind] >= 1) { st.p[st.kind] = 0; st.adv.fogReach = 0; st.up.top = 0; }
    st.playing = true; ui.play.innerHTML = '⏸ 멈춤';
  }
  function tick(dt) {
    if (st.playing) {
      const dur = { rad: 12, adv: 9, up: 8 }[st.kind];
      st.p[st.kind] = Math.min(1, st.p[st.kind] + dt / dur);
      ui.prog.set(Math.round(st.p[st.kind] * 1000));
      if (st.p[st.kind] >= 1) { st.playing = false; ui.play.innerHTML = '↺ 다시'; }
      render();
    }
  }

  /* 진행도 → 각 실험의 값 */
  const radHour = () => st.p.rad * 15;                   // 18시 기준 경과 시간 (0~15 h)
  const advDist = () => -20 + st.p.adv * 200;             // 이동 거리 (km), 0 = 차가운 바다 시작
  const upPos = () => st.p.up;                            // 0~1 (평지 → 정상)
  function clock(hr) {
    const t = (18 + hr) % 24;
    const hh = Math.floor(t), mm = Math.round((t - hh) * 60) % 60;
    return `${hh < 12 ? '오전' : '오후'} ${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')}`;
  }
  function progLabel() {
    if (!ui.prog) return '';
    if (st.kind === 'rad') return clock(radHour());
    if (st.kind === 'adv') return `${fmt(Math.max(0, advDist()), 0)}<small> km</small>`;
    return `${fmt(upHeight(), 2)}<small> km</small>`;
  }

  /* ───────── 복사 안개 ───────── */
  function radState(hr) {
    const { sky, wind, T0, Td } = st.rad;
    const drop = Physics.radiationDrop(sky, wind);
    const model = Physics.nightTemp(T0, hr, drop);
    const fog = clamp((Td - model) / 2.5, 0, 1);
    return { model, T: Math.max(model, Td - 0.4 * fog), Td, fog };
  }
  function buildRad() {
    const svg = E.scenes.rad;
    const defs = s('defs', null, svg);
    const gr = s('linearGradient', { id: 'radSky', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    E.radStop1 = s('stop', { offset: '0%' }, gr); E.radStop2 = s('stop', { offset: '100%' }, gr);
    const blur = s('filter', { id: 'fogBlur', x: '-20%', y: '-60%', width: '140%', height: '220%' }, defs);
    s('feGaussianBlur', { stdDeviation: 10 }, blur);
    E.radSky = s('rect', { x: 0, y: 0, width: W, height: HH, fill: 'url(#radSky)' }, svg);
    E.stars = s('g', null, svg);
    const R = rng(4);
    for (let i = 0; i < 46; i++) s('circle', { cx: R() * W, cy: R() * 230, r: 0.8 + R() * 1.6, fill: '#fff' }, E.stars);
    E.moon = s('g', null, svg);
    s('circle', { cx: 660, cy: 74, r: 24, fill: '#fdf6d8' }, E.moon);
    s('circle', { cx: 670, cy: 66, r: 22, fill: '#0e1a36', opacity: 0.0, class: 'moon-shade' }, E.moon);
    E.sun = s('circle', { cx: 700, cy: 300, r: 26, fill: '#ffd66b' }, svg);
    E.cover = s('g', null, svg);
    stratusCloud(E.cover, -20, W + 20, 120, 60, 'gray', 3);
    stratusCloud(E.cover, 120, W - 60, 80, 40, 'gray', 8);
    // 산과 분지
    E.hills = s('g', null, svg);
    s('path', { d: `M0 ${HH} L0 170 C90 175 180 280 300 372 L300 ${HH} Z`, class: 'hill-a' }, E.hills);
    s('path', { d: `M${W} ${HH} L${W} 160 C700 170 610 280 500 372 L500 ${HH} Z`, class: 'hill-a' }, E.hills);
    s('path', { d: `M0 ${HH} L0 250 C120 260 220 330 340 376 L340 ${HH} Z`, class: 'hill-b' }, E.hills);
    s('path', { d: `M${W} ${HH} L${W} 240 C690 250 580 330 460 376 L460 ${HH} Z`, class: 'hill-b' }, E.hills);
    E.ground = s('rect', { x: 0, y: 372, width: W, height: HH - 372 }, svg);
    // 마을
    E.village = s('g', null, svg);
    [[250, 1], [318, 0.9], [386, 1.1], [462, 0.95], [530, 1]].forEach(([x, sc], i) => {
      const g = s('g', { transform: `translate(${x} 372) scale(${sc})` }, E.village);
      s('rect', { x: -18, y: -26, width: 36, height: 26, fill: '#e8dcc7' }, g);
      s('path', { d: 'M-23 -24 L0 -44 L23 -24 Z', fill: i % 2 ? '#a5523b' : '#5c6f8a' }, g);
      s('rect', { x: -7, y: -18, width: 10, height: 9, class: 'win' }, g);
    });
    E.trees = s('g', null, svg);
    [180, 215, 600, 640, 420].forEach((x, i) => {
      const g = s('g', { transform: `translate(${x} 374)` }, E.trees);
      s('rect', { x: -2.5, y: -14, width: 5, height: 14, fill: '#5b4630' }, g);
      s('path', { d: 'M0 -52 L14 -12 L-14 -12 Z', fill: i % 2 ? '#2f6b3a' : '#3c7d45' }, g);
    });
    // 복사 냉각 화살표
    E.radArrows = s('g', null, svg);
    E.radLabel = txt({ x: 400, y: 252, 'text-anchor': 'middle', class: 't-lbl halo-sky', 'font-size': 18, fill: '#c2331f' }, '', svg);
    E.windR = s('g', null, svg);
    for (let i = 0; i < 5; i++) {
      const y = 300 + i * 14;
      s('line', { x1: 140 + i * 40, y1: y, x2: 260 + i * 40, y2: y, stroke: '#fff', 'stroke-width': 2.5, 'stroke-dasharray': '16 12', class: 'wind-line', 'stroke-linecap': 'round', opacity: 0.8 }, E.windR);
    }
    E.fogR = s('g', { filter: 'url(#fogBlur)' }, svg);
    E.radTime = txt({ x: 22, y: 40, class: 't-big', fill: '#fff', 'font-size': 26 }, '', svg);

    const ax = makeAxes(E.charts.rad, { X0: 64, X1: 424, Y0: 330, Y1: 20, xmin: 0, xmax: 15, xstep: 3, ymin: -5, ymax: 30, ystep: 5,
      xfmt: v => `${(18 + v) % 24}시`, xlabel: '시각', ylabel: '온도 (℃)', ylabelGap: 44 });
    E.axR = ax;
    E.rFog = s('rect', { y: ax.Y1, height: ax.Y0 - ax.Y1, fill: '#cdd6df', opacity: 0.55 }, ax.bgLayer);
    E.rFogT = txt({ class: 't-lbl', 'font-size': 14, fill: '#4b5a68', 'text-anchor': 'middle' }, '안개', ax.over);
    E.rTd = s('polyline', { fill: 'none', stroke: '#8656d0', 'stroke-width': 3, 'stroke-dasharray': '9 6' }, ax.plot);
    E.rTall = s('polyline', { fill: 'none', stroke: '#d9382a', 'stroke-width': 2, 'stroke-opacity': 0.25 }, ax.plot);
    E.rT = s('polyline', { fill: 'none', stroke: '#d9382a', 'stroke-width': 4, 'stroke-linecap': 'round' }, ax.plot);
    E.rNow = s('line', { y1: ax.Y0, y2: ax.Y1, stroke: '#13283d', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }, ax.plot);
    E.rDot = s('circle', { r: 7, fill: '#d9382a', stroke: '#fff', 'stroke-width': 2 }, ax.plot);
    E.rSun = txt({ class: 't-lbl', 'font-size': 13, fill: '#b7791f', 'text-anchor': 'middle' }, '☀ 해 뜸', ax.over);
  }
  function lerpColor(a, b, t) {
    const pa = a.match(/\w\w/g).map(x => parseInt(x, 16)), pb = b.match(/\w\w/g).map(x => parseInt(x, 16));
    return '#' + pa.map((v, i) => Math.round(lerp(v, pb[i], t)).toString(16).padStart(2, '0')).join('');
  }
  function skyAt(hr) {
    const K = [[0, '#41629a', '#f0a36b'], [2, '#14244a', '#34497a'], [11.5, '#14244a', '#34497a'], [12.6, '#3c5a92', '#f3a985'], [13.6, '#5aa3df', '#ffe6c2'], [15, '#5aa3df', '#e6f4ff']];
    for (let i = 0; i < K.length - 1; i++) {
      if (hr <= K[i + 1][0]) {
        const t = (hr - K[i][0]) / (K[i + 1][0] - K[i][0]);
        return [lerpColor(K[i][1].slice(1), K[i + 1][1].slice(1), t), lerpColor(K[i][2].slice(1), K[i + 1][2].slice(1), t)];
      }
    }
    return [K[K.length - 1][1], K[K.length - 1][2]];
  }
  function renderRad() {
    const hr = radHour();
    const r = radState(hr);
    const { sky, wind } = st.rad;
    const night = hr > 1.2 && hr < 12.6;
    const [c1, c2] = skyAt(hr);
    sa(E.radStop1, { 'stop-color': c1 }); sa(E.radStop2, { 'stop-color': c2 });
    const dark = hr < 12.8 ? (hr < 1.5 ? hr / 1.5 : 1) : clamp(1 - (hr - 12.8) / 1.2, 0, 1);
    sa(E.stars, { opacity: sky === 'clear' ? (dark * 0.9).toFixed(2) : 0 });
    sa(E.moon, { opacity: sky === 'clear' && night ? 1 : 0 });
    const sunY = hr < 12.5 ? 420 : clamp(330 - (hr - 12.5) * 90, 110, 330);
    sa(E.sun, { cy: sunY, opacity: hr > 12.4 ? 1 : 0 });
    sa(E.cover, { display: sky === 'cloudy' ? '' : 'none', opacity: lerp(1, 0.75, dark) });
    E.hills.querySelectorAll('.hill-a').forEach(n => n.setAttribute('fill', lerpColor('6f9a55', '1f3326', dark)));
    E.hills.querySelectorAll('.hill-b').forEach(n => n.setAttribute('fill', lerpColor('5b8a46', '18291e', dark)));
    sa(E.ground, { fill: lerpColor('79b95c', '1c3020', dark) });
    E.village.querySelectorAll('.win').forEach(n => n.setAttribute('fill', dark > 0.5 ? '#ffd76a' : '#8fb3d1'));
    E.trees.setAttribute('transform', wind === 'strong' ? 'skewX(-6)' : '');
    sa(E.windR, { opacity: wind === 'strong' ? 1 : 0 });
    // 복사 냉각 화살표
    E.radArrows.innerHTML = '';
    if (hr < 12.5) {
      const xs = [190, 300, 410, 520, 630];
      xs.forEach((x, i) => {
        const y0 = 360, top = sky === 'clear' ? 150 : 150;
        if (sky === 'clear') {
          s('path', { d: `M${x} ${y0} q-8 -18 0 -36 t0 -36 t0 -36 t0 -36`, fill: 'none', stroke: '#ff7a59', 'stroke-width': 3.5, 'stroke-linecap': 'round', opacity: 0.85 }, E.radArrows);
          s('path', { d: `M${x - 8} ${y0 - 136} L${x} ${y0 - 150} L${x + 8} ${y0 - 136}`, fill: 'none', stroke: '#ff7a59', 'stroke-width': 3.5, 'stroke-linecap': 'round' }, E.radArrows);
        } else {
          s('path', { d: `M${x} ${y0} q-8 -18 0 -36 t0 -36 t0 -36 t0 -36`, fill: 'none', stroke: '#ff7a59', 'stroke-width': 3.5, 'stroke-linecap': 'round', opacity: 0.85 }, E.radArrows);
          s('path', { d: `M${x + 14} ${y0 - 140} q8 18 0 36 t0 36 t0 36`, fill: 'none', stroke: '#ffb199', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': '5 5' }, E.radArrows);
          s('path', { d: `M${x + 6} ${y0 - 48} L${x + 14} ${y0 - 34} L${x + 22} ${y0 - 48}`, fill: 'none', stroke: '#ffb199', 'stroke-width': 3, 'stroke-linecap': 'round' }, E.radArrows);
        }
        void top; void i;
      });
      E.radLabel.textContent = sky === 'clear' ? '지표면 복사 냉각 → 열이 우주로 빠져나감' : '구름이 지표 복사를 되돌려 보냄 → 덜 식음';
      sa(E.radLabel, { opacity: 1, y: 190 });
    } else sa(E.radLabel, { opacity: 0 });
    // 안개
    E.fogR.innerHTML = '';
    if (r.fog > 0.02) {
      const th = 16 + 70 * r.fog;
      for (let i = 0; i < 8; i++) {
        s('ellipse', { cx: 120 + i * 80, cy: 376 - th * 0.3, rx: 100, ry: th * 0.55, fill: '#eef2f6', opacity: (0.22 + 0.5 * r.fog).toFixed(2) }, E.fogR);
      }
    }
    E.radTime.textContent = clock(hr);
    sa(E.radTime, { fill: dark > 0.4 ? '#fff' : '#13283d' });

    // 그래프
    const ax = E.axR;
    const all = [], cur = [];
    let f0 = null, f1 = null;
    for (let t = 0; t <= 15.0001; t += 0.1) {
      const q = radState(t);
      all.push([t, q.T]);
      if (t <= hr + 1e-9) cur.push([t, q.T]);
      if (q.fog > 0.02) { if (f0 == null) f0 = t; f1 = t; }
    }
    sa(E.rTall, { points: pts(all, ax) });
    sa(E.rT, { points: pts(cur, ax) });
    sa(E.rTd, { points: pts([[0, r.Td], [15, r.Td]], ax) });
    sa(E.rNow, { x1: ax.gx(hr), x2: ax.gx(hr) });
    sa(E.rDot, { cx: ax.gx(hr), cy: ax.gy(r.T) });
    const showFog = f0 != null && f0 <= hr;
    sa(E.rFog, { x: ax.gx(f0 || 0), width: showFog ? ax.gx(Math.min(f1, hr)) - ax.gx(f0) : 0 });
    sa(E.rFogT, { x: ax.gx(((f0 || 0) + Math.min(f1 || 0, hr)) / 2), y: ax.Y1 + 18, opacity: showFog && Math.min(f1, hr) - f0 > 0.8 ? 1 : 0 });
    sa(E.rSun, { x: ax.gx(12.5), y: ax.Y1 + 34 });
    return { T: r.T, Td: r.Td, fog: r.fog, xk: '시각', xv: clock(hr) };
  }

  /* ───────── 이류 안개 ───────── */
  const AX = { x0: 120, xc: 600 };  // 차가운 바다 시작, 해안 (px)
  const dX = d => AX.x0 + d / COAST * (AX.xc - AX.x0);
  function advT(d) { return d <= 0 ? st.adv.Tair : Physics.advectionTemp(st.adv.Tair, st.adv.Tsea, Math.min(d, COAST)); }
  function buildAdv() {
    const svg = E.scenes.adv;
    const d = skyDefs(svg, '#8fb8d8', '#e9f2f8');
    const blur = s('filter', { id: 'fogBlur2', x: '-20%', y: '-60%', width: '140%', height: '220%' }, d.defs);
    s('feGaussianBlur', { stdDeviation: 9 }, blur);
    s('rect', { x: 0, y: 0, width: W, height: 300, fill: d.sky }, svg);
    s('rect', { x: 0, y: 300, width: AX.x0, height: HH - 300, fill: '#3fa5c9' }, svg);
    E.coldSea = s('rect', { x: AX.x0, y: 300, width: AX.xc - AX.x0 + 30, height: HH - 300, fill: '#1d5f96' }, svg);
    s('path', { d: `M${AX.xc + 10} 300 L${W} 300 L${W} ${HH} L${AX.xc + 40} ${HH} Z`, fill: '#e6cf9c' }, svg);
    s('path', { d: `M${AX.xc + 60} 300 L${W} 300 L${W} ${HH} L${AX.xc + 90} ${HH} Z`, fill: '#8cbf6a' }, svg);
    // 등대·건물
    const lh = s('g', { transform: `translate(${AX.xc + 120} 300)` }, svg);
    s('path', { d: 'M-9 0 L-6 -70 L6 -70 L9 0 Z', fill: '#f4f4f4', stroke: '#c94a3a', 'stroke-width': 2 }, lh);
    s('rect', { x: -6, y: -50, width: 12, height: 8, fill: '#c94a3a' }, lh);
    s('rect', { x: -8, y: -82, width: 16, height: 12, fill: '#ffd36b' }, lh);
    [[AX.xc + 160, 40, 46], [AX.xc + 172, 30, 74]].forEach(([x, w, hgt]) => s('rect', { x, y: 300 - hgt, width: w, height: hgt, fill: '#c9d3dc' }, svg));
    // 물결
    for (let i = 0; i < 8; i++) s('path', { d: `M${30 + i * 70} ${330 + (i % 3) * 30} q10 -6 20 0 t20 0 t20 0`, fill: 'none', stroke: '#cfe9fb', 'stroke-width': 2, opacity: 0.55 }, svg);
    txt({ x: AX.x0 / 2, y: HH - 18, 'text-anchor': 'middle', class: 't-lbl', fill: '#fff', 'font-size': 16 }, '따뜻한 바다', svg);
    E.seaLbl = txt({ x: (AX.x0 + AX.xc) / 2, y: HH - 18, 'text-anchor': 'middle', class: 't-lbl', fill: '#fff', 'font-size': 18 }, '', svg);
    txt({ x: AX.xc + 110, y: HH - 18, 'text-anchor': 'middle', class: 't-lbl', fill: '#5a4a24', 'font-size': 16 }, '해안', svg);
    // 바람
    const wind = s('g', { opacity: 0.85 }, svg);
    [[40, 60], [240, 90], [440, 60]].forEach(([x, y]) => {
      s('line', { x1: x, y1: y, x2: x + 110, y2: y, stroke: '#fff', 'stroke-width': 3, 'stroke-dasharray': '18 12', class: 'wind-line', 'stroke-linecap': 'round', style: 'animation-direction: reverse' }, wind);
      s('path', { d: `M${x + 100} ${y - 7} L${x + 110} ${y} L${x + 100} ${y + 7}`, fill: 'none', stroke: '#fff', 'stroke-width': 3, 'stroke-linecap': 'round' }, wind);
    });
    txt({ x: 40, y: 36, class: 't-lbl', fill: '#fff', 'font-size': 17 }, '온난 습윤한 공기 →', svg);
    E.fogA = s('g', { filter: 'url(#fogBlur2)' }, svg);
    E.fogStart = s('g', null, svg);
    E.advParcel = s('g', null, svg);
    s('circle', { r: 26, fill: '#fde3c8', stroke: '#ec7a1c', 'stroke-width': 2.5, 'stroke-dasharray': '6 4' }, E.advParcel);
    E.advTag = txt({ 'text-anchor': 'middle', class: 't-lbl halo', 'font-size': 17 }, '', svg);

    const ax = makeAxes(E.charts.adv, { X0: 64, X1: 424, Y0: 330, Y1: 20, xmin: 0, xmax: 180, xstep: 30, ymin: 0, ymax: 30, ystep: 5,
      xlabel: '차가운 바다 위 이동 거리 (km)', ylabel: '온도 (℃)', ylabelGap: 44 });
    E.axA = ax;
    E.aCoast = s('line', { x1: ax.gx(COAST), x2: ax.gx(COAST), y1: ax.Y0, y2: ax.Y1, stroke: '#a37b2c', 'stroke-width': 2, 'stroke-dasharray': '6 4' }, ax.plot);
    txt({ x: ax.gx(COAST) + 4, y: ax.Y1 + 16, class: 't-lbl', 'font-size': 13, fill: '#a37b2c' }, '해안', ax.over);
    E.aFog = s('rect', { y: ax.Y1, height: ax.Y0 - ax.Y1, fill: '#cdd6df', opacity: 0.55 }, ax.bgLayer);
    E.aSea = s('line', { x1: ax.X0, x2: ax.X1, stroke: '#1f6fae', 'stroke-width': 2.5, 'stroke-dasharray': '3 5' }, ax.plot);
    E.aSeaT = txt({ class: 't-lbl halo', 'font-size': 13.5, fill: '#1f6fae' }, '', ax.over);
    E.aTd = s('polyline', { fill: 'none', stroke: '#8656d0', 'stroke-width': 3, 'stroke-dasharray': '9 6' }, ax.plot);
    E.aTall = s('polyline', { fill: 'none', stroke: '#d9382a', 'stroke-width': 2, 'stroke-opacity': 0.25 }, ax.plot);
    E.aT = s('polyline', { fill: 'none', stroke: '#d9382a', 'stroke-width': 4, 'stroke-linecap': 'round' }, ax.plot);
    E.aDot = s('circle', { r: 7, fill: '#d9382a', stroke: '#fff', 'stroke-width': 2 }, ax.plot);
  }
  function renderAdv() {
    const { Tair, Td, Tsea } = st.adv;
    const d = advDist();
    const start = Physics.advectionFogStart(Tair, Td, Tsea);
    const Tm = advT(d);
    const fogHere = start != null && d >= start;
    const T = fogHere ? Math.max(Tm, Td - 0.3) : Tm;
    if (fogHere) st.adv.fogReach = Math.max(st.adv.fogReach, d);
    E.seaLbl.textContent = `차가운 바다 (수온 ${fmt(Tsea, 1)} ℃)`;
    sa(E.coldSea, { fill: lerpColor('163f78', '3a9cc4', clamp((Tsea - 5) / 20, 0, 1)) });
    // 안개 띠
    E.fogA.innerHTML = '';
    if (start != null && st.adv.fogReach >= start) {
      const x0 = dX(start), x1 = dX(Math.min(st.adv.fogReach, 175));
      for (let x = x0; x <= x1 + 1; x += 34) {
        const dd = (x - AX.x0) / (AX.xc - AX.x0) * COAST;
        const dens = clamp((Td - advT(dd)) / 3, 0.15, 1);
        const th = 30 + 100 * dens;
        s('ellipse', { cx: x, cy: 300 - th * 0.3, rx: 46, ry: th * 0.55, fill: '#f5f7f9', opacity: (0.5 + 0.45 * dens).toFixed(2) }, E.fogA);
      }
    }
    E.fogStart.innerHTML = '';
    if (start != null && start <= 175) {
      const x = dX(start);
      s('line', { x1: x, x2: x, y1: 140, y2: 300, stroke: '#7a5800', 'stroke-width': 2, 'stroke-dasharray': '5 5' }, E.fogStart);
      txt({ x, y: 132, 'text-anchor': 'middle', class: 't-lbl halo-sky', 'font-size': 15, fill: '#7a5800' }, `기온 = 이슬점 (${fmt(start, 0)} km) → 안개 시작`, E.fogStart);
    }
    const px = d <= 0 ? lerp(30, AX.x0, (d + 20) / 20) : dX(Math.min(d, 175));
    E.advParcel.setAttribute('transform', `translate(${px} 268)`);
    E.advParcel.firstChild.setAttribute('fill', fogHere ? '#e1ecf7' : '#fde3c8');
    E.advParcel.firstChild.setAttribute('stroke', fogHere ? '#2d7dd2' : '#ec7a1c');
    sa(E.advTag, { x: clamp(px, 70, W - 70), y: 228, fill: tempColor(T) }); E.advTag.textContent = `${fmt(T)} ℃`;

    const ax = E.axA;
    const all = [], cur = [];
    for (let x = 0; x <= 180; x += 2) { const tm = advT(x); const tt = start != null && x >= start ? Math.max(tm, Td - 0.3) : tm; all.push([x, tt]); if (x <= d) cur.push([x, tt]); }
    sa(E.aTall, { points: pts(all, ax) });
    sa(E.aT, { points: cur.length > 1 ? pts(cur, ax) : '' });
    sa(E.aTd, { points: pts([[0, Td], [180, Td]], ax) });
    sa(E.aSea, { y1: ax.gy(Tsea), y2: ax.gy(Tsea) });
    sa(E.aSeaT, { x: ax.X1 - 6, y: ax.gy(Tsea) + 16, 'text-anchor': 'end' }); E.aSeaT.textContent = `수온 ${fmt(Tsea, 1)} ℃`;
    sa(E.aDot, { cx: ax.gx(clamp(d, 0, 180)), cy: ax.gy(T), opacity: d >= 0 ? 1 : 0 });
    const fogShown = start != null && st.adv.fogReach >= start;
    sa(E.aFog, { x: ax.gx(start || 0), width: fogShown ? ax.gx(Math.min(st.adv.fogReach, 180)) - ax.gx(start) : 0 });
    return { T, Td, fog: fogHere ? 1 : 0, xk: '이동 거리', xv: `${fmt(Math.max(0, d), 0)}<small>km</small>`, start };
  }

  /* ───────── 활승 안개 ───────── */
  const UP = { yBase: 400, kmPx: 150, x0: 140, x1: 690 };
  function upHeight() { return st.up.M * clamp((upPos() - 0.12) / 0.8, 0, 1); }
  function slopeXUp(h) { return UP.x0 + (UP.x1 - UP.x0) * clamp(h / st.up.M, 0, 1); }
  function slopeY(x) {
    if (x <= UP.x0) return UP.yBase;
    if (x >= UP.x1) return UP.yBase - st.up.M * UP.kmPx;
    const f = (x - UP.x0) / (UP.x1 - UP.x0);
    return UP.yBase - st.up.M * UP.kmPx * (f * f * (3 - 2 * f));
  }
  function buildUp() {
    const svg = E.scenes.up;
    const d = skyDefs(svg, '#6aaee4', '#e8f5ff');
    const blur = s('filter', { id: 'fogBlur3', x: '-20%', y: '-60%', width: '140%', height: '220%' }, d.defs);
    s('feGaussianBlur', { stdDeviation: 8 }, blur);
    s('rect', { x: 0, y: 0, width: W, height: HH, fill: d.sky }, svg);
    E.upLand = s('path', { fill: '#5f9a4a', stroke: '#3f6b33', 'stroke-width': 2 }, svg);
    for (let k = 0; k <= 2; k++) {
      const y = UP.yBase - k * UP.kmPx;
      if (k > 0) s('line', { x1: 52, y1: y, x2: W, y2: y, stroke: '#fff', 'stroke-opacity': 0.5, 'stroke-dasharray': '2 6' }, svg);
      txt({ x: 46, y: y + 5, 'text-anchor': 'end', class: 't-tick halo-sky', fill: '#1f3c58' }, k + ' km', svg);
    }
    E.upLcl = s('line', { x1: 52, x2: W, stroke: '#a77800', 'stroke-width': 2.5, 'stroke-dasharray': '9 6' }, svg);
    E.upLclT = txt({ x: 60, class: 't-lbl halo-sky', fill: '#7a5800', 'font-size': 16 }, '', svg);
    E.fogU = s('g', { filter: 'url(#fogBlur3)' }, svg);
    const wind = s('g', { opacity: 0.85 }, svg);
    [[70, 40], [260, 70]].forEach(([x, y]) => {
      s('line', { x1: x, y1: y, x2: x + 110, y2: y, stroke: '#fff', 'stroke-width': 3, 'stroke-dasharray': '18 12', class: 'wind-line', 'stroke-linecap': 'round', style: 'animation-direction: reverse' }, wind);
      s('path', { d: `M${x + 100} ${y - 7} L${x + 110} ${y} L${x + 100} ${y + 7}`, fill: 'none', stroke: '#fff', 'stroke-width': 3, 'stroke-linecap': 'round' }, wind);
    });
    txt({ x: 70, y: 100, class: 't-lbl', fill: '#fff', 'font-size': 16 }, '습한 공기가 사면을 따라 상승 →', svg);
    E.upParcel = makeParcel(svg, { seed: 21, molecules: 8 });
    E.upTag = txt({ 'text-anchor': 'middle', class: 't-lbl halo', 'font-size': 17 }, '', svg);

    const ax = makeAxes(E.charts.up, { X0: 64, X1: 424, Y0: 330, Y1: 20, xmin: -10, xmax: 35, xstep: 5, ymin: 0, ymax: 2, ystep: 0.5,
      yfmt: v => fmt(v, 1), xlabel: '온도 (℃)', ylabel: '높이 (km)', ylabelGap: 44 });
    E.axU = ax;
    E.uLcl = s('line', { x1: ax.X0, x2: ax.X1, stroke: '#a77800', 'stroke-width': 2, 'stroke-dasharray': '8 6' }, ax.plot);
    E.uM = s('line', { x1: ax.X0, x2: ax.X1, stroke: '#3f6b33', 'stroke-width': 1.5, 'stroke-dasharray': '3 5' }, ax.plot);
    E.uTd = s('polyline', { fill: 'none', stroke: '#8656d0', 'stroke-width': 3, 'stroke-dasharray': '9 6' }, ax.plot);
    E.uDry = s('polyline', { fill: 'none', stroke: '#ec7a1c', 'stroke-width': 4 }, ax.plot);
    E.uMoist = s('polyline', { fill: 'none', stroke: '#2d7dd2', 'stroke-width': 4 }, ax.plot);
    E.uDot = s('circle', { r: 7, stroke: '#fff', 'stroke-width': 2 }, ax.plot);
    E.uLclT = txt({ x: ax.X0 + 6, class: 't-lbl halo', fill: '#7a5800', 'font-size': 13.5 }, '', ax.over);
  }
  let upKey = '';
  function renderUp() {
    const { T: T0, Td: Td0, M } = st.up;
    const H = Physics.lcl(T0, Td0);
    const hgt = upHeight();
    const p = Physics.parcel(T0, Td0, hgt);
    if (upPos() > 0) st.up.top = Math.max(st.up.top, hgt);
    if (upKey !== String(M)) {
      upKey = String(M);
      let dPath = `M0 ${HH} L0 ${UP.yBase}`;
      for (let x = 0; x <= W; x += 8) dPath += ` L${x} ${slopeY(x).toFixed(1)}`;
      E.upLand.setAttribute('d', dPath + ` L${W} ${HH} Z`);
    }
    const yH = UP.yBase - Math.min(H, 2.2) * UP.kmPx;
    sa(E.upLcl, { y1: yH, y2: yH, opacity: H <= 2.4 ? 1 : 0 });
    sa(E.upLclT, { y: yH - 8 }); E.upLclT.textContent = `상승 응결 고도 ${fmt(H, 2)} km` + (H > M ? ' (산보다 높음 → 안개 없음)' : '');
    // 안개 (사면을 덮음)
    E.fogU.innerHTML = '';
    const top = Math.min(st.up.top, M);
    if (H < M && top > H) {
      const n = Math.max(2, Math.ceil((top - H) / 0.08));
      for (let i = 0; i <= n; i++) {
        const hh = H + (top - H) * i / n;
        const x = slopeXUp(hh);
        s('ellipse', { cx: x + 10, cy: UP.yBase - hh * UP.kmPx - 16, rx: 60, ry: 30, fill: '#f5f7f9', opacity: 0.85 }, E.fogU);
      }
      if (top >= M - 0.01) s('ellipse', { cx: UP.x1 + 50, cy: UP.yBase - M * UP.kmPx - 18, rx: 90, ry: 30, fill: '#f5f7f9', opacity: 0.85 }, E.fogU);
    }
    // 공기 덩어리
    const pos = upPos();
    const x = pos < 0.12 ? lerp(70, UP.x0, pos / 0.12) : pos > 0.92 ? lerp(UP.x1, 760, (pos - 0.92) / 0.08) : slopeXUp(hgt);
    const r = 18 + 4 * hgt;
    const y = slopeY(x) - r - 2;
    E.upParcel.setState({ r, sat: p.saturated && hgt > 0, temp: p.temp });
    E.upParcel.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    sa(E.upTag, { x: clamp(x, 70, W - 70), y: y - r - 12, fill: tempColor(p.temp) }); E.upTag.textContent = `${fmt(p.temp)} ℃`;

    const ax = E.axU;
    const hb = Math.min(hgt, H);
    sa(E.uDry, { points: pts([[T0, 0], [T0 - 10 * hb, hb]], ax) });
    sa(E.uMoist, { points: hgt > H ? pts([[T0 - 10 * H, H], [p.temp, hgt]], ax) : '' });
    sa(E.uTd, { points: pts(hgt > H ? [[Td0, 0], [Td0 - 2 * H, H], [p.temp, hgt]] : [[Td0, 0], [Td0 - 2 * hgt, hgt]], ax) });
    sa(E.uLcl, { y1: ax.gy(Math.min(H, 2)), y2: ax.gy(Math.min(H, 2)), opacity: H <= 2 ? 1 : 0 });
    sa(E.uLclT, { y: ax.gy(Math.min(H, 2)) - 7, opacity: H <= 2 ? 1 : 0 }); E.uLclT.textContent = `상승 응결 고도 ${fmt(H, 2)} km`;
    sa(E.uM, { y1: ax.gy(M), y2: ax.gy(M) });
    sa(E.uDot, { cx: ax.gx(p.temp), cy: ax.gy(hgt), fill: p.saturated && hgt > 0 ? '#2d7dd2' : '#ec7a1c' });
    return { T: p.temp, Td: p.dew, fog: p.saturated && hgt > 0 ? 1 : 0, xk: '높이', xv: `${fmt(hgt, 2)}<small>km</small>`, H };
  }

  /* ───────── 공통 그리기 ───────── */
  function render() {
    if (!E.scenes) return;
    ui.prog.refresh();
    let r;
    if (st.kind === 'rad') r = renderRad();
    else if (st.kind === 'adv') r = renderAdv();
    else r = renderUp();
    const rh = Physics.relHumidity(r.T, r.Td);
    ui.roXk.textContent = r.xk; ui.roX.innerHTML = r.xv;
    ui.roT.innerHTML = `${fmt(r.T)}<small>℃</small>`; ui.roT.style.color = tempColor(r.T);
    ui.roTd.innerHTML = `${fmt(r.Td)}<small>℃</small>`; ui.roTd.style.color = 'var(--dew)';
    ui.roRH.innerHTML = `${fmt(rh, 0)}<small>%</small>`; ui.roRH.style.color = 'var(--moist-ink)';
    ui.rhBar.style.width = rh.toFixed(1) + '%';
    ui.fogChip.className = 'state-chip ' + (r.fog > 0.02 ? 'sat' : 'neutral');
    ui.fogChip.innerHTML = r.fog > 0.02 ? '<span>🌫️ 안개 발생! 기온이 이슬점까지 내려갔어요</span>' : '<span>안개 없음 — 기온이 아직 이슬점보다 높아요</span>';
    // 그래프 아래 설명
    if (st.kind === 'rad') {
      const { sky, wind } = st.rad;
      const ok = sky === 'clear' && wind === 'calm';
      ui.chartNote.innerHTML = `새벽까지 약 <b>${Physics.radiationDrop(sky, wind)} ℃</b> 냉각 (${sky === 'clear' ? '맑음' : '흐림'} · ${wind === 'calm' ? '바람 약함' : '바람 강함'}) ` +
        (ok ? '<span style="color:var(--ok)">→ 복사 냉각이 잘 일어나는 조건</span>' : '<span style="color:var(--warn)">→ 구름이나 바람 때문에 덜 식어요</span>');
    } else if (st.kind === 'adv') {
      ui.chartNote.innerHTML = r.start == null
        ? `수온(${fmt(st.adv.Tsea, 1)} ℃)이 이슬점(${fmt(st.adv.Td, 0)} ℃)보다 높아 공기가 이슬점까지 식지 못해요 → <b>안개 없음</b>`
        : `공기가 차가운 바다 위 <b>${fmt(r.start, 0)} km</b> 지점에서 이슬점까지 식어 안개가 생겨요` + (r.start <= COAST ? ' → 해안까지 해무가 밀려와요.' : ' → 해안에 닿기 전엔 안개가 없어요.');
    } else {
      ui.chartNote.innerHTML = r.H < st.up.M
        ? `상승 응결 고도 H = ⅛(${fmt(st.up.T, 0)} − ${fmt(st.up.Td, 0)}) = <b>${fmt(r.H, 2)} km</b> → 그 위 사면이 안개에 덮여요.`
        : `상승 응결 고도(${fmt(r.H, 2)} km)가 산(${fmt(st.up.M, 1)} km)보다 높아 <b>안개가 생기지 않아요</b>.`;
    }
    missionLive(r);
  }

  /* ───────── 미션 ───────── */
  function missionLive(r) {
    if (!missionOn(TAB)) return;
    const idx = currentMission(TAB);
    if (idx === 0) {
      setMissionLive(TAB, st.kind !== 'rad' ? '🌙 복사 안개 실험으로 바꿔 주세요.' : `지금: ${st.rad.sky === 'clear' ? '맑음' : '흐림'} · ${st.rad.wind === 'calm' ? '바람 약함' : '바람 강함'} · 이슬점 ${st.rad.Td} ℃ · ${clock(radHour())}`);
      if (st.kind === 'rad' && r.fog > 0.1) award(TAB, 0);
    } else if (idx === 1) {
      setMissionLive(TAB, st.kind !== 'adv' ? '🌊 이류 안개 실험으로 바꿔 주세요.' : (r.start == null ? '<span class="bad">지금 조건에서는 안개가 생기지 않아요</span>' : `안개 시작 지점 ${fmt(r.start, 0)} km / 해안 ${COAST} km`));
      if (st.kind === 'adv' && r.start != null && r.start <= TUNING.tab5.advMaxStart && advDist() >= COAST) award(TAB, 1);
    } else if (idx === 2) {
      const H = Physics.lcl(st.up.T, st.up.Td);
      setMissionLive(TAB, st.kind !== 'up' ? '⛰️ 활승 안개 실험으로 바꿔 주세요.' : `상승 응결 고도 <span class="${Math.abs(H - 0.5) < 0.02 ? 'good' : 'bad'}">${fmt(H, 2)} km</span> (목표 0.50 km) · 공기 높이 ${fmt(upHeight(), 2)} km`);
      if (st.kind === 'up' && Math.abs(H - 0.5) < 0.02 && st.up.M > 0.6 && upHeight() >= 0.6) award(TAB, 2);
    }
  }

  registerTab(TAB, { init, tick, onShow: render, onHide: () => { st.playing = false; if (ui.play) ui.play.innerHTML = '▶ 진행'; } });
})();
