// Prompter renderer : recoit l'etat depuis l'editor via IPC sync.
const $ = (s) => document.querySelector(s);
const stage = $('#stage');
const textEl = $('#text');
const focusLine = $('#focusLine');
const centerLine = $('#centerLine');
const camWrap = $('#camWrap');
const camView = $('#camView');
const camCanvas = $('#camCanvas');
const camCtx = camCanvas.getContext('2d');
const emptyEl = $('#empty');
const hudMode = $('#hud-mode');
const hudState = $('#hud-state');
const hudSpeed = $('#hud-speed');
const hudProgress = $('#hud-progress');

let state = {
  text: '',
  mode: 'auto',
  playing: false,
  speed: 60,
  fontSize: 42,
  lineWidth: 90,
  focusOffset: 35,
  mirrorH: false,
  mirrorV: false,
  scrollPx: 0,
  progressRatio: 0,
  camDeviceId: '',
  camOverlay: false,
  camBlur: false,
  camBlurAmount: 8,
  lookahead: 4,
  // Apparence
  theme: 'dark',
  colorFg: '#ffffff',
  colorBg: '#000000',
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  fontWeight: 600,
  lineHeight: 1.5,
  letterSpacing: 0,
  alignLeft: false,
  tags: []
};

let camStream = null;
let camActiveDevice = '';

let lastTextRendered = '';
let lastTagsSig = '';
let words = [];          // les vrais mots (spans .word)
let scriptTokenCount = 0;
let tagSpans = [];       // [{el, pause, consumed}]
let pauseUntil = 0;      // timestamp jusqu'auquel le scroll auto est en pause

function render() {
  // Texte (rebuild aussi si la liste de balises a change)
  const tagsSig = JSON.stringify((state.tags || []).map(t => [t.name, t.label, t.color, t.bgColor, t.fontSize, t.pause]));
  if (state.text !== lastTextRendered || tagsSig !== lastTagsSig) {
    rebuildText(state.text);
    lastTextRendered = state.text;
    lastTagsSig = tagsSig;
  }
  // Style
  textEl.style.fontSize = state.fontSize + 'px';
  textEl.style.maxWidth = state.lineWidth + '%';
  textEl.style.marginLeft = 'auto';
  textEl.style.marginRight = 'auto';
  document.body.classList.toggle('mirror-h', !!state.mirrorH);
  document.body.classList.toggle('mirror-v', !!state.mirrorV);

  // Apparence (variables CSS appliquees au :root)
  const root = document.documentElement;
  const fg = state.colorFg || '#ffffff';
  const bg = state.colorBg || '#000000';
  root.style.setProperty('--prompter-fg', fg);
  // bg avec alpha (pour l'opacite Electron est gere a part — ici c'est le fond du frame)
  root.style.setProperty('--prompter-bg-rgba', hexToRgba(bg, 0.92));
  root.style.setProperty('--prompter-font', state.fontFamily || "'Segoe UI', system-ui, sans-serif");
  root.style.setProperty('--prompter-weight', String(state.fontWeight || 600));
  root.style.setProperty('--prompter-lh', String(state.lineHeight || 1.5));
  root.style.setProperty('--prompter-ls', (state.letterSpacing || 0) + 'px');
  // past/now ajustes selon theme (clair vs sombre)
  const isLight = isLightColor(bg);
  root.style.setProperty('--prompter-past', isLight ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.35)');
  root.style.setProperty('--prompter-now', isLight ? '#c25b00' : '#ffd66e');
  textEl.classList.toggle('align-left', !!state.alignLeft);

  // Focus line position : si la camera est activee, focus = centre exact
  const stageH = stage.clientHeight;
  const camOn = !!state.camOverlay;
  document.body.classList.toggle('has-cam', camOn);
  const effectiveFocus = camOn ? 50 : state.focusOffset;
  const focusY = (effectiveFocus / 100) * stageH;
  focusLine.style.top = focusY + 'px';
  // La center-line est toujours au milieu (CSS top:50%) — visible que si has-cam

  // Camera overlay
  if (camOn) {
    camWrap.hidden = false;
    ensureCam(state.camDeviceId).catch(() => {});
    // Flou : si camBlur, on utilise le segmenter (sujet net + fond flou)
    if (state.camBlur) {
      camWrap.classList.add('blurred');
      startSegmentedBlur(Math.max(0, state.camBlurAmount || 8)).catch((e) => {
        console.warn('Segmentation echec, fallback CSS', e);
        camWrap.classList.remove('blurred');
        camView.style.filter = `blur(${state.camBlurAmount || 8}px)`;
      });
    } else {
      camWrap.classList.remove('blurred');
      camView.style.filter = 'none';
      stopSegmentedBlur();
    }
  } else {
    camWrap.hidden = true;
    stopSegmentedBlur();
    stopCam();
  }

  emptyEl.style.display = state.text.trim() ? 'none' : 'grid';

  // HUD
  hudMode.textContent = state.mode.toUpperCase();
  hudState.textContent = state.playing ? 'PLAY' : 'PAUSE';
  hudSpeed.textContent = state.speed + ' px/s';

  applyScroll();
}

