// Page standalone : cam + fond flou via MediaPipe.
// Conçue pour etre utilisee comme OBS Browser Source.
// Lit query string : ?cam=<label>&blur=<0|1>&intensity=<n>&mirror=<0|1>

const $ = (s) => document.querySelector(s);
const STORE_KEY = 'novaprompter:camblur:settings';

const params = new URLSearchParams(location.search);
const initialCamLabel = params.get('cam') || '';
const initialBlur = params.get('blur') !== '0';
const initialIntensity = parseInt(params.get('intensity') || '12', 10);
const initialMirror = params.get('mirror') === '1';
const initialHide = params.get('hideui') === '1';
const initialBgMode = params.get('bgmode') || ''; // blur | color | image | none

let saved = {};
try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch {}

const state = {
  camLabel: initialCamLabel || saved.camLabel || '',
  camDeviceId: saved.camDeviceId || '',
  bgMode: initialBgMode || saved.bgMode || (params.has('blur') && !initialBlur ? 'none' : 'blur'),
  intensity: params.has('intensity') ? initialIntensity : (saved.intensity ?? 12),
  bgColor: saved.bgColor || '#ffffff',
  bgImage: saved.bgImage || '',  // data URL
  mirror: params.has('mirror') ? initialMirror : (saved.mirror ?? false)
};

const elVideo = $('#src');
const elCanvas = $('#out');
const ctx = elCanvas.getContext('2d');
const elPanel = $('#panel');
const elCam = $('#cam');
const elBgMode = $('#bg-mode');
const elAmt = $('#blur-amt');
const elBgColor = $('#bg-color');
const elBgLoad = $('#bg-load-image');
const elBgClear = $('#bg-clear-image');
const elBgFile = $('#bg-file');
const elLabIntensity = $('#lab-intensity');
const elLabColor = $('#lab-color');
const elLabImage = $('#lab-image');
const elMirror = $('#mirror');
const elHide = $('#hide');
const elStatus = $('#status');

elBgMode.value = state.bgMode;
elAmt.value = state.intensity;
elBgColor.value = state.bgColor;
elMirror.checked = state.mirror;

// Image de fond pre-chargee
const bgImageEl = new Image();
let bgImageReady = false;
bgImageEl.onload = () => { bgImageReady = true; };
bgImageEl.onerror = () => { bgImageReady = false; };
if (state.bgImage) bgImageEl.src = state.bgImage;

function updateModeUi() {
  elLabIntensity.style.display = state.bgMode === 'blur' ? '' : 'none';
  elLabColor.style.display = state.bgMode === 'color' ? '' : 'none';
  elLabImage.style.display = state.bgMode === 'image' ? '' : 'none';
}
updateModeUi();

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({
    camLabel: state.camLabel, camDeviceId: state.camDeviceId,
    bgMode: state.bgMode, intensity: state.intensity,
    bgColor: state.bgColor, bgImage: state.bgImage,
    mirror: state.mirror
  })); } catch (e) {
    // QuotaExceeded probable si bgImage trop lourde — on garde tout sauf l'image
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        camLabel: state.camLabel, camDeviceId: state.camDeviceId,
        bgMode: state.bgMode, intensity: state.intensity,
        bgColor: state.bgColor,
        mirror: state.mirror
      }));
      setStatus('Image trop lourde pour persister (compresse-la sous 1 MB)');
    } catch {}
  }
}

function setStatus(s) { elStatus.textContent = s; }

let mediaStream = null;
let segmenter = null;
let running = false;
const tempCanvas = document.createElement('canvas');
const tctx = tempCanvas.getContext('2d');

async function listCams() {
  try { (await navigator.mediaDevices.getUserMedia({ video: true })).getTracks().forEach(t => t.stop()); } catch {}
  const devs = await navigator.mediaDevices.enumerateDevices();
  const cams = devs.filter(d => d.kind === 'videoinput');
  elCam.innerHTML = '';
  for (const c of cams) {
    const o = document.createElement('option');
    o.value = c.deviceId;
    o.textContent = c.label || ('Camera ' + (cams.indexOf(c) + 1));
    elCam.appendChild(o);
  }
  // Auto-select : par label demande, sinon par deviceId memo, sinon premier
  let chosen = null;
  if (state.camLabel) {
    chosen = cams.find(c => c.label.toLowerCase().includes(state.camLabel.toLowerCase()));
  }
  if (!chosen && state.camDeviceId) {
    chosen = cams.find(c => c.deviceId === state.camDeviceId);
  }
  if (!chosen && cams.length) chosen = cams[0];
  if (chosen) {
    state.camDeviceId = chosen.deviceId;
    state.camLabel = chosen.label || state.camLabel;
    elCam.value = chosen.deviceId;
  }
  return cams;
}

