/**
 * app.js — 대기 안정도와 강수 교육용 시뮬레이터 UI
 * 물리 계산은 전부 physics.js(Physics)를 사용한다.
 */
'use strict';

/* ═══════════════════════════════════════════════════════════════
 * 미션 목표 수치 / 판정 허용 오차 (교사용 난이도 조정 상수)
 * ═══════════════════════════════════════════════════════════════ */
const TUNING = {
  tab1: {
    m2_targetH: 2.0,      // ⭐⭐ 목표 응결 고도 (km)
    m2_tolH: 0.011,       // 허용 오차 (km)
    m3_fixedT: 30,        // ⭐⭐⭐ 고정 지표 기온 (℃)
    m3_targetHeight: 4.0, // 목표 풍선 높이 (km)
    m3_tolHeight: 0.051,  // 높이 허용 오차 (km)
    m3_targetTemp: 5,     // 목표 풍선 온도 (℃)
    m3_tolTemp: 0.25      // 온도 허용 오차 (℃)
  },
  tab2: {
    m2_tolPredict: 0.5,   // ⭐⭐ 예측 허용 오차 (℃)
    m3_tolMax: 0.01       // ⭐⭐⭐ 최대 온도 차와의 허용 오차 (℃)
  },
  tab3: {
    m1_minThickness: 0.15, // ⭐ 층운형 최소 두께 (km)
    m2_minThickness: 0.8,  // ⭐⭐ 적운형 최소 발달 두께 (km)
    m3_minThickness: 0.8   // ⭐⭐⭐ 조건부 불안정 적운 최소 두께 (km)
  }
};

/* ═══════════ 공통 유틸 ═══════════ */
const SVGNS = 'http://www.w3.org/2000/svg';
const $ = id => document.getElementById(id);

function el(tag, attrs, parent) {
  const n = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function setAttrs(n, attrs) { for (const k in attrs) n.setAttribute(k, attrs[k]); }
function fmt(x, d = 1) {
  let s = x.toFixed(d);
  if (Object.is(parseFloat(s), -0) || parseFloat(s) === 0) s = (0).toFixed(d);
  return s.replace('-', '−');
}
function signed(x, d = 1) { return (x >= 0 ? '+' : '') + fmt(x, d); }
/** 온도 색 코딩: −20 ℃(파랑) ~ 40 ℃(빨강) */
function tempColor(t) {
  const f = Math.max(0, Math.min(1, (t + 20) / 60));
  const hue = 215 - 210 * f;
  return `hsl(${hue.toFixed(0)} 78% 40%)`;
}
function svgPointFromEvent(svg, ev) {
  const pt = svg.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
/** 여러 개의 뭉게 타원으로 이루어진 구름 퍼프 그룹 생성 */
function makePuff(parent, cx, cy, w, h, fill, opacity) {
  const g = el('g', { class: 'cloud-shape' }, parent);
  el('ellipse', { cx, cy, rx: w, ry: h, fill, opacity }, g);
  el('ellipse', { cx: cx - w * 0.55, cy: cy + h * 0.25, rx: w * 0.6, ry: h * 0.75, fill, opacity }, g);
  el('ellipse', { cx: cx + w * 0.55, cy: cy + h * 0.25, rx: w * 0.6, ry: h * 0.75, fill, opacity }, g);
  return g;
}

/* ═══════════ 별 / 미션 프레임워크 ═══════════ */
const TABS = ['tab1', 'tab2', 'tab3'];
const starState = { tab1: [false, false, false], tab2: [false, false, false], tab3: [false, false, false] };
const modeState = { tab1: 'free', tab2: 'free', tab3: 'free' };
let certShown = false;

const MISSIONS = {
  tab1: [
    {
      title: '구름을 만들어라',
      desc: '풍선을 상승 응결 고도(H) 위로 올려 구름을 만들어 보세요.',
      hint: '점선(응결 고도)보다 높이 풍선을 올리면 수증기가 응결해요. ▲ 버튼이나 드래그로 올려 보세요!'
    },
    {
      title: '구름 바닥을 정확히 2.0 km에 맞춰라',
      desc: '응결 고도 H가 정확히 2.0 km가 되도록 기온과 이슬점을 조절한 뒤, 풍선을 올려 구름을 만드세요.',
      hint: 'H = ⅛(T − Td)이므로 H = 2.0 km가 되려면 T − Td = 16 ℃여야 해요. 예: T = 26 ℃, Td = 10 ℃.'
    },
    {
      title: '4 km 상공에서 풍선 온도를 5 ℃로!',
      desc: '지표 기온은 30 ℃로 고정! 이슬점을 조절해 풍선이 4.0 km에 있을 때 온도가 정확히 5.0 ℃가 되게 하세요.',
      hint: '이슬점을 바꾸면 응결 고도가 바뀌어 건조 단열(10 ℃/km) 구간과 습윤 단열(5 ℃/km) 구간의 비율이 달라져요. 4 km 온도 = 30 − 10×H − 5×(4 − H). 이 값이 5가 되는 H는? 그때 Td는?'
    }
  ],
  tab2: [
    {
      title: '높새바람을 만들어라',
      desc: '공기를 산 너머로 보내 도착 온도가 출발 온도보다 높아지게(푄 현상) 하세요.',
      hint: '산을 넘는 동안 구름이 생기고 비가 내려야 푄이 일어나요. 응결 고도 H = ⅛(T − Td)가 산 높이보다 낮은지 확인해 보세요!'
    },
    {
      title: '도착 온도를 예측하라',
      desc: '출발 전에 영서(서쪽) 도착 온도를 계산해 입력하고, 시뮬레이션으로 검증하세요. (±0.5 ℃ 이내)',
      hint: '① H = ⅛(T − Td) ② 정상 온도 = T − 10×H − 5×(산 높이 − H) ③ 도착 온도 = 정상 온도 + 10×산 높이. 산이 응결 고도보다 낮으면 도착 온도 = 출발 온도!'
    },
    {
      title: '영동–영서 온도 차를 최대로!',
      desc: '이슬점을 조절해 이번 설정(기온·산 높이)에서 가능한 가장 큰 온도 차를 만들어 산을 넘기세요.',
      hint: '이슬점이 높을수록 응결 고도가 낮아져 습윤 단열(5 ℃/km) 구간이 길어지고, 산을 넘은 뒤 온도 차가 커져요. 이슬점을 최대한 올려 볼까요?'
    }
  ],
  tab3: [
    {
      title: '층운형 구름을 만들어라',
      desc: '안정한 대기를 만든 뒤 "강제 상승"으로 공기를 응결 고도 위까지 밀어 올려, 옆으로 퍼지는 층운형 구름을 만드세요.',
      hint: 'γ를 5 ℃/km보다 작게(예: 절대 안정 프리셋 4) 하고, ✊ 강제 상승 버튼을 꾹 눌러 점선(응결 고도) 위까지 올려 보세요.'
    },
    {
      title: '적운형 구름을 만들어라',
      desc: '불안정한 대기에서 공기 덩어리가 스스로 상승해 수직으로 두껍게 발달하는 적운형 구름을 만드세요.',
      hint: 'γ를 10 ℃/km보다 크게(예: 절대 불안정 프리셋 12) 하고 👉 쿡 찔러보기! 공기가 주위보다 따뜻해져 스스로 계속 올라가요.'
    },
    {
      title: '조건부 불안정에서 적운을 발달시켜라',
      desc: 'γ를 5~10 ℃/km 사이로 설정하세요. 쿡 찌르면 되돌아오지만, 강제 상승으로 자유 대류 고도를 넘기면? 적운형 구름까지 발달시키세요!',
      hint: '조건부 불안정(예: γ = 8)에서는 불포화일 때 안정이지만 포화되면 불안정해요. ✊ 강제 상승을 꾹 눌러 "자유 대류 시작 고도" 점선을 넘긴 뒤 손을 떼 보세요.'
    }
  ]
};

function totalStars() {
  return TABS.reduce((s, t) => s + starState[t].filter(Boolean).length, 0);
}
function activeMissionIdx(tab) {
  const i = starState[tab].indexOf(false);
  return i; // -1 = 모두 완료
}
function missionActive(tab, idx) {
  return modeState[tab] === 'mission' && activeMissionIdx(tab) === idx;
}

function renderStarHeader() {
  TABS.forEach(tab => {
    const g = $('stars-' + tab);
    g.querySelectorAll('.star-slot').forEach(n => n.remove());
    starState[tab].forEach(earned => {
      const s = document.createElement('span');
      s.className = 'star-slot' + (earned ? ' earned' : '');
      s.textContent = '⭐';
      g.appendChild(s);
    });
  });
  $('star-total').textContent = `${totalStars()} / 9`;
}

function spawnConfetti(n) {
  const emojis = ['🎉', '⭐', '✨', '🌟', '🎊', '☁️', '🌈'];
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.className = 'confetti';
    s.textContent = emojis[i % emojis.length];
    s.style.left = (Math.random() * 96) + 'vw';
    s.style.animationDuration = (2 + Math.random() * 2.4) + 's';
    s.style.animationDelay = (Math.random() * 0.5) + 's';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 5200);
  }
}

function celebrate(tab, idx) {
  const m = MISSIONS[tab][idx];
  $('celebrate-msg').innerHTML =
    `${'⭐'.repeat(idx + 1)} 미션 성공!<br><span style="font-size:20px;color:var(--ink-soft)">「${m.title}」</span>`;
  const ov = $('celebrate-overlay');
  ov.classList.add('visible');
  spawnConfetti(14);
  setTimeout(() => ov.classList.remove('visible'), 2000);
}

function award(tab) {
  const idx = activeMissionIdx(tab);
  if (idx < 0) return;
  starState[tab][idx] = true;
  renderStarHeader();
  celebrate(tab, idx);
  renderMissionPanel(tab);
  if (totalStars() === 9 && !certShown) {
    certShown = true;
    setTimeout(() => {
      $('cert-overlay').classList.add('visible');
      spawnConfetti(40);
    }, 2100);
  }
}

