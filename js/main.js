/**
 * main.js — 시작: 각 실험실 만들기, 탭 버튼, 애니메이션 루프
 */
'use strict';

(function start() {
  // 각 탭 화면 만들기 (탭 파일에서 registerTab으로 등록한 init 실행)
  Tabs.order.forEach(id => { const t = Tabs.impl[id]; if (t && t.init) t.init($(id)); });

  // 탭 버튼
  Tabs.order.forEach((id, i) => {
    const b = $('tabbtn-' + id);
    b.tabIndex = id === Tabs.active ? 0 : -1;
    b.addEventListener('click', () => showTab(id));
    b.addEventListener('keydown', ev => {
      let j = null;
      if (ev.key === 'ArrowRight') j = (i + 1) % Tabs.order.length;
      if (ev.key === 'ArrowLeft') j = (i - 1 + Tabs.order.length) % Tabs.order.length;
      if (ev.key === 'Home') j = 0;
      if (ev.key === 'End') j = Tabs.order.length - 1;
      if (j == null) return;
      ev.preventDefault();
      showTab(Tabs.order[j]);
      $('tabbtn-' + Tabs.order[j]).focus();
    });
  });

  $('homeLink').addEventListener('click', e => { e.preventDefault(); goHome(); });

  $('reset-stars').addEventListener('click', () => {
    if (!confirm('모은 별을 모두 초기화할까요? (새 수업 시작)')) return;
    resetAllStars();
  });
  $('cert-close').addEventListener('click', () => {
    $('cert-overlay').classList.remove('visible');
    spawnConfetti(24);
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') $('cert-overlay').classList.remove('visible');
  });

  renderStars();
  Object.keys(Mission.defs).forEach(renderMissionPanel);
  const first = Tabs.impl[Tabs.active];
  if (first && first.onShow) first.onShow();

  // 애니메이션 루프: 보이는 탭만 움직인다
  let last = null;
  function loop(ts) {
    const dt = last == null ? 0 : Math.min(0.05, (ts - last) / 1000);
    last = ts;
    const t = Tabs.impl[Tabs.active];
    if (t && t.tick) t.tick(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
