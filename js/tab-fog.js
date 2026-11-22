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
  const st = Object.assign({}, DEF, { s: 0, playing: false, notice: '', seen: {} });
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
  /* ───────── 화면 만들기 ───────── */
  function init(root) {
    sh = makeShell(root, {
      ratio: '52%', zMax: 1,
      sceneTitle: '지표 부근 단면', graphTitle: '포화 수증기압 곡선',
      sceneLabel: '안개가 생기는 과정을 보여 주는 지표 부근 단면', graphLabel: '기온에 따른 포화 수증기압 곡선과 공기의 상태 변화'
    });
    // 안개 종류: 「공기의 냉각」과 「수증기량의 증가」 두 묶음으로 나눠 고름
    ui.kind = (function () {
      const el = h('div', { class: 'fog-kinds', role: 'group', 'aria-label': '안개 종류' });
      const segs = [['cool', '공기의 냉각'], ['vapor', '수증기량의 증가']].map(([gk, cap]) => {
        const sg = Seg(KINDS.filter(x => x.group === gk).map(x => ({ value: x.k, label: x.name, title: stripTags(DESC[x.k]) })), st.kind, v => setKind(v), { label: cap });
        el.appendChild(h('div', { class: 'fk-group fk-' + gk }, h('span', { class: 'fk-cap', text: cap }), sg.el));
        return sg;
      });
      return { el, set(v) { segs.forEach(sg => sg.set(v)); } };
    })();
    sh.cond.append(ui.kind.el);
    ui.condBox = h('div', { class: 'fog-cond' });     // 조건 바꾸기는 아래 「자유 탐구 · 도전」 안에
    buildCond();

    ui.legend = h('span', { class: 'legend' });
    sh.graphLegend.append(ui.legend);

    ui.ro = Readouts(sh.ro, [
      { key: 'T', label: '<i style="border-color:var(--temp)"></i>기온', cls: 'temp' },
      { key: 'Td', label: '<i class="dash" style="border-color:var(--dew)"></i>이슬점', cls: 'dew' },
      { key: 'e', label: '수증기압' },
      { key: 'rh', label: '상대 습도' },
      { key: 'fog', label: '안개' }
    ]);
    // 아래 조작은 「재생」과 「다음 단계」만 (처음 → 안개가 생기기 시작한 순간 → 끝)
    ui.play = Btn('▶ 재생', 'primary play', play);
    ui.next = Btn('다음 단계 ▶', '', () => step(1), { title: '처음 → 안개가 생기기 시작한 순간 → 끝' });
    ui.stepHint = h('span', { class: 'rel-hint show' });
    sh.ctrl.classList.add('act-bar');
    sh.ctrl.append(ui.play, ui.next, ui.stepHint);

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
    m.appendChild(Fold('자유 탐구 · 도전 <span class="tag">조건 바꾸기 · 도전 2</span>', h('div', null,
      h('p', { class: 'note', text: '조건을 바꿔 안개가 생기지 않는 경우와 비교해 볼 수 있어요. 조건을 바꾸면 처음부터 다시 봐요.' }),
      ui.condBox, h('div', { class: 'ch-row' }, Btn('조건 기본값', 'sm', resetDefaults)),
      h('div', { class: 'more-sec' }, h('h4', { text: '도전' }), ui.chBox)), false));
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

  /* ═════════ 장면 ═════════
   * 정적인 풍경(지형 · 나무 · 집 · 바다)은 조건이 바뀔 때만 그리고, 하늘 · 화살표 · 안개는 매 순간 다시 그린다.
   * 안개는 흐림 효과(feGaussianBlur)를 준 흰 덩어리로 그려 부드럽게 보이게 한다. 모든 그림은 정성적 표현. */
  function sceneGeo(f) { return { W: f.sceneW, yG: f.yOf(0), top: 18, H: f.H }; }
  const P2 = pts => 'M' + pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L');
  function smoothLine(pts) {        // 점들을 지나는 부드러운 곡선(카디널 스플라인)
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  }
  /** 능선: x0~x1 사이 봉우리가 여러 개인 산줄기 (아래는 bottom까지 채움) */
  function ridge(parent, x0, x1, yBase, amp, seed, fill, bottom, n) {
    const R = rng(seed), pts = [];
    n = n || 9;
    for (let i = 0; i <= n; i++) pts.push([lerp(x0, x1, i / n), yBase - amp * (0.35 + 0.65 * R())]);
    return s('path', { d: smoothLine(pts) + ` L${x1} ${bottom} L${x0} ${bottom} Z`, fill }, parent);
  }
  function pine(parent, x, yb, hgt, fill, trunk) {
    const w = hgt * 0.42;
    s('rect', { x: x - hgt * 0.04, y: yb - hgt * 0.18, width: hgt * 0.08, height: hgt * 0.18, fill: trunk || '#5A4632' }, parent);
    for (let k = 0; k < 3; k++) {
      const y0 = yb - hgt * (0.12 + k * 0.26), y1 = y0 - hgt * 0.42, ww = w * (1 - k * 0.22);
      s('path', { d: `M${x - ww} ${y0} L${x} ${y1} L${x + ww} ${y0} Z`, fill }, parent);
    }
  }
  function roundTree(parent, x, yb, hgt, fill) {
    s('rect', { x: x - hgt * 0.05, y: yb - hgt * 0.42, width: hgt * 0.1, height: hgt * 0.42, fill: '#6A5236' }, parent);
    s('circle', { cx: x, cy: yb - hgt * 0.66, r: hgt * 0.32, fill }, parent);
    s('circle', { cx: x - hgt * 0.18, cy: yb - hgt * 0.54, r: hgt * 0.22, fill }, parent);
    s('circle', { cx: x + hgt * 0.18, cy: yb - hgt * 0.56, r: hgt * 0.22, fill }, parent);
  }
  function bareTree(parent, x, yb, hgt, color) {
    const st2 = { stroke: color, 'stroke-linecap': 'round', fill: 'none' };
    s('path', Object.assign({ d: `M${x} ${yb} L${x} ${yb - hgt}`, 'stroke-width': hgt * 0.07 }, st2), parent);
    [[0.45, -1], [0.6, 1], [0.75, -1], [0.85, 1]].forEach(([t, d]) => s('path', Object.assign({ d: `M${x} ${yb - hgt * t} l${d * hgt * 0.28} ${-hgt * 0.22}`, 'stroke-width': hgt * 0.035 }, st2), parent));
  }
  function house(parent, x, yb, w, hgt, wall, roof, lit) {
    s('rect', { x: x - w / 2, y: yb - hgt, width: w, height: hgt, fill: wall }, parent);
    s('path', { d: `M${x - w / 2 - 3} ${yb - hgt} L${x} ${yb - hgt - w * 0.42} L${x + w / 2 + 3} ${yb - hgt} Z`, fill: roof }, parent);
    s('rect', { x: x - w * 0.22, y: yb - hgt * 0.68, width: w * 0.2, height: hgt * 0.3, fill: lit ? '#FFD98A' : '#8FA9BF' }, parent);
    s('rect', { x: x + w * 0.08, y: yb - hgt * 0.68, width: w * 0.2, height: hgt * 0.3, fill: lit ? '#FFD98A' : '#8FA9BF' }, parent);
  }
  function building(parent, x, yb, w, hgt, fill) {
    s('rect', { x, y: yb - hgt, width: w, height: hgt, fill }, parent);
    for (let yy = yb - hgt + 7; yy < yb - 8; yy += 10) for (let xx = x + 5; xx < x + w - 5; xx += 9) s('rect', { x: xx, y: yy, width: 4, height: 5, fill: '#DCE7EF', opacity: 0.85 }, parent);
  }
  /** 부드러운 안개 띠 (흐림 효과) */
  function mist(parent, x0, x1, yb, hgt, dens, seed) {
    if (dens <= 0.01 || x1 - x0 < 4 || hgt < 3) return;
    const grp = s('g', { opacity: clamp(dens, 0, 1).toFixed(2), filter: 'url(#fogBlur)' }, parent);
    s('rect', { x: x0, y: yb - hgt * 0.55, width: x1 - x0, height: hgt * 0.55 + 6, fill: '#F6F9FB', opacity: 0.9, rx: 10 }, grp);
    const STEP = 30;
    for (let i = Math.floor(x0 / STEP); i * STEP <= x1; i++) {
      const R = rng(seed * 977 + i * 131), cx = i * STEP + R() * 12;
      if (cx < x0 + 4 || cx > x1 - 4) continue;
      s('ellipse', { cx, cy: yb - hgt * (0.5 + R() * 0.25), rx: 24 + R() * 18, ry: Math.max(4, hgt * (0.28 + R() * 0.2)), fill: '#FFFFFF', opacity: 0.85 }, grp);
    }
  }
  /** 위로 올라가는 물결 화살표 (복사 · 증발) */
  function wavyUp(parent, x, y0, len, color, phase, width) {
    const n = 14, pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x + Math.sin(t * Math.PI * 3 + phase) * 4, y0 - t * len]); }
    s('path', { d: P2(pts), fill: 'none', stroke: color, 'stroke-width': width || 2.2, 'stroke-linecap': 'round' }, parent);
    const e = pts[n];
    s('path', { d: `M${e[0] - 5} ${e[1] + 6} L${e[0]} ${e[1]} L${e[0] + 5} ${e[1] + 6}`, fill: 'none', stroke: color, 'stroke-width': width || 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, parent);
  }
  /** 곧은 화살표: 끝(x1, y1)에 진행 방향을 향한 머리 */
  function arrowLine(parent, x0, y0, x1, y1, color, w, dash) {
    const ang = Math.atan2(y1 - y0, x1 - x0), hl = 6 + (w || 3) * 1.6;
    s('path', { d: `M${x0} ${y0} L${x1 - Math.cos(ang) * 2} ${y1 - Math.sin(ang) * 2}`, fill: 'none', stroke: color, 'stroke-width': w || 3, 'stroke-linecap': 'round', 'stroke-dasharray': dash || 'none' }, parent);
    const a1 = ang + Math.PI * 0.82, a2 = ang - Math.PI * 0.82;
    s('path', { d: `M${x1 + Math.cos(a1) * hl} ${y1 + Math.sin(a1) * hl} L${x1} ${y1} L${x1 + Math.cos(a2) * hl} ${y1 + Math.sin(a2) * hl} Z`, fill: color, stroke: color, 'stroke-width': 1, 'stroke-linejoin': 'round' }, parent);
  }
  /** 곡선 화살표 (바람 · 기류): 점들을 지나는 곡선 + 끝 방향 머리 */
  function curveArrow(parent, pts, color, w, opacity) {
    const g2 = s('g', { opacity: opacity == null ? 1 : opacity }, parent);
    s('path', { d: smoothLine(pts), fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round' }, g2);
    const a = pts[pts.length - 2], b2 = pts[pts.length - 1], ang = Math.atan2(b2[1] - a[1], b2[0] - a[0]), hl = 6 + w * 1.6;
    s('path', { d: `M${b2[0] + Math.cos(ang + 2.6) * hl} ${b2[1] + Math.sin(ang + 2.6) * hl} L${b2[0]} ${b2[1]} L${b2[0] + Math.cos(ang - 2.6) * hl} ${b2[1] + Math.sin(ang - 2.6) * hl} Z`, fill: color }, g2);
  }
  /** 이름표(글자 테두리 있음) */
  const lbl = (parent, x, y, text, fill, o) => txt(Object.assign({ x, y, class: 'lb-sm halo', fill }, o || {}), text, parent);
  function waves(parent, x0, x1, y, color, phase, gap) {
    for (let x = x0 + ((phase * 12) % 34); x < x1 - 10; x += gap || 34) s('path', { d: `M${x} ${y} q5 -4 10 0 t10 0`, fill: 'none', stroke: color, 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: 0.7 }, parent);
  }
  const mixColor = (a, b, t) => { const p = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16)); const A1 = p(a), B1 = p(b); return '#' + A1.map((v, i) => Math.round(lerp(v, B1[i], t)).toString(16).padStart(2, '0')).join(''); };
  function hourText(s0) {
    const hr = (18 + 11 * s0) % 24, hh = Math.floor(hr), mm = Math.round((hr - hh) * 60 / 10) * 10;
    const h2 = mm === 60 ? (hh + 1) % 24 : hh, m2 = mm === 60 ? 0 : mm;
    const part = h2 >= 18 ? (h2 >= 21 ? '밤' : '저녁') : (h2 === 0 ? '밤' : (h2 < 6 ? '새벽' : '아침'));
    const h12 = h2 > 12 ? h2 - 12 : (h2 === 0 ? 12 : h2);
    return `${part} ${h12}시${m2 ? ' ' + m2 + '분' : ''}`;
  }
  /* 장면에서 공기가 지나가는 가로 위치 (이동하는 안개) */
  function X(kind, x) {
    const W = sh.frame.sceneW;
    if (kind === 'advection') return W * 0.05 + x * W * 0.72;
    if (kind === 'steam') return W * 0.05 + x * W * 0.82;
    return W * 0.5;
  }
  function slopeGeo(g) {
    const zTop = Math.max(1.0, st.M + 0.35);
    return { x0: g.W * 0.24, x1: g.W * 0.82, zTop, yZ: z => g.yG - z / zTop * (g.yG - g.top - 34) };
  }
  function frontGeo(g) {
    const x0 = g.W * 0.08, yR = g.yG - (g.yG - g.top) * 0.6;
    return { x0, yR, yAt: x => lerp(g.yG, yR, (x - x0) / (g.W - x0)), ang: Math.atan2(yR - g.yG, g.W - x0) * 180 / Math.PI };
  }
  // 복사 안개 골짜기 모양: 양쪽 언덕 사이 평평한 바닥
  const valley = g => ({ l: g.W * 0.3, r: g.W * 0.7, hl: x => g.yG - Math.max(0, (g.W * 0.3 - x) / (g.W * 0.3)) * 125, hr: x => g.yG - Math.max(0, (x - g.W * 0.7) / (g.W * 0.3)) * 115 });

  function buildScene(f) {
    const svg = sh.sceneSvg; clear(svg);
    const g = sceneGeo(f), W = g.W, yG = g.yG;
    const defs = s('defs', null, svg);
    E.skyG = s('linearGradient', { id: 'fogsky', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    E.sky0 = s('stop', { offset: '0%' }, E.skyG); E.sky1 = s('stop', { offset: '100%' }, E.skyG);
    const blur = s('filter', { id: 'fogBlur', x: '-30%', y: '-80%', width: '160%', height: '260%' }, defs);
    s('feGaussianBlur', { stdDeviation: 5 }, blur);
    const glow = s('radialGradient', { id: 'fogSun' }, defs);
    [['0%', '#FFF6D8', 1], ['45%', '#FFE2A0', 0.8], ['100%', '#FFD08A', 0]].forEach(([o, c, op]) => s('stop', { offset: o, 'stop-color': c, 'stop-opacity': op }, glow));
    s('rect', { x: 0, y: 0, width: W, height: g.H, fill: 'url(#fogsky)' }, svg);
    E.back = s('g', null, svg);      // 하늘: 별 · 달 · 해 · 구름 (매 순간)
    E.stat = s('g', null, svg);      // 풍경 (조건이 바뀔 때만)
    E.dyn = s('g', null, svg);       // 화살표 · 빗방울 · 물결 (매 순간)
    E.fog = s('g', null, svg);       // 안개 (매 순간)
    E.top = s('g', null, svg);       // 안개 위에 보여야 할 이름표 (매 순간)
    E.parcel = makeParcel(svg, { seed: 23 });
    E.clock = s('g', null, svg);
    E.clockBg = s('rect', { x: 10, y: 24, rx: 9, height: 28, fill: 'rgba(20,30,50,.55)' }, E.clock);
    E.clockT = txt({ x: 22, y: 43, class: 'lb', fill: '#F4F6FA' }, '', E.clock);
    const S0 = E.stat;
    if (st.kind === 'radiation') {
      const v = valley(g);
      ridge(S0, -10, W + 10, yG - 150, 70, 4, '#25345A', g.H, 8);               // 먼 산
      ridge(S0, -10, W + 10, yG - 105, 40, 9, '#2C3F5E', g.H, 10);
      const hillL = [], hillR = [];
      for (let x = 0; x <= v.l + 1; x += v.l / 12) hillL.push([x, v.hl(x)]);
      for (let x = v.r; x <= W + 1; x += (W - v.r) / 12) hillR.push([x, v.hr(x)]);
      s('path', { d: P2([[0, g.H], ...hillL, [v.l, yG], [v.r, yG], ...hillR, [W, g.H]]) + ' Z', fill: '#2E4636' }, S0);
      s('rect', { x: 0, y: yG, width: W, height: g.H - yG, fill: '#33503C' }, S0);
      s('path', { d: `M${v.l + 10} ${yG + 30} C${W * 0.42} ${yG + 6} ${W * 0.56} ${yG + 44} ${v.r - 6} ${yG + 18}`, fill: 'none', stroke: '#5B6B78', 'stroke-width': 6, opacity: 0.7 }, S0);   // 길
      [[0.05, 0.6], [0.1, 0.7], [0.16, 0.8], [0.22, 0.75], [0.84, 0.75], [0.9, 0.7], [0.95, 0.62]].forEach(([t, k]) => { const x = W * t; pine(S0, x, x < W / 2 ? v.hl(x) + 2 : v.hr(x) + 2, 36 * k, '#1D3326', '#2A2A22'); });
      [[0.37, 22, 16], [0.44, 26, 18], [0.6, 24, 17], [0.66, 20, 15]].forEach(([t, w, hh]) => house(S0, W * t, yG + 2, w, hh, '#3A4658', '#24303F', true));
    } else if (st.kind === 'advection') {
      const xs = X('advection', 0.35), xc = W * 0.8;
      const sea = s('linearGradient', { id: 'fogsea', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
      [['0%', '#3FA39A'], [(xs / W * 100).toFixed(0) + '%', '#3E9C98'], [((xs / W + 0.14) * 100).toFixed(0) + '%', '#2A6A9C'], ['100%', '#1F5786']].forEach(([o, c]) => s('stop', { offset: o, 'stop-color': c }, sea));
      ridge(S0, xc - 40, W + 10, yG - 70, 40, 3, '#8BA48A', yG, 5);                // 해안 뒤 언덕
      [[0.82, 16, 70, '#C8D2DA'], [0.855, 18, 92, '#B7C3CD'], [0.895, 15, 60, '#D3DBE1'], [0.925, 20, 104, '#AFBCC7'], [0.965, 16, 76, '#C2CDD6']].forEach(([t, w, hh, c]) => building(S0, W * t, yG - 10, w, hh, c));
      s('path', { d: `M${xc - 6} ${yG} Q${xc + 20} ${yG - 12} ${W} ${yG - 12} L${W} ${g.H} L${xc - 6} ${g.H} Z`, fill: '#E2CFA2' }, S0);   // 모래사장
      s('rect', { x: 0, y: yG, width: xc, height: g.H - yG, fill: 'url(#fogsea)' }, S0);
      lbl(S0, xs / 2, yG + 26, '따뜻한 바다', '#FFFFFF', { 'text-anchor': 'middle', class: 'lb-sm', stroke: 'none' });
      lbl(S0, (xs + xc) / 2, yG + 26, '차가운 바다', '#FFFFFF', { 'text-anchor': 'middle', class: 'lb-sm', stroke: 'none' });
    } else if (st.kind === 'upslope') {
      const geo = slopeGeo(g);
      ridge(S0, -10, W + 10, yG - (yG - g.top) * 0.62, 50, 6, '#B8C8D6', g.H, 7);     // 먼 산줄기
      const peak = [geo.x1, geo.yZ(st.M)];
      s('path', { d: P2([[0, g.H], [0, yG], [geo.x0, yG], peak, [W, lerp(peak[1], yG, 0.75)], [W, g.H]]) + ' Z', fill: '#6F9061' }, S0);
      s('path', { d: P2([[geo.x0, yG], peak, [peak[0] - 18, peak[1] + 30], [geo.x0 + 40, yG]]) + ' Z', fill: '#7FA06E', opacity: 0.6 }, S0);   // 사면 밝은 쪽
      for (let i = 1; i <= 9; i++) { const t = i / 10, x = lerp(geo.x0, geo.x1, t), y = lerp(yG, peak[1], t); pine(S0, x - 6, y + 4, 22 + 8 * (1 - t), '#2F5A35'); }
      for (let i = 0; i < 4; i++) roundTree(S0, W * (0.03 + 0.05 * i), yG + 2, 26, '#4F7A45');
      house(S0, W * 0.2, yG + 1, 22, 15, '#E8DCC8', '#A3553E', false);
      const H = A(1).H;
      if (H <= geo.zTop) {
        s('line', { x1: 0, x2: W, y1: geo.yZ(H), y2: geo.yZ(H), stroke: 'var(--lcl)', 'stroke-width': 2, 'stroke-dasharray': '12 5 3 5' }, S0);
        lbl(S0, 8, geo.yZ(H) - 7, '상승 응결 고도', '#7A4E10', { class: 'lb-sm halo-sky' });
      }
    } else if (st.kind === 'steam') {
      const xw = X('steam', 0.3);
      ridge(S0, -10, W + 10, yG - 52, 22, 8, '#7D8E86', g.H, 12);                   // 건너편 숲
      for (let i = 0; i < 14; i++) pine(S0, xw + 10 + (W - xw) * i / 14, yG - 30 + (i % 3) * 3, 18 + (i % 4) * 3, '#5F7268');
      s('path', { d: P2([[0, g.H], [0, yG - 8], [xw * 0.6, yG - 4], [xw + 6, yG], [xw + 6, g.H]]) + ' Z', fill: '#E4EAEE' }, S0);   // 서리 내린 땅
      const lake = s('linearGradient', { id: 'foglake', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      [['0%', '#4B93B4'], ['100%', '#2E6F92']].forEach(([o, c]) => s('stop', { offset: o, 'stop-color': c }, lake));
      s('rect', { x: xw, y: yG, width: W - xw, height: g.H - yG, fill: 'url(#foglake)' }, S0);
      for (let i = 0; i < 5; i++) s('line', { x1: xw + 30 + i * (W - xw) / 5, x2: xw + 70 + i * (W - xw) / 5, y1: yG + 14 + (i % 2) * 14, y2: yG + 14 + (i % 2) * 14, stroke: '#9CCBE0', 'stroke-width': 2, opacity: 0.6 }, S0);
      [[0.06, 40], [0.15, 32], [0.24, 36]].forEach(([t, hh]) => bareTree(S0, W * t, yG - 6, hh, '#6B6258'));
      s('path', { d: `M${xw + 4} ${yG - 3} L${xw + 70} ${yG - 3}`, stroke: '#8A6B4A', 'stroke-width': 5 }, S0);      // 선착장
      [xw + 14, xw + 40, xw + 64].forEach(x => s('line', { x1: x, x2: x, y1: yG - 3, y2: yG + 14, stroke: '#6E5338', 'stroke-width': 3 }, S0));
      lbl(S0, (xw + W) / 2, yG + 30, '따뜻한 수면', '#FFFFFF', { 'text-anchor': 'middle', class: 'lb-sm tnum', stroke: 'none' });
    } else {   // frontal
      const fr = frontGeo(g);
      s('path', { d: P2([[0, g.top - 20], [W, g.top - 20], [W, fr.yR], [fr.x0, yG], [0, yG]]) + ' Z', fill: '#F4DCC8', opacity: 0.55 }, S0);   // 따뜻한 공기
      s('path', { d: P2([[fr.x0, yG], [W, fr.yR], [W, yG]]) + ' Z', fill: '#C6DAEC', opacity: 0.85 }, S0);                                       // 찬 공기
      const cx0 = W * 0.34;
      cloudShape(S0, { x0: cx0 - 20, y0: g.top - 10, x1: W + 10, y1: fr.yR + 20 }, c => {
        c.rect(cx0, g.top + 30, W - cx0 + 10, Math.max(10, fr.yR - g.top - 46), 16);
        for (let i = 0; i < 8; i++) c.circle(cx0 + 10 + (W - cx0) * i / 7, g.top + 30, 20 + (i % 3) * 6);
      }, 0.95);
      lbl(S0, cx0 + 20, g.top + 64, '비구름', '#55606A', { class: 'lb-sm' });
      s('line', { x1: fr.x0, y1: yG, x2: W, y2: fr.yR, stroke: '#B0513A', 'stroke-width': 3.5 }, S0);
      for (let i = 1; i <= 5; i++) { const t = i / 6, x = lerp(fr.x0, W, t), y = lerp(yG, fr.yR, t); s('circle', { cx: x, cy: y, r: 6.5, fill: '#B0513A' }, S0); }
      const lx = lerp(fr.x0, W, 0.3), ly = fr.yAt(lx) - 12;
      lbl(S0, lx, ly, '전선면', '#8A3A28', { transform: `rotate(${fr.ang} ${lx} ${ly})` });
      s('rect', { x: 0, y: yG, width: W, height: g.H - yG, fill: '#8FA582' }, S0);
      [[0.5, 22, 16, '#E9E1D2', '#9C5A44'], [0.58, 26, 18, '#DDD3C1', '#7F4B3B'], [0.86, 24, 17, '#E6DCCB', '#9C5A44']].forEach(([t, w, hh, c1, c2]) => house(S0, W * t, yG + 1, w, hh, c1, c2, false));
      [0.66, 0.74, 0.95].forEach(t => roundTree(S0, W * t, yG + 2, 30, '#56794A'));
      lbl(S0, W - 8, fr.yR + (yG - fr.yR) * 0.42, '찬 공기', '#1F5A88', { 'text-anchor': 'end' });
    }
  }

  /* 안개마다 매 순간 그리는 부분: 공기 위치 { px, py, r, info }를 돌려줌 */
  const SCENE = {
    radiation(g, a, on, dens, ph) {
      const W = g.W, yG = g.yG, v = valley(g);
      const dawn = clamp((st.s - 0.8) / 0.2, 0, 1), cloudy = st.sky !== 'clear';
      sa(E.sky0, { 'stop-color': mixColor(cloudy ? '#232C3C' : '#111B33', '#56688F', dawn) }); sa(E.sky1, { 'stop-color': mixColor(cloudy ? '#3A4556' : '#2C3F66', '#F0C79E', dawn) });
      if (dawn > 0) s('circle', { cx: W * 0.82, cy: yG - 150, r: 70, fill: 'url(#fogSun)', opacity: dawn * 0.9 }, E.back);
      if (!cloudy) {
        const R = rng(5);
        for (let i = 0; i < 40; i++) { const tw = 0.6 + 0.4 * Math.sin(ph * 0.6 + i * 1.7); s('circle', { cx: R() * W, cy: g.top + R() * (yG - g.top) * 0.5, r: 0.7 + R() * 1.2, fill: '#fff', opacity: (0.45 + R() * 0.55) * tw * (1 - dawn) }, E.back); }
        s('circle', { cx: W * 0.16, cy: g.top + 40, r: 16, fill: '#F2EFD8', opacity: 0.95 - 0.7 * dawn }, E.back);
        s('circle', { cx: W * 0.16 + 6, cy: g.top + 36, r: 14, fill: mixColor('#111B33', '#56688F', dawn), opacity: 0.95 - 0.7 * dawn }, E.back);   // 초승달
      } else {
        cloudShape(E.back, { x0: -20, y0: g.top - 20, x1: W + 20, y1: g.top + 74 }, c => { c.rect(-20, g.top + 24, W + 40, 40, 16); for (let i = 0; i <= 9; i++) c.circle(W * i / 9, g.top + 26, 24 + (i % 3) * 7); }, 0.9);
      }
      // 지표 복사: 맑으면 우주로 빠져나가고, 흐리면 구름이 다시 지표로 돌려보냄
      const xs = [0.12, 0.27, 0.42, 0.58, 0.73, 0.88];
      xs.forEach((t, i) => {
        const x = W * t, y0 = (x < v.l ? v.hl(x) : x > v.r ? v.hr(x) : yG) - 8;
        const len = cloudy ? Math.max(30, y0 - g.top - 76) : (y0 - g.top) * 0.55;
        wavyUp(E.dyn, x, y0, len, '#F08A55', ph * 0.8 + i, 2.3);
        if (cloudy) arrowLine(E.dyn, x + 14, g.top + 74, x + 14, g.top + 112, '#F0A67E', 2, '4 3');
      });
      lbl(E.dyn, W * 0.5, g.top + (cloudy ? 92 : 70), cloudy ? '구름이 열을 되돌려 보내요' : '지표면 복사 냉각', cloudy ? '#FFD9C2' : '#FFC9A8', { 'text-anchor': 'middle', class: 'lb-sm', stroke: 'rgba(17,27,51,.85)', 'stroke-width': 4, 'paint-order': 'stroke' });
      if (st.wind === 'windy') {
        for (let i = 0; i < 3; i++) { const cx = ((ph * 9 + i * 160) % (W + 160)) - 80, cy = yG - 50 - i * 24; curveArrow(E.dyn, [[cx - 40, cy + 8], [cx - 10, cy - 10], [cx + 20, cy + 6], [cx + 46, cy - 6]], '#E3ECF6', 2.6, 0.85); }
        lbl(E.dyn, W * 0.5, yG - 126, '바람이 공기를 섞어요', '#E3ECF6', { 'text-anchor': 'middle', stroke: 'rgba(17,27,51,.85)', 'stroke-width': 4, 'paint-order': 'stroke' });
      }
      if (dens > 0) {
        mist(E.fog, W * 0.14, W * 0.86, yG + 8, 26 + 70 * dens, dens, 3);
        mist(E.fog, W * 0.26, W * 0.74, yG + 4, 16 + 40 * dens, dens * 0.9, 5);
      }
      return { px: W * 0.5, py: yG - 26, r: 15, info: hourText(st.s), fl: dens > 0 ? { x: W * 0.5, y: yG - 34 - 64 * dens, t: '복사 안개' } : null };
    },
    advection(g, a, on, dens, ph) {
      const W = g.W, yG = g.yG, xc = W * 0.8;
      sa(E.sky0, { 'stop-color': '#9DCBEA' }); sa(E.sky1, { 'stop-color': '#E8F3FA' });
      s('circle', { cx: W * 0.1, cy: g.top + 40, r: 42, fill: 'url(#fogSun)', opacity: 0.9 }, E.back);
      s('circle', { cx: W * 0.1, cy: g.top + 40, r: 15, fill: '#FFF3C4' }, E.back);
      [[0.42, 46, 30], [0.7, 30, 22]].forEach(([t, y, r]) => { const cx = W * t + Math.sin(ph * 0.05) * 6; cloudShape(E.back, { x0: cx - r * 2.2, y0: g.top + y - r, x1: cx + r * 2.2, y1: g.top + y + r * 0.6 }, c => { c.rect(cx - r * 1.8, g.top + y - r * 0.2, r * 3.6, r * 0.8, r * 0.4); c.circle(cx - r * 0.8, g.top + y, r * 0.7); c.circle(cx + r * 0.3, g.top + y - r * 0.3, r); c.circle(cx + r * 1.2, g.top + y + 2, r * 0.6); }, 0.95); });
      waves(E.dyn, 6, xc - 6, yG + 10, '#E8F6F5', ph, 40); waves(E.dyn, 26, xc - 6, yG + 40, '#DDEFF5', ph * 0.8, 46);
      const px = X('advection', a.x), py = yG - 30;
      // 남쪽 따뜻한 바다에서 불어오는 온난 습윤한 공기
      const wy = yG - 120;
      curveArrow(E.dyn, [[W * 0.03, wy + 10], [W * 0.18, wy - 8], [W * 0.34, wy + 4], [W * 0.46, wy - 4]], '#D0563F', 5);
      lbl(E.dyn, W * 0.03, wy - 22, '온난 습윤한 공기 →', '#9C3B2E');
      for (let i = 0; i < 4; i++) s('path', { d: `M${W * 0.07 + i * 26} ${wy + 20} q4 7 0 10 q-4 -3 0 -10 Z`, fill: '#6AA9D8' }, E.dyn);
      if (a.overCold) {
        for (let i = -1; i <= 1; i++) arrowLine(E.dyn, px + i * 14, py + 18, px + i * 14, yG - 3, '#2F6E9E', 2);
        lbl(E.dyn, px + 30, yG - 8, '냉각', '#1F5A88', { class: 'lb-sm halo-sky' });
      }
      let fl = null;
      if (on != null && st.s >= on) {   // 찬 바다 위에서 생긴 안개가 바람을 따라 해안으로
        const x0 = X('advection', on) - 10, x1 = Math.min(W + 20, px + 60 + (st.s - on) * W * 0.5);
        mist(E.fog, x0, x1, yG + 6, 30 + 52 * dens, dens, 7);
        mist(E.fog, x0 + 30, x1, yG + 4, 18 + 30 * dens, dens * 0.9, 8);
        fl = { x: Math.min((x0 + x1) / 2, W * 0.7), y: yG - 40 - 50 * dens, t: '이류 안개' };
      }
      return { px, py, r: 15, info: a.overCold ? '차가운 해수면 위' : '따뜻한 바다 위', fl };
    },
    upslope(g, a, on, dens, ph) {
      const W = g.W, yG = g.yG, geo = slopeGeo(g), peakY = geo.yZ(st.M);
      sa(E.sky0, { 'stop-color': '#A9CDEA' }); sa(E.sky1, { 'stop-color': '#EAF4FA' });
      const t = a.z / st.M, px = lerp(geo.x0, geo.x1, t), r = 13 + 7 * a.z / geo.zTop, py = geo.yZ(a.z) - r - 6;
      // 바람이 산 사면을 따라 공기를 밀어 올림
      for (let i = 0; i < 3; i++) {
        const u = (ph * 0.02 + i / 3) % 1, x0 = lerp(geo.x0 - 60, geo.x1, u * 0.85), x1 = x0 + 70;
        const yAt = x => (x < geo.x0 ? yG : lerp(yG, peakY, (x - geo.x0) / (geo.x1 - geo.x0))) - 30;
        curveArrow(E.dyn, [[x0, yAt(x0)], [(x0 + x1) / 2, yAt((x0 + x1) / 2) - 4], [x1, yAt(x1)]], '#5E6F7E', 2.6, 0.8);
      }
      lbl(E.dyn, W * 0.03, yG - 44, '바람 →', '#4E5D6A');
      lbl(E.top, W * 0.03, yG - 72, '단열 팽창 → 냉각', '#33414E', { class: 'lb-sm halo-sky' });
      if (a.saturated && a.z > a.H) {   // 응결 고도부터 공기가 지나온 곳까지 사면을 덮는 안개
        const n = 8;
        for (let i = 0; i < n; i++) {
          const z0 = lerp(a.H, a.z, i / n), z1 = lerp(a.H, a.z, (i + 1) / n);
          const xa = lerp(geo.x0, geo.x1, z0 / st.M), xb = lerp(geo.x0, geo.x1, z1 / st.M);
          mist(E.fog, xa - 34, xb + 30, geo.yZ(z0) + 10, 46 + 40 * dens, dens, 11 + i);
        }
      }
      const fl = a.saturated && a.z > a.H ? { x: lerp(geo.x0, geo.x1, (a.H + a.z) / 2 / st.M) - 60, y: geo.yZ((a.H + a.z) / 2) - 40 - 20 * dens, t: '활승 안개' } : null;
      return { px, py, r, info: `높이 ${fZ(a.z)} km`, fl };
    },
    steam(g, a, on, dens, ph) {
      const W = g.W, yG = g.yG, xw = X('steam', 0.3);
      sa(E.sky0, { 'stop-color': '#C9D7E2' }); sa(E.sky1, { 'stop-color': '#F4EEE6' });
      s('circle', { cx: W * 0.86, cy: yG - 70, r: 46, fill: 'url(#fogSun)', opacity: 0.8 }, E.back);
      s('circle', { cx: W * 0.86, cy: yG - 70, r: 13, fill: '#FFF1D0', opacity: 0.95 }, E.back);
      const px = X('steam', a.x), py = yG - 30;
      for (let i = 0; i < 3; i++) { const x0 = ((ph * 7 + i * 90) % (xw + 120)) - 60, y = yG - 18 - i * 16; arrowLine(E.dyn, x0, y, x0 + 54, y, '#3A78AA', 2.6); }
      lbl(E.dyn, 10, yG - 82, '찬 공기 →', '#1F5A88');
      const nEv = Math.max(3, Math.round((st.water - 2) / 2.5));
      for (let i = 0; i < nEv; i++) { const x = xw + 24 + (W - xw - 40) * (i + 0.5) / nEv; wavyUp(E.dyn, x, yG - 2, 18 + st.water, '#7FB8D6', ph * 0.8 + i * 1.7, 1.8); }
      lbl(E.top, (xw + W) / 2, yG + 50, '↑ 증발', '#E8F4FA', { 'text-anchor': 'middle', class: 'lb-sm', stroke: 'rgba(31,87,134,.9)', 'stroke-width': 4, 'paint-order': 'stroke' });
      let fl = null;
      if (on != null && st.s >= on) {   // 김처럼 피어오르는 물안개
        const x0 = X('steam', on), x1 = Math.min(W - 4, px + 40);
        const grp = s('g', { filter: 'url(#fogBlur)', opacity: clamp(dens, 0, 1).toFixed(2) }, E.fog);
        for (let x = x0; x < x1; x += 18) {
          const R = rng(Math.round(x * 7)), hgt = (34 + 70 * dens) * (0.55 + R() * 0.6), sw = Math.sin(ph * 0.5 + x * 0.05) * 6;
          s('path', { d: `M${x} ${yG} C${x - 12 + sw} ${yG - hgt * 0.35} ${x + 14 + sw} ${yG - hgt * 0.65} ${x + sw} ${yG - hgt}`, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 10 + R() * 8, 'stroke-linecap': 'round', opacity: 0.85 }, grp);
        }
        mist(E.fog, x0 - 10, x1 + 10, yG + 6, 18 + 26 * dens, dens, 13);
        fl = { x: (x0 + x1) / 2, y: yG - 74 - 60 * dens, t: '증발 안개' };
      }
      return { px, py, r: 15, info: a.overWater ? '따뜻한 수면 위' : '차가운 육지 위', fl };
    },
    frontal(g, a, on, dens, ph) {
      const W = g.W, yG = g.yG, fr = frontGeo(g);
      sa(E.sky0, { 'stop-color': '#A8B2BC' }); sa(E.sky1, { 'stop-color': '#D8DEE3' });
      // 따뜻한 공기가 전선면을 타고 올라감
      curveArrow(E.dyn, [[W * 0.02, yG - 40], [W * 0.1, yG - 74], [W * 0.2, fr.yAt(W * 0.2) - 64], [W * 0.3, fr.yAt(W * 0.3) - 86]], '#D0563F', 4.5);
      lbl(E.top, W * 0.02, g.top + 44, '따뜻한 공기 ↗', '#9C3B2E');
      // 빗방울: 구름에서 떨어져 찬 공기층을 지나며 증발해 작아짐
      const R = rng(9), nDrop = st.rain === 'strong' ? 46 : 16;
      for (let i = 0; i < nDrop; i++) {
        const x = W * 0.36 + R() * (W * 0.62), yTop = Math.max(g.top + 60, fr.yR - 10), yBot = yG - 4;
        const tt = (R() + st.s * 7) % 1, y = lerp(yTop, yBot, tt), yF = fr.yAt(x);
        const inCold = y > yF, k = inCold ? clamp(1 - (y - yF) / Math.max(30, yBot - yF), 0.2, 1) : 1;
        s('path', { d: `M${x} ${y} l-2.5 ${10 * k}`, stroke: '#3E6E9C', 'stroke-width': 2.2 * Math.sqrt(k), 'stroke-linecap': 'round', opacity: 0.9 }, E.dyn);
        if (inCold && k < 0.5 && i % 3 === 0) s('circle', { cx: x + 3, cy: y - 4, r: 2.2, fill: 'none', stroke: '#8FB4D6', 'stroke-width': 1.2 }, E.dyn);
      }
      lbl(E.dyn, W - 8, fr.yR + (yG - fr.yR) * 0.42 + 20, '빗방울 증발', '#2F5E88', { 'text-anchor': 'end' });
      if (dens > 0) {
        mist(E.fog, fr.x0 + 50, W + 10, yG + 6, 24 + 46 * dens, dens, 17);
        mist(E.fog, W * 0.34, W + 10, yG + 4, 14 + 28 * dens, dens * 0.9, 19);
      }
      return { px: W * 0.64, py: yG - 30, r: 15, info: '찬 공기층', fl: dens > 0 ? { x: W * 0.3, y: yG - 12, t: '전선 안개' } : null };
    }
  };

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
    txt({ x: X0 + 10, y: Y1 + 20, class: 'lb-sm halo', fill: '#4F7AA0' }, '곡선 위: 응결', svg);   // 곡선이 지나지 않는 왼쪽 위
    E.gUnsat = txt({ x: X1 - 10, y: Y0 - 12, 'text-anchor': 'end', class: 'lb-sm halo', fill: '#8D959C' }, '곡선 아래: 불포화', svg);
    E.gGuide = s('g', null, svg);
    E.gPath = s('path', { fill: 'none', stroke: 'var(--temp)', 'stroke-width': 3.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, clipG);
    E.gStart = s('circle', { r: 5.5, fill: '#fff', stroke: 'var(--temp)', 'stroke-width': 2.5 }, svg);
    E.gPt = s('circle', { r: 8, fill: 'var(--temp)', stroke: '#fff', 'stroke-width': 2.5 }, svg);
    E.gPtT = txt({ class: 'lb halo', fill: 'var(--temp)' }, '', svg);
  }
  function renderLegend() {
    ui.legend.innerHTML = legendHTML(C_SAT, '', '포화 수증기압') + legendHTML('var(--temp)', '', '공기의 변화');
  }

  const bboxW = el => { try { return el.getBBox().width; } catch (e) { return 0; } };
  function render() {
    renderControls();
    if (!sh || !sh.frame || !G) return;
    const f = sh.frame, g = sceneGeo(f), W = g.W, yG = g.yG;
    const a = A(), on = onset(), cool = group() === 'cool';
    const dens = a.saturated ? clamp(0.35 + a.water / 1.4, 0.35, 1) : 0;
    const ph = st.s * 40;                                   // 화살표 · 빗방울의 움직임 위상
    clear(E.back); clear(E.dyn); clear(E.fog); clear(E.top);

    /* 장면 */
    const sc = SCENE[st.kind](g, a, on, dens, ph), info = sc.info;
    sa(E.clock, { opacity: st.kind === 'radiation' ? 1 : 0 });
    if (st.kind === 'radiation') { E.clockT.textContent = `🕘 ${info}`; sa(E.clockBg, { width: Math.max(90, (bboxW(E.clockT) || 80) + 24) }); }
    // 공기 덩어리 (기온 · 이슬점 값은 바로 아래 현재 수치 칸에)
    E.parcel.set(sc.px, sc.py, sc.r, a.saturated ? clamp(0.3 + a.water / 2, 0.3, 1) : 0);
    if (sc.fl) lbl(E.top, sc.fl.x, sc.fl.y, sc.fl.t, '#33414E', { 'text-anchor': 'middle', class: 'lb halo-sky' });   // 안개 이름

    /* 그래프 */
    const pts = [];
    const N = Math.max(2, Math.round(st.s * 120));
    for (let i = 0; i <= N; i++) { const b = A(st.s * i / N); pts.push([b.T, b.e]); }
    sa(E.gPath, { d: pts.length > 1 && st.s > 1e-6 ? 'M' + pts.map(p => `${G.gx(p[0]).toFixed(1)} ${G.gy(p[1]).toFixed(1)}`).join(' L') : '' });
    const a0 = A(0);
    sa(E.gStart, { cx: G.gx(a0.T), cy: G.gy(a0.e) });
    const xP = G.gx(a.T), yP = G.gy(a.e);
    sa(E.gPt, { cx: xP, cy: yP });
    sa(E.gPtT, cool || a.saturated ? { x: xP + 12, y: yP - 10 } : { x: xP + 12, y: yP + 18 }); E.gPtT.textContent = a.saturated ? '포화!' : '공기';   // 수증기 증가형은 위쪽에 포화 수증기압 글자가 있어 아래에
    clear(E.gGuide);
    const dash = { stroke: '#4E5D6A', 'stroke-width': 1.6, 'stroke-dasharray': '5 4', fill: 'none' };
    if (cool) {        // 수증기량 그대로 → 왼쪽으로: 곡선에 닿는 기온이 이슬점
      const xd = G.gx(a.Td);
      if (!a.saturated && xP - xd > 30) {       // 수증기량은 그대로 → 왼쪽으로 가서 곡선(이슬점)에 닿음
        arrowLine(E.gGuide, xP - 11, yP, xd + 9, yP, '#C65040', 2.2, '6 4');
        txt({ x: (xP + xd) / 2, y: yP - 9, 'text-anchor': 'middle', class: 'lb-sm halo', fill: '#9C3B2E' }, '← 냉각', E.gGuide);
      }
      s('line', Object.assign({ x1: xd, x2: xd, y1: yP, y2: G.Y0 }, dash, { stroke: 'var(--dew)' }), E.gGuide);
      s('circle', { cx: xd, cy: yP, r: 5, fill: 'var(--dew)', stroke: '#fff', 'stroke-width': 1.5 }, E.gGuide);
      const tdl = txt({ x: xd - 8, y: G.Y0 - 8, 'text-anchor': 'end', class: 'lb-sm halo tnum', fill: 'var(--dew)' }, `이슬점 ${fT(a.Td)} ℃`, E.gGuide);
      { const r1 = tdl.getBBox(), r2 = E.gUnsat.getBBox(); sa(E.gUnsat, { opacity: r1.x + r1.width + 6 > r2.x && r2.x + r2.width + 6 > r1.x ? 0 : 1 }); }   // 좁은 화면: 이슬점 글자와 겹치면 「불포화」 글자를 잠시 숨김
    } else {           // 기온 그대로 → 위로: 곡선에 닿는 수증기압이 포화 수증기압
      sa(E.gUnsat, { opacity: 1 });
      const yE = G.gy(a.E);
      if (!a.saturated && yP - yE > 30) {       // 기온은 그대로 → 위로 가서 곡선(포화 수증기압)에 닿음
        arrowLine(E.gGuide, xP, yP - 11, xP, yE + 9, '#C65040', 2.2, '6 4');
        txt({ x: xP - 10, y: (yP + yE) / 2 + 5, 'text-anchor': 'end', class: 'lb-sm halo', fill: '#9C3B2E' }, '수증기 증가 ↑', E.gGuide);
      }
      if (!a.saturated) {
        s('circle', { cx: xP, cy: yE, r: 5, fill: C_SAT, stroke: '#fff', 'stroke-width': 1.5 }, E.gGuide);
        txt({ x: xP + 10, y: yE - 8, class: 'lb-sm halo tnum', fill: C_SAT }, `포화 수증기압 ${fmt(a.E, 1)} hPa`, E.gGuide);
      }
    }

    /* 수치 */
    ui.ro.set('T', `${fT(a.T)}<small>℃</small>`, info);
    ui.ro.set('Td', `${fT(a.Td)}<small>℃</small>`, a.saturated ? '기온 = 이슬점' : `기온보다 ${fT(a.T - a.Td)} ℃ ↓`);
    ui.ro.set('e', `${fmt(a.e, 1)}<small>hPa</small>`, `포화 ${fmt(a.E, 1)} hPa`);
    ui.ro.set('rh', `${fmt(a.rh, 0)}<small>%</small>`, a.saturated ? '포화' : '불포화');
    ui.ro.set('fog', `<span style="font-size:21px">${a.saturated ? (dens > 0.75 ? '짙은 안개' : '안개 생김') : '없음'}</span>`, a.saturated ? '수증기가 응결' : (cool ? `이슬점까지 ${fT(a.T - a.Td)} ℃` : `포화까지 ${fmt(a.E - a.e, 1)} hPa`));
    renderGuide(a, on);
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
      ? `${{ radiation: '맑은 밤, 지표면이 복사 냉각으로 식으며 지표 부근 공기도 식어요.', advection: a.overCold ? '차가운 해수면 위를 지나며 공기가 아래에서 식어요.' : '따뜻한 바다 위에서는 기온이 거의 그대로예요.', upslope: '산 사면을 따라 올라가며 단열 팽창으로 식어요(1 km에 10 ℃).' }[st.kind]} 기온이 이슬점까지 내려가면 포화돼요.`
      : `${{ steam: a.overWater ? '따뜻한 수면에서 증발한 수증기가 찬 공기 속으로 들어와요.' : '차가운 육지 위에서는 수증기량이 그대로예요.', frontal: '빗방울이 찬 공기층을 지나며 증발해 수증기가 늘어요.' }[st.kind]} 수증기압이 포화 수증기압에 이르면 포화돼요.`);
  }
  function renderControls() {
    if (!ui.play) return;
    const on = onset(), end = st.s >= 1 - 1e-9;
    const t = st.playing ? '⏸ 일시정지' : (end ? '↺ 처음부터 재생' : (st.s > 0 ? '▶ 이어서 재생' : '▶ 재생'));
    if (ui.play.innerHTML !== t) ui.play.innerHTML = t;
    const nxt = stageList().find(v => v > st.s + 1e-9);
    ui.next.disabled = nxt == null;
    const names = STAGE[st.kind];
    const hint = end ? '처음부터 다시 보려면 「↺ 처음부터 재생」을 누르세요.'
      : (nxt != null && on != null && Math.abs(nxt - on) < 1e-9 ? '다음 단계: 안개가 생기기 시작하는 순간' : `다음 단계: 끝 (${names[1]})`);
    if (ui.stepHint.textContent !== hint) ui.stepHint.textContent = hint;
  }

  return {
    L, init, layout, tick, render,
    pause() { pause(); },
    onShow() { layout(); },
    hasFrame: () => !!(sh && sh.frame),
    api: { setS, setKind, setCond, play, step, goStage, resetMotion, resetDefaults, st, state: () => A(), onset: () => onset() }
  };
})();