function rebuildText(t) {
  textEl.innerHTML = '';
  words = [];
  tagSpans = [];
  pauseUntil = 0;
  if (!t) { scriptTokenCount = 0; return; }

  // Detect [name] connus
  const tagsByName = new Map();
  for (const tag of (state.tags || [])) tagsByName.set(tag.name, tag);

  let cursor = 0;
  if (tagsByName.size) {
    const escaped = [...tagsByName.keys()].map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const tagRe = new RegExp('\\[(' + escaped.join('|') + ')\\]', 'g');
    let m;
    while ((m = tagRe.exec(t)) !== null) {
      addTextRun(t.slice(cursor, m.index));
      const tag = tagsByName.get(m[1]);
      if (tag) addTagSpan(tag);
      cursor = m.index + m[0].length;
    }
  }
  addTextRun(t.slice(cursor));
  scriptTokenCount = words.length;
}

function addTextRun(text) {
  if (!text) return;
  const re = /(\S+)|(\s+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) {
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = m[1];
      textEl.appendChild(span);
      words.push(span);
    } else {
      textEl.appendChild(document.createTextNode(m[2]));
    }
  }
}

function addTagSpan(tag) {
  // Saut de ligne avant la balise pour qu'elle ressorte (sauf si elle est inline)
  const span = document.createElement('span');
  span.className = 'tag';
  span.textContent = tag.label;
  span.style.color = tag.color;
  if (tag.bgColor && tag.bgColor !== 'transparent') {
    span.style.background = tag.bgColor;
    span.style.padding = '0 .35em';
    span.style.borderRadius = '.25em';
  }
  span.style.fontSize = (tag.fontSize || 1) + 'em';
  span.style.fontWeight = '700';
  textEl.appendChild(span);
  tagSpans.push({ el: span, pause: tag.pause || 0, consumed: false });
}

function applyScroll() {
  let y;
  if (state.mode === 'voice') {
    // Easing lineaire pour avoir un mouvement constant (pas d'accel/decel)
    textEl.style.transition = 'transform 0.20s linear';

    const stageH = stage.clientHeight;
    const camOn = !!state.camOverlay;
    const effectiveFocus = camOn ? 50 : state.focusOffset;
    const focusY = (effectiveFocus / 100) * stageH;
    const idx = Math.floor(state.progressRatio * scriptTokenCount);

    // Scroll PROPORTIONNEL : chaque mot avance de la meme distance verticale
    // (hauteur totale / nombre total de mots), ce qui evite les sauts ligne-par-ligne.
    const total = Math.max(1, scriptTokenCount);
    const lookaheadFrac = (state.lookahead || 0) / total;
    const ratio = Math.min(1, state.progressRatio + lookaheadFrac);
    const textH = textEl.scrollHeight;
    const targetY = ratio * textH;
    y = focusY - targetY;
    state.scrollPx = -y;

    // highlight: past = deja prononce, now = mot prononce
    for (let i = 0; i < words.length; i++) {
      words[i].classList.toggle('past', i < idx);
      words[i].classList.toggle('now', i === idx);
    }
  } else {
    textEl.style.transition = 'none';
    y = -state.scrollPx;
    for (const w of words) w.classList.remove('past', 'now');
  }
  textEl.style.setProperty('--scroll', y + 'px');
  // HUD progress
  const total = totalScrollExtent();
  const ratio = state.mode === 'voice'
    ? state.progressRatio
    : (total > 0 ? Math.min(1, state.scrollPx / total) : 0);
  hudProgress.textContent = Math.round(ratio * 100) + '%';
}

function currentTransformY() {
  const v = textEl.style.getPropertyValue('--scroll');
  return parseFloat(v) || 0;
}

function hexToRgba(hex, alpha) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6 && h.length !== 3) return `rgba(0,0,0,${alpha})`;
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function isLightColor(hex) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6 && h.length !== 3) return false;
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // luminance perçue
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160;
}

