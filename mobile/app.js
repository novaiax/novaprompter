// NovaPrompter Mobile — version web autonome
// Storage: localStorage. Voice: Web Speech API (Chrome/Edge Android).
// Pas de dependance externe sauf Google Fonts.

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ================= STORAGE =================
const SCRIPTS_KEY = 'nova:mobile:scripts';
const SETTINGS_KEY = 'nova:mobile:settings';
const TAGS_KEY = 'nova:mobile:tags';

const DEFAULT_TAGS = [
  { name: 'souffle', label: '🌬 RESPIRE', color: '#ff7a3a', bgColor: '#2a1010', size: 1.1, pause: 1.5 },
  { name: 'pause',   label: '⏸ PAUSE',    color: '#ffd000', bgColor: '#2a2010', size: 1.1, pause: 1.0 },
  { name: 'regard',  label: '👀 CAM',     color: '#4ad295', bgColor: '#102a1c', size: 1.0, pause: 0   }
];

function loadScripts() {
  try { return JSON.parse(localStorage.getItem(SCRIPTS_KEY) || '[]'); }
  catch { return []; }
}
function saveScripts(list) { localStorage.setItem(SCRIPTS_KEY, JSON.stringify(list)); }
function newScript(title = 'Nouveau script') {
  return { id: 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5), title, content: '', updatedAt: Date.now() };
}

const CORRECT_SYNC_SERVER = 'https://novaprompter-production.up.railway.app';
const OLD_SYNC_SERVERS = [
  'https://novaprompter-api.up.railway.app',
  'http://novaprompter-api.up.railway.app',
  'https://novaprompter.up.railway.app'
];
function loadSettings() {
  const def = {
    theme: 'dark',
    colorFg: '#ffffff', colorBg: '#000000',
    font: "'Lexend', sans-serif",
    weight: 500, lh: 160, ls: 0,
    width: 90, focus: 50, lookahead: 4,
    mirrorH: false, mirrorV: false, alignLeft: false,
    keepAwake: true,
    voiceLang: 'fr-FR',
    speed: 60, fontSize: 32,
    textOpa: 100,
    camOn: false, camFacing: 'user', camMirror: true,
    camBlur: false, camBlurAmount: 12,
    textBoxH: null,
    syncServer: CORRECT_SYNC_SERVER,
    syncToken: '', syncEmail: ''
  };
  let s;
  try { s = Object.assign(def, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
  catch { s = def; }
  // Migration : remplace les anciennes URLs par la bonne
  const cleanedUrl = (s.syncServer || '').replace(/\/+$/, '');
  if (OLD_SYNC_SERVERS.includes(cleanedUrl)) {
    s.syncServer = CORRECT_SYNC_SERVER;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }
  return s;
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function loadTags() {
  try { return JSON.parse(localStorage.getItem(TAGS_KEY) || 'null') || DEFAULT_TAGS; }
  catch { return DEFAULT_TAGS; }
}

let scripts = loadScripts();
let settings = loadSettings();
let tags = loadTags();
let currentScriptId = null;
let scriptsFilter = '';

// ================= NAVIGATION =================
const views = ['home', 'editor', 'prompter'];
function showView(name) {
  // Hide all tab-views first when going to editor/prompter
  if (name === 'editor' || name === 'prompter') {
    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
    $('#view-editor').classList.toggle('active', name === 'editor');
    $('#view-prompter').classList.toggle('active', name === 'prompter');
  } else {
    // 'home' = back to scripts tab
    $('#view-editor').classList.remove('active');
    $('#view-prompter').classList.remove('active');
    if (typeof window.showTab === 'function') window.showTab('scripts');
  }
  if (name === 'prompter') startWakeLock();
  else releaseWakeLock();
  if (name !== 'prompter') stopVoice();
}

// ================= HOME : liste scripts =================
const elList = $('#script-list');
const elSearch = $('#search-input');

function renderList() {
  elList.innerHTML = '';
  const filtered = scriptsFilter
    ? scripts.filter(s => (s.title + ' ' + s.content).toLowerCase().includes(scriptsFilter.toLowerCase()))
    : scripts;
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'script-card empty';
    empty.textContent = scriptsFilter ? 'Aucun resultat' : 'Tape + pour commencer';
    elList.appendChild(empty);
    return;
  }
  filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  for (const s of filtered) {
    const card = document.createElement('div');
    card.className = 'script-card';
    const preview = (s.content || '').replace(/\[[^\]]+\]/g, '').trim().slice(0, 220);
    card.innerHTML = `
      <div class="script-card-preview">${escapeHtml(preview) || '<span style="opacity:.4">vide</span>'}</div>
      <div class="script-card-title">${escapeHtml(s.title || 'Sans titre')}</div>
    `;
    card.addEventListener('click', () => openEditor(s.id));
    elList.appendChild(card);
  }
}
elSearch.addEventListener('input', () => { scriptsFilter = elSearch.value; renderList(); });

$('#new-script').addEventListener('click', () => {
  const s = newScript();
  scripts.push(s); saveScripts(scripts);
  openEditor(s.id);
});

const _openSettingsBtn = $('#open-settings');
if (_openSettingsBtn) _openSettingsBtn.addEventListener('click', openSettings);

// ================= EDITOR =================
const elTitle = $('#title-input');
const elText = $('#text-input');

function openEditor(id) {
  currentScriptId = id;
  const s = scripts.find(x => x.id === id);
  if (!s) return;
  elTitle.value = s.title || '';
  elText.value = s.content || '';
  showView('editor');
  setTimeout(() => elText.focus(), 50);
}

function saveCurrent() {
  if (!currentScriptId) return;
  const s = scripts.find(x => x.id === currentScriptId);
  if (!s) return;
  s.title = elTitle.value;
  s.content = elText.value;
  s.updatedAt = Date.now();
  saveScripts(scripts);
}
let saveTimer;
function autosave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveCurrent, 400); }
elTitle.addEventListener('input', autosave);
elText.addEventListener('input', autosave);

$('#back-home').addEventListener('click', () => { saveCurrent(); renderList(); showView('home'); });

$('#delete-script').addEventListener('click', () => {
  if (!confirm('Supprimer ce script ?')) return;
  scripts = scripts.filter(s => s.id !== currentScriptId);
  saveScripts(scripts);
  currentScriptId = null;
  renderList();
  showView('home');
});

