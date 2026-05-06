// Wrapper OBS WebSocket v5 (utilise la lib ESM via node_modules)
// On charge dynamiquement pour eviter de bloquer si la lib manque.

let OBSWebSocketCtor = null;

async function loadLib() {
  if (OBSWebSocketCtor) return OBSWebSocketCtor;
  try {
    const mod = await import('../../node_modules/obs-websocket-js/dist/json.js');
    OBSWebSocketCtor = mod.default || mod.OBSWebSocket;
    return OBSWebSocketCtor;
  } catch (e) {
    throw new Error('obs-websocket-js non installe. Lance `npm install` puis relance.');
  }
}

export class OBSClient {
  constructor({ onStatus } = {}) {
    this.onStatus = onStatus || (() => {});
    this.obs = null;
    this.connected = false;
  }

  async connect(url, password) {
    const Ctor = await loadLib();
    if (this.obs) await this.disconnect();
    this.obs = new Ctor();
    try {
      await this.obs.connect(url, password || undefined);
      this.connected = true;
      this.onStatus('Connecte', 'ok');
      this.obs.on('ConnectionClosed', () => {
        this.connected = false;
        this.onStatus('Deconnecte', 'warn');
      });
      return true;
    } catch (e) {
      this.connected = false;
      this.onStatus('Echec: ' + (e.message || e), 'err');
      throw e;
    }
  }

  async disconnect() {
    if (!this.obs) return;
    try { await this.obs.disconnect(); } catch {}
    this.obs = null;
    this.connected = false;
  }

  async listScenes() {
    if (!this.connected) return [];
    const res = await this.obs.call('GetSceneList');
    return (res.scenes || []).map(s => s.sceneName).reverse();
  }

  async setScene(name) {
    if (!this.connected) return;
    await this.obs.call('SetCurrentProgramScene', { sceneName: name });
  }

  async toggleRecord() {
    if (!this.connected) return;
    const status = await this.obs.call('GetRecordStatus');
    if (status.outputActive) {
      await this.obs.call('StopRecord');
      this.onStatus('Record stop', 'ok');
    } else {
      await this.obs.call('StartRecord');
      this.onStatus('Record start', 'ok');
    }
  }

  async startRecord() {
    if (!this.connected) return;
    const status = await this.obs.call('GetRecordStatus');
    if (!status.outputActive) await this.obs.call('StartRecord');
  }
}
