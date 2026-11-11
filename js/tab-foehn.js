/**
 * tab-foehn.js — 2. 푄 현상
 * 왼쪽(풍상측)에서 출발한 공기가 산을 넘어 오른쪽(풍하측)에 도착한다(문제집 그림과 같은 방향). 출발·도착 높이는 같은 0 km.
 * 모형: 풍상측에서 포화된 뒤 응결한 물은 비로 떨어져 공기에서 빠져나간다(교과서 모형).
 * 화면의 모든 상태는 진행 위치(s)와 조건만으로 정해진다 → 되감기·건너뛰기 순서와 무관하게 같은 상태.
 */
'use strict';

const FoehnLab = (function () {
  const ZMAX = 3.5;
  const DUR = 14;                 // 전체 여정 재생 시간(초, 화면 표현용)
  const SA = 0.08, SB = 0.5, SC = 0.92;   // 진행 구간: 풍상측 평지 | 풍상측 상승 | 풍하측 하강 | 풍하측 평지
  const DEF = { T0: 20, Td0: 12, M: 2 };
  const L = Object.assign(baseLab(), { id: 'foehn' });
  const st = { T0: DEF.T0, Td0: DEF.Td0, M: DEF.M, s: 0, playing: false, guided: true, showPath: false, arrivedOnce: false, cmp: null, notice: '' };
  L.st = st;
  let sh, ui = {}, E = {}, ax = null, ch = null;

  const F = () => Physics.foehn(st.T0, st.Td0, st.M);

  /* 진행 위치 s → {side, z} */
  function posOf(s2, M) {
    if (s2 <= SA) return { side: 'up', z: 0, seg: 'flatUp' };
    if (s2 <= SB) return { side: 'up', z: M * (s2 - SA) / (SB - SA), seg: 'up' };
    if (s2 <= SC) return { side: 'down', z: M * (1 - (s2 - SB) / (SC - SB)), seg: 'down' };
    return { side: 'down', z: 0, seg: 'flatDown' };
  }
  function stateAt(f, s2) { const p = posOf(s2, f.M); return Object.assign(Physics.foehnAt(f, p.side, p.z), { seg: p.seg }); }
  /** 단계 위치. 응결 시작이 경로에 없으면 null */
  function stagePos(f) {
    const lclS = f.reachesSat ? (f.H <= 1e-9 ? 0 : SA + (SB - SA) * (f.H / f.M)) : null;
    return { start: 0, lcl: lclS, summit: SB, arrive: 1 };
  }
  function stageList(f) {
    const P = stagePos(f);
    const arr = [['start', P.start], ['lcl', P.lcl], ['summit', P.summit], ['arrive', P.arrive]].filter(x => x[1] != null);
    return arr.filter((x, i) => arr.findIndex(y => Math.abs(y[1] - x[1]) < 1e-9) === i);
  }
  const STAGE_NAME = { start: '출발', lcl: '응결 시작', summit: '정상', arrive: '도착' };

  /* ───────── 화면 만들기 ───────── */
  function init(root) {
    sh = makeShell(root, {
      ratio: '55%', zMax: ZMAX,
      sceneTitle: '산 단면 <span style="font-weight:600;color:var(--muted)">풍상측 → 풍하측</span>', graphTitle: '높이–온도 그래프',
      sceneLabel: '왼쪽 풍상측에서 산을 넘어 오른쪽 풍하측으로 이동하는 공기의 산 단면', graphLabel: '푄 현상 경로의 높이에 따른 기온과 이슬점'
    });
    ui.mode = Seg([{ value: true, label: '안내 실험' }, { value: false, label: '자유 탐구' }], true, v => setMode(v), { label: '실험 방식' });
    ui.T0 = NumField({ label: '출발 기온 T<sub>0</sub>', min: 0, max: 35, step: 0.1, sliderStep: 0.5, decimals: 1, value: st.T0, unit: '℃', onCommit: v => setCond({ T0: v }) });
    ui.Td0 = NumField({ label: '출발 이슬점 Td<sub>0</sub>', min: 0, max: st.T0, step: 0.1, sliderStep: 0.5, decimals: 1, value: st.Td0, unit: '℃', onCommit: v => setCond({ Td0: v }) });
    ui.M = NumField({ label: '산 높이', min: 0.5, max: 3, step: 0.1, sliderStep: 0.1, decimals: 1, value: st.M, unit: 'km', onCommit: v => setCond({ M: v }) });
    ui.T0.range.style.setProperty('--c', 'var(--temp)');
    ui.Td0.range.style.setProperty('--c', 'var(--dew)');
    ui.M.range.style.setProperty('--c', '#7E8F7A');
    const tail = h('div', { class: 'cond-tail' });
    ui.cmp = CompareUI(tail, saveCompare, () => { st.cmp = null; afterCompareChange(); });
    sh.cond.append(ui.mode.el, h('div', { class: 'cond-group' }, ui.T0.el, ui.Td0.el, ui.M.el), tail);

    ui.tPath = Toggle('전체 경로 보기', st.showPath, v => { st.showPath = v; render(); });
    ui.legend = h('span', { class: 'legend' });
    sh.graphLegend.append(ui.legend);
    sh.graphHead.insertBefore(ui.tPath.el, sh.graphLegend);

    ui.ro = Readouts(sh.ro, [
      { key: 'where', label: '위치' },
      { key: 'z', label: '높이' },
      { key: 'T', label: '<i style="border-color:var(--temp)"></i>기온 T', cls: 'temp' },
      { key: 'Td', label: '<i class="dash" style="border-color:var(--dew)"></i>이슬점 Td', cls: 'dew' },
      { key: 'rh', label: '상대 습도' }
    ]);
    ui.ctrl = ControlBar(sh.ctrl, { play, prev: () => step(-1), next: () => step(1), reset: resetMotion, defaults: resetDefaults });
    ui.stages = h('div', { class: 'stages', role: 'group', 'aria-label': '단계 이동' });
    ui.stageBtns = {};
    ['start', 'lcl', 'summit', 'arrive'].forEach(k => {
      const b = Btn(STAGE_NAME[k], 'sm', () => goStage(k));
      ui.stageBtns[k] = b; ui.stages.appendChild(b);
    });
    ui.prog = h('input', { type: 'range', min: 0, max: 1000, step: 1, value: 0, 'aria-label': '여정 진행' });
    ui.prog.style.setProperty('--c', 'var(--ink)');
    ui.prog.addEventListener('input', () => { pause(); setS(+ui.prog.value / 1000); });
    ui.ctrl.slot.append(ui.stages, h('div', { class: 'progress' }, h('span', { class: 'lbl', text: '진행' }), ui.prog));

    buildMore();
    buildChallenges();
    renderLegend();
    render();
  }

  function buildMore() {
    const m = sh.more;
    ui.table = h('div');
    m.appendChild(Fold('단계별 표 — 출발 · 응결 시작 · 정상 · 도착', ui.table, false));
    m.appendChild(Fold('푄 현상의 원리', h('div', { html: `
      <ul><li><b>풍상측</b>: 응결 고도까지 기온 −10, 이슬점 −2 ℃/km → 그 위는 둘 다 −5 ℃/km. 구름이 생기고 <b>비로 수분을 잃어요</b>.</li>
      <li><b>풍하측</b>: 내려오며 기온 +10, 이슬점 +2 ℃/km.</li>
      <li>그래서 도착한 공기는 출발 때보다 <b>더 따뜻하고 건조해요</b>. 우리나라 예: 늦봄~초여름 영서 지방의 <b>높새바람</b></li></ul>
      <p class="note">응결한 물은 모두 비로 떨어진다고 본 교과서 모형 · 그림 Ⅲ-13</p>` }), false));
    // 더 해 보기: 실험 2개 + 도전 1개
    const exps = [
      { t: '산 높이가 다르면 도착 기온은?', d: '같은 공기(20 ℃·12 ℃) · 산 2 km와 3 km', run: () => setupExperiment({ T0: 20, Td0: 12, M: 2 }, { T0: 20, Td0: 12, M: 3 }, '산 2 km 결과를 비교용으로 남겼어요. 산 3 km를 넘겨 도착 기온을 비교해 보세요.') },
      { t: '응결 고도보다 낮은 산이면?', d: '20 ℃·12 ℃ · 산 0.5 km', run: () => setupExperiment({ T0: 20, Td0: 12, M: 2 }, { T0: 20, Td0: 12, M: 0.5 }, '응결 고도(1 km)보다 낮은 산이에요. 도착 기온·이슬점을 출발과 비교해 보세요.') }
    ];
    ui.moreBox = h('div', null, expList(exps));
    m.appendChild(Fold('더 해 보기 <span class="tag">선택</span>', ui.moreBox, false));
  }

  function buildChallenges() {
    ch = Challenges(ui.moreBox, L, [
      {
        id: 'predict', title: '산을 넘은 뒤 도착 기온 예상하기',
        goal: '바람을 보내기 전에 풍하측 <b>도착 기온</b>을 계산해 입력하고 확정한 뒤, 공기를 도착까지 보내 확인하세요. (±0.5 ℃)',
        hints: ['응결 시작 높이와 정상의 기온을 차례로 구해 보세요.',
          '오를 때: 응결 고도까지 −10 ℃/km, 그 위는 −5 ℃/km. 내려올 때: −(높이)만큼 +10 ℃/km.',
          '응결 고도 H(m) = 125 × (T₀ − Td₀). 정상 기온 = T₀ − 10H − 5(M − H), 도착 기온 = 정상 기온 + 10M (H·M은 km, H ≥ M이면 도착 = 출발)'],
        extra(lab, it, rerender) {
          const inp = h('input', { type: 'number', step: 0.1, value: it.pred != null ? it.pred : '', 'aria-label': '예상 도착 기온' });
          const lock = Btn(it.locked ? '다시 입력' : '예상 확정', 'sm accent', () => {
            if (it.locked) { it.locked = null; rerender(); return; }
            const v = parseFloat(inp.value);
            if (!isFinite(v)) { it.msg = '숫자를 입력해 주세요.'; rerender(); return; }
            it.pred = v; it.locked = { seq: lab.seq, T0: st.T0, Td0: st.Td0, M: st.M }; it.msg = '';
            resetMotion(); rerender();
          });
          if (it.locked) inp.disabled = true;
          return h('div', null, h('div', { class: 'ch-row' }, h('label', { text: '예상 도착 기온' }), inp, h('span', { text: '℃' }), lock),
            it.locked ? h('div', { class: 'ch-status', text: '확정했어요. ▶ 재생 또는 단계 이동으로 도착까지 보내 보세요.' }) : null);
        },
        check(lab, since) {
          const it = ch.items.find(x => x.id === 'predict');
          if (!it.locked) return false;
          const c = it.locked;
          const arr = lab.since(Math.max(since, c.seq), 'arrive').find(e => e.T0 === c.T0 && e.Td0 === c.Td0 && e.M === c.M);
          if (!arr) return false;
          const diff = Math.abs(it.pred - arr.Ta);
          if (diff <= 0.5 + 1e-9) return true;
          it.locked = null;
          return { ok: false, msg: `예상 ${fT(it.pred)} ℃ · 실제 ${fT(arr.Ta)} ℃ (차이 ${fT(diff)} ℃). 단계별 표를 보며 다시 계산해 보세요.` };
        },
        success: '정상까지 잃은 온도보다 내려오며 얻은 온도가 커서 도착 기온이 출발보다 높아요.'
      }
    ]);
  }

  /* ───────── 상태 바꾸기 ───────── */
  function setMode(guided) {
    st.guided = guided; pause();
    st.showPath = !guided; ui.tPath.set(st.showPath);
    resetMotion();
  }
  function setCond(o) {
    st.notice = '';
    if (o.T0 != null) {
      st.T0 = o.T0; ui.Td0.setMax(o.T0);
      if (st.Td0 > o.T0) { st.Td0 = o.T0; ui.Td0.set(o.T0); st.notice = `이슬점이 기온보다 높을 수 없어 이슬점을 ${fT(o.T0)} ℃로 맞췄어요.`; ui.Td0.note(`기온에 맞춰 ${fT(o.T0)} ℃로 낮췄어요`); }
    }
    if (o.Td0 != null) st.Td0 = Math.min(o.Td0, st.T0);
    if (o.M != null) st.M = o.M;
    ui.T0.set(st.T0); ui.Td0.setMax(st.T0); ui.Td0.set(st.Td0); ui.M.set(st.M);
    if (st.guided) { st.guided = false; ui.mode.set(false); st.showPath = true; ui.tPath.set(true); }
    conditionsChanged();
  }
  function conditionsChanged() {
    pause(); st.s = 0; st.arrivedOnce = false;
    L.emit('cond', {});
    rebuildAll();
  }
  function setupExperiment(base, cur, msg) {
    if (st.guided) { st.guided = false; ui.mode.set(false); }
    st.showPath = true; ui.tPath.set(true);
    st.cmp = base ? Object.assign({ sRec: 1, label: cmpLabel(base) }, base) : null;
    st.T0 = cur.T0; st.Td0 = cur.Td0; st.M = cur.M;
    ui.T0.set(cur.T0); ui.Td0.setMax(cur.T0); ui.Td0.set(cur.Td0); ui.M.set(cur.M);
    ui.cmp.show(st.cmp ? st.cmp.label : ''); renderLegend();
    conditionsChanged();
    st.notice = msg; render();
    sh.panel.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'center' });
  }
  const cmpLabel = c => `${fT(c.T0)} ℃ · ${fT(c.Td0)} ℃ · 산 ${fmt(c.M, 1)} km`;
  function saveCompare() { st.cmp = { T0: st.T0, Td0: st.Td0, M: st.M, sRec: st.s, label: cmpLabel(st) }; L.emit('compare', {}); afterCompareChange(); }
  function afterCompareChange() { ui.cmp.show(st.cmp ? st.cmp.label : ''); renderLegend(); rebuildAll(); }
  function resetMotion() { pause(); st.s = 0; st.notice = ''; if (st.guided) { st.arrivedOnce = false; st.showPath = false; ui.tPath.set(false); } L.emit('reset'); render(); }
  function resetDefaults() {
    Object.assign(st, { T0: DEF.T0, Td0: DEF.Td0, M: DEF.M, guided: true, showPath: false, notice: '' });
    ui.T0.set(DEF.T0); ui.Td0.setMax(DEF.T0); ui.Td0.set(DEF.Td0); ui.M.set(DEF.M); ui.mode.set(true); ui.tPath.set(false);
    conditionsChanged();
  }
  function setS(v) {
    v = clamp(v, 0, 1);
    const was = st.s;
    st.s = v; st.notice = '';
    if (v >= 1 - 1e-9 && was < 1 - 1e-9) {
      const f = F();
      st.arrivedOnce = true;
      L.emit('arrive', { T0: st.T0, Td0: st.Td0, M: st.M, Ta: f.arrival.T, pre: f.precipitates });
    }
    render();
  }

  /* ───────── 재생 · 단계 ───────── */
  function play() {
    if (st.playing) { pause(); return; }
    if (st.s >= 1 - 1e-9) setS(0);
    st.playing = true; render();
  }
  function pause() { if (st.playing) { st.playing = false; render(); } }
  function goStage(k) {
    pause();
    const P = stagePos(F());
    if (P[k] == null) { st.notice = noLclText(F()); render(); return; }
    setS(P[k]);
  }
  function step(d) {
    pause();
    const S = stageList(F()).map(x => x[1]);
    if (d > 0) { const n = S.find(v => v > st.s + 1e-9); if (n != null) setS(n); }
    else { const p = [...S].reverse().find(v => v < st.s - 1e-9); if (p != null) setS(p); }
  }
  function tick(dt) {
    if (!st.playing) return;
    const S = stageList(F()).map(x => x[1]);
    const nextStop = st.guided ? (S.find(v => v > st.s + 1e-9) ?? 1) : 1;  // 안내 실험은 단계마다 멈춤
    const ns = Math.min(nextStop, st.s + dt / DUR);
    if (ns >= nextStop - 1e-12) { st.playing = false; setS(nextStop); }
    else setS(ns);
  }
  function noLclText(f) {
    return `이 조건에서는 정상(${fmt(f.M, 1)} km)까지 올라가도 기온이 이슬점보다 높아 <b>응결이 일어나지 않아요</b>. (응결 고도 ${fZ(f.H)} km)`;
  }

  /* ───────── 그리기 ───────── */
  function xRange() {
    const vals = [];
    const add = f => vals.push(f.start.T, f.start.Td, f.summit.T, f.summit.Td, f.arrival.T, f.arrival.Td);
    add(F());
    if (st.cmp) add(Physics.foehn(st.cmp.T0, st.cmp.Td0, st.cmp.M));
    return niceRange(Math.min(...vals), Math.max(...vals), 25);
  }
  function layout() { const f = layoutShell(sh); if (!f) return; rebuildAll(); }
  function rebuildAll() { if (!sh.frame) { render(); return; } buildScene(sh.frame); buildGraph(sh.frame); render(); }

  /* 산 모양 */
  function geo(f) {
    const W = f.sceneW;
    // 왼쪽 출발(xS) → 풍상측 기슭(xFU) → 정상(xs) → 풍하측 기슭(xFD) → 오른쪽 도착(xD). 도착점은 오른쪽 끝 높이 표시(약 70px)와 겹치지 않게
    const xS = W * 0.06 + 14, xD = Math.min(W * 0.86, W - 96), D = xD - xS;
    const xFU = xS + 0.14 * D, xFD = xD - 0.16 * D, xs = (xFU + xFD) / 2;
    const w = (xFD - xFU) / 2;
    const zAt = x => (Math.abs(x - xs) >= w ? 0 : st.M * (0.5 + 0.5 * Math.cos(Math.PI * (x - xs) / w)));
    const xAt = (z, side) => { const d = w * Math.acos(clamp(2 * z / st.M - 1, -1, 1)) / Math.PI; return side === 'up' ? xs - d : xs + d; };
    const xOfS = s2 => {
      const p = posOf(s2, st.M);
      if (p.seg === 'flatUp') return lerp(xS, xFU, s2 / SA);
      if (p.seg === 'flatDown') return lerp(xFD, xD, (s2 - SC) / (1 - SC));
      return xAt(p.z, p.side);
    };
    return { W, xS, xFU, xs, xFD, xD, w, zAt, xAt, xOfS };
  }
  /** 산 위의 A(출발) · B(응결 시작) · C(정상) · D(도착) 점과 글자. B는 조건에 따라 옮겨지고, 겹치면 'A·B', 'B·C'로 합침 */
  function renderABCD(f, G, fo, avoidEls) {
    const y0 = f.yOf(0), yM = f.yOf(st.M);
    const hasB = fo.reachesSat, bAtA = hasB && fo.H <= 1e-9, bAtC = hasB && Math.abs(fo.H - st.M) < 1e-9;
    const avoid = avoidEls.filter(el => el && el.getAttribute('opacity') !== '0').map(el => { try { return el.getBBox(); } catch (e) { return null; } }).filter(Boolean);
    const key = `${G.W}|${f.H}|${st.M}|${hasB}|${hasB ? fo.H.toFixed(4) : ''}|` + avoid.map(b => [b.x, b.y, b.width].map(Math.round).join(',')).join(';');
    if (key === E.abcdKey) return;
    E.abcdKey = key; clear(E.abcd);
    const pts = [
      { t: bAtA ? 'A·B' : 'A', x: G.xS, y: y0, c: [[G.xS - 14, y0 + 20, 'end'], [G.xS + 14, y0 + 20, 'start']] },   // 출발점 왼쪽 아래 (그 자리의 공기 덩어리에 가리지 않게), 자리가 없으면 오른쪽
      { t: bAtC ? 'B·C' : 'C', x: G.xs, y: yM, c: [[G.xs + 22, yM - 4, 'start'], [G.xs + 24, yM + 16, 'start']] },   // 정상 오른쪽 (구름은 왼쪽 비탈)
      { t: 'D', x: G.xD, y: y0, lx: G.xD + 14, ly: y0 + 20, an: 'start' }                   // 도착점 오른쪽 아래
    ];
    if (hasB && !bAtA && !bAtC) {      // 비탈 안쪽 (바깥은 구름·응결 고도 글자). 글자와 겹치면 조금 아래로
      const yB = f.yOf(fo.H), xB = G.xAt(fo.H, 'up');
      pts.push({ t: 'B', x: xB, y: yB, c: [[xB + 10, yB + 5, 'start'], [xB + 12, yB + 20, 'start'], [xB + 16, yB + 34, 'start']] });
    }
    const hit = (a, b) => !(a.x + a.width + 4 < b.x || b.x + b.width + 4 < a.x || a.y + a.height + 4 < b.y || b.y + b.height + 4 < a.y);
    pts.forEach(p => {
      s('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 4, fill: '#2F3B45', stroke: '#fff', 'stroke-width': 1.5 }, E.abcd);
      const t = txt({ class: 'abcd-t halo-sky', fill: '#2F3B45' }, p.t, E.abcd);
      const cands = p.c || [[p.lx, p.ly, p.an]];
      let ok = false;
      for (const [x, y, an] of cands) {
        sa(t, { x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': an });
        let b; try { b = t.getBBox(); } catch (e) { b = null; }
        if (!b || (b.x >= 2 && b.x + b.width <= G.W - 2 && !avoid.some(a => hit(a, b)))) { ok = true; break; }
      }
      if (!ok) sa(t, { x: cands[0][0].toFixed(1), y: cands[0][1].toFixed(1), 'text-anchor': cands[0][2] });
    });
  }

  /* ───────── 기류 (streamline) ─────────
   * 산(올린 코사인)보다 넓고 완만한 혹을 그리는 곡선 2줄: 풍상측에서 오르고 정상을 지나 풍하측으로 내려간다.
   * 곡선 위 작은 화살표의 위치는 진행(st.s)만으로 정해져, 재생·일시정지·단계 이동·처음부터와 항상 맞는다. */
  function buildFlow(svg, f, G) {
    const y0 = f.yOf(0), Mpx = y0 - f.yOf(st.M), topY = f.yOf(ZMAX) + 34;     // 바람 방향 표시 아래까지만
    const bump = (x, wk) => { const u = Math.abs(x - G.xs) / wk; return u >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * u); };
    const specs = [
      { h: 24, A: Mpx, wf: 1.4 },                     // 지면 가까이: 비탈을 따라 오르내림 (공기 덩어리와 겹치지 않게 비탈에서 조금 더 띄움)
      { h: 0.4 * Mpx + 76, A: 0.6 * Mpx, wf: 1.9 }     // 위쪽: 정상 글자와 구름 위로 완만하게
    ];
    const up = specs[1], room = y0 - topY;
    if (up.h + up.A > room) { const k = Math.max(0, room) / (up.h + up.A); up.h *= k; up.A *= k; }
    const id = uid('fm');
    const mask = s('mask', { id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: G.W, height: f.H }, s('defs', null, svg));
    s('rect', { x: 0, y: 0, width: G.W, height: f.H, fill: '#fff' }, mask);
    E.flowHoles = s('g', null, mask); E.flowHoleKey = null;      // 비·글자 자리는 비움
    const g = s('g', { class: 'flow', 'aria-hidden': 'true', mask: `url(#${id})` }, svg);
    const lines = [];
    specs.forEach((sp, k) => {
      if (k === 1 && sp.h + sp.A < specs[0].h + specs[0].A + 18) return;   // 위 곡선이 들어갈 자리가 없으면 한 줄만
      const pts = [], L = [0];
      for (let x = 0; x <= G.W + 0.01; x += 3) pts.push([x, y0 - sp.h - sp.A * bump(x, G.w * sp.wf)]);
      for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      s('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '), fill: 'none', stroke: '#5F6E7B', 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: 0.4 }, g);
      const total = L[L.length - 1], gap = 130, marks = [];
      for (let i = 0; i < Math.ceil(total / gap) + 1; i++) {
        marks.push(s('path', { d: 'M-13 0 L-3 0 M2 0 L-4 -3.3 L-4 3.3 Z', fill: '#4E5D6A', stroke: '#4E5D6A', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0 }, g));
      }
      lines.push({ pts, L, total, gap, marks, phase: k * gap / 2 });
    });
    return lines;
  }
  /** 곡선 위 길이 d 지점의 위치와 방향(도) */
  function flowPoint(ln, d) {
    let lo = 0, hi = ln.L.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ln.L[m] < d) lo = m; else hi = m; }
    const a = ln.pts[lo], b = ln.pts[hi], t = clamp((d - ln.L[lo]) / Math.max(1e-6, ln.L[hi] - ln.L[lo]), 0, 1);
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI];
  }
  function renderFlow() {
    (E.flowLines || []).forEach(ln => {
      const off = (st.s * ln.total + ln.phase) % ln.gap;      // 공기 덩어리와 같은 빠르기로 곡선을 따라 이동
      ln.marks.forEach((m, i) => {
        const d = off + i * ln.gap;
        const op = 0.75 * clamp(Math.min(d - 14, ln.total - d) / 24, 0, 1);   // 양 끝에서는 서서히 나타나고 사라짐
        if (op <= 0) { sa(m, { opacity: 0 }); return; }
        const [x, y, ang] = flowPoint(ln, d);
        sa(m, { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${ang.toFixed(1)})`, opacity: op.toFixed(2) });
      });
    });
    // 기류가 비·글자와 겹치지 않게 그 자리만 비움 (구름은 기류 위에 그려 가림)
    const holes = [];
    const box = (el, pad, fall) => {
      if (!el || el.getAttribute('opacity') === '0') return;
      try { const b = el.getBBox(); if (b.width || b.height) holes.push([b.x - pad, b.y - pad, b.width + 2 * pad, b.height + 2 * pad + (fall || 0)]); } catch (e) { /* 무시 */ }
    };
    [E.sLCLt, E.rainT, E.dryT, E.peak, ...(E.ticks || []), ...E.abcd.querySelectorAll('text')].forEach(el => box(el, 4));
    [...E.rain.children].forEach(l => box(l, 4, 26));        // 빗줄기는 아래로 26px 떨어지는 애니메이션
    const hk = holes.map(b => b.map(v => Math.round(v)).join(',')).join('|');
    if (hk !== E.flowHoleKey) {
      E.flowHoleKey = hk; clear(E.flowHoles);
      holes.forEach(([x, y, w, h2]) => s('rect', { x, y, width: w, height: h2, rx: 4, fill: '#000' }, E.flowHoles));
    }
  }

  function buildScene(f) {
    const svg = sh.sceneSvg; clear(svg);
    const G = geo(f); E.geo = G;
    const y0 = f.yOf(0);
    s('rect', { x: 0, y: 0, width: G.W, height: y0, fill: skyGradient(svg, 'fsky') }, svg);
    for (let z = 1; z <= 3; z++) s('line', { x1: 0, x2: G.W, y1: f.yOf(z), y2: f.yOf(z), stroke: '#fff', 'stroke-width': 1.5, opacity: 0.8 }, svg);
    // 바람 방향
    const wy = f.yOf(ZMAX) + 14;
    const arrow = s('g', { opacity: 0.9 }, svg); E.wind = arrow;
    const wa = G.W * 0.05, wb = G.W * 0.05 + Math.min(150, G.W * 0.25);
    s('line', { x1: wa, x2: wb, y1: wy, y2: wy, stroke: '#4E5D6A', 'stroke-width': 2.5 }, arrow);
    s('path', { d: `M${wb - 10} ${wy - 7} L${wb} ${wy} L${wb - 10} ${wy + 7}`, fill: 'none', stroke: '#4E5D6A', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, arrow);
    txt({ x: wb + 8, y: wy + 5, class: 'lb-sm halo-sky', fill: '#4E5D6A' }, '바람 방향', arrow);
    // 산 (한 겹)
    let front = `M${G.xFU} ${y0}`;
    for (let x = G.xFU; x <= G.xFD; x += 3) front += ` L${x.toFixed(1)} ${f.yOf(G.zAt(x)).toFixed(1)}`;
    s('path', { d: front + ` L${G.xFD} ${y0} Z`, fill: '#8FA08B' }, svg);
    // 땅
    s('rect', { x: 0, y: y0, width: G.W, height: f.H - y0, fill: '#B9C6AE' }, svg);
    txt({ x: 12, y: f.H - 14, class: 'lb', fill: '#34402F' }, '풍상측', svg);
    txt({ x: G.xD + 10, y: f.H - 14, 'text-anchor': 'end', class: 'lb', fill: '#34402F' }, '풍하측', svg);
    E.ticks = [];
    if (f.stacked) for (let z = 0; z <= 3; z++) E.ticks.push(txt({ x: G.W - 8, y: f.yOf(z) - 5, 'text-anchor': 'end', class: 'tk' }, z + ' km', svg));
    // 응결 고도 · 구름 · 비 · 경로
    E.flowLines = buildFlow(svg, f, G);    // 기류 곡선 (구름·비·글자보다 아래)
    E.sLCL = s('line', { stroke: 'var(--lcl)', 'stroke-width': 2.5, 'stroke-dasharray': '12 5 3 5' }, svg);
    E.cloud = s('g', null, svg); E.cloudKey = null;
    E.rain = s('g', { class: 'rain' }, svg); E.rainKey = null;
    svg.appendChild(E.wind);                 // 바람 방향 표시는 높은 산의 구름에 가리지 않게 위로
    E.abcd = s('g', { class: 'abcd' }, svg); E.abcdKey = null;    // 교과서 그림처럼 A(출발) · B(응결 시작) · C(정상) · D(도착)
    E.rainT = txt({ class: 'lb-sm halo-sky', fill: '#1F5A88' }, '강수 → 수분이 빠져나가요', svg);
    E.sLCLt = txt({ class: 'lb-sm halo-sky', fill: '#7A4E10', 'text-anchor': 'end' }, '', svg);   // 구름 위에 써서 가리지 않게
    E.dryT = txt({ class: 'lb halo', fill: '#A13A2C', 'text-anchor': 'middle' }, '', svg);
    E.sNow = s('line', { 'data-role': 'now', x1: 0, x2: G.W, stroke: 'var(--ink)', 'stroke-width': 1.2, opacity: 0.45 }, svg);
    E.sNowTag = s('g', null, svg);
    E.sNowBg = s('rect', { rx: 6, height: 24, width: 64, fill: '#fff', stroke: '#C9C4B8' }, E.sNowTag);
    E.sNowT = txt({ class: 'lb-sm tnum', 'text-anchor': 'end' }, '', E.sNowTag);
    E.parcel = makeParcel(svg, { seed: 7 });
    sa(E.parcel.g, { tabindex: 0, role: 'slider', 'aria-label': '여정 진행', 'aria-valuemin': 0, 'aria-valuemax': 100 });
    E.parcel.g.addEventListener('keydown', e => {
      const k = { ArrowRight: 0.01, ArrowLeft: -0.01, ArrowUp: 0.01, ArrowDown: -0.01, PageUp: 0.1, PageDown: -0.1 }[e.key];
      if (k != null) { e.preventDefault(); pause(); setS(st.s + k); }
    });
    // 장면을 누르면 그 위치로 (경로 위 가장 가까운 지점)
    const hit = s('rect', { x: 0, y: 0, width: G.W, height: f.H, fill: 'transparent', class: 'drag' }, svg);
    let pid = null;
    const pick = ev => {
      const p = svgPoint(svg, ev);
      let best = 0, bd = 1e9;
      for (let i = 0; i <= 400; i++) { const d = Math.abs(G.xOfS(i / 400) - p.x); if (d < bd) { bd = d; best = i / 400; } }
      setS(best);
    };
    hit.addEventListener('pointerdown', ev => { pid = ev.pointerId; hit.setPointerCapture(pid); pause(); pick(ev); });
    hit.addEventListener('pointermove', ev => { if (pid === ev.pointerId) pick(ev); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => hit.addEventListener(t, ev => { if (pid === ev.pointerId) pid = null; }));
    svg.appendChild(E.parcel.g);
    E.parcel.g.style.pointerEvents = 'none';
    E.peak = txt({ x: G.xs, y: f.yOf(st.M) - 36, 'text-anchor': 'middle', class: 'lb-sm halo-sky', fill: '#3F4E3B', 'pointer-events': 'none' }, `정상 ${fmt(st.M, 1)} km`, svg);
  }
  function buildGraph(f) {
    const svg = sh.graphSvg; clear(svg);
    const xr = xRange();
    const g = s('g', null, svg);
    ax = drawAxes(g, f, xr);
    const p = ax.plot, o = ax.over;
    E.gM = s('line', { x1: ax.X0, x2: ax.X1, stroke: '#6E7F69', 'stroke-width': 1.5, 'stroke-dasharray': '2 4' }, p);
    E.gMt = txt({ x: ax.X0 + 8, class: 'lb-sm halo', fill: '#4E5E4A' }, '', o);
    E.gLCL = s('line', { x1: ax.X0, x2: ax.X1, stroke: 'var(--lcl)', 'stroke-width': 2.5, 'stroke-dasharray': '12 5 3 5' }, p);
    E.gLCLt = txt({ x: ax.X0 + 8, class: 'lb-sm halo', fill: '#7A4E10' }, '', o);
    E.cmp = s('g', { opacity: 0.38 }, p);
    E.ghost = s('g', { opacity: 0.4 }, p);
    E.done = s('g', null, p);
    E.gNow = s('line', { 'data-role': 'now', x1: ax.X0, x2: ax.X1, stroke: 'var(--ink)', 'stroke-width': 1.2, opacity: 0.45 }, p);
    E.marks = s('g', null, o);
    E.pts = PointPair(p);
    E.lblT = txt({ class: 'lb halo', fill: 'var(--temp)' }, '', o);
    E.lblD = txt({ class: 'lb halo', fill: 'var(--dew)', 'text-anchor': 'end' }, '', o);
    E.lblSame = txt({ class: 'lb halo', fill: 'var(--ink)' }, '', o);
    E.segLbl = s('g', null, o);
    E.edge = s('g', null, o);
    // 그래프를 눌러 높이로 이동 (현재 진행 방향 쪽 경로 위)
  }
  function renderLegend() {
    ui.legend.innerHTML = legendHTML('var(--temp)', '', '기온') + legendHTML('var(--dew)', 'dash', '이슬점') + (st.cmp ? legendHTML('#E3A99F', 'faint', '비교(옅은 선)') : '');
  }
  const pathVisible = () => st.showPath || (st.guided && st.arrivedOnce && st.showPath);

  /** 경로를 진행 위치 sEnd까지 잘라 [올라감 T, 올라감 Td, 내려감 T, 내려감 Td] 점 목록으로 */
  function pathPts(f, sEnd) {
    const up = posOf(Math.min(sEnd, SB), f.M);
    const zUp = sEnd <= SA ? 0 : up.z;
    const upT = [[f.start.T, 0]], upD = [[f.start.Td, 0]];
    if (f.reachesSat && zUp >= f.H - 1e-12) {
      const tH = f.T0 - 10 * f.H;
      if (f.H > 1e-12) { upT.push([tH, f.H]); upD.push([tH, f.H]); }
      const a = Physics.foehnAt(f, 'up', zUp);
      upT.push([a.T, zUp]); upD.push([a.Td, zUp]);
    } else {
      const a = Physics.foehnAt(f, 'up', zUp);
      upT.push([a.T, zUp]); upD.push([a.Td, zUp]);
    }
    let dnT = [], dnD = [];
    if (sEnd > SB) {
      const dz = posOf(sEnd, f.M).z;
      const b = Physics.foehnAt(f, 'down', dz);
      dnT = [[f.summit.T, f.M], [b.T, dz]]; dnD = [[f.summit.Td, f.M], [b.Td, dz]];
    }
    return { upT, upD, dnT, dnD };
  }
  function drawPathSet(g, f, P, opt) {
    clear(g);
    const w = opt.w || 3.5;
    const curUp = opt.cur === 'up', curDn = opt.cur === 'down';
    const line = (pp, color, dash, width, op) => { if (pp.length > 1) s('path', { d: pathD(pp, ax, f), fill: 'none', stroke: color, 'stroke-width': width, 'stroke-dasharray': dash || null, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: op }, g); };
    const emph = (cur) => opt.emph ? (cur ? 1 : 0.55) : 1;
    line(P.upT, 'var(--temp)', opt.dashAll, w + (curUp ? 1 : 0), emph(curUp));
    line(P.upD, 'var(--dew)', opt.dashAll || '9 6', w - 0.5 + (curUp ? 1 : 0), emph(curUp));
    line(P.dnT, 'var(--temp)', opt.dashAll, w + (curDn ? 1 : 0), emph(curDn));
    line(P.dnD, 'var(--dew)', opt.dashAll || '9 6', w - 0.5 + (curDn ? 1 : 0), emph(curDn));
    if (opt.chev) {
      chevrons(g, P.upT, ax, f, 'var(--temp)', 110); chevrons(g, P.upD, ax, f, 'var(--dew)', 110);
      chevrons(g, P.dnT, ax, f, 'var(--temp)', 110); chevrons(g, P.dnD, ax, f, 'var(--dew)', 110);
    }
  }

  function render() {
    renderControls();
    if (!sh || !sh.frame || !ax || !E.geo) return;
    const f = sh.frame, fo = F(), G = E.geo;
    const cur = stateAt(fo, st.s);
    const pos = posOf(st.s, st.M);
    const yz = f.yOf(cur.z);
    const yH = f.yOf(Math.min(fo.H, ZMAX));
    const passedLCL = fo.reachesSat && ((pos.side === 'up' && cur.z >= fo.H - 1e-9 && st.s > 0) || pos.side === 'down' || (fo.H <= 1e-9));

    /* 장면 */
    const px = G.xOfS(st.s);
    const showL = (passedLCL || pathVisible()) && fo.H <= ZMAX;
    sa(E.sLCL, { x1: 0, x2: fo.reachesSat ? G.xAt(fo.H, 'up') : G.xs, y1: yH, y2: yH, opacity: showL ? 1 : 0 });
    sa(E.sLCLt, { x: 8, 'text-anchor': 'start', y: yH - 7, opacity: showL ? 1 : 0 });
    E.sLCLt.textContent = fo.reachesSat ? `응결 고도 ${fZ(fo.H)} km` : `응결 고도 ${fZ(fo.H)} km (정상보다 높음)`;
    // 구름: 풍상측에서 지나온 포화 구간 (진행 위치로만 결정)
    const zTopUp = pos.side === 'down' ? st.M : (pos.seg === 'flatUp' ? 0 : cur.z);
    const ck = fo.precipitates && zTopUp > fo.H + 0.02 ? `${fo.H.toFixed(3)}|${zTopUp.toFixed(3)}` : '';
    if (ck !== E.cloudKey) {
      E.cloudKey = ck; clear(E.cloud); clear(E.rain);
      if (ck) {
        const n = Math.max(2, Math.ceil((zTopUp - fo.H) / 0.12));
        const top = f.yOf(zTopUp) - 40, bot = f.yOf(fo.H) + 4;
        cloudShape(E.cloud, { x0: 0, y0: top, x1: G.xs + 40, y1: bot }, c => {
          const R = rng(17);
          for (let i = 0; i <= n; i++) {
            const zz = fo.H + (zTopUp - fo.H) * i / n;
            const x = G.xAt(zz, 'up'), y = f.yOf(zz);
            const r = 15 + 7 * R();
            c.circle(x - r * 0.6, y - r * 0.55, r); c.circle(x - r * 1.6, y - r * 0.3, r * 0.85);
          }
        }, 0.92);
        const R2 = rng(5);
        for (let i = 0; i < Math.max(3, n); i++) {
          const zz = fo.H + (zTopUp - fo.H) * (i + 0.5) / Math.max(3, n);
          const x = G.xAt(zz, 'up') - 18 - R2() * 14, y = f.yOf(zz) + 2;
          const l = s('line', { x1: x, y1: y, x2: x + 3, y2: y + 13, stroke: '#4F86B5', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, E.rain);
          l.style.animationDelay = (i * 0.11) + 's';
        }
      }
    }
    E.rain.classList.toggle('rain', st.playing && !REDUCED_MOTION);
    // 강수 글자: 응결 고도 글자 아래, 응결 고도가 지면 가까이면 그 위
    sa(E.rainT, { x: 8, 'text-anchor': 'start', y: f.yOf(0) - yH < 60 ? yH - 30 : yH + 44, opacity: ck ? 1 : 0 });
    const dryOn = st.s >= 1 - 1e-9 && fo.precipitates;
    sa(E.dryT, { x: G.W - 8, 'text-anchor': 'end', y: f.yOf(0) - 40, opacity: dryOn ? 1 : 0 });
    E.dryT.textContent = '도착: 더 따뜻하고 건조';
    renderABCD(f, G, fo, [E.wind, showL ? E.sLCLt : null, ck ? E.rainT : null]);
    // 정상 글자: 바람 방향·응결 고도·C 글자와 겹치면 정상 옆으로 비킴
    {
      const yM = f.yOf(st.M), bb = el => { try { return el.getBBox(); } catch (e) { return null; } };
      const avoid = [E.wind, showL ? E.sLCLt : null, ...E.abcd.querySelectorAll('text')].filter(Boolean).map(bb).filter(Boolean);
      const hit = (a2, b2) => !(a2.x + a2.width + 4 < b2.x || b2.x + b2.width + 4 < a2.x || a2.y + a2.height + 4 < b2.y || b2.y + b2.height + 4 < a2.y);   // 4px 여유
      const cands = [[G.xs, yM - 36, 'middle'], [G.xs + 42, yM + 4, 'start'], [G.xs + 46, yM + 24, 'start']];
      let placed = false;
      for (const [x, y, an] of cands) {
        sa(E.peak, { x, y, 'text-anchor': an });
        const pb = bb(E.peak);
        if (!pb || !avoid.some(b2 => hit(pb, b2))) { placed = true; break; }
      }
      if (!placed) sa(E.peak, { x: cands[0][0], y: cands[0][1], 'text-anchor': cands[0][2] });
    }
    const rad = 13 + 2 * cur.z;
    renderFlow();
    // 공기 덩어리
    E.parcel.set(px, yz, rad, cur.precipitating ? 0.7 : 0);
    sa(E.parcel.g, { 'aria-valuenow': Math.round(st.s * 100), 'aria-valuetext': `${STAGE_NAME[atStage(fo)] || ''} 높이 ${fZ(cur.z)} km, 기온 ${fT(cur.T)} ℃, 이슬점 ${fT(cur.Td)} ℃` });
    sa(E.sNow, { y1: yz, y2: yz });
    sa(E.sNowBg, { x: G.W - 68, y: yz - 12 }); sa(E.sNowT, { x: G.W - 10, y: yz + 5 }); E.sNowT.textContent = `${fZ(cur.z)} km`;

    /* 그래프 */
    sa(E.gM, { y1: f.yOf(st.M), y2: f.yOf(st.M) });
    sa(E.gMt, { y: f.yOf(st.M) - 7 }); E.gMt.textContent = `산 정상 ${fmt(st.M, 1)} km`;
    const showGL = showL;
    const lclLabelY = Math.abs(f.yOf(fo.H) - f.yOf(st.M)) < 18 ? f.yOf(fo.H) + 18 : f.yOf(fo.H) - 7;
    sa(E.gLCL, { y1: yH, y2: yH, opacity: showGL ? 1 : 0 });
    sa(E.gLCLt, { y: lclLabelY, opacity: showGL ? 1 : 0 });
    E.gLCLt.textContent = fo.reachesSat ? (Math.abs(fo.H - st.M) < 1e-9 ? `응결 시작 = 정상 ${fZ(fo.H)} km` : `응결 시작 ${fZ(fo.H)} km`) : `응결 고도 ${fZ(fo.H)} km (정상보다 높음)`;
    if (pathVisible()) drawPathSet(E.ghost, f, pathPts(fo, 1), { dashAll: '1 6', w: 2.5 }); else clear(E.ghost);
    drawPathSet(E.done, f, pathPts(fo, st.s), { chev: true, emph: true, cur: pos.side });
    if (st.cmp) {
      const fc = Physics.foehn(st.cmp.T0, st.cmp.Td0, st.cmp.M);
      drawPathSet(E.cmp, f, pathPts(fc, 1), { w: 2.5 });
    } else clear(E.cmp);
    sa(E.gNow, { y1: yz, y2: yz });
    const xT = ax.gx(cur.T), xD = ax.gx(cur.Td);
    E.pts.set(xT, xD, yz, cur.saturated);
    const [sT, sD] = fPair(cur.T, cur.Td);
    const ly = clamp(yz - 12, ax.Y1 + 14, ax.Y0 - 8);
    sa(E.lblT, { x: xT + 12, y: ly, opacity: cur.saturated ? 0 : 1 }); E.lblT.textContent = `${sT} ℃`;
    sa(E.lblD, { x: xD - 12, y: ly, opacity: cur.saturated ? 0 : 1 }); E.lblD.textContent = `${sD} ℃`;
    E.lblSame.textContent = `기온 = 이슬점 ${fT(cur.T)} ℃`;
    const narrow = ax.X1 - ax.X0 < 360;
    const flip = xT + 14 + 150 > ax.X1;
    sa(E.lblSame, { x: narrow ? clamp(xT, ax.X0 + 75, ax.X1 - 75) : (flip ? xT - 14 : xT + 14), 'text-anchor': narrow ? 'middle' : (flip ? 'end' : 'start'), y: narrow ? clamp(yz + 26, ax.Y1 + 14, ax.Y0 - 8) : ly, opacity: cur.saturated ? 1 : 0 });
    // 단계 표시 + 상승/하강 이름
    clear(E.marks);
    const all = pathVisible();
    const S = stageList(fo);
    S.forEach(([k, sv]) => {
      if (!all && sv > st.s + 1e-9) return;
      const sp = stateAt(fo, sv);
      const y = f.yOf(sp.z), xt = ax.gx(sp.T);
      s('circle', { cx: xt, cy: y, r: 4.5, fill: '#fff', stroke: 'var(--temp)', 'stroke-width': 2 }, E.marks);
      if (!sp.saturated) s('circle', { cx: ax.gx(sp.Td), cy: y, r: 4.5, fill: '#fff', stroke: 'var(--dew)', 'stroke-width': 2 }, E.marks);
      if ((k === 'start' || k === 'arrive') && Math.abs(sv - st.s) > 1e-9) {
        const right = k === 'arrive' ? fo.arrival.T >= fo.start.T : fo.arrival.T < fo.start.T;
        if (k === 'arrive' && Math.abs(fo.arrival.T - fo.start.T) < 1e-9) return;
        txt({ x: xt + (right ? 8 : -8), y: y - 9, 'text-anchor': right ? 'start' : 'end', class: 'lb-sm halo', fill: '#4E5D6A' }, STAGE_NAME[k], E.marks);
      }
    });
    clear(E.segLbl);
    const P = pathPts(fo, st.s);
    const nameAt = (pp, label, side) => { if (pp.length < 2) return; const a = pp[0], b = pp[pp.length - 1]; if (Math.abs(b[1] - a[1]) < 0.4) return; const m = [lerp(a[0], b[0], 0.55), lerp(a[1], b[1], 0.55)]; txt({ x: ax.gx(m[0]) + (side ? 10 : -10), y: f.yOf(m[1]), 'text-anchor': side ? 'start' : 'end', class: 'lb-sm halo', fill: '#4E5D6A' }, label, E.segLbl); };
    if (ax.X1 - ax.X0 >= 360) { nameAt(P.upT, '상승', true); nameAt(P.dnT, '하강', true); }
    clear(E.edge);
    edgeMarker(E.edge, ax, f, cur.T, cur.z, 'var(--temp)');

    /* 수치 */
    const rh = Physics.relHumidity(cur.T, cur.Td);
    const stg = atStage(fo);
    let whereTxt = stg ? STAGE_NAME[stg] : (pos.seg === 'flatUp' ? '풍상측 평지' : pos.seg === 'flatDown' ? '풍하측 평지' : pos.side === 'up' ? '풍상측 상승' : '풍하측 하강');
    if (stg === 'lcl' && stg && Math.abs(stagePos(fo).lcl - stagePos(fo).summit) < 1e-9) whereTxt = '정상 · 응결 시작';
    ui.ro.set('where', `<span style="font-size:22px">${whereTxt}</span>`, st.s >= 1 - 1e-9 ? '풍하측 도착' : (pos.side === 'up' ? '풍상측 → 산 위' : '산 위 → 풍하측'));
    let cmpT = '', cmpD = '';
    if (st.cmp && stg) {
      const fc = Physics.foehn(st.cmp.T0, st.cmp.Td0, st.cmp.M);
      const sc = stagePos(fc)[stg];
      if (sc != null) { const c = stateAt(fc, sc); cmpT = `비교 ${fT(c.T)} ℃`; cmpD = `비교 ${fT(c.Td)} ℃`; }
      else { cmpT = '비교: 이 단계 없음'; }
    }
    if (st.s >= 1 - 1e-9) { cmpT = `출발보다 ${signed(fo.dT)} ℃` + (cmpT ? ` · ${cmpT}` : ''); cmpD = `출발보다 ${signed(fo.dTd)} ℃` + (cmpD ? ` · ${cmpD}` : ''); }
    ui.ro.set('z', `${fZ(cur.z)}<small>km</small>`, `응결 고도 ${passedLCL || pathVisible() ? fZ(fo.H) + ' km' : '?'}`);
    ui.ro.set('T', `${sT}<small>℃</small>`, cmpT);
    ui.ro.set('Td', `${sD}<small>℃</small>`, cmpD);
    ui.ro.set('rh', `${fmt(rh, 0)}<small>%</small>`, st.s >= 1 - 1e-9 ? `출발 ${fmt(Physics.relHumidity(fo.start.T, fo.start.Td), 0)} %` : (cur.saturated ? '포화' : '불포화'));
    renderGuide(fo, cur, pos, stg);
    renderTable(fo, stg);
    if (ch) ch.check();
  }
  function atStage(fo) {
    const P = stagePos(fo);
    const ks = ['arrive', 'summit', 'lcl', 'start'];
    for (const k of ks) if (P[k] != null && Math.abs(P[k] - st.s) < 1e-9) return k;
    return null;
  }
  function renderGuide(fo, cur, pos, stg) {
    if (st.notice) { ui.ro.guide('안내', 'neutral', st.notice); return; }
    let state = cur.saturated ? '포화' : '불포화', cls = cur.saturated ? 'sat' : 'unsat', msg;
    if (st.s <= 1e-9) msg = fo.start.saturated ? '출발부터 기온과 이슬점이 같은 포화 공기예요. 산을 오르는 내내 응결해 비가 내려요.' : `풍상측에서 출발해요. 기온 ${fT(fo.start.T)} ℃, 이슬점 ${fT(fo.start.Td)} ℃. <b>▶ 재생</b>으로 산을 넘겨 보세요.`;
    else if (st.s >= 1 - 1e-9) {
      state = '도착'; cls = 'neutral';
      msg = fo.precipitates
        ? `출발보다 기온은 <b>${fT(fo.dT)} ℃ 높고</b> 이슬점은 <b>${fT(-fo.dTd)} ℃ 낮아요</b> → 강수로 수분을 잃어 <b>고온 건조</b>해졌어요.`
        : (fo.reachesSat ? '정상에서 막 포화되었지만 비로 잃은 수분이 없어, 도착 기온·이슬점이 출발과 같아요.' : '응결이 일어나지 않아 내려오며 변화를 그대로 되돌렸어요. 도착 기온·이슬점이 출발과 같아요.');
    } else if (pos.seg === 'flatUp') msg = '산기슭으로 이동하는 중이에요. 높이가 그대로라 기온과 이슬점도 그대로예요.';
    else if (pos.side === 'up') {
      if (stg === 'summit') msg = fo.reachesSat ? (fo.precipitates ? '정상: 기온과 이슬점이 같아요(포화). 여기서부터 내려가요.' : '정상에서 기온과 이슬점이 처음 같아졌어요(포화). 포화 상태로 오른 구간은 없어요.') : noLclText(fo);
      else if (Math.abs(cur.z - fo.H) < 1e-9) msg = '기온과 이슬점이 같아져 <b>응결이 시작</b>돼요. 구름이 생기기 시작해요.';
      else if (cur.saturated) msg = '구름 속에서 응결해 <b>비가 내려요</b>. 기온과 이슬점이 함께 5 ℃/km씩 낮아져요.';
      else msg = '불포화 상태로 오르며 기온은 10 ℃/km, 이슬점은 2 ℃/km씩 낮아져요.';
    } else if (pos.seg === 'flatDown') msg = '풍하측 평지로 이동하는 중이에요.';
    else msg = '내려가며 기온은 <b>10 ℃/km</b>, 이슬점은 <b>2 ℃/km</b>씩 높아져요. 기온이 더 빨리 올라 <b>상대 습도가 낮아져요</b>.';
    ui.ro.guide(state, cls, msg);
  }
  function renderTable(fo, stg) {
    const rows = [['start', fo.start], ['lcl', fo.lclPoint], ['summit', fo.summit], ['arrive', fo.arrival]];
    let html = '<table class="stage-table"><thead><tr><th>단계</th><th>높이</th><th>기온</th><th>이슬점</th><th>상대 습도</th></tr></thead><tbody>';
    rows.forEach(([k, p]) => {
      if (!p) { html += `<tr><td>${STAGE_NAME[k]}</td><td colspan="4" style="text-align:left;color:var(--muted)">정상까지 응결하지 않음</td></tr>`; return; }
      html += `<tr class="${stg === k ? 'cur' : ''}"><td>${STAGE_NAME[k]}</td><td>${fZ(p.z)} km</td><td class="t">${fT(p.T)} ℃</td><td class="d">${fT(p.Td)} ℃</td><td>${fmt(Physics.relHumidity(p.T, p.Td), 0)} %</td></tr>`;
    });
    html += '</tbody></table>';
    html += `<p class="note">출발 → 도착: 기온 ${signed(fo.dT)} ℃, 이슬점 ${signed(fo.dTd)} ℃</p>`;
    if (ui.table.innerHTML !== html) ui.table.innerHTML = html;
  }
  function renderControls() {
    if (!ui.ctrl) return;
    const fo = F();
    ui.ctrl.setPlay(st.playing, st.s >= 1 - 1e-9 ? '↺ 처음부터 재생' : (st.s > 0 && st.guided ? '▶ 이어서 재생' : '▶ 재생'));
    const S = stageList(fo).map(x => x[1]);
    ui.ctrl.setStep(S.some(v => v < st.s - 1e-9), S.some(v => v > st.s + 1e-9));
    const P = stagePos(fo), cur = atStage(fo);
    Object.keys(ui.stageBtns).forEach(k => {
      const b = ui.stageBtns[k];
      b.classList.toggle('accent', P[k] != null && Math.abs(P[k] - st.s) < 1e-9);
      b.setAttribute('aria-pressed', P[k] != null && Math.abs(P[k] - st.s) < 1e-9 ? 'true' : 'false');
      b.title = P[k] == null ? '이 조건에서는 정상까지 응결이 일어나지 않아요' : '';
      b.classList.toggle('muted', P[k] == null);
      b.innerHTML = k === 'lcl' && P.lcl != null && Math.abs(P.lcl - P.summit) < 1e-9 ? '응결 시작(=정상)' : (k === 'lcl' && P.lcl === 0 ? '응결 시작(=출발)' : STAGE_NAME[k]);
    });
    void cur;
    if (document.activeElement !== ui.prog) ui.prog.value = Math.round(st.s * 1000);
    ui.prog.style.setProperty('--fill', (st.s * 100) + '%');
  }

  return {
    L, init, layout, tick, render,
    pause() { pause(); },
    onShow() { layout(); },
    hasFrame: () => !!(sh && sh.frame),
    api: { setS, setCond, play, step, goStage, resetMotion, resetDefaults, saveCompare, st, F, stagePos: () => stagePos(F()) }
  };
})();
