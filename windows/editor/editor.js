import { loadAll, saveAll, newScript, upsert, remove } from './storage.js';
import { VoskTracker, tokenize } from './voice_vosk.js';
import { Recorder } from './recorder.js';
import { OBSClient } from './obs.js';
import { loadTags, saveTags, newTag, sanitizeName, DEFAULT_TAGS } from './tags.js';

const $ = (s) => document.querySelector(s);

// State
let scripts = loadAll();
let currentId = scripts[0]?.id || null;
let mode = 'auto';            // 'auto' | 'voice'
let playing = false;
let speed = 60;               // px/s
let fontSize = 42;
let lineWidth = 90;
let focusOffset = 35;
let mirrorH = false;
let mirrorV = false;
let opacity = 1;
let alwaysTop = true;
let ignoreMouse = false;
let scrollPx = 0;
let progressRatio = 0;        // pour le mode voice
let lookahead = 4;            // mots d'avance que la focus line pointe en voice
let camDeviceId = '';
let camOverlay = false;
let camBlur = false;
let camBlurAmount = 8;
let micDeviceId = '';
// Apparence
let theme = 'dark';
let colorFg = '#ffffff';
let colorBg = '#000000';
let fontFamily = "'Lexend', sans-serif"; // recommandee teleprompteur par defaut
let fontWeight = 500;                    // Lexend lit mieux en weight moyen
let lineHeight = 1.6;                    // un peu plus aere pour fluidite
let letterSpacing = 0;
let alignLeft = false;
let tags = loadTags();

// UI refs
const els = {
  list: $('#script-list'),
  title: $('#title'),
  editor: $('#editor'),
  newBtn: $('#btn-new'),
  renameBtn: $('#btn-rename'),
  deleteBtn: $('#btn-delete'),
  prompterBtn: $('#btn-prompter'),
  fullscreenBtn: $('#btn-fullscreen-prompter'),
  cleanBtn: $('#btn-clean'),
  saveBtn: $('#btn-save'),
  playBtn: $('#btn-play'),
  resetBtn: $('#btn-reset'),
  speed: $('#speed'), speedVal: $('#speed-val'),
  font: $('#font'), fontVal: $('#font-val'),
  lineWidth: $('#line-width'), widthVal: $('#width-val'),
  focus: $('#focus'), focusVal: $('#focus-val'),
  lookahead: $('#lookahead'), lookaheadVal: $('#lookahead-val'),
  mirrorH: $('#mirror-h'), mirrorV: $('#mirror-v'),
  alwaysTop: $('#always-top'),
  ignoreMouse: $('#ignore-mouse'),
  opacity: $('#opacity'), opVal: $('#op-val'),
  theme: $('#theme'),
  customColorsGroup: $('#custom-colors-group'),
  colorFg: $('#color-fg'),
  colorBg: $('#color-bg'),
  fontFamily: $('#font-family'),
  fontWeight: $('#font-weight'), weightVal: $('#weight-val'),
  lineHeight: $('#line-height'), lhVal: $('#lh-val'),
  letterSpacing: $('#letter-spacing'), lsVal: $('#ls-val'),
  alignLeft: $('#text-align-left'),
  segBtns: document.querySelectorAll('.seg-btn'),
  voiceLang: $('#voice-lang'),
  voiceTest: $('#btn-voice-test'),
  voskRetry: $('#btn-vosk-retry'),
  voskState: $('#vosk-state'),
  voiceStatus: $('#voice-status'),
  voiceTranscript: $('#voice-transcript'),
  recSource: $('#rec-source'),
  recBtn: $('#btn-rec'),
  recStatus: $('#rec-status'),
  camPreview: $('#cam-preview'),
  camDevice: $('#cam-device'),
  camRefresh: $('#btn-cam-refresh'),
  camOverlay: $('#cam-overlay'),
  camBlur: $('#cam-blur'),
  camBlurAmount: $('#cam-blur-amount'),
  blurVal: $('#blur-val'),
  micDevice: $('#mic-device'),
  micRefresh: $('#btn-mic-refresh'),
  obsHost: $('#obs-host'),
  obsPass: $('#obs-pass'),
  obsConnect: $('#btn-obs-connect'),
  obsStatus: $('#obs-status'),
  obsScene: $('#obs-scene'),
  obsSceneBtn: $('#btn-obs-scene'),
  obsRecord: $('#btn-obs-record'),
  obsGo: $('#btn-obs-go')
};

// ---------- SCRIPTS ----------
function renderList() {
  els.list.innerHTML = '';
  for (const s of scripts) {
    const li = document.createElement('li');
    li.dataset.id = s.id;
    if (s.id === currentId) li.classList.add('active');
    li.innerHTML = `<span class="title">${escapeHtml(s.title || 'Sans titre')}</span><span class="meta">${formatDate(s.updatedAt)}</span>`;
    li.addEventListener('click', () => selectScript(s.id));
    li.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      selectScript(s.id);
      // double-clic sur un script de la liste = renomme inline
      els.title.focus();
      els.title.select();
    });
    els.list.appendChild(li);
  }
}

