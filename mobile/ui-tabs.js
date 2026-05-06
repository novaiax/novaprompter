// =====================================================
// Teleprompter Mobile — Tab navigation + UI glue
// Handles the 5-tab bottom bar, banner dismiss, timer,
// settings rows, recordings list rendering.
// =====================================================
(function () {
  'use strict';

  const TABS = ['scripts', 'recordings', 'hub', 'timer', 'settings'];
  const VIEW_BY_TAB = {
    scripts:    'view-home',
    recordings: 'view-recordings',
    hub:        'view-hub',
    timer:      'view-timer',
    settings:   'view-settings'
  };

  // ============= TAB SWITCHING =============
  function setActiveTab(tabName) {
    if (!TABS.includes(tabName)) tabName = 'scripts';

    // hide editor + prompter (full screens)
    document.getElementById('view-editor')?.classList.remove('active');
    document.getElementById('view-prompter')?.classList.remove('active');

    // hide all tab-views
    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));

    // show requested
    const targetId = VIEW_BY_TAB[tabName];
    document.getElementById(targetId)?.classList.add('active');

    // update tab pills
    document.querySelectorAll('.tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabName);
    });

    // show top app bar + tab bar
    document.body.classList.add('show-tabbar');
    document.getElementById('app-topbar').style.display = '';

    // tab-specific updates
    if (tabName === 'recordings') refreshRecordings();
    if (tabName === 'scripts')    refreshBanner();

    // Show topbar "+" only on Recordings (matches mockup)
    const addBtn = document.getElementById('topbar-add');
    if (addBtn) addBtn.hidden = (tabName !== 'recordings');

    window.scrollTo(0, 0);
  }

  // expose for app.js
  window.showTab = setActiveTab;

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });

  // settings rows that go to a tab
  document.querySelectorAll('[data-go-tab]').forEach(el => {
    el.addEventListener('click', () => setActiveTab(el.dataset.goTab));
  });

  // settings rows that open the deep-settings modal
  document.querySelectorAll('[data-open-prompter-set], #open-sync-row').forEach(el => {
    el.addEventListener('click', () => {
      const modal = document.getElementById('settings-modal');
      if (modal) modal.hidden = false;
    });
  });

  // top-bar menu icon (••• in top right) -> open modal
  document.getElementById('topbar-menu')?.addEventListener('click', () => {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.hidden = false;
  });

  // ============= EDITOR / PROMPTER hide tab bar =============
  function hideTabBar() { document.body.classList.remove('show-tabbar'); document.getElementById('app-topbar').style.display = 'none'; }
  function showTabBar() { document.body.classList.add('show-tabbar'); document.getElementById('app-topbar').style.display = ''; }
  window.__hideTabBar = hideTabBar;
  window.__showTabBar = showTabBar;

  // observe view-editor and view-prompter active state to hide tabbar
  const observer = new MutationObserver(() => {
    const ed = document.getElementById('view-editor');
    const pr = document.getElementById('view-prompter');
    if ((ed && ed.classList.contains('active')) || (pr && pr.classList.contains('active'))) hideTabBar();
    else showTabBar();
  });
  ['view-editor', 'view-prompter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el, { attributes: true, attributeFilter: ['class'] });
  });

  // ============= REVIEW BANNER =============
  const BANNER_KEY = 'tpr:banner:closed';
  function refreshBanner() {
    const b = document.getElementById('review-banner');
    if (!b) return;
    if (localStorage.getItem(BANNER_KEY) === '1') b.classList.add('hidden');
  }
  document.getElementById('review-close')?.addEventListener('click', () => {
    document.getElementById('review-banner').classList.add('hidden');
    localStorage.setItem(BANNER_KEY, '1');
  });

  // ============= FOLDERS COLLAPSE =============
  document.getElementById('folders-toggle')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    btn.classList.toggle('collapsed');
    const empty = document.getElementById('folders-empty');
    if (empty) empty.style.display = btn.classList.contains('collapsed') ? 'none' : '';
  });

  // ============= RECORDINGS LIST =============
  const REC_KEY = 'tpr:recordings';
  function loadRecordings() {
    try { return JSON.parse(localStorage.getItem(REC_KEY) || '[]'); } catch { return []; }
  }
  function refreshRecordings() {
    const grid = document.getElementById('recordings-grid');
    const empty = document.getElementById('recordings-empty');
    if (!grid) return;
    const list = loadRecordings();
    grid.innerHTML = '';
    if (!list.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    for (const r of list) {
      const card = document.createElement('div');
      card.className = 'recording-card';
      const synced = r.synced ? 'synced' : 'local';
      const tag = r.synced ? 'Synced ✓' : 'Local';
      card.innerHTML = `
        <div class="recording-thumb">
          ${r.thumb ? `<img src="${r.thumb}" style="width:100%;height:100%;object-fit:cover" />` : '<span>video</span>'}
          <span class="rec-tag ${synced}">${tag}</span>
          <span class="rec-duration">${r.duration || '0m 00s'}</span>
        </div>
        <div class="recording-meta">
          <p class="rec-title">${(r.title || 'recording').replace(/[<>]/g, '')}</p>
          <p class="rec-date">${r.date || ''}</p>
        </div>
      `;
      grid.appendChild(card);
    }
  }
  window.__refreshRecordings = refreshRecordings;

  // ============= TIMER =============
  let timerSecondsLeft = 60;
  let timerTotal = 60;
  let timerInterval = null;
  const arcEl = document.getElementById('timer-arc');
  const minEl = document.getElementById('timer-min');
  const secEl = document.getElementById('timer-sec');
  const startBtn = document.getElementById('timer-start');
  const resetBtn = document.getElementById('timer-reset');
  const addBtn = document.getElementById('timer-add');
  const ARC_LEN = 540;

  function paintTimer() {
    const m = String(Math.floor(timerSecondsLeft / 60)).padStart(2, '0');
    const s = String(timerSecondsLeft % 60).padStart(2, '0');
    if (minEl) minEl.textContent = m;
    if (secEl) secEl.textContent = s;
    if (arcEl) {
      const ratio = timerTotal > 0 ? timerSecondsLeft / timerTotal : 0;
      arcEl.setAttribute('stroke-dashoffset', String(ARC_LEN - ARC_LEN * ratio));
    }
  }
  paintTimer();

  startBtn?.addEventListener('click', () => {
    if (timerInterval) {
      clearInterval(timerInterval); timerInterval = null;
      startBtn.textContent = 'Demarrer';
      return;
    }
    if (timerSecondsLeft <= 0) { timerSecondsLeft = timerTotal = 60; }
    startBtn.textContent = 'Pause';
    timerInterval = setInterval(() => {
      timerSecondsLeft = Math.max(0, timerSecondsLeft - 1);
      paintTimer();
      if (timerSecondsLeft === 0) {
        clearInterval(timerInterval); timerInterval = null;
        startBtn.textContent = 'Demarrer';
      }
    }, 1000);
  });
  resetBtn?.addEventListener('click', () => {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    timerSecondsLeft = timerTotal = 60;
    if (startBtn) startBtn.textContent = 'Demarrer';
    paintTimer();
  });
  addBtn?.addEventListener('click', () => {
    timerTotal += 60; timerSecondsLeft += 60; paintTimer();
  });

  // ============= INIT =============
  document.addEventListener('DOMContentLoaded', () => {
    setActiveTab('scripts');
    refreshBanner();
    refreshRecordings();
  });
  // also set immediately if already loaded
  if (document.readyState !== 'loading') {
    setActiveTab('scripts');
    refreshBanner();
    refreshRecordings();
  }
})();