$('#clean-script').addEventListener('click', () => {
  const before = elText.value;
  elText.value = cleanScript(before);
  autosave();
  toast(before === elText.value ? 'Déjà propre ✓' : `Nettoyé : -${before.length - elText.value.length} caractères`);
});

// Bouton "Enregistrer maintenant" — feedback visuel
const elSaveBtn = document.getElementById('save-script');
if (elSaveBtn) elSaveBtn.addEventListener('click', () => {
  saveCurrent();
  saveSettings(settings);
  // Feedback vert + toast
  const orig = elSaveBtn.innerHTML;
  elSaveBtn.innerHTML = '✓ Enregistré';
  elSaveBtn.classList.add('confirm');
  setTimeout(() => {
    elSaveBtn.innerHTML = orig;
    elSaveBtn.classList.remove('confirm');
  }, 1400);
  toast('Script + réglages enregistrés');
});

$$('.tag-quick').forEach(b => b.addEventListener('click', () => insertAtCursor(elText, b.dataset.insert)));

function insertAtCursor(el, text) {
  const start = el.selectionStart, end = el.selectionEnd;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + text.length;
  el.focus();
  autosave();
}

function cleanScript(text) {
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

$('#open-prompter').addEventListener('click', () => { saveCurrent(); openPrompter(); });

// ================= PROMPTER =================
const elStage = $('#prompter-stage');
const elPText = $('#prompter-text');
const elFocus = $('#focus-line');
const elPlay = $('#play-btn');         // null avec nouveau layout (REC remplace)
const elReset = $('#reset-btn');       // null
const elModeStatus = $('#mode-status'); // null
const elSpeedSlider = $('#speed-slider');
const elSpeedVal = $('#speed-val');
const elSizeSlider = $('#size-slider'); // null
const elSizeVal = $('#size-val');       // null
const elControls = $('#prompter-controls');
const elShowCtrl = $('#show-controls'); // null

let promptState = {
  text: '', mode: 'auto', playing: false,
  speed: 60, fontSize: 42, focus: 50, lookahead: 4,
  scrollPx: 0, progressRatio: 0,
  words: [], tokens: []
};

function openPrompter() {
  const s = scripts.find(x => x.id === currentScriptId);
  if (!s || !s.content.trim()) { toast('Script vide'); return; }
  promptState.text = s.content;
  promptState.scrollPx = 0;
  promptState.progressRatio = 0;
  promptState.playing = false;
  // Re-injecte les settings courants
  promptState.speed = settings.speed || 60;
  promptState.fontSize = settings.fontSize || 42;
  promptState.focus = settings.focus || 50;
  promptState.lookahead = settings.lookahead || 4;
  if (elSpeedSlider) { elSpeedSlider.value = promptState.speed; if (elSpeedVal) elSpeedVal.textContent = promptState.speed; }
  if (elSizeSlider) { elSizeSlider.value = promptState.fontSize; if (elSizeVal) elSizeVal.textContent = promptState.fontSize; }
  if (elOpaSlider) { elOpaSlider.value = settings.textOpa || 100; elOpaVal.textContent = settings.textOpa || 100; }
  document.documentElement.style.setProperty('--text-opa', (settings.textOpa || 100) / 100);
  // Sync sliders avancés avec les settings courants
  if (elFocusPromSlider) { elFocusPromSlider.value = settings.focus; elFocusPromVal.textContent = settings.focus; }
  if (elLookPromSlider) { elLookPromSlider.value = settings.lookahead; elLookPromVal.textContent = settings.lookahead; }
  if (elWidthPromSlider) { elWidthPromSlider.value = settings.width; elWidthPromVal.textContent = settings.width; }
  if (elMirrorHBtn) elMirrorHBtn.classList.toggle('active', settings.mirrorH);
  if (elMirrorVBtn) elMirrorVBtn.classList.toggle('active', settings.mirrorV);
  if (elCamMirrorBtn) elCamMirrorBtn.classList.toggle('active', settings.camMirror);
  applySettings();
  rebuildText();
  elPlay.textContent = '▶';
  elModeStatus.textContent = 'Pause';
  showView('prompter');
  setTimeout(layoutFocus, 50);
  // Auto-start cam si l'utilisateur l'avait laissée activée
  if (settings.camOn) startCam(settings.camFacing).catch(() => {});
}

$('#back-editor').addEventListener('click', () => {
  stopVoice();
  if (mediaRecorder) stopRecording();
  stopCam();
  showView('editor');
});

if (elPlay) elPlay.addEventListener('click', togglePlay);
if (elReset) elReset.addEventListener('click', () => {
  promptState.scrollPx = 0; promptState.progressRatio = 0;
  voiceIdx = 0; phraseAnchor = 0; applyScroll();
});

function togglePlay() {
  promptState.playing = !promptState.playing;
  if (elPlay) elPlay.textContent = promptState.playing ? '❚❚' : '▶';
  if (elModeStatus) elModeStatus.textContent = promptState.playing ? (promptState.mode === 'auto' ? 'Lecture auto' : 'Voice') : 'Pause';
}

// Mode segment : voice (AUTO SCROLL) ou auto (FIXED SPEED)
$$('.mode-btn[data-mode]').forEach(b => b.addEventListener('click', () => {
  $$('.mode-btn[data-mode]').forEach(x => x.classList.toggle('active', x === b));
  promptState.mode = b.dataset.mode;
  if (promptState.mode === 'voice') startVoice();
  else stopVoice();
}));

// Bouton edit (ouvre l'editor) et settings (ouvre la modal)
const elEditBtn = document.getElementById('edit-btn');
const elSettingsBtn = document.getElementById('settings-btn');
if (elEditBtn) elEditBtn.addEventListener('click', () => {
  if (mediaRecorder) stopRecording();
  stopCam();
  showView('editor');
});
if (elSettingsBtn) elSettingsBtn.addEventListener('click', () => openSettings());

// REC button = démarre/arrête enregistrement ET le scroll auto
const elRecBtn = $('#rec-btn');
if (elRecBtn) elRecBtn.addEventListener('click', () => {
  if (mediaRecorder) stopRecording();
  else startRecording();
});

// Tap sur le texte (court) = play/pause du scroll. Long press = swipe (déjà géré).
let textTapStart = 0;
elStage.addEventListener('touchstart', (e) => { textTapStart = Date.now(); }, { passive: true });
elStage.addEventListener('touchend', (e) => {
  const dt = Date.now() - textTapStart;
  if (dt < 200 && !swipeStart) {
    // Tap court : toggle play/pause
    togglePlay();
  }
}, { passive: true });

// Mic toggle
const elMicToggle = document.getElementById('mic-toggle');
let micEnabled = true;
if (elMicToggle) elMicToggle.addEventListener('click', () => {
  micEnabled = !micEnabled;
  elMicToggle.classList.toggle('muted', !micEnabled);
  if (camStream) {
    camStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
  }
});

// Boite de texte : drag pour redimensionner
let textBoxResizing = false;
const elTextBox = document.getElementById('prompter-text-box');
const elResizeBtn = document.getElementById('text-resize-btn');
if (elResizeBtn) {
  const onResizeMove = (e) => {
    if (!textBoxResizing) return;
    const y = (e.touches ? e.touches[0].clientY : e.clientY);
    const top = elTextBox.getBoundingClientRect().top;
    const newH = Math.max(120, Math.min(window.innerHeight - 280, y - top));
    elTextBox.style.setProperty('--text-box-h', newH + 'px');
    settings.textBoxH = newH; saveSettings(settings);
  };
  const onResizeStart = (e) => {
    textBoxResizing = true;
    e.preventDefault();
  };
  const onResizeEnd = () => { textBoxResizing = false; };
  elResizeBtn.addEventListener('touchstart', onResizeStart, { passive: false });
  elResizeBtn.addEventListener('mousedown', onResizeStart);
  document.addEventListener('touchmove', onResizeMove, { passive: false });
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('touchend', onResizeEnd);
  document.addEventListener('mouseup', onResizeEnd);
}

// Bouton scroll-toggle : reprendre apres pause manuelle (en swipe sur le texte)
const elScrollToggle = document.getElementById('scroll-toggle-btn');
if (elScrollToggle) elScrollToggle.addEventListener('click', () => {
  pauseUntil = 0;
  document.querySelector('.prompter').classList.remove('scroll-paused');
  if (!promptState.playing && promptState.mode === 'auto') togglePlay();
});

// Opacite texte
const elOpaSlider = $('#opa-slider');
const elOpaVal = $('#opa-val');
elOpaSlider.addEventListener('input', () => {
  settings.textOpa = +elOpaSlider.value;
  elOpaVal.textContent = settings.textOpa;
  document.documentElement.style.setProperty('--text-opa', settings.textOpa / 100);
  saveSettings(settings);
});

// Onglets dans la vue prompter (Lecture / Avancé / Cam)
$$('.ctrl-tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.ctrl-tab').forEach(t => t.classList.toggle('active', t === tab));
  $$('.ctrl-pane').forEach(p => p.hidden = p.dataset.pane !== tab.dataset.pane);
}));