function totalScrollExtent() {
  const stageH = stage.clientHeight;
  const effectiveFocus = state.camOverlay ? 50 : state.focusOffset;
  const focusY = (effectiveFocus / 100) * stageH;
  // En mode voice, on doit pouvoir scroller un peu plus loin pour aller voir
  // les derniers mots (a cause du lookahead)
  return Math.max(0, textEl.scrollHeight - focusY);
}

async function ensureCam(deviceId) {
  if (camStream && camActiveDevice === deviceId) return;
  stopCam();
  if (!navigator.mediaDevices) return;
  try {
    const constraints = deviceId
      ? { video: { deviceId: { exact: deviceId } }, audio: false }
      : { video: true, audio: false };
    camStream = await navigator.mediaDevices.getUserMedia(constraints);
    camView.srcObject = camStream;
    camActiveDevice = deviceId;
  } catch (e) {
    console.warn('cam open failed', e);
  }
}

function stopCam() {
  if (camStream) {
    try { camStream.getTracks().forEach(t => t.stop()); } catch {}
    camStream = null;
  }
  camView.srcObject = null;
  camActiveDevice = '';
}

// ---------- Segmented background blur via MediaPipe ----------
// Sujet net + fond flou. Tourne sur CPU/GPU, ~30 fps.
let segmenter = null;
let segLoopRunning = false;
let segBlurAmount = 8;
const _segTempCanvas = document.createElement('canvas');
const _segTempCtx = _segTempCanvas.getContext('2d');

async function ensureSegmenter() {
  if (segmenter) return segmenter;
  if (typeof window.SelfieSegmentation !== 'function') {
    throw new Error('MediaPipe non charge (verifie ta connexion internet la 1ere fois)');
  }
  const seg = new window.SelfieSegmentation({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
  });
  seg.setOptions({ modelSelection: 1, selfieMode: false });
  seg.onResults((results) => {
    const img = results.image;
    if (!img) return;
    const w = img.width || camView.videoWidth;
    const h = img.height || camView.videoHeight;
    if (!w || !h) return;
    if (camCanvas.width !== w) camCanvas.width = w;
    if (camCanvas.height !== h) camCanvas.height = h;
    if (_segTempCanvas.width !== w) _segTempCanvas.width = w;
    if (_segTempCanvas.height !== h) _segTempCanvas.height = h;

    // 1) Fond flou
    camCtx.save();
    camCtx.filter = `blur(${segBlurAmount}px)`;
    camCtx.drawImage(img, 0, 0, w, h);
    camCtx.filter = 'none';
    camCtx.restore();

    // 2) Sujet net : compose sur temp canvas (image + mask en destination-in)
    _segTempCtx.save();
    _segTempCtx.clearRect(0, 0, w, h);
    _segTempCtx.drawImage(img, 0, 0, w, h);
    _segTempCtx.globalCompositeOperation = 'destination-in';
    _segTempCtx.drawImage(results.segmentationMask, 0, 0, w, h);
    _segTempCtx.restore();

    // 3) Coller le sujet net sur le canvas final (par-dessus le fond flou)
    camCtx.drawImage(_segTempCanvas, 0, 0);
  });
  await seg.initialize();
  segmenter = seg;
  return seg;
}