async function startCam() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (!state.camDeviceId) return;
  // Bannir + retry sequence (3 tentatives avec backoff) pour gerer "device busy" temporaire
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: state.camDeviceId }, width: 1280, height: 720 },
        audio: false
      });
      elVideo.srcObject = mediaStream;
      setStatus('Cam OK');
      hideErrorOverlay();
      return;
    } catch (e) {
      lastErr = e;
      // NotReadableError = cam deja prise par un autre process
      if (e.name === 'NotReadableError' || /busy|in use|hardware/i.test(e.message)) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      break;
    }
  }
  showErrorOverlay(lastErr);
  setStatus('Erreur cam: ' + (lastErr?.message || lastErr));
}

function showErrorOverlay(err) {
  let ov = document.getElementById('cam-error');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'cam-error';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);color:#fff;display:flex;align-items:center;justify-content:center;z-index:100;padding:40px;font-size:14px;line-height:1.6';
    document.body.appendChild(ov);
  }
  const isNotReadable = err && (err.name === 'NotReadableError' || /busy|in use|hardware/i.test(err.message || ''));
  ov.innerHTML = `
    <div style="max-width:600px">
      <h2 style="color:#ff5b3a;margin:0 0 16px">Impossible d'ouvrir la camera</h2>
      <p style="margin:0 0 12px"><b>Erreur :</b> ${err?.message || err}</p>
      ${isNotReadable ? `
        <p style="margin:0 0 8px">La cam est <b>deja utilisee par un autre process</b>.</p>
        <p style="margin:0 0 8px">Verifie :</p>
        <ul style="margin:0 0 12px;padding-left:20px">
          <li>OBS a la cam comme <b>source video directe</b> ? Retire-la d'OBS, garde seulement la "Capture de fenetre" sur cette page.</li>
          <li>Le <b>PiP cam dans le prompter</b> est ouvert ? Decoche "Afficher la camera dans le prompter".</li>
          <li>Autre app (Teams, Zoom, Discord, navigateur) qui a ouvert la cam ?</li>
        </ul>
        <p style="margin:0 0 8px">Solution la plus simple : ferme tout, puis ouvre uniquement cette fenetre + OBS (en Capture de fenetre).</p>
        <button onclick="location.reload()" style="margin-top:12px;padding:8px 16px;background:#ff5b3a;color:#fff;border:0;border-radius:6px;cursor:pointer">Reessayer</button>
      ` : `
        <button onclick="location.reload()" style="margin-top:12px;padding:8px 16px;background:#ff5b3a;color:#fff;border:0;border-radius:6px;cursor:pointer">Reessayer</button>
      `}
    </div>
  `;
}

function hideErrorOverlay() {
  const ov = document.getElementById('cam-error');
  if (ov) ov.remove();
}

async function ensureSegmenter() {
  if (segmenter) return segmenter;
  if (typeof window.SelfieSegmentation !== 'function') {
    setStatus('MediaPipe non charge — verifie internet');
    throw new Error('MediaPipe missing');
  }
  setStatus('Chargement modele…');
  const seg = new window.SelfieSegmentation({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
  });
  seg.setOptions({ modelSelection: 1, selfieMode: false });
  seg.onResults(onSegResults);
  await seg.initialize();
  segmenter = seg;
  setStatus('Pret');
  return seg;
}

function drawBackgroundCover(w, h) {
  if (state.bgMode === 'color') {
    ctx.fillStyle = state.bgColor || '#ffffff';
    ctx.fillRect(0, 0, w, h);
  } else if (state.bgMode === 'image' && bgImageReady && bgImageEl.naturalWidth) {
    // cover fit
    const ir = bgImageEl.naturalWidth / bgImageEl.naturalHeight;
    const sr = w / h;
    let dw, dh, dx, dy;
    if (ir > sr) { dh = h; dw = h * ir; dx = (w - dw) / 2; dy = 0; }
    else         { dw = w; dh = w / ir; dx = 0; dy = (h - dh) / 2; }
    ctx.drawImage(bgImageEl, dx, dy, dw, dh);
  }
}

