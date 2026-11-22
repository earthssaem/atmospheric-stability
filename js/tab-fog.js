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
  // 재생 빠르기: 포화(안개 시작)까지는 길어도 PRE_MAX초 안에 지나가고, 안개가 짙어지는 과정은 적어도 POST_MIN초 동안 보여 준다
  const DUR = 9, PRE_MAX = 3.5, POST_MIN = 3.5, DUR_NONE = 6;   // DUR: 기본 재생 시간(초), DUR_NONE: 안개가 생기지 않는 조건의 재생 시간
  const XR = { min: -5, max: 25, step: 5 }, YR = { min: 0, max: 32, step: 5 };
  const C_SAT = '#2F78B5';
  const L = Object.assign(baseLab(), { id: 'fog' });
  const st = Object.assign({}, DEF, { s: 0, playing: false, notice: '', seen: {} });
  L.st = st;
  let sh, ui = {}, E = {}, G = null, ch = null;
  // 장면의 움직임: tm = 흐른 시간(초, 바람 · 물결 · 빗방울 · 안개의 흐름), vis = 지금 화면에 보이는 안개의 양(0~1, 목표값을 천천히 따라감)
  let tm = 0, vis = 0, idle = 0, cur = null;
  const fogAmount = a => a.saturated ? clamp(0.35 + a.water / 1.4, 0.35, 1) : 0;

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
  /** 재생할 때 1초에 나아가는 진행 정도 */
  function playRate() {
    const on = onset();
    if (on == null) return 1 / DUR_NONE;
    if (on <= 1e-6 || on >= 1 - 1e-6) return 1 / DUR;
    return st.s < on - 1e-9 ? Math.max(1 / DUR, on / PRE_MAX) : Math.min(1 / DUR, (1 - on) / POST_MIN);
  }
  function tick(dt) {
    // 「움직임 줄이기」 설정에서도 재생을 누른 동안에는 비 · 바람 · 안개가 움직인다 (멈춰 있을 때만 정지 그림)
    if (st.playing || !REDUCED_MOTION) tm += dt;
    const tgt = cur ? cur.dens : 0, settling = Math.abs(tgt - vis) >= 1e-3;   // 안개는 갑자기 나타나지 않고 서서히 피어오르고 서서히 걷힌다
    vis = settling ? vis + (tgt - vis) * (1 - Math.exp(-dt / (tgt > vis ? 0.8 : 0.4))) : tgt;
    if (st.playing) {                                    // 처음부터 끝까지 끊지 않고 이어서 재생
      const ns = st.s + dt * playRate();
      if (ns >= 1 - 1e-12) { st.playing = false; setS(1); } else setS(ns);
      return;                                            // setS가 장면까지 다시 그림
    }
    if (REDUCED_MOTION) { if (settling) drawScene(); return; }
    idle += dt;                                          // 멈춰 있을 때도 비 · 바람 · 물결 · 안개는 천천히 움직인다 (초당 30번)
    if (idle >= 1 / 30) { idle = 0; drawScene(); }
  }
  function resetMotion() { pause(); st.s = 0; st.notice = ''; L.emit('reset'); render(); }

  /* ───────── 조건 ───────── */
  function setKind(k) {
    pause();
    st.kind = k; st.s = 0; st.notice = ''; vis = 0;
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
    ui.next = Btn('다음 단계 ▶', '', () => step(1), { title: '처음 → 안개가 생기기 시작한 순간 → 끝 (재생은 멈추지 않고 끝까지 이어져요)' });
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
   * 안개는 가장자리가 투명한 둥근 덩어리(radialGradient) 여러 개를 겹쳐 그린다. 생길 때는 지면 쪽부터 서서히 나타나고,
   * 재생을 멈춰도 바람을 따라 천천히 흐른다(「움직임 줄이기」 설정에서는 멈춘 그림). 모든 그림은 정성적 표현. */
  function sceneGeo(f) { return { W: f.sceneW, yG: f.yOf(0), top: 18, H: f.H, k: clamp(f.sceneW / 520, 0.7, 1.06) }; }   // k: 집 · 나무 크기 배율(좁은 화면에서 작게)
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
  /** 색 번짐(그라데이션): stops = [[위치 0~1, 색, 불투명도]], user = [x1, y1, x2, y2](화면 좌표) 없으면 도형 크기 기준 위 → 아래 */
  function grad(defs, id, stops, user, horiz) {
    const a = user ? { gradientUnits: 'userSpaceOnUse', x1: user[0], y1: user[1], x2: user[2], y2: user[3] } : (horiz ? { x1: 0, y1: 0, x2: 1, y2: 0 } : { x1: 0, y1: 0, x2: 0, y2: 1 });
    const gr = s('linearGradient', Object.assign({ id }, a), defs);
    stops.forEach(([o, c, op]) => s('stop', { offset: o, 'stop-color': c, 'stop-opacity': op == null ? 1 : op }, gr));
    return `url(#${id})`;
  }
  const N1 = v => +v.toFixed(1);
  /** 부드러운 윗선을 가진 땅: pts를 지나는 곡선 아래를 bottom까지 채움 (hi: 윗선에 옅은 빛) */
  function land(parent, pts, bottom, fill, hi, hiOp) {
    const d = smoothLine(pts), a = pts[0], b = pts[pts.length - 1];
    s('path', { d: d + ` L${N1(b[0])} ${bottom} L${N1(a[0])} ${bottom} Z`, fill }, parent);
    if (hi) s('path', { d, fill: 'none', stroke: hi, 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: hiOp == null ? 0.6 : hiOp }, parent);
  }
  /** 능선: x0~x1 사이 봉우리가 여러 개인 산줄기 (아래는 bottom까지 채움) */
  function ridge(parent, x0, x1, yBase, amp, seed, fill, bottom, n, hi, hiOp) {
    const R = rng(seed), pts = [];
    n = n || 9;
    for (let i = 0; i <= n; i++) pts.push([lerp(x0, x1, i / n), yBase - amp * (0.3 + 0.7 * R())]);
    land(parent, pts, bottom, fill, hi, hiOp);
    return pts;
  }
  /** 침엽수: 세 층의 가지, 왼쪽 절반은 밝은 색(빛 받는 쪽) */
  function pine(parent, x, yb, hgt, dark, light, trunk) {
    const w = hgt * 0.4;
    s('rect', { x: N1(x - hgt * 0.035), y: N1(yb - hgt * 0.16), width: N1(hgt * 0.07), height: N1(hgt * 0.17), fill: trunk || '#5A4632' }, parent);
    for (let k = 0; k < 3; k++) {
      const y0 = yb - hgt * (0.1 + k * 0.25), y1 = k === 2 ? yb - hgt : y0 - hgt * 0.44, ww = w * (1 - k * 0.24), sag = ww * 0.24;
      s('path', { d: `M${N1(x - ww)} ${N1(y0)} Q${N1(x)} ${N1(y0 + sag)} ${N1(x + ww)} ${N1(y0)} L${N1(x)} ${N1(y1)} Z`, fill: dark }, parent);
      if (light) s('path', { d: `M${N1(x - ww)} ${N1(y0)} Q${N1(x - ww * 0.5)} ${N1(y0 + sag * 0.75)} ${N1(x)} ${N1(y0 + sag * 0.5)} L${N1(x)} ${N1(y1)} Z`, fill: light }, parent);
    }
  }
  /** 활엽수: 둥근 잎 덩어리 + 빛 받는 쪽 */
  function roundTree(parent, x, yb, hgt, dark, light, trunk) {
    s('path', { d: `M${N1(x - hgt * 0.05)} ${yb} L${N1(x - hgt * 0.03)} ${N1(yb - hgt * 0.5)} L${N1(x + hgt * 0.03)} ${N1(yb - hgt * 0.5)} L${N1(x + hgt * 0.05)} ${yb} Z`, fill: trunk || '#6A5236' }, parent);
    [[0, 0.66, 0.33], [-0.21, 0.52, 0.23], [0.21, 0.54, 0.24]].forEach(([dx, dy, r]) => s('circle', { cx: N1(x + hgt * dx), cy: N1(yb - hgt * dy), r: N1(hgt * r), fill: dark }, parent));
    if (light) [[-0.08, 0.74, 0.2], [-0.24, 0.56, 0.13], [0.13, 0.62, 0.12]].forEach(([dx, dy, r]) => s('circle', { cx: N1(x + hgt * dx), cy: N1(yb - hgt * dy), r: N1(hgt * r), fill: light }, parent));
  }
  /** 잎이 진 나무: 줄기에서 가지가 갈라져 나감 */
  function bareTree(parent, x, yb, hgt, color, seed) {
    const R = rng(seed || 3);
    (function br(x0, y0, ang, len, w, depth) {
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 - Math.sin(ang) * len;
      s('path', { d: `M${N1(x0)} ${N1(y0)} L${N1(x1)} ${N1(y1)}`, stroke: color, 'stroke-width': N1(w), 'stroke-linecap': 'round', fill: 'none' }, parent);
      if (depth > 0) [[-1, 0.5], [1, 0.82], [-0.55, 1]].forEach(([sd, at], i) => { if (i === 2 && depth < 2) return; br(lerp(x0, x1, at), lerp(y0, y1, at), ang + sd * (0.5 + 0.25 * R()), len * (0.56 + 0.1 * R()), w * 0.6, depth - 1); });
    })(x, yb, Math.PI / 2 + (R() - 0.5) * 0.12, hgt * 0.52, hgt * 0.075, 3);
  }
  /** 집: o = { wall, roof, shade(지붕 · 문의 어두운 색), lit(창에 불빛), hip(옆으로 긴 지붕), chimney } */
  function house(parent, x, yb, w, hgt, o) {
    const x0 = x - w / 2, rh = w * (o.hip ? 0.3 : 0.42), ov = w * 0.1, yt = yb - hgt;
    if (o.lit) s('ellipse', { cx: x, cy: N1(yb - hgt * 0.4), rx: N1(w * 1.25), ry: N1(hgt * 1.5), fill: 'url(#fogWin)' }, parent);
    if (o.chimney) s('rect', { x: N1(x + w * 0.2), y: N1(yt - rh * 0.95), width: N1(w * 0.13), height: N1(rh * 0.8), fill: o.shade }, parent);
    s('rect', { x: N1(x0), y: N1(yt), width: N1(w), height: N1(hgt), fill: o.wall }, parent);
    s('rect', { x: N1(x0), y: N1(yt), width: N1(w), height: N1(Math.max(1.5, hgt * 0.12)), fill: '#000', opacity: 0.16 }, parent);            // 처마 그늘
    s('path', { d: o.hip ? `M${N1(x0 - ov)} ${N1(yt)} L${N1(x0 + w * 0.2)} ${N1(yt - rh)} L${N1(x0 + w * 0.8)} ${N1(yt - rh)} L${N1(x0 + w + ov)} ${N1(yt)} Z` : `M${N1(x0 - ov)} ${N1(yt)} L${N1(x)} ${N1(yt - rh)} L${N1(x0 + w + ov)} ${N1(yt)} Z`, fill: o.roof }, parent);
    s('path', { d: `M${N1(x0 - ov)} ${N1(yt)} L${N1(x0 + w + ov)} ${N1(yt)}`, stroke: o.shade, 'stroke-width': 1.6, 'stroke-linecap': 'round' }, parent);
    const win = o.lit ? '#FFD98A' : '#A9C0D2';
    s('rect', { x: N1(x0 + w * 0.13), y: N1(yb - hgt * 0.7), width: N1(w * 0.22), height: N1(hgt * 0.36), fill: win, rx: 1 }, parent);
    s('rect', { x: N1(x0 + w * 0.68), y: N1(yb - hgt * 0.7), width: N1(w * 0.2), height: N1(hgt * 0.36), fill: win, rx: 1 }, parent);
    s('rect', { x: N1(x0 + w * 0.43), y: N1(yb - hgt * 0.56), width: N1(w * 0.16), height: N1(hgt * 0.56), fill: o.shade, rx: 1 }, parent);
  }
  /** 도시 건물: 밝은 앞면 + 그늘진 옆면 + 창문 */
  function building(parent, x, yb, w, hgt, face, side, seed, winOp) {
    const R = rng(seed), sw = w * 0.26;
    s('rect', { x: N1(x), y: N1(yb - hgt), width: N1(w), height: N1(hgt), fill: face }, parent);
    s('rect', { x: N1(x + w - sw), y: N1(yb - hgt), width: N1(sw), height: N1(hgt), fill: side }, parent);
    s('rect', { x: N1(x - 1), y: N1(yb - hgt - 2.5), width: N1(w + 2), height: 3, fill: side }, parent);                                            // 옥상 테두리
    if (R() > 0.45) s('rect', { x: N1(x + w * 0.25), y: N1(yb - hgt - 8), width: N1(w * 0.3), height: 6, fill: side }, parent);                    // 옥탑
    else s('line', { x1: N1(x + w * 0.4), x2: N1(x + w * 0.4), y1: N1(yb - hgt - 2), y2: N1(yb - hgt - 13), stroke: side, 'stroke-width': 1.4 }, parent);
    for (let yy = yb - hgt + 6; yy < yb - 7; yy += 8.5) for (let xx = x + 3.5; xx < x + w - sw - 3; xx += 6.5) s('rect', { x: N1(xx), y: N1(yy), width: 3.6, height: 4.6, fill: R() > 0.8 ? '#FFE7A8' : '#EEF5FA', opacity: winOp == null ? 0.9 : winOp }, parent);
  }
  function lighthouse(parent, x, yb, hgt) {
    const w0 = hgt * 0.15, w1 = hgt * 0.095, yt = yb - hgt * 0.74;
    s('path', { d: `M${N1(x - w0)} ${yb} L${N1(x - w1)} ${N1(yt)} L${N1(x + w1)} ${N1(yt)} L${N1(x + w0)} ${yb} Z`, fill: '#FAFAF7' }, parent);
    s('path', { d: `M${N1(x + w0 * 0.25)} ${yb} L${N1(x + w1 * 0.25)} ${N1(yt)} L${N1(x + w1)} ${N1(yt)} L${N1(x + w0)} ${yb} Z`, fill: '#D5DADF' }, parent);   // 그늘진 쪽
    [0.2, 0.5].forEach(t => { const y0 = lerp(yb, yt, t), y1 = lerp(yb, yt, t + 0.15), a = lerp(w0, w1, t), b = lerp(w0, w1, t + 0.15); s('path', { d: `M${N1(x - a)} ${N1(y0)} L${N1(x - b)} ${N1(y1)} L${N1(x + b)} ${N1(y1)} L${N1(x + a)} ${N1(y0)} Z`, fill: '#C9483B' }, parent); });
    s('rect', { x: N1(x - w1 * 1.5), y: N1(yt - 2.5), width: N1(w1 * 3), height: 2.5, fill: '#56606A' }, parent);                                  // 난간
    s('rect', { x: N1(x - w1 * 0.85), y: N1(yt - hgt * 0.15), width: N1(w1 * 1.7), height: N1(hgt * 0.15 - 2), fill: '#FFE9A6' }, parent);         // 등
    s('path', { d: `M${N1(x - w1 * 1.2)} ${N1(yt - hgt * 0.15)} L${N1(x)} ${N1(yb - hgt)} L${N1(x + w1 * 1.2)} ${N1(yt - hgt * 0.15)} Z`, fill: '#C9483B' }, parent);
  }
  /** 뭉게구름 (밑면 y) */
  function cumulus(parent, cx, y, r, op) {
    return cloudShape(parent, { x0: cx - r * 2.5, y0: y - r * 1.95, x1: cx + r * 2.5, y1: y }, c => {
      c.rect(cx - r * 2, y - r * 0.72, r * 4, r * 0.72, r * 0.36);
      c.circle(cx - r * 1.2, y - r * 0.6, r * 0.6); c.circle(cx - r * 0.35, y - r * 0.98, r * 0.92); c.circle(cx + r * 0.72, y - r * 0.78, r * 0.74); c.circle(cx + r * 1.5, y - r * 0.5, r * 0.5);
    }, op);
  }
  /** 비구름: 윗면은 울퉁불퉁, 아래로 갈수록 어두운 두꺼운 구름 */
  function rainCloud(parent, defs, x0, x1, yTop, yBase) {
    const id = uid('frc'), cp = s('clipPath', { id }, defs), R = rng(31), hgt = yBase - yTop;
    const add = (cx, cy, r) => s('circle', { cx: N1(cx), cy: N1(cy), r: N1(r) }, cp);
    s('rect', { x: N1(x0 + 24), y: N1(yTop + 18), width: N1(x1 - x0), height: N1(Math.max(8, hgt - 30)), rx: 14 }, cp);
    for (let x = x0 + 14; x <= x1 + 24; x += 25) add(x + R() * 8, yTop + 24 + 7 * Math.sin((x - x0) * 0.021), 20 + R() * 13);    // 윗면
    for (let x = x0 + 34; x <= x1 + 20; x += 19) add(x + R() * 6, yBase - 13 - R() * 3, 10 + R() * 5);                               // 밑면
    add(x0 + 16, yTop + hgt * 0.5, hgt * 0.22); add(x0 + 30, yTop + hgt * 0.34, hgt * 0.24); add(x0 + 34, yTop + hgt * 0.7, hgt * 0.17);   // 왼쪽 끝
    const fill = grad(defs, id + 'g', [[0, '#F7F9FB'], [0.4, '#DCE2E8'], [0.75, '#AEB8C3'], [1, '#8792A0']], [0, yTop - 6, 0, yBase]);
    const gg = s('g', { 'clip-path': `url(#${id})` }, parent);
    s('rect', { x: N1(x0 - 40), y: N1(yTop - 40), width: N1(x1 - x0 + 90), height: N1(hgt + 80), fill }, gg);
    for (let i = 0; i < 7; i++) s('ellipse', { cx: N1(lerp(x0, x1, (i + R()) / 7)), cy: N1(yTop + hgt * (0.4 + 0.25 * R())), rx: N1(40 + R() * 34), ry: N1(hgt * 0.2), fill: 'url(#fogPuff)', opacity: 0.55 }, gg);   // 속 덩어리의 밝은 쪽
    return gg;
  }
  /** 풀 포기 */
  function tufts(parent, x0, x1, y, n, color, seed) {
    const R = rng(seed);
    for (let i = 0; i < n; i++) { const x = lerp(x0, x1, (i + R()) / n), hh = 4 + R() * 4; s('path', { d: `M${N1(x - 3)} ${N1(y)} l1.5 ${N1(-hh)} l1.5 ${N1(hh * 0.7)} l1.5 ${N1(-hh * 1.1)} l1.5 ${N1(hh * 1.1)}`, fill: 'none', stroke: color, 'stroke-width': 1.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, parent); }
  }
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const frac = x => x - Math.floor(x);
  /**
   * 안개 띠: 가장자리가 투명한 둥근 덩어리 여러 개가 지면을 따라 바람 방향으로 천천히 흐른다.
   * v(0~1, 보이는 안개의 양)가 커질수록 지면 가까운 덩어리부터 차례로 나타나고, 커지고, 위로 두꺼워진다.
   * o: { x0, x1: 안개가 있는 가로 범위, ground(x): 지면 높이, hgt: 가장 짙을 때 두께, drift: 흐르는 빠르기(px/초), cap(x): 그 자리에서 가능한 최대 두께, soft, seed, alpha }
   */
  function fogBank(parent, o) {
    const v = o.v;
    if (v <= 0.004 || o.x1 <= o.x0) return;
    const D0 = -80, span = sh.frame.sceneW + 160, n = Math.ceil(span / 22), soft = o.soft || 44;
    const under = o.shade ? s('g', null, parent) : null, over = s('g', null, parent);   // 밝은 하늘에서는 아래에 옅은 그늘을 깔아 안개가 또렷이 보이게
    for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) {
      const R = rng(o.seed * 977 + i * 131 + k * 7919);
      const x = D0 + frac((i + R()) / n + (o.drift || 0) * tm * (0.6 + 0.8 * R()) / span) * span;   // 화면 밖에서 돌아 들어옴
      const lvl = k === 0 ? R() * 0.28 : 0.22 + 0.78 * R(), r1 = R(), r2 = R(), r3 = R();              // lvl: 지면(0) ~ 안개 꼭대기(1)
      const a = smooth((v - lvl * 0.55) / 0.3) * smooth((x - o.x0) / soft) * smooth((o.x1 - x) / soft);
      if (a < 0.02) continue;
      let hNow = o.hgt * (0.4 + 0.6 * v);
      if (o.cap) hNow = Math.min(hNow, Math.max(8, o.cap(x)));
      const ry = Math.max(6, hNow * (0.3 + 0.2 * r1)) * (0.6 + 0.4 * a), rx = (36 + 32 * r2) * (0.65 + 0.35 * a);
      const cy = o.ground(x) - hNow * lvl * 0.75 - ry * 0.25 + Math.sin(tm * (0.35 + 0.45 * r3) + r3 * 40) * 2.5;
      if (under) s('ellipse', { cx: x.toFixed(1), cy: (cy + 3).toFixed(1), rx: (rx * 1.12).toFixed(1), ry: (ry * 1.1).toFixed(1), fill: 'url(#fogShade)', opacity: (a * o.shade).toFixed(2) }, under);
      s('ellipse', { cx: x.toFixed(1), cy: cy.toFixed(1), rx: rx.toFixed(1), ry: ry.toFixed(1), fill: 'url(#fogPuff)', opacity: (a * (0.5 + 0.38 * r1) * (o.alpha || 1)).toFixed(2) }, over);
    }
  }
  /** 김처럼 피어오르는 안개: 수면에서 생긴 작은 덩어리가 올라가며 커지고, 바람에 밀리고, 옅어진다 */
  function steamPuffs(parent, x0, x1, yb, hgt, v, lean) {
    if (v <= 0.004 || x1 <= x0) return;
    for (let i = Math.floor(x0 / 20); i * 20 < x1 + 20; i++) {
      const R = rng(i * 53 + 7), xb = i * 20 + R() * 14, period = 2.6 + 2.2 * R(), p0 = R(), hh = hgt * (0.55 + 0.6 * R());
      const win = smooth((xb - x0) / 28) * smooth((x1 - xb) / 28);
      if (win < 0.02) continue;
      for (let j = 0; j < 4; j++) {
        const age = frac(tm / period + p0 + j / 4);
        const a = smooth(age / 0.14) * Math.pow(1 - age, 1.25) * win * v;
        if (a < 0.02) continue;
        const r = 6 + 17 * age;
        s('ellipse', { cx: (xb + lean * age * age + Math.sin(age * 6 + p0 * 9) * 5).toFixed(1), cy: (yb - age * hh).toFixed(1), rx: (r * 0.9).toFixed(1), ry: (r * 1.2).toFixed(1), fill: 'url(#fogPuff)', opacity: Math.min(0.92, a * 1.25).toFixed(2) }, parent);
      }
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
  const valley = g => ({ l: g.W * 0.3, r: g.W * 0.7, hl: x => g.yG - Math.pow(clamp((g.W * 0.3 - x) / (g.W * 0.3), 0, 1), 1.3) * 128, hr: x => g.yG - Math.pow(clamp((x - g.W * 0.7) / (g.W * 0.3), 0, 1), 1.3) * 116 });   // 기슭은 완만하고 위로 갈수록 가파른 언덕

  function buildScene(f) {
    const svg = sh.sceneSvg; clear(svg);
    const g = sceneGeo(f), W = g.W, yG = g.yG, HH = g.H, k = g.k;
    const defs = s('defs', null, svg);
    E.skyG = s('linearGradient', { id: 'fogsky', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    E.sky0 = s('stop', { offset: '0%' }, E.skyG); E.sky1 = s('stop', { offset: '100%' }, E.skyG);
    const puff = s('radialGradient', { id: 'fogPuff' }, defs);          // 안개 덩어리: 가운데는 희고 가장자리로 갈수록 투명
    E.puff = [['0%', 0.95], ['45%', 0.72], ['78%', 0.25], ['100%', 0]].map(([o, op]) => s('stop', { offset: o, 'stop-color': '#FFFFFF', 'stop-opacity': op }, puff));
    const shade = s('radialGradient', { id: 'fogShade' }, defs);
    [['0%', 0.6], ['55%', 0.38], ['100%', 0]].forEach(([o, op]) => s('stop', { offset: o, 'stop-color': '#8FA3B8', 'stop-opacity': op }, shade));
    const glow = s('radialGradient', { id: 'fogSun' }, defs);
    [['0%', '#FFF6D8', 1], ['45%', '#FFE2A0', 0.8], ['100%', '#FFD08A', 0]].forEach(([o, c, op]) => s('stop', { offset: o, 'stop-color': c, 'stop-opacity': op }, glow));
    const moonGlow = s('radialGradient', { id: 'fogMoon' }, defs);
    [['0%', '#DCE6FF', 0.55], ['40%', '#B9C8F0', 0.2], ['100%', '#B9C8F0', 0]].forEach(([o, c, op]) => s('stop', { offset: o, 'stop-color': c, 'stop-opacity': op }, moonGlow));
    const winGlow = s('radialGradient', { id: 'fogWin' }, defs);
    [['0%', '#FFD98A', 0.42], ['100%', '#FFD98A', 0]].forEach(([o, c, op]) => s('stop', { offset: o, 'stop-color': c, 'stop-opacity': op }, winGlow));
    grad(defs, 'fogHeat', [[0, '#FF9A63'], [1, '#F0834B', 0.25]]);                                         // 복사 화살표: 아래로 갈수록 옅게
    grad(defs, 'fogVap', [[0, '#8CC4E0'], [1, '#8CC4E0', 0.2]]);
    s('rect', { x: 0, y: 0, width: W, height: HH, fill: 'url(#fogsky)' }, svg);
    E.back = s('g', null, svg);      // 하늘: 별 · 달 · 해 · 구름 (매 순간)
    E.stat = s('g', null, svg);      // 풍경 (조건이 바뀔 때만)
    E.dyn = s('g', null, svg);       // 화살표 · 빗방울 · 물결 (매 순간)
    E.fog = s('g', null, svg);       // 안개 (매 순간)
    E.top = s('g', null, svg);       // 안개 위에 보여야 할 이름표 (매 순간)
    E.parcel = makeParcel(svg, { seed: 23 });
    E.clock = s('g', null, svg);
    E.clockBg = s('rect', { x: 10, y: 24, rx: 9, height: 28, fill: 'rgba(20,30,50,.55)' }, E.clock);
    E.clockT = txt({ x: 22, y: 43, class: 'lb', fill: '#F4F6FA' }, '', E.clock);
    E.clockLast = null;
    const S0 = E.stat;
    const haze = (id, color, op, hgt) => s('rect', { x: 0, y: yG - hgt, width: W, height: hgt, fill: grad(defs, id, [[0, color, 0], [1, color, op]], [0, yG - hgt, 0, yG]) }, S0);   // 지평선 가까이의 옅은 빛
    if (st.kind === 'radiation') {
      /* 맑은 밤의 골짜기 마을: 겹겹의 먼 산 · 양쪽 언덕 · 불 켜진 집 */
      const v = valley(g);
      const r1 = clamp((yG - g.top) * 0.46, 150, 250), r2 = clamp((yG - g.top) * 0.32, 104, 170);          // 세로로 긴 화면에서는 산도 높게
      ridge(S0, -10, W + 10, yG - r1, 74, 4, grad(defs, 'fgR1', [[0, '#25376A'], [1, '#33497E']], [0, yG - r1 - 78, 0, yG - 40]), HH, 8);
      ridge(S0, -10, W + 10, yG - r2, 46, 9, grad(defs, 'fgR2', [[0, '#1B2A52'], [1, '#2C4172']], [0, yG - r2 - 56, 0, yG - 10]), HH, 10);
      haze('fgRh', '#7C93C4', 0.3, 64);
      const hillL = [], hillR = [];
      for (let i = 0; i <= 14; i++) { const x = v.l * i / 14; hillL.push([x, v.hl(x)]); }
      for (let i = 0; i <= 14; i++) { const x = v.r + (W - v.r) * i / 14; hillR.push([x, v.hr(x)]); }
      const hillFill = grad(defs, 'fgHill', [[0, '#34513F'], [1, '#22362A']], [0, yG - 130, 0, yG + 10]);
      s('path', { d: P2([[0, HH], ...hillL, [v.l, HH]]) + ' Z', fill: hillFill }, S0);
      s('path', { d: P2([[v.r, HH], ...hillR, [W, HH]]) + ' Z', fill: hillFill }, S0);
      s('path', { d: P2(hillL), fill: 'none', stroke: '#6F9A84', 'stroke-width': 1.6, opacity: 0.45 }, S0);     // 달빛 받는 능선
      s('path', { d: P2(hillR), fill: 'none', stroke: '#6F9A84', 'stroke-width': 1.6, opacity: 0.3 }, S0);
      s('rect', { x: 0, y: yG, width: W, height: HH - yG, fill: grad(defs, 'fgField', [[0, '#35543F'], [1, '#20342A']]) }, S0);                                        // 골짜기 바닥(들판)
      s('path', { d: `M0 ${yG} L${W} ${yG}`, stroke: '#4E7560', 'stroke-width': 1.4, opacity: 0.6 }, S0);
      for (let i = 0; i < 5; i++) { const x = W * (0.33 + 0.085 * i); s('path', { d: `M${N1(x)} ${yG + 8} L${N1(x - 26 + i * 13)} ${HH}`, stroke: '#4B6E57', 'stroke-width': 1, opacity: 0.28 }, S0); }   // 밭고랑
      s('path', { d: `M${N1(W * 0.52)} ${yG + 3} C${N1(W * 0.49)} ${yG + 16} ${N1(W * 0.57)} ${yG + 24} ${N1(W * 0.53)} ${yG + 38} S${N1(W * 0.5)} ${HH - 4} ${N1(W * 0.56)} ${HH}`, fill: 'none', stroke: '#7D95B5', 'stroke-width': 5 * k, 'stroke-linecap': 'round', opacity: 0.55 }, S0);   // 달빛 비치는 개울
      // 언덕의 나무: 뒤쪽은 작고 어둡게, 앞쪽은 크게
      [[0.03, 0.55, 14], [0.08, 0.62, 6], [0.13, 0.7, 12], [0.19, 0.78, 4], [0.245, 0.72, 9], [0.76, 0.7, 8], [0.81, 0.78, 3], [0.87, 0.72, 12], [0.92, 0.64, 5], [0.97, 0.56, 13]].forEach(([tx, kk, dy]) => { const x = W * tx; pine(S0, x, (x < W / 2 ? v.hl(x) : v.hr(x)) + dy, 38 * kk * k, '#17291F', '#27402F', '#1E1E18'); });
      [[0.295, 22], [0.455, 17], [0.705, 23]].forEach(([tx, hh]) => roundTree(S0, W * tx, yG + 3, hh * k, '#1B2F24', '#2A4432', '#1E1E18'));
      // 마을: 불 켜진 창
      const HS = { wall: '#46536A', roof: '#27324A', shade: '#1B2436', lit: true };
      [[0.325, 21, 15, 0], [0.373, 26, 19, 2], [0.628, 27, 18, 1], [0.678, 20, 15, 0]].forEach(([tx, w, hh, kind]) => house(S0, W * tx, yG + 3, w * k, hh * k, Object.assign({}, HS, { hip: kind === 1, chimney: kind === 2 })));
      tufts(S0, 0, W, HH - 1, Math.round(W / 34), '#1A2B22', 12);
    } else if (st.kind === 'advection') {
      /* 따뜻한 바다 → 차가운 바다 → 해안 도시 */
      const xs = X('advection', 0.35), xc = W * 0.8, yL = yG - 9;
      haze('fgAh', '#FFFFFF', 0.55, 90);
      // 먼 곶과 뒷산
      land(S0, [[xc - 46, yG], [xc - 20, yG - 22 * k], [xc + W * 0.05, yG - 52 * k], [xc + W * 0.11, yG - 46 * k], [W + 10, yG - 74 * k]], yG, grad(defs, 'fgAhill', [[0, '#8FB08B'], [1, '#7FA286']], [0, yG - 80 * k, 0, yG]), '#B8D2B0', 0.7);
      // 도시: 뒷줄은 옅게, 앞줄은 또렷하게
      [[0.845, 15, 78, 1], [0.895, 17, 100, 2], [0.945, 15, 84, 3]].forEach(([tx, w, hh, sd]) => building(S0, W * tx, yL, w * k, hh * k, '#C9D6E0', '#B4C3D0', sd, 0.5));
      [[0.825, 16, 52, 4], [0.865, 18, 72, 5], [0.915, 16, 58, 6], [0.955, 20, 90, 7]].forEach(([tx, w, hh, sd]) => building(S0, W * tx, yL, w * k, hh * k, '#E6EDF2', '#C3CED8', sd));
      [0.812, 0.9, 0.985].forEach(tx => roundTree(S0, W * tx, yL + 1, 15 * k, '#5E8A5A', '#7DA873'));
      // 모래사장: 물속으로 완만하게 이어짐
      const bed = `C${N1(xc - 8)} ${yG + 7} ${N1(xc - 34)} ${yG + 26} ${N1(xc - 78)} ${HH}`;                 // 물속으로 이어지는 모래 비탈
      s('path', { d: `M${N1(xc - 80)} ${HH} L${N1(xc - 40)} ${yG + 20} L${N1(xc + 6)} ${yG - 3} Q${N1(xc + 30)} ${yL} ${W} ${yL} L${W} ${HH} Z`, fill: grad(defs, 'fgSand', [[0, '#EBDDB6'], [1, '#D6C08E']]) }, S0);
      // 바다: 따뜻한 쪽(청록)에서 차가운 쪽(짙은 파랑)으로
      const sea = grad(defs, 'fogsea', [[0, '#49ADA2'], [xs / xc, '#41A09B'], [Math.min(0.98, xs / xc + 0.16), '#2B6EA2'], [1, '#225C8E']], [0, 0, xc, 0]);
      const seaD = `M0 ${yG} L${N1(xc + 5)} ${yG} ${bed} L0 ${HH} Z`;
      s('path', { d: seaD, fill: sea }, S0);
      s('path', { d: seaD, fill: grad(defs, 'fgDeep', [[0, '#0B2A4A', 0], [1, '#0B2A4A', 0.38]]) }, S0);                                           // 깊을수록 어둡게
      s('path', { d: `M0 ${yG + 0.8} L${N1(xc + 3)} ${yG + 0.8}`, stroke: '#EAF8F8', 'stroke-width': 1.8, opacity: 0.75 }, S0);                    // 수면의 밝은 선
      s('path', { d: `M${N1(xc - 12)} ${yG + 4} q6 -4 12 -3 t10 -3`, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.8 }, S0);   // 밀려온 물결
      lighthouse(S0, xc + 14 * k, yG - 5, 50 * k);
      lbl(S0, xs / 2, yG + 26, '따뜻한 바다', '#FFFFFF', { 'text-anchor': 'middle', class: 'lb-sm', stroke: 'none' });
      lbl(S0, (xs + xc) / 2, yG + 26, '차가운 바다', '#FFFFFF', { 'text-anchor': 'middle', class: 'lb-sm', stroke: 'none' });
    } else if (st.kind === 'upslope') {
      /* 산 사면: 겹겹의 먼 산줄기 · 빛 받는 사면과 그늘진 뒤쪽 */
      const geo = slopeGeo(g), sky = yG - g.top, peak = [geo.x1, geo.yZ(st.M)];
      ridge(S0, -10, W + 10, yG - sky * 0.6, 48, 6, grad(defs, 'fgU1', [[0, '#A9BDD2'], [1, '#D5E2EC']], [0, yG - sky * 0.75, 0, yG]), HH, 7, '#C7D6E4', 0.9);     // 먼 산줄기
      ridge(S0, -10, W + 10, yG - sky * 0.36, 44, 21, grad(defs, 'fgU2', [[0, '#92ADBE'], [1, '#C4D7DF']], [0, yG - sky * 0.5, 0, yG]), HH, 9, '#B3C8D4', 0.9);
      haze('fgUh', '#FFFFFF', 0.5, 80);
      const leeY = lerp(peak[1], yG, 0.75), rr = 9;                                      // 꼭대기는 둥글게
      const ux = (geo.x1 - geo.x0) / Math.hypot(geo.x1 - geo.x0, yG - peak[1]), uy = (yG - peak[1]) / Math.hypot(geo.x1 - geo.x0, yG - peak[1]);
      const lx = (W - geo.x1) / Math.hypot(W - geo.x1, leeY - peak[1]), ly = (leeY - peak[1]) / Math.hypot(W - geo.x1, leeY - peak[1]);
      const pA = [peak[0] - ux * rr, peak[1] + uy * rr], pB = [peak[0] + lx * rr, peak[1] + ly * rr];
      const body = `M0 ${HH} L0 ${yG} L${N1(geo.x0)} ${yG} L${N1(pA[0])} ${N1(pA[1])} Q${N1(peak[0])} ${N1(peak[1])} ${N1(pB[0])} ${N1(pB[1])} L${W} ${N1(leeY)} L${W} ${HH} Z`;
      s('path', { d: body, fill: grad(defs, 'fgUm', [[0, '#86A873'], [0.6, '#74975F'], [1, '#668A55']], [0, peak[1], 0, yG]) }, S0);
      s('path', { d: `M${N1(pA[0])} ${N1(pA[1])} Q${N1(peak[0])} ${N1(peak[1])} ${N1(pB[0])} ${N1(pB[1])} L${W} ${N1(leeY)} L${W} ${HH} L${N1(peak[0] + 26)} ${HH} L${N1(peak[0] - 6)} ${N1(peak[1] + 40)} Z`, fill: '#4F7350', opacity: 0.6 }, S0);   // 그늘진 뒤쪽 사면
      const cid = uid('fum'); s('path', { d: body }, s('clipPath', { id: cid }, defs));
      const tex = s('g', { 'clip-path': `url(#${cid})` }, S0);
      s('path', { d: `M${N1(geo.x0)} ${yG} L${N1(pA[0])} ${N1(pA[1])} Q${N1(peak[0])} ${N1(peak[1])} ${N1(pB[0])} ${N1(pB[1])}`, fill: 'none', stroke: '#B5D09E', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.75 }, S0);   // 빛 받는 능선
      s('rect', { x: 0, y: yG, width: W, height: HH - yG, fill: grad(defs, 'fgUg', [[0, '#7FA468'], [1, '#5F8650']]) }, tex);
      s('path', { d: `M0 ${yG} L${N1(geo.x0 + 6)} ${yG}`, stroke: '#B5D09E', 'stroke-width': 1.6, opacity: 0.7 }, S0);
      // 사면의 나무: 아래 줄(작고 어둡게) → 사면 위 줄
      for (let i = 0; i < 8; i++) { const tt = (i + 0.9) / 9.4, x = lerp(geo.x0, geo.x1, tt) + 14, y = lerp(yG, peak[1], tt) + 26 + 5 * (i % 2); pine(tex, x, y, (17 + 6 * (1 - tt)) * k, '#3B6340', '#4F7B50'); }
      for (let i = 1; i <= 9; i++) { const tt = i / 10, x = lerp(geo.x0, geo.x1, tt), y = lerp(yG, peak[1], tt); pine(S0, x - 6, y + 4, (22 + 9 * (1 - tt) + (i % 2) * 3) * k, '#2B5534', '#44794A'); }
      // 산기슭 마을
      [[0.03, 27], [0.085, 31]].forEach(([tx, hh]) => roundTree(S0, W * tx, yG + 3, hh * k, '#4A7741', '#6C9A58'));
      house(S0, W * 0.15, yG + 2, 24 * k, 16 * k, { wall: '#F1E6D3', roof: '#B5573F', shade: '#8C3F2D', chimney: true });
      tufts(S0, 0, geo.x0, yG + 22, 5, '#53784A', 5); tufts(S0, 0, W, HH - 2, Math.round(W / 40), '#4D7446', 8);
      const H = A(1).H;
      if (H <= geo.zTop) {
        s('line', { x1: 0, x2: W, y1: geo.yZ(H), y2: geo.yZ(H), stroke: 'var(--lcl)', 'stroke-width': 2, 'stroke-dasharray': '12 5 3 5' }, S0);
        const yl = geo.yZ(H) - 7, clash = yl > yG - 96 && yl < yG - 30;                 // 왼쪽 글자(단열 팽창 · 바람)와 겹치면 오른쪽 끝에
        lbl(S0, clash ? W - 8 : 8, yl, '상승 응결 고도', '#7A4E10', { class: 'lb-sm halo-sky', 'text-anchor': clash ? 'end' : 'start' });
      }
    } else if (st.kind === 'steam') {
      /* 늦가을 이른 아침의 호수: 서리 내린 땅 · 건너편 숲 · 따뜻한 수면 */
      const xw = X('steam', 0.3), sx = W * 0.84, sy = yG - 118;
      s('circle', { cx: sx, cy: sy, r: 52, fill: 'url(#fogSun)', opacity: 0.85 }, S0);
      s('circle', { cx: sx, cy: sy, r: 13, fill: '#FFF4D6' }, S0);
      [[0.3, 172, 70, 0.5], [0.62, 150, 52, 0.42], [0.16, 132, 40, 0.34]].forEach(([tx, dy, w, op]) => { s('ellipse', { cx: W * tx, cy: yG - dy, rx: w * k, ry: 4.5, fill: '#FFFFFF', opacity: op }, S0); s('ellipse', { cx: W * tx + 22 * k, cy: yG - dy + 6, rx: w * k * 0.7, ry: 3.5, fill: '#FFFFFF', opacity: op * 0.8 }, S0); });   // 옅은 구름 띠
      ridge(S0, -10, W + 10, yG - 70, 28, 14, grad(defs, 'fgS1', [[0, '#A9B8C2'], [1, '#D2DBDF']], [0, yG - 104, 0, yG - 20]), HH, 7, '#C4D0D7', 0.8);                // 먼 산
      ridge(S0, -10, W + 10, yG - 46, 16, 8, grad(defs, 'fgS2', [[0, '#72877F'], [1, '#93A49B']], [0, yG - 66, 0, yG]), HH, 12);                                     // 건너편 숲 언덕
      for (let i = 0; i < 20; i++) { const R = rng(i * 7 + 2), x = lerp(xw - 20, W + 6, (i + R() * 0.7) / 20); pine(S0, x, yG - 26 + R() * 14, (17 + R() * 11) * k, '#53685F', '#687D72', '#4C5A52'); }
      for (let i = 0; i < 12; i++) { const R = rng(i * 13 + 5), x = lerp(xw + 6, W + 6, (i + R() * 0.8) / 12); pine(S0, x, yG - 6 + R() * 5, (20 + R() * 10) * k, '#43584F', '#5A7065', '#3F4C45'); }
      haze('fgSh', '#F6F1EA', 0.6, 46);                                                                                                                              // 수면 위 옅은 빛
      // 호수
      s('rect', { x: xw, y: yG, width: W - xw, height: HH - yG, fill: grad(defs, 'foglake', [[0, '#5AA2C2'], [0.5, '#3C83A8'], [1, '#2A688C']]) }, S0);
      s('path', { d: `M${N1(xw)} ${yG + 0.8} L${W} ${yG + 0.8}`, stroke: '#DDF0F7', 'stroke-width': 1.8, opacity: 0.8 }, S0);
      for (let i = 0; i < 5; i++) { const y = yG + 7 + i * 8, hw = 16 - i * 2.2; s('line', { x1: N1(sx - hw), x2: N1(sx + hw), y1: y, y2: y, stroke: '#FFE9B8', 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: 0.75 - i * 0.12 }, S0); }   // 물에 비친 햇빛
      for (let i = 0; i < 6; i++) { const R = rng(i + 40), x = lerp(xw + 20, W - 50, R()), y = yG + 12 + R() * (HH - yG - 22); s('line', { x1: N1(x), x2: N1(x + 20 + R() * 22), y1: N1(y), y2: N1(y), stroke: '#A9D6E8', 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: 0.5 }, S0); }
      // 서리 내린 땅
      s('path', { d: `M0 ${HH} L0 ${yG - 12} C${N1(xw * 0.35)} ${yG - 16} ${N1(xw * 0.7)} ${yG - 7} ${N1(xw - 4)} ${yG - 3} Q${N1(xw + 8)} ${yG - 1} ${N1(xw + 9)} ${yG + 8} L${N1(xw + 4)} ${HH} Z`, fill: grad(defs, 'fgSnow', [[0, '#F7FAFC'], [1, '#CBD8E2']]) }, S0);
      s('path', { d: `M0 ${yG + 14} C${N1(xw * 0.4)} ${yG + 6} ${N1(xw * 0.7)} ${yG + 22} ${N1(xw + 5)} ${yG + 16}`, fill: 'none', stroke: '#B9C9D6', 'stroke-width': 2, opacity: 0.6 }, S0);
      [[0.105, 46, 3], [0.175, 34, 7], [0.24, 42, 11]].forEach(([tx, hh, sd]) => bareTree(S0, W * tx, yG - 9, hh * k, '#6B5F55', sd));
      tufts(S0, 4, xw - 14, yG - 5, 5, '#A9977D', 9);
      // 선착장과 나룻배
      s('rect', { x: N1(xw + 2), y: yG - 6, width: N1(64 * k), height: 4, rx: 1, fill: '#9A7850' }, S0);
      s('rect', { x: N1(xw + 2), y: yG - 2.5, width: N1(64 * k), height: 1.5, fill: '#6E5338' }, S0);
      [0.2, 0.58, 0.94].forEach(tt => s('rect', { x: N1(xw + 2 + 64 * k * tt - 1.5), y: yG - 7, width: 3, height: 22, fill: '#6E5338' }, S0));
      const bx = xw + 64 * k + 22 * k;
      s('path', { d: `M${N1(bx - 17 * k)} ${yG - 5} Q${N1(bx)} ${yG + 9} ${N1(bx + 19 * k)} ${yG - 6} Z`, fill: '#8A5A3C' }, S0);
      s('path', { d: `M${N1(bx - 17 * k)} ${yG - 5} L${N1(bx + 19 * k)} ${yG - 6}`, stroke: '#C99A6A', 'stroke-width': 1.8, 'stroke-linecap': 'round' }, S0);
      lbl(S0, (xw + W) / 2, yG + 30, '따뜻한 수면', '#FFFFFF', { 'text-anchor': 'middle', class: 'lb-sm tnum', stroke: 'none' });
    } else {   // frontal
      /* 전선면: 위쪽 따뜻한 공기 · 아래쪽 찬 공기, 비구름과 비 내리는 마을 */
      const fr = frontGeo(g);
      s('path', { d: P2([[0, 0], [W, 0], [W, fr.yR], [fr.x0, yG], [0, yG]]) + ' Z', fill: grad(defs, 'fgFw', [[0, '#F6D2B4', 0.75], [1, '#F3DCC9', 0.35]], [0, 0, W, 0]) }, S0);   // 따뜻한 공기
      s('path', { d: P2([[fr.x0, yG], [W, fr.yR], [W, yG]]) + ' Z', fill: grad(defs, 'fgFc', [[0, '#D3E3F1', 0.85], [1, '#AFCBE6', 0.95]], [0, fr.yR, 0, yG]) }, S0);              // 찬 공기
      const cx0 = W * 0.34;
      rainCloud(S0, defs, cx0 - 22, W + 14, g.top + 6, fr.yR - 4);
      lbl(S0, cx0 + 20, g.top + 64, '비구름', '#55606A', { class: 'lb-sm' });
      s('line', { x1: fr.x0, y1: yG, x2: W, y2: fr.yR, stroke: '#B8523B', 'stroke-width': 3.2, 'stroke-linecap': 'round' }, S0);
      for (let i = 1; i <= 5; i++) { const tt = i / 6, x = lerp(fr.x0, W, tt), y = lerp(yG, fr.yR, tt); s('path', { d: 'M-7.5 0 A7.5 7.5 0 0 0 7.5 0 Z', fill: '#B8523B', transform: `translate(${N1(x)} ${N1(y)}) rotate(${N1(fr.ang)})` }, S0); }   // 온난 전선 기호(반원)
      const lx = lerp(fr.x0, W, 0.3), ly = fr.yAt(lx) - 12;
      lbl(S0, lx, ly, '전선면', '#8A3A28', { transform: `rotate(${fr.ang} ${lx} ${ly})` });
      // 비에 젖은 들판과 마을
      s('rect', { x: 0, y: yG, width: W, height: HH - yG, fill: grad(defs, 'fgFg', [[0, '#93AA86'], [1, '#748E6C']]) }, S0);
      s('path', { d: `M0 ${yG} L${W} ${yG}`, stroke: '#B4C7A6', 'stroke-width': 1.5, opacity: 0.7 }, S0);
      [[0.3, 0.6, 26], [0.52, 0.8, 30], [0.12, 0.34, 22]].forEach(([a0, a1, w], i) => s('path', { d: `M${N1(W * a0)} ${yG + 16 + i * 12} q${N1(W * (a1 - a0) / 2)} ${-5 + i * 3} ${N1(W * (a1 - a0))} 0`, fill: 'none', stroke: '#829B78', 'stroke-width': 1.3, opacity: 0.8 }, S0));   // 밭두렁
      [[0.44, 26, '#52754B', '#6B9160'], [0.725, 32, '#52754B', '#6B9160'], [0.785, 25, '#4A6D45', '#63895A'], [0.955, 30, '#52754B', '#6B9160']].forEach(([tx, hh, c1, c2]) => roundTree(S0, W * tx, yG + 3, hh * k, c1, c2));
      [[0.5, 23, 16, 0, '#EDE4D5', '#A45C45', '#7C4334'], [0.575, 28, 19, 1, '#E0D6C4', '#6E7F8E', '#4E5D6A'], [0.86, 25, 17, 2, '#EAE0CF', '#A45C45', '#7C4334']].forEach(([tx, w, hh, kind, wall, roof, sh2]) => house(S0, W * tx, yG + 2, w * k, hh * k, { wall, roof, shade: sh2, hip: kind === 1, chimney: kind === 2 }));
      tufts(S0, 0, W, HH - 2, Math.round(W / 40), '#617C5A', 4);
      lbl(S0, W - 8, fr.yR + (yG - fr.yR) * 0.42, '찬 공기', '#1F5A88', { 'text-anchor': 'end' });
    }
  }

  /* 안개마다 매 순간 그리는 부분: 공기 위치 { px, py, r, info }를 돌려줌
   * dens = 지금 상태의 안개 양(글자 위치 등), v = 화면에 보이는 안개 양(서서히 따라감), tm = 흐른 시간(초) */
  const fogTint = c => E.puff.forEach(x => x.setAttribute('stop-color', c));
  const SCENE = {
    radiation(g, a, on, dens, v) {
      const W = g.W, yG = g.yG, vl = valley(g);
      const dawn = clamp((st.s - 0.8) / 0.2, 0, 1), cloudy = st.sky !== 'clear';
      sa(E.sky0, { 'stop-color': mixColor(cloudy ? '#232C3C' : '#111B33', '#56688F', dawn) }); sa(E.sky1, { 'stop-color': mixColor(cloudy ? '#3A4556' : '#2C3F66', '#F0C79E', dawn) });
      if (dawn > 0) s('circle', { cx: W * 0.82, cy: yG - clamp((yG - g.top) * 0.46, 150, 250), r: 70, fill: 'url(#fogSun)', opacity: dawn * 0.9 }, E.back);   // 먼 산 뒤로 밝아 오는 하늘
      if (!cloudy) {
        const R = rng(5);
        for (let i = 0; i < 40; i++) { const tw = 0.6 + 0.4 * Math.sin(tm * 1.6 + i * 1.7); s('circle', { cx: R() * W, cy: g.top + R() * (yG - g.top) * 0.5, r: 0.7 + R() * 1.2, fill: '#fff', opacity: ((0.45 + R() * 0.55) * tw * (1 - dawn)).toFixed(2) }, E.back); }
        const mx = W * 0.16, my = g.top + 42, mr = 15;
        s('circle', { cx: mx, cy: my, r: mr * 4.2, fill: 'url(#fogMoon)', opacity: (1 - 0.8 * dawn).toFixed(2) }, E.back);
        s('path', { d: `M${N1(mx + mr * 0.2)} ${N1(my - mr)} A${mr} ${mr} 0 1 0 ${N1(mx + mr * 0.95)} ${N1(my + mr * 0.45)} A${N1(mr * 0.82)} ${N1(mr * 0.82)} 0 1 1 ${N1(mx + mr * 0.2)} ${N1(my - mr)} Z`, fill: '#F6F1D6', opacity: (0.96 - 0.7 * dawn).toFixed(2) }, E.back);   // 초승달
      } else {
        const dx = Math.sin(tm * 0.12) * 8;
        cloudShape(E.back, { x0: -30, y0: g.top - 20, x1: W + 30, y1: g.top + 76 }, c => { c.rect(-30, g.top + 24, W + 60, 34, 14); for (let i = -1; i <= 10; i++) { c.circle(W * i / 9 + dx, g.top + 26, 24 + ((i + 3) % 3) * 7); c.circle(W * (i + 0.5) / 9 + dx, g.top + 56, 13 + ((i + 4) % 3) * 4); } }, 0.82);
      }
      // 지표 복사: 맑으면 우주로 빠져나가고, 흐리면 구름이 다시 지표로 돌려보냄
      const xs = [0.12, 0.27, 0.42, 0.58, 0.73, 0.88];
      xs.forEach((t, i) => {
        const x = W * t, y0 = (x < vl.l ? vl.hl(x) : x > vl.r ? vl.hr(x) : yG) - 8;
        const len = cloudy ? Math.max(30, y0 - g.top - 76) : (y0 - g.top) * 0.55;
        wavyUp(E.dyn, x, y0, len, '#F08A55', i - tm * 2.4, 2.3);
        if (cloudy) arrowLine(E.dyn, x + 14, g.top + 74, x + 14, g.top + 112, '#F0A67E', 2, '4 3');
      });
      lbl(E.dyn, W * 0.5, g.top + (cloudy ? 92 : 70), cloudy ? '구름이 열을 되돌려 보내요' : '지표면 복사 냉각', cloudy ? '#FFD9C2' : '#FFC9A8', { 'text-anchor': 'middle', class: 'lb-sm', stroke: 'rgba(17,27,51,.85)', 'stroke-width': 4, 'paint-order': 'stroke' });
      if (st.wind === 'windy') {
        for (let i = 0; i < 3; i++) { const cx = ((tm * 46 + i * 160) % (W + 160)) - 80, cy = yG - 50 - i * 24; curveArrow(E.dyn, [[cx - 40, cy + 8], [cx - 10, cy - 10], [cx + 20, cy + 6], [cx + 46, cy - 6]], '#E3ECF6', 2.6, 0.85); }
        lbl(E.dyn, W * 0.5, yG - 126, '바람이 공기를 섞어요', '#E3ECF6', { 'text-anchor': 'middle', class: 'lb-sm', stroke: 'rgba(17,27,51,.85)', 'stroke-width': 4, 'paint-order': 'stroke' });
      }
      // 골짜기 바닥에서 얇게 깔리기 시작해 옆으로, 위로 번지는 안개 (밤에는 푸르스름하고 동틀 무렵 희어짐)
      fogTint(mixColor('#CDD8EA', '#FFFFFF', dawn));
      fogBank(E.fog, { v, x0: W * (0.28 - 0.3 * v), x1: W * (0.72 + 0.3 * v), ground: () => yG + 12, hgt: 100, drift: 4, soft: 64, seed: 3 });
      return { px: W * 0.5, py: yG - 26, r: 15, info: hourText(st.s), fl: dens > 0 ? { x: W * 0.5, y: yG - 34 - 64 * dens, t: '복사 안개' } : null };
    },
    advection(g, a, on, dens, v) {
      const W = g.W, yG = g.yG, xc = W * 0.8;
      sa(E.sky0, { 'stop-color': '#9DCBEA' }); sa(E.sky1, { 'stop-color': '#E8F3FA' });
      s('circle', { cx: W * 0.1, cy: g.top + 40, r: 46, fill: 'url(#fogSun)', opacity: 0.9 }, E.back);
      s('circle', { cx: W * 0.1, cy: g.top + 40, r: 15, fill: '#FFF3C4' }, E.back);
      [[0.44, 66, 21], [0.72, 44, 15], [0.93, 84, 11]].forEach(([t, y, r], i) => cumulus(E.back, W * t + Math.sin(tm * 0.1 + i * 2) * 10, g.top + y, r * g.k, 0.96));
      [[0.3, 96], [0.34, 106], [0.6, 88]].forEach(([t, y], i) => { const x = W * t + Math.sin(tm * 0.25 + i) * 8, yy = g.top + y + Math.sin(tm * 0.6 + i * 2) * 2, fl = 2 + Math.sin(tm * 5 + i * 1.3) * 1.6; s('path', { d: `M${N1(x - 6)} ${N1(yy - fl)} Q${N1(x - 3)} ${N1(yy - fl - 2)} ${N1(x)} ${N1(yy)} Q${N1(x + 3)} ${N1(yy - fl - 2)} ${N1(x + 6)} ${N1(yy - fl)}`, fill: 'none', stroke: '#6E7F8E', 'stroke-width': 1.4, 'stroke-linecap': 'round' }, E.back); });   // 갈매기
      waves(E.dyn, 6, xc - 6, yG + 10, '#E8F6F5', tm * 0.9, 40); waves(E.dyn, 26, xc - 64, yG + 40, '#DDEFF5', tm * 0.6, 46);
      const px = X('advection', a.x), py = yG - 30;
      // 남쪽 따뜻한 바다에서 불어오는 온난 습윤한 공기
      const wy = yG - 120;
      curveArrow(E.dyn, [[W * 0.03, wy + 10], [W * 0.18, wy - 8], [W * 0.34, wy + 4], [W * 0.46, wy - 4]], '#D0563F', 5);
      lbl(E.dyn, W * 0.03, wy - 22, '온난 습윤한 공기 →', '#9C3B2E');
      for (let i = 0; i < 4; i++) { const u = frac(tm * 0.16 + i / 4), x = W * (0.05 + 0.34 * u); s('path', { d: `M${x.toFixed(1)} ${wy + 20} q4 7 0 10 q-4 -3 0 -10 Z`, fill: '#6AA9D8', opacity: Math.sin(Math.PI * u).toFixed(2) }, E.dyn); }   // 바람에 실려 오는 수증기
      if (a.overCold) {
        for (let i = -1; i <= 1; i++) arrowLine(E.dyn, px + i * 14, py + 18, px + i * 14, yG - 3, '#2F6E9E', 2);
        lbl(E.dyn, px + 30, yG - 8, '냉각', '#1F5A88', { class: 'lb-sm halo-sky' });
      }
      let fl = null;
      fogTint('#FFFFFF');
      if (on != null) {   // 찬 바다 위에서 생긴 안개가 바람을 따라 해안으로 밀려감
        const x0 = X('advection', on) - 60, x1 = Math.min(W + 80, px + 64 + Math.max(0, st.s - on) * W * 0.55);
        fogBank(E.fog, { v, x0, x1, ground: () => yG + 10, hgt: 104, drift: 18, soft: 50, seed: 7, shade: 0.5 });
        if (st.s >= on) fl = { x: Math.min((x0 + x1) / 2, W * 0.7), y: yG - 40 - 50 * dens, t: '이류 안개' };
      }
      return { px, py, r: 15, info: a.overCold ? '차가운 해수면 위' : '따뜻한 바다 위', fl };
    },
    upslope(g, a, on, dens, v) {
      const W = g.W, yG = g.yG, geo = slopeGeo(g), peakY = geo.yZ(st.M);
      sa(E.sky0, { 'stop-color': '#A9CDEA' }); sa(E.sky1, { 'stop-color': '#EAF4FA' });
      const t = a.z / st.M, px = lerp(geo.x0, geo.x1, t), r = 13 + 7 * a.z / geo.zTop, py = geo.yZ(a.z) - r - 6;
      const surf = x => x < geo.x0 ? yG : (x <= geo.x1 ? lerp(yG, peakY, (x - geo.x0) / (geo.x1 - geo.x0)) : lerp(peakY, lerp(peakY, yG, 0.75), (x - geo.x1) / (W - geo.x1)));
      // 바람이 산 사면을 따라 공기를 밀어 올림
      for (let i = 0; i < 3; i++) {
        const u = frac(tm * 0.11 + i / 3), x0 = lerp(geo.x0 - 60, geo.x1, u * 0.85), x1 = x0 + 70;
        const yAt = x => surf(x) - 30;
        curveArrow(E.dyn, [[x0, yAt(x0)], [(x0 + x1) / 2, yAt((x0 + x1) / 2) - 4], [x1, yAt(x1)]], '#5E6F7E', 2.6, 0.8 * Math.sin(Math.PI * u));
      }
      lbl(E.dyn, W * 0.03, yG - 44, '바람 →', '#4E5D6A');
      lbl(E.top, W * 0.03, yG - 72, '단열 팽창 → 냉각', '#33414E', { class: 'lb-sm halo-sky' });
      const foggy = a.saturated && a.z >= a.H - 1e-9;
      fogTint('#FFFFFF');
      if (a.H <= st.M + 1e-9) {   // 응결 고도부터 공기가 지나온 곳까지 사면을 타고 오르며 덮는 안개
        const xH = lerp(geo.x0, geo.x1, a.H / st.M);
        fogBank(E.fog, { v, x0: xH - 40, x1: Math.max(xH, px) + 50, ground: x => surf(x) + 12, hgt: 78, drift: 14, soft: 38, seed: 11, shade: 0.45 });
      }
      const fl = foggy ? { x: lerp(geo.x0, geo.x1, (a.H + a.z) / 2 / st.M) - 60, y: geo.yZ((a.H + a.z) / 2) - 40 - 20 * dens, t: '활승 안개' } : null;
      return { px, py, r, info: `높이 ${fZ(a.z)} km`, fl };
    },
    steam(g, a, on, dens, v) {
      const W = g.W, yG = g.yG, xw = X('steam', 0.3);
      sa(E.sky0, { 'stop-color': '#C9D7E2' }); sa(E.sky1, { 'stop-color': '#F4EEE6' });
      const px = X('steam', a.x), py = yG - 30;
      for (let i = 0; i < 3; i++) { const u = frac(tm * 0.2 + i / 3), x0 = lerp(-50, xw + 30, u), y = yG - 18 - i * 16; arrowLine(s('g', { opacity: Math.sin(Math.PI * u).toFixed(2) }, E.dyn), x0, y, x0 + 54, y, '#3A78AA', 2.6); }
      lbl(E.dyn, 10, yG - 82, '찬 공기 →', '#1F5A88');
      const nEv = Math.max(3, Math.round((st.water - 2) / 2.5));
      for (let i = 0; i < nEv; i++) { const x = xw + 24 + (W - xw - 40) * (i + 0.5) / nEv; wavyUp(E.dyn, x, yG - 2, 18 + st.water, '#7FB8D6', i * 1.7 - tm * 2.6, 1.8); }
      lbl(E.top, (xw + W) / 2, yG + 50, '↑ 증발', '#E8F4FA', { 'text-anchor': 'middle', class: 'lb-sm', stroke: 'rgba(31,87,134,.9)', 'stroke-width': 4, 'paint-order': 'stroke' });
      let fl = null;
      fogTint('#FFFFFF');
      if (on != null) {   // 따뜻한 수면에서 김처럼 피어오르는 안개: 찬 공기가 지나간 곳부터
        const x0 = X('steam', on) - 14, x1 = Math.min(W + 10, px + 46);
        fogBank(E.fog, { v, x0: x0 - 10, x1: x1 + 14, ground: () => yG + 6, hgt: 40, drift: 9, soft: 34, seed: 13, alpha: 0.9, shade: 0.3 });
        steamPuffs(E.fog, x0, x1, yG - 4, 46 + 74 * v, v, 26);
        if (st.s >= on) fl = { x: (x0 + 14 + Math.min(W - 4, px + 40)) / 2, y: yG - 74 - 60 * dens, t: '증발 안개' };
      }
      return { px, py, r: 15, info: a.overWater ? '따뜻한 수면 위' : '차가운 육지 위', fl };
    },
    frontal(g, a, on, dens, v) {
      const W = g.W, yG = g.yG, fr = frontGeo(g);
      sa(E.sky0, { 'stop-color': '#A8B2BC' }); sa(E.sky1, { 'stop-color': '#D8DEE3' });
      // 따뜻한 공기가 전선면을 타고 올라감
      curveArrow(E.dyn, [[W * 0.02, yG - 40], [W * 0.1, yG - 74], [W * 0.2, fr.yAt(W * 0.2) - 64], [W * 0.3, fr.yAt(W * 0.3) - 86]], '#D0563F', 4.5);
      lbl(E.top, W * 0.02, g.top + 44, '따뜻한 공기 ↗', '#9C3B2E');
      // 빗방울: 구름에서 떨어져 찬 공기층을 지나며 증발해 작아짐
      const R = rng(9), nDrop = st.rain === 'strong' ? 46 : 16;
      for (let i = 0; i < nDrop; i++) {
        const x = W * 0.36 + R() * (W * 0.62), yTop = Math.max(g.top + 60, fr.yR - 10), yBot = yG - 4;
        const tt = frac(R() + tm * (1.0 + 0.5 * R())), y = lerp(yTop, yBot, tt), yF = fr.yAt(x);
        const inCold = y > yF, k = inCold ? clamp(1 - (y - yF) / Math.max(30, yBot - yF), 0.2, 1) : 1;
        s('path', { d: `M${x.toFixed(1)} ${y.toFixed(1)} l-3 ${(13 * k).toFixed(1)}`, stroke: '#3E6E9C', 'stroke-width': (2.2 * Math.sqrt(k)).toFixed(2), 'stroke-linecap': 'round', opacity: (0.9 * smooth(tt / 0.06)).toFixed(2) }, E.dyn);
        if (inCold && k < 0.5 && i % 3 === 0) s('circle', { cx: x + 3, cy: y - 4, r: 2.2, fill: 'none', stroke: '#8FB4D6', 'stroke-width': 1.2 }, E.dyn);
      }
      lbl(E.dyn, W - 8, fr.yR + (yG - fr.yR) * 0.42 + 20, '빗방울 증발', '#2F5E88', { 'text-anchor': 'end' });
      // 비가 내리는 찬 공기층 아래쪽에 깔리는 안개 (전선면 위로는 넘어가지 않음)
      fogTint('#FFFFFF');
      fogBank(E.fog, { v, x0: fr.x0 + 20, x1: W + 90, ground: () => yG + 8, hgt: 92, drift: 5, soft: 70, seed: 17, cap: x => (yG - fr.yAt(x)) * 0.8, shade: 0.4 });
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
  /** 장면만 다시 그림 (바람 · 물결 · 빗방울 · 안개의 흐름은 재생을 멈춰도 이어짐) */
  function drawScene() {
    if (!cur || !sh || !sh.frame) return;
    const g = sceneGeo(sh.frame), a = cur.a;
    clear(E.back); clear(E.dyn); clear(E.fog); clear(E.top);
    const sc = SCENE[st.kind](g, a, cur.on, cur.dens, vis), info = sc.info;
    cur.info = info;
    if (st.kind === 'radiation') {
      if (E.clockLast !== info) { E.clockLast = info; sa(E.clock, { opacity: 1 }); E.clockT.textContent = `🕘 ${info}`; sa(E.clockBg, { width: Math.max(90, (bboxW(E.clockT) || 80) + 24) }); }
    } else if (E.clockLast !== '') { E.clockLast = ''; sa(E.clock, { opacity: 0 }); }
    // 공기 덩어리 (기온 · 이슬점 값은 바로 아래 현재 수치 칸에)
    E.parcel.set(sc.px, sc.py, sc.r, a.saturated ? clamp(0.3 + a.water / 2, 0.3, 1) : 0);
    if (sc.fl) lbl(E.top, sc.fl.x, sc.fl.y, sc.fl.t, '#33414E', { 'text-anchor': 'middle', class: 'lb halo-sky', opacity: clamp(0.15 + vis / 0.3, 0, 1).toFixed(2) });   // 안개 이름
  }
  function render() {
    renderControls();
    if (!sh || !sh.frame || !G) return;
    const a = A(), on = onset(), cool = group() === 'cool';
    const dens = fogAmount(a);
    cur = { a, on, dens };

    /* 장면 */
    drawScene();
    const info = cur.info;

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
    api: { setS, setKind, setCond, play, step, goStage, resetMotion, resetDefaults, st, state: () => A(), onset: () => onset(), view: () => ({ vis, tm }) }
  };
})();