function checkMission(tab, checkers) {
  if (modeState[tab] !== 'mission') return;
  const idx = activeMissionIdx(tab);
  if (idx < 0) return;
  if (checkers[idx] && checkers[idx]()) award(tab);
}

function renderMissionPanel(tab) {
  const panel = $('mission-panel-' + tab);
  if (modeState[tab] !== 'mission') {
    panel.classList.remove('visible');
    afterMissionPanelRender(tab);
    return;
  }
  panel.classList.add('visible');
  const idx = activeMissionIdx(tab);
  let html = '<div class="mission-steps">' + MISSIONS[tab].map((m, i) => {
    const cls = starState[tab][i] ? 'done' : (i === idx ? 'current' : '');
    const tag = starState[tab][i] ? '완료 ✓' : (i === idx ? '도전 중!' : '잠김 🔒');
    return `<span class="mission-step ${cls}">${'⭐'.repeat(i + 1)} ${tag}</span>`;
  }).join('') + '</div>';

  if (idx === -1) {
    html += `<div class="mission-complete-msg">🎉 이 탭의 미션 3개를 모두 완료했어요! 다른 탭에도 도전해 보세요.</div>`;
  } else {
    const m = MISSIONS[tab][idx];
    html += `<div class="mission-title">${'⭐'.repeat(idx + 1)} ${m.title}</div>`;
    html += `<div class="mission-desc">${m.desc}</div>`;
    html += `<div class="mission-desc" id="mlive-${tab}" style="font-weight:800;margin-top:4px"></div>`;
    if (tab === 'tab2' && idx === 1) {
      html += `<div class="mission-extra"><label style="font-weight:700">예측 도착 온도:</label>
        <input type="number" id="t2-predict" step="0.1" placeholder="?"> <span style="font-weight:700">℃</span>
        <span style="font-size:16px;color:var(--ink-soft)">→ 입력 후 🌬️ 출발!</span></div>`;
    }
    html += `<div class="mission-extra"><button class="hint-btn" id="hintbtn-${tab}">💡 힌트 보기</button></div>`;
    html += `<div class="mission-hint" id="hint-${tab}">${m.hint}</div>`;
  }
  panel.innerHTML = html;
  const hb = $('hintbtn-' + tab);
  if (hb) hb.addEventListener('click', () => $('hint-' + tab).classList.toggle('visible'));
  afterMissionPanelRender(tab);
}

function showMissionHint(tab, text) {
  const h = $('hint-' + tab);
  if (!h) return;
  if (text) h.textContent = text;
  h.classList.add('visible');
}
function setMissionLive(tab, html) {
  const n = $('mlive-' + tab);
  if (n) n.innerHTML = html;
}

/* 미션 패널이 다시 그려질 때 탭별 후처리 (입력 복원, 슬라이더 잠금 등) */
function afterMissionPanelRender(tab) {
  if (tab === 'tab1') t1ApplyMissionLock();
  if (tab === 'tab2') t2RestorePredictInput();
}

/* ═══════════ 탭 전환 / 모드 토글 ═══════════ */
TABS.forEach(tab => {
  $('tabbtn-' + tab).addEventListener('click', () => {
    TABS.forEach(t => {
      $(t).classList.toggle('active', t === tab);
      $('tabbtn-' + t).classList.toggle('active', t === tab);
    });
  });
  const toggle = $('mode-' + tab);
  toggle.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      modeState[tab] = btn.dataset.mode;
      toggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
      renderMissionPanel(tab);
      if (tab === 'tab1') t1Render();
      if (tab === 'tab2') t2Render();
    });
  });
});

$('reset-stars').addEventListener('click', () => {
  if (!confirm('획득한 별을 모두 초기화할까요? (새 수업 시작)')) return;
  TABS.forEach(t => { starState[t] = [false, false, false]; renderMissionPanel(t); });
  certShown = false;
  renderStarHeader();
});
$('cert-close').addEventListener('click', () => {
  $('cert-overlay').classList.remove('visible');
  spawnConfetti(20);
});

/* ═══════════════════════════════════════════════════════════════
 * 탭 1 — 🎈 상승 실험실
 * ═══════════════════════════════════════════════════════════════ */
const t1 = { T: 25, Td: 15, h: 0 };
const T1G = { yTop: 42, yGround: 572, xBalloon: 150 };
T1G.yOf = h => T1G.yGround - h * ((T1G.yGround - T1G.yTop) / 5);
T1G.hOf = y => (T1G.yGround - y) / ((T1G.yGround - T1G.yTop) / 5);

const t1scene = $('t1-scene');
const t1graph = $('t1-graph');
let t1el = {}; // 장면 요소 캐시

function t1BuildScene() {
  const svg = t1scene;
  const defs = el('defs', null, svg);
  const grad = el('linearGradient', { id: 't1sky', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: '0%', 'stop-color': '#8ec9f0' }, grad);
  el('stop', { offset: '100%', 'stop-color': '#dff2ff' }, grad);
  const bgrad = el('radialGradient', { id: 't1balloon', cx: 0.35, cy: 0.3, r: 1 }, defs);
  el('stop', { offset: '0%', 'stop-color': '#ff8a80' }, bgrad);
  el('stop', { offset: '100%', 'stop-color': '#d62828' }, bgrad);

  el('rect', { x: 0, y: 0, width: 460, height: T1G.yGround, fill: 'url(#t1sky)' }, svg);
  el('rect', { x: 0, y: T1G.yGround, width: 460, height: 48, fill: '#8fce7f' }, svg);
  el('text', { x: 452, y: 612, 'text-anchor': 'end', class: 'tick-label' }, svg).textContent = '지표 (0 km)';

  // 높이 눈금
  for (let h = 0; h <= 5; h++) {
    const y = T1G.yOf(h);
    el('line', { x1: 72, y1: y, x2: 460, y2: y, stroke: '#ffffff', 'stroke-opacity': 0.55, 'stroke-width': h === 0 ? 0 : 1.5 }, svg);
    el('line', { x1: 64, y1: y, x2: 72, y2: y, stroke: '#38536d', 'stroke-width': 2 }, svg);
    const t = el('text', { x: 60, y: y + 5, 'text-anchor': 'end', class: 'tick-label' }, svg);
    t.textContent = h + ' km';
  }

  // 구름 (응결 고도 위)
  t1el.cloud = el('g', { class: 'cloud-shape', opacity: 0 }, svg);

  // 응결 고도 점선 + 라벨
  t1el.lclLine = el('line', { x1: 72, y1: 0, x2: 460, y2: 0, stroke: '#b8860b', 'stroke-width': 3, 'stroke-dasharray': '10 7' }, svg);
  const lb = el('g', null, svg);
  t1el.lclLabelBg = el('rect', { x: 78, y: 0, rx: 7, width: 372, height: 26, fill: '#fff8dc', 'fill-opacity': 0.92, stroke: '#d8b23a' }, lb);
  t1el.lclLabel = el('text', { x: 264, y: 0, 'text-anchor': 'middle', class: 'lcl-label' }, lb);

  // 풍선
  const bg = el('g', { class: 'balloon-grp', id: 't1-balloon' }, svg);
  t1el.balloonG = bg;
  const inner = el('g', null, bg);
  t1el.balloonInner = inner;
  el('line', { x1: 0, y1: 30, x2: 0, y2: 52, stroke: '#7a4a12', 'stroke-width': 2.5 }, inner);
  el('rect', { x: -9, y: 52, width: 18, height: 14, rx: 3, fill: '#b07830', stroke: '#7a4a12', 'stroke-width': 2 }, inner);
  el('ellipse', { cx: 0, cy: 0, rx: 26, ry: 32, fill: 'url(#t1balloon)', stroke: '#a51d1d', 'stroke-width': 2 }, inner);
  el('path', { d: 'M -7 29 L 7 29 L 0 38 Z', fill: '#a51d1d' }, inner);
  el('ellipse', { cx: -9, cy: -12, rx: 7, ry: 11, fill: '#ffffff', 'fill-opacity': 0.45 }, inner);
  // 드래그 히트 영역
  el('circle', { cx: 0, cy: 20, r: 52, fill: 'transparent' }, bg);

  // (참고) 구름 사각형은 렌더 시 x=80부터 그려 높이 눈금을 가리지 않는다
  // 풍선 옆 실시간 수치
  t1el.readT = el('text', { class: 'big-num' }, svg);
  t1el.readTd = el('text', { class: 'big-num' }, svg);
  t1el.readH = el('text', { class: 'tick-label', 'font-size': 17 }, svg);

  // 상태 배지
  const badge = el('g', null, svg);
  t1el.badgeRect = el('rect', { rx: 10, height: 34, fill: '#fff', 'fill-opacity': 0.94, stroke: '#888', 'stroke-width': 2 }, badge);
  t1el.badgeText = el('text', { class: 'badge-text', 'text-anchor': 'middle' }, badge);
}

