# NovaPrompter API — Backend Sync

Mini-API Node + Express + SQLite pour synchroniser les scripts NovaPrompter entre tous tes appareils (mobile, desktop).

## Architecture

- **Auth** par email + mot de passe (bcrypt + JWT 90 jours)
- **Storage** SQLite (un seul fichier `novaprompter.db`, persiste entre redeploys via Railway Volume)
- **Endpoints** :
  - `POST /auth/register` `{email, password}` → `{token, email}`
  - `POST /auth/login` `{email, password}` → `{token, email}`
  - `GET /me` (auth) → `{email}`
  - `POST /sync` (auth) `{scripts, tags, settings}` → `{scripts, tags, settings}` (push + pull en un appel)
  - `DELETE /scripts/:id` (auth) → soft delete

## Deployer sur Railway (5 min)

### 1. Crée un repo Git séparé pour ce dossier
```bash
cd backend
git init
git add .
git commit -m "Initial NovaPrompter API"
gh repo create novaprompter-api --private --source=. --push
# ou : push manuellement sur GitHub
```

### 2. Sur Railway
1. Va sur [railway.com](https://railway.com), connecte-toi avec GitHub
2. **New Project** → **Deploy from GitHub repo** → choisis `novaprompter-api`
3. Railway détecte Node automatiquement et lance `npm install` + `npm start`
4. **Settings** → **Networking** → **Generate Domain** → tu obtiens une URL type `novaprompter-api.up.railway.app`
5. **Settings** → **Variables** → ajoute :
   - `JWT_SECRET` = une string longue aléatoire (ex : `openssl rand -hex 32`)
6. (Optionnel mais **recommandé** pour persister la DB entre redeploys) :
   - **Settings** → **Volumes** → **+ New Volume** → mount path `/data`
   - Variable d'env : `DATA_DIR` = `/data`

### 3. Utilise dans NovaPrompter mobile
- Ouvre les **Réglages** (⚙)
- Section **Synchronisation**
- Serveur : `https://novaprompter-api.up.railway.app` (l'URL que Railway t'a donnée)
- Email + mot de passe → **Créer un compte**
- Tes scripts sont push/pull à chaque sync (auto au démarrage si connecté)

### 4. Coté desktop Electron
(à intégrer dans la version Electron : même endpoints, même logique. Voir `mobile/app.js` section SYNC pour copier la logique.)

## Test local

```bash
cd backend
npm install
npm start
# API sur http://localhost:3000
```

Test rapide :
```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"hellohello"}'

# → { "token": "...", "email": "test@example.com" }

# Sync (avec token)
TOKEN="...token..."
curl -X POST http://localhost:3000/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scripts":[{"id":"s_1","title":"Test","content":"Hello","updatedAt":1234567890}]}'
```

## Sécurité

- Mots de passe **hashés** avec bcrypt (10 rounds)
- Tokens JWT signés avec `JWT_SECRET` (à changer en prod)
- CORS ouvert (l'API est consultée depuis browser, multi-domaine)
- Rate limiting **non inclus** — si tu veux exposer publiquement, ajoute `express-rate-limit`

## Stockage

- SQLite dans `$DATA_DIR/novaprompter.db` (par défaut courant `.`, mieux : Railway Volume sur `/data`)
- Si tu n'utilises pas de Volume, la DB est **perdue à chaque redeploy** sur Railway
- Format des scripts : `{id, title, content, updatedAt, deleted}`
- Conflit : c'est le `updatedAt` le plus récent qui gagne (last write wins)

## Limites actuelles

- Pas de partage de scripts entre utilisateurs
- Pas de versionning ni d'historique
- Pas de notifications push
- DB SQLite pas idéale pour 1000+ utilisateurs (passer à Postgres si besoin)
