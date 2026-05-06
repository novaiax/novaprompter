// NovaPrompter API — sync server pour mobile + desktop
// Stack : Node + Express + SQLite + JWT
// Deploy : Railway (auto-detecte Node)

const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'novaprompter-dev-secret-CHANGE-IN-PROD';
const DATA_DIR = process.env.DATA_DIR || (process.env.RAILWAY_VOLUME_MOUNT_PATH || '.');
const DB_PATH = path.join(DATA_DIR, 'novaprompter.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scripts (
    id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS user_tags (
    user_id INTEGER PRIMARY KEY,
    tags_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY,
    settings_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

const app = express();
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '5mb' }));

// Logging minimal
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t}ms`);
  });
  next();
});

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token invalide' });
  }
}

function makeToken(user) {
  return jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn: '90d' });
}

// ----- Health check -----
app.get('/', (_req, res) => {
  res.json({ name: 'NovaPrompter API', status: 'ok', time: new Date().toISOString() });
});
app.get('/health', (_req, res) => res.json({ ok: true }));

// ----- Auth -----
app.post('/auth/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email + password requis' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6 caracteres)' });
  const e = String(email).toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(e);
  if (existing) return res.status(409).json({ error: 'Email deja utilise — connecte-toi' });
  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)').run(e, hash, Date.now());
  const user = { id: info.lastInsertRowid, email: e };
  res.json({ token: makeToken(user), email: e });
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email + password requis' });
  const e = String(email).toLowerCase().trim();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(e);
  if (!user) return res.status(401).json({ error: 'Identifiants invalides' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Identifiants invalides' });
  res.json({ token: makeToken(user), email: e });
});

app.get('/me', authMiddleware, (req, res) => {
  res.json({ email: req.user.email });
});

// ----- Sync : push + pull en un appel -----
// Envoi : { scripts: [...], tags: [...], settings: {...} }
// Retour : { scripts: <liste fusionnee>, tags: <derniers connus>, settings: <derniers connus> }
app.post('/sync', authMiddleware, (req, res) => {
  const uid = req.user.uid;
  const { scripts: incoming = [], tags = null, settings = null } = req.body || {};
  const now = Date.now();

  // Upsert des scripts entrants
  const upsert = db.prepare(`
    INSERT INTO scripts (id, user_id, title, content, updated_at, deleted)
    VALUES (@id, @uid, @title, @content, @updated_at, @deleted)
    ON CONFLICT(id, user_id) DO UPDATE SET
      title = excluded.title,
      content = excluded.content,
      updated_at = excluded.updated_at,
      deleted = excluded.deleted
    WHERE excluded.updated_at > scripts.updated_at
  `);
  const tx = db.transaction((items) => {
    for (const s of items) {
      if (!s || !s.id) continue;
      upsert.run({
        id: String(s.id),
        uid,
        title: String(s.title || ''),
        content: String(s.content || ''),
        updated_at: Number(s.updatedAt || now),
        deleted: s.deleted ? 1 : 0
      });
    }
  });
  tx(incoming);

  // Tags : on prend les plus recents (envoyes ou stockes)
  if (tags) {
    db.prepare(`
      INSERT INTO user_tags (user_id, tags_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET tags_json = excluded.tags_json, updated_at = excluded.updated_at
    `).run(uid, JSON.stringify(tags), now);
  }
  if (settings) {
    db.prepare(`
      INSERT INTO user_settings (user_id, settings_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at
    `).run(uid, JSON.stringify(settings), now);
  }

  // Pull : retourne tous les scripts de l'utilisateur
  const allScripts = db.prepare('SELECT id, title, content, updated_at, deleted FROM scripts WHERE user_id = ? AND deleted = 0').all(uid);
  const tagsRow = db.prepare('SELECT tags_json FROM user_tags WHERE user_id = ?').get(uid);
  const setRow = db.prepare('SELECT settings_json FROM user_settings WHERE user_id = ?').get(uid);

  res.json({
    scripts: allScripts.map(s => ({ id: s.id, title: s.title, content: s.content, updatedAt: s.updated_at })),
    tags: tagsRow ? JSON.parse(tagsRow.tags_json) : null,
    settings: setRow ? JSON.parse(setRow.settings_json) : null,
    serverTime: now
  });
});

// ----- Delete script -----
app.delete('/scripts/:id', authMiddleware, (req, res) => {
  const uid = req.user.uid;
  const id = req.params.id;
  db.prepare('UPDATE scripts SET deleted = 1, updated_at = ? WHERE id = ? AND user_id = ?').run(Date.now(), id, uid);
  res.json({ ok: true });
});

// ----- 404 -----
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`NovaPrompter API listening on :${PORT}`);
  console.log(`DB: ${DB_PATH}`);
});
