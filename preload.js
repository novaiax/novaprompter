const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nova', {
  openPrompter: () => ipcRenderer.invoke('prompter:open'),
  closePrompter: () => ipcRenderer.invoke('prompter:close'),
  setAlwaysOnTop: (on) => ipcRenderer.invoke('prompter:toggle-on-top', on),
  setOpacity: (v) => ipcRenderer.invoke('prompter:set-opacity', v),
  setIgnoreMouse: (on) => ipcRenderer.invoke('prompter:set-ignore-mouse', on),
  // Sync state entre fenetres
  send: (payload) => ipcRenderer.send('sync', payload),
  onSync: (cb) => {
    const h = (_e, payload) => cb(payload);
    ipcRenderer.on('sync', h);
    return () => ipcRenderer.removeListener('sync', h);
  },
  // Vosk lifecycle
  voskStatus: () => ipcRenderer.invoke('vosk:status'),
  voskRetry: () => ipcRenderer.invoke('vosk:retry'),
  onVoskState: (cb) => {
    const h = (_e, payload) => cb(payload);
    ipcRenderer.on('vosk:state', h);
    return () => ipcRenderer.removeListener('vosk:state', h);
  },
  // Serveur HTTP local (pour OBS Browser Source)
  httpPort: () => ipcRenderer.invoke('http:port'),
  onHttpReady: (cb) => {
    const h = (_e, payload) => cb(payload);
    ipcRenderer.on('http:ready', h);
    return () => ipcRenderer.removeListener('http:ready', h);
  },
  // Fenetre Cam Overlay (petite, deplacable, always-on-top, focus line, mirror selfie)
  camOverlayOpen: (query) => ipcRenderer.invoke('camoverlay:open', query),
  camOverlayClose: () => ipcRenderer.invoke('camoverlay:close'),
  camOverlaySetOnTop: (on) => ipcRenderer.invoke('camoverlay:set-on-top', on)
});