function ensureCurrent() {
  if (!currentId || !scripts.find(s => s.id === currentId)) {
    if (!scripts.length) {
      const s = newScript('Mon premier script', '');
      scripts = upsert(scripts, s);
    }
    currentId = scripts[0].id;
  }
}

function getCurrent() { return scripts.find(s => s.id === currentId); }

function selectScript(id) {
  saveCurrent();
  currentId = id;
  const s = getCurrent();
  els.title.value = s.title || '';
  els.editor.value = s.content || '';
  renderList();
  syncToPrompter();
}

function saveCurrent() {
  const s = getCurrent();
  if (!s) return;
  s.title = els.title.value;
  s.content = els.editor.value;
  scripts = upsert(scripts, s);
}

function escapeHtml(s) { return (s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

ensureCurrent();
renderList();
const cur = getCurrent();
els.title.value = cur.title;
els.editor.value = cur.content;

els.newBtn.addEventListener('click', () => {
  saveCurrent();
  const s = newScript('Nouveau script', '');
  scripts = upsert(scripts, s);
  currentId = s.id;
  els.title.value = s.title;
  els.editor.value = '';
  renderList();
  syncToPrompter();
});
// Renommer = focus le champ titre du haut (prompt() ne marche pas dans Electron)
els.renameBtn.addEventListener('click', () => {
  els.title.focus();
  els.title.select();
});
els.deleteBtn.addEventListener('click', () => {
  if (!window.confirm('Supprimer ce script ?')) return;
  scripts = remove(scripts, currentId);
  currentId = scripts[0]?.id || null;
  ensureCurrent();
  const s = getCurrent();
  els.title.value = s.title;
  els.editor.value = s.content;
  renderList();
  syncToPrompter();
});

let saveTimer = null;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveCurrent(); renderList(); }, 400);
}
els.title.addEventListener('input', () => { autosave(); });
els.editor.addEventListener('input', () => { autosave(); syncToPrompter(); voice.setScript(els.editor.value); });

// ---------- SYNC PROMPTER ----------
// Debounce pour saveSettings (defini ci-dessous)
let _settingsTimer = null;
function scheduleSave() {
  clearTimeout(_settingsTimer);
  _settingsTimer = setTimeout(() => {
    try { saveSettings(); } catch (e) { console.warn('saveSettings', e); }
  }, 200);
}

function syncToPrompter() {
  window.nova.send({
    type: 'state',
    text: els.editor.value,
    mode, playing, speed, fontSize, lineWidth, focusOffset,
    mirrorH, mirrorV, scrollPx, progressRatio,
    camDeviceId, camOverlay, camBlur, camBlurAmount, lookahead,
    theme, colorFg, colorBg, fontFamily, fontWeight, lineHeight, letterSpacing, alignLeft,
    tags
  });
  scheduleSave();
}

window.nova.onSync((p) => {
  if (!p) return;
  if (p.type === 'prompter:scrollPx') { scrollPx = p.value; }
  else if (p.type === 'prompter:voiceIndex') {
    // Scroll manuel en mode voice : on aligne l'index du tracker
    voice.setIndex(p.idx);
    progressRatio = p.total ? p.idx / p.total : 0;
    // pas de syncToPrompter ici (le prompter est deja a jour, eviter une boucle)
  }
  else if (p.type === 'prompter:cmd') {
    if (p.cmd === 'play') togglePlay();
    else if (p.cmd === 'reset') { scrollPx = 0; progressRatio = 0; voice.setIndex(0); syncToPrompter(); }
    else if (p.cmd === 'speed-up') { speed = Math.min(300, speed + 10); els.speed.value = speed; els.speedVal.textContent = speed; syncToPrompter(); }
    else if (p.cmd === 'speed-down') { speed = Math.max(10, speed - 10); els.speed.value = speed; els.speedVal.textContent = speed; syncToPrompter(); }
    else if (p.cmd === 'font-up') { fontSize = Math.min(120, fontSize + 4); els.font.value = fontSize; els.fontVal.textContent = fontSize; syncToPrompter(); }
    else if (p.cmd === 'font-down') { fontSize = Math.max(18, fontSize - 4); els.font.value = fontSize; els.fontVal.textContent = fontSize; syncToPrompter(); }
  }
});

// ---------- MODAL REGLAGES ----------
const elModal = document.getElementById('settings-modal');
const elModalBackdrop = document.getElementById('modal-backdrop');
const elModalClose = document.getElementById('modal-close');
const elBtnSettings = document.getElementById('btn-settings');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

function openSettings() { elModal.hidden = false; }
function closeSettings() { elModal.hidden = true; }

