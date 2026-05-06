// Voice tracking via Vosk WebSocket (D:/code/outil code/vosk).
// API identique a VoiceTracker pour drop-in replacement.

const normalize = (s) => s
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9' ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export function tokenize(text) {
  return normalize(text).split(' ').filter(Boolean);
}

export class VoskTracker {
  constructor({ onProgress, onTranscript, onStatus, url } = {}) {
    this.onProgress = onProgress || (() => {});
    this.onTranscript = onTranscript || (() => {});
    this.onStatus = onStatus || (() => {});
    this.url = url || 'ws://127.0.0.1:2700';
    this.ws = null;
    this.audioCtx = null;
    this.mediaStream = null;
    this.workletNode = null;
    this.sourceNode = null;
    this.scriptTokens = [];
    this.idx = 0;
    this.tagNames = [];   // noms des balises a strip avant tokenization
    this.running = false;
    this._stopping = false;
    // Parametres alignement (equilibre precision/tolerance)
    this.tailSize = 6;          // nombre de mots prononces consideres
    this.searchForward = 12;    // mots a chercher devant
    this.searchBack = 1;        // ne revient quasi jamais en arriere
    this.minScore = 0.5;        // score min pour accepter un alignement
    this.minConsec = 2;         // au moins 2 mots consecutifs matches
    this.ambigGap = 0.15;       // detecte ambiguite si scores trop proches
    this.gapTolerance = 1;      // Vosk peut louper 1 mot sans casser l'alignement
    this.maxGapTotal = 2;       // mais pas plus de 2 mots loupes au total dans le tail
  }

  setScript(text) {
    this.scriptTokens = tokenize(stripKnownTags(text, this.tagNames));
    this.idx = 0;
    this._sendGrammar();
  }

  setTags(names) {
    this.tagNames = Array.isArray(names) ? names : [];
  }

  // Contraint Vosk au vocabulaire du script -> reconnaissance quasi parfaite
  _sendGrammar() {
    if (!this.ws || this.ws.readyState !== 1) return;
    if (!this.scriptTokens.length) {
      try { this.ws.send(JSON.stringify({ cmd: 'grammar', phrases: [] })); } catch {}
      return;
    }
    // Une seule "phrase" qui contient tous les mots du script -> Vosk peut
    // reconnaitre toute combinaison/sous-sequence de ces mots.
    // On dedup pour reduire la taille de la grammaire.
    const uniqueWords = [...new Set(this.scriptTokens)].join(' ');
    const phrases = [uniqueWords, '[unk]'];
    try { this.ws.send(JSON.stringify({ cmd: 'grammar', phrases })); } catch {}
  }

