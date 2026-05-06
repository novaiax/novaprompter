// NovaPrompter API — sync server (Postgres via pg)
// Stack : Node + Express + bcryptjs + jsonwebtoken + pg

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'novaprompter-dev-secret-CHANGE-IN-PROD';
// On accepte plusieurs noms de var standard Railway/Heroku/Render
const DATABASE_URL = process.env.DATABASE_URL
  || process.env.DATABASE_PUBLIC_URL
  || process.env.POSTGRES_URL
  || process.env.PG_URL;

if (!DATABASE_URL) {
  console.warn('[!] Aucune URL Postgres trouvee (DATABASE_URL / DATABASE_PUBLIC_URL / POSTGRES_URL / PG_URL).');
  console.warn('    Sur Railway : ajoute un service Postgres au meme projet et reference DATABASE_URL.');
} else {
  // Masque le password dans les logs
  const masked = DATABASE_URL.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1***$2');
  console.log('[*] DB URL :', masked);
}

// SSL en prod (Railway), pas en local
const ssl = process.env.NODE_ENV === 'production' || /railway|render|heroku/i.test(DATABASE_URL || '')
  ? { rejectUnauthorized: false }
  : false;

const pool = new Pool({ connectionString: DATABASE_URL, ssl, max: 10 });

// ----- Schema init -----
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scripts (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      updated_at BIGINT NOT NULL,
      deleted BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (user_id, id)
    );
    CREATE TABLE IF NOT EXISTS user_tags (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      tags_json TEXT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      settings_json TEXT NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);
  console.log('[*] Schema OK');
}

// ----- Express -----
const app = express();
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '5mb' }));

app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t}ms`));
  next();
});

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
}
function makeToken(user) {
  return jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn: '90d' });
}

// ----- Health -----
app.get('/', async (_req, res) => {
  let users = -1;
  try { const r = await pool.query('SELECT COUNT(*) FROM users'); users = parseInt(r.rows[0].count, 10); } catch {}
  res.json({ name: 'NovaPrompter API', status: 'ok', users, time: new Date().toISOString() });
});
// Healthcheck Railway : toujours 200 si le serveur Node est UP.
// Le statut DB est dans la réponse mais ne fait pas échouer le healthcheck
// (sinon Railway tue le deploy avant que tu puisses ajouter Postgres).
app.get('/health', async (_req, res) => {
  let db = false;
  try { await pool.query('SELECT 1'); db = true; } catch {}
  res.json({ ok: true, db, hasDbUrl: !!DATABASE_URL });
});

// ----- Auth -----
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email + password requis' });
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6)' });
    const e = String(email).toLowerCase().trim();
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [e]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email deja utilise' });
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      'INSERT INTO users (email, password_hash, created_at) VALUES ($1, $2, $3) RETURNING id',
      [e, hash, Date.now()]
    );
    res.json({ token: makeToken({ id: r.rows[0].id, email: e }), email: e });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email + password requis' });
    const e = String(email).toLowerCase().trim();
    const r = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [e]);
    if (!r.rows.length) return res.status(401).json({ error: 'Identifiants invalides' });
    const ok = await bcrypt.compare(password, r.rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Identifiants invalides' });
    res.json({ token: makeToken({ id: r.rows[0].id, email: e }), email: e });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/me', authMiddleware, (req, res) => res.json({ email: req.user.email }));

// ----- Sync -----
app.post('/sync', authMiddleware, async (req, res) => {
  const uid = req.user.uid;
  const { scripts: incoming = [], tags = null, settings = null } = req.body || {};
  const now = Date.now();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert scripts (last-write-wins par updated_at)
    for (const s of incoming) {
      if (!s || !s.id) continue;
      await client.query(`
        INSERT INTO scripts (user_id, id, title, content, updated_at, deleted)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, id) DO UPDATE SET
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          updated_at = EXCLUDED.updated_at,
          deleted = EXCLUDED.deleted
        WHERE EXCLUDED.updated_at > scripts.updated_at
      `, [uid, String(s.id), String(s.title || ''), String(s.content || ''), Number(s.updatedAt || now), !!s.deleted]);
    }

    if (tags) {
      await client.query(`
        INSERT INTO user_tags (user_id, tags_json, updated_at) VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET tags_json = EXCLUDED.tags_json, updated_at = EXCLUDED.updated_at
      `, [uid, JSON.stringify(tags), now]);
    }
    if (settings) {
      await client.query(`
        INSERT INTO user_settings (user_id, settings_json, updated_at) VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET settings_json = EXCLUDED.settings_json, updated_at = EXCLUDED.updated_at
      `, [uid, JSON.stringify(settings), now]);
    }

    const allScripts = await client.query(
      'SELECT id, title, content, updated_at FROM scripts WHERE user_id = $1 AND deleted = false',
      [uid]
    );
    const tagsRow = await client.query('SELECT tags_json FROM user_tags WHERE user_id = $1', [uid]);
    const setRow = await client.query('SELECT settings_json FROM user_settings WHERE user_id = $1', [uid]);

    await client.query('COMMIT');

    res.json({
      scripts: allScripts.rows.map(s => ({ id: s.id, title: s.title, content: s.content, updatedAt: Number(s.updated_at) })),
      tags: tagsRow.rows[0] ? JSON.parse(tagsRow.rows[0].tags_json) : null,
      settings: setRow.rows[0] ? JSON.parse(setRow.rows[0].settings_json) : null,
      serverTime: now
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('sync error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.delete('/scripts/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'UPDATE scripts SET deleted = true, updated_at = $1 WHERE user_id = $2 AND id = $3',
      [Date.now(), req.user.uid, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

initSchema().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NovaPrompter API listening on 0.0.0.0:${PORT}`);
  });
}).catch(err => {
  console.error('Schema init failed:', err);
  // On lance quand même le serveur, /health renverra 503
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NovaPrompter API (DB DOWN) on 0.0.0.0:${PORT}`);
  });
});
