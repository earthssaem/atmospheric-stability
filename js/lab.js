/**
 * lab.js — 세 실험실이 함께 쓰는 틀
 *  - 화면 뼈대(조건 → 장면|그래프 패널 → 현재 수치 → 조작부 → 펼쳐 보기)
 *  - 패널 크기 계산: 장면과 그래프가 같은 높이를 같은 세로 위치에 그리도록 실제 픽셀 크기로 좌표를 잡는다
 *  - 그래프 축, 현재 수치 칸, 조작부, 도전 활동
 */
'use strict';

/* ═════════ 뼈대 ═════════ */
function makeShell(root, cfg) {
  const cond = h('div', { class: 'cond-bar' });
  const sceneHead = h('div', { class: 'pane-head' }, h('span', { class: 'pane-title', html: cfg.sceneTitle }));
  const graphLegend = h('div', { class: 'legend' });
  const graphHead = h('div', { class: 'pane-head' }, h('span', { class: 'pane-title', html: cfg.graphTitle }), graphLegend);
  const sceneSvg = s('svg', { role: 'img', 'aria-label': cfg.sceneLabel });
  const graphSvg = s('svg', { role: 'img', 'aria-label': cfg.graphLabel });
  const scenePane = h('div', { class: 'pane scene-pane', style: { '--ratio': cfg.ratio } }, sceneHead, sceneSvg);
  const graphPane = h('div', { class: 'pane graph-pane' }, graphHead, graphSvg);
  const panel = h('div', { class: 'lab-panel' }, scenePane, graphPane);
  const ro = h('div', { class: 'readouts' });
  const ctrl = h('div', { class: 'ctrl-bar' });
  const more = h('div', { class: 'more' });
  root.append(cond, panel, ro, ctrl, more);
  const sh = { root, cond, panel, scenePane, graphPane, sceneHead, graphHead, graphLegend, sceneSvg, graphSvg, ro, ctrl, more, frame: null, cfg };
  return sh;
}

/**
 * 패널 크기 정하기 → 프레임(좌표계) 만들기
 * 장면과 그래프 SVG는 같은 높이(H)와 같은 위·아래 여백을 쓰므로 yOf(z)가 두 영역에서 같은 세로 위치가 된다.
 */
function layoutShell(sh) {
  if (!sh.root.classList.contains('active')) return null;
  const panelW = sh.panel.clientWidth;
  const stacked = panelW < 680;
  sh.panel.classList.toggle('stacked', stacked);
  sh.ro.classList.toggle('sticky', stacked);
  // 좁은 화면: 현재 수치를 그림 위로 올려 붙여 둔다 (스크롤해도 보임)
  if (stacked && sh.ro.nextElementSibling !== sh.panel) sh.root.insertBefore(sh.ro, sh.panel);
  if (!stacked && sh.panel.nextElementSibling !== sh.ro) sh.root.insertBefore(sh.ro, sh.ctrl);
  let H;
  const fit = !stacked && window.innerWidth >= 900 && window.innerHeight >= 520;
  if (fit) {
    const svgTop = sh.sceneSvg.getBoundingClientRect().top + window.scrollY;
    const below = (sh.bottomEl || sh.ctrl).getBoundingClientRect().bottom - sh.panel.getBoundingClientRect().bottom;
    H = window.innerHeight - svgTop - below - 1 - 10;
    H = clamp(H, 270, 760);
  } else if (!stacked) {
    H = clamp(panelW * 0.62, 340, 620);
  } else {
    H = clamp(panelW * 0.92, 300, 440);
  }
  H = Math.round(H);
  [sh.sceneSvg, sh.graphSvg].forEach(svg => { svg.style.height = H + 'px'; });
  const sw = Math.max(10, Math.round(sh.sceneSvg.clientWidth)), gw = Math.max(10, Math.round(sh.graphSvg.clientWidth));
  sh.sceneSvg.setAttribute('viewBox', `0 0 ${sw} ${H}`);
  sh.graphSvg.setAttribute('viewBox', `0 0 ${gw} ${H}`);
  const zMin = sh.cfg.zMin || 0, zMax = sh.cfg.zMax;
  const top = 18, bottom = 58;
  const f = {
    sceneW: sw, graphW: gw, H, top, bottom, zMin, zMax, stacked,
    yOf: z => top + (zMax - z) / (zMax - zMin) * (H - top - bottom),
    hOf: y => zMax - (y - top) / (H - top - bottom) * (zMax - zMin)
  };
  sh.frame = f;
  return f;
}