function t1BuildGraph() {
  const svg = t1graph;
  const X0 = 66, X1 = 444, Y0 = 572, Y1 = 42; // 플롯 영역
  const TMIN = -20, TMAX = 40;
  const gx = t => X0 + (t - TMIN) / (TMAX - TMIN) * (X1 - X0);
  const gy = h => Y0 - h / 5 * (Y0 - Y1);
  t1el.gx = gx; t1el.gy = gy;

  el('rect', { x: X0, y: Y1, width: X1 - X0, height: Y0 - Y1, fill: '#fbfdff', stroke: '#c9dded' }, svg);
  const clip = el('clipPath', { id: 't1clip' }, el('defs', null, svg));
  el('rect', { x: X0, y: Y1, width: X1 - X0, height: Y0 - Y1 }, clip);

  for (let t = TMIN; t <= TMAX; t += 10) {
    el('line', { x1: gx(t), y1: Y0, x2: gx(t), y2: Y1, stroke: '#e3eef7' }, svg);
    el('line', { x1: gx(t), y1: Y0, x2: gx(t), y2: Y0 + 7, stroke: '#38536d', 'stroke-width': 2 }, svg);
    el('text', { x: gx(t), y: Y0 + 26, 'text-anchor': 'middle', class: 'tick-label' }, svg).textContent = t;
  }
  for (let h = 0; h <= 5; h++) {
    el('line', { x1: X0, y1: gy(h), x2: X1, y2: gy(h), stroke: '#e3eef7' }, svg);
    el('line', { x1: X0 - 7, y1: gy(h), x2: X0, y2: gy(h), stroke: '#38536d', 'stroke-width': 2 }, svg);
    el('text', { x: X0 - 12, y: gy(h) + 5, 'text-anchor': 'end', class: 'tick-label' }, svg).textContent = h;
  }
  el('text', { x: (X0 + X1) / 2, y: 612, 'text-anchor': 'middle', class: 'axis-label' }, svg).textContent = '온도 (℃)';
  el('text', { x: 24, y: 307, 'text-anchor': 'middle', class: 'axis-label', transform: 'rotate(-90 24 307)' }, svg).textContent = '높이 (km)';

  const plot = el('g', { 'clip-path': 'url(#t1clip)' }, svg);
  t1el.gLcl = el('line', { stroke: '#b8860b', 'stroke-width': 2, 'stroke-dasharray': '8 6' }, plot);
  t1el.gDew = el('polyline', { fill: 'none', stroke: '#1d6fd8', 'stroke-width': 4, 'stroke-dasharray': '10 7', 'stroke-linecap': 'round' }, plot);
  t1el.gTemp = el('polyline', { fill: 'none', stroke: '#d62828', 'stroke-width': 4, 'stroke-linecap': 'round' }, plot);
  t1el.gDotT = el('circle', { r: 7, fill: '#d62828', stroke: '#fff', 'stroke-width': 2 }, plot);
  t1el.gDotD = el('circle', { r: 7, fill: '#1d6fd8', stroke: '#fff', 'stroke-width': 2 }, plot);

  // 범례
  el('line', { x1: 300, y1: 20, x2: 336, y2: 20, stroke: '#d62828', 'stroke-width': 4 }, svg);
  el('text', { x: 342, y: 25, class: 'tick-label' }, svg).textContent = '기온';
  el('line', { x1: 380, y1: 20, x2: 416, y2: 20, stroke: '#1d6fd8', 'stroke-width': 4, 'stroke-dasharray': '8 6' }, svg);
  el('text', { x: 421, y: 25, class: 'tick-label' }, svg).textContent = '이슬점';
}

function t1Render() {
  const p = Physics.parcel(t1.T, t1.Td, t1.h);
  const H = p.H;
  const scale = 1 + 0.09 * t1.h;
  const bx = T1G.xBalloon, by = T1G.yOf(t1.h) - 20 * scale;

  $('t1-T-val').textContent = fmt(t1.T, 0) + ' ℃';
  $('t1-T-val').style.color = tempColor(t1.T);
  $('t1-Td-val').textContent = fmt(t1.Td, 0) + ' ℃';
  $('t1-Td-val').style.color = tempColor(t1.Td);
  $('t1-h-val').textContent = fmt(t1.h, 1) + ' km';

  // 풍선
  t1el.balloonG.setAttribute('transform', `translate(${bx} ${by})`);
  t1el.balloonInner.setAttribute('transform', `scale(${scale})`);

  // 수치
  const rx = bx + 42 * scale;
  const ry = Math.max(60, Math.min(T1G.yGround - 30, by));
  setAttrs(t1el.readT, { x: rx, y: ry, fill: tempColor(p.temp) });
  t1el.readT.textContent = `기온 ${fmt(p.temp)} ℃`;
  setAttrs(t1el.readTd, { x: rx, y: ry + 30, fill: tempColor(p.dew) });
  t1el.readTd.textContent = `이슬점 ${fmt(p.dew)} ℃`;
  setAttrs(t1el.readH, { x: rx, y: ry + 54, fill: '#38536d' });
  t1el.readH.textContent = `높이 ${fmt(t1.h, 1)} km`;

  // 배지
  const badgeTxt = p.saturated ? '포화! 습윤 단열 변화 중 (5 ℃/km)' : '불포화 · 건조 단열 변화 중 (10 ℃/km)';
  const bw = p.saturated ? 300 : 330;
  const bxc = 230;
  const byc = Math.max(30, by - 66 * scale);
  setAttrs(t1el.badgeRect, {
    x: bxc - bw / 2, y: byc - 23, width: bw,
    stroke: p.saturated ? '#1d6fd8' : '#c9500e'
  });
  setAttrs(t1el.badgeText, { x: bxc, y: byc, fill: p.saturated ? '#10508f' : '#a34009' });
  t1el.badgeText.textContent = badgeTxt;

  // 응결 고도 점선 + 라벨
  const yH = T1G.yOf(Math.min(H, 5));
  setAttrs(t1el.lclLine, { y1: yH, y2: yH });
  const labelY = Math.max(46, yH - 14);
  setAttrs(t1el.lclLabelBg, { y: labelY - 19 });
  setAttrs(t1el.lclLabel, { y: labelY });
  t1el.lclLabel.textContent = `상승 응결 고도 H = ⅛(T−Td) = ${fmt(H, 2)} km`;

  // 구름 (H부터 현재 풍선 높이까지 발달)
  t1el.cloud.innerHTML = '';
  if (t1.h >= H) {
    const yBase = T1G.yOf(H);
    const yTop = T1G.yOf(Math.min(t1.h, 5));
    el('rect', { x: 84, y: yTop - 8, width: 340, height: Math.max(20, yBase - yTop + 16), rx: 18, fill: '#ffffff', opacity: 0.88 }, t1el.cloud);
    for (let i = 0; i < 6; i++) {
      const cx = 108 + i * 58;
      el('ellipse', { cx, cy: yBase + 6, rx: 40, ry: 15, fill: '#f4f9ff', opacity: 0.95 }, t1el.cloud);
      el('ellipse', { cx: cx + 25, cy: yTop - 6, rx: 38, ry: 16, fill: '#ffffff', opacity: 0.95 }, t1el.cloud);
    }
    t1el.cloud.setAttribute('opacity', 1);
  } else {
    t1el.cloud.setAttribute('opacity', 0);
  }

  // 그래프
  const { gx, gy } = t1el;
  const hCap = Math.min(t1.h, 5);
  const tempPts = [[t1.T, 0]];
  const dewPts = [[t1.Td, 0]];
  if (hCap >= H) {
    tempPts.push([t1.T - 10 * H, H]);
    dewPts.push([t1.Td - 2 * H, H]);
    tempPts.push([p.temp, hCap]);
    dewPts.push([p.temp, hCap]);
  } else {
    tempPts.push([p.temp, hCap]);
    dewPts.push([p.dew, hCap]);
  }
  t1el.gTemp.setAttribute('points', tempPts.map(q => `${gx(q[0])},${gy(q[1])}`).join(' '));
  t1el.gDew.setAttribute('points', dewPts.map(q => `${gx(q[0])},${gy(q[1])}`).join(' '));
  setAttrs(t1el.gDotT, { cx: gx(p.temp), cy: gy(hCap) });
  setAttrs(t1el.gDotD, { cx: gx(p.dew), cy: gy(hCap) });
  setAttrs(t1el.gLcl, { x1: 66, x2: 444, y1: gy(Math.min(H, 5)), y2: gy(Math.min(H, 5)) });

  // 미션 실시간 안내 + 판정
  if (modeState.tab1 === 'mission') {
    const idx = activeMissionIdx('tab1');
    if (idx === 0) setMissionLive('tab1', `풍선 높이 ${fmt(t1.h, 1)} km / 응결 고도 ${fmt(H, 2)} km`);
    if (idx === 1) setMissionLive('tab1', `현재 응결 고도 H = <span style="color:${Math.abs(H - TUNING.tab1.m2_targetH) <= TUNING.tab1.m2_tolH ? 'var(--ok)' : 'var(--warn)'}">${fmt(H, 2)} km</span> (목표 ${fmt(TUNING.tab1.m2_targetH, 1)} km)`);
    if (idx === 2) setMissionLive('tab1', `풍선: ${fmt(t1.h, 1)} km에서 ${fmt(p.temp)} ℃ (목표: ${fmt(TUNING.tab1.m3_targetHeight, 1)} km에서 ${fmt(TUNING.tab1.m3_targetTemp)} ℃)`);
  }
  checkMission('tab1', t1Checkers);
}

const t1Checkers = [
  () => t1.h >= Physics.lcl(t1.T, t1.Td) && t1.h > 0,
  () => {
    const H = Physics.lcl(t1.T, t1.Td);
    return Math.abs(H - TUNING.tab1.m2_targetH) <= TUNING.tab1.m2_tolH && t1.h >= H;
  },
  () => {
    const c = TUNING.tab1;
    if (Math.abs(t1.h - c.m3_targetHeight) > c.m3_tolHeight) return false;
    return Math.abs(Physics.parcel(t1.T, t1.Td, t1.h).temp - c.m3_targetTemp) <= c.m3_tolTemp;
  }
];

/* 탭1 미션 3: 지표 기온 30 ℃ 고정 */
function t1ApplyMissionLock() {
  const lock = missionActive('tab1', 2);
  const slider = $('t1-T');
  if (lock && t1.T !== TUNING.tab1.m3_fixedT) {
    t1.T = TUNING.tab1.m3_fixedT;
    slider.value = t1.T;
    t1ClampTd();
  }
  slider.disabled = lock;
  t1Render();
}

function t1ClampTd() {
  const s = $('t1-Td');
  s.max = t1.T - 1;
  if (t1.Td > t1.T - 1) { t1.Td = t1.T - 1; s.value = t1.Td; }
}

