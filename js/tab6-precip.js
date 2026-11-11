/**
 * tab6-precip.js — 6. 강수 과정 (병합설 · 빙정설)
 */
'use strict';

(function () {
  const TAB = 'tab6';
  const st = {
    kind: 'coal',
    coal: { dist: 'uniform', up: 'weak', running: false, drops: [], rain: [], splash: [], rainCount: 0, merges: 0, maxR: 0 },
    ice: { T: -12, e: 2.32, drop: 1, crystal: 0.25, surf: 4, fall: null, grownOnce: false },
    quiz: [null, null, null]
  };
  const E = {}, ui = {};
  const CW = 800, CH = 460;
  const CLOUD = { x0: 40, x1: 760, top: 70, base: 300, ground: 440 };
  const N0 = 230;

  registerMissions(TAB, [
    {
      title: '병합설로 비를 내려라',
      desc: `병합설 실험에서 구름 속 물방울을 빗방울로 키워 지표에 빗방울 ${TUNING.tab6.rainGoal}개를 떨어뜨리세요.`,
      hint: '크기가 다른 물방울은 떨어지는 속도가 달라 서로 충돌하고 합쳐져요. 물방울 크기 분포를 <b>다양하게</b> 해 보세요. 상승 기류가 강하면 물방울이 구름에 오래 머물며 더 크게 자라요.'
    },
    {
      title: '빙정이 자라는 조건을 찾아라',
      desc: '빙정설 그래프에서 구름 속 공기 상태(점)를 옮겨, 과냉각 물방울은 증발하고 빙정만 자라게 하세요. 빙정이 다 자랄 때까지 기다려요.',
      hint: '공기가 <b>빙정에 대해서는 과포화</b>, <b>과냉각 물방울에 대해서는 불포화</b>여야 해요. 그래프에서 두 곡선(물·얼음의 포화 수증기압) <b>사이</b>를 찾아보세요.'
    },
    {
      title: '따뜻한 비와 찬 비를 구분하라',
      desc: '아래 <b>강수 과정 퀴즈</b> 3문제를 모두 맞혀 보세요.',
      hint: '저위도 지방이나 여름철 중위도 지방의 구름은 주로 0 ℃ 이상 → 병합설(따뜻한 비). 고위도·중위도 지방의 0 ℃ 이하 구름 → 빙정설, 눈이 녹으면 찬 비!'
    }
  ], { onModeChange: () => render() });

  /* ───────── 화면 만들기 ───────── */
  function init(panel) {
    LessonHead(panel, {
      tag: '9차시 · 강수 과정',
      q: '작은 구름 방울은 어떻게 커다란 빗방울이 될까?',
      sub: '구름 입자가 빗방울 크기로 성장하는 두 가지 이론, 병합설과 빙정설을 실험해 보세요.',
      missionTab: TAB
    });
    panel.appendChild(h('div', { class: 'mission-card', id: 'mission-' + TAB }));
    ui.kindSeg = Seg([{ value: 'coal', label: '💧 병합설 (따뜻한 비)' }, { value: 'ice', label: '❄️ 빙정설 (찬 비 · 눈)' }], st.kind,
      v => { st.kind = v; syncKind(); render(); }, 'kind-seg');
    panel.appendChild(h('div', { class: 'kind-row' }, ui.kindSeg.el, ui.kindDesc = h('span', { class: 'kind-desc' })));

    const ws = h('div', { class: 'workspace ws-wide' });
    const side = h('div', { class: 'side' });
    const cSet = Card({ title: '조건 설정' });
    // 병합설
    ui.cCoal = h('div', { class: 'controls' });
    ui.dist = Seg([{ value: 'varied', label: '크기 다양함' }, { value: 'uniform', label: '크기 비슷함' }], st.coal.dist, v => { st.coal.dist = v; seedDrops(); }, 'block');
    ui.up = Seg([{ value: 'weak', label: '상승 기류 약함' }, { value: 'strong', label: '상승 기류 강함' }], st.coal.up, v => { st.coal.up = v; }, 'block');
    ui.run = Btn('▶ 구름 속 시간 흐르게', 'big', () => { st.coal.running = !st.coal.running; syncRun(); });
    const again = Btn('↺ 처음 구름으로', 'ghost', () => { seedDrops(); });
    ui.cCoal.append(h('div', { class: 'ctrl' }, h('div', { class: 'ctrl-top' }, h('label', { text: '구름 속 물방울 크기 분포' })), ui.dist.el),
      h('div', { class: 'ctrl' }, h('div', { class: 'ctrl-top' }, h('label', { text: '상승 기류' })), ui.up.el), ui.run, again);
    // 빙정설
    ui.cIce = h('div', { class: 'controls' });
    ui.iceT = Slider({ label: '구름 속 기온', min: -40, max: 0, step: 0.5, value: st.ice.T, unit: ' ℃', digits: 1, colorize: tempColor, color: 'var(--cold)',
      onInput: v => { st.ice.T = v; render(); } });
    ui.iceE = Slider({ label: '실제 수증기압', min: 0.1, max: 6.2, step: 0.01, value: st.ice.e, unit: ' hPa', digits: 2, color: 'var(--dew)',
      onInput: v => { st.ice.e = v; render(); } });
    ui.surf = Slider({ label: '지표 부근 기온', min: -8, max: 12, step: 1, value: st.ice.surf, unit: ' ℃', colorize: tempColor,
      onInput: v => { st.ice.surf = v; render(); } });
    const regrow = Btn('↺ 물방울·빙정 처음 크기로', 'ghost', () => { st.ice.drop = 1; st.ice.crystal = 0.25; st.ice.fall = null; render(); });
    ui.cIce.append(ui.iceT.el, ui.iceE.el, h('div', { class: 'note-sm', html: '💡 오른쪽 그래프의 점을 직접 끌어도 돼요.' }), ui.surf.el, regrow);
    cSet.body.append(ui.cCoal, ui.cIce);
    side.appendChild(cSet.el);

    const cState = Card({ title: '관찰' });
    ui.obs = h('div');
    cState.body.appendChild(ui.obs);
    side.appendChild(cState.el);

    const cScene = Card({ title: '구름 속', cls: 'viz', pad: false });
    ui.sceneTitle = cScene.head.querySelector('.card-title');
    E.cv = h('canvas', { width: CW * 2, height: CH * 2, 'aria-label': '병합설 시뮬레이션' });
    E.cv.style.aspectRatio = `${CW} / ${CH}`;
    ui.coalWrap = h('div', { class: 'svg-wrap' }, E.cv);
    E.iceScene = svgRoot(CW, CH, '빙정설 구름 단면');
    ui.iceWrap = h('div', { class: 'svg-wrap' }, E.iceScene);
    cScene.body.append(ui.coalWrap, ui.iceWrap);

    const cChart = Card({ title: '그래프', cls: 'viz', pad: false });
    ui.chartTitle = cChart.head.querySelector('.card-title');
    ui.chartLegend = h('div', { class: 'legend' });
    cChart.head.appendChild(ui.chartLegend);
    E.hist = svgRoot(440, 400, '물방울 크기 분포 막대그래프');
    ui.histWrap = h('div', { class: 'svg-wrap' }, E.hist);
    E.vp = svgRoot(440, 420, '과냉각 물방울과 빙정의 포화 수증기압 그래프');
    ui.vpWrap = h('div', { class: 'svg-wrap' }, E.vp);
    ui.chartNote = h('div', { class: 'result-box' });
    cChart.body.append(ui.histWrap, ui.vpWrap, ui.chartNote);
    ws.append(side, cScene.el, cChart.el);
    panel.appendChild(ws);

    // 아래: 개념 + 퀴즈
    ui.quiz = h('div', { class: 'card card-pad think' });
    panel.appendChild(h('div', { class: 'info-grid' },
      ConceptCard('병합설', [
        '<b>저위도 지방</b>이나 <b>여름철 중위도 지방</b>의 구름은 주로 <b>0 ℃ 이상</b>으로, 대부분 물방울로 이루어져 있다.',
        '크기가 다른 물방울은 떨어지는 속도가 달라, 상승·하강하며 서로 <b>충돌하고 합쳐져</b> 성장한다.',
        '물방울이 <b>다양한 크기</b>로 분포할수록, 구름이 <b>두껍고 상승 기류가 강해</b> 오래 머무를수록 빗방울로 잘 성장한다.',
        '이렇게 내리는 비 = <b>따뜻한 비</b>'
      ], '교과서 그림 Ⅲ-22 병합설'),
      ConceptCard('빙정설', [
        '<b>고위도</b>나 <b>중위도</b> 지방의 구름: 0 ℃ 이상인 하층은 물방울, −40 ℃ 이하인 상층은 빙정, <b>−40 ℃~0 ℃</b> 중간층에는 빙정과 <b>과냉각 물방울</b>이 함께 존재한다.',
        '같은 온도에서 <b>과냉각 물방울의 포화 수증기압 &gt; 빙정의 포화 수증기압</b>',
        '공기가 빙정에 대해 과포화, 물방울에 대해 불포화이면 물방울은 <b>증발</b>하고, 수증기가 빙정에 달라붙어 <b>빙정이 성장</b>한다.',
        '빙정이 무거워져 떨어지면 <b>눈</b>, 떨어지다가 녹으면 <b>비(찬 비)</b>가 된다.'
      ], '교과서 그림 Ⅲ-21 · Ⅲ-22 빙정설'),
      ui.quiz
    ));

    buildCoal(); buildHist(); buildIce(); buildVP();
    seedDrops();
    renderQuiz();
    syncKind();
    render();
  }

  function syncKind() {
    const c = st.kind === 'coal';
    ui.cCoal.style.display = c ? '' : 'none'; ui.cIce.style.display = c ? 'none' : '';
    ui.coalWrap.style.display = c ? '' : 'none'; ui.iceWrap.style.display = c ? 'none' : '';
    ui.histWrap.style.display = c ? '' : 'none'; ui.vpWrap.style.display = c ? 'none' : '';
    ui.kindDesc.textContent = c ? '0 ℃ 이상인 구름에서 크기가 다른 물방울이 충돌·병합하여 성장' : '−40~0 ℃ 구름에서 과냉각 물방울이 증발하고 빙정이 성장';
    ui.sceneTitle.innerHTML = '<span class="dot"></span>' + (c ? '0 ℃ 이상인 구름 속 물방울' : '구름 단면과 빙정의 성장');
    ui.chartTitle.innerHTML = '<span class="dot"></span>' + (c ? '물방울 크기 분포' : '과냉각 물방울과 빙정의 포화 수증기압');
    ui.chartLegend.innerHTML = c ? '' : legendItem('#2d7dd2', '과냉각 물방울') + legendItem('#ec7a1c', '빙정') + legendItem('#c0264a', '차이(오른쪽 축)', 'dash');
    if (!c) { st.coal.running = false; syncRun(); }
  }
  function syncRun() { ui.run.innerHTML = st.coal.running ? '⏸ 멈춤' : '▶ 구름 속 시간 흐르게'; }

  /* ═════════════ 병합설 ═════════════ */
  const rOf = m => 2.3 * Math.cbrt(m);
  const RAIN_R = 6.6;
  function newDrop(anyY) {
    const varied = st.coal.dist === 'varied';
    const R = Math.random;
    const m = varied ? (R() < 0.7 ? 1 + R() * 1.2 : 2 + R() * 4) : 1;
    return { x: CLOUD.x0 + 20 + R() * (CLOUD.x1 - CLOUD.x0 - 40), y: anyY ? CLOUD.top + 10 + R() * (CLOUD.base - CLOUD.top - 20) : CLOUD.top + 10 + R() * 60, m, vx: 0 };
  }
  function seedDrops() {
    const c = st.coal;
    c.drops = []; c.rain = []; c.splash = []; c.rainCount = 0; c.merges = 0; c.maxR = 0;
    for (let i = 0; i < N0; i++) c.drops.push(newDrop(true));
    renderHist(); renderObs();
  }
  function stepCoal(dt) {
    const c = st.coal;
    const U = c.up === 'strong' ? 14 : 4;
    const drops = c.drops;
    // 이동
    for (const d of drops) {
      const r = rOf(d.m);
      const vfall = 0.9 * r * r;
      d.vx += (Math.random() - 0.5) * 30 * dt; d.vx *= 0.9;
      d.x += d.vx * dt;
      d.y += (vfall - U) * dt + (Math.random() - 0.5) * 3 * dt;
      d.vy = vfall - U;
      if (d.x < CLOUD.x0 + 6) d.x = CLOUD.x0 + 6;
      if (d.x > CLOUD.x1 - 6) d.x = CLOUD.x1 - 6;
    }
    // 충돌 · 병합 (크기가 달라 속도 차이가 클수록 잘 합쳐짐)
    drops.sort((a, b) => a.x - b.x);
    for (let i = 0; i < drops.length; i++) {
      const a = drops[i];
      if (a.dead) continue;
      const ra = rOf(a.m);
      for (let j = i + 1; j < drops.length; j++) {
        const b = drops[j];
        if (b.x - a.x > 14) break;
        if (b.dead) continue;
        const rb = rOf(b.m);
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx * dx + dy * dy > (ra + rb) * (ra + rb)) continue;
        const eff = clamp(Math.abs(a.vy - b.vy) / 14, 0, 0.85);
        if (Math.random() > eff) continue;
        const [big, small] = a.m >= b.m ? [a, b] : [b, a];
        big.m += small.m; small.dead = true; c.merges += 1;
      }
    }
    c.drops = drops.filter(d => !d.dead);
    // 구름 경계 처리
    for (const d of c.drops) {
      const r = rOf(d.m);
      if (d.y < CLOUD.top + 4) {
        if (d.m < 3) Object.assign(d, newDrop(true)); else d.y = CLOUD.top + 4;
      }
      if (d.y > CLOUD.base) {
        d.dead = true;
        if (r >= RAIN_R * 0.85) c.rain.push({ x: d.x, y: d.y, m: d.m });
      }
      c.maxR = Math.max(c.maxR, r);
    }
    c.drops = c.drops.filter(d => !d.dead);
    while (c.drops.length < N0) c.drops.push(newDrop(false)); // 응결로 새 구름 방울 생성
    // 비
    for (const rd of c.rain) {
      rd.y += 150 * dt;
      if (rd.y >= CLOUD.ground) { rd.dead = true; c.rainCount += 1; c.splash.push({ x: rd.x, t: 0 }); }
    }
    c.rain = c.rain.filter(rd => !rd.dead);
    c.splash.forEach(s2 => { s2.t += dt; });
    c.splash = c.splash.filter(s2 => s2.t < 0.5);
  }
  function buildCoal() { E.ctx = E.cv.getContext('2d'); }
  function drawCoal() {
    const ctx = E.ctx, c = st.coal;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, CW, CH);
    const g = ctx.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, '#7f97ad'); g.addColorStop(1, '#c9d6e1');
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
    // 구름
    ctx.fillStyle = 'rgba(244, 247, 250, 0.92)';
    ctx.beginPath();
    roundRect(ctx, CLOUD.x0, CLOUD.top, CLOUD.x1 - CLOUD.x0, CLOUD.base - CLOUD.top, 40);
    ctx.fill();
    for (let i = 0; i < 11; i++) {
      const r = 46 + 14 * Math.sin(i * 2.3);
      ctx.beginPath(); ctx.arc(CLOUD.x0 + 40 + i * 68, CLOUD.top + 34, r, Math.PI, 0); ctx.fill();
    }
    // 상승 기류 화살표
    ctx.strokeStyle = 'rgba(217, 56, 42, 0.35)'; ctx.lineWidth = c.up === 'strong' ? 6 : 3;
    [140, 400, 660].forEach(x => {
      ctx.beginPath(); ctx.moveTo(x, CLOUD.base - 20); ctx.lineTo(x, CLOUD.top + 40); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 10, CLOUD.top + 54); ctx.lineTo(x, CLOUD.top + 40); ctx.lineTo(x + 10, CLOUD.top + 54); ctx.stroke();
    });
    const font = getComputedStyle(document.body).fontFamily;
    ctx.font = `700 16px ${font}`; ctx.fillStyle = 'rgba(160, 40, 30, 0.75)';
    ctx.fillText(c.up === 'strong' ? '상승 기류 강함' : '상승 기류 약함', 150, CLOUD.base - 16);
    // 물방울
    for (const d of c.drops) {
      const r = rOf(d.m);
      const f = clamp((r - 2.3) / (RAIN_R - 2.3), 0, 1);
      ctx.fillStyle = `hsl(${210 - 10 * f} ${55 + 35 * f}% ${68 - 30 * f}%)`;
      ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, Math.PI * 2); ctx.fill();
    }
    // 빗방울
    ctx.strokeStyle = '#2d6fb8'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const rd of c.rain) { ctx.beginPath(); ctx.moveTo(rd.x, rd.y); ctx.lineTo(rd.x - 2, rd.y + 14); ctx.stroke(); }
    // 땅
    ctx.fillStyle = '#7dbb5f'; ctx.fillRect(0, CLOUD.ground, CW, CH - CLOUD.ground);
    ctx.strokeStyle = '#2d6fb8'; ctx.lineWidth = 2;
    for (const sp of c.splash) { ctx.beginPath(); ctx.ellipse(sp.x, CLOUD.ground + 2, 4 + sp.t * 26, 2 + sp.t * 6, 0, Math.PI, 0); ctx.stroke(); }
    ctx.font = `800 20px ${font}`; ctx.fillStyle = '#fff';
    ctx.fillText(`지표에 떨어진 빗방울 ${c.rainCount}개`, 20, CH - 12);
    ctx.font = `700 15px ${font}`; ctx.fillStyle = '#4b5a68';
    ctx.fillText('구름 밑면 (0 ℃ 이상)', CLOUD.x1 - 170, CLOUD.base + 22);
  }
  function roundRect(ctx, x, y, w, h2, r) {
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h2, r); ctx.arcTo(x + w, y + h2, x, y + h2, r);
    ctx.arcTo(x, y + h2, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const BINS = [[2.3, 3], [3, 3.8], [3.8, 4.8], [4.8, 5.8], [5.8, 99]];
  const BIN_LBL = ['아주 작음', '작음', '중간', '큼', '빗방울급'];
  function buildHist() {
    const svg = E.hist;
    E.hx0 = 70; E.hx1 = 420; E.hy0 = 320; E.hy1 = 30;
    s('line', { x1: E.hx0, y1: E.hy0, x2: E.hx1, y2: E.hy0, stroke: '#7d90a3', 'stroke-width': 1.5 }, svg);
    s('line', { x1: E.hx0, y1: E.hy0, x2: E.hx0, y2: E.hy1, stroke: '#7d90a3', 'stroke-width': 1.5 }, svg);
    E.bars = []; E.barT = [];
    const bw = (E.hx1 - E.hx0) / BINS.length;
    BINS.forEach((b, i) => {
      E.bars.push(s('rect', { x: E.hx0 + i * bw + 8, width: bw - 16, rx: 6, fill: i === 4 ? '#1d5ea8' : `hsl(210 ${55 + i * 8}% ${74 - i * 8}%)` }, svg));
      E.barT.push(txt({ x: E.hx0 + i * bw + bw / 2, 'text-anchor': 'middle', class: 't-lbl', 'font-size': 14, fill: '#44596e' }, '', svg));
      txt({ x: E.hx0 + i * bw + bw / 2, y: E.hy0 + 22, 'text-anchor': 'middle', class: 't-tick', 'font-size': 14 }, BIN_LBL[i], svg);
    });
    txt({ x: (E.hx0 + E.hx1) / 2, y: E.hy0 + 50, 'text-anchor': 'middle', class: 't-axis' }, '물방울 크기 →', svg);
    txt({ x: 26, y: (E.hy0 + E.hy1) / 2, 'text-anchor': 'middle', class: 't-axis', transform: `rotate(-90 26 ${(E.hy0 + E.hy1) / 2})` }, '물방울 수', svg);
  }
  function renderHist() {
    const c = st.coal;
    const counts = BINS.map(b => c.drops.filter(d => { const r = rOf(d.m); return r >= b[0] && r < b[1]; }).length);
    const mx = Math.max(40, ...counts);
    counts.forEach((n, i) => {
      const hgt = (E.hy0 - E.hy1) * n / mx;
      sa(E.bars[i], { y: E.hy0 - hgt, height: Math.max(0, hgt) });
      sa(E.barT[i], { y: E.hy0 - hgt - 6 }); E.barT[i].textContent = n;
    });
  }

  /* ═════════════ 빙정설 ═════════════ */
  function buildIce() {
    const svg = E.iceScene;
    const d = skyDefs(svg, '#8aa4bb', '#dbe6ef');
    s('rect', { x: 0, y: 0, width: CW, height: CH, fill: d.sky }, svg);
    // 구름 단면 (왼쪽)
    const cx = 200;
    E.levels = { top: 50, m40: 120, zero: 290, base: 330, ground: 410 };
    const L = E.levels;
    cumulusCloud(svg, cx, L.base, L.top, 300, 'white', 5);
    s('line', { x1: 40, x2: 380, y1: L.m40, y2: L.m40, stroke: '#2d6fb8', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, svg);
    E.warm = s('g', null, svg);
    s('line', { x1: 40, x2: 380, y1: L.zero, y2: L.zero, stroke: '#c0264a', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, E.warm);
    txt({ x: 388, y: L.m40 + 5, class: 't-lbl halo-sky', 'font-size': 15, fill: '#1d5ea8' }, '−40 ℃', svg);
    txt({ x: 388, y: L.zero + 5, class: 't-lbl halo-sky', 'font-size': 15, fill: '#a32a1d' }, '0 ℃', E.warm);
    const R = rng(9);
    // 상층 빙정
    for (let i = 0; i < 16; i++) snow(svg, 110 + R() * 180, 66 + R() * 46, 5 + R() * 3, '#7fb0e0');
    // 중간층: 빙정 + 과냉각 물방울
    for (let i = 0; i < 12; i++) snow(svg, 90 + R() * 220, 135 + R() * 140, 4 + R() * 3, '#7fb0e0');
    for (let i = 0; i < 26; i++) s('circle', { cx: 80 + R() * 240, cy: 132 + R() * 150, r: 2.5 + R() * 2, fill: '#7fb6ea' }, svg);
    // 하층 물방울
    for (let i = 0; i < 12; i++) s('circle', { cx: 90 + R() * 220, cy: 298 + R() * 26, r: 2.5 + R() * 2, fill: '#5d9ee0' }, E.warm);
    txt({ x: cx, y: 98, 'text-anchor': 'middle', class: 't-lbl halo', 'font-size': 15, fill: '#1d5ea8' }, '빙정', svg);
    txt({ x: cx, y: 210, 'text-anchor': 'middle', class: 't-lbl halo', 'font-size': 15, fill: '#1d5ea8' }, '빙정 + 과냉각 물방울', svg);
    txt({ x: cx, y: 318, 'text-anchor': 'middle', class: 't-lbl halo', 'font-size': 15, fill: '#1d5ea8' }, '물방울', E.warm);
    E.surfBand = s('rect', { x: 0, y: L.base, width: 400, height: L.ground - L.base, opacity: 0.2 }, svg);
    E.meltLine = s('line', { x1: 40, x2: 380, stroke: '#c0264a', 'stroke-width': 2, 'stroke-dasharray': '3 5' }, svg);
    E.ground = s('rect', { x: 0, y: L.ground, width: 400, height: CH - L.ground }, svg);
    E.fallG = s('g', null, svg);
    E.groundT = txt({ x: 200, y: CH - 16, 'text-anchor': 'middle', class: 't-lbl', 'font-size': 17 }, '', svg);

    // 돋보기 (오른쪽): 과냉각 물방울과 빙정
    const mx = 610, my = 210;
    E.mag = { x: mx, y: my };
    s('circle', { cx: mx, cy: my, r: 168, fill: '#f3f8fd', stroke: '#7d90a3', 'stroke-width': 4 }, svg);
    s('line', { x1: 418, y1: 200, x2: 442, y2: 205, stroke: '#7d90a3', 'stroke-width': 3, 'stroke-dasharray': '4 4' }, svg);
    txt({ x: mx, y: my - 140, 'text-anchor': 'middle', class: 't-lbl', 'font-size': 16, fill: '#44596e' }, '구름 속 확대 (−40 ~ 0 ℃ 층)', svg);
    E.dropC = s('circle', { cx: mx - 80, cy: my + 10, fill: '#8cc3f2', stroke: '#2d7dd2', 'stroke-width': 3 }, svg);
    E.cryst = s('g', { transform: `translate(${mx + 78} ${my + 10})` }, svg);
    E.flow = s('g', null, svg);
    E.dropT = txt({ x: mx - 80, y: my + 112, 'text-anchor': 'middle', class: 't-lbl', 'font-size': 15, fill: '#17599f' }, '과냉각 물방울', svg);
    E.crystT = txt({ x: mx + 78, y: my + 112, 'text-anchor': 'middle', class: 't-lbl', 'font-size': 15, fill: '#a8500a' }, '빙정', svg);
    E.stateT = txt({ x: mx, y: my + 140, 'text-anchor': 'middle', class: 't-lbl', 'font-size': 15 }, '', svg);
  }
  function snow(parent, x, y, r, color) {
    const g = s('g', { transform: `translate(${x} ${y})`, stroke: color, 'stroke-width': 1.8, 'stroke-linecap': 'round' }, parent);
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI / 3;
      s('line', { x1: -Math.cos(a) * r, y1: -Math.sin(a) * r, x2: Math.cos(a) * r, y2: Math.sin(a) * r }, g);
    }
    return g;
  }
  function drawCrystal(g, size) {
    g.innerHTML = '';
    const r = 14 + 70 * size;
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      const arm = s('g', { transform: `rotate(${a * 180 / Math.PI})` }, g);
      s('line', { x1: 0, y1: 0, x2: r, y2: 0, stroke: '#ec7a1c', 'stroke-width': 4, 'stroke-linecap': 'round' }, arm);
      if (size > 0.15) {
        [0.45, 0.72].forEach(f => {
          const l = r * 0.28 * (f === 0.45 ? 1 : 0.7);
          s('line', { x1: r * f, y1: 0, x2: r * f + l * 0.6, y2: -l, stroke: '#ec7a1c', 'stroke-width': 3, 'stroke-linecap': 'round' }, arm);
          s('line', { x1: r * f, y1: 0, x2: r * f + l * 0.6, y2: l, stroke: '#ec7a1c', 'stroke-width': 3, 'stroke-linecap': 'round' }, arm);
        });
      }
    }
    s('circle', { r: 5, fill: '#ec7a1c' }, g);
  }
  function buildVP() {
    const ax = makeAxes(E.vp, { X0: 66, X1: 360, Y0: 340, Y1: 24, xmin: -40, xmax: 0, xstep: 10, ymin: 0, ymax: 6.5, ystep: 1,
      xlabel: '기온 (℃)', ylabel: '포화 수증기압 (hPa)', ylabelGap: 44 });
    E.axV = ax;
    // 오른쪽 축 (차이)
    const dmax = 0.325;
    E.gyD = v => ax.Y0 - v / dmax * (ax.Y0 - ax.Y1);
    [0, 0.1, 0.2, 0.3].forEach(v => {
      s('line', { x1: ax.X1, x2: ax.X1 + 6, y1: E.gyD(v), y2: E.gyD(v), stroke: '#c0264a', 'stroke-width': 1.5 }, ax.over);
      txt({ x: ax.X1 + 9, y: E.gyD(v) + 5, class: 't-tick', 'font-size': 13, fill: '#c0264a' }, fmt(v, 1), ax.over);
    });
    txt({ x: ax.X1 + 50, y: (ax.Y0 + ax.Y1) / 2, 'text-anchor': 'middle', class: 't-axis', 'font-size': 14, fill: '#c0264a', transform: `rotate(90 ${ax.X1 + 50} ${(ax.Y0 + ax.Y1) / 2})` }, '포화 수증기압 차 (hPa)', ax.over);
    const water = [], ice = [], diff = [];
    for (let T = -40; T <= 0.001; T += 0.5) {
      water.push([T, Physics.satVaporWater(T)]); ice.push([T, Physics.satVaporIce(T)]);
      diff.push(`${ax.gx(T).toFixed(1)},${E.gyD(Physics.satVaporWater(T) - Physics.satVaporIce(T)).toFixed(1)}`);
    }
    // 두 곡선 사이(빙정 성장 영역)
    s('polygon', { points: pts(water.concat(ice.slice().reverse()), ax), fill: '#b58be8', opacity: 0.35 }, ax.plot);
    s('polyline', { points: diff.join(' '), fill: 'none', stroke: '#c0264a', 'stroke-width': 2.5, 'stroke-dasharray': '7 5' }, ax.plot);
    s('polyline', { points: pts(water, ax), fill: 'none', stroke: '#2d7dd2', 'stroke-width': 3.5 }, ax.plot);
    s('polyline', { points: pts(ice, ax), fill: 'none', stroke: '#ec7a1c', 'stroke-width': 3.5 }, ax.plot);
    txt({ x: ax.gx(-30), y: ax.gy(3.2), 'text-anchor': 'middle', class: 't-lbl halo', 'font-size': 13.5, fill: '#5b2fa0' }, '두 곡선 사이: 빙정에 과포화', ax.over);
    txt({ x: ax.gx(-30), y: ax.gy(3.2) + 17, 'text-anchor': 'middle', class: 't-lbl halo', 'font-size': 13.5, fill: '#5b2fa0' }, '물방울에 불포화', ax.over);
    s('line', { x1: ax.gx(-30), y1: ax.gy(3.2) + 24, x2: ax.gx(-22), y2: ax.gy(1.0), stroke: '#5b2fa0', 'stroke-width': 1.5 }, ax.over);
    E.vGuideV = s('line', { stroke: '#13283d', 'stroke-width': 1, 'stroke-dasharray': '3 3' }, ax.plot);
    E.vGuideH = s('line', { stroke: '#13283d', 'stroke-width': 1, 'stroke-dasharray': '3 3' }, ax.plot);
    E.vDot = s('circle', { r: 11, stroke: '#fff', 'stroke-width': 3, class: 'grab' }, ax.over);
    E.vHit = s('circle', { r: 26, fill: 'transparent', class: 'grab' }, ax.over);
    let drag = false;
    const move = ev => {
      const p = svgPoint(E.vp, ev);
      st.ice.T = Math.round(clamp(lerp(-40, 0, (p.x - ax.X0) / (ax.X1 - ax.X0)), -40, 0) * 2) / 2;
      st.ice.e = Math.round(clamp((ax.Y0 - p.y) / (ax.Y0 - ax.Y1) * 6.5, 0.1, 6.2) * 100) / 100;
      ui.iceT.set(st.ice.T); ui.iceE.set(st.ice.e);
      render();
    };
    E.vHit.addEventListener('pointerdown', ev => { drag = true; E.vHit.setPointerCapture(ev.pointerId); ev.preventDefault(); });
    E.vHit.addEventListener('pointermove', ev => { if (drag) move(ev); });
    ['pointerup', 'pointercancel'].forEach(t => E.vHit.addEventListener(t, () => { drag = false; }));
    E.vp.addEventListener('click', ev => { if (ev.target !== E.vHit) move(ev); });
  }

  function stepIce(dt) {
    const I = st.ice;
    const state = Physics.iceProcessState(I.T, I.e);
    const k = 0.18 * dt;
    if (state === 'ice-grows') { I.drop = Math.max(0.12, I.drop - k * 1.1); I.crystal = Math.min(1, I.crystal + k); }
    else if (state === 'super-both') { I.drop = Math.min(1, I.drop + k * 0.5); I.crystal = Math.min(1, I.crystal + k * 0.6); }
    else { I.drop = Math.max(0.12, I.drop - k * 0.6); I.crystal = Math.max(0.05, I.crystal - k * 0.4); }
    if (I.crystal >= 1 && I.fall == null) { I.fall = 0; I.grownOnce = true; }
    if (I.fall != null) { I.fall += dt * 0.35; if (I.fall > 1.4) I.fall = 0; }
  }

  /* ═════════════ 그리기 ═════════════ */
  function tick(dt) {
    if (st.kind === 'coal' && st.coal.running) {
      for (let i = 0; i < 2; i++) stepCoal(dt);
      drawCoal();
      E.histAcc = (E.histAcc || 0) + dt;
      if (E.histAcc > 0.25) { E.histAcc = 0; renderHist(); renderObs(); checkCoal(); }
    }
    if (st.kind === 'ice') { stepIce(dt); renderIceLive(); }
  }
  function render() {
    if (!E.ctx) return;
    if (st.kind === 'coal') { drawCoal(); renderHist(); renderObs(); }
    else renderIce();
    missionLive();
  }
  function renderObs() {
    if (st.kind === 'coal') {
      const c = st.coal;
      ui.obs.innerHTML = `<div class="readout">
        <div class="ro"><div class="k">지표에 떨어진 빗방울</div><div class="v num">${c.rainCount}<small>개</small></div></div>
        <div class="ro"><div class="k">충돌 · 병합 횟수</div><div class="v num">${c.merges}<small>회</small></div></div></div>
        <p class="note-sm" style="margin:10px 0 0">${c.dist === 'uniform'
          ? '크기가 비슷한 물방울은 떨어지는 속도가 거의 같아 <b>잘 부딪치지 않아요</b>.'
          : '큰 물방울은 빨리 떨어지면서 작은 물방울과 <b>충돌·병합</b>해 점점 커져요.'}</p>`;
      ui.chartNote.innerHTML = `빗방울이 되려면 구름 방울이 지름으로 약 <b>100배</b>(부피로 약 100만 배) 커져야 해요. 모형에서는 크기를 과장해 나타냈어요.`;
    }
  }
  function renderIce() {
    const I = st.ice, ax = E.axV;
    const ew = Physics.satVaporWater(I.T), ei = Physics.satVaporIce(I.T);
    const state = Physics.iceProcessState(I.T, I.e);
    const col = state === 'ice-grows' ? '#7a3fd0' : state === 'super-both' ? '#15864a' : '#c0530f';
    sa(E.vDot, { cx: ax.gx(I.T), cy: ax.gy(I.e), fill: col });
    sa(E.vHit, { cx: ax.gx(I.T), cy: ax.gy(I.e) });
    sa(E.vGuideV, { x1: ax.gx(I.T), x2: ax.gx(I.T), y1: ax.Y0, y2: ax.gy(I.e) });
    sa(E.vGuideH, { x1: ax.X0, x2: ax.gx(I.T), y1: ax.gy(I.e), y2: ax.gy(I.e) });
    const desc = {
      'ice-grows': '빙정에 대해 <b>과포화</b>, 과냉각 물방울에 대해 <b>불포화</b> → 물방울은 증발하고 수증기가 빙정에 달라붙어 <b>빙정 성장!</b>',
      'super-both': '물방울과 빙정 모두에 대해 과포화 → 둘 다 자라요.',
      'sub-both': '물방울과 빙정 모두에 대해 불포화 → 둘 다 줄어들어요.'
    }[state];
    ui.obs.innerHTML = `<div class="readout">
      <div class="ro"><div class="k">물에 대한 포화 수증기압</div><div class="v num" style="color:#17599f">${fmt(ew, 2)}<small>hPa</small></div></div>
      <div class="ro"><div class="k">얼음에 대한 포화 수증기압</div><div class="v num" style="color:#a8500a">${fmt(ei, 2)}<small>hPa</small></div></div>
      <div class="ro wide"><div class="k">실제 수증기압</div><div class="v num" style="color:${col}">${fmt(I.e, 2)}<small>hPa</small></div></div></div>
      <p class="note-sm" style="margin:10px 0 0">${desc}</p>`;
    ui.chartNote.innerHTML = `같은 온도에서 <b>과냉각 물방울의 포화 수증기압이 빙정보다 높아요</b>. 차이는 약 −12 ℃에서 가장 커요(약 ${fmt(Physics.satVaporWater(-12) - Physics.satVaporIce(-12), 2)} hPa).`;
    sa(E.stateT, { fill: col });
    E.stateT.textContent = state === 'ice-grows' ? '물방울 증발 → 빙정 성장' : state === 'super-both' ? '둘 다 성장' : '둘 다 증발';
    renderIceLive();
  }
  let lastFlowState = '';
  function renderIceLive() {
    const I = st.ice, L = E.levels, mg = E.mag;
    sa(E.dropC, { r: 10 + 42 * I.drop });
    if (Math.abs((E.lastCrystal || -1) - I.crystal) > 0.004) { E.lastCrystal = I.crystal; drawCrystal(E.cryst, I.crystal); }
    const state = Physics.iceProcessState(I.T, I.e);
    if (state !== lastFlowState) {
      lastFlowState = state;
      E.flow.innerHTML = '';
      if (state === 'ice-grows') {
        for (let k = 0; k < 3; k++) {
          const y = mg.y - 20 + k * 24;
          s('path', { d: `M${mg.x - 34} ${y} C${mg.x - 10} ${y - 16} ${mg.x + 10} ${y + 16} ${mg.x + 30} ${y}`, fill: 'none', stroke: '#7a3fd0', 'stroke-width': 2.5, 'stroke-dasharray': '4 5', class: 'wind-line' }, E.flow);
          s('path', { d: `M${mg.x + 22} ${y - 6} L${mg.x + 31} ${y} L${mg.x + 22} ${y + 6}`, fill: 'none', stroke: '#7a3fd0', 'stroke-width': 2.5 }, E.flow);
        }
        txt({ x: mg.x, y: mg.y - 46, 'text-anchor': 'middle', class: 't-lbl', 'font-size': 14, fill: '#7a3fd0' }, '수증기 이동', E.flow);
      }
    }
    // 낙하하는 눈송이 → 녹는 고도 아래에서 비
    const surf = I.surf;
    const meltY = surf > 0 ? L.ground - surf / 12 * (L.ground - L.base) : null; // 구름 아래 0 ℃ 고도
    sa(E.meltLine, { y1: meltY || -10, y2: meltY || -10, opacity: meltY ? 1 : 0 });
    sa(E.surfBand, { fill: surf > 0 ? '#ffb38a' : '#a9cdf2' });
    sa(E.warm, { opacity: surf > 0 ? 1 : 0 });
    sa(E.ground, { fill: surf > 0 ? '#7dbb5f' : '#eef3f7' });
    E.fallG.innerHTML = '';
    if (I.fall != null) {
      const y = lerp(L.zero - 10, L.ground, clamp(I.fall, 0, 1));
      const melted = meltY != null && y > meltY;
      if (I.fall <= 1) {
        if (melted) s('ellipse', { cx: 200, cy: y, rx: 5, ry: 8, fill: '#2d7dd2' }, E.fallG);
        else snow(E.fallG, 200, y, 10, '#ffffff').setAttribute('stroke-width', 3);
      }
    }
    E.groundT.textContent = !I.grownOnce ? '빙정이 다 자라면 무거워져 떨어져요' : (surf > 0 ? '떨어지다 녹아 → 비 (찬 비)' : '녹지 않고 → 눈');
    E.groundT.setAttribute('fill', surf > 0 ? '#17599f' : '#44596e');
    if (missionOn(TAB) && currentMission(TAB) === 1) {
      setMissionLive(TAB, state === 'ice-grows'
        ? `<span class="good">빙정 성장 영역 ✓</span> 빙정 크기 ${Math.round(I.crystal * 100)} %`
        : '<span class="bad">아직 빙정 성장 영역이 아니에요</span>');
      if (state === 'ice-grows' && I.crystal >= 1) award(TAB, 1);
    }
  }

  /* ═════════════ 퀴즈 · 미션 ═════════════ */
  const QUIZ = [
    { q: '저위도 지방의 구름. 구름 꼭대기까지 기온이 0 ℃ 이상이에요. 빗방울은 주로 어떻게 만들어질까?', opts: ['병합설', '빙정설'], a: 0, why: '0 ℃ 이상인 구름은 대부분 물방울 → 충돌·병합(병합설) → 따뜻한 비' },
    { q: '중위도 지방 겨울철 구름. 구름 윗부분이 −20 ℃예요. 강수 입자는 주로 어떻게 자랄까?', opts: ['병합설', '빙정설'], a: 1, why: '−40~0 ℃ 층에 과냉각 물방울과 빙정이 함께 있어 빙정이 성장(빙정설)' },
    { q: '빙정설로 만들어진 눈이 떨어지다가 녹아서 내리는 비는?', opts: ['따뜻한 비', '찬 비'], a: 1, why: '0 ℃ 이하 구름에서 만들어진 강수가 녹은 것 → 찬 비' }
  ];
  function renderQuiz() {
    const box = ui.quiz;
    box.innerHTML = '';
    box.appendChild(h('h3', { html: '<span class="badge">퀴즈</span>따뜻한 비와 찬 비' }));
    QUIZ.forEach((Q, i) => {
      const ans = st.quiz[i];
      const row = h('div', { class: 'quiz-q' }, h('p', { class: 'step-p', html: `<b>${i + 1}.</b> ${Q.q}` }));
      const opts = h('div', { class: 'judge-opts' });
      Q.opts.forEach((o, j) => {
        const b = h('button', { type: 'button', class: 'chip' + (ans === j ? ' on' : ''), text: o });
        b.addEventListener('click', () => { st.quiz[i] = j; renderQuiz(); checkQuiz(); });
        opts.appendChild(b);
      });
      row.appendChild(opts);
      if (ans != null) row.appendChild(h('div', { class: 'judge-fb ' + (ans === Q.a ? 'good' : 'bad'), html: ans === Q.a ? '✓ ' + Q.why : '✗ 다시 생각해 볼까요?' }));
      box.appendChild(row);
    });
  }
  function checkQuiz() { if (QUIZ.every((Q, i) => st.quiz[i] === Q.a)) award(TAB, 2); }
  function checkCoal() {
    if (missionOn(TAB) && currentMission(TAB) === 0) {
      setMissionLive(TAB, `지표에 떨어진 빗방울 ${st.coal.rainCount} / ${TUNING.tab6.rainGoal}개`);
      if (st.coal.rainCount >= TUNING.tab6.rainGoal) award(TAB, 0);
    }
  }
  function missionLive() {
    if (!missionOn(TAB)) return;
    const idx = currentMission(TAB);
    if (idx === 0) setMissionLive(TAB, st.kind === 'coal' ? `지표에 떨어진 빗방울 ${st.coal.rainCount} / ${TUNING.tab6.rainGoal}개` : '💧 병합설 실험으로 바꿔 주세요.');
    if (idx === 1 && st.kind !== 'ice') setMissionLive(TAB, '❄️ 빙정설 실험으로 바꿔 주세요.');
    if (idx === 2) setMissionLive(TAB, `퀴즈 정답 ${QUIZ.filter((Q, i) => st.quiz[i] === Q.a).length} / ${QUIZ.length}`);
  }

  registerTab(TAB, { init, tick, onShow: render, onHide: () => { st.coal.running = false; if (ui.run) syncRun(); } });
})();
