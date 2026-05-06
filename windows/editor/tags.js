// Gestion des balises personnalisables.
const TAGS_KEY = 'novaprompter:tags';

export const DEFAULT_TAGS = [
  { id: 't_souffle', name: 'souffle', label: '🌬 RESPIRE', color: '#ff7a3a', bgColor: '#2a1010', fontSize: 1.1, pause: 1.5 },
  { id: 't_pause',   name: 'pause',   label: '⏸ PAUSE',    color: '#ffd000', bgColor: '#2a2010', fontSize: 1.1, pause: 1.0 },
  { id: 't_regard',  name: 'regard',  label: '👀 CAM',     color: '#4ad295', bgColor: '#102a1c', fontSize: 1.0, pause: 0   },
  { id: 't_emph',    name: 'emph',    label: '⚡',          color: '#ff5050', bgColor: 'transparent', fontSize: 1.4, pause: 0 }
];

export function loadTags() {
  try {
    const raw = localStorage.getItem(TAGS_KEY);
    if (!raw) {
      saveTags(DEFAULT_TAGS);
      return [...DEFAULT_TAGS];
    }
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [...DEFAULT_TAGS];
  } catch {
    return [...DEFAULT_TAGS];
  }
}

export function saveTags(tags) {
  localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
}

export function newTag(partial = {}) {
  return {
    id: 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: partial.name || 'tag',
    label: partial.label || 'TAG',
    color: partial.color || '#ff5b3a',
    bgColor: partial.bgColor || 'transparent',
    fontSize: partial.fontSize ?? 1.0,
    pause: partial.pause ?? 0
  };
}

// Sanitize : un nom de balise doit etre [a-z0-9-_] sans espace
export function sanitizeName(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '').slice(0, 24) || 'tag';
}

// Strip les balises connues d'un texte (pour le voice tracker)
export function stripTags(text, tagNames) {
  if (!text || !tagNames || !tagNames.length) return text;
  const escaped = tagNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp('\\[(' + escaped.join('|') + ')\\]', 'g');
  return text.replace(re, ' ');
}