$('t1-T').addEventListener('input', e => { t1.T = +e.target.value; t1ClampTd(); t1Render(); });
$('t1-Td').addEventListener('input', e => { t1.Td = +e.target.value; t1Render(); });

function holdButton(btn, fn) {
  let timer = null;
  const start = ev => { ev.preventDefault(); fn(); timer = setInterval(fn, 90); };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  btn.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => btn.addEventListener(t, stop));
}
holdButton($('t1-up'), () => { t1.h = Math.min(5, Math.round((t1.h + 0.1) * 10) / 10); t1Render(); });
holdButton($('t1-down'), () => { t1.h = Math.max(0, Math.round((t1.h - 0.1) * 10) / 10); t1Render(); });

/* 풍선 드래그 */
function t1SetupDrag() {
  const g = t1el.balloonG;
  let dragging = false;
  g.addEventListener('pointerdown', ev => {
    dragging = true;
    g.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  g.addEventListener('pointermove', ev => {
    if (!dragging) return;
    const pt = svgPointFromEvent(t1scene, ev);
    t1.h = Math.max(0, Math.min(5, Math.round(T1G.hOf(pt.y + 20) * 10) / 10));
    t1Render();
  });
  ['pointerup', 'pointercancel'].forEach(t => g.addEventListener(t, () => { dragging = false; }));
  g.style.touchAction = 'none';
}

/* ═══════════════════════════════════════════════════════════════
 * 탭 2 — ⛰️ 산 넘기 (푄 현상)
 * ═══════════════════════════════════════════════════════════════ */
const t2 = {
  T: 20, Td: 14, M: 2,
  p: 0,               // 여정 진행도 0~1
  playing: false,
  departed: false,    // 이번 여정에서 출발 버튼을 눌렀는가
  completed: false,
  cloudTopReached: 0, // 풍상측에서 도달한 최고 높이 (구름 지속 표시용)
  predictVal: '',     // 미션2 예측 입력값 (재렌더 복원용)
  predictLocked: null // 출발 시 잠근 예측값
};
const T2G = {
  yGround: 430, baseE: 680, baseW: 240, xSummit: 460,
  yOf: h => 430 - h * 85
};

const t2scene = $('t2-scene');
const t2graph = $('t2-graph');
let t2el = {};

/** 진행도 p → {x, h, side} (side: 'windward' | 'leeward') */
function t2Pos(p) {
  const M = t2.M;
  if (p <= 0.1) {
    return { x: 850 - (850 - T2G.baseE) * (p / 0.1), h: 0, side: 'windward' };
  } else if (p <= 0.5) {
    const t = (p - 0.1) / 0.4;
    return { x: T2G.baseE - (T2G.baseE - T2G.xSummit) * t, h: M * t, side: 'windward' };
  } else if (p <= 0.9) {
    const t = (p - 0.5) / 0.4;
    return { x: T2G.xSummit - (T2G.xSummit - T2G.baseW) * t, h: M * (1 - t), side: 'leeward' };
  }
  return { x: T2G.baseW - (T2G.baseW - 70) * ((p - 0.9) / 0.1), h: 0, side: 'leeward' };
}
/** 풍상측 사면 위 높이 h 지점의 x좌표 */
function t2SlopeX(h) { return T2G.baseE - (T2G.baseE - T2G.xSummit) * (h / t2.M); }

function t2BuildScene() {
  const svg = t2scene;
  const defs = el('defs', null, svg);
  const grad = el('linearGradient', { id: 't2sky', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: '0%', 'stop-color': '#8ec9f0' }, grad);
  el('stop', { offset: '100%', 'stop-color': '#e2f3ff' }, grad);
  const mg = el('linearGradient', { id: 't2mtn', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: '0%', 'stop-color': '#7d9b6a' }, mg);
  el('stop', { offset: '100%', 'stop-color': '#54763f' }, mg);

  el('rect', { x: 0, y: 0, width: 920, height: T2G.yGround, fill: 'url(#t2sky)' }, svg);
  el('rect', { x: 0, y: T2G.yGround, width: 920, height: 40, fill: '#8fce7f' }, svg);
  el('rect', { x: 750, y: T2G.yGround, width: 170, height: 40, fill: '#5ab0e8' }, svg); // 동해
  el('text', { x: 835, y: T2G.yGround + 27, 'text-anchor': 'middle', class: 'tick-label', fill: '#fff', 'font-size': 16 }, svg).textContent = '동해';

  // 높이 눈금 (좌측)
  for (let h = 0; h <= 4; h++) {
    const y = T2G.yOf(h);
    el('line', { x1: 62, y1: y, x2: 70, y2: y, stroke: '#38536d', 'stroke-width': 2 }, svg);
    el('text', { x: 58, y: y + 5, 'text-anchor': 'end', class: 'tick-label' }, svg).textContent = h + ' km';
  }

  t2el.mountain = el('polygon', { fill: 'url(#t2mtn)', stroke: '#3f5c2e', 'stroke-width': 3 }, svg);
  t2el.summitLabel = el('text', { 'text-anchor': 'middle', class: 'seg-label', 'font-size': 17 }, svg);

  el('text', { x: 120, y: 505, 'text-anchor': 'middle', class: 'axis-label', 'font-size': 20 }, svg).textContent = '영서 (서쪽) — 도착';
  el('text', { x: 790, y: 505, 'text-anchor': 'middle', class: 'axis-label', 'font-size': 20 }, svg).textContent = '영동 (동쪽) — 출발';
  el('text', { x: 460, y: 505, 'text-anchor': 'middle', class: 'tick-label', 'font-size': 18 }, svg).textContent = '⬅ 바람 방향 (동풍)';

  // 응결 고도 점선
  const halo = { stroke: '#eaf6ff', 'stroke-width': 4, 'paint-order': 'stroke' };
  t2el.lclLine = el('line', { stroke: '#b8860b', 'stroke-width': 3, 'stroke-dasharray': '10 7' }, svg);
  t2el.lclLabel = el('text', Object.assign({ class: 'lcl-label', 'text-anchor': 'start' }, halo), svg);

  // 구간 라벨
  t2el.segDryUp = el('text', Object.assign({ class: 'seg-label', 'text-anchor': 'start' }, halo), svg);
  t2el.segMoist = el('text', Object.assign({ class: 'seg-label', 'text-anchor': 'start', fill: '#10508f' }, halo), svg);
  t2el.segDryDown = el('text', Object.assign({ class: 'seg-label', 'text-anchor': 'end', fill: '#a34009' }, halo), svg);

  t2el.cloud = el('g', { class: 'cloud-shape' }, svg);
  t2el.rain = el('g', null, svg);

  // 정상 온도 라벨
  t2el.summitTemp = el('text', { 'text-anchor': 'middle', class: 'badge-text', stroke: '#ffffff', 'stroke-width': 4, 'paint-order': 'stroke' }, svg);

  // 공기 덩어리
  const pg = el('g', null, svg);
  t2el.parcelG = pg;
  el('circle', { cx: 0, cy: 0, r: 17, fill: '#ffd54d', stroke: '#e08a00', 'stroke-width': 3 }, pg);
  el('circle', { cx: -5, cy: -5, r: 5, fill: '#fff', 'fill-opacity': 0.6 }, pg);

  // 상단 실시간 수치 패널 (박스 제목과 겹치지 않게 아래로)
  const panel = el('g', null, svg);
  el('rect', { x: 60, y: 42, width: 800, height: 46, rx: 12, fill: '#ffffff', 'fill-opacity': 0.92, stroke: '#9fc9ea', 'stroke-width': 2 }, panel);
  t2el.readH = el('text', { x: 80, y: 74, class: 'big-num', fill: '#38536d', 'font-size': 24 }, panel);
  t2el.readT = el('text', { x: 280, y: 74, class: 'big-num', 'font-size': 24 }, panel);
  t2el.readTd = el('text', { x: 500, y: 74, class: 'big-num', 'font-size': 24 }, panel);
  t2el.readRH = el('text', { x: 720, y: 74, class: 'big-num', fill: '#10508f', 'font-size': 24 }, panel);

  // 현재 단열 변화 배지 (공기 덩어리 아래쪽)
  const badge = el('g', null, svg);
  t2el.badgeRect = el('rect', { rx: 9, height: 30, fill: '#fff', 'fill-opacity': 0.94, 'stroke-width': 2 }, badge);
  t2el.badgeText = el('text', { class: 'badge-text', 'text-anchor': 'middle', 'font-size': 16 }, badge);
}

function t2BuildGraph() {
  const svg = t2graph;
  const X0 = 64, X1 = 446, Y0 = 470, Y1 = 46;
  const TMIN = -25, TMAX = 55, HMAX = 4.2;
  const gx = t => X0 + (t - TMIN) / (TMAX - TMIN) * (X1 - X0);
  const gy = h => Y0 - h / HMAX * (Y0 - Y1);
  t2el.gx = gx; t2el.gy = gy;

  el('rect', { x: X0, y: Y1, width: X1 - X0, height: Y0 - Y1, fill: '#fbfdff', stroke: '#c9dded' }, svg);
  const clip = el('clipPath', { id: 't2clip' }, el('defs', null, svg));
  el('rect', { x: X0, y: Y1, width: X1 - X0, height: Y0 - Y1 }, clip);

  for (let t = -20; t <= 50; t += 10) {
    el('line', { x1: gx(t), y1: Y0, x2: gx(t), y2: Y1, stroke: '#e3eef7' }, svg);
    el('text', { x: gx(t), y: Y0 + 24, 'text-anchor': 'middle', class: 'tick-label' }, svg).textContent = t;
  }
  for (let h = 0; h <= 4; h++) {
    el('line', { x1: X0, y1: gy(h), x2: X1, y2: gy(h), stroke: '#e3eef7' }, svg);
    el('text', { x: X0 - 10, y: gy(h) + 5, 'text-anchor': 'end', class: 'tick-label' }, svg).textContent = h;
  }
  el('text', { x: (X0 + X1) / 2, y: 508, 'text-anchor': 'middle', class: 'axis-label' }, svg).textContent = '온도 (℃)';
  el('text', { x: 22, y: 258, 'text-anchor': 'middle', class: 'axis-label', transform: 'rotate(-90 22 258)' }, svg).textContent = '높이 (km)';

  const plot = el('g', { 'clip-path': 'url(#t2clip)' }, svg);
  t2el.gLcl = el('line', { stroke: '#b8860b', 'stroke-width': 2, 'stroke-dasharray': '8 6' }, plot);
  t2el.gDewUp = el('polyline', { fill: 'none', stroke: '#1d6fd8', 'stroke-width': 3.5, 'stroke-dasharray': '9 6', 'stroke-linecap': 'round' }, plot);
  t2el.gTempUp = el('polyline', { fill: 'none', stroke: '#d62828', 'stroke-width': 3.5, 'stroke-linecap': 'round' }, plot);
  t2el.gDewDown = el('polyline', { fill: 'none', stroke: '#7b52c9', 'stroke-width': 3.5, 'stroke-dasharray': '9 6', 'stroke-linecap': 'round' }, plot);
  t2el.gTempDown = el('polyline', { fill: 'none', stroke: '#e07b00', 'stroke-width': 3.5, 'stroke-linecap': 'round' }, plot);
  t2el.gDot = el('circle', { r: 7, fill: '#ffd54d', stroke: '#e08a00', 'stroke-width': 3 }, plot);

  const leg = [
    ['#d62828', '기온(상승)', false], ['#1d6fd8', '이슬점(상승)', true],
    ['#e07b00', '기온(하강)', false], ['#7b52c9', '이슬점(하강)', true]
  ];
  leg.forEach((L, i) => {
    const lx = 192 + (i % 2) * 134, ly = 16 + Math.floor(i / 2) * 20;
    el('line', { x1: lx, y1: ly, x2: lx + 26, y2: ly, stroke: L[0], 'stroke-width': 4, 'stroke-dasharray': L[2] ? '8 6' : 'none' }, svg);
    el('text', { x: lx + 31, y: ly + 5, class: 'tick-label', 'font-size': 13.5 }, svg).textContent = L[1];
  });
}

function t2ResetJourney() {
  t2.p = 0; t2.playing = false; t2.departed = false; t2.completed = false;
  t2.cloudTopReached = 0; t2.predictLocked = null;
  $('t2-progress').value = 0;
  $('t2-compare').classList.remove('visible');
  $('t2-nofoehn').classList.remove('visible');
  t2Render();
}

function t2Render() {
  const { T, Td, M } = t2;
  const f = Physics.foehn(T, Td, M);
  const pos = t2Pos(t2.p);
  const st = Physics.foehnAt(T, Td, M, pos.side, pos.h);

  $('t2-T-val').textContent = fmt(T, 0) + ' ℃';
  $('t2-T-val').style.color = tempColor(T);
  $('t2-Td-val').textContent = fmt(Td, 0) + ' ℃';
  $('t2-Td-val').style.color = tempColor(Td);
  $('t2-M-val').textContent = fmt(M, 1) + ' km';

  const yM = T2G.yOf(M);
  t2el.mountain.setAttribute('points', `${T2G.baseW},${T2G.yGround} ${T2G.xSummit},${yM} ${T2G.baseE},${T2G.yGround}`);
  setAttrs(t2el.summitLabel, { x: T2G.xSummit, y: yM - 12 });
  t2el.summitLabel.textContent = `산 높이 ${fmt(M, 1)} km`;

  // 응결 고도
  const yH = T2G.yOf(Math.min(f.H, 4.4));
  if (f.H <= 4.4) {
    setAttrs(t2el.lclLine, { x1: 150, y1: yH, x2: 745, y2: yH, opacity: 1 });
    setAttrs(t2el.lclLabel, { x: 752, y: yH + 5, opacity: 1 });
    t2el.lclLabel.textContent = `응결 고도 H = ${fmt(f.H, 2)} km` + (f.foehn ? '' : ' (산보다 높음!)');
  } else {
    t2el.lclLine.setAttribute('opacity', 0);
    setAttrs(t2el.lclLabel, { x: 560, y: 80, opacity: 1 });
    t2el.lclLabel.textContent = `응결 고도 H = ${fmt(f.H, 2)} km (화면 밖, 산보다 높음!)`;
  }

  // 구간 라벨 (구간이 너무 짧으면 겹침 방지를 위해 숨김)
  const hMidLow = Math.min(f.H, M) / 2;
  if (Math.min(f.H, M) >= 0.45) {
    setAttrs(t2el.segDryUp, { x: Math.min(t2SlopeX(hMidLow) + 26, 646), y: T2G.yOf(hMidLow), opacity: 1 });
    t2el.segDryUp.textContent = '불포화 · 건조 단열 변화 (10 ℃/km)';
  } else {
    t2el.segDryUp.setAttribute('opacity', 0);
  }
  if (f.foehn) {
    const hMidUp = (f.H + M) / 2;
    setAttrs(t2el.segMoist, { x: Math.min(t2SlopeX(hMidUp) + 26, 660), y: T2G.yOf(hMidUp), opacity: 1 });
    t2el.segMoist.textContent = '포화 · 습윤 단열 변화 (5 ℃/km)';
  } else {
    t2el.segMoist.setAttribute('opacity', 0);
  }
  // 풍하측 라벨: 사면 위쪽(응결 고도 점선과 떨어진 곳) 왼편 하늘에 배치
  const hDn = M * 0.75;
  const xDn = T2G.xSummit - (T2G.xSummit - T2G.baseW) * (1 - hDn / M);
  setAttrs(t2el.segDryDown, { x: Math.max(xDn - 26, 356), y: T2G.yOf(hDn) });
  t2el.segDryDown.textContent = '불포화 · 건조 단열 변화 (10 ℃/km) — 기온 상승!';

  // 풍상측 구름 도달 높이 갱신
  if (f.foehn && pos.side === 'windward' && pos.h > f.H) {
    t2.cloudTopReached = Math.max(t2.cloudTopReached, pos.h);
  }
  if (pos.side === 'leeward' && t2.p > 0.5 && f.foehn && t2.departed) {
    t2.cloudTopReached = M;
  }

  // 구름 그리기 (풍상측 사면 H ~ 도달 높이)
  t2el.cloud.innerHTML = '';
  if (f.foehn && t2.cloudTopReached > f.H + 0.01) {
    const top = Math.min(t2.cloudTopReached, M);
    const n = Math.max(2, Math.ceil((top - f.H) / 0.25));
    for (let i = 0; i <= n; i++) {
      const h = f.H + (top - f.H) * (i / n);
      makePuff(t2el.cloud, t2SlopeX(h) + 14, T2G.yOf(h) - 10, 46, 20, '#ffffff', 0.92);
    }
  }

  // 비 (풍상측 포화 구간을 지나는 동안)
  const raining = st.raining && pos.side === 'windward' && pos.h >= f.H && t2.p < 0.5 && (t2.playing || t2.departed) && !t2.completed;
  t2el.rain.innerHTML = '';
  if (raining) {
    for (let i = 0; i < 9; i++) {
      const h = f.H + (Math.min(t2.cloudTopReached, M) - f.H) * (i / 9);
      const x = t2SlopeX(h) + 34 + (i % 3) * 8;
      const y = T2G.yOf(h) + 8;
      const d = el('line', { x1: x, y1: y, x2: x - 3, y2: y + 16, stroke: '#4d9be0', 'stroke-width': 3, 'stroke-linecap': 'round', class: 'rain-drop' }, t2el.rain);
      d.style.animationDelay = (i * 0.11) + 's';
    }
  }

  // 정상 온도 라벨
  if (f.foehn && t2.p >= 0.45) {
    setAttrs(t2el.summitTemp, { x: T2G.xSummit, y: yM - 36, opacity: 1, fill: tempColor(f.summitTemp) });
    t2el.summitTemp.textContent = `정상 ${fmt(f.summitTemp)} ℃`;
  } else {
    t2el.summitTemp.setAttribute('opacity', 0);
  }

  // 공기 덩어리 + 수치
  t2el.parcelG.setAttribute('transform', `translate(${pos.x} ${T2G.yOf(pos.h) - 18})`);
  t2el.readH.textContent = `고도 ${fmt(pos.h, 2)} km`;
  t2el.readT.textContent = `기온 ${fmt(st.temp)} ℃`;
  t2el.readT.setAttribute('fill', tempColor(st.temp));
  t2el.readTd.textContent = `이슬점 ${fmt(st.dew)} ℃`;
  t2el.readTd.setAttribute('fill', tempColor(st.dew));
  t2el.readRH.textContent = st.saturated ? '습도 100 %' : '습도 100 % 미만';

  // 현재 배지
  const btxt = st.saturated ? '포화 · 습윤 단열 (5 ℃/km)' : '불포화 · 건조 단열 (10 ℃/km)';
  const bw = st.saturated ? 230 : 250;
  let bx = pos.x, by = T2G.yOf(pos.h) + 34;
  bx = Math.max(bw / 2 + 6, Math.min(920 - bw / 2 - 6, bx));
  setAttrs(t2el.badgeRect, { x: bx - bw / 2, y: by - 21, width: bw, stroke: st.saturated ? '#1d6fd8' : '#c9500e' });
  setAttrs(t2el.badgeText, { x: bx, y: by, fill: st.saturated ? '#10508f' : '#a34009' });
  t2el.badgeText.textContent = btxt;

  t2RenderGraph(f, pos, st);
  t2RenderMissionLive(f);
}

function t2RenderGraph(f, pos, st) {
  const { gx, gy } = t2el;
  const { T, Td, M } = t2;
  const pts = s => s.map(q => `${gx(q[0])},${gy(q[1])}`).join(' ');

  // 풍상측 (현재 높이까지, 이미 하강 중이면 전체)
  const upH = pos.side === 'windward' ? pos.h : M;
  const tempUp = [[T, 0]];
  const dewUp = [[Td, 0]];
  if (f.foehn && upH >= f.H) {
    tempUp.push([T - 10 * f.H, f.H], [T - 10 * f.H - 5 * (upH - f.H), upH]);
    dewUp.push([Td - 2 * f.H, f.H], [T - 10 * f.H - 5 * (upH - f.H), upH]);
  } else {
    tempUp.push([T - 10 * upH, upH]);
    dewUp.push([Td - 2 * upH, upH]);
  }
  t2el.gTempUp.setAttribute('points', pts(tempUp));
  t2el.gDewUp.setAttribute('points', pts(dewUp));

  // 풍하측
  if (pos.side === 'leeward' && t2.p > 0.5) {
    const sT = f.foehn ? f.summitTemp : T - 10 * M;
    const sD = f.foehn ? f.summitDew : Td - 2 * M;
    t2el.gTempDown.setAttribute('points', pts([[sT, M], [sT + 10 * (M - pos.h), pos.h]]));
    t2el.gDewDown.setAttribute('points', pts([[sD, M], [sD + 2 * (M - pos.h), pos.h]]));
  } else {
    t2el.gTempDown.setAttribute('points', '');
    t2el.gDewDown.setAttribute('points', '');
  }
  setAttrs(t2el.gDot, { cx: gx(st.temp), cy: gy(pos.h) });
  setAttrs(t2el.gLcl, { x1: 64, x2: 446, y1: gy(f.H), y2: gy(f.H), opacity: f.H <= 4.2 ? 1 : 0 });
}

function t2MaxDelta() {
  // 현재 기온·산 높이에서 이슬점을 최대(T−1 ℃)로 했을 때의 온도 차
  const TdMax = t2.T - 1;
  return Physics.foehn(t2.T, TdMax, t2.M).deltaT;
}

function t2RenderMissionLive(f) {
  if (modeState.tab2 !== 'mission') return;
  const idx = activeMissionIdx('tab2');
  if (idx === 0) {
    setMissionLive('tab2', `응결 고도 ${fmt(f.H, 2)} km / 산 높이 ${fmt(t2.M, 1)} km ${f.foehn ? '→ 구름 생길 수 있음 ☁️' : '→ ⚠️ 산이 응결 고도보다 낮아요'}`);
  } else if (idx === 1) {
    setMissionLive('tab2', t2.predictLocked == null
      ? '예측 온도를 입력하고 🌬️ 출발을 누르세요.'
      : `예측 ${fmt(t2.predictLocked)} ℃로 잠금! 도착까지 지켜보세요…`);
  } else if (idx === 2) {
    setMissionLive('tab2', `이번 설정의 최대 온도 차: ${signed(t2MaxDelta())} ℃ / 현재 조건 온도 차: ${signed(f.foehn ? f.deltaT : 0)} ℃`);
  }
}

function t2RestorePredictInput() {
  const inp = $('t2-predict');
  if (!inp) return;
  inp.value = t2.predictVal;
  inp.addEventListener('input', () => { t2.predictVal = inp.value; });
}

function t2Complete() {
  t2.completed = true;
  t2.playing = false;
  const f = Physics.foehn(t2.T, t2.Td, t2.M);
  const card = $('t2-compare');
  if (f.foehn) {
    card.innerHTML =
      `<div class="headline">🌬️ 영동 출발 <span style="color:${tempColor(t2.T)}">${fmt(t2.T)} ℃</span> → 영서 도착 <span style="color:${tempColor(f.arrivalTemp)}">${fmt(f.arrivalTemp)} ℃</span></div>` +
      `기온 <b style="color:var(--hot)">${signed(f.deltaT)} ℃</b>, 이슬점 ${fmt(t2.Td)} ℃ → ${fmt(f.arrivalDew)} ℃ (<b style="color:var(--cold)">${signed(f.arrivalDew - t2.Td)} ℃</b>) → <b>고온 건조한 높새바람!</b>`;
    card.classList.add('visible');
    $('t2-nofoehn').classList.remove('visible');
  } else {
    card.innerHTML =
      `<div class="headline">영동 출발 ${fmt(t2.T)} ℃ → 영서 도착 ${fmt(f.arrivalTemp)} ℃ (변화 없음)</div>` +
      `이슬점도 그대로 ${fmt(f.arrivalDew)} ℃ — 구름 없이 넘어가면 푄이 일어나지 않아요.`;
    card.classList.add('visible');
    $('t2-nofoehn').classList.add('visible');
  }

  // 미션 판정 (여정 완료 시)
  if (modeState.tab2 === 'mission') {
    const idx = activeMissionIdx('tab2');
    if (idx === 0) {
      if (f.foehn && f.arrivalTemp > t2.T) award('tab2');
      else showMissionHint('tab2');
    } else if (idx === 1) {
      if (t2.predictLocked != null) {
        const diff = Math.abs(t2.predictLocked - f.arrivalTemp);
        if (diff <= TUNING.tab2.m2_tolPredict) award('tab2');
        else {
          showMissionHint('tab2', `아쉬워요! 예측 ${fmt(t2.predictLocked)} ℃ vs 실제 ${fmt(f.arrivalTemp)} ℃ (차이 ${fmt(diff)} ℃). 단계별로 다시 계산해 볼까요? ` + MISSIONS.tab2[1].hint);
          t2.predictLocked = null;
          renderMissionPanel('tab2');
        }
      }
    } else if (idx === 2) {
      const delta = f.foehn ? f.deltaT : 0;
      if (f.foehn && delta >= t2MaxDelta() - TUNING.tab2.m3_tolMax) award('tab2');
      else showMissionHint('tab2', `이번 온도 차는 ${signed(delta)} ℃. 이 설정의 최대는 ${signed(t2MaxDelta())} ℃예요. ` + MISSIONS.tab2[2].hint);
    }
  }
}

$('t2-go').addEventListener('click', () => {
  if (missionActive('tab2', 1)) {
    const v = parseFloat(t2.predictVal);
    if (isNaN(v)) {
      showMissionHint('tab2', '먼저 도착 온도를 예측해서 입력해야 해요! 계산 순서는 힌트를 참고하세요. ' + MISSIONS.tab2[1].hint);
      return;
    }
    t2.predictLocked = v;
  }
  t2.p = 0;
  t2.cloudTopReached = 0;
  t2.completed = false;
  t2.departed = true;
  t2.playing = true;
  $('t2-compare').classList.remove('visible');
  $('t2-nofoehn').classList.remove('visible');
});

$('t2-progress').addEventListener('input', e => {
  t2.playing = false;
  t2.departed = true;
  const wasDone = t2.completed;
  t2.p = +e.target.value / 1000;
  if (t2.p >= 1 && !wasDone) t2Complete();
  if (t2.p < 1) {
    t2.completed = false;
    $('t2-compare').classList.remove('visible');
    $('t2-nofoehn').classList.remove('visible');
  }
  t2Render();
});

function t2ClampTd() {
  const s = $('t2-Td');
  s.max = t2.T - 1;
  if (t2.Td > t2.T - 1) { t2.Td = t2.T - 1; s.value = t2.Td; }
}
$('t2-T').addEventListener('input', e => { t2.T = +e.target.value; t2ClampTd(); t2ResetJourney(); });
$('t2-Td').addEventListener('input', e => { t2.Td = +e.target.value; t2ResetJourney(); });
$('t2-M').addEventListener('input', e => { t2.M = +e.target.value; t2ResetJourney(); });

/* ═══════════════════════════════════════════════════════════════
 * 탭 3 — ⚖️ 안정도 실험실
 * ═══════════════════════════════════════════════════════════════ */
const t3 = {
  gamma: 8, T: 30, Td: 22,
  h: 0, v: 0,
  forcing: false,  // ✊ 강제 상승 홀드 중
  pokeTarget: null, // 쿡 찌르기 목표 높이
  cloudTop: null,   // 구름 꼭대기 (도달 최고 포화 높이)
  hMax: 0           // 궤적 표시용 최고 도달 높이
};
const T3G = { yTop: 42, yGround: 572, xParcel: 150 };
T3G.yOf = h => T3G.yGround - h * ((T3G.yGround - T3G.yTop) / 5);

const t3scene = $('t3-scene');
const t3graph = $('t3-graph');
let t3el = {};

function t3BuildScene() {
  const svg = t3scene;
  const defs = el('defs', null, svg);
  const grad = el('linearGradient', { id: 't3sky', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: '0%', 'stop-color': '#8ec9f0' }, grad);
  el('stop', { offset: '100%', 'stop-color': '#dff2ff' }, grad);

  el('rect', { x: 0, y: 0, width: 460, height: T3G.yGround, fill: 'url(#t3sky)' }, svg);
  el('rect', { x: 0, y: T3G.yGround, width: 460, height: 48, fill: '#8fce7f' }, svg);

  for (let h = 0; h <= 5; h++) {
    const y = T3G.yOf(h);
    el('line', { x1: 72, y1: y, x2: 460, y2: y, stroke: '#ffffff', 'stroke-opacity': 0.55, 'stroke-width': h === 0 ? 0 : 1.5 }, svg);
    el('line', { x1: 64, y1: y, x2: 72, y2: y, stroke: '#38536d', 'stroke-width': 2 }, svg);
    el('text', { x: 60, y: y + 5, 'text-anchor': 'end', class: 'tick-label' }, svg).textContent = h + ' km';
  }

  t3el.cloud = el('g', { class: 'cloud-shape' }, svg);

  // 응결 고도 / 자유 대류 고도 점선
  const halo3 = { stroke: '#ffffff', 'stroke-width': 4, 'paint-order': 'stroke' };
  t3el.lclLine = el('line', { x1: 72, x2: 460, stroke: '#b8860b', 'stroke-width': 3, 'stroke-dasharray': '10 7' }, svg);
  t3el.lclLabel = el('text', Object.assign({ x: 452, 'text-anchor': 'end', class: 'lcl-label' }, halo3), svg);
  t3el.lfcLine = el('line', { x1: 72, x2: 460, stroke: '#c9500e', 'stroke-width': 3, 'stroke-dasharray': '4 6' }, svg);
  t3el.lfcLabel = el('text', Object.assign({ x: 452, 'text-anchor': 'end', class: 'lcl-label', fill: '#c9500e' }, halo3), svg);

  // 공기 덩어리
  const pg = el('g', null, svg);
  t3el.parcelG = pg;
  el('circle', { cx: 0, cy: 0, r: 24, fill: '#ffe9a8', 'fill-opacity': 0.9, stroke: '#e08a00', 'stroke-width': 3, 'stroke-dasharray': '7 5' }, pg);
  el('text', { x: 0, y: 7, 'text-anchor': 'middle', 'font-size': 20 }, pg).textContent = '💨';

  // 화살표 + 말풍선 (2줄)
  t3el.arrow = el('path', { opacity: 0 }, svg);
  const haloT = { stroke: '#eaf6ff', 'stroke-width': 4, 'paint-order': 'stroke' };
  t3el.arrowText = el('text', Object.assign({ class: 'badge-text', opacity: 0 }, haloT), svg);
  t3el.arrowText2 = el('text', Object.assign({ class: 'badge-text', opacity: 0 }, haloT), svg);

  // 상단 온도 비교 패널 (높이 눈금을 가리지 않게 오른쪽으로)
  const panel = el('g', null, svg);
  el('rect', { x: 90, y: 10, width: 340, height: 74, rx: 12, fill: '#ffffff', 'fill-opacity': 0.93, stroke: '#9fc9ea', 'stroke-width': 2 }, panel);
  el('text', { x: 106, y: 38, class: 'tick-label', 'font-size': 17 }, panel).textContent = '공기 덩어리';
  el('text', { x: 286, y: 38, class: 'tick-label', 'font-size': 17 }, panel).textContent = '주위 기온';
  t3el.readParcel = el('text', { x: 106, y: 70, class: 'big-num', 'font-size': 30 }, panel);
  t3el.readEnv = el('text', { x: 286, y: 70, class: 'big-num', 'font-size': 30 }, panel);
  el('text', { x: 250, y: 62, class: 'big-num', fill: '#888' }, panel).textContent = 'vs';
}

function t3BuildGraph() {
  const svg = t3graph;
  const X0 = 66, X1 = 444, Y0 = 572, Y1 = 42;
  const TMIN = -40, TMAX = 40;
  const gx = t => X0 + (t - TMIN) / (TMAX - TMIN) * (X1 - X0);
  const gy = h => Y0 - h / 5 * (Y0 - Y1);
  t3el.gx = gx; t3el.gy = gy;

  el('rect', { x: X0, y: Y1, width: X1 - X0, height: Y0 - Y1, fill: '#fbfdff', stroke: '#c9dded' }, svg);
  const clip = el('clipPath', { id: 't3clip' }, el('defs', null, svg));
  el('rect', { x: X0, y: Y1, width: X1 - X0, height: Y0 - Y1 }, clip);

  for (let t = TMIN; t <= TMAX; t += 10) {
    el('line', { x1: gx(t), y1: Y0, x2: gx(t), y2: Y1, stroke: '#e3eef7' }, svg);
    el('text', { x: gx(t), y: Y0 + 26, 'text-anchor': 'middle', class: 'tick-label' }, svg).textContent = t;
  }
  for (let h = 0; h <= 5; h++) {
    el('line', { x1: X0, y1: gy(h), x2: X1, y2: gy(h), stroke: '#e3eef7' }, svg);
    el('text', { x: X0 - 12, y: gy(h) + 5, 'text-anchor': 'end', class: 'tick-label' }, svg).textContent = h;
  }
  el('text', { x: (X0 + X1) / 2, y: 612, 'text-anchor': 'middle', class: 'axis-label' }, svg).textContent = '온도 (℃)';
  el('text', { x: 24, y: 307, 'text-anchor': 'middle', class: 'axis-label', transform: 'rotate(-90 24 307)' }, svg).textContent = '높이 (km)';

  const plot = el('g', { 'clip-path': 'url(#t3clip)' }, svg);
  t3el.gDry = el('polyline', { fill: 'none', stroke: '#e07b00', 'stroke-width': 3, 'stroke-dasharray': '10 7' }, plot);
  t3el.gMoist = el('polyline', { fill: 'none', stroke: '#7b52c9', 'stroke-width': 3, 'stroke-dasharray': '4 6' }, plot);
  t3el.gEnv = el('polyline', { fill: 'none', stroke: '#1a9e57', 'stroke-width': 4.5 }, plot);
  t3el.gTrail = el('polyline', { fill: 'none', stroke: '#d62828', 'stroke-width': 7, 'stroke-opacity': 0.4, 'stroke-linecap': 'round' }, plot);
  t3el.gDot = el('circle', { r: 8, fill: '#d62828', stroke: '#fff', 'stroke-width': 2.5 }, plot);

  // 범례: 플롯 우상단 (선들이 지나지 않는 영역)
  el('rect', { x: 288, y: 50, width: 164, height: 92, rx: 8, fill: '#ffffff', 'fill-opacity': 0.9, stroke: '#c9dded' }, svg);
  const leg = [
    ['#1a9e57', '주위 기온 (γ)', false],
    ['#e07b00', '건조 단열선 (10)', true],
    ['#7b52c9', '습윤 단열선 (5)', true],
    ['#d62828', '공기 덩어리 궤적', false]
  ];
  leg.forEach((L, i) => {
    const lx = 298, ly = 70 + i * 21;
    el('line', { x1: lx, y1: ly, x2: lx + 26, y2: ly, stroke: L[0], 'stroke-width': 4, 'stroke-dasharray': L[2] ? '7 5' : 'none' }, svg);
    el('text', { x: lx + 31, y: ly + 5, class: 'tick-label', 'font-size': 13.5 }, svg).textContent = L[1];
  });
}

function t3ResetSim() {
  t3.h = 0; t3.v = 0; t3.forcing = false; t3.pokeTarget = null;
  t3.cloudTop = null; t3.hMax = 0;
}

function t3CloudType() {
  const stab = Physics.stability(t3.gamma);
  if (stab === 'absolute-stable') return 'stratus';
  if (stab === 'absolute-unstable') return 'cumulus';
  const lfc = Physics.lfc(t3.T, t3.Td, t3.gamma);
  return (lfc != null && t3.cloudTop != null && t3.cloudTop > lfc + 0.02) ? 'cumulus' : 'stratus';
}

function t3Step(dt) {
  const H = Physics.lcl(t3.T, t3.Td);
  if (t3.pokeTarget != null) {
    t3.h = Math.min(t3.pokeTarget, t3.h + 1.4 * dt);
    if (t3.h >= t3.pokeTarget) { t3.pokeTarget = null; t3.v = 0; }
  } else if (t3.forcing) {
    t3.h = Math.min(5, t3.h + 0.7 * dt);
    t3.v = 0;
  } else {
    const buoy = Physics.buoyancy(t3.T, t3.Td, t3.gamma, t3.h);
    const a = 0.9 * buoy;
    t3.v += a * dt;
    t3.v *= Math.exp(-1.1 * dt); // 감쇠 (공기 저항)
    t3.h += t3.v * dt;
    if (t3.h <= 0) { t3.h = 0; t3.v = 0; }
    if (t3.h >= 5) { t3.h = 5; t3.v = 0; }
  }
  t3.hMax = Math.max(t3.hMax, t3.h);
  if (t3.h > H) t3.cloudTop = Math.max(t3.cloudTop ?? H, Math.min(t3.h, 5));
}

function t3Render() {
  const { gamma, T, Td, h } = t3;
  const H = Physics.lcl(T, Td);
  const lfc = Physics.lfc(T, Td, gamma);
  const par = Physics.parcel(T, Td, h);
  const env = Physics.envTemp(T, gamma, h);
  const buoy = par.temp - env;
  const stab = Physics.stability(gamma);

  $('t3-gamma-val').textContent = fmt(gamma, 1) + ' ℃/km';
  $('t3-T-val').textContent = fmt(T, 0) + ' ℃';
  $('t3-T-val').style.color = tempColor(T);
  $('t3-Td-val').textContent = fmt(Td, 0) + ' ℃';
  $('t3-Td-val').style.color = tempColor(Td);

  // 판정 배지
  const badge = $('t3-stab-badge');
  if (stab === 'absolute-stable') { badge.textContent = `절대 안정 (γ = ${fmt(gamma, 1)} < 5)`; badge.className = 'stab-badge stable'; }
  else if (stab === 'absolute-unstable') { badge.textContent = `절대 불안정 (γ = ${fmt(gamma, 1)} > 10)`; badge.className = 'stab-badge unstable'; }
  else { badge.textContent = `조건부 불안정 (5 ≤ γ = ${fmt(gamma, 1)} ≤ 10)`; badge.className = 'stab-badge conditional'; }

  // 프리셋 하이라이트
  $('t3-presets').querySelectorAll('button').forEach(b => b.classList.toggle('active', +b.dataset.g === gamma));

  // 점선들
  const yH = T3G.yOf(Math.min(H, 5));
  setAttrs(t3el.lclLine, { y1: yH, y2: yH, opacity: H <= 5 ? 1 : 0 });
  setAttrs(t3el.lclLabel, { y: yH - 8, opacity: H <= 5 ? 1 : 0 });
  t3el.lclLabel.textContent = `응결 고도 H = ${fmt(H, 2)} km`;
  if (stab === 'conditional' && lfc != null && lfc <= 5) {
    const yL = T3G.yOf(lfc);
    setAttrs(t3el.lfcLine, { y1: yL, y2: yL, opacity: 1 });
    setAttrs(t3el.lfcLabel, { y: yL - 8, opacity: 1 });
    t3el.lfcLabel.textContent = `자유 대류 시작 고도 = ${fmt(lfc, 2)} km`;
  } else {
    t3el.lfcLine.setAttribute('opacity', 0);
    t3el.lfcLabel.setAttribute('opacity', 0);
  }

  // 공기 덩어리
  const py = T3G.yOf(h) - 26;
  t3el.parcelG.setAttribute('transform', `translate(${T3G.xParcel} ${py})`);

  // 온도 표시
  t3el.readParcel.textContent = `${fmt(par.temp)} ℃`;
  t3el.readParcel.setAttribute('fill', tempColor(par.temp));
  t3el.readEnv.textContent = `${fmt(env)} ℃`;
  t3el.readEnv.setAttribute('fill', tempColor(env));

  // 화살표 + 말풍선
  const free = t3.pokeTarget == null && !t3.forcing;
  if (free && h > 0.02 && Math.abs(buoy) > 0.05) {
    const up = buoy > 0;
    const ax = T3G.xParcel + 52;
    const d = up
      ? `M ${ax} ${py + 22} L ${ax} ${py - 22} M ${ax - 11} ${py - 9} L ${ax} ${py - 24} L ${ax + 11} ${py - 9}`
      : `M ${ax} ${py - 22} L ${ax} ${py + 22} M ${ax - 11} ${py + 9} L ${ax} ${py + 24} L ${ax + 11} ${py + 9}`;
    setAttrs(t3el.arrow, { d, stroke: up ? '#d62828' : '#1d6fd8', 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 1 });
    const tx = ax + 18;
    const ty = Math.max(112, Math.min(T3G.yGround - 34, py - 4));
    setAttrs(t3el.arrowText, { x: tx, y: ty, fill: up ? '#a51d1d' : '#10508f', opacity: 1 });
    setAttrs(t3el.arrowText2, { x: tx, y: ty + 24, fill: up ? '#a51d1d' : '#10508f', opacity: 1 });
    t3el.arrowText.textContent = up
      ? `주위보다 따뜻해요! +${fmt(buoy)} ℃`
      : `주위보다 차가워요 −${fmt(Math.abs(buoy))} ℃`;
    t3el.arrowText2.textContent = up ? '→ 스스로 상승!' : '→ 원위치로 하강';
  } else if (t3.forcing) {
    setAttrs(t3el.arrow, { opacity: 0 });
    setAttrs(t3el.arrowText, { x: T3G.xParcel + 60, y: Math.max(112, py + 6), fill: '#7a4a12', opacity: 1 });
    t3el.arrowText.textContent = '✊ 강제 상승 중…';
    t3el.arrowText2.setAttribute('opacity', 0);
  } else {
    t3el.arrow.setAttribute('opacity', 0);
    t3el.arrowText.setAttribute('opacity', 0);
    t3el.arrowText2.setAttribute('opacity', 0);
  }

  // 구름
  t3el.cloud.innerHTML = '';
  const cloudExists = t3.cloudTop != null && t3.cloudTop > H + 0.05;
  let ctype = null;
  if (cloudExists) {
    ctype = t3CloudType();
    const yBase = T3G.yOf(H);
    const yTop = T3G.yOf(Math.min(t3.cloudTop, 5));
    if (ctype === 'stratus') {
      // 층운형: 얇고 옆으로 넓게
      for (let r = 0; r < 3; r++) {
        for (let i = 0; i < 5; i++) {
          el('ellipse', {
            cx: 105 + i * 78 + (r % 2) * 28, cy: yBase - 8 - r * 13,
            rx: 58, ry: 13, fill: r === 1 ? '#f0f5fb' : '#ffffff', opacity: 0.92
          }, t3el.cloud);
        }
      }
      el('text', { x: 240, y: yBase + 26, 'text-anchor': 'middle', class: 'badge-text', fill: '#10508f' }, t3el.cloud)
        .textContent = '층운형 구름 (옆으로 퍼짐)';
    } else {
      // 적운형: 수직으로 두껍게 (탑 모양)
      const levels = Math.max(2, Math.round((yBase - yTop) / 26));
      for (let i = 0; i <= levels; i++) {
        const f = i / levels;
        const cy = yBase - (yBase - yTop) * f;
        const w = 78 - 26 * f;
        makePuff(t3el.cloud, 250 + Math.sin(i * 2.1) * 16, cy - 6, w, 24, f > 0.75 ? '#ffffff' : '#f2f6fb', 0.94);
      }
      makePuff(t3el.cloud, 250, yTop - 16, 66, 26, '#ffffff', 0.97);
      el('text', { x: 250, y: yBase + 26, 'text-anchor': 'middle', class: 'badge-text', fill: '#a34009' }, t3el.cloud)
        .textContent = '적운형 구름 (수직 발달!)';
    }
  }

  // 그래프
  const { gx, gy } = t3el;
  const pl = s => s.map(q => `${gx(q[0])},${gy(q[1])}`).join(' ');
  t3el.gEnv.setAttribute('points', pl([[T, 0], [T - gamma * 5, 5]]));
  t3el.gDry.setAttribute('points', pl([[T, 0], [T - 50, 5]]));
  const tH = T - 10 * H;
  t3el.gMoist.setAttribute('points', H <= 5 ? pl([[tH, H], [tH - 5 * (5 - H), 5]]) : '');
  // 궤적: 지표 → (도달 최고 높이까지) 단열선 경로
  const trail = [[T, 0]];
  if (t3.hMax > 0) {
    if (t3.hMax >= H) {
      trail.push([tH, H], [tH - 5 * (t3.hMax - H), t3.hMax]);
    } else {
      trail.push([T - 10 * t3.hMax, t3.hMax]);
    }
  }
  t3el.gTrail.setAttribute('points', pl(trail));
  setAttrs(t3el.gDot, { cx: gx(par.temp), cy: gy(h) });

  // 미션 실시간 안내 + 판정
  if (modeState.tab3 === 'mission') {
    const idx = activeMissionIdx('tab3');
    const thick = cloudExists ? (Math.min(t3.cloudTop, 5) - H) : 0;
    const typeTxt = cloudExists ? (ctype === 'stratus' ? '층운형' : '적운형') : '없음';
    if (idx === 0) setMissionLive('tab3', `현재 구름: ${typeTxt} (두께 ${fmt(thick, 2)} km)`);
    if (idx === 1) setMissionLive('tab3', `현재 구름: ${typeTxt} (두께 ${fmt(thick, 2)} km / 목표 ${fmt(TUNING.tab3.m2_minThickness, 1)} km 이상)`);
    if (idx === 2) setMissionLive('tab3', `안정도: ${stab === 'conditional' ? '조건부 불안정 ✓' : '조건부 불안정이 아니에요!'} · 구름: ${typeTxt}`);
  }
  checkMission('tab3', t3Checkers);
}

const t3Checkers = [
  () => {
    const H = Physics.lcl(t3.T, t3.Td);
    return t3.cloudTop != null && t3CloudType() === 'stratus' && (Math.min(t3.cloudTop, 5) - H) >= TUNING.tab3.m1_minThickness;
  },
  () => {
    const H = Physics.lcl(t3.T, t3.Td);
    return t3.cloudTop != null && t3CloudType() === 'cumulus' && (Math.min(t3.cloudTop, 5) - H) >= TUNING.tab3.m2_minThickness;
  },
  () => {
    const H = Physics.lcl(t3.T, t3.Td);
    return Physics.stability(t3.gamma) === 'conditional' &&
      t3.cloudTop != null && t3CloudType() === 'cumulus' &&
      (Math.min(t3.cloudTop, 5) - H) >= TUNING.tab3.m3_minThickness;
  }
];

$('t3-gamma').addEventListener('input', e => { t3.gamma = +e.target.value; t3ResetSim(); t3Render(); });
$('t3-presets').querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => {
    t3.gamma = +b.dataset.g;
    $('t3-gamma').value = t3.gamma;
    t3ResetSim(); t3Render();
  });
});
function t3ClampTd() {
  const s = $('t3-Td');
  s.max = t3.T - 1;
  if (t3.Td > t3.T - 1) { t3.Td = t3.T - 1; s.value = t3.Td; }
}
$('t3-T').addEventListener('input', e => { t3.T = +e.target.value; t3ClampTd(); t3ResetSim(); t3Render(); });
$('t3-Td').addEventListener('input', e => { t3.Td = +e.target.value; t3ResetSim(); t3Render(); });
$('t3-poke').addEventListener('click', () => { t3.pokeTarget = Math.max(0.5, t3.h); t3.forcing = false; });
$('t3-reset').addEventListener('click', () => { t3ResetSim(); t3Render(); });
{
  const fb = $('t3-force');
  fb.style.touchAction = 'none';
  fb.addEventListener('pointerdown', ev => { ev.preventDefault(); t3.forcing = true; t3.pokeTarget = null; });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => fb.addEventListener(t, () => { t3.forcing = false; }));
}

/* ═══════════ 메인 루프 ═══════════ */
let lastTs = null;
function loop(ts) {
  const dt = lastTs == null ? 0 : Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  if ($('tab2').classList.contains('active') && t2.playing) {
    t2.p = Math.min(1, t2.p + dt / 8); // 여정 전체 약 8초
    $('t2-progress').value = Math.round(t2.p * 1000);
    if (t2.p >= 1) t2Complete();
    t2Render();
  }
  if ($('tab3').classList.contains('active')) {
    t3Step(dt);
    t3Render();
  }
  requestAnimationFrame(loop);
}

/* ═══════════ 초기화 ═══════════ */
t1BuildScene(); t1BuildGraph(); t1SetupDrag(); t1ClampTd();
t2BuildScene(); t2BuildGraph(); t2ClampTd();
t3BuildScene(); t3BuildGraph(); t3ClampTd();
renderStarHeader();
TABS.forEach(renderMissionPanel);
t1Render(); t2Render(); t3Render();
requestAnimationFrame(loop);