// Sliders avancés (synchronisés avec les Settings)
const elFocusPromSlider = $('#focus-prom-slider');
const elFocusPromVal = $('#focus-prom-val');
const elLookPromSlider = $('#look-prom-slider');
const elLookPromVal = $('#look-prom-val');
const elWidthPromSlider = $('#width-prom-slider');
const elWidthPromVal = $('#width-prom-val');
const elMirrorHBtn = $('#mirror-h-btn');
const elMirrorVBtn = $('#mirror-v-btn');

if (elFocusPromSlider) elFocusPromSlider.addEventListener('input', () => {
  settings.focus = +elFocusPromSlider.value;
  elFocusPromVal.textContent = settings.focus;
  promptState.focus = settings.focus;
  saveSettings(settings);
  layoutFocus();
  applyScroll();
});
if (elLookPromSlider) elLookPromSlider.addEventListener('input', () => {
  settings.lookahead = +elLookPromSlider.value;
  elLookPromVal.textContent = settings.lookahead;
  promptState.lookahead = settings.lookahead;
  saveSettings(settings);
  applyScroll();
});
if (elWidthPromSlider) elWidthPromSlider.addEventListener('input', () => {
  settings.width = +elWidthPromSlider.value;
  elWidthPromVal.textContent = settings.width;
  applySettings();
  saveSettings(settings);
});
if (elMirrorHBtn) elMirrorHBtn.addEventListener('click', () => {
  settings.mirrorH = !settings.mirrorH;
  elMirrorHBtn.classList.toggle('active', settings.mirrorH);
  applySettings(); saveSettings(settings);
});
if (elMirrorVBtn) elMirrorVBtn.addEventListener('click', () => {
  settings.mirrorV = !settings.mirrorV;
  elMirrorVBtn.classList.toggle('active', settings.mirrorV);
  applySettings(); saveSettings(settings);
});

// Cam mirror toggle (vue prompter)
const elCamMirrorBtn = $('#cam-mirror-btn');
if (elCamMirrorBtn) elCamMirrorBtn.addEventListener('click', () => {
  settings.camMirror = !settings.camMirror;
  elCamMirrorBtn.classList.toggle('active', settings.camMirror);
  document.querySelector('.prompter').classList.toggle('cam-mirror', settings.camMirror);
  saveSettings(settings);
});

// Cam zoom (si supporté par le device)
const elZoomSlider = $('#zoom-slider');
const elZoomVal = $('#zoom-val');
if (elZoomSlider) elZoomSlider.addEventListener('input', async () => {
  const z = parseFloat(elZoomSlider.value);
  elZoomVal.textContent = z.toFixed(1);
  if (camStream) {
    const track = camStream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (caps.zoom) {
      try { await track.applyConstraints({ advanced: [{ zoom: Math.min(caps.zoom.max || 5, z) }] }); }
      catch {}
    } else {
      // Fallback CSS scale
      elCamVideo.style.transform = (settings.camMirror ? 'scaleX(-1) ' : '') + `scale(${z})`;
    }
  }
});

// ================= CAMERA =================
const elCamVideo = $('#cam-video');
const elCamToggle = $('#cam-toggle');
let camStream = null;

async function startCam(facing = settings.camFacing) {
  await stopCam();
  try {
    // On demande aussi l'audio pour avoir tout le pipeline pret (et eviter une 2eme demande)
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true
    });
    camStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
    elCamVideo.srcObject = camStream;
    document.querySelector('.prompter').classList.add('has-cam');
    document.querySelector('.prompter').classList.toggle('cam-mirror', settings.camMirror);
    settings.camOn = true; settings.camFacing = facing;
    saveSettings(settings);
    if (elCamToggle) elCamToggle.classList.add('active');
    setupAudioMeter(camStream);
    if (settings.camBlur) startSegmentedBlur();
  } catch (e) {
    toast('Erreur camera : ' + e.message);
  }
}
async function stopCam() {
  stopSegmentedBlur();
  if (audioMeterRaf) cancelAnimationFrame(audioMeterRaf);
  document.documentElement.style.setProperty('--audio-level', '0%');
  if (camStream) {
    camStream.getTracks().forEach(t => t.stop());
    camStream = null;
  }
  elCamVideo.srcObject = null;
  document.querySelector('.prompter').classList.remove('has-cam');
  settings.camOn = false; saveSettings(settings);
  if (elCamToggle) elCamToggle.classList.remove('active');
}

