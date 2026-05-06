// Voice tracking: ecoute le micro et avance le pointeur sur le texte
// en mappant les mots reconnus aux mots du script via une fenetre glissante.

const normalize = (s) => s
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9' ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export function tokenize(text) {
  return normalize(text).split(' ').filter(Boolean);
}

export class VoiceTracker {
  constructor({ onProgress, onTranscript, onStatus, lang = 'fr-FR' } = {}) {
    this.onProgress = onProgress || (() => {});
    this.onTranscript = onTranscript || (() => {});
    this.onStatus = onStatus || (() => {});
    this.lang = lang;
    this.recognition = null;
    this.running = false;
    this.scriptTokens = [];
    this.idx = 0;
    this.window = 12; // chercher les prochains mots dans cette fenetre
  }

  setScript(text) {
    this.scriptTokens = tokenize(text);
    this.idx = 0;
  }

  setIndex(i) {
    this.idx = Math.max(0, Math.min(this.scriptTokens.length, i));
  }

  start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      this.onStatus('Web Speech API indisponible (utilise Chrome/Edge)', 'err');
      return false;
    }
    if (this.running) return true;
    const r = new SR();
    r.lang = this.lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onstart = () => { this.running = true; this.onStatus('Ecoute…', 'ok'); };
    r.onerror = (e) => { this.onStatus('Erreur: ' + e.error, 'err'); };
    r.onend = () => {
      // auto-restart si on est cense tourner
      if (this.running) {
        try { r.start(); } catch {}
      } else {
        this.onStatus('Inactif', '');
      }
    };
    r.onresult = (event) => {
      let interim = '';
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalChunk += ' ' + res[0].transcript;
        else interim += ' ' + res[0].transcript;
      }
      const heard = (finalChunk + ' ' + interim).trim();
      if (heard) {
        this.onTranscript(heard);
        this.advance(heard);
      }
    };

    this.recognition = r;
    try { r.start(); return true; } catch (e) { this.onStatus('Start failed: ' + e.message, 'err'); return false; }
  }

  stop() {
    this.running = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch {}
      this.recognition = null;
    }
    this.onStatus('Inactif', '');
  }

  // Avance l'index en cherchant les mots entendus dans la fenetre [idx, idx+window]
  advance(heardText) {
    const heard = tokenize(heardText);
    if (!heard.length || !this.scriptTokens.length) return;

    // On ne traite que la queue du transcript (les derniers mots dits)
    const tail = heard.slice(-Math.min(8, heard.length));
    let cursor = this.idx;
    for (const word of tail) {
      const upTo = Math.min(this.scriptTokens.length, cursor + this.window);
      let found = -1;
      for (let i = cursor; i < upTo; i++) {
        if (matchWord(this.scriptTokens[i], word)) { found = i; break; }
      }
      if (found !== -1) cursor = found + 1;
    }
    if (cursor > this.idx) {
      this.idx = cursor;
      const ratio = this.scriptTokens.length ? (this.idx / this.scriptTokens.length) : 0;
      this.onProgress(ratio, this.idx, this.scriptTokens.length);
    }
  }
}

function matchWord(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return a.startsWith(b) || b.startsWith(a);
  // tolere une edit-distance de 1 sur les mots plus longs
  return levenshteinAtMost(a, b, 1);
}

function levenshteinAtMost(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return false;
  let prev = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    const curr = new Array(lb + 1);
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return false;
    prev = curr;
  }
  return prev[lb] <= max;
}
