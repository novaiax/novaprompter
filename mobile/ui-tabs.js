// =====================================================
// Teleprompter Mobile — Tab navigation + UI glue
// 3 onglets : Scripts / Recordings / Settings
// =====================================================
(function () {
  'use strict';

  const TABS = ['scripts', 'recordings', 'settings'];
  const VIEW_BY_TAB = {
    scripts:    'view-home',
    recordings: 'view-recordings',
    settings:   'view-settings'
  };

  // ============= TAB SWITCHING =============
  function setActiveTab(tabName) {
    if (!TABS.includes(tabName)) tabName = 'scripts';

    document.getElementById('view-editor')?.classList.remove('active');
    document.getElementById('view-prompter')?.classList.remove('active');

    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
    document.getElementById(VIEW_BY_TAB[tabName])?.classList.add('active');

    document.querySelectorAll('.tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabName);
    });

    document.body.classList.add('show-tabbar');
    const topbar = document.getElementById('app-topbar');
    if (topbar) topbar.style.display = '';

    if (tabName === 'recordings') refreshRecordings();
    if (tabName === 'scripts')    refreshBanner();

    const addBtn = document.getElementById('topbar-add');
    if (addBtn) addBtn.hidden = (tabName !== 'recordings');

    window.scrollTo(0, 0);
  }

  window.showTab = setActiveTab;

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });

  // settings rows that go to a tab
  document.querySelectorAll('[data-go-tab]').forEach(el => {
    el.addEventListener('click', () => setActiveTab(el.dataset.goTab));
  });

  // ============= EDITOR / PROMPTER hide tab bar =============
  function hideChromes() {
    document.body.classList.remove('show-tabbar');
    const topbar = document.getElementById('app-topbar');
    if (topbar) topbar.style.display = 'none';
  }
  function showChromes() {
    document.body.classList.add('show-tabbar');
    const topbar = document.getElementById('app-topbar');
    if (topbar) topbar.style.display = '';
  }

  const observer = new MutationObserver(() => {
    const ed = document.getElementById('view-editor');
    const pr = document.getElementById('view-prompter');
    if ((ed && ed.classList.contains('active')) || (pr && pr.classList.contains('active'))) hideChromes();
    else showChromes();
  });
  ['view-editor', 'view-prompter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el, { attributes: true, attributeFilter: ['class'] });
  });

  // ============= MENU / SETTINGS MODAL =============
  function openModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.hidden = false;
  }
  function closeModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.hidden = true;
  }
  // Triple-bind close X just to be safe
  document.getElementById('close-settings')?.addEventListener('click', closeModal);
  document.getElementById('settings-backdrop')?.addEventListener('click', closeModal);

  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // top-bar •••
  document.getElementById('topbar-menu')?.addEventListener('click', openModal);

  // settings rows that open the deep-settings modal, filtered to one section
  const ROW_TO_GRP = {
    'open-text-set':     ['text'],
    'open-playback-set': ['playback'],
    'open-cam-set':      ['cam'],
    'open-tags-set':     ['tags'],
    'open-sync-row':     ['sync']
  };
  function showOnlyGroup(grpKeys) {
    const groups = document.querySelectorAll('.setting-group');
    if (!grpKeys || !grpKeys.length) {
      groups.forEach(g => g.style.display = '');
      return;
    }
    groups.forEach(g => {
      const k = g.dataset.grp;
      g.style.display = grpKeys.includes(k) ? '' : 'none';
    });
  }
  function openModalSection(grpKeys) {
    showOnlyGroup(grpKeys);
    openModal();
  }
  Object.keys(ROW_TO_GRP).forEach(rowId => {
    const el = document.getElementById(rowId);
    if (!el) return;
    el.addEventListener('click', () => openModalSection(ROW_TO_GRP[rowId]));
  });
  // Reset on close so next open shows all (safety)
  function resetSections() { showOnlyGroup(null); }
  document.getElementById('close-settings')?.addEventListener('click', resetSections);
  document.getElementById('settings-backdrop')?.addEventListener('click', resetSections);

  // ============= BANNER =============
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
  // Banner CTA -> ouvre la GitHub pour étoile / review
  document.querySelector('.banner-cta')?.addEventListener('click', () => {
    window.open('https://github.com/novaiax/novaprompter', '_blank');
  });

  // ============= FOLDERS COLLAPSE =============
  document.getElementById('folders-toggle')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    btn.classList.toggle('collapsed');
    const empty = document.getElementById('folders-empty');
    if (empty) empty.style.display = btn.classList.contains('collapsed') ? 'none' : '';
  });

  // Folders + (placeholder pour maintenant : crée un dossier en mémoire)
  document.querySelector('.folders-section .section-add')?.addEventListener('click', () => {
    const name = prompt('Nom du dossier ?');
    if (!name) return;
    try {
      const FOLDERS_KEY = 'tpr:folders';
      const list = JSON.parse(localStorage.getItem(FOLDERS_KEY) || '[]');
      list.push({ id: 'f_' + Date.now().toString(36), name });
      localStorage.setItem(FOLDERS_KEY, JSON.stringify(list));
      // toast simple
      showToast('Dossier "' + name + '" créé');
    } catch {}
  });

  // Topbar + sur Recordings -> bascule sur Scripts et crée un nouveau script
  document.getElementById('topbar-add')?.addEventListener('click', () => {
    setActiveTab('scripts');
    setTimeout(() => document.getElementById('new-script')?.click(), 50);
  });

  // ============= SETTINGS DATA ROWS =============
  // Export
  document.getElementById('row-export')?.addEventListener('click', () => {
    document.getElementById('export-data')?.click();
  });
  // Import
  document.getElementById('row-import')?.addEventListener('click', () => {
    document.getElementById('import-data')?.click();
  });
  // Share
  document.getElementById('row-share')?.addEventListener('click', async () => {
    const data = {
      title: 'Teleprompter',
      text: 'Telepromteur web 100% local',
      url: location.href
    };
    if (navigator.share) {
      try { await navigator.share(data); } catch {}
    } else if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(location.href);
        showToast('Lien copié !');
      } catch { showToast(location.href); }
    } else {
      showToast(location.href);
    }
  });

  // ============= TOAST helper =============
  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) { console.log(msg); return; }
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { t.hidden = true; }, 2200);
  }

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
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
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

  // ============= INIT =============
  function init() {
    setActiveTab('scripts');
    refreshBanner();
    refreshRecordings();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