// ================= SEGMENTED BACKGROUND BLUR (MediaPipe) =================
let segmenter = null, segLoopRunning = false;
const elCamCanvas = $('#cam-canvas');
const segCtx = elCamCanvas ? elCamCanvas.getContext('2d') : null;
const segTempCanvas = document.createElement('canvas');
const segTctx = segTempCanvas.getContext('2d');

async function loadMediaPipe() {
  if (window.SelfieSegmentation) return window.SelfieSegmentation;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js';
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(window.SelfieSegmentation);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function startSegmentedBlur() {
  if (!camStream || segLoopRunning) return;
  try {
    const SS = await loadMediaPipe();
    if (!segmenter) {
      segmenter = new SS({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
      segmenter.setOptions({ modelSelection: 1, selfieMode: false });
      segmenter.onResults(onSegResults);
      await segmenter.initialize();
    }
    document.querySelector('.prompter').classList.add('has-blur');
    segLoopRunning = true;
    const tick = async () => {
      if (!segLoopRunning || !segmenter) return;
      if (elCamVideo.readyState >= 2 && elCamVideo.videoWidth) {
        try { await segmenter.send({ image: elCamVideo }); } catch {}
      }
      if (segLoopRunning) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (e) { console.warn('MediaPipe failed', e); }
}

function stopSegmentedBlur() {
  segLoopRunning = false;
  document.querySelector('.prompter').classList.remove('has-blur');
}

function onSegResults(results) {
  if (!segCtx || !results.image) return;
  const w = results.image.width, h = results.image.height;
  if (elCamCanvas.width !== w) elCamCanvas.width = w;
  if (elCamCanvas.height !== h) elCamCanvas.height = h;
  if (segTempCanvas.width !== w) segTempCanvas.width = w;
  if (segTempCanvas.height !== h) segTempCanvas.height = h;
  // Fond flou
  segCtx.save();
  segCtx.filter = `blur(${settings.camBlurAmount || 12}px)`;
  segCtx.drawImage(results.image, 0, 0, w, h);
  segCtx.filter = 'none';
  // Sujet net
  segTctx.save();
  segTctx.clearRect(0, 0, w, h);
  segTctx.drawImage(results.image, 0, 0, w, h);
  segTctx.globalCompositeOperation = 'destination-in';
  segTctx.drawImage(results.segmentationMask, 0, 0, w, h);
  segTctx.restore();
  segCtx.drawImage(segTempCanvas, 0, 0);
  segCtx.restore();
}
const elCamFlip = $('#cam-flip');
if (elCamFlip) elCamFlip.addEventListener('click', () => {
  const newFacing = settings.camFacing === 'user' ? 'environment' : 'user';
  startCam(newFacing);
});

// ================= RECORDER (camera + micro) =================
const elRecStatus = $('#rec-status');
let mediaRecorder = null;
let recChunks = [];
let recStartTs = 0;
let recTimer = null;

async function startRecording() {
  try {
    // Stream combine cam + audio
    const fullStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: settings.camFacing, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true
    });
    if (camStream) camStream.getTracks().forEach(t => t.stop());
    camStream = fullStream;
    elCamVideo.srcObject = fullStream;
    fullStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
    document.querySelector('.prompter').classList.add('has-cam');
    setupAudioMeter(fullStream);

    const mime = pickMime();
    mediaRecorder = new MediaRecorder(fullStream, { mimeType: mime });
    recChunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
    mediaRecorder.onstop = () => finalizeRecording(mime);
    mediaRecorder.start(1000);
    recStartTs = Date.now();
    elRecBtn.classList.add('recording');
    elRecStatus.hidden = false;
    updateRecTimer();
    recTimer = setInterval(updateRecTimer, 250);
    // Auto-play du prompter quand on lance l'enregistrement
    if (!promptState.playing) togglePlay();
  } catch (e) {
    toast('Erreur enregistrement: ' + e.message);
  }
}

// Audio level meter (visualise le micro)
let audioCtx = null, audioAnalyser = null, audioMeterRaf = null;
function setupAudioMeter(stream) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (audioAnalyser) try { audioAnalyser.disconnect(); } catch {}
    const source = audioCtx.createMediaStreamSource(stream);
    audioAnalyser = audioCtx.createAnalyser();
    audioAnalyser.fftSize = 512;
    source.connect(audioAnalyser);
    if (audioMeterRaf) cancelAnimationFrame(audioMeterRaf);
    const buf = new Uint8Array(audioAnalyser.frequencyBinCount);
    const tickMeter = () => {
      audioAnalyser.getByteTimeDomainData(buf);
      let max = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i] - 128);
        if (v > max) max = v;
      }
      const pct = Math.min(100, Math.round((max / 64) * 100));
      document.documentElement.style.setProperty('--audio-level', pct + '%');
      audioMeterRaf = requestAnimationFrame(tickMeter);
    };
    tickMeter();
  } catch {}
}

function stopRecording() {
  if (!mediaRecorder) return;
  try { mediaRecorder.stop(); } catch {}
  mediaRecorder = null;
  clearInterval(recTimer);
  recTimer = null;
  elRecBtn.classList.remove('recording');
  elRecStatus.hidden = true;
  if (promptState.playing) togglePlay();
}

async function finalizeRecording(mime) {
  if (!recChunks.length) return;
  const blob = new Blob(recChunks, { type: mime });
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `novaprompter-${ts}.${ext}`;
  const file = new File([blob], filename, { type: mime });

  // Sur iOS/Android : Web Share API niveau 2 → "Save to Photos" / "Save to Gallery"
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'NovaPrompter' });
      toast('Video prête à sauvegarder');
      recChunks = [];
      return;
    } catch (e) { /* user cancel ou pas supporté, fallback */ }
  }
  // Fallback : download classique
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Video téléchargée : ' + filename);
  recChunks = [];
}

