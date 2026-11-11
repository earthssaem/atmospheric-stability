/**
 * tab2-foehn.js — 2. 푄 현상과 높새바람 (동쪽 동해 → 태백산맥 → 서쪽 영서)
 */
'use strict';

(function () {
  const TAB = 'tab2';
  const st = {
    T: 20, Td: 14, M: 2,
    p: 0, playing: false, departed: false, completed: false,
    cloudTop: 0,        // 풍상측에서 구름이 발달한 최고 높이
    predictVal: '', predictLocked: null
  };
  const G = { W: 800, H: 500, yGround: 412, kmPx: 78, xs: 380, w: 200, xStart: 745, xEnd: 60, coast: 650 };
  G.yOf = h => G.yGround - h * G.kmPx;
  const E = {};
  const ui = {};

  registerMissions(TAB, [
    {
      title: '높새바람을 만들어라',
      desc: '공기를 산 너머로 보내 영서 도착 기온이 영동 출발 기온보다 높아지게(푄 현상) 하세요.',
      hint: '산을 넘는 동안 구름이 생기고 비가 내려야 푄이 일어나요. 상승 응결 고도 H = ⅛(T − Td)가 산 높이보다 낮은지 확인해 보세요!'
    },
    {
      title: '도착 기온을 예측하라',
      desc: '출발 전에 영서(서쪽) 도착 기온을 계산해 입력하고, 바람을 불어 확인하세요. (±0.5 ℃ 이내)',
      hint: '① H = ⅛(T − Td) ② 정상 기온 = T − 10×H − 5×(산 높이 − H) ③ 도착 기온 = 정상 기온 + 10×산 높이. 산이 응결 고도보다 낮으면 도착 기온 = 출발 기온!'
    },
    {
      title: '영동–영서 기온 차를 최대로!',
      desc: '이슬점을 조절해 지금 설정(기온·산 높이)에서 가능한 가장 큰 기온 차를 만들어 산을 넘기세요.',
      hint: '이슬점이 높을수록 상승 응결 고도가 낮아져 습윤 단열(5 ℃/km) 구간이 길어지고, 산을 넘은 뒤 기온 차가 커져요. 이슬점을 최대한 올려 볼까요?'
    }
  ], {
    extra: idx => idx === 1
      ? `<label style="font-weight:800">예측 도착 기온</label><input type="number" id="t2-predict" step="0.1" placeholder="?"><b>℃</b>`
      : '',
    afterRender: idx => {
      const inp = $('t2-predict');
      if (inp) { inp.value = st.predictVal; inp.addEventListener('input', () => { st.predictVal = inp.value; }); }
      render();
    },
    onModeChange: () => render()
  });

  /* 산 모양: 코사인 종 모양 */
  function mtnY(x) {
    const d = Math.abs(x - G.xs);
    if (d >= G.w) return G.yGround;
    return G.yGround - st.M * G.kmPx * (0.5 + 0.5 * Math.cos(Math.PI * d / G.w));
  }
  function slopeX(h, side) {
    const f = clamp(h / st.M, 0, 1);
    const d = G.w * Math.acos(2 * f - 1) / Math.PI;
    return side === 'windward' ? G.xs + d : G.xs - d;
  }
  const P_UP0 = 0.12, P_TOP = 0.5, P_DN1 = 0.88;
  /** 여정 진행도 p → {x, h, side} */
  function pos(p) {
    const M = st.M;
    if (p <= P_UP0) return { x: lerp(G.xStart, G.xs + G.w, p / P_UP0), h: 0, side: 'windward' };
    if (p <= P_TOP) { const h = M * (p - P_UP0) / (P_TOP - P_UP0); return { x: slopeX(h, 'windward'), h, side: 'windward' }; }
    if (p <= P_DN1) { const h = M * (1 - (p - P_TOP) / (P_DN1 - P_TOP)); return { x: slopeX(h, 'leeward'), h, side: 'leeward' }; }
    return { x: lerp(G.xs - G.w, G.xEnd, (p - P_DN1) / (1 - P_DN1)), h: 0, side: 'leeward' };
  }

  /* ───────── 화면 만들기 ───────── */
  function init(panel) {
    LessonHead(panel, {
      tag: '5~6차시 · 푄과 높새바람',
      q: '산을 넘은 바람은 왜 뜨겁고 건조해질까?',
      sub: '동해에서 불어온 공기를 태백산맥 너머 영서 지방으로 보내 보세요.',
      missionTab: TAB
    });
    panel.appendChild(h('div', { class: 'mission-card', id: 'mission-' + TAB }));

    const ws = h('div', { class: 'workspace ws-wide' });
    const side = h('div', { class: 'side' });
    const cSet = Card({ title: '조건 설정' });
    ui.sT = Slider({ label: '출발 기온 (영동)', min: 5, max: 35, step: 1, value: st.T, unit: ' ℃', colorize: tempColor,
      onInput: v => { st.T = v; clampTd(); resetJourney(); } });
    ui.sTd = Slider({ label: '출발 이슬점', min: 0, max: 19, step: 1, value: st.Td, unit: ' ℃', color: 'var(--dew)', colorize: () => 'var(--dew)',
      onInput: v => { st.Td = v; resetJourney(); } });
    ui.sM = Slider({ label: '산 높이', min: 1, max: 4, step: 0.5, value: st.M, unit: ' km', digits: 1, color: '#4f8a3a',
      onInput: v => { st.M = v; resetJourney(); } });
    ui.go = Btn('🌬️ 바람 불기', 'big', go);
    ui.sP = Slider({ label: '여정', min: 0, max: 1000, step: 1, value: 0, color: 'var(--ink-2)', format: v => `${Math.round(v / 10)}<small> %</small>`,
      onInput: v => scrub(v / 1000) });
    cSet.body.append(h('div', { class: 'controls' }, ui.sT.el, ui.sTd.el, ui.sM.el, ui.go, ui.sP.el));
    side.appendChild(cSet.el);

    const cState = Card({ title: '지금 공기 덩어리' });
    ui.roWhere = h('div', { class: 'state-chip neutral' });
    ui.roH = h('div', { class: 'v num' }); ui.roT = h('div', { class: 'v num' });
    ui.roTd = h('div', { class: 'v num' }); ui.roRH = h('div', { class: 'v num' }); ui.rhBar = h('span');
    cState.body.append(ui.roWhere, h('div', { class: 'readout', style: { marginTop: '10px' } },
      h('div', { class: 'ro' }, h('div', { class: 'k', text: '높이' }), ui.roH),
      h('div', { class: 'ro' }, h('div', { class: 'k', text: '상대 습도' }), ui.roRH, h('div', { class: 'rh-bar', style: { marginTop: '4px', height: '8px' } }, ui.rhBar)),
      h('div', { class: 'ro' }, h('div', { class: 'k', text: '기온' }), ui.roT),
      h('div', { class: 'ro' }, h('div', { class: 'k', text: '이슬점' }), ui.roTd)
    ));
    side.appendChild(cState.el);

    const cScene = Card({ title: '태백산맥 단면 <span style="font-weight:600;color:var(--muted)">— 서쪽(영서) ← 동풍 ← 동쪽(영동)</span>', cls: 'viz', pad: false });
    E.scene = svgRoot(G.W, G.H, '푄 현상 산 단면도');
    cScene.body.appendChild(h('div', { class: 'svg-wrap' }, E.scene));
    ui.segs = h('div', { class: 'seg-cards' });
    cScene.body.appendChild(ui.segs);

    const cGraph = Card({
      title: '높이–온도 그래프', cls: 'viz', pad: false,
      legend: legendItem('var(--dry)', '건조 단열') + legendItem('var(--moist)', '습윤 단열') + legendItem('var(--dew)', '이슬점', 'dash')
    });
    E.graph = svgRoot(420, 520, '푄 현상 높이-온도 그래프');
    cGraph.body.appendChild(h('div', { class: 'svg-wrap' }, E.graph));
    ui.result = h('div', { class: 'result-box' });
    cGraph.body.appendChild(ui.result);

    ws.append(side, cScene.el, cGraph.el);
    panel.appendChild(ws);

    panel.appendChild(h('div', { class: 'info-grid' },
      ConceptCard('푄', [
        '불포화 공기가 높은 산을 만나 사면을 타고 <b>강제 상승</b> → 건조 단열 감률로 냉각 → 상승 응결 고도에서 <b>구름</b> 생성',
        '정상까지는 습윤 단열 감률로 냉각하며 <b>비나 눈</b>이 내려 수증기를 잃는다.',
        '산을 넘어 하강할 때는 불포화 상태이므로 <b>건조 단열 감률(10 ℃/km)</b>로 기온 상승',
        '그 결과 산을 넘기 전보다 <b>기온은 높아지고 습도는 낮아진다</b> → 고온 건조한 바람 = <b>푄</b>'
      ], '교과서 그림 Ⅲ-13 높새바람'),
      ConceptCard('높새바람', [
        '늦봄~초여름 <b>오호츠크해 기단</b>의 세력이 강해질 때 부는 <b>동풍(북동풍)</b>이 태백산맥을 넘는다.',
        '영동 지방(동쪽, 풍상측)은 서늘하고 비가 오기도 하지만, 영서 지방(서쪽, 풍하측)에는 <b>고온 건조한 높새바람</b>이 분다.',
        '영서 지방의 농작물에 큰 피해를 주기도 한다.',
        '세계 여러 곳: 알프스산맥을 넘는 <b>푄</b>, 로키산맥을 넘는 <b>치누크</b>'
      ]),
      ThinkCard('확인 문제', [
        { q: '출발 기온 20 ℃, 이슬점 14 ℃인 공기가 높이 2 km의 산을 넘으면 도착 기온은?', a: 'H = ⅛(20 − 14) = 0.75 km → 정상 기온 = 20 − 10×0.75 − 5×1.25 = 6.25 ℃ → 도착 기온 = 6.25 + 10×2 = <b>26.25 ℃</b>' },
        { q: '산 높이가 상승 응결 고도보다 낮으면 어떻게 될까?', a: '구름이 생기지 않고 상승·하강 모두 건조 단열 변화를 하므로 도착 기온이 출발 기온과 같다. 푄이 나타나지 않는다.' },
        { q: '산을 넘은 공기의 상대 습도가 낮아지는 까닭은?', a: '풍상측에서 비로 수증기를 잃어 이슬점이 낮아졌고, 하강하며 기온이 크게 높아졌기 때문이다.' }
      ])
    ));

    buildScene();
    buildGraph();
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
    const d = skyDefs(svg, '#5ea6e0', '#e8f5ff');
    E.cloudFill = d.cloud; E.cloudGray = d.cloudGray;
    const mg = s('linearGradient', { id: 't2mtn', x1: 0, y1: 0, x2: 0, y2: 1 }, d.defs);
    s('stop', { offset: '0%', 'stop-color': '#6f9a55' }, mg);
    s('stop', { offset: '100%', 'stop-color': '#3f6b33' }, mg);
    const sea = s('linearGradient', { id: 't2sea', x1: 0, y1: 0, x2: 0, y2: 1 }, d.defs);
    s('stop', { offset: '0%', 'stop-color': '#4aa3df' }, sea);
    s('stop', { offset: '100%', 'stop-color': '#1f6fae' }, sea);

    s('rect', { x: 0, y: 0, width: G.W, height: G.yGround, fill: d.sky }, svg);
    // 높이 눈금
    for (let k = 0; k <= 4; k++) {
      const y = G.yOf(k);
      if (k > 0) s('line', { x1: 52, y1: y, x2: G.W, y2: y, stroke: '#fff', 'stroke-opacity': 0.45, 'stroke-dasharray': '2 6' }, svg);
      txt({ x: 46, y: y + 5, 'text-anchor': 'end', class: 't-tick', fill: '#1f3c58', 'font-size': 16 }, k + ' km', svg);
    }
    // 바람 방향
    const wind = s('g', { opacity: 0.85 }, svg);
    [[96, 26], [300, 46], [500, 26], [680, 46]].forEach(([x, y]) => {
      s('line', { x1: x + 100, y1: y, x2: x, y2: y, stroke: '#fff', 'stroke-width': 3, 'stroke-dasharray': '18 12', class: 'wind-line', 'stroke-linecap': 'round' }, wind);
      s('path', { d: `M${x + 10} ${y - 7} L${x} ${y} L${x + 10} ${y + 7}`, fill: 'none', stroke: '#fff', 'stroke-width': 3, 'stroke-linecap': 'round' }, wind);
    });
    txt({ x: G.W / 2, y: 78, 'text-anchor': 'middle', class: 't-lbl', fill: '#fff', 'font-size': 19 }, '← 바람 방향: 동풍(북동풍)', svg);

    E.backMtn = s('path', { fill: '#9cbf88', opacity: 0.55 }, svg);
    E.mtn = s('path', { fill: 'url(#t2mtn)', stroke: '#355c2a', 'stroke-width': 2 }, svg);
    E.mtnName = txt({ 'text-anchor': 'middle', class: 't-lbl', fill: '#eaf5e2', 'font-size': 19 }, '태백산맥', svg);
    // 땅과 바다
    s('rect', { x: 0, y: G.yGround, width: G.coast, height: G.H - G.yGround, fill: '#7dbb5f' }, svg);
    s('path', { d: `M${G.coast} ${G.yGround} L${G.W} ${G.yGround} L${G.W} ${G.H} L${G.coast - 24} ${G.H} Z`, fill: 'url(#t2sea)' }, svg);
    s('path', { d: `M${G.coast + 14} ${G.yGround + 14} q12 -6 24 0 t24 0 t24 0 M${G.coast + 60} ${G.yGround + 36} q12 -6 24 0 t24 0 t24 0`, fill: 'none', stroke: '#cfe9fb', 'stroke-width': 2, opacity: 0.8 }, svg);
    // 농작물(영서) — 높새바람이 불면 시든다
    E.crops = s('g', null, svg);
    for (let i = 0; i < 9; i++) {
      const x = 70 + i * 14;
      s('path', { d: `M${x} ${G.yGround} q-6 -14 -2 -24 M${x} ${G.yGround} q5 -12 3 -22`, fill: 'none', 'stroke-width': 3, 'stroke-linecap': 'round', class: 'crop' }, E.crops);
    }
    txt({ x: 130, y: G.yGround + 56, 'text-anchor': 'middle', class: 't-axis', fill: '#fff', 'font-size': 20 }, '영서 (서쪽)', svg);
    txt({ x: 560, y: G.yGround + 56, 'text-anchor': 'middle', class: 't-axis', fill: '#fff', 'font-size': 20 }, '영동 (동쪽)', svg);
    txt({ x: 735, y: G.yGround + 60, 'text-anchor': 'middle', class: 't-axis', fill: '#e6f4ff', 'font-size': 19 }, '동해', svg);

    // 상승 응결 고도
    E.lcl = s('line', { stroke: '#a77800', 'stroke-width': 2.5, 'stroke-dasharray': '9 6' }, svg);
    E.lclT = txt({ class: 't-lbl halo-sky', fill: '#7a5800', 'text-anchor': 'end', 'font-size': 17 }, '', svg);
    E.cloud = s('g', null, svg);
    E.rain = s('g', null, svg);
    E.hot = txt({ class: 't-lbl halo', fill: '#c23a1c', 'text-anchor': 'middle', 'font-size': 21, opacity: 0 }, '🔥 고온 건조한 높새바람!', svg);
    E.marks = s('g', null, svg);

    E.parcel = makeParcel(svg, { seed: 9, molecules: 9 });
    E.tag = s('g', null, svg);
    E.tagBg = s('rect', { rx: 10, fill: '#fff', 'fill-opacity': 0.95, stroke: '#c8d6e4', height: 54, width: 150 }, E.tag);
    E.tagT = txt({ class: 't-lbl', 'font-size': 21, 'text-anchor': 'middle' }, '', E.tag);
    E.tagTd = txt({ class: 't-lbl', 'font-size': 16, fill: '#6a3fb5', 'text-anchor': 'middle' }, '', E.tag);
  }

  function buildGraph() {
    const ax = makeAxes(E.graph, {
      X0: 70, X1: 408, Y0: 440, Y1: 20, xmin: -20, xmax: 50, xstep: 10,
      ymin: 0, ymax: 4.5, ystep: 1, minorY: 0.5, xlabel: '온도 (℃)', ylabel: '높이 (km)', ylabelGap: 44
    });
    E.ax = ax;
    const p = ax.plot;
    E.gLcl = s('line', { x1: ax.X0, x2: ax.X1, stroke: '#a77800', 'stroke-width': 2, 'stroke-dasharray': '8 6' }, p);
    E.gM = s('line', { x1: ax.X0, x2: ax.X1, stroke: '#3f6b33', 'stroke-width': 1.5, 'stroke-dasharray': '3 5' }, p);
    E.gDewUp = s('polyline', { fill: 'none', stroke: '#8656d0', 'stroke-width': 3, 'stroke-dasharray': '9 6' }, p);
    E.gDewDn = s('polyline', { fill: 'none', stroke: '#8656d0', 'stroke-width': 3, 'stroke-dasharray': '2 6', 'stroke-linecap': 'round' }, p);
    E.gDry = s('polyline', { fill: 'none', stroke: '#ec7a1c', 'stroke-width': 4.5, 'stroke-linecap': 'round' }, p);
    E.gMoist = s('polyline', { fill: 'none', stroke: '#2d7dd2', 'stroke-width': 4.5, 'stroke-linecap': 'round' }, p);
    E.gDown = s('polyline', { fill: 'none', stroke: '#d9382a', 'stroke-width': 4.5, 'stroke-linecap': 'round', 'stroke-dasharray': '12 6' }, p);
    E.gDot = s('circle', { r: 8, stroke: '#fff', 'stroke-width': 2.5 }, p);
    E.gStart = txt({ class: 't-lbl halo', 'font-size': 15 }, '', ax.over);
    E.gEnd = txt({ class: 't-lbl halo', 'font-size': 15, fill: '#c23a1c' }, '', ax.over);
    E.gLclT = txt({ x: ax.X0 + 6, class: 't-lbl halo', fill: '#7a5800', 'font-size': 14 }, '', ax.over);
    E.gMT = txt({ x: ax.X0 + 6, class: 't-lbl halo', fill: '#3f6b33', 'font-size': 14 }, '', ax.over);
    // 하강선 범례
    const lg = s('g', null, ax.over);
    s('rect', { x: ax.X1 - 128, y: ax.Y1 + 6, width: 122, height: 26, rx: 6, fill: '#fff', 'fill-opacity': 0.9 }, lg);
    s('line', { x1: ax.X1 - 120, y1: ax.Y1 + 19, x2: ax.X1 - 94, y2: ax.Y1 + 19, stroke: '#d9382a', 'stroke-width': 4, 'stroke-dasharray': '8 4' }, lg);
    txt({ x: ax.X1 - 88, y: ax.Y1 + 24, class: 't-lbl', 'font-size': 14, fill: '#a32a1d' }, '하강(건조)', lg);
  }

  /* ───────── 여정 ───────── */
  function resetJourney() {
    st.p = 0; st.playing = false; st.departed = false; st.completed = false;
    st.cloudTop = 0; st.predictLocked = null;
    ui.sP.set(0);
    ui.go.innerHTML = '🌬️ 바람 불기';
    render();
  }
  function go() {
    if (st.playing) { st.playing = false; ui.go.innerHTML = '▶ 이어서 불기'; return; }
    const restart = st.completed || st.p >= 1;
    if ((restart || st.p === 0) && isMissionActive(TAB, 1)) {
      const v = parseFloat(st.predictVal);
      if (isNaN(v)) { showHint(TAB, '먼저 도착 기온을 예측해서 입력해야 해요! ' + Mission.defs[TAB][1].hint); return; }
      st.predictLocked = v;
    }
    if (restart) { st.p = 0; st.cloudTop = 0; st.completed = false; }
    st.departed = true; st.playing = true;
    ui.go.innerHTML = '⏸ 잠깐 멈춤';
  }
  function scrub(p) {
    st.playing = false; st.departed = true;
    ui.go.innerHTML = p >= 1 ? '🌬️ 다시 불기' : '▶ 이어서 불기';
    const wasDone = st.completed;
    st.p = p;
    if (p >= 1 && !wasDone) complete();
    if (p < 1) st.completed = false;
    render();
  }
  function tick(dt) {
    if (st.playing) {
      st.p = Math.min(1, st.p + dt / 9);
      ui.sP.set(Math.round(st.p * 1000));
      if (st.p >= 1) { complete(); ui.go.innerHTML = '🌬️ 다시 불기'; }
      render();
    }
    E.parcel.tick(dt);
  }

  function complete() {
    st.completed = true; st.playing = false;
    const f = Physics.foehn(st.T, st.Td, st.M);
    if (!missionOn(TAB)) return;
    const idx = currentMission(TAB);
    if (idx === 0) {
      if (f.foehn && f.arrivalTemp > st.T) award(TAB, 0); else showHint(TAB);
    } else if (idx === 1) {
      if (st.predictLocked != null) {
        const diff = Math.abs(st.predictLocked - f.arrivalTemp);
        if (diff <= TUNING.tab2.m2_tolPredict) award(TAB, 1);
        else {
          showHint(TAB, `아쉬워요! 예측 ${fmt(st.predictLocked)} ℃ vs 실제 ${fmt(f.arrivalTemp, 2)} ℃ (차이 ${fmt(diff)} ℃). 단계별로 다시 계산해 볼까요? ` + Mission.defs[TAB][1].hint);
          st.predictLocked = null;
        }
      }
    } else if (idx === 2) {
      const delta = f.foehn ? f.deltaT : 0;
      if (f.foehn && delta >= maxDelta() - TUNING.tab2.m3_tolMax) award(TAB, 2);
      else showHint(TAB, `이번 기온 차는 ${signed(delta, 2)} ℃. 이 설정의 최대는 ${signed(maxDelta(), 2)} ℃예요. ` + Mission.defs[TAB][2].hint);
    }
  }
  function maxDelta() { return Physics.foehn(st.T, st.T - 1, st.M).deltaT; }

  /* ───────── 그리기 ───────── */
  let mtnKey = '', cloudKey = '';
  function render() {
    if (!E.scene) return;
    const { T, Td, M } = st;
    const f = Physics.foehn(T, Td, M);
    const ps = pos(st.p);
    const cur = Physics.foehnAt(T, Td, M, ps.side, ps.h);
    const sat = cur.saturated && ps.side === 'windward' && ps.h > 0;
    const rh = Physics.relHumidity(cur.temp, cur.dew);

    // 산
    if (mtnKey !== String(M)) {
      mtnKey = String(M);
      let dPath = `M${G.xs - G.w - 10} ${G.yGround}`;
      for (let x = G.xs - G.w; x <= G.xs + G.w; x += 6) dPath += ` L${x} ${mtnY(x).toFixed(1)}`;
      E.mtn.setAttribute('d', dPath + ` L${G.xs + G.w + 10} ${G.yGround} Z`);
      // 뒤쪽 능선
      let bPath = `M${G.xs - G.w - 120} ${G.yGround}`;
      for (let x = -G.w - 120; x <= G.w + 60; x += 8) {
        const dd = Math.abs(x + 30) / (G.w + 90);
        const yy = dd >= 1 ? G.yGround : G.yGround - M * 0.72 * G.kmPx * (0.5 + 0.5 * Math.cos(Math.PI * dd));
        bPath += ` L${G.xs + x} ${yy.toFixed(1)}`;
      }
      E.backMtn.setAttribute('d', bPath + ` L${G.xs + G.w + 60} ${G.yGround} Z`);
      sa(E.mtnName, { x: G.xs, y: G.yGround - M * G.kmPx * 0.35 + 6 });
    }

    // 상승 응결 고도 (풍상측)
    const showL = f.H <= 4.4;
    const yH = G.yOf(Math.min(f.H, 4.4));
    sa(E.lcl, { x1: f.foehn ? slopeX(f.H, 'windward') : G.xs + 20, x2: G.W, y1: yH, y2: yH, opacity: showL ? 1 : 0 });
    sa(E.lclT, { x: G.W - 8, 'text-anchor': 'end', y: yH - 10, opacity: 1 });
    E.lclT.textContent = showL ? `상승 응결 고도 ${fmt(f.H, 2)} km` + (f.foehn ? '' : ' (산보다 높음!)') : `상승 응결 고도 ${fmt(f.H, 2)} km (화면 밖)`;
    if (!showL) sa(E.lclT, { y: 112 });

    // 구름 발달 높이
    if (f.foehn && st.departed && ps.side === 'windward' && ps.h > f.H) st.cloudTop = Math.max(st.cloudTop, ps.h);
    if (f.foehn && st.departed && ps.side === 'leeward') st.cloudTop = M;
    const top = Math.min(st.cloudTop, M);
    const ck = f.foehn && top > f.H + 0.02 ? `${f.H.toFixed(3)}|${top.toFixed(2)}|${M}` : 'none';
    if (ck !== cloudKey) {
      cloudKey = ck;
      E.cloud.innerHTML = '';
      if (ck !== 'none') {
        const n = Math.max(3, Math.ceil((top - f.H) / 0.12));
        const yTopC = G.yOf(top) - 40, yBot = G.yOf(f.H) + 6;
        const c = cloudLayer(E.cloud, { x0: G.xs - 60, y0: yTopC, x1: G.W, y1: yBot }, 'gray', 0.96);
        const R = rng(17);
        for (let i = 0; i <= n; i++) {
          const hh = f.H + (top - f.H) * (i / n);
          const x = slopeX(hh, 'windward'), y = G.yOf(hh);
          const r = 20 + 10 * R();
          c.circle(x + r * 0.55, y - r * 0.55, r);
          c.circle(x + r * 1.5, y - r * 0.2 + (R() - 0.5) * 8, r * 0.85);
        }
        c.finish();
        txt({ x: slopeX((f.H + top) / 2, 'windward') + 66, y: G.yOf((f.H + top) / 2) - 26, class: 't-lbl halo-sky', fill: '#17599f', 'text-anchor': 'start', 'font-size': 17 }, '구름 · 비', E.cloud);
      }
    }
    // 비 (풍상측 포화 구간을 지나는 동안)
    const raining = f.foehn && ps.side === 'windward' && ps.h >= f.H && st.departed && !st.completed && st.p < P_TOP;
    if (raining !== E.rainOn || (raining && E.rainKey !== cloudKey)) {
      E.rainOn = raining; E.rainKey = cloudKey;
      E.rain.innerHTML = '';
      if (raining) {
        for (let i = 0; i < 12; i++) {
          const hh = f.H + (Math.min(st.cloudTop, M) - f.H) * (i / 12);
          const x = slopeX(hh, 'windward') + 16 + (i % 3) * 14, y = G.yOf(hh) + 4;
          const dr = s('line', { x1: x, y1: y, x2: x - 4, y2: y + 15, stroke: '#3d8fd8', 'stroke-width': 3, 'stroke-linecap': 'round', class: 'rain-drop' }, E.rain);
          dr.style.animationDelay = (i * 0.09) + 's';
        }
      }
    }
    // 높새바람 · 농작물
    const hotOn = f.foehn && st.departed && ps.side === 'leeward' && st.p > 0.62;
    sa(E.hot, { x: 150, y: 150, opacity: hotOn ? 1 : 0 });
    E.crops.querySelectorAll('.crop').forEach(c => c.setAttribute('stroke', hotOn && st.p > 0.9 ? '#c9a548' : '#3e8a2f'));

    // 기록 표시(지나간 주요 지점)
    E.marks.innerHTML = '';
    const mark = (x, y, label, color, anchor) => {
      const g = s('g', null, E.marks);
      const t = txt({ x, y, class: 't-lbl halo', 'font-size': 17, fill: color, 'text-anchor': anchor || 'middle' }, label, g);
      s('circle', { cx: anchor === 'start' ? x - 8 : anchor === 'end' ? x + 8 : x, cy: y + 10, r: 4, fill: color }, g);
      return t;
    };
    if (st.departed) {
      if (f.foehn && (ps.side === 'leeward' || ps.h >= f.H)) mark(slopeX(f.H, 'windward') + 10, yH + 22, `${fmt(T - 10 * f.H)} ℃`, '#a8500a', 'start');
      if (ps.side === 'leeward') mark(G.xs, G.yOf(M) - 30, `정상 ${fmt(f.foehn ? f.summitTemp : T - 10 * M)} ℃`, f.foehn ? '#17599f' : '#a8500a');
    }

    // 공기 덩어리
    const r = 16 + 2.5 * ps.h;
    const px = ps.x, py = (ps.h === 0 ? G.yGround : mtnY(px)) - r - 4;
    E.parcel.setState({ r, sat, temp: cur.temp });
    E.parcel.g.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)})`);
    const tx = clamp(px, 80, G.W - 80), ty = Math.max(100, py - r - 62);
    sa(E.tagBg, { x: tx - 75, y: ty - 4 });
    sa(E.tagT, { x: tx, y: ty + 20, fill: tempColor(cur.temp) }); E.tagT.textContent = `${fmt(cur.temp)} ℃`;
    sa(E.tagTd, { x: tx, y: ty + 42 }); E.tagTd.textContent = `이슬점 ${fmt(cur.dew)} ℃`;

    // 상태 카드
    let where;
    if (!st.departed || st.p === 0) where = ['neutral', '동해 위 출발 지점 — 🌬️ 바람 불기를 눌러 보세요'];
    else if (st.p <= P_UP0) where = ['unsat', '동해 → 영동 지방으로 이동 중'];
    else if (ps.side === 'windward') where = sat ? ['sat', '풍상측 · 포화 상승 (습윤 단열 변화) · 구름과 비'] : ['unsat', '풍상측 · 불포화 상승 (건조 단열 변화)'];
    else if (st.p < 1) where = ['unsat', '풍하측 · 하강 (건조 단열 변화 → 기온 상승)'];
    else where = ['unsat', '영서 지방 도착!'];
    ui.roWhere.className = 'state-chip ' + where[0];
    ui.roWhere.innerHTML = `<span>${where[1]}</span>`;
    ui.roH.innerHTML = `${fmt(ps.h, 2)}<small>km</small>`;
    ui.roT.innerHTML = `${fmt(cur.temp)}<small>℃</small>`; ui.roT.style.color = tempColor(cur.temp);
    ui.roTd.innerHTML = `${fmt(cur.dew)}<small>℃</small>`; ui.roTd.style.color = 'var(--dew)';
    ui.roRH.innerHTML = `${fmt(rh, 0)}<small>%</small>`; ui.roRH.style.color = 'var(--moist-ink)';
    ui.rhBar.style.width = rh.toFixed(1) + '%';

    renderSegs(f, ps, sat);
    renderGraph(f, ps, cur, sat);
    renderResult(f);
    missionLive(f);
  }

  function renderSegs(f, ps, sat) {
    const { T, Td, M } = st;
    const active = !st.departed || st.p === 0 ? -1
      : ps.side === 'windward' ? (sat ? 1 : 0) : 2;
    const Hc = Math.min(f.H, M);
    const sumT = f.foehn ? f.summitTemp : T - 10 * M;
    const cards = [
      { cls: 'unsat', n: '①', t: '불포화 상승', where: `풍상측 0 → ${fmtS(Hc)} km`, body: '건조 단열 · 습도 증가<br>기온 −10, 이슬점 −2 ℃/km',
        num: `${fmtS(T)} → ${fmtS(T - 10 * Hc)} ℃` },
      f.foehn
        ? { cls: 'sat', n: '②', t: '포화 상승 · 구름과 비', where: `풍상측 ${fmtS(f.H)} → ${fmtS(M)} km`, body: '습윤 단열 · 습도 100 %<br>기온 −5, 이슬점 −5 ℃/km',
          num: `${fmtS(T - 10 * f.H)} → ${fmtS(f.summitTemp)} ℃` }
        : { cls: 'neutral', n: '②', t: '포화 상승 없음', where: '구름이 생기지 않음', body: `산(${fmtS(M)} km)이 상승 응결 고도(${fmtS(f.H)} km)보다 낮아요`, num: '' },
      { cls: 'down', n: '③', t: '하강 · 단열 압축', where: `풍하측 ${fmtS(M)} → 0 km`, body: '건조 단열 · 습도 감소<br>기온 +10, 이슬점 +2 ℃/km',
        num: `${fmtS(sumT)} → ${fmtS(f.arrivalTemp)} ℃` }
    ];
    ui.segs.innerHTML = cards.map((c, i) => `<div class="seg-card ${c.cls}${i === active ? ' active' : ''}">
      <div class="seg-card-t"><span>${c.n}</span>${c.t}</div><div class="seg-card-w">${c.where}</div><div class="seg-card-b">${c.body}</div>${c.num ? `<div class="seg-card-n">${c.num}</div>` : ''}</div>`).join('');
  }

  function renderGraph(f, ps, cur, sat) {
    const ax = E.ax, { T, Td, M } = st;
    sa(E.gLcl, { y1: ax.gy(f.H), y2: ax.gy(f.H), opacity: f.H <= 4.5 ? 1 : 0 });
    sa(E.gLclT, { y: ax.gy(f.H) - 7, opacity: f.H <= 4.5 ? 1 : 0 }); E.gLclT.textContent = `상승 응결 고도 ${fmt(f.H, 2)} km`;
    sa(E.gM, { y1: ax.gy(M), y2: ax.gy(M) });
    const mLabelY = Math.abs(ax.gy(M) - ax.gy(f.H)) < 18 ? ax.gy(M) - 24 : ax.gy(M) - 7;
    sa(E.gMT, { y: mLabelY }); E.gMT.textContent = `산 정상 ${fmt(M, 1)} km`;

    const upH = !st.departed ? 0 : ps.side === 'windward' ? ps.h : M;
    const hb = f.foehn ? Math.min(upH, f.H) : upH;
    sa(E.gDry, { points: pts([[T, 0], [T - 10 * hb, hb]], ax) });
    sa(E.gDewUp, { points: pts(f.foehn && upH > f.H ? [[Td, 0], [Td - 2 * f.H, f.H], [T - 10 * f.H - 5 * (upH - f.H), upH]] : [[Td, 0], [Td - 2 * upH, upH]], ax) });
    sa(E.gMoist, { points: f.foehn && upH > f.H ? pts([[T - 10 * f.H, f.H], [T - 10 * f.H - 5 * (upH - f.H), upH]], ax) : '' });
    if (st.departed && ps.side === 'leeward') {
      const sT = f.foehn ? f.summitTemp : T - 10 * M, sD = f.foehn ? f.summitDew : Td - 2 * M;
      sa(E.gDown, { points: pts([[sT, M], [sT + 10 * (M - ps.h), ps.h]], ax) });
      sa(E.gDewDn, { points: pts([[sD, M], [sD + 2 * (M - ps.h), ps.h]], ax) });
    } else { sa(E.gDown, { points: '' }); sa(E.gDewDn, { points: '' }); }
    sa(E.gDot, { cx: ax.gx(cur.temp), cy: ax.gy(ps.h), fill: sat ? '#2d7dd2' : (ps.side === 'leeward' && st.departed ? '#d9382a' : '#ec7a1c') });
    const done = st.completed || st.p >= 1;
    const same = Math.abs(f.arrivalTemp - T) < 0.01;
    sa(E.gStart, { x: ax.gx(T) - 8, y: ax.Y0 - 10, fill: '#a8500a', 'text-anchor': 'end' });
    E.gStart.textContent = done && same ? `출발 = 도착 ${fmt(T, 0)} ℃` : `출발 ${fmt(T, 0)} ℃`;
    sa(E.gEnd, { x: ax.gx(f.arrivalTemp) + 8, y: ax.Y0 - 10, opacity: done && !same ? 1 : 0 }); E.gEnd.textContent = `도착 ${fmtS(f.arrivalTemp)} ℃`;
  }

  function renderResult(f) {
    const done = st.completed || st.p >= 1;
    if (!done) { ui.result.innerHTML = `<div class="result-wait">바람이 영서 지방에 도착하면 출발 · 도착 공기를 비교해 보여 줘요.</div>`; return; }
    const rh0 = Physics.relHumidity(st.T, st.Td), rh1 = Physics.relHumidity(f.arrivalTemp, f.arrivalDew);
    if (f.foehn) {
      ui.result.innerHTML = `<div class="result-row"><div><span class="k">영동 출발</span><b style="color:${tempColor(st.T)}">${fmt(st.T, 1)} ℃</b><small>습도 ${fmt(rh0, 0)} %</small></div>
        <div class="arrow">→</div><div><span class="k">영서 도착</span><b style="color:${tempColor(f.arrivalTemp)}">${fmt(f.arrivalTemp, 2)} ℃</b><small>습도 ${fmt(rh1, 0)} %</small></div></div>
        <div class="result-msg">기온 <b style="color:var(--hot)">${signed(f.deltaT, 2)} ℃</b> · 이슬점 ${fmt(st.Td, 0)} → ${fmt(f.arrivalDew, 2)} ℃ → <b>고온 건조한 높새바람!</b></div>`;
    } else {
      ui.result.innerHTML = `<div class="result-row"><div><span class="k">영동 출발</span><b>${fmt(st.T, 1)} ℃</b><small>습도 ${fmt(rh0, 0)} %</small></div>
        <div class="arrow">→</div><div><span class="k">영서 도착</span><b>${fmt(f.arrivalTemp, 1)} ℃</b><small>습도 ${fmt(rh1, 0)} %</small></div></div>
        <div class="result-msg warn">⚠️ 산이 상승 응결 고도보다 낮아 <b>구름도 비도 없이</b> 넘어갔어요 → 푄이 일어나지 않아요. 이슬점을 높이거나 산을 높여 볼까요?</div>`;
    }
  }

  function missionLive(f) {
    if (!missionOn(TAB)) return;
    const idx = currentMission(TAB);
    if (idx === 0) setMissionLive(TAB, `상승 응결 고도 ${fmt(f.H, 2)} km / 산 높이 ${fmt(st.M, 1)} km ${f.foehn ? '→ <span class="good">구름이 생길 수 있어요 ☁️</span>' : '→ <span class="bad">산이 상승 응결 고도보다 낮아요</span>'}`);
    if (idx === 1) setMissionLive(TAB, st.predictLocked == null ? '예측 기온을 입력하고 🌬️ 바람 불기를 누르세요.' : `예측 ${fmt(st.predictLocked)} ℃로 확정! 도착까지 지켜보세요…`);
    if (idx === 2) setMissionLive(TAB, `이 설정의 최대 기온 차: ${signed(maxDelta(), 2)} ℃ / 지금 조건: ${signed(f.foehn ? f.deltaT : 0, 2)} ℃`);
  }

  registerTab(TAB, { init, tick, onShow: render, onHide: () => { if (st.playing) { st.playing = false; ui.go.innerHTML = '▶ 이어서 불기'; } } });
})();
