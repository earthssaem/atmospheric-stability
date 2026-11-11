/**
 * ui.js — 화면 공통 도구: DOM·SVG 만들기, 숫자 표시 규칙, 조건 입력 칸, 알림
 * (계산은 physics.js에서만 한다)
 */
'use strict';

const SVGNS = 'http://www.w3.org/2000/svg';
const $ = id => document.getElementById(id);
const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** HTML 요소: h('div', {class:'x', onclick: fn}, 자식...) */
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
  kids.flat().forEach(c => { if (c != null && c !== false) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return n;
}
/** SVG 요소 */
function s(tag, attrs, parent) {
  const n = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function txt(attrs, text, parent) { const n = s('text', attrs, parent); n.textContent = text; return n; }
function sa(n, attrs) { for (const k in attrs) n.setAttribute(k, attrs[k]); return n; }
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function svgPoint(svg, ev) {
  const r = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  return { x: (ev.clientX - r.left) * (vb.width / r.width), y: (ev.clientY - r.top) * (vb.height / r.height) };
}
/** 결정적 의사 난수 (매 프레임 같은 모양) */
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
function uid(p) { _uid += 1; return (p || 'u') + _uid; }

/* ═════════ 숫자 표시 규칙 ═════════
 * 기온·이슬점: 소수 첫째 자리 / 높이·응결 고도: 소수 둘째 자리 / −0.0 정리 / 음수는 −(유니코드 빼기) */
function fmt(x, d) {
  if (!isFinite(x)) return '—';
  let str = Number(x).toFixed(d);
  if (parseFloat(str) === 0) str = (0).toFixed(d);
  return str.replace('-', '−');
}
const fT = x => fmt(x, 1);
const fZ = x => fmt(x, 2);
/** 두 값이 같은 자릿수에서 같아 보이면 자릿수를 늘린다 (최대 3자리) */
function fPair(a, b, d = 1) {
  let k = d;
  while (k < 3 && fmt(a, k) === fmt(b, k) && Math.abs(a - b) > 1e-9) k += 1;
  return [fmt(a, k), fmt(b, k), k];
}
/** 소수 둘째 자리로 나타낼 수 없는 값이면 '약'을 붙인다 */
function fApprox(x, d = 2) {
  const r = Math.round(x * Math.pow(10, d)) / Math.pow(10, d);
  return (Math.abs(r - x) > 1e-9 ? '약 ' : '') + fmt(x, d);
}
function signed(x, d = 1) { const t = fmt(x, d); return (parseFloat(t.replace('−', '-')) > 0 ? '+' : '') + t; }

/* ═════════ 조건 입력 칸: 이름 + 슬라이더 + 숫자 입력 + 단위 ═════════
 * o: {label, min, max, step, value, unit, decimals, sliderStep, onCommit(v), note}
 * - 슬라이더를 움직이면 바로 반영
 * - 숫자 칸: 빈 값·잘못된 값은 반영하지 않고 표시만, 벗어난 값은 범위에 맞춰 반영 */
function NumField(o) {
  const id = uid('nf');
  const range = h('input', { type: 'range', min: o.min, max: o.max, step: o.sliderStep || o.step, value: o.value, 'aria-label': o.ariaLabel || stripTags(o.label) });
  const num = h('input', { type: 'number', id, min: o.min, max: o.max, step: o.step, value: fmt(o.value, o.decimals).replace('−', '-'), inputmode: 'decimal' });
  const msg = h('span', { class: 'nf-msg', 'aria-live': 'polite' });
  const el = h('div', { class: 'nf' + (o.cls ? ' ' + o.cls : '') },
    h('label', { class: 'nf-label', for: id, html: o.label }),
    h('div', { class: 'nf-row' }, range, h('span', { class: 'nf-num' }, num, h('span', { class: 'nf-unit', text: o.unit || '' }))),
    msg);
  let value = o.value, min = o.min, max = o.max, msgTimer = null;
  function paintRange() {
    const span = (+range.max - +range.min) || 1;
    range.style.setProperty('--fill', ((clamp(value, +range.min, +range.max) - +range.min) / span * 100) + '%');
  }
  function showText() { if (document.activeElement !== num) num.value = fmt(value, o.decimals).replace('−', '-'); num.classList.remove('bad'); }
  function note(text) {
    msg.textContent = text || '';
    clearTimeout(msgTimer);
    if (text) msgTimer = setTimeout(() => { msg.textContent = ''; }, 4000);
  }
  function commit(v, from) {
    v = clamp(v, min, max);
    const changed = Math.abs(v - value) > 1e-12;
    value = v;
    if (from !== 'range') range.value = v;
    paintRange();
    if (from !== 'num') showText();
    if (changed && o.onCommit) o.onCommit(v);
  }
  range.addEventListener('input', () => { note(''); commit(+range.value, 'range'); showText(); });
  num.addEventListener('input', () => {
    const raw = num.value.trim();
    const v = parseFloat(raw);
    if (raw === '' || !isFinite(v)) { num.classList.add('bad'); return; }
    if (v < min || v > max) { num.classList.add('bad'); return; }   // 입력 중에는 범위 밖 값을 반영하지 않는다
    num.classList.remove('bad');
    commit(v, 'num');
  });
  function finish() {
    const raw = num.value.trim();
    const v = parseFloat(raw);
    if (raw === '' || !isFinite(v)) { note('숫자를 입력해 주세요. 이전 값으로 돌려놓았어요.'); num.classList.remove('bad'); num.value = fmt(value, o.decimals).replace('−', '-'); return; }
    if (v < min || v > max) note(`${fmt(min, o.decimals)}~${fmt(max, o.decimals)} ${o.unit || ''} 범위로 맞췄어요.`);
    commit(v, 'blur');
    num.value = fmt(value, o.decimals).replace('−', '-');
  }
  num.addEventListener('change', finish);
  num.addEventListener('keydown', e => { if (e.key === 'Enter') { finish(); num.blur(); } });
  paintRange();
  return {
    el, range, num,
    get value() { return value; },
    /** 바깥에서 값 맞추기 (onCommit 호출 없음) */
    set(v) { value = clamp(v, min, max); range.value = value; paintRange(); showText(); },
    setMax(m) { max = m; range.max = m; num.max = m; if (value > m) value = m; this.set(value); },
    setMin(m) { min = m; range.min = m; num.min = m; if (value < m) value = m; this.set(value); },
    note,
    setDisabled(b) { range.disabled = b; num.disabled = b; el.classList.toggle('disabled', b); }
  };
}
function stripTags(s2) { return String(s2).replace(/<[^>]+>/g, ''); }

/** 하나만 고르는 버튼 묶음 */
function Seg(options, value, onChange, opts) {
  const el = h('div', { class: 'seg' + (opts && opts.cls ? ' ' + opts.cls : ''), role: 'group', 'aria-label': opts && opts.label });
  const btns = options.map(op => {
    const b = h('button', { type: 'button', html: op.label, title: op.title });
    b.addEventListener('click', () => { if (api.value === op.value && !(opts && opts.always)) return; api.set(op.value); if (onChange) onChange(op.value); });
    el.appendChild(b);
    return b;
  });
  const api = {
    el, value, btns,
    set(v) {
      api.value = v;
      btns.forEach((b, i) => { const on = options[i].value === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    }
  };
  api.set(value);
  return api;
}
function Btn(label, cls, onClick, attrs) {
  const b = h('button', Object.assign({ type: 'button', class: 'btn ' + (cls || ''), html: label }, attrs || {}));
  if (onClick) b.addEventListener('click', onClick);
  return b;
}
function Toggle(label, checked, onChange) {
  const input = h('input', { type: 'checkbox' });
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  const el = h('label', { class: 'toggle' }, input, h('span', { html: label }));
  return { el, input, set(v) { input.checked = !!v; }, get value() { return input.checked; } };
}
/** 펼쳐 보기 */
function Fold(title, body, open, cls) {
  const d = h('details', { class: 'fold' + (cls ? ' ' + cls : '') }, h('summary', { html: title }), h('div', { class: 'fold-body' }, body));
  if (open) d.open = true;
  return d;
}

/* ═════════ 작은 완료 알림 (화면 구석) ═════════ */
let _toastTimer = null;
function toast(html) {
  const t = $('toast');
  t.innerHTML = html;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}

/* ═════════ 그래프 축 범위 ═════════ */
function niceRange(lo, hi, minSpan) {
  if (hi - lo < (minSpan || 20)) { const c = (lo + hi) / 2; lo = c - (minSpan || 20) / 2; hi = c + (minSpan || 20) / 2; }
  const span = hi - lo;
  const step = span <= 32 ? 5 : span <= 75 ? 10 : 20;
  return { min: Math.floor((lo - 1) / step) * step, max: Math.ceil((hi + 1) / step) * step, step };
}

/** 누르고 있는 동안만 동작하는 버튼 (마우스·터치·키보드 Space/Enter). 포인터를 놓치거나 취소돼도 반드시 끝난다. */
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
  window.addEventListener('blur', up);
  document.addEventListener('visibilitychange', () => { if (document.hidden) up(); });
  return { release: up, get held() { return held; } };
}