async function startSegmentedBlur(blurPx) {
  segBlurAmount = blurPx;
  if (segLoopRunning) return;
  if (!camStream) await ensureCam(state.camDeviceId);
  await ensureSegmenter();
  segLoopRunning = true;

  const tick = async () => {
    if (!segLoopRunning || !segmenter) return;
    if (camView.readyState >= 2 && camView.videoWidth) {
      try { await segmenter.send({ image: camView }); } catch {}
    }
    if (segLoopRunning) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function stopSegmentedBlur() {
  segLoopRunning = false;
}

// Auto-scroll loop — throttle l'IPC pour eviter bombardement
let lastTs = performance.now();
let lastIpcSent = 0;
function tick(ts) {
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;
  if (state.mode === 'auto' && state.playing) {
    if (ts >= pauseUntil) {
      state.scrollPx += state.speed * dt;
      const max = totalScrollExtent();
      if (state.scrollPx > max) state.scrollPx = max;
      checkTagPause(ts);
      applyScroll();
      // Throttle IPC a 5 fois/sec (200ms) au lieu de 60 fois/sec
      if (ts - lastIpcSent > 200) {
        lastIpcSent = ts;
        window.nova.send({ type: 'prompter:scrollPx', value: state.scrollPx });
      }
    } else {
      applyScroll();
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function checkTagPause(ts) {
  if (!tagSpans.length) return;
  const stageH = stage.clientHeight;
  const focusY = ((state.camOverlay ? 50 : state.focusOffset) / 100) * stageH;
  for (const tp of tagSpans) {
    if (tp.consumed || tp.pause <= 0) continue;
    const tagY = tp.el.offsetTop + tp.el.offsetHeight / 2;
    // Le scroll a-t-il fait passer la balise sous la focus line ?
    if (tagY <= state.scrollPx + focusY) {
      tp.consumed = true;
      pauseUntil = ts + tp.pause * 1000;
      tp.el.classList.add('pulse');
      setTimeout(() => tp.el.classList.remove('pulse'), tp.pause * 1000);
      break;
    }
  }
}

// IPC sync
window.nova.onSync((p) => {
  if (!p) return;
  if (p.type === 'state') {
    Object.assign(state, p);
    render();
  } else if (p.type === 'cmd:fullscreen') {
    toggleFullscreen();
  }
});

// Window controls
$('#btn-close').addEventListener('click', () => window.nova.closePrompter());
$('#btn-min').addEventListener('click', () => {
  // pas d'API minimize directe : reduit l'opacite a 0.2
  window.nova.setOpacity(0.2);
});
$('#btn-fullscreen').addEventListener('click', toggleFullscreen);

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
}

// Resize observer pour repositionner la focus line
new ResizeObserver(() => render()).observe(stage);

// Scroll manuel sur le prompter — fonctionne en auto ET en voice
// En voice, deplace l'index voice pour que la reco reprenne d'ici.
// En auto+play, declenche une pause auto de 2s pour eviter que le tick reecrase.
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const dy = e.deltaY;
  if (state.mode === 'auto') {
    const max = totalScrollExtent();
    state.scrollPx = Math.max(0, Math.min(max, state.scrollPx + dy));
    // Si on est en train de play, on suspend l'auto-scroll 2s pour laisser lire
    if (state.playing) pauseUntil = performance.now() + 2000;
    applyScroll();
    window.nova.send({ type: 'prompter:scrollPx', value: state.scrollPx });
  } else {
    // voice : convertit le delta en pas de mots
    if (!scriptTokenCount) return;
    const step = Math.max(1, Math.round(Math.abs(dy) / 60));
    const sign = Math.sign(dy);
    const curIdx = Math.floor(state.progressRatio * scriptTokenCount);
    const newIdx = Math.max(0, Math.min(scriptTokenCount, curIdx + sign * step));
    state.progressRatio = newIdx / scriptTokenCount;
    applyScroll();
    window.nova.send({ type: 'prompter:voiceIndex', idx: newIdx, total: scriptTokenCount });
  }
}, { passive: false, capture: true });

// Fleches gauche/droite : recule/avance d'un mot en voice (ou de 30 px en auto)
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (state.mode === 'voice' && scriptTokenCount) {
      e.preventDefault();
      const cur = Math.floor(state.progressRatio * scriptTokenCount);
      const newIdx = Math.max(0, Math.min(scriptTokenCount, cur + (e.key === 'ArrowRight' ? 1 : -1)));
      state.progressRatio = newIdx / scriptTokenCount;
      applyScroll();
      window.nova.send({ type: 'prompter:voiceIndex', idx: newIdx, total: scriptTokenCount });
    } else if (state.mode === 'auto') {
      e.preventDefault();
      const max = totalScrollExtent();
      const step = e.key === 'ArrowRight' ? 30 : -30;
      state.scrollPx = Math.max(0, Math.min(max, state.scrollPx + step));
      applyScroll();
      window.nova.send({ type: 'prompter:scrollPx', value: state.scrollPx });
    }
  }
});

// Raccourcis depuis le prompter (utile si la fenetre a le focus, ex: clic Bluetooth)
window.addEventListener('keydown', (e) => {
  const k = e.key, code = e.code;
  let cmd = null;
  if (code === 'Space' || k === 'MediaPlayPause' || k === 'AudioPlay') { e.preventDefault(); cmd = 'play'; }
  else if (k === 'r' || k === 'R') cmd = 'reset';
  else if (k === 'ArrowUp' || k === 'PageUp' || k === 'AudioVolumeUp' || k === 'MediaTrackNext') { e.preventDefault(); cmd = 'speed-up'; }
  else if (k === 'ArrowDown' || k === 'PageDown' || k === 'AudioVolumeDown' || k === 'MediaTrackPrevious') { e.preventDefault(); cmd = 'speed-down'; }
  else if (k === '+' || k === '=') cmd = 'font-up';
  else if (k === '-' || k === '_') cmd = 'font-down';
  else if (k === 'F11') { e.preventDefault(); toggleFullscreen(); return; }
  if (cmd) window.nova.send({ type: 'prompter:cmd', cmd });
});

window.addEventListener('beforeunload', stopCam);

render();