if (elBtnSettings) elBtnSettings.addEventListener('click', openSettings);
if (elModalClose) elModalClose.addEventListener('click', closeSettings);
if (elModalBackdrop) elModalBackdrop.addEventListener('click', closeSettings);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !elModal.hidden) closeSettings();
});

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.toggle('active', b === btn));
    const tab = btn.dataset.tab;
    tabPanes.forEach(p => p.hidden = p.dataset.tab !== tab);
  });
});

// ---------- STATUS MINI sous scripteur ----------
const elVoskMini = document.getElementById('vosk-state-mini');
const elVoiceStatusMini = document.getElementById('voice-status-mini');

// Bouton Nettoyer : enleve titres markdown, timecodes, blockquotes, gras/italique
els.cleanBtn.addEventListener('click', () => {
  const before = els.editor.value;
  const after = cleanScript(before);
  if (after === before) {
    flashStatus(els.cleanBtn, 'Deja propre');
    return;
  }
  els.editor.value = after;
  autosave();
  syncToPrompter();
  voice.setScript(after);
  flashStatus(els.cleanBtn, '-' + (before.length - after.length) + ' chars');
});

function flashStatus(btn, msg) {
  const prev = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = prev; }, 1400);
}

function cleanScript(text) {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let raw of lines) {
    const trimmed = raw.trim();

    // Ligne vide : on garde (separateur de paragraphes)
    if (!trimmed) { out.push(''); continue; }

    // Heading markdown (## , ### , ## **...**)
    if (/^#{1,6}\s/.test(trimmed)) continue;

    // Ligne uniquement en gras (titre/section) : **...** seul
    if (/^\*\*[^*\n]+\*\*\s*$/.test(trimmed)) continue;

    // Ligne uniquement timecode [0:00 - 0:12], avec ou sans label apres
    if (/^\[\s*\d+\s*[:.]?\s*\d*\s*[-–—]\s*\d+\s*[:.]?\s*\d*\s*\][^a-zA-Z]*[A-ZÀ-Ý ÉÈÊÀÂ\-—\/]*\s*$/.test(trimmed)) continue;

    // Ligne juste un > (blockquote vide)
    if (/^>\s*$/.test(trimmed)) continue;

    // Ligne separateur ---, ===, ***
    if (/^[-=*_]{3,}\s*$/.test(trimmed)) continue;

    // Cleanup de la ligne
    let cleaned = raw
      .replace(/^\s*>\s?/, '')              // blockquote marker
      .replace(/\*\*([^*]+)\*\*/g, '$1')    // **bold**
      .replace(/\*([^*\s][^*]*?)\*/g, '$1') // *italic*
      .replace(/`([^`]+)`/g, '$1')          // `code`
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // images
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // [link](url) → link

    if (!cleaned.trim()) continue;
    out.push(cleaned);
  }

  // Compresse les sauts de ligne consecutifs (>2) a 2 (1 paragraphe vide max)
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

els.prompterBtn.addEventListener('click', async () => {
  await window.nova.openPrompter();
  await window.nova.setAlwaysOnTop(alwaysTop);
  await window.nova.setOpacity(opacity);
  await window.nova.setIgnoreMouse(ignoreMouse);
  setTimeout(syncToPrompter, 250);
});
els.fullscreenBtn.addEventListener('click', () => {
  window.nova.send({ type: 'cmd:fullscreen' });
});

// ---------- CONTROLS ----------
els.segBtns.forEach(b => b.addEventListener('click', () => {
  els.segBtns.forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  mode = b.dataset.mode;
  if (mode === 'voice') {
    // Auto-deplace la focus line en bas pour qu'on lise ce qui arrive au-dessus
    if (focusOffset < 60) {
      focusOffset = 70;
      els.focus.value = 70; els.focusVal.textContent = 70;
    }
    voice.setScript(els.editor.value);
    voice.setIndex(0);
    voice.start();
  } else {
    voice.stop();
  }
  syncToPrompter();
}));

els.playBtn.addEventListener('click', togglePlay);
els.resetBtn.addEventListener('click', () => {
  scrollPx = 0; progressRatio = 0; voice.setIndex(0);
  syncToPrompter();
});

function togglePlay() {
  playing = !playing;
  els.playBtn.innerHTML = playing ? '&#10074;&#10074; Pause' : '&#9654; Play';
  syncToPrompter();
}

bindRange(els.speed, els.speedVal, (v) => { speed = +v; syncToPrompter(); });
bindRange(els.font, els.fontVal, (v) => { fontSize = +v; syncToPrompter(); });
bindRange(els.lineWidth, els.widthVal, (v) => { lineWidth = +v; syncToPrompter(); });
bindRange(els.focus, els.focusVal, (v) => { focusOffset = +v; syncToPrompter(); });
bindRange(els.lookahead, els.lookaheadVal, (v) => { lookahead = +v; syncToPrompter(); });
bindRange(els.opacity, els.opVal, async (v) => { opacity = (+v) / 100; await window.nova.setOpacity(opacity); });

function bindRange(input, label, onChange) {
  input.addEventListener('input', () => { label.textContent = input.value; onChange(input.value); });
}

els.mirrorH.addEventListener('change', () => { mirrorH = els.mirrorH.checked; syncToPrompter(); });
els.mirrorV.addEventListener('change', () => { mirrorV = els.mirrorV.checked; syncToPrompter(); });
els.alwaysTop.addEventListener('change', async () => {
  alwaysTop = els.alwaysTop.checked;
  await window.nova.setAlwaysOnTop(alwaysTop);
});
els.ignoreMouse.addEventListener('change', async () => {
  ignoreMouse = els.ignoreMouse.checked;
  await window.nova.setIgnoreMouse(ignoreMouse);
});

// ---------- APPARENCE ----------
const THEME_PRESETS = {
  dark:   { fg: '#ffffff', bg: '#000000' },
  light:  { fg: '#111111', bg: '#ffffff' },
  sepia:  { fg: '#3a2e21', bg: '#f5e8c7' },
  yellow: { fg: '#ffd400', bg: '#000000' },
  green:  { fg: '#7CFFB2', bg: '#0a0f0c' }
};
function applyThemePreset(name) {
  if (name === 'custom') {
    els.customColorsGroup.style.display = '';
    return;
  }
  els.customColorsGroup.style.display = 'none';
  const p = THEME_PRESETS[name] || THEME_PRESETS.dark;
  colorFg = p.fg; colorBg = p.bg;
  els.colorFg.value = p.fg; els.colorBg.value = p.bg;
}
els.theme.addEventListener('change', () => {
  theme = els.theme.value;
  applyThemePreset(theme);
  syncToPrompter();
});
els.colorFg.addEventListener('input', () => { colorFg = els.colorFg.value; theme = 'custom'; els.theme.value = 'custom'; els.customColorsGroup.style.display = ''; syncToPrompter(); });
els.colorBg.addEventListener('input', () => { colorBg = els.colorBg.value; theme = 'custom'; els.theme.value = 'custom'; els.customColorsGroup.style.display = ''; syncToPrompter(); });
els.fontFamily.addEventListener('change', () => { fontFamily = els.fontFamily.value; syncToPrompter(); });
bindRange(els.fontWeight, els.weightVal, (v) => { fontWeight = +v; syncToPrompter(); });
bindRange(els.lineHeight, els.lhVal, (v) => { lineHeight = (+v) / 100; els.lhVal.textContent = lineHeight.toFixed(2); syncToPrompter(); });
bindRange(els.letterSpacing, els.lsVal, (v) => { letterSpacing = +v; syncToPrompter(); });
els.alignLeft.addEventListener('change', () => { alignLeft = els.alignLeft.checked; syncToPrompter(); });

// Raccourcis globaux dans l'editeur (pas dans la textarea)
// Compatible avec les remotes Bluetooth qui emulent: Space, MediaPlayPause,
// PageUp/PageDown, VolumeUp/VolumeDown, ArrowUp/Down.
window.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'textarea' || tag === 'input' || tag === 'select') return;
  handleRemoteKey(e);
});

function handleRemoteKey(e) {
  const k = e.key;
  const code = e.code;
  if (code === 'Space' || k === 'MediaPlayPause' || k === 'AudioPlay') { e.preventDefault(); togglePlay(); }
  else if (k === 'r' || k === 'R') { scrollPx = 0; progressRatio = 0; voice.setIndex(0); syncToPrompter(); }
  else if (k === 'ArrowUp' || k === 'PageUp' || k === 'AudioVolumeUp' || k === 'MediaTrackNext') {
    e.preventDefault(); speed = Math.min(300, speed + 10); els.speed.value = speed; els.speedVal.textContent = speed; syncToPrompter();
  }
  else if (k === 'ArrowDown' || k === 'PageDown' || k === 'AudioVolumeDown' || k === 'MediaTrackPrevious') {
    e.preventDefault(); speed = Math.max(10, speed - 10); els.speed.value = speed; els.speedVal.textContent = speed; syncToPrompter();
  }
  else if (k === '+' || k === '=') { fontSize = Math.min(120, fontSize + 4); els.font.value = fontSize; els.fontVal.textContent = fontSize; syncToPrompter(); }
  else if (k === '-' || k === '_') { fontSize = Math.max(18, fontSize - 4); els.font.value = fontSize; els.fontVal.textContent = fontSize; syncToPrompter(); }
}

// ---------- VOICE (Vosk) ----------
const voice = new VoskTracker({
  onStatus: (msg, level) => {
    els.voiceStatus.textContent = msg;
    els.voiceStatus.className = 'status ' + (level || '');
    if (elVoiceStatusMini) {
      elVoiceStatusMini.textContent = 'Voice : ' + msg;
      elVoiceStatusMini.className = 'status status-mini ' + (level || '');
    }
  },
  onTranscript: (t) => { els.voiceTranscript.textContent = t.slice(-200); },
  onProgress: (ratio, idx, total) => {
    progressRatio = ratio;
    syncToPrompter();
  }
});
voice.setScript(els.editor.value);
els.voiceLang.addEventListener('change', () => {
  // Vosk utilise le modele FR cote serveur. Le selecteur lang est informatif.
});
els.voiceTest.addEventListener('click', () => {
  if (voice.running) voice.stop();
  else { voice.setScript(els.editor.value); voice.setIndex(0); voice.start(); }
});
els.voskRetry.addEventListener('click', () => window.nova.voskRetry());

// Indicateur d'etat du serveur Vosk (auto-spawn par le main process)
const voskLabels = {
  idle:        { msg: 'Vosk : initialisation…',     cls: '' },
  setup:       { msg: 'Vosk : setup Python…',       cls: 'warn' },
  downloading: { msg: 'Vosk : telechargement modele FR…', cls: 'warn' },
  starting:    { msg: 'Vosk : demarrage…',          cls: 'warn' },
  ready:       { msg: 'Vosk : pret',                cls: 'ok' },
  error:       { msg: 'Vosk : erreur',              cls: 'err' }
};
function setVoskUi(state, msg) {
  const def = voskLabels[state] || voskLabels.idle;
  if (els.voskState) {
    els.voskState.className = 'status ' + def.cls;
    els.voskState.textContent = msg ? def.msg.replace(/…|: .*/, '') + ' — ' + msg : def.msg;
  }
  if (elVoskMini) {
    elVoskMini.className = 'status status-mini ' + def.cls;
    elVoskMini.textContent = msg ? def.msg.replace(/…|: .*/, '') + ' — ' + msg : def.msg;
  }
}
window.nova.onVoskState(({ state, msg }) => setVoskUi(state, msg));
window.nova.voskStatus().then(s => setVoskUi(s));

// ---------- RECORDER ----------
const recorder = new Recorder({
  onStatus: (msg, level) => { els.recStatus.textContent = msg; els.recStatus.className = 'status ' + (level || ''); },
  onPreview: (stream, kind) => {
    if (kind === 'video' && stream) { els.camPreview.srcObject = stream; }
    else if (!stream) { els.camPreview.srcObject = null; }
  }
});
els.recBtn.addEventListener('click', async () => {
  if (!recorder.recorder) {
    await recorder.start(els.recSource.value, { videoDeviceId: camDeviceId, audioDeviceId: micDeviceId });
    if (recorder.recorder) els.recBtn.innerHTML = '&#9632; Stop';
  } else {
    recorder.stop();
    els.recBtn.innerHTML = '&#9679; Rec';
  }
});

// ---------- OBS ----------
const obs = new OBSClient({
  onStatus: (msg, level) => { els.obsStatus.textContent = msg; els.obsStatus.className = 'status ' + (level || ''); }
});
els.obsConnect.addEventListener('click', async () => {
  try {
    await obs.connect(els.obsHost.value, els.obsPass.value);
    const scenes = await obs.listScenes();
    els.obsScene.innerHTML = '';
    for (const s of scenes) {
      const o = document.createElement('option'); o.value = s; o.textContent = s; els.obsScene.appendChild(o);
    }
  } catch {}
});
els.obsSceneBtn.addEventListener('click', async () => {
  if (els.obsScene.value) await obs.setScene(els.obsScene.value);
});
els.obsRecord.addEventListener('click', () => obs.toggleRecord());
els.obsGo.addEventListener('click', async () => {
  try {
    if (els.obsScene.value) await obs.setScene(els.obsScene.value);
    await obs.startRecord();
  } catch {}
  if (!playing) togglePlay();
});

// ---------- CAMERA ----------
async function refreshCameras() {
  try {
    // permission preflight pour avoir les labels
    try { const tmp = await navigator.mediaDevices.getUserMedia({ video: true }); tmp.getTracks().forEach(t => t.stop()); } catch {}
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    els.camDevice.innerHTML = '';
    if (!cams.length) {
      const o = document.createElement('option'); o.value = ''; o.textContent = 'Aucune camera detectee'; els.camDevice.appendChild(o);
      return;
    }
    for (const c of cams) {
      const o = document.createElement('option');
      o.value = c.deviceId;
      o.textContent = c.label || ('Camera ' + (cams.indexOf(c) + 1));
      els.camDevice.appendChild(o);
    }
    if (camDeviceId && cams.find(c => c.deviceId === camDeviceId)) {
      els.camDevice.value = camDeviceId;
    } else {
      camDeviceId = cams[0].deviceId;
      els.camDevice.value = camDeviceId;
    }
    syncToPrompter();
  } catch (e) {
    console.warn('enumerateDevices failed', e);
  }
}
els.camRefresh.addEventListener('click', refreshCameras);
els.camDevice.addEventListener('change', () => { camDeviceId = els.camDevice.value; syncToPrompter(); });
els.camOverlay.addEventListener('change', () => { camOverlay = els.camOverlay.checked; syncToPrompter(); });
els.camBlur.addEventListener('change', () => { camBlur = els.camBlur.checked; syncToPrompter(); });
bindRange(els.camBlurAmount, els.blurVal, (v) => { camBlurAmount = +v; syncToPrompter(); });
refreshCameras();

async function refreshMics() {
  try {
    try { const tmp = await navigator.mediaDevices.getUserMedia({ audio: true }); tmp.getTracks().forEach(t => t.stop()); } catch {}
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === 'audioinput');
    els.micDevice.innerHTML = '';
    if (!mics.length) {
      const o = document.createElement('option'); o.value = ''; o.textContent = 'Aucun micro detecte'; els.micDevice.appendChild(o);
      return;
    }
    for (const m of mics) {
      const o = document.createElement('option');
      o.value = m.deviceId;
      o.textContent = m.label || ('Micro ' + (mics.indexOf(m) + 1));
      els.micDevice.appendChild(o);
    }
    if (micDeviceId && mics.find(m => m.deviceId === micDeviceId)) {
      els.micDevice.value = micDeviceId;
    } else {
      micDeviceId = mics[0].deviceId;
      els.micDevice.value = micDeviceId;
    }
  } catch (e) { console.warn('mic enum failed', e); }
}
els.micRefresh.addEventListener('click', refreshMics);
els.micDevice.addEventListener('change', () => { micDeviceId = els.micDevice.value; });
refreshMics();

navigator.mediaDevices?.addEventListener?.('devicechange', () => { refreshCameras(); refreshMics(); });

// ---------- BALISES ----------
const tagsListEl = document.getElementById('tags-list');
const btnTagNew = document.getElementById('btn-tag-new');
const btnTagsDefaults = document.getElementById('btn-tags-defaults');

function renderTags() {
  tagsListEl.innerHTML = '';
  for (const tag of tags) {
    const row = document.createElement('div');
    row.className = 'tag-row';
    row.dataset.id = tag.id;
    row.innerHTML = `
      <div>
        <span class="tag-preview" style="color:${escapeAttr(tag.color)};background:${escapeAttr(tag.bgColor)};">${escapeHtml(tag.label)}</span>
        <span class="tag-name">[${escapeHtml(tag.name)}]</span>
      </div>
      <div class="tag-actions">
        <button data-act="edit" title="Editer">${editIcon()}</button>
        <button data-act="delete" class="danger" title="Supprimer">×</button>
      </div>
    `;
    tagsListEl.appendChild(row);

    // Click sur preview = inserer au curseur
    row.querySelector('.tag-preview').addEventListener('click', () => insertTagAtCursor(tag.name));

    row.querySelector('[data-act=edit]').addEventListener('click', () => toggleEdit(row, tag));
    row.querySelector('[data-act=delete]').addEventListener('click', () => {
      if (!confirm('Supprimer la balise [' + tag.name + '] ?')) return;
      tags = tags.filter(t => t.id !== tag.id);
      saveTags(tags);
      renderTags();
      voice.setTags(tags.map(t => t.name));
      syncToPrompter();
    });
  }
}

function editIcon() { return '✎'; }
function escapeAttr(s) { return (s || '').replace(/"/g, '&quot;'); }

function toggleEdit(row, tag) {
  const existing = row.querySelector('.tag-edit');
  if (existing) { existing.remove(); return; }
  const ed = document.createElement('div');
  ed.className = 'tag-edit';
  ed.innerHTML = `
    <label>Nom (insertion : [nom])
      <input type="text" data-f="name" value="${escapeAttr(tag.name)}" />
    </label>
    <label>Affichage
      <input type="text" data-f="label" value="${escapeAttr(tag.label)}" />
    </label>
    <label>Couleur texte
      <input type="color" data-f="color" value="${escapeAttr(tag.color)}" />
    </label>
    <label>Couleur fond
      <input type="text" data-f="bgColor" value="${escapeAttr(tag.bgColor)}" placeholder="#000 ou transparent" />
    </label>
    <label>Taille (mult.)
      <input type="number" data-f="fontSize" min="0.5" max="3" step="0.1" value="${tag.fontSize}" />
    </label>
    <label>Pause auto (sec)
      <input type="number" data-f="pause" min="0" max="10" step="0.5" value="${tag.pause}" />
    </label>
  `;
  row.appendChild(ed);
  ed.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', () => {
      const f = inp.dataset.f;
      let v = inp.value;
      if (f === 'fontSize' || f === 'pause') v = parseFloat(v) || 0;
      if (f === 'name') v = sanitizeName(v);
      tag[f] = v;
      saveTags(tags);
      // Re-render le preview (text/color)
      const prev = row.querySelector('.tag-preview');
      if (f === 'label') prev.textContent = tag.label;
      if (f === 'color') prev.style.color = tag.color;
      if (f === 'bgColor') prev.style.background = tag.bgColor;
      if (f === 'name') row.querySelector('.tag-name').textContent = '[' + tag.name + ']';
      voice.setTags(tags.map(t => t.name));
      syncToPrompter();
    });
  });
}

function insertTagAtCursor(name) {
  const ta = els.editor;
  const insert = '[' + name + ']';
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const before = ta.value.slice(0, start);
  const after = ta.value.slice(end);
  ta.value = before + insert + after;
  ta.selectionStart = ta.selectionEnd = start + insert.length;
  ta.focus();
  autosave();
  syncToPrompter();
  voice.setScript(ta.value);
}

btnTagNew.addEventListener('click', () => {
  const t = newTag({ name: 'tag' + (tags.length + 1), label: 'TAG' });
  tags.unshift(t);
  saveTags(tags);
  renderTags();
  voice.setTags(tags.map(t => t.name));
  syncToPrompter();
});

btnTagsDefaults.addEventListener('click', () => {
  if (!confirm('Restaurer les 4 balises par defaut ? (les balises existantes ayant le meme nom seront remplacees)')) return;
  for (const def of DEFAULT_TAGS) {
    const existing = tags.find(t => t.name === def.name);
    if (existing) Object.assign(existing, def, { id: existing.id });
    else tags.unshift({ ...def, id: 't_' + def.name + '_' + Date.now().toString(36) });
  }
  saveTags(tags);
  renderTags();
  voice.setTags(tags.map(t => t.name));
  syncToPrompter();
});

// ---------- PERSISTANCE DES PARAMETRES ----------
const SETTINGS_KEY = 'novaprompter:settings';

function collectSettings() {
  return {
    mode, speed, fontSize, lineWidth, focusOffset, lookahead,
    mirrorH, mirrorV, alwaysTop, ignoreMouse, opacity,
    theme, colorFg, colorBg, fontFamily, fontWeight, lineHeight, letterSpacing, alignLeft,
    camDeviceId, micDeviceId, camOverlay, camBlur, camBlurAmount,
    obsHost: els.obsHost.value,
    voiceLang: els.voiceLang.value,
    recSource: els.recSource.value
  };
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(collectSettings())); } catch {}
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object') return;

    // Variables de state
    if (s.mode) mode = s.mode;
    if (typeof s.speed === 'number') speed = s.speed;
    if (typeof s.fontSize === 'number') fontSize = s.fontSize;
    if (typeof s.lineWidth === 'number') lineWidth = s.lineWidth;
    if (typeof s.focusOffset === 'number') focusOffset = s.focusOffset;
    if (typeof s.lookahead === 'number') lookahead = s.lookahead;
    if (typeof s.mirrorH === 'boolean') mirrorH = s.mirrorH;
    if (typeof s.mirrorV === 'boolean') mirrorV = s.mirrorV;
    if (typeof s.alwaysTop === 'boolean') alwaysTop = s.alwaysTop;
    if (typeof s.ignoreMouse === 'boolean') ignoreMouse = s.ignoreMouse;
    if (typeof s.opacity === 'number') opacity = s.opacity;
    if (s.theme) theme = s.theme;
    if (s.colorFg) colorFg = s.colorFg;
    if (s.colorBg) colorBg = s.colorBg;
    if (s.fontFamily) fontFamily = s.fontFamily;
    if (typeof s.fontWeight === 'number') fontWeight = s.fontWeight;
    if (typeof s.lineHeight === 'number') lineHeight = s.lineHeight;
    if (typeof s.letterSpacing === 'number') letterSpacing = s.letterSpacing;
    if (typeof s.alignLeft === 'boolean') alignLeft = s.alignLeft;
    if (s.camDeviceId) camDeviceId = s.camDeviceId;
    if (s.micDeviceId) micDeviceId = s.micDeviceId;
    if (typeof s.camOverlay === 'boolean') camOverlay = s.camOverlay;
    if (typeof s.camBlur === 'boolean') camBlur = s.camBlur;
    if (typeof s.camBlurAmount === 'number') camBlurAmount = s.camBlurAmount;

    // Reflection sur l'UI
    els.speed.value = speed; els.speedVal.textContent = speed;
    els.font.value = fontSize; els.fontVal.textContent = fontSize;
    els.lineWidth.value = lineWidth; els.widthVal.textContent = lineWidth;
    els.focus.value = focusOffset; els.focusVal.textContent = focusOffset;
    els.lookahead.value = lookahead; els.lookaheadVal.textContent = lookahead;
    els.mirrorH.checked = mirrorH;
    els.mirrorV.checked = mirrorV;
    els.alwaysTop.checked = alwaysTop;
    els.ignoreMouse.checked = ignoreMouse;
    els.opacity.value = Math.round(opacity * 100); els.opVal.textContent = Math.round(opacity * 100);
    els.theme.value = theme;
    els.colorFg.value = colorFg;
    els.colorBg.value = colorBg;
    els.customColorsGroup.style.display = (theme === 'custom') ? '' : 'none';
    els.fontFamily.value = fontFamily;
    els.fontWeight.value = fontWeight; els.weightVal.textContent = fontWeight;
    els.lineHeight.value = Math.round(lineHeight * 100); els.lhVal.textContent = lineHeight.toFixed(2);
    els.letterSpacing.value = letterSpacing; els.lsVal.textContent = letterSpacing;
    els.alignLeft.checked = alignLeft;
    els.camBlur.checked = camBlur;
    els.camBlurAmount.value = camBlurAmount; els.blurVal.textContent = camBlurAmount;

    // Mode segment buttons
    els.segBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));

    // Champs externes
    if (s.obsHost) els.obsHost.value = s.obsHost;
    if (s.voiceLang) els.voiceLang.value = s.voiceLang;
    if (s.recSource) els.recSource.value = s.recSource;

    // Setters Electron qui dependent de la fenetre prompter (idempotents)
    window.nova.setAlwaysOnTop(alwaysTop);
    window.nova.setIgnoreMouse(ignoreMouse);
    window.nova.setOpacity(opacity);
  } catch (e) { console.warn('loadSettings failed', e); }
}

// Charge avant le premier sync, pour que tout s'aligne
loadSettings();
renderTags();
voice.setTags(tags.map(t => t.name));
voice.setScript(els.editor.value);

// Capture GLOBALE : tout input/change sur n'importe quel champ -> save debounced.
// Plus aucun risque qu'un controle soit oublie.
document.addEventListener('input', scheduleSave, true);
document.addEventListener('change', scheduleSave, true);

// Sauvegarde au moment de la fermeture (multiples events pour couvrir Electron)
function flushSave() {
  clearTimeout(_settingsTimer);
  try { saveSettings(); saveCurrent(); } catch (e) { console.warn('flushSave', e); }
}
window.addEventListener('beforeunload', flushSave);
window.addEventListener('pagehide', flushSave);
window.addEventListener('blur', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});

// Bouton Enregistrer manuel (topbar)
if (els.saveBtn) {
  els.saveBtn.addEventListener('click', () => {
    flushSave();
    const orig = els.saveBtn.textContent;
    els.saveBtn.textContent = 'Enregistre ✓';
    els.saveBtn.style.background = 'var(--ok)';
    els.saveBtn.style.color = '#000';
    setTimeout(() => {
      els.saveBtn.textContent = orig;
      els.saveBtn.style.background = '';
      els.saveBtn.style.color = '';
    }, 1200);
  });
}

// Raccourci Ctrl+S
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    flushSave();
    if (els.saveBtn) els.saveBtn.click();
  }
  // Raccourci d'urgence : Ctrl+Alt+M -> desactive click-through (au cas ou la fenetre
  // prompter est devenue impossible a deplacer)
  if (e.ctrlKey && e.altKey && (e.key === 'm' || e.key === 'M')) {
    e.preventDefault();
    ignoreMouse = false;
    if (els.ignoreMouse) els.ignoreMouse.checked = false;
    window.nova.setIgnoreMouse(false);
    saveSettings();
    // Petit toast
    const toast = document.createElement('div');
    toast.textContent = 'Click-through désactivé — tu peux à nouveau bouger le prompter';
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:var(--ok);color:#000;padding:10px 18px;border-radius:6px;font-weight:600;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.5)';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }
});

// Au load : si ignoreMouse etait persiste a true, le forcer a false par securite.
// Click-through est tres deroutant et c'est facile de l'activer par erreur.
// L'utilisateur peut le reactiver explicitement dans Reglages > Prompter.
if (ignoreMouse) {
  ignoreMouse = false;
  if (els.ignoreMouse) els.ignoreMouse.checked = false;
  saveSettings();
}

// ---------- Camera fenetre dediee ----------
function buildCamOverlayQuery() {
  const params = new URLSearchParams();
  const camOpt = els.camDevice.selectedOptions[0];
  if (camOpt && camOpt.textContent) params.set('cam', camOpt.textContent.trim());
  params.set('blur', camBlur ? '1' : '0');
  params.set('intensity', String(camBlurAmount || 12));
  return params.toString();
}

const elCamWinOpen = document.getElementById('btn-cam-window');
const elCamWinClose = document.getElementById('btn-cam-window-close');
if (elCamWinOpen) elCamWinOpen.addEventListener('click', () => {
  // Si le PiP du prompter est actif, on le desactive pour eviter conflit hardware Windows
  if (els.camOverlay.checked) {
    els.camOverlay.checked = false;
    camOverlay = false;
    syncToPrompter();
  }
  window.nova.camOverlayOpen(buildCamOverlayQuery());
});
if (elCamWinClose) elCamWinClose.addEventListener('click', () => window.nova.camOverlayClose());

// First sync au cas ou prompter ouvert
syncToPrompter();