/* ═════════ 그래프 축 (가로: 온도, 세로: 높이) ═════════ */
function drawAxes(g, f, xr, opt) {
  clear(g);
  opt = opt || {};
  const X0 = 64, X1 = f.graphW - 18, Y0 = f.yOf(f.zMin), Y1 = f.yOf(f.zMax);
  const gx = t => X0 + (t - xr.min) / (xr.max - xr.min) * (X1 - X0);
  const tOf = x => xr.min + (x - X0) / (X1 - X0) * (xr.max - xr.min);
  const clipId = uid('clip');
  s('rect', { x: X0, y: Y1 - 1, width: X1 - X0, height: Y0 - Y1 + 2 }, s('clipPath', { id: clipId }, s('defs', null, g)));
  s('rect', { x: X0, y: Y1, width: X1 - X0, height: Y0 - Y1, fill: '#FCFCFA' }, g);
  const bg = s('g', { 'clip-path': `url(#${clipId})` }, g);
  const grid = s('g', null, g);
  for (let z = f.zMin; z <= f.zMax + 1e-9; z += 0.5) {
    const major = Math.abs(z - Math.round(z)) < 1e-9;
    s('line', { x1: X0, x2: X1, y1: f.yOf(z), y2: f.yOf(z), stroke: major ? '#E6E2D8' : '#F1EEE7', 'stroke-width': 1 }, grid);
    if (major) {
      s('line', { x1: X0 - 6, x2: X0, y1: f.yOf(z), y2: f.yOf(z), stroke: '#8D959C', 'stroke-width': 1.5 }, grid);
      txt({ x: X0 - 10, y: f.yOf(z) + 5, 'text-anchor': 'end', class: 'tk' }, fmt(z, 0), grid);
    }
  }
  const minorStep = xr.step / (xr.step >= 10 ? 2 : 1);
  for (let t = xr.min; t <= xr.max + 1e-9; t += minorStep) {
    const major = Math.abs(((t - xr.min) / xr.step) - Math.round((t - xr.min) / xr.step)) < 1e-9;
    s('line', { x1: gx(t), x2: gx(t), y1: Y0, y2: Y1, stroke: major ? '#E6E2D8' : '#F1EEE7', 'stroke-width': 1 }, grid);
    if (major) {
      s('line', { x1: gx(t), x2: gx(t), y1: Y0, y2: Y0 + 6, stroke: '#8D959C', 'stroke-width': 1.5 }, grid);
      txt({ x: gx(t), y: Y0 + 22, 'text-anchor': 'middle', class: 'tk' }, fmt(t, 0), grid);
    }
  }
  s('line', { x1: X0, x2: X1, y1: Y0, y2: Y0, stroke: '#8D959C', 'stroke-width': 1.5 }, grid);
  s('line', { x1: X0, x2: X0, y1: Y0, y2: Y1, stroke: '#8D959C', 'stroke-width': 1.5 }, grid);
  txt({ x: (X0 + X1) / 2, y: Y0 + 46, 'text-anchor': 'middle', class: 'ax-title' }, '온도 (℃)', g);
  const ty = (Y0 + Y1) / 2;
  txt({ x: 18, y: ty, 'text-anchor': 'middle', class: 'ax-title', transform: `rotate(-90 18 ${ty})` }, '높이 (km)', g);
  txt({ x: X0 + 4, y: Y0 - 6, class: 'lb-sm', fill: '#8D959C' }, '지표', g);
  const plot = s('g', { 'clip-path': `url(#${clipId})` }, g);
  const over = s('g', null, g);
  return { gx, tOf, X0, X1, Y0, Y1, plot, over, bg, xr };
}
function pathD(points, ax, f) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${ax.gx(p[0]).toFixed(1)} ${f.yOf(p[1]).toFixed(1)}`).join(' ');
}
/** 축 밖으로 나간 점을 가장자리에 표시 (사라지지 않게) */
function edgeMarker(g, ax, f, t, z, color) {
  const x = ax.gx(t);
  if (x >= ax.X0 && x <= ax.X1) return null;
  const left = x < ax.X0, ex = left ? ax.X0 + 10 : ax.X1 - 10, y = f.yOf(z);
  const m = s('g', null, g);
  s('path', { d: left ? `M${ex - 6} ${y} l10 -7 v14 z` : `M${ex + 6} ${y} l-10 -7 v14 z`, fill: color }, m);
  txt({ x: left ? ex + 8 : ex - 8, y: y - 9, 'text-anchor': left ? 'start' : 'end', class: 'lb-sm halo', fill: color }, fT(t) + ' ℃', m);
  return m;
}

/* ═════════ 현재 수치 칸 ═════════ */
function Readouts(container, defs) {
  clear(container);
  container.style.setProperty('--cells', defs.length);
  const cells = {};
  defs.forEach(d => {
    const v = h('div', { class: 'v' }), sub = h('div', { class: 'sub' });
    container.appendChild(h('div', { class: 'ro ' + (d.cls || '') }, h('div', { class: 'k', html: d.label }), v, sub));
    cells[d.key] = { v, sub };
  });
  const guide = h('div', { class: 'ro-guide', 'aria-live': 'polite' });
  container.appendChild(guide);
  let lastGuide = '';
  return {
    set(key, html, sub) {
      const c = cells[key];
      if (c.v.innerHTML !== html) c.v.innerHTML = html;
      const sb = sub || '';
      if (c.sub.innerHTML !== sb) { c.sub.innerHTML = sb; c.sub.title = stripTags(sb); }
    },
    guide(stateLabel, stateCls, html) {
      const g = (stateLabel ? `<span class="state ${stateCls || ''}">${stateLabel}</span>` : '') + `<span>${html}</span>`;
      if (g !== lastGuide) { guide.innerHTML = g; lastGuide = g; }
    }
  };
}

/* ═════════ 조작부 (세 탭 공통 이름과 위치) ═════════ */
function ControlBar(container, hd) {
  clear(container);
  const play = Btn('▶ 재생', 'primary play', () => hd.play(), { 'aria-label': '재생' });
  const prev = Btn('◀ 이전 단계', '', () => hd.prev());
  const next = Btn('다음 단계 ▶', '', () => hd.next());
  const slot = h('div', { class: 'slot' });
  const reset = Btn('↺ 움직임 처음으로', '', () => hd.reset(), { title: '지금 조건 그대로 출발점으로 돌아가요' });
  const defaults = Btn('조건 기본값', '', () => hd.defaults(), { title: '이 탭의 기본 실험 조건으로 되돌려요' });
  container.append(play, prev, next, slot, h('div', { class: 'tail' }, reset, defaults));
  return {
    slot, play, prev, next,
    setPlay(playing, label) {
      const t = playing ? '⏸ 일시정지' : (label || '▶ 재생');
      if (play.innerHTML !== t) { play.innerHTML = t; play.setAttribute('aria-label', t.replace(/^[^ ]+ /, '')); }
    },
    setStep(canPrev, canNext) { prev.disabled = !canPrev; next.disabled = !canNext; }
  };
}

/* ═════════ 비교용으로 남기기 ═════════ */
function CompareUI(container, onSave, onClear) {
  const tag = h('span', { class: 'cmp-tag', hidden: true });
  const save = Btn('비교용으로 남기기', 'sm', onSave, { title: '지금 조건과 결과를 옅은 선으로 남겨 두어요' });
  const del = Btn('비교 지우기', 'sm', onClear);
  del.hidden = true;
  container.append(tag, save, del);
  return {
    show(label) {
      tag.hidden = !label; del.hidden = !label;
      if (label) tag.innerHTML = `<i></i>비교: ${label}`;
    }
  };
}

/* ═════════ 도전 활동 ═════════
 * item: {id, title, goal, hints: [무엇을 비교할지, 관계, 계산식], setup?(lab), check(lab, since) → true | {ok, msg},
 *        extra?(lab, item, rerender) → 요소, success: 문장}
 * 도전을 시작한 뒤에 일어난 일(lab.events 중 seq > since)만 판정에 쓴다. */
/** 추가 실험 목록: [{t, d, run}] → 「실험 준비」 버튼이 달린 줄들 */
function expList(exps) {
  const list = h('div', { class: 'exp-list' });
  exps.forEach(e => list.appendChild(h('div', { class: 'exp' }, h('div', null, h('div', { class: 't', text: e.t }), h('div', { class: 'd', text: e.d })), Btn('실험 준비', 'sm', e.run))));
  return list;
}

function Challenges(container, lab, items) {
  const st = { active: null, since: 0 };
  items.forEach(it => { it.done = false; it.hint = 0; it.msg = ''; });
  const list = h('div', { class: 'ch-list' });
  const one = items.length === 1;
  container.append(list);
  function render() {
    clear(list);
    items.forEach((it, i) => {
      const active = st.active === it.id;
      const card = h('div', { class: 'ch' + (active ? ' active' : '') + (it.done ? ' done' : '') });
      card.appendChild(h('div', { class: 'ch-head' }, h('span', { class: 'ch-title', text: one ? `도전: ${it.title}` : `${i + 1}. ${it.title}` }),
        h('span', { class: 'ch-badge', text: it.done ? '완료 ✓' : active ? '도전 중' : '시작 전' })));
      card.appendChild(h('p', { class: 'ch-goal', html: it.goal }));
      if (active && !it.done) {
        if (it.extra) { const ex = it.extra(lab, it, render); if (ex) card.appendChild(ex); }
        if (it.msg) card.appendChild(h('div', { class: 'ch-no', html: it.msg }));
        const hl = h('ul', { class: 'ch-hints' });
        for (let k = 0; k < it.hint; k++) hl.appendChild(h('li', { html: `힌트 ${k + 1}. ${it.hints[k]}` }));
        card.appendChild(hl);
        const row = h('div', { class: 'ch-row' });
        if (it.hint < it.hints.length) row.appendChild(Btn(`힌트 보기 (${it.hint + 1}/${it.hints.length})`, 'sm', () => { it.hint += 1; render(); }));
        row.appendChild(Btn('그만하기', 'sm', () => { st.active = null; render(); }));
        card.appendChild(row);
      } else if (it.done) {
        card.appendChild(h('div', { class: 'ch-ok', html: '✓ ' + it.success }));
        const nxt = items[i + 1];
        if (active && nxt) card.appendChild(h('div', { class: 'ch-row' }, Btn('다음 실험 ▶', 'sm accent', () => start(nxt.id))));
      } else {
        card.appendChild(h('div', { class: 'ch-row' }, Btn('도전 시작', 'sm accent', () => start(it.id))));
      }
      list.appendChild(card);
    });
  }
  function start(id) {
    const it = items.find(x => x.id === id);
    st.active = id;
    it.msg = '';
    if (it.setup) it.setup(lab);
    st.since = lab.seq;   // 시작 뒤에 일어난 일만 판정
    render();
  }
  function check() {
    if (!st.active) return;
    const it = items.find(x => x.id === st.active);
    if (!it || it.done) return;
    if (it.ready) {           // 조건이 갖춰지면 선택지가 나타나도록 다시 그림
      const sg = String(!!it.ready(lab, st.since));
      if (sg !== it._sig) { it._sig = sg; render(); }
    }
    const r = it.check(lab, st.since);
    const okv = r === true || (r && r.ok);
    if (r && r.msg !== undefined && r.msg !== it.msg) { it.msg = r.msg; render(); }
    if (okv) {
      it.done = true; it.msg = '';
      toast(`<b>✓ 도전 완료</b> ${it.title}`);
      render();
    }
  }
  render();
  return { check, render, st, items };
}

/** 실험실 공통 상태: 사건 기록(도전 활동 판정용) */
function baseLab() {
  return {
    seq: 0, events: [],
    emit(type, data) { this.seq += 1; this.events.push(Object.assign({ seq: this.seq, type }, data || {})); if (this.events.length > 400) this.events.shift(); },
    since(seq, type) { return this.events.filter(e => e.seq > seq && (!type || e.type === type)); }
  };
}

/* ═════════ 공기 덩어리 그림 (반투명한 둥근 모양, 포화되면 작은 물방울) ═════════ */
function makeParcel(parent, opt) {
  opt = opt || {};
  const g = s('g', { class: opt.drag ? 'drag' : '' }, parent);
  const body = s('circle', { r: 20, fill: 'rgba(255,255,255,.55)', stroke: '#5F6E7B', 'stroke-width': 2, 'stroke-dasharray': '5 4' }, g);
  const ring = s('circle', { r: 24, fill: 'none', stroke: 'transparent', class: 'focus-ring' }, g);
  const drops = s('g', null, g);
  const R = rng(opt.seed || 5);
  const pts = [];
  for (let i = 0; i < 12; i++) { const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 0.72; pts.push([Math.cos(a) * d, Math.sin(a) * d]); }
  const dots = pts.map(() => s('circle', { r: 2.4, fill: '#5B8DB8' }, drops));
  if (opt.drag) s('circle', { r: 34, fill: 'transparent' }, g);
  let last = '';
  return {
    g,
    /** r: 반지름(px), wet: 0~1 응결수의 정성적 양 */
    set(x, y, r, wet) {
      g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      const key = `${r.toFixed(1)}|${wet.toFixed(2)}`;
      if (key === last) return;
      last = key;
      sa(body, { r, fill: wet > 0 ? 'rgba(255,255,255,.88)' : 'rgba(255,255,255,.55)', stroke: wet > 0 ? '#5B8DB8' : '#5F6E7B' });
      sa(ring, { r: r + 4 });
      const n = wet > 0 ? Math.max(3, Math.round(12 * wet)) : 0;
      dots.forEach((d, i) => sa(d, { cx: (pts[i][0] * r).toFixed(1), cy: (pts[i][1] * r).toFixed(1), opacity: i < n ? 1 : 0 }));
    }
  };
}

/** 하늘 배경 */
function skyGradient(svg, id) {
  const defs = s('defs', null, svg);
  const g = s('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  s('stop', { offset: '0%', 'stop-color': '#CFE6F5' }, g);
  s('stop', { offset: '100%', 'stop-color': '#EEF6FB' }, g);
  return `url(#${id})`;
}