  setIndex(i) {
    this.idx = Math.max(0, Math.min(this.scriptTokens.length, i));
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify({ cmd: 'reset' })); } catch {}
    }
  }

  async start() {
    if (this.running) return true;
    this._stopping = false;
    this.onStatus('Connexion Vosk…', '');

    try {
      // 1) WebSocket vers le serveur Python
      const ws = new WebSocket(this.url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      await new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('Timeout connexion (serveur Vosk lance ?)')), 4000);
        ws.onopen = () => { clearTimeout(to); resolve(); };
        ws.onerror = () => { clearTimeout(to); reject(new Error('Connexion echouee — lance start.bat dans D:/code/outil code/vosk')); };
      });

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'final') {
            const t = msg.text || '';
            if (t) {
              this.onTranscript(t);
              // Avec la grammaire active, le final est extremement fiable.
              // On utilise les `words` (avec timestamps) si dispo pour un alignement strict.
              if (Array.isArray(msg.words) && msg.words.length) {
                this.advanceFinal(msg.words);
              } else {
                this.advance(t, true);
              }
            }
          } else if (msg.type === 'partial') {
            const t = msg.text || '';
            if (t) {
              this.onTranscript(t);
              this.advance(t, false);
            }
          }
        } catch {}
      };
      ws.onclose = () => {
        if (!this._stopping) this.onStatus('Deconnecte', 'warn');
      };

      // 2) Capture audio
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
      this.mediaStream = stream;

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.audioCtx = ctx;
      const sampleRate = ctx.sampleRate;

      // 3) Indique le sample rate au serveur, puis envoie la grammaire (script)
      ws.send(JSON.stringify({ cmd: 'config', sample_rate: Math.round(sampleRate) }));
      this._sendGrammar();

      // 4) AudioWorklet inline qui convertit float32 -> int16 PCM et envoie via port
      const workletCode = `
        class Pcm16 extends AudioWorkletProcessor {
          process(inputs) {
            const ch = inputs[0] && inputs[0][0];
            if (ch && ch.length) {
              const out = new Int16Array(ch.length);
              for (let i = 0; i < ch.length; i++) {
                let s = Math.max(-1, Math.min(1, ch[i]));
                out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }
              this.port.postMessage(out.buffer, [out.buffer]);
            }
            return true;
          }
        }
        registerProcessor('pcm16', Pcm16);
      `;
      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      const src = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'pcm16');
      node.port.onmessage = (ev) => {
        if (this.ws && this.ws.readyState === 1) {
          try { this.ws.send(ev.data); } catch {}
        }
      };
      src.connect(node);
      // pas besoin de connecter a destination : AudioWorklet tourne meme sans

      this.sourceNode = src;
      this.workletNode = node;
      this.running = true;
      this.onStatus('Ecoute (Vosk ' + Math.round(sampleRate) + ' Hz)', 'ok');
      return true;
    } catch (e) {
      this.onStatus('Erreur: ' + (e.message || e), 'err');
      this.stop();
      return false;
    }
  }

  stop() {
    this._stopping = true;
    this.running = false;
    if (this.workletNode) try { this.workletNode.disconnect(); } catch {}
    if (this.sourceNode) try { this.sourceNode.disconnect(); } catch {}
    if (this.mediaStream) try { this.mediaStream.getTracks().forEach(t => t.stop()); } catch {}
    if (this.audioCtx) try { this.audioCtx.close(); } catch {}
    if (this.ws) try { this.ws.close(); } catch {}
    this.workletNode = null;
    this.sourceNode = null;
    this.mediaStream = null;
    this.audioCtx = null;
    this.ws = null;
    this.onStatus('Inactif', '');
  }

  // Pour compat avec l'API Web Speech (lang)
  set lang(v) { /* gere cote serveur via le modele FR */ }
  get lang() { return 'fr-FR'; }

  // Alignement par bloc avec :
  //  - first-fit forward : on prend la PREMIERE position acceptable depuis l'idx
  //    (au lieu du best score global) -> ne saute pas par-dessus une occurrence
  //  - detection d'ambiguite : si 2+ positions matchent similaire, on attend
  //  - searchBack tres faible : on ne revient quasi pas en arriere
  advance(heardText, _isFinal) {
    const heard = tokenize(heardText);
    if (!heard.length || !this.scriptTokens.length) return;

    const tail = heard.slice(-Math.min(this.tailSize, heard.length));
    if (tail.length < 2) return; // pas assez de contexte pour decider

    const minStart = Math.max(0, this.idx - this.searchBack);
    const maxStart = Math.min(this.scriptTokens.length - 1, this.idx + this.searchForward);

    const candidates = []; // {start, end, score, ratio, maxConsec}

    for (let start = minStart; start <= maxStart; start++) {
      let matches = 0;
      let consec = 0;
      let maxConsec = 0;
      let lastMatchPos = -2;
      let lastMatchScript = -1;
      let scriptOffset = 0;
      let gapUsed = 0;

      for (let i = 0; i < tail.length; i++) {
        const allowedGap = Math.min(this.gapTolerance, this.maxGapTotal - gapUsed);
        for (let off = 0; off <= allowedGap; off++) {
          const sIdx = start + i + scriptOffset + off;
          if (sIdx >= this.scriptTokens.length) break;
          if (matchWord(this.scriptTokens[sIdx], tail[i])) {
            matches++;
            consec = (lastMatchPos === i - 1) ? consec + 1 : 1;
            if (consec > maxConsec) maxConsec = consec;
            lastMatchPos = i;
            lastMatchScript = sIdx;
            scriptOffset += off;
            gapUsed += off;
            break;
          }
        }
      }

      const ratio = matches / tail.length;
      if (ratio < this.minScore) continue;
      if (maxConsec < this.minConsec) continue;

      const consecBonus = maxConsec >= 4 ? 0.30 : maxConsec >= 3 ? 0.18 : 0.05;
      const distancePenalty = Math.min(0.5, Math.abs(start - this.idx) * 0.04);
      const score = ratio + consecBonus - distancePenalty;

      const endIdx = lastMatchScript + 1;
      candidates.push({ start, end: endIdx, score, ratio, maxConsec });
    }

    if (!candidates.length) return;

    // First-fit : trie par distance a idx, prend le PREMIER acceptable
    candidates.sort((a, b) => Math.abs(a.start - this.idx) - Math.abs(b.start - this.idx));
    const first = candidates[0];

    // Detection d'ambiguite : si une autre position a un score similaire
    // ET est plus loin (donc differente occurrence du meme pattern), on attend
    let ambiguous = false;
    for (let i = 1; i < candidates.length; i++) {
      const other = candidates[i];
      if (Math.abs(other.score - first.score) < this.ambigGap
          && Math.abs(other.start - first.start) >= 3) {
        ambiguous = true;
        break;
      }
    }
    if (ambiguous) return; // on attend plus de contexte

    if (first.end > this.idx) {
      // Avance max = nombre de mots VRAIMENT matches + 1 (pas tail.length entier).
      // Empeche les sauts si seulement 2-3 mots ont matche.
      const maxJump = Math.max(2, Math.min(tail.length, Math.floor((first.maxConsec || 0) + 2)));
      this.idx = Math.min(first.end, this.idx + maxJump);
      const ratio = this.idx / this.scriptTokens.length;
      this.onProgress(ratio, this.idx, this.scriptTokens.length);
    }
  }

  // Alignement strict sur le final Vosk : on a la sequence exacte des mots dits
  // (avec timestamps). Avec la grammaire active, ces mots sont quasi-tous
  // dans le script -> alignement optimal Needleman-Wunsch sur la fenetre courante.
  advanceFinal(words) {
    if (!words || !words.length || !this.scriptTokens.length) return;
    const heard = words.map(w => normalize((w.word || '').toLowerCase())).filter(Boolean);
    if (!heard.length) return;

    // Fenetre de recherche dans le script : [idx-1, idx + heard.length + 8]
    const start = Math.max(0, this.idx - 1);
    const end = Math.min(this.scriptTokens.length, this.idx + heard.length + 8);
    const window = this.scriptTokens.slice(start, end);
    if (!window.length) return;

    // Alignement local : trouve la meilleure sous-sequence consecutive
    // qui matche heard[0..k] avec window[a..b], k maximal.
    // Approche simple : parcours toutes les positions de start de window,
    // on aligne heard contre window avec gap penalty.
    let bestEnd = -1;     // index dans this.scriptTokens
    let bestScore = -Infinity;

    for (let s = 0; s < window.length; s++) {
      // Aligne heard[0..] avec window[s..]
      let i = 0, j = s, matched = 0, gaps = 0, lastJ = s - 1;
      while (i < heard.length && j < window.length) {
        if (matchWord(window[j], heard[i])) {
          matched++; i++; j++; lastJ = j - 1;
        } else {
          // Essaye de skip un mot dans heard (Vosk a ajoute un mot fantome)
          // ou skip un mot dans window (utilisateur a saute un mot du script)
          // On prend le moins penalisant
          if (j + 1 < window.length && matchWord(window[j + 1], heard[i])) {
            j++; gaps++;
          } else if (i + 1 < heard.length && matchWord(window[j], heard[i + 1])) {
            i++; gaps++;
          } else {
            i++; j++; gaps++;
          }
          if (gaps > 4) break; // trop d'erreurs, abandon
        }
      }
      const ratio = matched / heard.length;
      const score = matched - gaps * 0.5;
      if (matched >= 2 && ratio >= 0.4 && score > bestScore) {
        bestScore = score;
        bestEnd = start + lastJ + 1;
      }
    }

    if (bestEnd > this.idx) {
      this.idx = bestEnd;
      const ratio = this.idx / this.scriptTokens.length;
      this.onProgress(ratio, this.idx, this.scriptTokens.length);
    }
  }
}

function stripKnownTags(text, names) {
  if (!text || !names || !names.length) return text;
  const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return text.replace(new RegExp('\\[(' + escaped.join('|') + ')\\]', 'g'), ' ');
}

// Matching equilibre : strict sur mots courts, tolerant sur mots longs avec ancre prefixe.
function matchWord(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  // Mots tres courts (<=3) : EXACT only (le, la, et, un, ne, etc.)
  if (a.length <= 3 || b.length <= 3) return false;
  // Mots moyens (4-5 chars) : tolere prefix de 4 chars matche (ex: "porte"/"porter")
  if (a.length <= 5 && b.length <= 5) {
    const min = Math.min(a.length, b.length);
    return min >= 4 && a.slice(0, 4) === b.slice(0, 4);
  }
  // Mots longs (>=6 chars) : Levenshtein 1 SI prefixe 3 chars commun
  if (a.slice(0, 3) !== b.slice(0, 3)) return false;
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