function pickMime() {
  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'video/webm';
}

function updateRecTimer() {
  const sec = Math.floor((Date.now() - recStartTs) / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  elRecStatus.textContent = `● REC ${mm}:${ss}`;
}

// (REC click handler bind plus haut, ligne ~323, avec guard sur elRecBtn)
// (anciennement : tap stage = toggle controls — retiré avec nouveau layout)
// Double-tap pour play/pause
let lastTap = 0;
elStage.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTap < 280) { e.preventDefault(); togglePlay(); }
  lastTap = now;
});

if (elSpeedSlider) elSpeedSlider.addEventListener('input', () => {
  promptState.speed = +elSpeedSlider.value;
  if (elSpeedVal) elSpeedVal.textContent = promptState.speed;
  settings.speed = promptState.speed; saveSettings(settings);
});
if (elSizeSlider) elSizeSlider.addEventListener('input', () => {
  promptState.fontSize = +elSizeSlider.value;
  if (elSizeVal) elSizeVal.textContent = promptState.fontSize;
  applySettings();
  settings.fontSize = promptState.fontSize; saveSettings(settings);
});

// Swipe vertical pour scroll manuel
let swipeStart = null;
elStage.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return;
  swipeStart = { y: e.touches[0].clientY, scrollPx: promptState.scrollPx, progressRatio: promptState.progressRatio, t: Date.now() };
}, { passive: true });
elStage.addEventListener('touchmove', (e) => {
  if (!swipeStart || e.touches.length !== 1) return;
  const dy = swipeStart.y - e.touches[0].clientY;
  if (Math.abs(dy) > 5) {
    if (promptState.mode === 'auto') {
      promptState.scrollPx = Math.max(0, Math.min(maxScroll(), swipeStart.scrollPx + dy));
      if (promptState.playing) {
        // Pause indefiniment jusqu'a ce que l'utilisateur clique scroll-toggle
        pauseUntil = Date.now() + 99999999;
        document.querySelector('.prompter').classList.add('scroll-paused');
      }
      applyScroll();
    } else {
      // Voice mode : modifie progressRatio (= avance dans le script)
      if (!promptState.tokens.length) return;
      const total = promptState.tokens.length;
      const ratio = Math.max(0, Math.min(1, swipeStart.progressRatio + (dy / 200)));
      promptState.progressRatio = ratio;
      voiceIdx = Math.floor(ratio * total);
      phraseAnchor = voiceIdx;
      applyScroll();
    }
  }
}, { passive: true });
elStage.addEventListener('touchend', () => { swipeStart = null; });

let pauseUntil = 0;
let lastTs = performance.now();
function tick(ts) {
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;
  if (promptState.playing && promptState.mode === 'auto' && Date.now() >= pauseUntil) {
    promptState.scrollPx += promptState.speed * dt;
    const max = maxScroll();
    if (promptState.scrollPx > max) { promptState.scrollPx = max; promptState.playing = false; elPlay.textContent = '▶'; elModeStatus.textContent = 'Fin'; }
    applyScroll();
    checkTagPause();
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function maxScroll() {
  const stageH = elStage.clientHeight;
  const focusY = (promptState.focus / 100) * stageH;
  return Math.max(0, elPText.scrollHeight - focusY);
}

function rebuildText() {
  elPText.innerHTML = '';
  promptState.words = [];
  promptState.tokens = [];
  const t = promptState.text || '';
  const tagsByName = new Map(tags.map(t => [t.name, t]));
  // Pattern : (mot) | (whitespace) | ([balise])
  const re = /(\[[a-zA-Z0-9_-]+\])|(\S+)|(\s+)/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    if (m[1]) {
      const name = m[1].slice(1, -1);
      const tag = tagsByName.get(name);
      if (tag) {
        const sp = document.createElement('span');
        sp.className = 'tag';
        sp.textContent = tag.label;
        sp.style.color = tag.color;
        if (tag.bgColor && tag.bgColor !== 'transparent') sp.style.background = tag.bgColor;
        sp.style.fontSize = (tag.size || 1) + 'em';
        sp.dataset.pause = tag.pause || 0;
        elPText.appendChild(sp);
      } else {
        // Pas une balise connue, traite comme mot
        const sp = document.createElement('span');
        sp.className = 'word';
        sp.textContent = m[1];
        elPText.appendChild(sp);
        promptState.words.push(sp);
        promptState.tokens.push(normalize(m[1]));
      }
    } else if (m[2]) {
      const sp = document.createElement('span');
      sp.className = 'word';
      sp.textContent = m[2];
      elPText.appendChild(sp);
      promptState.words.push(sp);
      promptState.tokens.push(normalize(m[2]));
    } else if (m[3]) {
      elPText.appendChild(document.createTextNode(m[3]));
    }
  }
}

function applyScroll() {
  let y;
  const stageH = elStage.clientHeight;
  const focusY = (promptState.focus / 100) * stageH;
  if (promptState.mode === 'voice' && promptState.tokens.length) {
    elPText.style.transition = 'transform .2s linear';
    const total = promptState.tokens.length;
    const ratio = Math.min(1, promptState.progressRatio + (promptState.lookahead || 0) / total);
    const targetY = ratio * elPText.scrollHeight;
    y = focusY - targetY;
    promptState.scrollPx = -y;
    const idx = Math.floor(promptState.progressRatio * total);
    for (let i = 0; i < promptState.words.length; i++) {
      promptState.words[i].classList.toggle('past', i < idx);
      promptState.words[i].classList.toggle('now', i === idx);
    }
  } else {
    elPText.style.transition = 'none';
    y = -promptState.scrollPx;
    for (const w of promptState.words) w.classList.remove('past', 'now');
  }
  elPText.style.setProperty('--scroll', y + 'px');
}

function layoutFocus() {
  const stageH = elStage.clientHeight;
  elFocus.style.top = (promptState.focus / 100) * stageH + 'px';
}
window.addEventListener('resize', layoutFocus);
window.addEventListener('orientationchange', () => setTimeout(layoutFocus, 250));

function checkTagPause() {
  const tagEls = elPText.querySelectorAll('.tag');
  const stageH = elStage.clientHeight;
  const focusY = (promptState.focus / 100) * stageH;
  for (const tagEl of tagEls) {
    if (tagEl.dataset.consumed === '1') continue;
    const pause = parseFloat(tagEl.dataset.pause) || 0;
    if (pause <= 0) continue;
    const tagY = tagEl.offsetTop + tagEl.offsetHeight / 2;
    if (tagY <= promptState.scrollPx + focusY) {
      tagEl.dataset.consumed = '1';
      pauseUntil = Date.now() + pause * 1000;
      return;
    }
  }
}

// ================= VOICE (Web Speech API) =================
let recognition = null;
let voiceIdx = 0, phraseAnchor = 0;

function speechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function startVoice() {
  if (!speechSupported()) {
    toast('Voice non supporté sur ce navigateur. Utilise Chrome/Edge sur Android.');
    // revert UI
    $$('[data-mode]')[0].click();
    return;
  }
  if (recognition) return;
  voiceIdx = 0; phraseAnchor = 0;
  promptState.progressRatio = 0;
  applyScroll();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = new SR();
  r.lang = settings.voiceLang || 'fr-FR';
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;
  r.onstart = () => { elModeStatus.textContent = 'Voice : ecoute'; };
  r.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    elModeStatus.textContent = 'Voice : ' + e.error;
  };
  r.onend = () => { if (recognition) try { r.start(); } catch {} };
  r.onresult = (event) => {
    let interim = '', final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) final += ' ' + res[0].transcript;
      else interim += ' ' + res[0].transcript;
    }
    const heard = (final || interim).trim();
    if (heard) advanceVoice(heard, !!final);
  };
  try { r.start(); recognition = r; } catch (e) { toast('Erreur voice: ' + e.message); }
}