/* ═════════ 구름 그림 (여러 원을 합친 하나의 덩어리, 밑면은 평평) ═════════ */
function cloudShape(parent, box, build, opacity) {
  const id = uid('cl');
  const g = s('g', { opacity: opacity == null ? 0.96 : opacity }, parent);
  const defs = s('defs', null, g);
  const cp = s('clipPath', { id }, defs);
  const grad = s('linearGradient', { id: id + 'g', gradientUnits: 'userSpaceOnUse', x1: 0, y1: box.y0, x2: 0, y2: box.y1 }, defs);
  [['0%', '#FFFFFF'], ['70%', '#F5F8FA'], ['100%', '#D9E1E8']].forEach(([o, c]) => s('stop', { offset: o, 'stop-color': c }, grad));
  build({ circle: (cx, cy, r) => s('circle', { cx, cy, r }, cp), rect: (x, y, w, h2, rx) => s('rect', { x, y, width: Math.max(0, w), height: Math.max(0, h2), rx: rx || 0 }, cp) });
  s('rect', { x: box.x0, y: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0, fill: `url(#${id}g)`, 'clip-path': `url(#${id})` }, g);
  return g;
}
/** 밑면이 baseY인 뭉게구름 (정성적 표현) */
function puffCloud(parent, cx, baseY, topY, halfW, seed, opacity) {
  const R = rng(seed || 7);
  const hgt = Math.max(10, baseY - topY);
  const r = clamp(hgt * 0.42, 9, halfW * 0.6);
  return cloudShape(parent, { x0: cx - halfW - r, y0: topY - r, x1: cx + halfW + r, y1: baseY }, c => {
    c.rect(cx - halfW, Math.min(baseY - 4, topY + r * 0.8), 2 * halfW, Math.max(4, baseY - topY - r * 0.8), r * 0.5);
    const n = Math.max(2, Math.round(halfW * 2 / (r * 1.1)));
    for (let i = 0; i <= n; i++) {
      const x = cx - halfW + (2 * halfW) * i / n;
      const lift = Math.sin(Math.PI * i / n) * r * 0.5;
      c.circle(x + (R() - 0.5) * 4, topY + r * 0.9 - lift, r * (0.8 + 0.35 * R()));
    }
    const rows = Math.floor((baseY - topY - r) / (r * 0.9));
    for (let k = 1; k <= rows; k++) {
      const y = topY + r + k * r * 0.9;
      c.circle(cx - halfW + (R() - 0.5) * 3, y, r * (0.7 + 0.3 * R()));
      c.circle(cx + halfW + (R() - 0.5) * 3, y, r * (0.7 + 0.3 * R()));
    }
  }, opacity);
}
/** 넓게 퍼진 층운형 구름 (정성적 표현) */
function layerCloud(parent, x0, x1, baseY, th, seed, opacity) {
  const R = rng(seed || 11);
  return cloudShape(parent, { x0: x0 - 20, y0: baseY - th - 12, x1: x1 + 20, y1: baseY }, c => {
    c.rect(x0, baseY - th * 0.7, x1 - x0, th * 0.7, th * 0.3);
    const n = Math.max(3, Math.round((x1 - x0) / 28));
    for (let i = 0; i <= n; i++) c.circle(x0 + (x1 - x0) * i / n + (R() - 0.5) * 8, baseY - th * 0.55, th * (0.45 + 0.25 * R()));
  }, opacity);
}

