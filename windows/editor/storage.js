const KEY = 'novaprompter:scripts';

export function loadAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}

export function saveAll(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function newScript(title = 'Sans titre', content = '') {
  return {
    id: 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title, content,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export function upsert(list, script) {
  const i = list.findIndex(s => s.id === script.id);
  script.updatedAt = Date.now();
  if (i === -1) list.unshift(script); else list[i] = script;
  saveAll(list);
  return list;
}

export function remove(list, id) {
  const out = list.filter(s => s.id !== id);
  saveAll(out);
  return out;
}
