/**
 * main.js — 탭 전환, 화면 크기 변화, 애니메이션 루프 (하나만 돈다)
 */
'use strict';

const App = (function () {
  const TABS = { lcl: typeof LclLab !== 'undefined' ? LclLab : null, foehn: typeof FoehnLab !== 'undefined' ? FoehnLab : null, stab: typeof StabLab !== 'undefined' ? StabLab : null };
  const ORDER = ['lcl', 'foehn', 'stab'];
  let active = 'lcl';

  function show(id, focus) {
    if (id === active && TABS[id] && TABS[id].hasFrame()) return;
    const prev = TABS[active];
    if (prev && id !== active) prev.pause();          // 다른 탭으로 가면 진행 중인 움직임을 멈춘다
    ORDER.forEach(k => {
      const on = k === id;
      $('lab-' + k).classList.toggle('active', on);
      const b = $('tab-btn-' + k);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    active = id;
    if (focus) $('tab-btn-' + id).focus();
    if (TABS[id]) TABS[id].onShow();
  }

  function init() {
    ORDER.forEach(k => { if (TABS[k]) TABS[k].init($('lab-' + k)); });
    ORDER.forEach((k, i) => {
      const b = $('tab-btn-' + k);
      b.addEventListener('click', () => show(k));
      b.addEventListener('keydown', e => {
        let j = null;
        if (e.key === 'ArrowRight') j = (i + 1) % ORDER.length;
        if (e.key === 'ArrowLeft') j = (i + ORDER.length - 1) % ORDER.length;
        if (e.key === 'Home') j = 0;
        if (e.key === 'End') j = ORDER.length - 1;
        if (j == null) return;
        e.preventDefault();
        show(ORDER[j], true);
      });
    });
    // 제목을 누르면 처음 화면(1. 응결 고도)으로 — 다른 탭의 조건·진행은 그대로 둔다
    $('homeLink').addEventListener('click', e => { e.preventDefault(); show('lcl'); scrollTo(0, 0); document.body.scrollTop = 0; });

    // 화면 크기가 바뀌면 다시 배치
    let rt = null;
    const relayout = () => { clearTimeout(rt); rt = setTimeout(() => { const t = TABS[active]; if (t) t.layout(); }, 60); };
    window.addEventListener('resize', relayout);
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(document.querySelector('.wrap'));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

    // 창이 가려지면 멈춤 (돌아왔을 때 공기가 튀지 않게)
    document.addEventListener('visibilitychange', () => { if (document.hidden) { const t = TABS[active]; if (t) t.pause(); last = null; } });
    window.addEventListener('blur', () => { last = null; });

    TABS[active].onShow();
    requestAnimationFrame(loop);
  }

  let last = null;
  function loop(ts) {
    let dt = last == null ? 0 : (ts - last) / 1000;
    last = ts;
    if (dt > 0.25) dt = 0;          // 오래 멈췄다 돌아온 프레임은 건너뜀
    dt = Math.min(dt, 1 / 20);
    const t = TABS[active];
    if (t && dt > 0) t.tick(dt);
    requestAnimationFrame(loop);
  }

  document.addEventListener('DOMContentLoaded', init);
  return { TABS, show, get active() { return active; } };
})();
