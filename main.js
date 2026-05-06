const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const url = require('url');
const { spawn } = require('child_process');

let editorWin = null;
let prompterWin = null;
let camOverlayWin = null;

// ---------- VOSK auto-spawn ----------
const VOSK_DIR = 'D:\\code\\outil code\\vosk';
const VENV_PY = path.join(VOSK_DIR, 'venv', 'Scripts', 'python.exe');
const MODEL_DIR = path.join(VOSK_DIR, 'model-fr');
const REQUIREMENTS = path.join(VOSK_DIR, 'requirements.txt');
const SERVER_PY = path.join(VOSK_DIR, 'vosk_server.py');
const DOWNLOAD_PY = path.join(VOSK_DIR, 'download_model.py');
const VOSK_PORT = 2700;

let voskProc = null;
let voskState = 'idle';

function vState(state, msg) {
  voskState = state;
  if (editorWin && !editorWin.isDestroyed()) {
    editorWin.webContents.send('vosk:state', { state, msg });
  }
}

function portIsListening(port) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(400);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(false));
    s.connect(port, '127.0.0.1');
  });
}

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { ...opts, windowsHide: true, shell: false });
    let stderr = '';
    if (p.stderr) p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('error', reject);
    p.on('exit', (code) => code === 0
      ? resolve()
      : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-300)}`)));
  });
}

function findSystemPython() {
  // Essaie py -3 (Windows launcher) puis python
  return new Promise((resolve) => {
    const tryOne = (cmd, args, next) => {
      const p = spawn(cmd, args, { windowsHide: true, shell: false });
      p.on('error', () => next());
      p.on('exit', (code) => code === 0 ? resolve({ cmd, args: args.slice(0, -1) }) : next());
    };
    tryOne('py', ['-3', '--version'],
      () => tryOne('python', ['--version'],
        () => tryOne('python3', ['--version'],
          () => resolve(null))));
  });
}

async function ensureVoskRunning() {
  try {
    if (!fs.existsSync(VOSK_DIR)) {
      vState('error', 'Dossier Vosk introuvable: ' + VOSK_DIR);
      return;
    }

    // Si deja en ecoute (lance manuellement, ou par une instance precedente), on s'y rattache
    if (await portIsListening(VOSK_PORT)) {
      vState('ready', 'Vosk deja actif');
      return;
    }

    // 1. Setup venv si manquant
    if (!fs.existsSync(VENV_PY)) {
      const sysPy = await findSystemPython();
      if (!sysPy) {
        vState('error', 'Python introuvable (telecharge sur python.org)');
        return;
      }
      vState('setup', 'Creation venv Python (~30s)…');
      await runCmd(sysPy.cmd, [...sysPy.args, '-m', 'venv', 'venv'], { cwd: VOSK_DIR });
      vState('setup', 'Installation dependances (~1 min)…');
      await runCmd(VENV_PY, ['-m', 'pip', 'install', '-q', '--disable-pip-version-check', '-r', REQUIREMENTS], { cwd: VOSK_DIR });
    }

    // 2. Modele
    if (!fs.existsSync(MODEL_DIR)) {
      vState('downloading', 'Telechargement modele FR (~50 MB)…');
      await runCmd(VENV_PY, [DOWNLOAD_PY], { cwd: VOSK_DIR });
    }

    // 3. Spawn serveur (silencieux, fenetre cachee)
    vState('starting', 'Demarrage serveur Vosk…');
    voskProc = spawn(VENV_PY, [SERVER_PY], {
      cwd: VOSK_DIR,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    });
    let booted = false;
    voskProc.stdout.on('data', (d) => {
      const s = d.toString();
      if (!booted && (s.includes('Listening') || s.includes('Vosk pret'))) {
        booted = true;
        vState('ready', 'Vosk pret');
      }
    });
    voskProc.stderr.on('data', (d) => {
      // bruit Kaldi etc — on garde silencieux sauf en cas de crash
    });
    voskProc.on('exit', (code) => {
      voskProc = null;
      if (booted) vState('error', 'Vosk arrete (code ' + code + ')');
      else vState('error', 'Vosk a crash au demarrage (code ' + code + ')');
    });

    // Filet de securite : si rien apres 6s, on sonde le port
    setTimeout(async () => {
      if (!booted && await portIsListening(VOSK_PORT)) {
        booted = true;
        vState('ready', 'Vosk pret');
      }
    }, 6000);
  } catch (e) {
    vState('error', 'Echec: ' + (e.message || e).slice(0, 300));
  }
}

function stopVosk() {
  if (voskProc) {
    try { voskProc.kill('SIGTERM'); } catch {}
    voskProc = null;
  }
}

// ---------- HTTP server pour OBS Browser Source ----------
const HTTP_PORT = 8765;
let httpServer = null;
let httpServerPort = HTTP_PORT;
const CAM_BLUR_DIR = path.join(__dirname, 'windows', 'cam-blur');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

function startHttpServer(port) {
  if (httpServer) return;
  const server = http.createServer((req, res) => {
    try {
      const parsed = url.parse(req.url, true);
      let p = decodeURIComponent(parsed.pathname || '/');
      // Anti path traversal
      if (p.includes('..')) { res.writeHead(403); res.end('Forbidden'); return; }
      if (p === '/' || p === '/cam-blur' || p === '/cam-blur/') p = '/cam-blur/index.html';
      if (p.startsWith('/cam-blur/')) p = p.replace(/^\/cam-blur/, '');
      const fullPath = path.join(CAM_BLUR_DIR, p);
      if (!fullPath.startsWith(CAM_BLUR_DIR)) { res.writeHead(403); res.end(); return; }
      fs.readFile(fullPath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found: ' + p); return; }
        const ext = path.extname(p).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Cache-Control': 'no-store'
        });
        res.end(data);
      });
    } catch (e) {
      res.writeHead(500); res.end('Internal error: ' + e.message);
    }
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < HTTP_PORT + 10) {
      startHttpServer(port + 1);
    } else {
      console.warn('HTTP server error:', err.message);
    }
  });
  server.listen(port, '127.0.0.1', () => {
    httpServer = server;
    httpServerPort = port;
    console.log('Cam-blur server: http://127.0.0.1:' + port + '/cam-blur');
    if (editorWin && !editorWin.isDestroyed()) {
      editorWin.webContents.send('http:ready', { port });
    }
  });
}

function stopHttpServer() {
  if (httpServer) { try { httpServer.close(); } catch {} httpServer = null; }
}

function createEditorWindow() {
  editorWin = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'NovaPrompter — Editor',
    backgroundColor: '#0b0b0d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  editorWin.loadFile(path.join(__dirname, 'windows/editor/index.html'));
  editorWin.on('closed', () => {
    editorWin = null;
    if (prompterWin) prompterWin.close();
  });
}

function createCamOverlayWindow(query = '') {
  if (camOverlayWin) {
    if (query) camOverlayWin.loadURL(`http://127.0.0.1:${httpServerPort}/cam-blur?${query}`);
    camOverlayWin.show();
    camOverlayWin.focus();
    return;
  }
  const display = screen.getPrimaryDisplay();
  // Ratio 16:9 (comme la cam 1280x720). Pas carre.
  const w = 480, h = 270;
  camOverlayWin = new BrowserWindow({
    width: w,
    height: h,
    x: Math.round(display.workArea.x + display.workArea.width - w - 40),
    y: Math.round(display.workArea.y + 40),
    title: 'NovaPrompter — Camera',
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: true,
    movable: true,
    minWidth: 240,
    minHeight: 135,
    backgroundColor: '#000000',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  camOverlayWin.setAlwaysOnTop(true, 'screen-saver');
  // Verrouille l'aspect ratio 16:9 — la fenetre ne pourra plus etre carree
  try { camOverlayWin.setAspectRatio(16 / 9); } catch {}
  // Force overlay=1, hideui=1, mirror=1 (selfie mode) pour la fenetre dediee
  const params = new URLSearchParams(query);
  params.set('overlay', '1');
  params.set('hideui', '1');
  if (!params.has('mirror')) params.set('mirror', '1');
  camOverlayWin.loadURL(`http://127.0.0.1:${httpServerPort}/cam-blur?${params.toString()}`);
  camOverlayWin.on('closed', () => { camOverlayWin = null; });
}

function createPrompterWindow() {
  if (prompterWin) {
    prompterWin.show();
    prompterWin.focus();
    return;
  }
  const display = screen.getPrimaryDisplay();
  const w = 700;
  const h = 500;
  prompterWin = new BrowserWindow({
    width: w,
    height: h,
    x: Math.round(display.workArea.x + display.workArea.width - w - 40),
    y: Math.round(display.workArea.y + 80),
    title: 'NovaPrompter — Display',
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    movable: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  prompterWin.setAlwaysOnTop(true, 'screen-saver');
  prompterWin.loadFile(path.join(__dirname, 'windows/prompter/index.html'));
  prompterWin.on('closed', () => { prompterWin = null; });
}

function broadcast(channel, payload) {
  if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send(channel, payload);
  if (prompterWin && !prompterWin.isDestroyed()) prompterWin.webContents.send(channel, payload);
}

app.whenReady().then(() => {
  createEditorWindow();
  // Lance Vosk en arriere-plan (silencieux). N'attend pas — l'UI affiche l'etat.
  setTimeout(() => { ensureVoskRunning(); }, 800);
  ipcMain.handle('vosk:status', () => voskState);
  ipcMain.handle('vosk:retry', () => { ensureVoskRunning(); });

  // Serveur HTTP pour OBS Browser Source
  startHttpServer(HTTP_PORT);
  ipcMain.handle('http:port', () => httpServerPort);
  ipcMain.handle('camoverlay:open', (_e, query) => { createCamOverlayWindow(query || ''); return true; });
  ipcMain.handle('camoverlay:close', () => { if (camOverlayWin) camOverlayWin.close(); return true; });
  ipcMain.handle('camoverlay:set-on-top', (_e, on) => {
    if (camOverlayWin) camOverlayWin.setAlwaysOnTop(!!on, 'screen-saver');
    return !!on;
  });

  ipcMain.handle('prompter:open', () => { createPrompterWindow(); return true; });
  ipcMain.handle('prompter:close', () => { if (prompterWin) prompterWin.close(); return true; });
  ipcMain.handle('prompter:toggle-on-top', (_e, on) => {
    if (prompterWin) prompterWin.setAlwaysOnTop(!!on, 'screen-saver');
    return !!on;
  });
  ipcMain.handle('prompter:set-opacity', (_e, value) => {
    if (prompterWin) prompterWin.setOpacity(Math.max(0.1, Math.min(1, value)));
    return value;
  });
  ipcMain.handle('prompter:set-ignore-mouse', (_e, on) => {
    if (prompterWin) prompterWin.setIgnoreMouseEvents(!!on, { forward: true });
    return !!on;
  });

  // Pont editor <-> prompter
  ipcMain.on('sync', (_e, payload) => broadcast('sync', payload));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createEditorWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { stopVosk(); stopHttpServer(); });
app.on('will-quit', () => { stopVosk(); stopHttpServer(); });
process.on('exit', () => { stopVosk(); stopHttpServer(); });
