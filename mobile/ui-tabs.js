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
    const prev = document.getElementById('set-preview');
    if (prev) prev.hidden = true;
  }

  // ============= LIVE PREVIEW =============
  function showPreview() {
    const prev = document.getElementById('set-preview');
    if (prev) prev.hidden = false;
    refreshPreview();
  }
  function refreshPreview() {
    const prev = document.getElementById('set-preview');
    if (!prev) return;
    // Read live settings from localStorage + slider DOM
    let s = {};
    try { s = JSON.parse(localStorage.getItem('nova:mobile:settings') || '{}'); } catch {}
    const font   = (document.getElementById('set-font')?.value)   || s.font   || "'Lexend', sans-serif";
    const weight = (document.getElementById('set-weight')?.value) || s.weight || '500';
    const lh     = (document.getElementById('set-lh')?.value)     || s.lh     || '160';
    const ls     = (document.getElementById('set-ls')?.value)     || s.ls     || '0';
    const align  = document.getElementById('set-align-left')?.checked ? 'left' : 'center';
    const fg     = document.getElementById('set-color-fg')?.value || s.colorFg || '#fff';
    const bg     = document.getElementById('set-color-bg')?.value || s.colorBg || '';
    const t = prev.querySelector('.set-preview-text');
    if (t) {
      t.style.fontFamily = font;
      t.style.fontWeight = weight;
      t.style.lineHeight = (lh / 100).toString();
      t.style.letterSpacing = (ls || 0) + 'px';
      t.style.textAlign = align;
      t.style.color = fg;
    }
    if (bg) prev.style.background = bg;
  }
  // Hook into all modal inputs : when something changes, refresh preview
  document.addEventListener('input', (e) => {
    if (e.target.closest('#settings-modal')) {
      const modal = document.getElementById('settings-modal');
      if (modal && !modal.hidden) refreshPreview();
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.closest('#settings-modal')) {
      const modal = document.getElementById('settings-modal');
      if (modal && !modal.hidden) refreshPreview();
    }
  });
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
    // Show live preview only for visual sections
    const visualSections = ['text', 'playback', 'cam'];
    if (grpKeys && grpKeys.some(k => visualSections.includes(k))) {
      showPreview();
    } else {
      const prev = document.getElementById('set-preview');
      if (prev) prev.hidden = true;
    }
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

  // ============= BACKUP HANDLERS (ne dependent pas d'app.js) =============
  // Si app.js plante, le + script doit quand meme creer un script
  function backupNewScript() {
    try {
      const SCRIPTS_KEY = 'nova:mobile:scripts';
      const list = JSON.parse(localStorage.getItem(SCRIPTS_KEY) || '[]');
      const id = 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
      const s = { id, title: 'Nouveau script', content: '', updatedAt: Date.now() };
      list.push(s);
      localStorage.setItem(SCRIPTS_KEY, JSON.stringify(list));
      // Switch to editor view
      document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-editor')?.classList.add('active');
      const titleInput = document.getElementById('title-input');
      const textInput  = document.getElementById('text-input');
      if (titleInput) titleInput.value = s.title;
      if (textInput) textInput.value = '';
      // Try to also call app.js's openEditor if exposed
      console.log('[ui-tabs] backup new script created', id);
    } catch (e) { console.error('[ui-tabs] backupNewScript error', e); }
  }
  // Bind avec capture pour passer avant app.js si besoin
  const newBtn = document.getElementById('new-script');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      const before = (function () {
        try { return JSON.parse(localStorage.getItem('nova:mobile:scripts') || '[]').length; }
        catch { return 0; }
      })();
      setTimeout(() => {
        let after = 0;
        try { after = JSON.parse(localStorage.getItem('nova:mobile:scripts') || '[]').length; } catch {}
        if (after === before) {
          backupNewScript();
        }
      }, 80);
    });
  }

  // ============= BACKUP : EDITEUR (clean/save/tag-quick/commencer) =============
  function getCurScriptId() {
    try {
      const list = JSON.parse(localStorage.getItem('nova:mobile:scripts') || '[]');
      // Le script en cours d'edition est le dernier modifie ouvert
      // On utilise le 1er sortant (sort par updatedAt desc)
      list.sort((a,b) => b.updatedAt - a.updatedAt);
      return list[0]?.id;
    } catch { return null; }
  }
  function saveCurrentScript() {
    try {
      const titleInput = document.getElementById('title-input');
      const textInput  = document.getElementById('text-input');
      if (!titleInput || !textInput) return;
      const list = JSON.parse(localStorage.getItem('nova:mobile:scripts') || '[]');
      const id = getCurScriptId();
      const s = list.find(x => x.id === id);
      if (s) {
        s.title = titleInput.value;
        s.content = textInput.value;
        s.updatedAt = Date.now();
        localStorage.setItem('nova:mobile:scripts', JSON.stringify(list));
      }
    } catch {}
  }
  function insertAtCursor(textarea, text) {
    if (!textarea) return;
    const start = textarea.selectionStart || textarea.value.length;
    const end = textarea.selectionEnd || textarea.value.length;
    textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
    saveCurrentScript();
  }
  function cleanMarkdown(text) {
    if (!text) return '';
    const lines = text.split(/\r?\n/);
    const out = [];
    for (let raw of lines) {
      const tr = raw.trim();
      if (!tr) { out.push(''); continue; }
      if (/^#{1,6}\s/.test(tr)) continue;
      if (/^\*\*[^*\n]+\*\*\s*$/.test(tr)) continue;
      if (/^\[\s*\d+\s*[:.]?\s*\d*\s*[-–—]\s*\d+.*\]\s*[A-ZÀ-Ý ]*\s*$/.test(tr)) continue;
      if (/^>\s*$/.test(tr)) continue;
      let c = raw
        .replace(/^\s*>\s?/, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*\s][^*]*?)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
      if (c.trim()) out.push(c);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  // Backup handlers : NE FONT RIEN si app.js a deja repondu (sentinel sur le DOM)
  // - tag-quick : insert si la valeur du textarea n'a pas change
  document.querySelectorAll('.tag-quick[data-insert]').forEach(b => {
    b.addEventListener('click', () => {
      const txt = document.getElementById('text-input');
      if (!txt) return;
      const beforeVal = txt.value;
      const beforeLen = beforeVal.length;
      setTimeout(() => {
        // Si app.js a deja insere, length augmente
        if (txt.value.length > beforeLen) return;
        insertAtCursor(txt, b.dataset.insert);
      }, 30);
    });
  });
  // - clean : seulement si app.js n'a pas modifie le texte
  document.getElementById('clean-script')?.addEventListener('click', () => {
    const txt = document.getElementById('text-input');
    if (!txt) return;
    const beforeVal = txt.value;
    setTimeout(() => {
      if (txt.value !== beforeVal) return; // app.js a fait le job
      const cleaned = cleanMarkdown(beforeVal);
      if (cleaned !== beforeVal) {
        txt.value = cleaned;
        saveCurrentScript();
        showToast('Nettoyé : -' + (beforeVal.length - cleaned.length) + ' caractères');
      } else {
        showToast('Déjà propre ✓');
      }
    }, 30);
  });
  // - save : seulement si pas de feedback "Enregistré"
  document.getElementById('save-script')?.addEventListener('click', () => {
    const btn = document.getElementById('save-script');
    if (!btn) return;
    const beforeHTML = btn.innerHTML;
    setTimeout(() => {
      if (btn.innerHTML !== beforeHTML) return; // app.js a deja change le label
      saveCurrentScript();
      const orig = btn.innerHTML;
      btn.innerHTML = '✓ Enregistré';
      btn.classList.add('confirm');
      setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('confirm'); }, 1400);
    }, 30);
  });
  // Backup : back-editor button (prompter -> editor)
  document.getElementById('back-editor')?.addEventListener('click', () => {
    setTimeout(() => {
      const promp = document.getElementById('view-prompter');
      const editor = document.getElementById('view-editor');
      if (promp && !promp.classList.contains('active')) return; // app.js handled
      promp?.classList.remove('active');
      editor?.classList.add('active');
    }, 80);
  });
  // Backup : edit-btn (prompter inner -> editor)
  document.getElementById('edit-btn')?.addEventListener('click', () => {
    setTimeout(() => {
      const editor = document.getElementById('view-editor');
      if (editor?.classList.contains('active')) return;
      document.getElementById('view-prompter')?.classList.remove('active');
      editor?.classList.add('active');
    }, 80);
  });
  // Backup : settings-btn (prompter inner) -> open modal
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    setTimeout(() => {
      const modal = document.getElementById('settings-modal');
      if (modal && !modal.hidden) return;
      openModal();
    }, 80);
  });
  // Backup : back-home (editor -> scripts tab)
  document.getElementById('back-home')?.addEventListener('click', () => {
    setTimeout(() => {
      const editor = document.getElementById('view-editor');
      if (editor && !editor.classList.contains('active')) return;
      saveCurrentScript();
      editor?.classList.remove('active');
      setActiveTab('scripts');
    }, 80);
  });
  // Backup : delete-script
  document.getElementById('delete-script')?.addEventListener('click', () => {
    setTimeout(() => {
      const editor = document.getElementById('view-editor');
      if (editor && !editor.classList.contains('active')) return;
      // app.js dejà traité (confirm + suppression). Si pas, fallback minimal:
      if (!confirm('Supprimer ce script ?')) return;
      try {
        const list = JSON.parse(localStorage.getItem('nova:mobile:scripts') || '[]');
        const id = getCurScriptId();
        const filtered = list.filter(x => x.id !== id);
        localStorage.setItem('nova:mobile:scripts', JSON.stringify(filtered));
      } catch {}
      editor?.classList.remove('active');
      setActiveTab('scripts');
    }, 100);
  });

  // Commencer button : open prompter (uses app.js's openPrompter if available, else fallback)
  document.getElementById('open-prompter')?.addEventListener('click', () => {
    saveCurrentScript();
    const txt = document.getElementById('text-input');
    if (!txt || !txt.value.trim()) {
      showToast('Script vide');
      return;
    }
    setTimeout(() => {
      // If app.js openPrompter ran, view-prompter is now active
      const promp = document.getElementById('view-prompter');
      if (promp && promp.classList.contains('active')) return;
      // Otherwise: backup — show prompter view with text rendered
      document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-editor')?.classList.remove('active');
      const ptext = document.getElementById('prompter-text');
      if (ptext) ptext.textContent = txt.value;
      document.getElementById('view-prompter')?.classList.add('active');
    }, 80);
  });

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
