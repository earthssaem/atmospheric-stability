/**
 * tab-fog.js — 5. 안개의 종류
 * 지표 부근의 공기가 포화되어 안개가 생기는 다섯 가지 과정을 장면(왼쪽)과 포화 수증기압 곡선(오른쪽)으로 함께 본다.
 *  - 공기의 냉각: 복사 안개 · 이류 안개 · 활승 안개 → 기온이 이슬점까지 내려감 (그래프에서 왼쪽으로)
 *  - 수증기량의 증가: 증발 안개 · 전선 안개 → 수증기가 늘어 포화 수증기압에 이름 (그래프에서 위로)
 * 계산은 physics.fogAt · fogOnset에서 가져온다. 이 탭의 그래프는 높이 그래프가 아니라서 장면과 세로 위치를 맞추지 않는다.
 */
'use strict';

const FogLab = (function () {
  const KINDS = [
    { k: 'radiation', name: '복사 안개', group: 'cool' },
    { k: 'advection', name: '이류 안개', group: 'cool' },
    { k: 'upslope', name: '활승 안개', group: 'cool' },
    { k: 'steam', name: '증발 안개', group: 'vapor' },
    { k: 'frontal', name: '전선 안개', group: 'vapor' }
  ];
  const NAME = Object.fromEntries(KINDS.map(x => [x.k, x.name]));
  const DESC = {
    radiation: '바람이 거의 없고 맑은 날, 지표면의 <b>복사 냉각</b>으로 기온이 이슬점까지 내려가 생성',
    advection: '온난 습윤한 공기가 <b>차가운 지표면이나 해수면 위로 이동</b>해 기온이 이슬점까지 내려가 생성',
    upslope: '지표면 부근의 온난 습윤한 공기가 <b>산 사면을 따라 상승</b>하면서 단열 팽창으로 냉각되어 생성',
    steam: '찬 공기가 <b>따뜻한 수면 위로 이동</b>할 때, 수면에서 증발한 수증기가 찬 공기 속에서 응결해 생성',
    frontal: '전선 부근에서 내린 <b>빗방울이 아래쪽 찬 공기층에서 증발</b>해 수증기량이 늘고, 공기가 포화되어 생성'
  };
  const STAGE = {   // 단계 이름: 처음 · (안개 시작) · 끝
    radiation: ['저녁 6시', '새벽 5시'], advection: ['따뜻한 바다 위', '해안 도착'], upslope: ['산기슭', '산 정상'],
    steam: ['육지 위', '수면 위'], frontal: ['비 내리기 시작', '비가 계속 내린 뒤']
  };
  const DEF = { kind: 'radiation', sky: 'clear', wind: 'calm', sea: 12, M: 0.8, water: 15, rain: 'strong' };
  const DUR = 9;                                        // 처음부터 끝까지 재생 시간(초)
  const XR = { min: -5, max: 25, step: 5 }, YR = { min: 0, max: 32, step: 5 };
  const C_SAT = '#2F78B5';
  const L = Object.assign(baseLab(), { id: 'fog' });
  const st = Object.assign({}, DEF, { s: 0, playing: false, cmp: null, notice: '', seen: {} });
  L.st = st;
  let sh, ui = {}, E = {}, G = null, ch = null;

  const opt = (o) => { o = o || st; return { sky: o.sky, wind: o.wind, sea: o.sea, M: o.M, water: o.water, rain: o.rain }; };
  const A = (s, o) => Physics.fogAt((o || st).kind, opt(o), s == null ? st.s : s);
  const condKey = (o) => { o = o || st; return [o.kind, o.sky, o.wind, o.sea, o.M, o.water, o.rain].join('|'); };
  let onsetMemo = { key: null, v: null };
  function onset() {
    const k = condKey();
    if (onsetMemo.key !== k) onsetMemo = { key: k, v: Physics.fogOnset(st.kind, opt()) };
    return onsetMemo.v;
  }
  const group = () => Physics.FOG[st.kind].group;
  const condLabel = (o) => {
    o = o || st;
    return { radiation: `${o.sky === 'clear' ? '맑음' : '흐림'} · 바람 ${o.wind === 'calm' ? '약함' : '강함'}`, advection: `찬 해수면 ${fT(o.sea)} ℃`,
      upslope: `산 높이 ${fZ(o.M)} km`, steam: `수면 ${fT(o.water)} ℃`, frontal: o.rain === 'strong' ? '강한 비' : '약한 비' }[o.kind];
  };

  /* ───────── 진행 · 단계 ───────── */
  function stageList() { const on = onset(); const S = [0]; if (on != null && on > 1e-6 && on < 1 - 1e-6) S.push(on); S.push(1); return S; }
  function setS(v) {
    v = clamp(v, 0, 1);
    const was = st.s, on = onset();
    st.s = v; st.notice = '';
    if (on != null && was < on - 1e-9 && v >= on - 1e-9) { st.seen[st.kind] = true; L.emit('fogStart', { kind: st.kind, key: condKey() }); renderTable(true); }
    if (v >= 1 - 1e-9 && was < 1 - 1e-9) L.emit('fogEnd', { kind: st.kind, formed: on != null, key: condKey(), M: st.M, H: A(1).H, sky: st.sky, wind: st.wind });
    render();
  }
  function play() {
    if (st.playing) { pause(); return; }
    if (st.s >= 1 - 1e-9) setS(0);
    st.playing = true; render();
  }
  function pause() { if (st.playing) { st.playing = false; render(); } }
  function step(d) {
    pause();
    const S = stageList();
    if (d > 0) { const n = S.find(v => v > st.s + 1e-9); if (n != null) setS(n); }
    else { const p = [...S].reverse().find(v => v < st.s - 1e-9); if (p != null) setS(p); }
  }
  function goStage(i) {
    pause();
    const on = onset();
    if (i === 1 && on == null) { st.notice = noFogText(); render(); return; }
    setS([0, on, 1][i]);
  }
  function tick(dt) {
    if (!st.playing) return;
    const nextStop = stageList().find(v => v > st.s + 1e-9) ?? 1;     // 안개가 생기는 순간에 한 번 멈춤
    const ns = Math.min(nextStop, st.s + dt / DUR);
    if (ns >= nextStop - 1e-12) { st.playing = false; setS(nextStop); }
    else setS(ns);
  }
  function resetMotion() { pause(); st.s = 0; st.notice = ''; L.emit('reset'); render(); }

  /* ───────── 조건 ───────── */
  function setKind(k) {
    pause();
    st.kind = k; st.s = 0; st.notice = '';
    ui.kind.set(k);
    buildCond();
    L.emit('kind', { kind: k });
    rebuildAll();
    renderTable(true);
  }
  function setCond(o) {
    pause();
    Object.assign(st, o);
    st.s = 0; st.notice = '';
    syncCond();
    L.emit('cond', { key: condKey() });
    rebuildAll();
  }
  function resetDefaults() {
    pause();
    Object.assign(st, { sky: DEF.sky, wind: DEF.wind, sea: DEF.sea, M: DEF.M, water: DEF.water, rain: DEF.rain, s: 0, notice: '' });
    syncCond();
    rebuildAll();
  }
  function saveCompare() {
    st.cmp = { kind: st.kind, sky: st.sky, wind: st.wind, sea: st.sea, M: st.M, water: st.water, rain: st.rain, sRec: st.s };
    st.cmp.label = `${NAME[st.cmp.kind]} · ${condLabel(st.cmp)}`;
    L.emit('compare', {});
    ui.cmp.show(st.cmp.label); renderLegend(); rebuildAll();
  }

  /* ───────── 화면 만들기 ───────── */
  function init(root) {
    sh = makeShell(root, {
      ratio: '52%', zMax: 1,
      sceneTitle: '지표 부근 단면', graphTitle: '포화 수증기압 곡선',
      sceneLabel: '안개가 생기는 과정을 보여 주는 지표 부근 단면', graphLabel: '기온에 따른 포화 수증기압 곡선과 공기의 상태 변화'
    });
    ui.kind = Seg(KINDS.map(x => ({ value: x.k, label: x.name, title: stripTags(DESC[x.k]) })), st.kind, v => setKind(v), { label: '안개 종류', cls: 'fog-kinds' });
    ui.condBox = h('div', { class: 'cond-group fog-cond' });
    const tail = h('div', { class: 'cond-tail' });
    ui.cmp = CompareUI(tail, saveCompare, () => { st.cmp = null; ui.cmp.show(''); renderLegend(); rebuildAll(); });
    sh.cond.append(ui.kind.el, ui.condBox, tail);
    buildCond();

    ui.badge = h('span', { class: 'stab-badge' });
    sh.sceneHead.append(ui.badge);
    ui.legend = h('span', { class: 'legend' });
    sh.graphLegend.append(ui.legend);

    ui.ro = Readouts(sh.ro, [
      { key: 'T', label: '<i style="border-color:var(--temp)"></i>기온', cls: 'temp' },
      { key: 'Td', label: '<i class="dash" style="border-color:var(--dew)"></i>이슬점', cls: 'dew' },
      { key: 'e', label: '수증기압' },
      { key: 'rh', label: '상대 습도' },
      { key: 'fog', label: '안개' }
    ]);
    ui.ctrl = ControlBar(sh.ctrl, { play, prev: () => step(-1), next: () => step(1), reset: resetMotion, defaults: resetDefaults });
    ui.ctrl.prev.title = ui.ctrl.next.title = '처음 · 안개가 생기기 시작한 순간 · 끝으로 이동';
    ui.stages = h('div', { class: 'stages', role: 'group', 'aria-label': '단계 이동' });
    ui.stageBtns = [0, 1, 2].map(i => { const b = Btn('', 'sm', () => goStage(i)); ui.stages.appendChild(b); return b; });
    ui.prog = h('input', { type: 'range', min: 0, max: 1000, step: 1, value: 0, 'aria-label': '안개 과정 진행' });
    ui.prog.style.setProperty('--c', 'var(--ink)');
    ui.prog.addEventListener('input', () => { pause(); setS(+ui.prog.value / 1000); });
    ui.ctrl.slot.append(ui.stages, h('div', { class: 'progress' }, h('span', { class: 'lbl', text: '진행' }), ui.prog));

    buildMore();
    buildChallenges();
    renderLegend();
    render();
  }
  /** 안개마다 바꿔 볼 조건 하나(복사 안개는 둘) */
  function buildCond() {
    clear(ui.condBox);
    ui.cf = {};
    const seg = (key, label, opts) => {
      const sg = Seg(opts, st[key], v => setCond({ [key]: v }), { label, cls: 'small' });
      ui.cf[key] = sg;
      ui.condBox.appendChild(h('div', { class: 'nf' }, h('span', { class: 'nf-label', text: label }), sg.el));
    };
    const num = (key, o) => {
      const nf = NumField(Object.assign({ value: st[key], cls: 'tight', onCommit: v => setCond({ [key]: v }) }, o));
      ui.cf[key] = nf;
      ui.condBox.appendChild(nf.el);
    };
    if (st.kind === 'radiation') {
      seg('sky', '하늘', [{ value: 'clear', label: '맑음' }, { value: 'cloudy', label: '흐림' }]);
      seg('wind', '바람', [{ value: 'calm', label: '약함' }, { value: 'windy', label: '강함' }]);
    } else if (st.kind === 'advection') num('sea', { label: '찬 해수면 온도', min: 8, max: 18, step: 0.5, decimals: 1, unit: '℃' });
    else if (st.kind === 'upslope') num('M', { label: '산 높이', min: 0.2, max: 1.5, step: 0.05, decimals: 2, unit: 'km' });
    else if (st.kind === 'steam') num('water', { label: '수면 온도', min: 2, max: 20, step: 0.5, decimals: 1, unit: '℃' });
    else seg('rain', '비', [{ value: 'weak', label: '약한 비' }, { value: 'strong', label: '강한 비' }]);
  }
  function syncCond() { Object.keys(ui.cf || {}).forEach(k => ui.cf[k].set(st[k])); }

  function buildMore() {
    const m = sh.more;
    m.appendChild(Fold('안개란? · 안개와 구름', h('div', { html: `
      <p><b>안개</b>: 지표면 부근에서 수증기가 응결해 생긴 작은 물방울이 공기 중에 떠 있는 것</p>
      <p>안개와 구름은 본질적으로 같아요. 안개는 수증기가 <b>지표 부근</b>에서 응결한 것이고, 구름은 공기 덩어리가 상승하면서 <b>단열 팽창</b>해 높은 고도에서 수증기가 응결한 것이에요.</p>
      <p>공기가 <b>포화</b>되면 안개가 생겨요. 포화되는 방법은 두 가지예요.</p>
      <ul><li><b>공기의 냉각</b>: 수증기량은 그대로인 채 기온이 이슬점까지 내려감 → 그래프의 점이 <b>왼쪽</b>으로 가서 곡선에 닿아요.</li>
      <li><b>수증기량의 증가</b>: 기온은 그대로인 채 수증기가 늘어남 → 그래프의 점이 <b>위쪽</b>으로 가서 곡선에 닿아요.</li></ul>
      <p class="note">곡선에 닿은 뒤 더 냉각되거나 수증기가 더 들어오면, 남는 수증기가 응결해 안개가 짙어져요. (장면의 안개·구름·빗방울은 정성적 표현)</p>` }), true));
    ui.table = h('div');
    m.appendChild(Fold('안개의 종류 정리', ui.table, true, 'wide'));
    ui.chBox = h('div');
    m.appendChild(Fold('더 해 보기 <span class="tag">도전 2</span>', ui.chBox, false));
    renderTable(true);
  }
  function renderTable(force) {
    if (!ui.table) return;
    const key = [st.kind, JSON.stringify(st.seen)].join('|');
    if (!force && ui.table.dataset.key === key) return;
    ui.table.dataset.key = key;
    const row = (x, first, n, cap) => `<tr class="${x.k === st.kind ? 'cur' : ''}">${first ? `<th rowspan="${n}" class="fog-g fog-${x.group}">${cap}</th>` : ''}
      <td class="fog-n">${x.name}${st.seen[x.k] ? ' <span class="case-ok">관찰 ✓</span>' : ''}</td><td>${DESC[x.k]}</td>
      <td class="fog-b"><button type="button" class="btn sm${x.k === st.kind ? ' accent' : ''}" data-k="${x.k}">보기</button></td></tr>`;
    const cool = KINDS.filter(x => x.group === 'cool'), vap = KINDS.filter(x => x.group === 'vapor');
    ui.table.innerHTML = `<table class="fog-table"><tbody>
      ${cool.map((x, i) => row(x, i === 0, cool.length, '공기의 냉각으로<br>생성되는 안개')).join('')}
      ${vap.map((x, i) => row(x, i === 0, vap.length, '수증기량의 증가로<br>생성되는 안개')).join('')}
      </tbody></table><p class="note">교과서 그림 Ⅲ-18 복사 안개 · Ⅲ-19 이류 안개 · Ⅲ-20 활승 안개. 안개가 생기는 순간까지 진행하면 「관찰 ✓」이 붙어요.</p>`;
    ui.table.querySelectorAll('button[data-k]').forEach(b => b.addEventListener('click', () => { setKind(b.dataset.k); sh.panel.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'center' }); }));
  }
  function buildChallenges() {
    ch = Challenges(ui.chBox, L, [
      {
        id: 'radiation', title: '복사 안개가 잘 생기는 날은?',
        goal: '<b>복사 안개</b>를 「맑음 · 바람 약함」일 때와 「흐림」이나 「바람 강함」일 때 각각 <b>끝까지</b> 재생해, 안개가 생길 때와 생기지 않을 때를 비교하세요.',
        hints: ['밤사이 기온이 이슬점(10 ℃)까지 내려가야 안개가 생겨요.', '구름은 지표에서 나가는 복사 에너지를 다시 지표로 내보내요.', '바람이 강하면 지표 부근의 찬 공기가 위쪽 공기와 섞여요.'],
        check(lab, since) {
          const e = lab.since(since, 'fogEnd').filter(x => x.kind === 'radiation');
          return e.some(x => x.formed) && e.some(x => !x.formed);
        },
        success: '맑고 바람이 약한 밤에는 지표면이 복사 냉각으로 많이 식어 기온이 이슬점까지 내려가요. 흐리거나 바람이 강하면 덜 식어 복사 안개가 생기기 어려워요.'
      },
      {
        id: 'upslope', title: '활승 안개가 생기려면 산이 얼마나 높아야 할까?',
        goal: '<b>활승 안개</b>에서 산 높이를 바꿔, <b>정상에서 막 안개가 생기기 시작하는</b> 가장 낮은 산 높이(0.1 km 이내)를 찾아 끝까지 재생하세요.',
        hints: ['산기슭 공기는 16 ℃ · 이슬점 12 ℃예요.', '상승 응결 고도 H(m) = 125 × (T₀ − Td₀)', '응결 고도는 500 m(0.5 km)예요. 산 높이를 0.50~0.60 km로 맞춰 보세요.'],
        check(lab, since) { return lab.since(since, 'fogEnd').some(x => x.kind === 'upslope' && x.formed && x.M <= x.H + 0.1 + 1e-9); },
        success: '산 높이가 상승 응결 고도보다 높아야 사면을 따라 오르던 공기가 포화되어 활승 안개가 생겨요.'
      }
    ]);
  }

  /* ───────── 그리기 ───────── */
  function layout() { const f = layoutShell(sh); if (!f) return; rebuildAll(); }
  function rebuildAll() { if (!sh.frame) { render(); return; } buildScene(sh.frame); buildGraph(sh.frame); render(); }

  /* 장면 좌표: 지면 yG, 위쪽 끝 top */
  function sceneGeo(f) {
    const W = f.sceneW, yG = f.yOf(0), top = 18;
    return { W, yG, top, H: f.H };
  }
  function buildScene(f) {
    const svg = sh.sceneSvg; clear(svg);
    const g = sceneGeo(f), W = g.W, yG = g.yG;
    const defs = s('defs', null, svg);
    E.skyG = s('linearGradient', { id: 'fogsky', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    E.sky0 = s('stop', { offset: '0%' }, E.skyG); E.sky1 = s('stop', { offset: '100%' }, E.skyG);
    E.skyR = s('rect', { x: 0, y: 0, width: W, height: g.H, fill: 'url(#fogsky)' }, svg);
    E.back = s('g', null, svg);      // 하늘의 별 · 달 · 구름 등 (그때그때)
    E.stat = s('g', null, svg);      // 지형 (조건이 바뀔 때만)
    E.dyn = s('g', null, svg);       // 화살표 · 빗방울 등 (매 순간)
    E.fog = s('g', { class: 'cloud-sh' }, svg);
    E.parcel = makeParcel(svg, { seed: 23 });
    E.tag = s('g', null, svg);
    E.tagBg = s('rect', { rx: 8, fill: '#fff', stroke: '#C9C4B8', opacity: 0.95 }, E.tag);
    E.tagT = txt({ class: 'lb-sm tnum', fill: 'var(--temp)' }, '', E.tag);
    E.tagD = txt({ class: 'lb-sm tnum', fill: 'var(--dew)' }, '', E.tag);
    E.info = txt({ x: 12, y: 36, class: 'lb halo-sky' }, '', svg);
    const S0 = E.stat;
    const groundPath = (pts, fill) => s('path', { d: 'M' + pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L') + ` L${W} ${g.H} L0 ${g.H} Z`, fill }, S0);
    if (st.kind === 'radiation') {
      groundPath([[0, yG - 26], [W * 0.18, yG - 14], [W * 0.35, yG], [W * 0.65, yG], [W * 0.82, yG - 16], [W, yG - 30]], '#4F6B4A');
      txt({ x: W * 0.5, y: yG + 26, 'text-anchor': 'middle', class: 'lb-sm', fill: '#E8EFE4' }, '분지 · 골짜기 (찬 공기가 고임)', S0);
    } else if (st.kind === 'advection') {
      const xs = X('advection', 0.35), xc = W * 0.86;
      const sea = s('linearGradient', { id: 'fogsea', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
      [['0%', '#4FA6A0'], [(xs / W * 100).toFixed(0) + '%', '#4FA6A0'], [((xs / W + 0.12) * 100).toFixed(0) + '%', '#2F6E9E'], ['100%', '#245E8C']].forEach(([o, c]) => s('stop', { offset: o, 'stop-color': c }, sea));
      s('rect', { x: 0, y: yG, width: xc, height: g.H - yG, fill: 'url(#fogsea)' }, S0);
      s('path', { d: `M${xc} ${g.H} L${xc} ${yG + 2} L${xc + 10} ${yG - 6} L${W * 0.93} ${yG - 22} L${W} ${yG - 30} L${W} ${g.H} Z`, fill: '#C9B48A' }, S0);   // 해안 (바다를 가리지 않게 따로)
      txt({ x: xs / 2, y: yG + 24, 'text-anchor': 'middle', class: 'lb-sm', fill: '#fff' }, '따뜻한 바다', S0);
      txt({ x: (xs + xc) / 2, y: yG + 24, 'text-anchor': 'middle', class: 'lb-sm tnum', fill: '#fff' }, `차가운 해수면 ${fT(st.sea)} ℃`, S0);
      txt({ x: (xc + W) / 2, y: yG + 24, 'text-anchor': 'middle', class: 'lb-sm', fill: '#5A4A2A' }, '해안', S0);
    } else if (st.kind === 'upslope') {
      const geo = slopeGeo(g);
      groundPath([[0, yG], [geo.x0, yG], [geo.x1, geo.yZ(st.M)], [W, yG - 6]], '#7E9A6E');
      for (let z = 0.5; z <= geo.zTop + 1e-9; z += 0.5) {
        s('line', { x1: 0, x2: W, y1: geo.yZ(z), y2: geo.yZ(z), stroke: '#fff', 'stroke-width': 1, opacity: 0.6 }, S0);
        txt({ x: 8, y: geo.yZ(z) - 5, class: 'lb-sm tnum halo-sky', fill: '#485563' }, `${fmt(z, 1)} km`, S0);
      }
      const H = A(0).H != null ? A(1).H : 0.5;
      if (H <= geo.zTop) {
        s('line', { x1: 0, x2: W, y1: geo.yZ(H), y2: geo.yZ(H), stroke: 'var(--lcl)', 'stroke-width': 2, 'stroke-dasharray': '12 5 3 5' }, S0);
        txt({ x: W - 8, y: geo.yZ(H) - 6, 'text-anchor': 'end', class: 'lb-sm halo-sky', fill: '#7A4E10' }, `상승 응결 고도 ${fZ(H)} km`, S0);
      }
      txt({ x: geo.x1 + 10, y: geo.yZ(st.M) + 4, class: 'lb-sm halo-sky tnum', fill: '#3D4A3A' }, `정상 ${fZ(st.M)} km`, S0);
    } else if (st.kind === 'steam') {
      const xw = X('steam', 0.3);
      groundPath([[0, yG], [xw, yG]], '#DCE3E6');
      s('rect', { x: xw, y: yG, width: W - xw, height: g.H - yG, fill: '#3E86A8' }, S0);
      txt({ x: xw / 2, y: yG + 24, 'text-anchor': 'middle', class: 'lb-sm', fill: '#4E5D6A' }, '차가운 육지', S0);
      txt({ x: (xw + W) / 2, y: yG + 24, 'text-anchor': 'middle', class: 'lb-sm tnum', fill: '#fff' }, `따뜻한 수면 ${fT(st.water)} ℃ (호수 · 강)`, S0);
    } else {   // frontal
      const fr = frontGeo(g);
      s('path', { d: `M${fr.x0} ${yG} L${W} ${fr.yR} L${W} ${yG} Z`, fill: '#C9DCEB', opacity: 0.85 }, S0);
      s('path', { d: `M0 ${g.top} L${W} ${g.top} L${W} ${fr.yR} L${fr.x0} ${yG} L0 ${yG} Z`, fill: '#F3DCCB', opacity: 0.6 }, S0);
      s('line', { x1: fr.x0, y1: yG, x2: W, y2: fr.yR, stroke: '#B0513A', 'stroke-width': 3 }, S0);
      for (let i = 1; i <= 4; i++) { const t = i / 5, x = lerp(fr.x0, W, t), y = lerp(yG, fr.yR, t); s('path', { d: `M${x - 7} ${y + 2} A7 7 0 0 1 ${x + 7} ${y - 2}`, fill: '#B0513A' }, S0); }
      txt({ x: lerp(fr.x0, W, 0.45) + 8, y: lerp(yG, fr.yR, 0.45) - 10, class: 'lb-sm halo', fill: '#8A3A28', transform: `rotate(${fr.ang} ${lerp(fr.x0, W, 0.45) + 8} ${lerp(yG, fr.yR, 0.45) - 10})` }, '전선면 (온난 전선)', S0);
      txt({ x: W * 0.08, y: g.top + 24, class: 'lb-sm halo', fill: '#8A3A28' }, '따뜻한 공기 ↗ (전선면을 타고 올라감)', S0);
      txt({ x: W - 8, y: fr.yR + (yG - fr.yR) * 0.5, 'text-anchor': 'end', class: 'lb-sm halo', fill: '#1F5A88' }, '찬 공기층', S0);
      s('rect', { x: 0, y: yG, width: W, height: g.H - yG, fill: '#9DB08F' }, S0);
      cloudShape(S0, { x0: fr.x0 + 20, y0: g.top + 30, x1: W, y1: fr.yR - 4 + 30 }, c => {
        c.rect(fr.x0 + 60, g.top + 46, W - fr.x0 - 60, Math.max(8, fr.yR - g.top - 70), 14);
        for (let i = 0; i < 8; i++) c.circle(fr.x0 + 70 + (W - fr.x0 - 80) * i / 7, g.top + 48, 18 + (i % 3) * 5);
      }, 0.92);
    }
  }
  /* 장면에서 공기가 지나가는 가로 위치 (이동하는 안개) */
  function X(kind, x) {
    const W = sh.frame.sceneW;
    if (kind === 'advection') return W * 0.05 + x * W * 0.76;
    if (kind === 'steam') return W * 0.05 + x * W * 0.82;
    return W * 0.5;
  }
  function slopeGeo(g) {
    const zTop = Math.max(1.0, st.M + 0.35);
    return { x0: g.W * 0.22, x1: g.W * 0.84, zTop, yZ: z => g.yG - z / zTop * (g.yG - g.top - 34) };
  }
  function frontGeo(g) {
    const x0 = g.W * 0.12, yR = g.yG - (g.yG - g.top) * 0.55;
    return { x0, yR, ang: Math.atan2(yR - g.yG, g.W - x0) * 180 / Math.PI };
  }
  /** 안개 띠: 정해진 칸마다 같은 모양(자라도 모양이 튀지 않게) */
  function fogBand(parent, x0, x1, yb, hgt, dens, seed) {
    if (dens <= 0.01 || x1 - x0 < 3 || hgt < 2) return;
    const grp = s('g', { opacity: clamp(dens, 0, 1).toFixed(2) }, parent);
    s('rect', { x: x0, y: yb - hgt * 0.7, width: x1 - x0, height: hgt * 0.7, fill: '#F7FAFC', opacity: 0.6, rx: Math.min(hgt * 0.3, 12) }, grp);
    const STEP = 24;
    for (let i = Math.floor(x0 / STEP); i * STEP <= x1; i++) {
      const R = rng(seed * 977 + i * 131), cx = i * STEP + R() * 10;
      if (cx < x0 - 6 || cx > x1 + 6) continue;
      s('ellipse', { cx, cy: yb - hgt * (0.45 + R() * 0.3), rx: 20 + R() * 16, ry: Math.max(3, hgt * (0.32 + R() * 0.22)), fill: '#FFFFFF', opacity: 0.55 }, grp);
    }
  }
  /** 위로 올라가는 물결 화살표 (복사 · 증발) */
  function wavyUp(parent, x, y0, len, color, phase, width) {
    const n = 14, pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x + Math.sin(t * Math.PI * 3 + phase) * 4, y0 - t * len]); }
    s('path', { d: 'M' + pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L'), fill: 'none', stroke: color, 'stroke-width': width || 2.2, 'stroke-linecap': 'round' }, parent);
    const e = pts[n];
    s('path', { d: `M${e[0] - 5} ${e[1] + 6} L${e[0]} ${e[1]} L${e[0] + 5} ${e[1] + 6}`, fill: 'none', stroke: color, 'stroke-width': width || 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, parent);
  }
  function arrowH(parent, x0, x1, y, color, w) {
    s('path', { d: `M${x0} ${y} L${x1} ${y} M${x1 - 9} ${y - 6} L${x1} ${y} L${x1 - 9} ${y + 6}`, fill: 'none', stroke: color, 'stroke-width': w || 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, parent);
  }
  const mixColor = (a, b, t) => { const p = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16)); const A1 = p(a), B1 = p(b); return '#' + A1.map((v, i) => Math.round(lerp(v, B1[i], t)).toString(16).padStart(2, '0')).join(''); };
  function hourText(s0) {
    const hr = (18 + 11 * s0) % 24, hh = Math.floor(hr), mm = Math.round((hr - hh) * 60 / 10) * 10;
    const h2 = mm === 60 ? (hh + 1) % 24 : hh, m2 = mm === 60 ? 0 : mm;
    const part = h2 >= 18 ? (h2 >= 21 ? '밤' : '저녁') : (h2 === 0 ? '밤' : (h2 < 6 ? '새벽' : '아침'));
    const h12 = h2 > 12 ? h2 - 12 : (h2 === 0 ? 12 : h2);
    return `${part} ${h12}시${m2 ? ' ' + m2 + '분' : ''}`;
  }

  function buildGraph(f) {
    const svg = sh.graphSvg; clear(svg);
    const W = f.graphW, X0 = 64, X1 = W - 18, Y0 = f.yOf(0), Y1 = 24;
    const gx = T => X0 + (T - XR.min) / (XR.max - XR.min) * (X1 - X0);
    const gy = e => Y0 - (e - YR.min) / (YR.max - YR.min) * (Y0 - Y1);
    G = { X0, X1, Y0, Y1, gx, gy };
    const clipId = uid('fclip');
    s('rect', { x: X0, y: Y1 - 1, width: X1 - X0, height: Y0 - Y1 + 2 }, s('clipPath', { id: clipId }, s('defs', null, svg)));
    s('rect', { x: X0, y: Y1, width: X1 - X0, height: Y0 - Y1, fill: '#FCFCFA' }, svg);
    const clipG = s('g', { 'clip-path': `url(#${clipId})` }, svg);
    // 곡선 위쪽(과포화 → 응결) 옅게
    const cpts = [];
    for (let T = XR.min; T <= XR.max + 1e-9; T += 0.25) cpts.push([T, Physics.satVapor(T)]);
    s('path', { d: 'M' + cpts.map(p => `${gx(p[0]).toFixed(1)} ${gy(p[1]).toFixed(1)}`).join(' L') + ` L${X1} ${Y1} L${X0} ${Y1} Z`, fill: '#E3EEF8', opacity: 0.7 }, clipG);
    for (let T = XR.min; T <= XR.max + 1e-9; T += XR.step) {
      s('line', { x1: gx(T), x2: gx(T), y1: Y0, y2: Y1, stroke: '#E6E2D8' }, svg);
      s('line', { x1: gx(T), x2: gx(T), y1: Y0, y2: Y0 + 6, stroke: '#8D959C', 'stroke-width': 1.5 }, svg);
      txt({ x: gx(T), y: Y0 + 22, 'text-anchor': 'middle', class: 'tk' }, fmt(T, 0), svg);
    }
    for (let e = YR.min; e <= YR.max + 1e-9; e += YR.step) {
      s('line', { x1: X0, x2: X1, y1: gy(e), y2: gy(e), stroke: '#E6E2D8' }, svg);
      s('line', { x1: X0 - 6, x2: X0, y1: gy(e), y2: gy(e), stroke: '#8D959C', 'stroke-width': 1.5 }, svg);
      txt({ x: X0 - 10, y: gy(e) + 5, 'text-anchor': 'end', class: 'tk' }, fmt(e, 0), svg);
    }
    s('line', { x1: X0, x2: X1, y1: Y0, y2: Y0, stroke: '#8D959C', 'stroke-width': 1.5 }, svg);
    s('line', { x1: X0, x2: X0, y1: Y0, y2: Y1, stroke: '#8D959C', 'stroke-width': 1.5 }, svg);
    txt({ x: (X0 + X1) / 2, y: Y0 + 46, 'text-anchor': 'middle', class: 'ax-title' }, '기온 (℃)', svg);
    const ty = (Y0 + Y1) / 2;
    txt({ x: 18, y: ty, 'text-anchor': 'middle', class: 'ax-title', transform: `rotate(-90 18 ${ty})` }, '수증기압 (hPa)', svg);
    s('path', { d: 'M' + cpts.map(p => `${gx(p[0]).toFixed(1)} ${gy(p[1]).toFixed(1)}`).join(' L'), fill: 'none', stroke: C_SAT, 'stroke-width': 3.5 }, clipG);
    txt({ x: gx(17.5) - 8, y: gy(Physics.satVapor(17.5)) - 10, 'text-anchor': 'end', class: 'lb halo', fill: C_SAT }, '포화 수증기압 곡선', svg);
    txt({ x: X0 + 10, y: Y1 + 20, class: 'lb-sm halo', fill: '#4F7AA0' }, '곡선 위: 남는 수증기가 응결', svg);   // 곡선이 지나지 않는 왼쪽 위
    txt({ x: X1 - 10, y: Y0 - 12, 'text-anchor': 'end', class: 'lb-sm halo', fill: '#8D959C' }, '곡선 아래: 불포화', svg);
    E.cmpG = s('g', { opacity: 0.35 }, clipG);
    E.gGuide = s('g', null, svg);
    E.gProc = s('g', null, svg);
    E.gPath = s('path', { fill: 'none', stroke: 'var(--temp)', 'stroke-width': 3.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, clipG);
    E.gStart = s('circle', { r: 5.5, fill: '#fff', stroke: 'var(--temp)', 'stroke-width': 2.5 }, svg);
    E.gPt = s('circle', { r: 8, fill: 'var(--temp)', stroke: '#fff', 'stroke-width': 2.5 }, svg);
    E.gPtT = txt({ class: 'lb halo', fill: 'var(--temp)' }, '', svg);
    if (st.cmp) {
      const pts = [];
      for (let i = 0; i <= 80; i++) { const a = A(st.cmp.sRec * i / 80, st.cmp); pts.push([a.T, a.e]); }
      s('path', { d: 'M' + pts.map(p => `${gx(p[0]).toFixed(1)} ${gy(p[1]).toFixed(1)}`).join(' L'), fill: 'none', stroke: '#C65040', 'stroke-width': 3, 'stroke-dasharray': '7 5' }, E.cmpG);
    }
  }
  function renderLegend() {
    ui.legend.innerHTML = legendHTML(C_SAT, '', '포화 수증기압') + legendHTML('var(--temp)', '', '공기의 변화') + (st.cmp ? legendHTML('#E3A99F', 'dash', '비교') : '');
  }

  function render() {
    renderControls();
    if (!sh || !sh.frame || !G) return;
    const f = sh.frame, g = sceneGeo(f), W = g.W, yG = g.yG;
    const a = A(), on = onset(), cool = group() === 'cool';
    const dens = a.saturated ? clamp(0.35 + a.water / 1.4, 0.35, 1) : 0;
    const ph = st.s * 40;                                   // 화살표 · 빗방울의 움직임 위상
    clear(E.back); clear(E.dyn); clear(E.fog);
    let px = W * 0.5, py = yG - 34, info = '';

    /* 장면 */
    if (st.kind === 'radiation') {
      const dawn = clamp((st.s - 0.8) / 0.2, 0, 1);
      sa(E.sky0, { 'stop-color': mixColor('#16213A', '#5B6E96', dawn) }); sa(E.sky1, { 'stop-color': mixColor('#33476C', '#E9C9A6', dawn) });
      if (st.sky === 'clear') {
        const R = rng(5);
        for (let i = 0; i < 26; i++) s('circle', { cx: R() * W, cy: g.top + R() * (yG - g.top) * 0.55, r: 0.8 + R() * 1.3, fill: '#fff', opacity: (0.5 + R() * 0.5) * (1 - dawn) }, E.back);
        s('circle', { cx: W * 0.84, cy: g.top + 34, r: 15, fill: '#F4F1DC', opacity: 0.9 * (1 - dawn) + 0.2 }, E.back);
      } else {
        cloudShape(E.back, { x0: -10, y0: g.top - 10, x1: W + 10, y1: g.top + 64 }, c => { c.rect(-10, g.top + 18, W + 20, 40, 18); for (let i = 0; i < 9; i++) c.circle(W * i / 8, g.top + 22, 22 + (i % 3) * 6); }, 0.85);
      }
      // 지표 복사: 맑으면 우주로 빠져나감, 흐리면 구름이 다시 내보냄
      const n = 4;
      for (let i = 0; i < n; i++) {
        const x = W * (0.14 + 0.24 * i);
        const lenUp = st.sky === 'clear' ? (yG - g.top) * 0.42 : Math.max(20, yG - g.top - 110);
        wavyUp(E.dyn, x, yG - 30, lenUp, '#E58A5C', ph + i, 2.2);
        if (st.sky !== 'clear') { const y0 = g.top + 66; s('path', { d: `M${x + 18} ${y0} L${x + 18} ${y0 + 34} M${x + 13} ${y0 + 28} L${x + 18} ${y0 + 34} L${x + 23} ${y0 + 28}`, fill: 'none', stroke: '#E58A5C', 'stroke-width': 2, 'stroke-dasharray': '4 3' }, E.dyn); }
      }
      txt({ x: W * 0.14 + 12, y: yG - 30 - (st.sky === 'clear' ? (yG - g.top) * 0.42 : 60) + 14, class: 'lb-sm halo', fill: '#B65A2E' }, st.sky === 'clear' ? '지표면 복사 냉각 (열이 우주로 빠져나감)' : '구름이 복사 에너지를 다시 지표로', E.dyn);
      if (st.wind === 'windy') for (let i = 0; i < 3; i++) { const y = yG - 70 - i * 26, x0 = ((ph * 6 + i * 70) % (W + 120)) - 100; arrowH(E.dyn, x0, x0 + 70, y, '#DDE6F0', 2.5); }
      if (st.wind === 'windy') txt({ x: 12, y: yG - 128, class: 'lb-sm halo', fill: '#41536A' }, '바람이 지표 부근 공기를 섞음', E.dyn);
      fogBand(E.fog, W * 0.02, W * 0.98, yG - 8, 18 + 46 * dens, dens, 3);
      px = W * 0.5; py = yG - 34;
      info = hourText(st.s);
    } else if (st.kind === 'advection') {
      sa(E.sky0, { 'stop-color': '#BFDDF2' }); sa(E.sky1, { 'stop-color': '#EEF6FB' });
      px = X('advection', a.x); py = yG - 34;
      arrowH(E.dyn, 14, 120, g.top + 40, '#C65040', 4);
      txt({ x: 14, y: g.top + 26, class: 'lb-sm halo', fill: '#9C3B2E' }, '온난 습윤한 공기 이동', E.dyn);
      if (a.overCold) for (let i = 0; i < 3; i++) { const x = px - 16 + i * 16; s('path', { d: `M${x} ${py + 20} L${x} ${yG - 2} M${x - 4} ${yG - 7} L${x} ${yG - 2} L${x + 4} ${yG - 7}`, fill: 'none', stroke: '#2F6E9E', 'stroke-width': 2 }, E.dyn); }
      if (a.overCold) txt({ x: Math.max(px, W * 0.45), y: yG + 46, 'text-anchor': 'middle', class: 'lb-sm', fill: '#E4F0FA' }, '↓ 찬 해수면이 공기를 아래에서 냉각', E.dyn);
      if (on != null && st.s >= on) fogBand(E.fog, X('advection', on), Math.min(W * 0.97, px + 40), yG, 26 + 40 * dens, dens, 7);
      info = a.overCold ? '차가운 해수면 위' : '따뜻한 바다 위';
    } else if (st.kind === 'upslope') {
      sa(E.sky0, { 'stop-color': '#C4DFF2' }); sa(E.sky1, { 'stop-color': '#EEF6FB' });
      const geo = slopeGeo(g);
      px = lerp(geo.x0, geo.x1, a.z / st.M); py = geo.yZ(a.z) - 24;
      arrowH(E.dyn, 14, geo.x0 - 10, yG - 22, '#4E5D6A', 3.5);
      txt({ x: 14, y: yG - 34, class: 'lb-sm halo', fill: '#4E5D6A' }, '바람', E.dyn);
      const ang = Math.atan2(geo.yZ(st.M) - yG, geo.x1 - geo.x0);
      for (let i = 0; i < 3; i++) {
        const t = ((ph * 0.03 + i / 3) % 1), x = lerp(geo.x0, geo.x1, t * 0.9), y = lerp(yG, geo.yZ(st.M), t * 0.9) - 46;
        s('path', { d: `M${x} ${y} l${Math.cos(ang) * 26} ${Math.sin(ang) * 26}`, stroke: '#7A8894', 'stroke-width': 2.5, 'stroke-linecap': 'round', fill: 'none' }, E.dyn);
      }
      txt({ x: geo.x0 + 10, y: yG - 70, class: 'lb-sm halo', fill: '#4E5D6A' }, '산 사면을 따라 상승 → 단열 팽창 → 냉각', E.dyn);
      if (a.saturated && a.z > a.H) {   // 응결 고도부터 공기가 지나온 곳까지 사면에 붙은 안개
        const n = 10;
        for (let i = 0; i < n; i++) {
          const z0 = lerp(a.H, a.z, i / n), z1 = lerp(a.H, a.z, (i + 1) / n);
          fogBand(E.fog, lerp(geo.x0, geo.x1, z0 / st.M) - 18, lerp(geo.x0, geo.x1, z1 / st.M) + 18, geo.yZ(z0) + 4, 30 + 26 * dens, dens, 11 + i);
        }
      }
      info = `높이 ${fZ(a.z)} km`;
    } else if (st.kind === 'steam') {
      sa(E.sky0, { 'stop-color': '#D3E2EC' }); sa(E.sky1, { 'stop-color': '#F2F6F8' });
      const xw = X('steam', 0.3);
      px = X('steam', a.x); py = yG - 34;
      arrowH(E.dyn, 14, 110, g.top + 40, '#2F6E9E', 4);
      txt({ x: 14, y: g.top + 26, class: 'lb-sm halo', fill: '#1F5A88' }, `찬 공기 이동 (${fT(Physics.FOG.steam.T0)} ℃)`, E.dyn);
      const nEv = Math.max(2, Math.round((st.water - 2) / 3));
      for (let i = 0; i < nEv; i++) { const x = xw + 20 + (W - xw - 30) * (i + 0.5) / nEv; wavyUp(E.dyn, x, yG - 2, 26, '#8FC3DD', ph * 0.8 + i * 1.7, 1.8); }
      txt({ x: (xw + W) / 2, y: yG - 118, 'text-anchor': 'middle', class: 'lb-sm halo', fill: '#2F6E9E' }, '따뜻한 수면에서 증발한 수증기 ↑', E.dyn);
      if (on != null && st.s >= on) {   // 김처럼 피어오르는 물안개
        const x0 = X('steam', on), x1 = Math.min(W - 6, px + 30);
        for (let x = x0; x < x1; x += 22) {
          const R = rng(Math.round(x));
          const hgt = (28 + 42 * dens) * (0.6 + R() * 0.6);
          s('path', { d: `M${x} ${yG} C${x - 10} ${yG - hgt * 0.4} ${x + 12} ${yG - hgt * 0.7} ${x + 2} ${yG - hgt}`, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 9 + R() * 5, 'stroke-linecap': 'round', opacity: 0.55 * dens }, E.fog);
        }
        fogBand(E.fog, x0, x1, yG, 16 + 20 * dens, dens * 0.9, 13);
      }
      info = a.overWater ? '따뜻한 수면 위' : '차가운 육지 위';
    } else {   // frontal
      sa(E.sky0, { 'stop-color': '#B7C0C8' }); sa(E.sky1, { 'stop-color': '#DDE2E6' });
      const fr = frontGeo(g);
      // 빗방울: 구름에서 떨어져 찬 공기층을 지나며 증발(아래로 갈수록 작아짐)
      const R = rng(9), nDrop = st.rain === 'strong' ? 26 : 10;
      for (let i = 0; i < nDrop; i++) {
        const x = fr.x0 + 40 + R() * (W - fr.x0 - 50), yTop = g.top + 70, yBot = yG - 6;
        const t = (R() + st.s * 6) % 1, y = lerp(yTop, yBot, t);
        const yFront = lerp(yG, fr.yR, (x - fr.x0) / (W - fr.x0));
        const inCold = y > yFront, shrink = inCold ? clamp(1 - (y - yFront) / Math.max(30, yBot - yFront), 0.25, 1) : 1;
        s('path', { d: `M${x} ${y} l-2 ${8 * shrink}`, stroke: '#3E6E9C', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.85 }, E.dyn);
      }
      for (let i = 0; i < 4; i++) { const x = W * (0.42 + 0.13 * i); wavyUp(E.dyn, x, yG - 14, 18, '#7FA6C8', ph + i, 1.6); }
      txt({ x: W - 8, y: fr.yR + (yG - fr.yR) * 0.5 + 20, 'text-anchor': 'end', class: 'lb-sm halo', fill: '#2F5E88' }, '빗방울 증발 → 수증기 증가', E.dyn);
      fogBand(E.fog, fr.x0 + 10, W - 4, yG, 22 + 40 * dens, dens, 17);
      px = W * 0.62; py = yG - 32;
      info = '찬 공기층';
    }
    sa(E.info, { fill: st.s < 0.9 ? '#F2F4F8' : '#263746', class: st.s < 0.9 ? 'lb' : 'lb halo-sky' });
    E.info.textContent = st.kind === 'radiation' ? info : '';      // 밤사이 시각 (다른 안개는 현재 수치 칸에)
    // 공기 덩어리와 이름표 (기온 · 이슬점)
    E.parcel.set(px, py, 15, a.saturated ? clamp(0.3 + a.water / 2, 0.3, 1) : 0);
    E.tagT.textContent = `기온 ${fT(a.T)} ℃`; E.tagD.textContent = `이슬점 ${fT(a.Td)} ℃`;
    const tw = 112, th = 42, tx = clamp(px - tw / 2, 4, W - tw - 4), tyy = clamp(py - 24 - th, 44, yG - th);
    sa(E.tagBg, { x: tx, y: tyy, width: tw, height: th });
    sa(E.tagT, { x: tx + 9, y: tyy + 17 }); sa(E.tagD, { x: tx + 9, y: tyy + 35 });

    /* 그래프 */
    const pts = [];
    const N = Math.max(2, Math.round(st.s * 120));
    for (let i = 0; i <= N; i++) { const b = A(st.s * i / N); pts.push([b.T, b.e]); }
    sa(E.gPath, { d: pts.length > 1 && st.s > 1e-6 ? 'M' + pts.map(p => `${G.gx(p[0]).toFixed(1)} ${G.gy(p[1]).toFixed(1)}`).join(' L') : '' });
    const a0 = A(0);
    sa(E.gStart, { cx: G.gx(a0.T), cy: G.gy(a0.e) });
    const xP = G.gx(a.T), yP = G.gy(a.e);
    sa(E.gPt, { cx: xP, cy: yP });
    sa(E.gPtT, { x: xP + 12, y: yP - 10 }); E.gPtT.textContent = a.saturated ? '포화!' : '공기';
    clear(E.gGuide); clear(E.gProc);
    const dash = { stroke: '#4E5D6A', 'stroke-width': 1.6, 'stroke-dasharray': '5 4', fill: 'none' };
    if (cool) {        // 수증기량 그대로 → 왼쪽으로: 곡선에 닿는 기온이 이슬점
      const xd = G.gx(a.Td);
      if (!a.saturated) s('line', Object.assign({ x1: xd, x2: xP - 9, y1: yP, y2: yP }, dash), E.gGuide);
      s('line', Object.assign({ x1: xd, x2: xd, y1: yP, y2: G.Y0 }, dash, { stroke: 'var(--dew)' }), E.gGuide);
      s('circle', { cx: xd, cy: yP, r: 5, fill: 'var(--dew)', stroke: '#fff', 'stroke-width': 1.5 }, E.gGuide);
      txt({ x: xd - 8, y: G.Y0 - 8, 'text-anchor': 'end', class: 'lb-sm halo tnum', fill: 'var(--dew)' }, `이슬점 ${fT(a.Td)} ℃`, E.gGuide);
      if (st.s < 0.02) { arrowH(E.gProc, xP - 18, xP - 70, yP + 22, '#C65040', 2.5); txt({ x: xP - 44, y: yP + 42, 'text-anchor': 'middle', class: 'lb-sm halo', fill: '#9C3B2E' }, '냉각', E.gProc); }
    } else {           // 기온 그대로 → 위로: 곡선에 닿는 수증기압이 포화 수증기압
      const yE = G.gy(a.E);
      if (!a.saturated) s('line', Object.assign({ x1: xP, x2: xP, y1: yP - 9, y2: yE }, dash), E.gGuide);
      if (!a.saturated) {
        s('circle', { cx: xP, cy: yE, r: 5, fill: C_SAT, stroke: '#fff', 'stroke-width': 1.5 }, E.gGuide);
        txt({ x: xP + 10, y: yE - 8, class: 'lb-sm halo tnum', fill: C_SAT }, `포화 수증기압 ${fmt(a.E, 1)} hPa`, E.gGuide);
      }
      if (st.s < 0.02) { s('path', { d: `M${xP - 22} ${yP - 10} L${xP - 22} ${yP - 58} M${xP - 28} ${yP - 50} L${xP - 22} ${yP - 58} L${xP - 16} ${yP - 50}`, fill: 'none', stroke: '#C65040', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, E.gProc); txt({ x: xP - 30, y: yP - 30, 'text-anchor': 'end', class: 'lb-sm halo', fill: '#9C3B2E' }, '수증기 증가', E.gProc); }
    }

    /* 수치 */
    ui.ro.set('T', `${fT(a.T)}<small>℃</small>`, info);
    ui.ro.set('Td', `${fT(a.Td)}<small>℃</small>`, a.saturated ? '기온 = 이슬점' : `기온보다 ${fT(a.T - a.Td)} ℃ ↓`);
    ui.ro.set('e', `${fmt(a.e, 1)}<small>hPa</small>`, `포화 ${fmt(a.E, 1)} hPa`);
    ui.ro.set('rh', `${fmt(a.rh, 0)}<small>%</small>`, a.saturated ? '포화' : '불포화');
    ui.ro.set('fog', `<span style="font-size:21px">${a.saturated ? (dens > 0.75 ? '짙은 안개' : '안개 생김') : '없음'}</span>`, a.saturated ? '수증기가 응결' : (cool ? `이슬점까지 ${fT(a.T - a.Td)} ℃` : `포화까지 ${fmt(a.E - a.e, 1)} hPa`));
    renderGuide(a, on);
    const gt = cool ? '공기의 냉각 → 기온이 이슬점까지' : '수증기량 증가 → 포화 수증기압까지';
    if (ui.badge.textContent !== gt) ui.badge.textContent = gt;
    ui.badge.className = 'stab-badge ' + (cool ? 'absolute-stable' : 'conditional');
    if (ch) ch.check();
  }
  function noFogText() {
    const a1 = A(1);
    return {
      radiation: st.sky === 'cloudy'
        ? `구름이 지표에서 나가는 복사 에너지를 다시 지표로 내보내 기온이 덜 내려가요(${fT(a1.T)} ℃). 이슬점(10 ℃)에 닿지 않아 <b>안개가 생기지 않아요</b>.`
        : `바람이 지표 부근의 찬 공기를 위쪽 공기와 섞어 기온이 덜 내려가요(${fT(a1.T)} ℃). 이슬점(10 ℃)에 닿지 않아 <b>안개가 생기지 않아요</b>.`,
      advection: `해수면(${fT(st.sea)} ℃)이 공기의 이슬점(14 ℃)보다 따뜻해 공기가 이슬점까지 식지 않아요. <b>안개가 생기지 않아요</b>.`,
      upslope: `산 높이(${fZ(st.M)} km)가 상승 응결 고도(${fZ(a1.H)} km)보다 낮아 정상까지 올라가도 포화되지 않아요. <b>안개가 생기지 않아요</b>.`,
      steam: `수면(${fT(st.water)} ℃)이 공기(2 ℃)보다 충분히 따뜻하지 않아 증발한 수증기가 적어요. 포화되지 않아 <b>안개가 생기지 않아요</b>.`,
      frontal: `빗방울이 증발해 늘어난 수증기가 적어 찬 공기층이 포화되지 않아요. <b>안개가 생기지 않아요</b>.`
    }[st.kind];
  }
  function renderGuide(a, on) {
    if (st.notice) { ui.ro.guide('안내', 'neutral', st.notice); return; }
    const cool = group() === 'cool';
    const name = NAME[st.kind];
    if (st.s < 1e-6) {
      ui.ro.guide('처음', 'neutral', `<b>${name}</b>: ${DESC[st.kind]}. ▶ 재생을 눌러 보세요.`);
      return;
    }
    if (on != null && st.s >= on - 1e-9) {
      const just = Math.abs(st.s - on) < 1e-6;
      ui.ro.guide(just ? '안개 생성' : '안개', 'sat', cool
        ? `기온이 이슬점(${fT(a.Td)} ℃)까지 내려가 <b>포화</b>됐어요 → 수증기가 응결해 <b>${name}</b>가 ${just ? '생기기 시작해요' : '짙어져요'}.`
        : `수증기가 늘어 포화 수증기압(${fmt(a.E, 1)} hPa)에 이르러 <b>포화</b>됐어요 → 남는 수증기가 응결해 <b>${name}</b>가 ${just ? '생기기 시작해요' : '짙어져요'}.`);
      return;
    }
    if (st.s >= 1 - 1e-9 && on == null) { ui.ro.guide('안개 없음', 'neutral', noFogText()); return; }
    ui.ro.guide('불포화', 'unsat', cool
      ? `${{ radiation: '맑은 밤, 지표면이 복사 냉각으로 식으며 지표 부근 공기도 식어요.', advection: a.overCold ? '차가운 해수면 위를 지나며 공기가 아래에서 식어요.' : '따뜻한 바다 위에서는 기온이 거의 그대로예요.', upslope: '산 사면을 따라 올라가며 단열 팽창으로 식어요(1 km에 10 ℃).' }[st.kind]} 이슬점까지 <b>${fT(a.T - a.Td)} ℃</b> 남았어요.`
      : `${{ steam: a.overWater ? '따뜻한 수면에서 증발한 수증기가 찬 공기 속으로 들어와요.' : '차가운 육지 위에서는 수증기량이 그대로예요.', frontal: '빗방울이 찬 공기층을 지나며 증발해 수증기가 늘어요.' }[st.kind]} 포화까지 <b>${fmt(a.E - a.e, 1)} hPa</b> 남았어요.`);
  }
  function renderControls() {
    if (!ui.ctrl) return;
    const on = onset();
    ui.ctrl.setPlay(st.playing, st.s >= 1 - 1e-9 ? '↺ 처음부터 재생' : (st.s > 0 ? '▶ 이어서 재생' : '▶ 재생'));
    const S = stageList();
    ui.ctrl.setStep(S.some(v => v < st.s - 1e-9), S.some(v => v > st.s + 1e-9));
    const names = STAGE[st.kind], P = [0, on, 1];
    const labels = [`① ${names[0]}`, on == null ? '② 안개 없음' : `② 안개 시작${st.kind === 'radiation' ? ' (' + hourText(on) + ')' : ''}`, `③ ${names[1]}`];
    ui.stageBtns.forEach((b, i) => {
      const at = P[i] != null && Math.abs(P[i] - st.s) < 1e-9;
      if (b.innerHTML !== labels[i]) b.innerHTML = labels[i];
      b.classList.toggle('accent', at);
      b.setAttribute('aria-pressed', at ? 'true' : 'false');
      b.classList.toggle('muted', P[i] == null);
      b.title = P[i] == null ? '이 조건에서는 끝까지 포화되지 않아요' : '';
    });
    if (document.activeElement !== ui.prog) ui.prog.value = Math.round(st.s * 1000);
    ui.prog.style.setProperty('--fill', (st.s * 100) + '%');
  }

  return {
    L, init, layout, tick, render,
    pause() { pause(); },
    onShow() { layout(); },
    hasFrame: () => !!(sh && sh.frame),
    api: { setS, setKind, setCond, play, step, goStage, resetMotion, resetDefaults, saveCompare, st, state: () => A(), onset: () => onset() }
  };
})();