function onSegResults(results) {
  const img = results.image;
  if (!img) return;
  const w = img.width || elVideo.videoWidth;
  const h = img.height || elVideo.videoHeight;
  if (!w || !h) return;
  if (elCanvas.width !== w) elCanvas.width = w;
  if (elCanvas.height !== h) elCanvas.height = h;
  if (tempCanvas.width !== w) tempCanvas.width = w;
  if (tempCanvas.height !== h) tempCanvas.height = h;

  ctx.save();
  if (state.mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }

  if (state.bgMode === 'blur') {
    ctx.filter = `blur(${state.intensity}px)`;
    ctx.drawImage(img, 0, 0, w, h);
    ctx.filter = 'none';
  } else if (state.bgMode === 'color' || state.bgMode === 'image') {
    drawBackgroundCover(w, h);
  } else {
    // none — pas de remplacement, on dessine la cam direct (le sujet sera reposé par-dessus inutilement, mais cheap)
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();
    return;
  }

  // Sujet net : compose image + mask sur tempCanvas
  tctx.save();
  tctx.clearRect(0, 0, w, h);
  tctx.drawImage(img, 0, 0, w, h);
  tctx.globalCompositeOperation = 'destination-in';
  tctx.drawImage(results.segmentationMask, 0, 0, w, h);
  tctx.restore();
  ctx.drawImage(tempCanvas, 0, 0);

  ctx.restore();
}

async function loop() {
  if (!running) return;
  if (elVideo.readyState >= 2 && elVideo.videoWidth) {
    const needsSeg = state.bgMode !== 'none';
    if (needsSeg) {
      try { await segmenter?.send({ image: elVideo }); } catch {}
    } else {
      // Cam direct, pas de remplacement
      const w = elVideo.videoWidth, h = elVideo.videoHeight;
      if (elCanvas.width !== w) elCanvas.width = w;
      if (elCanvas.height !== h) elCanvas.height = h;
      ctx.save();
      if (state.mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
      ctx.drawImage(elVideo, 0, 0, w, h);
      ctx.restore();
    }
  }
  requestAnimationFrame(loop);
}

elCam.addEventListener('change', async () => {
  const opt = elCam.selectedOptions[0];
  state.camDeviceId = elCam.value;
  state.camLabel = opt ? opt.textContent : '';
  save();
  await startCam();
});

elBgMode.addEventListener('change', async () => {
  state.bgMode = elBgMode.value;
  updateModeUi();
  if (state.bgMode !== 'none') await ensureSegmenter();
  save();
});

elAmt.addEventListener('input', () => { state.intensity = +elAmt.value; save(); });
elBgColor.addEventListener('input', () => { state.bgColor = elBgColor.value; save(); });
elMirror.addEventListener('change', () => { state.mirror = elMirror.checked; save(); });

elBgLoad.addEventListener('click', () => elBgFile.click());
elBgFile.addEventListener('change', () => {
  const file = elBgFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl = ev.target.result;
    state.bgImage = dataUrl;
    bgImageReady = false;
    bgImageEl.src = dataUrl;
    save();
    setStatus('Image chargee : ' + file.name);
  };
  reader.onerror = () => setStatus('Erreur lecture image');
  reader.readAsDataURL(file);
  elBgFile.value = ''; // reset
});

elBgClear.addEventListener('click', () => {
  state.bgImage = '';
  bgImageReady = false;
  bgImageEl.src = '';
  save();
  setStatus('Image retiree');
});

elHide.addEventListener('click', () => document.body.classList.toggle('hidden-panel'));
window.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('hidden-panel');
});

if (initialHide) document.body.classList.add('hidden-panel');
if (params.get('overlay') === '1') document.body.classList.add('overlay');

(async () => {
  await listCams();
  await startCam();
  if (state.bgMode !== 'none') await ensureSegmenter().catch(() => {});
  running = true;
  requestAnimationFrame(loop);
  // Show panel for 4s on load (visual feedback)
  elPanel.classList.add('show');
  setTimeout(() => elPanel.classList.remove('show'), 4000);
})();

navigator.mediaDevices?.addEventListener?.('devicechange', listCams);