/* ═════════ 그래프 현재 점: 기온(빨간 원) · 이슬점(파란 마름모), 같으면 겹친 표시 ═════════ */
function PointPair(parent, o) {
  o = o || {};
  const g = s('g', null, parent);
  const gap = s('line', { stroke: '#7E8891', 'stroke-width': 2 }, g);
  const D = s('path', { fill: o.dShape === 'square' ? 'var(--env)' : 'var(--dew)', stroke: '#fff', 'stroke-width': 1.5 }, g);
  const T = s('circle', { r: 7, fill: 'var(--temp)', stroke: '#fff', 'stroke-width': 2 }, g);
  const both = s('g', null, g);
  s('circle', { r: 9, fill: '#fff', stroke: 'var(--temp)', 'stroke-width': 3 }, both);
  s('path', { d: 'M0 -5 L5 0 L0 5 L-5 0 Z', fill: o.dShape === 'square' ? 'var(--env)' : 'var(--dew)' }, both);
  return {
    g,
    set(xT, xD, y, same, show) {
      const vis = show === false ? 0 : 1;
      sa(T, { cx: xT, cy: y, opacity: same ? 0 : vis });
      const d = o.dShape === 'square'
        ? `M${xD - 6} ${y - 6} h12 v12 h-12 Z`
        : `M${xD} ${y - 7} L${xD + 7} ${y} L${xD} ${y + 7} L${xD - 7} ${y} Z`;
      sa(D, { d, opacity: same ? 0 : vis });
      sa(both, { transform: `translate(${xT} ${y})`, opacity: same ? vis : 0 });
      const l = Math.min(xT, xD) + 9, r = Math.max(xT, xD) - 9;
      sa(gap, { x1: l, x2: r, y1: y, y2: y, opacity: !same && r - l > 8 ? vis : 0 });
    }
  };
}
/** 선 위에 진행 방향 화살표(작은 갈매기 모양) */
function chevrons(parent, pts, ax, f, color, every) {
  const g = s('g', null, parent);
  for (let i = 0; i < pts.length - 1; i++) {
    const x1 = ax.gx(pts[i][0]), y1 = f.yOf(pts[i][1]), x2 = ax.gx(pts[i + 1][0]), y2 = f.yOf(pts[i + 1][1]);
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 30) continue;
    const n = Math.max(1, Math.floor(len / (every || 90)));
    const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      s('path', { d: 'M-5 -6 L4 0 L-5 6', fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: `translate(${lerp(x1, x2, t)} ${lerp(y1, y2, t)}) rotate(${ang})` }, g);
    }
  }
  return g;
}
