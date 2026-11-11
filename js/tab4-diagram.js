/**
 * tab4-diagram.js — 4. [탐구] 단열선도를 이용하여 대기 안정도 해석하기 (교과서 97쪽)
 *  ① (가)·(나) 지점의 기온 분포를 단열선도에 직접 그리기
 *  ② 구간별 대기 안정도 판정하기
 *  ③ (가) 지점 300 m에서 배출된 오염 물질이 퍼지는 방향 예측하기
 */
'use strict';

(function () {
  const TAB = 'tab4';
  const S = Physics.SOUNDINGS;
  const STN = {
    ga: { name: '(가)', color: '#c0264a', soft: '#fde4ea', data: S.ga },
    na: { name: '(나)', color: '#4338ca', soft: '#e7e6fd', data: S.na }
  };
  const st = {
    step: 0,                         // 0 그리기 · 1 판정 · 2 적용
    station: 'ga',
    plotted: { ga: 0, na: 0 },       // 몇 개 찍었는지 (아래에서부터)
    auto: { ga: false, na: false },  // 자동 그리기를 썼는지
    miss: 0,                         // 지금 점에서 틀린 횟수
    autoTimer: null,
    hoverT: null, hoverZ: null,
    show: { dry: true, moist: true, dew: true },
    answers: [null, null, null],
    focusLayer: -1,
    pollutionAnswer: null,
    smoke: []
  };
  const LAYERS = [
    { stn: 'ga', z0: 0, z1: 300, label: '(가) 지점 지표면 ~ 300 m', ans: 'stable' },
    { stn: 'ga', z0: 300, z1: 500, label: '(가) 지점 300 m ~ 500 m', ans: 'unstable' },
    { stn: 'na', z0: 0, z1: 500, label: '(나) 지점 지표면 ~ 500 m', ans: 'cond' }
  ];
  const CHOICES = [
    { v: 'stable', label: '절대 안정' },
    { v: 'cond', label: '조건부 불안정' },
    { v: 'unstable', label: '절대 불안정' }
  ];
  const E = {}, ui = {};

  registerMissions(TAB, [
    { title: '단열선도에 기온 분포를 직접 그려라', desc: '표를 보고 (가)와 (나) 지점의 높이별 기온을 단열선도에 직접 찍어 보세요.', hint: '' },
    { title: '구간별 대기 안정도를 판정하라', desc: '세 구간의 기온 감률을 단열선과 비교해 안정도를 고르세요.', hint: '' },
    { title: '오염 물질이 퍼지는 방향을 예측하라', desc: '(가) 지점 300 m에서 배출된 오염 물질은 어디로 퍼질까요?', hint: '' }
  ], { alwaysOn: true, onReset: () => renderSteps() });

  /* ───────── 화면 만들기 ───────── */
  function init(panel) {
    LessonHead(panel, {
      tag: '8차시 · 탐구',
      q: '단열선도를 이용하여 대기 안정도 해석하기',
      sub: '(가)·(나) 지점에서 높이에 따라 측정한 기온을 단열선도에 나타내고, 단열선과 비교해 대기 안정도를 판단해 보세요.'
    });
    const ws = h('div', { class: 'workspace ws-chart' });

    const cChart = Card({
      title: '단열선도', cls: 'viz', pad: false,
      legend: '<span class="line-toggles"></span>'
    });
    E.chart = svgRoot(660, 600, '단열선도');
    E.chart.classList.add('cap');
    E.chart.style.cursor = 'crosshair';
    E.chart.style.touchAction = 'manipulation';
    cChart.body.appendChild(h('div', { class: 'svg-wrap' }, E.chart));
    ui.feedback = h('div', { class: 'plot-feedback' });
    cChart.body.appendChild(ui.feedback);
    const tg = cChart.head.querySelector('.line-toggles');
    [['dry', '건조 단열선', 'var(--dry)'], ['moist', '습윤 단열선', 'var(--moist)'], ['dew', '이슬점 감률선', '#5d6b78']].forEach(([k, label, c]) => {
      const lab = h('label', { class: 'tog' }, h('input', { type: 'checkbox', checked: true, onchange: e => { st.show[k] = e.target.checked; drawGuides(); } }),
        h('i', { style: { borderTopColor: c } }), label);
      tg.appendChild(lab);
    });

    const side = h('div', { class: 'side' });
    // 자료 표
    const cTable = Card({ title: '측정 자료 <span style="font-weight:600;color:var(--muted)">(단위: ℃)</span>' });
    ui.stnSeg = Seg([{ value: 'ga', label: '(가) 지점 그리기' }, { value: 'na', label: '(나) 지점 그리기' }], 'ga', v => { st.station = v; st.miss = 0; render(); }, 'block small');
    ui.table = h('table', { class: 'data-table' });
    const btnAuto = Btn('⚡ 이 지점 자동으로 그리기', 'ghost sm', autoPlot, '교사 시범용 — 자동으로 그리면 별은 받을 수 없어요');
    const btnClear = Btn('지우기', 'ghost sm', () => { clearInterval(st.autoTimer); st.plotted = { ga: 0, na: 0 }; st.auto = { ga: false, na: false }; st.miss = 0; render(); });
    cTable.body.append(ui.stnSeg.el, ui.table, h('div', { class: 'btn-row', style: { marginTop: '8px' } }, btnAuto, btnClear));
    side.appendChild(cTable.el);

    // 탐구 단계
    const cSteps = Card({ title: '탐구 과정' });
    ui.stepper = h('div', { class: 'stepper' });
    ui.stepBody = h('div', { class: 'step-body' });
    cSteps.body.append(ui.stepper, ui.stepBody);
    side.appendChild(cSteps.el);

    ws.append(cChart.el, side);
    panel.appendChild(ws);

    panel.appendChild(h('div', { class: 'info-grid' },
      ConceptCard('단열선도', [
        '상승하거나 하강하는 공기 덩어리의 성질 변화를 분석하기 위해 기온과 <b>건조 단열선, 습윤 단열선, 이슬점 감률선</b>을 함께 나타낸 그래프',
        '측정한 기온 분포(기온 변화선)의 기울기를 단열선과 비교하면 층마다 안정도를 판단할 수 있다.',
        '기온 변화선이 <b>습윤 단열선보다 덜 기울어지면(오른쪽으로 누우면)</b> 절대 안정, <b>건조 단열선보다 더 기울어지면</b> 절대 불안정, 그 사이면 조건부 불안정'
      ], '교과서 97쪽 탐구 · 활동 도우미'),
      ConceptCard('역전층과 대기 오염', [
        '높이 올라갈수록 기온이 <b>높아지는</b> 층 = <b>역전층</b> (기온 감률이 음수 → 절대 안정)',
        '바람이 약하고 맑은 날 새벽, 지표면의 복사 냉각으로 잘 생긴다.',
        '역전층이 생기면 연직 운동이 억제되어 <b>오염 물질이 잘 확산되지 않아 대기 오염이 심해질 수 있다</b>.'
      ], '교과서 95쪽 역전층'),
      ThinkCard('결과 및 정리', [
        { q: '(가) 지점과 (나) 지점의 대기 안정도를 높이에 따라 절대 안정, 절대 불안정, 조건부 불안정으로 구분하여 설명해 보자.', a: '(가) 지점에서 지표면~높이 300 m 구간은 기온 감률이 습윤 단열 감률보다 작으므로 절대 안정, 높이 300 m~500 m 구간은 기온 감률이 건조 단열 감률보다 크므로 절대 불안정이다. (나) 지점은 지표면~높이 500 m 구간 모두 기온 감률이 건조 단열 감률보다 작고 습윤 단열 감률보다 크므로 조건부 불안정이다.' },
        { q: '(가) 지점의 높이 300 m에서 주위 공기와 온도가 같은 대기 오염 물질이 배출된다면 어느 방향으로 퍼져 나갈지 설명해 보자.', a: '(가) 지점에서 높이가 300 m보다 높은 곳의 대기는 절대 불안정, 낮은 곳은 절대 안정이다. 따라서 높이 300 m에서 주위 공기와 온도가 같은 대기 오염 물질이 배출되면 높이 300 m보다 낮은 곳으로는 공기가 이동하기 어렵고, 이보다 높은 곳으로 퍼져 나갈 것이다.' }
      ])
    ));

    buildChart();
    render();
  }

  /* ───────── 단열선도 ───────── */
  function buildChart() {
    const ax = makeAxes(E.chart, {
      X0: 84, X1: 636, Y0: 520, Y1: 24, xmin: 10, xmax: 20, xstep: 1,
      ymin: 0, ymax: 500, ystep: 100, minorY: 50, minorX: 0.5, xlabel: '기온 (℃)', ylabel: '높이 (m)', ylabelGap: 56
    });
    E.ax = ax;
    E.guides = s('g', null, ax.bgLayer);
    E.target = s('rect', { x: ax.X0, width: ax.X1 - ax.X0, height: 20, fill: '#fff3c4', opacity: 0 }, ax.bgLayer);
    E.layerHi = s('g', null, ax.plot);
    E.lines = s('g', null, ax.plot);
    E.dots = s('g', null, ax.plot);
    E.cross = s('g', { opacity: 0, 'pointer-events': 'none' }, ax.over);
    E.crossV = s('line', { stroke: '#13283d', 'stroke-width': 1, 'stroke-dasharray': '3 3' }, E.cross);
    E.crossDot = s('circle', { r: 7, fill: 'none', 'stroke-width': 2.5 }, E.cross);
    E.crossT = txt({ class: 't-lbl halo', 'font-size': 15 }, '', E.cross);
    E.lineLabels = s('g', null, ax.over);
    drawGuides();

    E.chart.addEventListener('pointermove', ev => {
      const p = svgPoint(E.chart, ev);
      st.hoverT = Math.round(clamp(lerp(10, 20, (p.x - ax.X0) / (ax.X1 - ax.X0)), 10, 20) * 10) / 10;
      st.hoverZ = Math.round(clamp((ax.Y0 - p.y) / (ax.Y0 - ax.Y1) * 500, 0, 500) / 50) * 50;
      drawCross();
    });
    E.chart.addEventListener('pointerleave', () => { st.hoverT = null; drawCross(); });
    E.chart.addEventListener('click', ev => {
      const p = svgPoint(E.chart, ev);
      if (p.x < ax.X0 - 10 || p.x > ax.X1 + 10 || p.y < ax.Y1 - 14 || p.y > ax.Y0 + 14) return;
      const T = Math.round(clamp(lerp(10, 20, (p.x - ax.X0) / (ax.X1 - ax.X0)), 10, 20) * 10) / 10;
      const z = Math.round(clamp((ax.Y0 - p.y) / (ax.Y0 - ax.Y1) * 500, 0, 500) / 50) * 50;
      tryPlot(T, z);
    });
  }

  function drawGuides() {
    const ax = E.ax, g = E.guides;
    g.innerHTML = '';
    const line = (T0, perM, color, w, dash) => s('line', { x1: ax.gx(T0), y1: ax.gy(0), x2: ax.gx(T0 - perM * 500), y2: ax.gy(500), stroke: color, 'stroke-width': w, 'stroke-dasharray': dash || null, opacity: 0.55 }, g);
    if (st.show.dew) for (let T0 = 10; T0 <= 21; T0 += 1) line(T0, 0.002, '#5d6b78', 1.2);
    if (st.show.moist) for (let T0 = 10; T0 <= 23; T0 += 1) line(T0, 0.005, '#2d7dd2', 1.4);
    if (st.show.dry) for (let T0 = 10; T0 <= 25; T0 += 1) line(T0, 0.01, '#ec7a1c', 1.4);
  }

  function drawCross() {
    const ax = E.ax;
    const tz = targetZ();
    if (st.hoverT == null || st.step !== 0 || tz == null) { E.cross.setAttribute('opacity', 0); return; }
    const c = STN[st.station].color;
    sa(E.cross, { opacity: 1 });
    sa(E.crossV, { x1: ax.gx(st.hoverT), x2: ax.gx(st.hoverT), y1: ax.Y0, y2: ax.Y1 });
    sa(E.crossDot, { cx: ax.gx(st.hoverT), cy: ax.gy(tz), stroke: c });
    sa(E.crossT, { x: ax.gx(st.hoverT) + 10, y: ax.gy(tz) - 10, fill: c });
    E.crossT.textContent = `${fmt(st.hoverT, 1)} ℃`;
  }

  function targetZ() {
    const n = st.plotted[st.station];
    return n >= S.heights.length ? null : S.heights[n];
  }

  /* ───────── 점 찍기 ───────── */
  function tryPlot(T, z) {
    if (st.step !== 0) { feedback('info', '그리기 단계가 끝났어요. 위 <b>탐구 과정</b>에서 다음 단계를 진행하세요.'); return; }
    const stn = STN[st.station];
    const n = st.plotted[st.station];
    if (n >= S.heights.length) { feedback('info', `${stn.name} 지점은 다 그렸어요. ${st.station === 'ga' ? '(나)' : '(가)'} 지점을 골라 그려 보세요.`); return; }
    const zt = S.heights[n], Tt = stn.data[n];
    if (z !== zt) { feedback('warn', `지금은 <b>높이 ${zt} m</b> 차례예요. 노란 띠가 있는 높이에 찍어 주세요.`); return; }
    if (Math.abs(T - Tt) <= TUNING.tab4.plotTol + 1e-9) {
      st.plotted[st.station] = n + 1; st.miss = 0;
      feedback('good', `${stn.name} ${zt} m : <b>${fmt(Tt, 1)} ℃</b> ✓`);
      afterPlot();
    } else {
      st.miss += 1;
      const reveal = st.miss >= TUNING.tab4.revealAfter;
      feedback('warn', `찍은 값 ${fmt(T, 1)} ℃ — 표의 값과 달라요. ` + (reveal ? `표에서 ${stn.name} 지점 ${zt} m의 기온은 <b>${fmt(Tt, 1)} ℃</b>예요.` : '표를 다시 확인해 볼까요?'));
    }
    render();
  }
  function afterPlot() {
    const done = k => st.plotted[k] >= S.heights.length;
    if (done(st.station) && !done(st.station === 'ga' ? 'na' : 'ga')) {
      st.station = st.station === 'ga' ? 'na' : 'ga';
      ui.stnSeg.set(st.station);
      feedback('good', `${STN[st.station === 'ga' ? 'na' : 'ga'].name} 지점 완성! 이제 ${STN[st.station].name} 지점을 그려 보세요.`);
    }
    if (done('ga') && done('na')) {
      if (!st.auto.ga && !st.auto.na) award(TAB, 0);
      feedback('good', st.auto.ga || st.auto.na
        ? '두 지점의 기온 분포를 모두 그렸어요. (자동 그리기를 써서 ⭐은 없어요) → 탐구 과정 ②로!'
        : '두 지점의 기온 분포를 모두 직접 그렸어요! → 탐구 과정 ②로!');
      st.step = Math.max(st.step, 1);
    }
  }
  function autoPlot() {
    if (st.step !== 0) return;
    clearInterval(st.autoTimer);
    const k = st.station;
    if (st.plotted[k] >= S.heights.length) return;
    st.auto[k] = true;
    st.autoTimer = setInterval(() => {
      if (st.plotted[k] >= S.heights.length) { clearInterval(st.autoTimer); afterPlot(); render(); return; }
      st.plotted[k] += 1;
      render();
    }, 110);
  }
  function feedback(kind, html) { ui.feedback.className = 'plot-feedback ' + kind; ui.feedback.innerHTML = html; }

  /* ───────── 그리기 ───────── */
  function render() {
    if (!E.chart) return;
    const ax = E.ax;
    // 노란 띠(다음에 찍을 높이)
    const tz = st.step === 0 ? targetZ() : null;
    if (tz != null) sa(E.target, { y: ax.gy(tz) - 10, opacity: 0.9 }); else sa(E.target, { opacity: 0 });
    // 선과 점
    E.lines.innerHTML = ''; E.dots.innerHTML = ''; E.lineLabels.innerHTML = '';
    ['ga', 'na'].forEach(k => {
      const n = st.plotted[k], stn = STN[k];
      if (!n) return;
      const arr = [];
      for (let i = 0; i < n; i++) arr.push([stn.data[i], S.heights[i]]);
      s('polyline', { points: pts(arr, ax), fill: 'none', stroke: stn.color, 'stroke-width': 4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, E.lines);
      arr.forEach(q => s('circle', { cx: ax.gx(q[0]), cy: ax.gy(q[1]), r: 5.5, fill: '#fff', stroke: stn.color, 'stroke-width': 3 }, E.dots));
      if (n >= 4) {
        const i = k === 'ga' ? 3 : 4;
        txt({ x: ax.gx(stn.data[i]) + (k === 'ga' ? -14 : 14), y: ax.gy(S.heights[i]), 'text-anchor': k === 'ga' ? 'end' : 'start', class: 't-lbl halo', fill: stn.color, 'font-size': 18 }, `${stn.name} 지점`, E.lineLabels);
      }
    });
    drawLayerFocus();
    drawCross();
    renderTable();
    renderSteps();
  }

  function renderTable() {
    const tz = st.step === 0 ? targetZ() : null;
    let html = '<thead><tr><th>높이 (m)</th><th style="color:#c0264a">(가)</th><th style="color:#4338ca">(나)</th></tr></thead><tbody>';
    for (let i = S.heights.length - 1; i >= 0; i--) {
      const z = S.heights[i];
      const cell = k => {
        const done = st.plotted[k] > i;
        const cur = st.station === k && tz === z;
        return `<td class="${done ? 'done' : ''}${cur ? ' cur' : ''}" style="${cur ? `--c:${STN[k].color}` : ''}">${fmt(STN[k].data[i], 1)}${done ? '<span class="ck">✓</span>' : ''}</td>`;
      };
      html += `<tr><th>${z}</th>${cell('ga')}${cell('na')}</tr>`;
    }
    ui.table.innerHTML = html + '</tbody>';
  }

  /* 판정 단계에서 구간 강조 + 그 구간 밑점을 지나는 건조·습윤 단열선 */
  function drawLayerFocus() {
    const ax = E.ax, g = E.layerHi;
    g.innerHTML = '';
    const i = st.focusLayer;
    if (st.step !== 1 || i < 0) return;
    const L = LAYERS[i], stn = STN[L.stn];
    const i0 = S.heights.indexOf(L.z0), i1 = S.heights.indexOf(L.z1);
    const T0 = stn.data[i0], dz = L.z1 - L.z0;
    s('rect', { x: ax.X0, y: ax.gy(L.z1), width: ax.X1 - ax.X0, height: ax.gy(L.z0) - ax.gy(L.z1), fill: stn.soft, opacity: 0.6 }, g);
    s('line', { x1: ax.gx(T0), y1: ax.gy(L.z0), x2: ax.gx(T0 - 0.01 * dz), y2: ax.gy(L.z1), stroke: '#ec7a1c', 'stroke-width': 4, 'stroke-dasharray': '10 6' }, g);
    s('line', { x1: ax.gx(T0), y1: ax.gy(L.z0), x2: ax.gx(T0 - 0.005 * dz), y2: ax.gy(L.z1), stroke: '#2d7dd2', 'stroke-width': 4, 'stroke-dasharray': '10 6' }, g);
    const arr = [];
    for (let k = i0; k <= i1; k++) arr.push([stn.data[k], S.heights[k]]);
    s('polyline', { points: pts(arr, ax), fill: 'none', stroke: stn.color, 'stroke-width': 8, 'stroke-opacity': 0.35, 'stroke-linecap': 'round' }, g);
    txt({ x: ax.gx(T0 - 0.01 * dz) - 6, y: ax.gy(L.z1) + 18, 'text-anchor': 'end', class: 't-lbl halo', fill: '#a8500a', 'font-size': 14 }, '건조 단열선', g);
    txt({ x: ax.gx(T0 - 0.005 * dz) + 6, y: ax.gy(L.z1) + 18, 'text-anchor': 'start', class: 't-lbl halo', fill: '#17599f', 'font-size': 14 }, '습윤 단열선', g);
  }

  /* ───────── 탐구 단계 카드 ───────── */
  function renderSteps() {
    const names = ['① 기온 분포 그리기', '② 안정도 판정', '③ 오염 물질 확산'];
    const unlocked = i => i === 0 || (i === 1 && st.step >= 1) || (i === 2 && st.step >= 2);
    ui.stepper.innerHTML = '';
    names.forEach((nm, i) => {
      const star = Mission.stars[TAB][i];
      const b = h('button', { type: 'button', class: 'step-chip' + (st.view === i || (st.view == null && st.step === i) ? ' on' : '') + (star ? ' done' : ''), disabled: !unlocked(i) },
        h('span', { html: `${star ? '⭐' : unlocked(i) ? '' : '🔒 '}${nm}` }));
      b.addEventListener('click', () => { st.view = i; if (i <= st.step) { renderSteps(); drawLayerFocus(); } });
      ui.stepper.appendChild(b);
    });
    const v = st.view == null ? st.step : Math.min(st.view, st.step);
    ui.stepBody.innerHTML = '';
    if (v === 0) stepPlot();
    if (v === 1) stepJudge();
    if (v === 2) stepPollution();
  }

  function stepPlot() {
    const k = st.station, n = st.plotted[k];
    const total = S.heights.length;
    ui.stepBody.append(
      h('p', { class: 'step-p', html: `표의 값을 보고 <b style="color:${STN[k].color}">${STN[k].name} 지점</b>의 기온을 단열선도에 찍어요. <b>노란 띠</b>가 있는 높이에서 알맞은 기온 위치를 누르세요.` }),
      h('div', { class: 'prog-row' },
        progBar('(가)', st.plotted.ga, total, STN.ga.color), progBar('(나)', st.plotted.na, total, STN.na.color)),
      h('p', { class: 'step-note', html: '⭐ 두 지점을 모두 <b>직접</b> 그리면 별을 받아요. (⚡ 자동 그리기는 교사 시범용)' })
    );
    if (st.step >= 1) ui.stepBody.appendChild(Btn('② 안정도 판정으로 →', '', () => { st.view = 1; renderSteps(); }));
    void n;
  }
  function progBar(label, n, total, color) {
    return h('div', { class: 'prog' }, h('span', { class: 'prog-k', style: { color }, text: label }),
      h('div', { class: 'prog-bar' }, h('span', { style: { width: (n / total * 100) + '%', background: color } })),
      h('span', { class: 'prog-n', text: `${n}/${total}` }));
  }

  function stepJudge() {
    ui.stepBody.appendChild(h('p', { class: 'step-p', html: '구간을 누르면 단열선도에 그 구간과 <b style="color:var(--dry-ink)">건조</b>·<b style="color:var(--moist-ink)">습윤</b> 단열선이 겹쳐 보여요. 기울기를 비교해 안정도를 고르세요.' }));
    LAYERS.forEach((L, i) => {
      const stn = STN[L.stn];
      const ans = st.answers[i];
      const ok = ans === L.ans;
      const row = h('div', { class: 'judge-row' + (st.focusLayer === i ? ' focus' : '') + (ans ? (ok ? ' ok' : ' no') : '') });
      const head = h('button', { type: 'button', class: 'judge-head', html: `<i style="background:${stn.color}"></i>${L.label}` });
      head.addEventListener('click', () => { st.focusLayer = i; renderSteps(); drawLayerFocus(); });
      row.appendChild(head);
      const opts = h('div', { class: 'judge-opts' });
      CHOICES.forEach(c => {
        const b = h('button', { type: 'button', class: 'chip' + (ans === c.v ? ' on' : ''), text: c.label });
        b.addEventListener('click', () => { st.answers[i] = c.v; st.focusLayer = i; checkJudge(); renderSteps(); drawLayerFocus(); });
        opts.appendChild(b);
      });
      row.appendChild(opts);
      if (ans) {
        const i0 = S.heights.indexOf(L.z0), i1 = S.heights.indexOf(L.z1);
        const g = Physics.lapseRate(L.z0, stn.data[i0], L.z1, stn.data[i1]);
        const why = L.ans === 'stable'
          ? `기온 감률 = ${fmt(g, 0)} ℃/km (위로 갈수록 기온 상승 → <b>역전층</b>) &lt; 습윤 단열 감률 5 → <b>절대 안정</b>`
          : L.ans === 'unstable'
            ? `기온 감률 = ${fmt(g, 0)} ℃/km &gt; 건조 단열 감률 10 → <b>절대 불안정</b>`
            : `습윤 5 &lt; 기온 감률 = ${fmt(g, 0)} ℃/km &lt; 건조 10 → <b>조건부 불안정</b>`;
        row.appendChild(h('div', { class: 'judge-fb', html: ok ? '✓ 정답! ' + why : '✗ 다시 생각해 볼까요? 구간 선의 기울기를 두 단열선과 비교해 보세요.' }));
      }
      ui.stepBody.appendChild(row);
    });
    if (st.step >= 2) ui.stepBody.appendChild(Btn('③ 오염 물질 확산으로 →', '', () => { st.view = 2; st.focusLayer = -1; renderSteps(); drawLayerFocus(); }));
  }
  function checkJudge() {
    if (LAYERS.every((L, i) => st.answers[i] === L.ans)) {
      award(TAB, 1);
      st.step = Math.max(st.step, 2);
    }
  }

  function stepPollution() {
    const Q = [
      { v: 'up', label: '높이 300 m보다 <b>높은 곳</b>으로 퍼진다' },
      { v: 'down', label: '높이 300 m보다 <b>낮은 곳(지표 쪽)</b>으로 퍼진다' },
      { v: 'both', label: '위아래로 <b>고르게</b> 퍼진다' },
      { v: 'none', label: '300 m 높이에 <b>머물러</b> 옆으로만 퍼진다' }
    ];
    ui.stepBody.appendChild(h('p', { class: 'step-p', html: '(가) 지점의 높이 <b>300 m</b>에서 주위 공기와 온도가 같은 대기 오염 물질이 배출된다면 어느 방향으로 퍼져 나갈까요?' }));
    const list = h('div', { class: 'quiz-opts' });
    Q.forEach(q => {
      const b = h('button', { type: 'button', class: 'quiz-opt' + (st.pollutionAnswer === q.v ? (q.v === 'up' ? ' ok' : ' no') : ''), html: q.label });
      b.addEventListener('click', () => {
        st.pollutionAnswer = q.v;
        if (q.v === 'up') award(TAB, 2);
        st.smoke = [];
        renderSteps();
      });
      list.appendChild(b);
    });
    ui.stepBody.appendChild(list);
    if (st.pollutionAnswer) {
      const ok = st.pollutionAnswer === 'up';
      ui.stepBody.appendChild(h('div', { class: 'judge-fb ' + (ok ? 'good' : 'bad'), html: ok
        ? '✓ 정답! 300 m 위는 <b>절대 불안정</b>이라 오염 물질이 활발히 위로 퍼지고, 아래는 <b>역전층(절대 안정)</b>이라 내려가지 못해요.'
        : '✗ 아래 시뮬레이션을 보고 다시 골라 보세요. 300 m 위와 아래의 안정도는 어떻게 다를까요?' }));
      E.smokeCv = h('canvas', { width: 680, height: 420, class: 'smoke-cv', 'aria-label': '오염 물질 확산 시뮬레이션' });
      ui.stepBody.appendChild(E.smokeCv);
    }
  }

  /* 오염 물질 확산 애니메이션 (캔버스) */
  function tick(dt) {
    const cv = E.smokeCv;
    if (!cv || !cv.isConnected || !st.pollutionAnswer) return;
    const W = cv.width, H = cv.height, ctx = cv.getContext('2d');
    const z2y = z => H - 30 - z / 500 * (H - 60);
    const sx = 150;
    // 입자 만들기
    for (let i = 0; i < 3; i++) st.smoke.push({ x: sx, z: 300, vz: 0, age: 0 });
    st.smoke.forEach(p => {
      p.age += dt;
      p.x += (55 + 25 * Math.random()) * dt;
      if (p.z > 300) {
        // 절대 불안정: 위로 밀려 올라가며 크게 섞임
        p.vz += (30 + (Math.random() - 0.3) * 260) * dt;
        p.vz *= 0.96;
      } else {
        // 역전층(절대 안정): 아래로 내려가면 다시 300 m로 되돌아옴
        p.vz += ((300 - p.z) * 4 + (Math.random() - 0.5) * 60) * dt;
        p.vz *= 0.9;
      }
      p.z = clamp(p.z + p.vz * dt, 0, 520);
    });
    st.smoke = st.smoke.filter(p => p.x < W + 20 && p.age < 9);
    // 배경
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fde3cf'; ctx.fillRect(0, z2y(500), W, z2y(300) - z2y(500));
    ctx.fillStyle = '#dfeefc'; ctx.fillRect(0, z2y(300), W, z2y(0) - z2y(300));
    ctx.fillStyle = '#79b95c'; ctx.fillRect(0, z2y(0), W, H - z2y(0));
    ctx.font = '700 22px ' + getComputedStyle(document.body).fontFamily;
    ctx.fillStyle = '#9a3d0b'; ctx.fillText('300~500 m : 절대 불안정', W - 300, z2y(470));
    ctx.fillStyle = '#18548f'; ctx.fillText('0~300 m : 역전층 (절대 안정)', W - 330, z2y(40));
    ctx.font = '600 18px ' + getComputedStyle(document.body).fontFamily;
    ctx.fillStyle = '#44596e';
    [0, 100, 200, 300, 400, 500].forEach(z => { ctx.fillText(z + ' m', 8, z2y(z) + 6); });
    ctx.strokeStyle = '#c0530f'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(70, z2y(300)); ctx.lineTo(W, z2y(300)); ctx.stroke(); ctx.setLineDash([]);
    // 굴뚝(배출 지점)
    ctx.fillStyle = '#6b7785'; ctx.fillRect(sx - 14, z2y(300), 28, z2y(0) - z2y(300));
    ctx.fillStyle = '#c0530f'; ctx.fillRect(sx - 16, z2y(300) - 4, 32, 8);
    // 입자
    st.smoke.forEach(p => {
      const a = clamp(1 - p.age / 9, 0, 1) * 0.55;
      ctx.fillStyle = `rgba(70, 70, 78, ${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(p.x, z2y(p.z), 6 + p.age * 2.2, 0, Math.PI * 2); ctx.fill();
    });
  }

  registerTab(TAB, { init, tick, onShow: render });
})();