function stopVoice() {
  if (recognition) {
    const r = recognition;
    recognition = null;
    try { r.stop(); } catch {}
  }
}

function advanceVoice(text, isFinal) {
  if (!promptState.tokens.length) return;
  const heard = tokenize(text);
  if (!heard.length) return;
  // Alignement par bloc avec anchor
  const tail = heard.slice(-Math.min(6, heard.length));
  const minStart = Math.max(0, phraseAnchor);
  const maxStart = Math.min(promptState.tokens.length - 1, voiceIdx + 12);

  let bestEnd = -1, bestScore = 0;
  for (let start = minStart; start <= maxStart; start++) {
    let matches = 0, consec = 0, maxConsec = 0, lastP = -2, lastS = -1;
    for (let i = 0; i < tail.length; i++) {
      const sIdx = start + i;
      if (sIdx >= promptState.tokens.length) break;
      if (matchWord(promptState.tokens[sIdx], tail[i])) {
        matches++;
        consec = lastP === i - 1 ? consec + 1 : 1;
        if (consec > maxConsec) maxConsec = consec;
        lastP = i; lastS = sIdx;
      }
    }
    const ratio = matches / tail.length;
    if (ratio < 0.5 || maxConsec < 2) continue;
    const score = ratio + (maxConsec >= 3 ? 0.2 : 0) - Math.abs(start - voiceIdx) * 0.03;
    if (score > bestScore) { bestScore = score; bestEnd = lastS + 1; }
  }
  if (bestEnd > voiceIdx) {
    voiceIdx = Math.min(bestEnd, voiceIdx + tail.length);
    promptState.progressRatio = voiceIdx / promptState.tokens.length;
    if (isFinal) phraseAnchor = voiceIdx;
    applyScroll();
  }
}

