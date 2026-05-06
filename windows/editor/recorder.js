// MediaRecorder wrapper : audio / video / screen
export class Recorder {
  constructor({ onStatus, onPreview } = {}) {
    this.onStatus = onStatus || (() => {});
    this.onPreview = onPreview || (() => {});
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.kind = null;
  }

  async start(kind = 'audio', { videoDeviceId, audioDeviceId } = {}) {
    if (this.recorder) return;
    this.kind = kind;
    this.chunks = [];
    let stream;
    const audio = audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true;
    try {
      if (kind === 'audio') {
        stream = await navigator.mediaDevices.getUserMedia({ audio });
      } else if (kind === 'video') {
        const video = videoDeviceId
          ? { deviceId: { exact: videoDeviceId }, width: 1280, height: 720 }
          : { width: 1280, height: 720 };
        stream = await navigator.mediaDevices.getUserMedia({ audio, video });
      } else if (kind === 'screen') {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      }
    } catch (e) {
      this.onStatus('Acces refuse: ' + e.message, 'err');
      return;
    }
    this.stream = stream;
    this.onPreview(stream, kind);

    const mime = pickMime(kind);
    const rec = new MediaRecorder(stream, { mimeType: mime });
    rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    rec.onstop = () => this._finish(mime);
    rec.start(1000);
    this.recorder = rec;
    this.onStatus('Enregistrement…', 'ok');
  }

  stop() {
    if (!this.recorder) return;
    try { this.recorder.stop(); } catch {}
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
    }
  }

  _finish(mime) {
    const blob = new Blob(this.chunks, { type: mime });
    const ext = mime.includes('webm') ? 'webm' : (mime.includes('mp4') ? 'mp4' : 'bin');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `novaprompter-${this.kind}-${ts}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.onStatus('Fichier exporte: ' + a.download, 'ok');
    this.onPreview(null, this.kind);
  }
}

function pickMime(kind) {
  const candidates = kind === 'audio'
    ? ['audio/webm;codecs=opus', 'audio/webm']
    : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const c of candidates) if (MediaRecorder.isTypeSupported(c)) return c;
  return candidates[candidates.length - 1];
}
