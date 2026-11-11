/**
 * common.js — 공통 도구: DOM/SVG 만들기, 조작 부품(슬라이더 등), 탭 전환, 미션·별, 축하 효과
 */
'use strict';

/* ═══════════ DOM · SVG 도우미 ═══════════ */
const SVGNS = 'http://www.w3.org/2000/svg';
const $ = id => document.getElementById(id);

/** HTML 요소 만들기: h('div', {class:'x', onclick: fn}, child1, 'text') */
function h(tag, props, ...kids) {
  const n = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
  }
  kids.flat().forEach(c => {
    if (c == null || c === false) return;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return n;
}

/** SVG 요소 만들기 */
function s(tag, attrs, parent) {
  const n = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function txt(attrs, text, parent) {
  const n = s('text', attrs, parent);
  n.textContent = text;
  return n;
}
function sa(n, attrs) { for (const k in attrs) n.setAttribute(k, attrs[k]); return n; }
function svgRoot(viewW, viewH, label, cls) {
  return s('svg', { viewBox: `0 0 ${viewW} ${viewH}`, role: 'img', 'aria-label': label, class: cls || '' });
}
function svgPoint(svg, ev) {
  const pt = svg.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

/* ═══════════ 숫자 · 색 ═══════════ */
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function fmt(x, d = 1) {
  let str = Number(x).toFixed(d);
  if (parseFloat(str) === 0) str = (0).toFixed(d);
  return str.replace('-', '−');
}
function signed(x, d = 1) { return (x > 0 ? '+' : '') + fmt(x, d); }
/** 소수점 아래 쓸데없는 0을 지운 표시 (12.50 → 12.5, 20.00 → 20) */
function fmtS(x, d = 2) {
  let str = Number(x).toFixed(d).replace(/\.?0+$/, '');
  if (str === '-0' || str === '') str = '0';
  return str.replace('-', '−');
}
/** 온도 색: −30 ℃(파랑) ~ 40 ℃(빨강) */
function tempColor(t) {
  const f = clamp((t + 30) / 70, 0, 1);
  const hue = 222 - 214 * f;
  const light = 42 - 6 * Math.sin(f * Math.PI);
  return `hsl(${hue.toFixed(0)} 72% ${light.toFixed(0)}%)`;
}
/** 결정적 의사 난수 (구름 모양이 매 프레임 흔들리지 않게) */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let _uid = 0;
function uid(prefix) { _uid += 1; return (prefix || 'u') + _uid; }

/* ═══════════ 조작 부품 ═══════════ */

/** 슬라이더: {label, min, max, step, value, unit, digits, color, colorize(v), format(v), note, onInput(v)} */
function Slider(o) {
  const id = uid('sl');
  const input = h('input', { type: 'range', id, min: o.min, max: o.max, step: o.step, value: o.value });
  const val = h('span', { class: 'val' });
  const wrap = h('div', { class: 'ctrl' },
    h('div', { class: 'ctrl-top' }, h('label', { for: id, html: o.label }), val),
    input,
    o.note ? h('div', { class: 'note', html: o.note }) : null
  );
  if (o.color) input.style.setProperty('--c', o.color);
  function refresh() {
    const v = +input.value;
    const span = (+input.max - +input.min) || 1;
    input.style.setProperty('--fill', ((v - +input.min) / span * 100) + '%');
    val.innerHTML = (o.format ? o.format(v) : fmt(v, o.digits || 0)) + (o.unit ? `<small>${o.unit}</small>` : '');
    if (o.colorize) val.style.color = o.colorize(v);
  }
  input.addEventListener('input', () => { refresh(); if (o.onInput) o.onInput(+input.value); });
  refresh();
  return {
    el: wrap, input,
    get value() { return +input.value; },
    set(v) { input.value = v; refresh(); },
    setMax(m) { input.max = m; if (+input.value > m) input.value = m; refresh(); },
    setDisabled(b) { input.disabled = b; wrap.classList.toggle('locked', b); },
    refresh
  };
}

/** 버튼 묶음(하나만 선택): options = [{value, label}] */
function Seg(options, value, onChange, cls) {
  const el = h('div', { class: 'seg ' + (cls || ''), role: 'group' });
  const btns = options.map(opt => {
    const b = h('button', { type: 'button', html: opt.label });
    b.addEventListener('click', () => {
      if (api.value === opt.value) return;
      api.set(opt.value);
      if (onChange) onChange(opt.value);
    });
    el.appendChild(b);
    return b;
  });
  const api = {
    el, value,
    set(v) {
      api.value = v;
      btns.forEach((b, i) => {
        const on = options[i].value === v;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
  };
  api.set(value);
  return api;
}

function Btn(label, cls, onClick, title) {
  const b = h('button', { type: 'button', class: 'btn ' + (cls || ''), html: label, title });
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/** 누르고 있는 동안 동작하는 버튼 (마우스·터치·키보드 Space/Enter) */
function holdButton(btn, onDown, onUp) {
  let held = false;
  const down = ev => { if (ev) ev.preventDefault(); if (held) return; held = true; btn.classList.add('holding'); onDown(); };
  const up = () => { if (!held) return; held = false; btn.classList.remove('holding'); onUp(); };
  btn.style.touchAction = 'none';
  btn.addEventListener('pointerdown', ev => { try { btn.setPointerCapture(ev.pointerId); } catch (e) { /* 무시 */ } down(ev); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => btn.addEventListener(t, up));
  btn.addEventListener('keydown', ev => { if ((ev.key === ' ' || ev.key === 'Enter') && !ev.repeat) down(ev); });
  btn.addEventListener('keyup', ev => { if (ev.key === ' ' || ev.key === 'Enter') up(); });
  btn.addEventListener('blur', up);
}

/** 카드: {title, legend(html), cls, pad} → {el, head, body} */
function Card(o) {
  const head = o.title ? h('div', { class: 'card-head' },
    h('h3', { class: 'card-title', html: `<span class="dot"></span>${o.title}` }),
    o.legend ? h('div', { class: 'legend', html: o.legend }) : null) : null;
  const body = h('div', { class: o.pad === false ? '' : 'card-pad' });
  const el = h('div', { class: 'card ' + (o.cls || '') }, head, body);
  return { el, head, body };
}

/** 범례 한 칸 HTML */
function legendItem(color, label, style) {
  return `<span style="color:${color}"><i class="${style || ''}"></i><b style="color:var(--ink-2);font-weight:700">${label}</b></span>`;
}

/** 탭 맨 위: 차시 표시 + 핵심 질문 + (선택) 자유/미션 전환 */
function LessonHead(panel, o) {
  const row = h('div', { class: 'lesson-head' },
    h('span', { class: 'lesson-tag', html: o.tag }),
    h('h2', { class: 'lesson-q', html: o.q + (o.sub ? `<small>${o.sub}</small>` : '') })
  );
  if (o.missionTab) {
    const seg = Seg([
      { value: 'free', label: '자유 탐구' },
      { value: 'mission', label: '⭐ 미션 도전' }
    ], 'free', v => setMissionMode(o.missionTab, v));
    Mission.toggles[o.missionTab] = seg;
    row.appendChild(seg.el);
  }
  panel.appendChild(row);
  return row;
}

/** 개념 정리 카드 */
function ConceptCard(title, items, fig) {
  return h('div', { class: 'card card-pad concept' },
    h('h3', { html: `<span class="badge">개념 정리</span>${title}` }),
    h('ul', { html: items.map(x => `<li>${x}</li>`).join('') }),
    fig ? h('div', { class: 'fig', html: fig }) : null
  );
}

/** 생각해 보기 카드: qas = [{q, a}] — 예시 답안은 눌러야 보임 */
function ThinkCard(title, qas) {
  const card = h('div', { class: 'card card-pad think' }, h('h3', { html: `<span class="badge">생각해 보기</span>${title}` }));
  qas.forEach(qa => {
    card.appendChild(h('details', null,
      h('summary', { html: qa.q }),
      h('div', { class: 'ans', html: qa.a })
    ));
  });
  return card;
}

/* ═══════════ SVG 그래프 축 ═══════════ */
/**
 * o: {X0, X1, Y0, Y1, xmin, xmax, xstep, ymin, ymax, ystep, xlabel, ylabel, xfmt, yfmt, minorX, minorY}
 * 반환: {gx, gy, plot(잘린 그룹), over(위 그룹), ...o}
 */
function makeAxes(svg, o) {
  const gx = v => o.X0 + (v - o.xmin) / (o.xmax - o.xmin) * (o.X1 - o.X0);
  const gy = v => o.Y0 - (v - o.ymin) / (o.ymax - o.ymin) * (o.Y0 - o.Y1);
  const clipId = uid('clip');
  const defs = s('defs', null, svg);
  s('rect', { x: o.X0, y: o.Y1, width: o.X1 - o.X0, height: o.Y0 - o.Y1 }, s('clipPath', { id: clipId }, defs));
  const base = s('g', null, svg);
  s('rect', { x: o.X0, y: o.Y1, width: o.X1 - o.X0, height: o.Y0 - o.Y1, fill: o.bg || '#fbfdff' }, base);
  const bgLayer = s('g', { 'clip-path': `url(#${clipId})` }, base); // 배경 칠(안정도 영역 등)
  const grid = s('g', null, base);
  if (o.minorX) for (let v = o.xmin; v <= o.xmax + 1e-9; v += o.minorX) {
    s('line', { x1: gx(v), y1: o.Y0, x2: gx(v), y2: o.Y1, stroke: '#eef3f8', 'stroke-width': 1 }, grid);
  }
  if (o.minorY) for (let v = o.ymin; v <= o.ymax + 1e-9; v += o.minorY) {
    s('line', { x1: o.X0, y1: gy(v), x2: o.X1, y2: gy(v), stroke: '#eef3f8', 'stroke-width': 1 }, grid);
  }
  for (let v = o.xmin; v <= o.xmax + 1e-9; v += o.xstep) {
    const x = gx(v);
    s('line', { x1: x, y1: o.Y0, x2: x, y2: o.Y1, stroke: '#dfe8f1', 'stroke-width': 1.2 }, grid);
    s('line', { x1: x, y1: o.Y0, x2: x, y2: o.Y0 + 6, stroke: '#7d90a3', 'stroke-width': 1.5 }, grid);
    txt({ x, y: o.Y0 + 23, 'text-anchor': 'middle', class: 't-tick' }, o.xfmt ? o.xfmt(v) : fmt(v, 0), grid);
  }
  for (let v = o.ymin; v <= o.ymax + 1e-9; v += o.ystep) {
    const y = gy(v);
    s('line', { x1: o.X0, y1: y, x2: o.X1, y2: y, stroke: '#dfe8f1', 'stroke-width': 1.2 }, grid);
    s('line', { x1: o.X0 - 6, y1: y, x2: o.X0, y2: y, stroke: '#7d90a3', 'stroke-width': 1.5 }, grid);
    txt({ x: o.X0 - 10, y: y + 5, 'text-anchor': 'end', class: 't-tick' }, o.yfmt ? o.yfmt(v) : fmt(v, 0), grid);
  }
  s('rect', { x: o.X0, y: o.Y1, width: o.X1 - o.X0, height: o.Y0 - o.Y1, fill: 'none', stroke: '#b9c9d8', 'stroke-width': 1.5 }, base);
  if (o.xlabel) txt({ x: (o.X0 + o.X1) / 2, y: o.Y0 + 50, 'text-anchor': 'middle', class: 't-axis' }, o.xlabel, base);
  if (o.ylabel) {
    const yx = o.X0 - (o.ylabelGap || 48), yy = (o.Y0 + o.Y1) / 2;
    txt({ x: yx, y: yy, 'text-anchor': 'middle', class: 't-axis', transform: `rotate(-90 ${yx} ${yy})` }, o.ylabel, base);
  }
  const plot = s('g', { 'clip-path': `url(#${clipId})` }, svg);
  const over = s('g', null, svg);
  return Object.assign({ gx, gy, plot, over, bgLayer, defs, clipId }, o);
}
function pts(arr, ax) { return arr.map(p => `${ax.gx(p[0]).toFixed(1)},${ax.gy(p[1]).toFixed(1)}`).join(' '); }

/* ═══════════ 하늘 장면 공통 그림 ═══════════ */
let _skyId = 0;
/** 하늘 배경 그라데이션 + 구름 음영 그라데이션을 defs에 추가하고 id들을 돌려준다 */
function skyDefs(svg, top, bottom) {
  _skyId += 1;
  const defs = s('defs', null, svg);
  const sky = `sky${_skyId}`, cloud = `cl${_skyId}`, cloudGray = `clg${_skyId}`;
  const g1 = s('linearGradient', { id: sky, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  s('stop', { offset: '0%', 'stop-color': top || '#5fa8e3' }, g1);
  s('stop', { offset: '100%', 'stop-color': bottom || '#e4f3ff' }, g1);
  const g2 = s('linearGradient', { id: cloud, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  s('stop', { offset: '0%', 'stop-color': '#ffffff' }, g2);
  s('stop', { offset: '70%', 'stop-color': '#f4f8fc' }, g2);
  s('stop', { offset: '100%', 'stop-color': '#d5e0eb' }, g2);
  const g3 = s('linearGradient', { id: cloudGray, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  s('stop', { offset: '0%', 'stop-color': '#eef2f6' }, g3);
  s('stop', { offset: '100%', 'stop-color': '#9eabb8' }, g3);
  return { defs, sky: `url(#${sky})`, cloud: `url(#${cloud})`, cloudGray: `url(#${cloudGray})` };
}

/**
 * 구름 한 덩어리: 여러 도형을 clipPath로 합친 뒤, 위(흰색)→아래(회색) 그라데이션 하나로 칠한다.
 * (도형마다 따로 칠하면 공을 쌓아 놓은 것처럼 보이기 때문)
 * 사용: const c = cloudLayer(parent, {x0,y0,x1,y1}, 'white'|'gray'); c.circle(...); c.rect(...); c.finish();
 */
function cloudLayer(parent, box, tone, opacity) {
  const id = uid('cloud');
  const g = s('g', { opacity: opacity == null ? 1 : opacity }, parent);
  const defs = s('defs', null, g);
  const cp = s('clipPath', { id }, defs);
  const grad = s('linearGradient', { id: id + 'g', gradientUnits: 'userSpaceOnUse', x1: 0, y1: box.y0, x2: 0, y2: box.y1 }, defs);
  const stops = tone === 'gray'
    ? [['0%', '#f2f5f8'], ['55%', '#d7dfe7'], ['100%', '#98a7b6']]
    : tone === 'fog'
      ? [['0%', '#ffffff'], ['100%', '#e9eef3']]
      : [['0%', '#ffffff'], ['62%', '#f4f8fb'], ['100%', '#c8d5e2']];
  stops.forEach(([o, c]) => s('stop', { offset: o, 'stop-color': c }, grad));
  return {
    g,
    circle(cx, cy, r) { s('circle', { cx, cy, r }, cp); },
    ellipse(cx, cy, rx, ry) { s('ellipse', { cx, cy, rx, ry }, cp); },
    rect(x, y, w, h2, rx) { s('rect', { x, y, width: Math.max(0, w), height: Math.max(0, h2), rx: rx || 0 }, cp); },
    finish() {
      s('rect', { x: box.x0, y: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0, fill: `url(#${id}g)`, 'clip-path': `url(#${id})` }, g);
      return g;
    }
  };
}

/**
 * 적운형(뭉게) 구름: 밑면 baseY(평평), 꼭대기 topY, 최대 폭 w, 중심 cx.
 */
function cumulusCloud(parent, cx, baseY, topY, w, tone, seed) {
  const R = rng(seed || 7);
  const H = Math.max(18, baseY - topY);
  const half = w / 2;
  const rr = Math.min(half * 0.3, Math.max(13, H * 0.3));
  const c = cloudLayer(parent, { x0: cx - w, y0: topY - rr, x1: cx + w, y1: baseY }, tone);
  const bodyTop = Math.min(topY + rr * 0.9, baseY - 4);
  c.rect(cx - half * 0.8, bodyTop, half * 1.6, baseY - bodyTop + 1, Math.min(rr * 0.6, (baseY - bodyTop) / 2));
  const steps = Math.max(1, Math.round((baseY - bodyTop) / (rr * 0.62)));
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const y = baseY - (baseY - bodyTop) * f;
    const hw = half * (0.8 - 0.22 * f + 0.06 * Math.sin(f * 7 + seed));
    c.circle(cx - hw + (R() - 0.5) * rr * 0.5, y + (R() - 0.5) * 6, rr * (0.65 + 0.55 * R()));
    c.circle(cx + hw + (R() - 0.5) * rr * 0.5, y + (R() - 0.5) * 6, rr * (0.65 + 0.55 * R()));
  }
  const n = Math.max(3, Math.round(half * 1.4 / rr));
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1);
    const x = cx - half * 0.62 + half * 1.24 * f;
    const lift = Math.sin(f * Math.PI) * rr * 0.7;
    c.circle(x + (R() - 0.5) * 8, bodyTop - lift + rr * 0.2, rr * (0.75 + 0.45 * R()));
  }
  return c.finish();
}

/** 층운형 구름: x0~x1, 밑면 baseY, 두께 th */
function stratusCloud(parent, x0, x1, baseY, th, tone, seed) {
  const R = rng(seed || 11);
  const c = cloudLayer(parent, { x0: x0 - 30, y0: baseY - th - 14, x1: x1 + 30, y1: baseY }, tone);
  c.rect(x0, baseY - th * 0.7, x1 - x0, th * 0.7, th * 0.35);
  const n = Math.max(3, Math.round((x1 - x0) / 30));
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * (i / n) + (R() - 0.5) * 10;
    const ry = th * (0.45 + R() * 0.35);
    c.ellipse(x, baseY - th + ry + 2, 26 + R() * 18, ry);
  }
  return c.finish();
}

/** 장식용 작은 구름 */
function smallCloud(parent, x, y, sc, tone, opacity) {
  const c = cloudLayer(parent, { x0: x - 40 * sc, y0: y - 32 * sc, x1: x + 40 * sc, y1: y + 14 * sc }, tone, opacity);
  c.ellipse(x, y, 34 * sc, 13 * sc);
  c.circle(x - 12 * sc, y - 8 * sc, 14 * sc);
  c.circle(x + 10 * sc, y - 12 * sc, 17 * sc);
  return c.finish();
}

/**
 * 공기 덩어리(분자 움직임 포함). 반지름 r, 포화 여부에 따라 색이 바뀐다.
 * setState({r, sat, temp}), tick(dt)
 */
function makeParcel(parent, opt) {
  opt = opt || {};
  const g = s('g', { class: opt.grab ? 'grab' : '' }, parent);
  const halo = s('circle', { r: 30, fill: 'none', stroke: '#fff', 'stroke-opacity': 0.55, 'stroke-width': 6 }, g);
  const body = s('circle', { r: 30, 'stroke-width': 2.5, 'stroke-dasharray': '6 4' }, g);
  const shine = s('ellipse', { rx: 8, ry: 5, fill: '#fff', 'fill-opacity': 0.55 }, g);
  const N = opt.molecules == null ? 12 : opt.molecules;
  const R = rng(opt.seed || 3);
  const mols = [];
  for (let i = 0; i < N; i++) {
    const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * 0.75;
    const va = R() * Math.PI * 2;
    mols.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, vx: Math.cos(va), vy: Math.sin(va), n: s('circle', { r: 2.6 }, g) });
  }
  if (opt.grab) s('circle', { r: 46, fill: 'transparent' }, g);
  const state = { r: 30, sat: false, temp: 20 };
  function paint() {
    const c = state.sat ? '#2d7dd2' : '#ec7a1c';
    sa(body, { r: state.r, fill: state.sat ? '#d7e8fb' : '#fde3c8', 'fill-opacity': 0.92, stroke: c });
    sa(halo, { r: state.r + 3 });
    sa(shine, { cx: -state.r * 0.38, cy: -state.r * 0.45 });
    mols.forEach(m => m.n.setAttribute('fill', state.sat ? '#1d5ea8' : '#b4560c'));
  }
  paint();
  return {
    g,
    setState(ns) {
      const changed = ns.sat !== state.sat || Math.abs((ns.r || state.r) - state.r) > 0.05;
      Object.assign(state, ns);
      if (changed) paint();
    },
    tick(dt) {
      // 기온이 높을수록 분자가 빠르게 움직인다 (켈빈 온도에 비례하는 느낌만 과장해 표현)
      const speed = 0.25 + 1.5 * clamp((state.temp + 30) / 70, 0, 1);
      const lim = 0.82;
      mols.forEach(m => {
        m.x += m.vx * speed * dt; m.y += m.vy * speed * dt;
        const d = Math.hypot(m.x, m.y);
        if (d > lim) {
          const nx = m.x / d, ny = m.y / d;
          const dot = m.vx * nx + m.vy * ny;
          m.vx -= 2 * dot * nx; m.vy -= 2 * dot * ny;
          m.x = nx * lim; m.y = ny * lim;
        }
        m.n.setAttribute('cx', (m.x * state.r).toFixed(1));
        m.n.setAttribute('cy', (m.y * state.r).toFixed(1));
      });
    }
  };
}

/* ═══════════ 탭 전환 ═══════════ */
const Tabs = { impl: {}, order: ['tab1', 'tab2', 'tab3', 'tab4', 'tab5', 'tab6'], active: 'tab1' };
function registerTab(id, impl) { Tabs.impl[id] = impl; }
function showTab(id) {
  if (id === Tabs.active) return;
  const prev = Tabs.impl[Tabs.active];
  if (prev && prev.onHide) prev.onHide();
  Tabs.order.forEach(t => {
    $(t).classList.toggle('active', t === id);
    const b = $('tabbtn-' + t);
    b.setAttribute('aria-selected', t === id ? 'true' : 'false');
    b.tabIndex = t === id ? 0 : -1;
  });
  Tabs.active = id;
  const cur = Tabs.impl[id];
  if (cur && cur.onShow) cur.onShow();
}
// 제목을 누르면 처음 화면으로: 1탭(단열 변화) (다른 탭의 설정·진행·별은 그대로 둠)
function goHome() {
  if (Tabs.active !== 'tab1') showTab('tab1');
  scrollTo(0, 0); document.body.scrollTop = 0;
}

/* ═══════════ 미션 · 별 ═══════════ */
const Mission = { defs: {}, stars: {}, mode: {}, opts: {}, toggles: {}, certShown: false };
const TOTAL_STARS = 18;

/** opts: {alwaysOn, extra(idx) → html, afterRender(idx), onModeChange(mode)} */
function registerMissions(tab, defs, opts) {
  Mission.defs[tab] = defs;
  Mission.stars[tab] = defs.map(() => false);
  Mission.opts[tab] = opts || {};
  Mission.mode[tab] = opts && opts.alwaysOn ? 'mission' : 'free';
}
function currentMission(tab) { return Mission.stars[tab] ? Mission.stars[tab].indexOf(false) : -1; }
function missionOn(tab) { return Mission.mode[tab] === 'mission'; }
function isMissionActive(tab, idx) { return missionOn(tab) && currentMission(tab) === idx; }
function totalStars() {
  return Object.keys(Mission.stars).reduce((acc, t) => acc + Mission.stars[t].filter(Boolean).length, 0);
}

function setMissionMode(tab, mode) {
  Mission.mode[tab] = mode;
  if (Mission.toggles[tab]) Mission.toggles[tab].set(mode);
  renderMissionPanel(tab);
  const o = Mission.opts[tab];
  if (o.onModeChange) o.onModeChange(mode);
}

function renderStars() {
  const n = totalStars();
  $('star-total').textContent = `${n} / ${TOTAL_STARS}`;
  $('star-bar').style.width = (n / TOTAL_STARS * 100) + '%';
  document.querySelectorAll('.tab-stars').forEach(box => {
    const arr = Mission.stars[box.dataset.tab] || [];
    box.innerHTML = arr.map(on => `<i class="${on ? 'on' : ''}"></i>`).join('');
    box.title = `별 ${arr.filter(Boolean).length} / ${arr.length}`;
  });
}

function renderMissionPanel(tab) {
  const panel = $('mission-' + tab);
  const o = Mission.opts[tab] || {};
  if (!panel) { if (o.afterRender) o.afterRender(currentMission(tab)); return; }
  if (!missionOn(tab)) {
    panel.classList.remove('visible');
    if (o.afterRender) o.afterRender(currentMission(tab));
    return;
  }
  panel.classList.add('visible');
  const idx = currentMission(tab);
  const defs = Mission.defs[tab];
  let html = '<div class="mission-steps">' + defs.map((m, i) => {
    const done = Mission.stars[tab][i];
    const cls = done ? 'done' : (i === idx ? 'current' : '');
    const tag = done ? '완료 ✓' : (i === idx ? '도전 중' : '대기');
    return `<span class="mission-step ${cls}">${'⭐'.repeat(i + 1)} ${tag}</span>`;
  }).join('') + '</div>';
  if (idx === -1) {
    html += `<div class="mission-complete">🎉 이 실험실의 미션 ${defs.length}개를 모두 완료했어요! 다른 실험실에도 도전해 보세요.</div>`;
  } else {
    const m = defs[idx];
    html += `<div class="mission-main"><div class="mission-text">
      <p class="mission-title">${'⭐'.repeat(idx + 1)} ${m.title}</p>
      <p class="mission-desc">${m.desc}</p>
      <div class="mission-live" id="mlive-${tab}"></div></div>
      <div class="mission-tools">${o.extra ? (o.extra(idx) || '') : ''}<button type="button" class="hint-btn" id="hintbtn-${tab}">💡 힌트</button></div></div>
      <div class="mission-hint" id="hint-${tab}">${m.hint}</div>`;
  }
  panel.innerHTML = html;
  const hb = $('hintbtn-' + tab);
  if (hb) hb.addEventListener('click', () => $('hint-' + tab).classList.toggle('visible'));
  if (o.afterRender) o.afterRender(idx);
}
function setMissionLive(tab, html) { const n = $('mlive-' + tab); if (n && n.innerHTML !== html) n.innerHTML = html; }
function showHint(tab, text) {
  const n = $('hint-' + tab);
  if (!n) return;
  if (text) n.innerHTML = text;
  n.classList.add('visible');
}

function spawnConfetti(n) {
  const emojis = ['🎉', '⭐', '✨', '🌟', '🎊', '☁️', '🌈', '💧'];
  for (let i = 0; i < n; i++) {
    const c = h('span', { class: 'confetti', text: emojis[i % emojis.length] });
    c.style.left = (Math.random() * 96) + 'vw';
    c.style.animationDuration = (2 + Math.random() * 2.4) + 's';
    c.style.animationDelay = (Math.random() * 0.5) + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 5400);
  }
}
let _celebrateTimer = null;
function celebrate(tab, idx) {
  const m = Mission.defs[tab][idx];
  $('celebrate-msg').textContent = `${'⭐'.repeat(idx + 1)} 미션 성공!`;
  $('celebrate-sub').textContent = m.title;
  const ov = $('celebrate');
  ov.classList.remove('visible'); void ov.offsetWidth; ov.classList.add('visible');
  spawnConfetti(12);
  clearTimeout(_celebrateTimer);
  _celebrateTimer = setTimeout(() => ov.classList.remove('visible'), 2400);
}

function award(tab, idx) {
  if (idx == null) idx = currentMission(tab);
  if (idx < 0 || !Mission.stars[tab] || Mission.stars[tab][idx]) return;
  Mission.stars[tab][idx] = true;
  renderStars();
  celebrate(tab, idx);
  renderMissionPanel(tab);
  if (totalStars() === TOTAL_STARS && !Mission.certShown) {
    Mission.certShown = true;
    setTimeout(() => { $('cert-overlay').classList.add('visible'); spawnConfetti(40); $('cert-close').focus(); }, 2300);
  }
}

/** 지금 미션 하나만 판정: checkers[idx]()가 참이면 별 */
function checkMission(tab, checkers) {
  if (!missionOn(tab)) return;
  const idx = currentMission(tab);
  if (idx < 0) return;
  if (checkers[idx] && checkers[idx]()) award(tab, idx);
}

function resetAllStars() {
  Object.keys(Mission.stars).forEach(t => {
    Mission.stars[t] = Mission.stars[t].map(() => false);
    const o = Mission.opts[t];
    if (o.onReset) o.onReset();
    renderMissionPanel(t);
  });
  Mission.certShown = false;
  renderStars();
}