function tokenize(s) {
  return normalize(s).split(' ').filter(Boolean);
}
function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function matchWord(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length <= 3 || b.length <= 3) return false;
  if (a.length <= 5 && b.length <= 5) return a.slice(0,4) === b.slice(0,4);
  if (a.slice(0,3) !== b.slice(0,3)) return false;
  return levMax1(a, b);
}
function levMax1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; }
    else {
      edits++;
      if (edits > 1) return false;
      if (a.length === b.length) { i++; j++; }
      else if (a.length > b.length) i++;
      else j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// ================= SETTINGS =================
const settingsModal = $('#settings-modal');

function openSettings() {
  $('#set-theme').value = settings.theme;
  toggleCustomColorRows(settings.theme === 'custom');
  if ($('#set-color-fg')) $('#set-color-fg').value = settings.colorFg;
  if ($('#set-color-bg')) $('#set-color-bg').value = settings.colorBg;
  $('#set-font').value = settings.font;
  $('#set-weight').value = settings.weight;
  $('#weight-val').textContent = settings.weight;
  $('#set-lh').value = settings.lh;
  $('#lh-val').textContent = (settings.lh / 100).toFixed(2);
  if ($('#set-ls')) { $('#set-ls').value = settings.ls; $('#ls-val').textContent = settings.ls; }
  if ($('#set-width')) { $('#set-width').value = settings.width; $('#width-val').textContent = settings.width; }
  $('#set-focus').value = settings.focus;
  $('#focus-val').textContent = settings.focus;
  $('#set-lookahead').value = settings.lookahead;
  $('#lookahead-val').textContent = settings.lookahead;
  $('#set-mirror-h').checked = settings.mirrorH;
  if ($('#set-mirror-v')) $('#set-mirror-v').checked = settings.mirrorV;
  if ($('#set-align-left')) $('#set-align-left').checked = settings.alignLeft;
  $('#set-keep-awake').checked = settings.keepAwake;
  $('#set-voice-lang').value = settings.voiceLang;
  if (elSetCamBlur) elSetCamBlur.checked = !!settings.camBlur;
  if (elSetCamBlurAmount) { elSetCamBlurAmount.value = settings.camBlurAmount || 12; elCamBlurVal.textContent = settings.camBlurAmount || 12; }
  if (elSetCamMirror) elSetCamMirror.checked = settings.camMirror !== false;
  $('#voice-support').textContent = speechSupported() ? '✓ Voice supporté sur ce navigateur' : '✗ Voice non supporté (essaie Chrome Android)';
  renderTagsMobile();
  refreshSyncUI();
  settingsModal.hidden = false;
}

function toggleCustomColorRows(show) {
  const fg = $('#custom-fg-row'); const bg = $('#custom-bg-row');
  if (fg) fg.style.display = show ? '' : 'none';
  if (bg) bg.style.display = show ? '' : 'none';
}
$('#close-settings').addEventListener('click', () => settingsModal.hidden = true);
$('#settings-backdrop').addEventListener('click', () => settingsModal.hidden = true);

function bindSetting(id, key, transform) {
  const el = $('#' + id);
  el.addEventListener('input', () => {
    settings[key] = transform ? transform(el.value) : el.value;
    if (el.type === 'range') {
      const lbl = $('#' + id.replace('set-', '') + '-val');
      if (lbl) lbl.textContent = (key === 'lh' ? (el.value / 100).toFixed(2) : el.value);
    }
    saveSettings(settings);
    applySettings();
  });
  el.addEventListener('change', () => { saveSettings(settings); applySettings(); });
}
bindSetting('set-theme', 'theme');
bindSetting('set-font', 'font');
bindSetting('set-weight', 'weight', v => +v);
bindSetting('set-lh', 'lh', v => +v);
bindSetting('set-ls', 'ls', v => +v);
bindSetting('set-width', 'width', v => +v);
bindSetting('set-focus', 'focus', v => +v);
bindSetting('set-lookahead', 'lookahead', v => +v);
$('#set-theme').addEventListener('change', () => { toggleCustomColorRows($('#set-theme').value === 'custom'); });
const elFg = $('#set-color-fg'), elBg = $('#set-color-bg');
if (elFg) elFg.addEventListener('input', () => { settings.colorFg = elFg.value; settings.theme = 'custom'; $('#set-theme').value = 'custom'; toggleCustomColorRows(true); saveSettings(settings); applySettings(); });
if (elBg) elBg.addEventListener('input', () => { settings.colorBg = elBg.value; settings.theme = 'custom'; $('#set-theme').value = 'custom'; toggleCustomColorRows(true); saveSettings(settings); applySettings(); });
$('#set-mirror-h').addEventListener('change', () => { settings.mirrorH = $('#set-mirror-h').checked; saveSettings(settings); applySettings(); });
const mirV = $('#set-mirror-v'); if (mirV) mirV.addEventListener('change', () => { settings.mirrorV = mirV.checked; saveSettings(settings); applySettings(); });
const alL = $('#set-align-left'); if (alL) alL.addEventListener('change', () => { settings.alignLeft = alL.checked; saveSettings(settings); applySettings(); });
$('#set-keep-awake').addEventListener('change', () => { settings.keepAwake = $('#set-keep-awake').checked; saveSettings(settings); });
$('#set-voice-lang').addEventListener('change', () => { settings.voiceLang = $('#set-voice-lang').value; saveSettings(settings); });

// Cam settings
const elSetCamBlur = $('#set-cam-blur');
const elSetCamBlurAmount = $('#set-cam-blur-amount');
const elCamBlurVal = $('#cam-blur-val');
const elSetCamMirror = $('#set-cam-mirror');
if (elSetCamBlur) elSetCamBlur.addEventListener('change', () => {
  settings.camBlur = elSetCamBlur.checked; saveSettings(settings);
  if (settings.camBlur && camStream) startSegmentedBlur();
  else stopSegmentedBlur();
});
if (elSetCamBlurAmount) elSetCamBlurAmount.addEventListener('input', () => {
  settings.camBlurAmount = +elSetCamBlurAmount.value;
  elCamBlurVal.textContent = settings.camBlurAmount;
  saveSettings(settings);
});
if (elSetCamMirror) elSetCamMirror.addEventListener('change', () => {
  settings.camMirror = elSetCamMirror.checked; saveSettings(settings);
  document.querySelector('.prompter').classList.toggle('cam-mirror', settings.camMirror);
});

// ================= TAGS EDITOR (mobile) =================
const elTagsListMobile = document.createElement('div');
function renderTagsMobile() {
  const cont = $('#tags-list-mobile');
  if (!cont) return;
  cont.innerHTML = '';
  for (const tag of tags) {
    const row = document.createElement('div');
    row.className = 'tag-row-m';
    row.style.cssText = 'background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px';
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="display:inline-block;padding:4px 10px;border-radius:6px;font-weight:700;color:${tag.color};background:${tag.bgColor || 'transparent'}">${escapeHtml(tag.label)}</span>
        <span style="color:var(--muted);font-size:12px;font-family:monospace;flex:1">[${escapeHtml(tag.name)}]</span>
        <button class="icon-btn danger" data-act="del">×</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px">
        <label>Nom <input data-f="name" type="text" value="${escapeAttr(tag.name)}" style="width:100%;padding:5px 7px;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:4px"/></label>
        <label>Affichage <input data-f="label" type="text" value="${escapeAttr(tag.label)}" style="width:100%;padding:5px 7px;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:4px"/></label>
        <label>Texte <input data-f="color" type="color" value="${escapeAttr(tag.color)}" style="width:100%;height:32px"/></label>
        <label>Fond <input data-f="bgColor" type="text" value="${escapeAttr(tag.bgColor || 'transparent')}" style="width:100%;padding:5px 7px;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:4px"/></label>
        <label>Taille <input data-f="size" type="number" min="0.5" max="3" step="0.1" value="${tag.size}" style="width:100%;padding:5px 7px;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:4px"/></label>
        <label>Pause <input data-f="pause" type="number" min="0" max="10" step="0.5" value="${tag.pause}" style="width:100%;padding:5px 7px;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:4px"/></label>
      </div>
    `;
    cont.appendChild(row);
    row.querySelector('[data-act=del]').addEventListener('click', () => {
      if (!confirm('Supprimer la balise [' + tag.name + '] ?')) return;
      tags = tags.filter(t => t !== tag);
      localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
      renderTagsMobile();
    });
    row.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', () => {
        const f = inp.dataset.f;
        let v = inp.value;
        if (f === 'size' || f === 'pause') v = parseFloat(v) || 0;
        if (f === 'name') v = (v || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '').slice(0, 24) || 'tag';
        tag[f] = v;
        localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
      });
    });
  }
}
$('#add-tag').addEventListener('click', () => {
  tags.unshift({ name: 'tag' + (tags.length + 1), label: 'TAG', color: '#ff5b3a', bgColor: 'transparent', size: 1.0, pause: 0 });
  localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
  renderTagsMobile();
});
$('#reset-tags').addEventListener('click', () => {
  if (!confirm('Restaurer les balises par defaut ?')) return;
  tags = [...DEFAULT_TAGS];
  localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
  renderTagsMobile();
});

function escapeAttr(s) { return (s || '').replace(/"/g, '&quot;'); }

// ================= SYNC (Railway backend) =================
function refreshSyncUI() {
  $('#sync-server').value = settings.syncServer;
  if (settings.syncToken) {
    $('#sync-status').textContent = 'Connecte (' + (settings.syncEmail || '') + ')';
    $('#sync-logged-in').hidden = false;
    $('#sync-logged-out').hidden = true;
  } else {
    $('#sync-status').textContent = 'Hors ligne';
    $('#sync-logged-in').hidden = true;
    $('#sync-logged-out').hidden = false;
  }
}
$('#sync-server').addEventListener('change', () => { settings.syncServer = $('#sync-server').value.replace(/\/+$/, ''); saveSettings(settings); });

async function apiCall(path, opts = {}) {
  const url = (settings.syncServer || '').replace(/\/+$/, '') + path;
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (settings.syncToken) headers['Authorization'] = 'Bearer ' + settings.syncToken;
  const r = await fetch(url, Object.assign({ headers }, opts));
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 200));
  }
  return r.json();
}

$('#sync-register').addEventListener('click', async () => {
  const email = $('#sync-email').value.trim();
  const password = $('#sync-password').value;
  if (!email || !password) return toast('Email + mot de passe requis');
  try {
    const r = await apiCall('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
    settings.syncToken = r.token; settings.syncEmail = email;
    saveSettings(settings); refreshSyncUI();
    toast('Compte cree');
    await syncNow();
  } catch (e) { toast('Echec : ' + e.message); }
});
$('#sync-login').addEventListener('click', async () => {
  const email = $('#sync-email').value.trim();
  const password = $('#sync-password').value;
  if (!email || !password) return toast('Email + mot de passe requis');
  try {
    const r = await apiCall('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    settings.syncToken = r.token; settings.syncEmail = email;
    saveSettings(settings); refreshSyncUI();
    toast('Connecte');
    await syncNow();
  } catch (e) { toast('Echec : ' + e.message); }
});
$('#sync-logout').addEventListener('click', () => {
  settings.syncToken = ''; settings.syncEmail = '';
  saveSettings(settings); refreshSyncUI();
  toast('Deconnecte');
});
$('#sync-now').addEventListener('click', () => syncNow());

async function syncNow() {
  if (!settings.syncToken) return toast('Connecte-toi d\'abord');
  try {
    $('#sync-status').textContent = 'Sync en cours…';
    // Push : envoie tous les scripts locaux
    const r = await apiCall('/sync', {
      method: 'POST',
      body: JSON.stringify({ scripts, tags, settings: { font: settings.font, theme: settings.theme } })
    });
    if (Array.isArray(r.scripts)) {
      // Merge : on garde le plus recent par id
      const localById = new Map(scripts.map(s => [s.id, s]));
      for (const remote of r.scripts) {
        const local = localById.get(remote.id);
        if (!local || remote.updatedAt > local.updatedAt) localById.set(remote.id, remote);
      }
      scripts = [...localById.values()];
      saveScripts(scripts);
      renderList();
    }
    if (Array.isArray(r.tags) && r.tags.length) { tags = r.tags; localStorage.setItem(TAGS_KEY, JSON.stringify(tags)); }
    $('#sync-status').textContent = 'Sync OK · ' + new Date().toLocaleTimeString();
    toast('Sync OK : ' + scripts.length + ' scripts');
  } catch (e) {
    $('#sync-status').textContent = 'Erreur sync';
    toast('Sync echoue : ' + e.message);
  }
}
// Auto-sync au demarrage si connecte
if (settings.syncToken) setTimeout(() => syncNow().catch(() => {}), 1500);

function applySettings() {
  document.body.dataset.theme = settings.theme;
  document.body.classList.toggle('mirror-h', !!settings.mirrorH);
  document.body.classList.toggle('mirror-v', !!settings.mirrorV);
  // Couleurs custom
  if (settings.theme === 'custom') {
    document.documentElement.style.setProperty('--text', settings.colorFg);
    document.documentElement.style.setProperty('--bg', settings.colorBg);
  } else {
    document.documentElement.style.removeProperty('--text');
    document.documentElement.style.removeProperty('--bg');
  }
  elPText.style.fontFamily = settings.font;
  elPText.style.fontWeight = settings.weight;
  elPText.style.lineHeight = (settings.lh / 100);
  elPText.style.letterSpacing = (settings.ls || 0) + 'px';
  elPText.style.fontSize = (promptState.fontSize || 42) + 'px';
  elPText.style.maxWidth = (settings.width || 90) + '%';
  elPText.style.marginLeft = 'auto'; elPText.style.marginRight = 'auto';
  elPText.style.textAlign = settings.alignLeft ? 'left' : 'center';
  promptState.focus = settings.focus;
  promptState.lookahead = settings.lookahead;
  if ($('#view-prompter').classList.contains('active')) layoutFocus();
}
applySettings();

// ================= EXPORT / IMPORT =================
$('#export-data').addEventListener('click', () => {
  const data = { scripts, settings, tags, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `novaprompter-backup-${Date.now()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  toast('Export OK');
});
$('#import-data').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', () => {
  const f = $('#import-file').files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (Array.isArray(d.scripts)) { scripts = d.scripts; saveScripts(scripts); }
      if (d.settings) { settings = Object.assign(settings, d.settings); saveSettings(settings); applySettings(); }
      if (Array.isArray(d.tags)) { tags = d.tags; localStorage.setItem(TAGS_KEY, JSON.stringify(tags)); }
      renderList();
      toast('Import OK : ' + scripts.length + ' scripts');
    } catch (e) { toast('Erreur import: ' + e.message); }
  };
  reader.readAsText(f);
});
$('#reset-data').addEventListener('click', () => {
  if (!confirm('Tout effacer ? Cette action est irréversible.')) return;
  if (!confirm('Vraiment tout ?')) return;
  localStorage.clear();
  scripts = []; settings = loadSettings(); tags = DEFAULT_TAGS;
  renderList();
  toast('Tout effacé');
  settingsModal.hidden = true;
});

// ================= WAKE LOCK =================
let wakeLock = null;
async function startWakeLock() {
  if (!settings.keepAwake) return;
  if (!('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); }
  catch (e) { /* user can deny */ }
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && $('#view-prompter').classList.contains('active')) startWakeLock();
});

// ================= UTILS =================
const elToast = $('#toast');
let toastTimer;
function toast(msg) {
  elToast.textContent = msg;
  elToast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { elToast.hidden = true; }, 2200);
}
function escapeHtml(s) { return (s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ================= INIT =================
renderList();

// Service worker (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// Persistance reglages au unload
window.addEventListener('beforeunload', () => { saveSettings(settings); saveScripts(scripts); });
window.addEventListener('pagehide', () => { saveSettings(settings); saveScripts(scripts); });
