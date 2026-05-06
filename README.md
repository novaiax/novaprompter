# NovaPrompter

Téléprompteur pro multi-plateforme avec voice tracking, scripts illimités, balises personnalisables, et synchronisation cloud.

## Composants

```
NovaPrompter/
├── main.js, preload.js, package.json   ← Application desktop Electron (Windows/Mac/Linux)
├── windows/
│   ├── editor/         Fenêtre éditeur (scripts + contrôles)
│   ├── prompter/       Fenêtre prompter détachable, always-on-top
│   └── cam-blur/       Fenêtre caméra séparée avec segmentation MediaPipe
├── mobile/             Web app PWA déployable sur n'importe quel hosting statique
└── backend/            API REST Node + SQLite pour synchroniser scripts entre appareils
```

## Features

### Desktop (Electron)
- 2 modes de défilement : **Auto** (vitesse réglable) et **Voice** (suit ta voix via Vosk offline)
- Fenêtres séparées pour éditeur, prompter, caméra
- Modal Réglages avec 7 onglets (Apparence, Prompter, Cam/Micro, Balises, Voice, Enregistrement, OBS)
- Polices anti-bégaiement (Lexend, Atkinson Hyperlegible, Nunito, Source Sans 3)
- Themes (5 presets + custom color pickers)
- Mirror H/V pour téléprompteur physique à miroir
- Multi-caméra et multi-micro avec sélecteurs
- Segmented background blur (sujet net + fond flou) via MediaPipe Selfie Segmentation
- Enregistrement local audio/vidéo/écran (MediaRecorder → .webm)
- OBS WebSocket : connect, scene switch, toggle record, GO combo
- Balises personnalisables avec pause auto en mode auto
- Auto-sauvegarde des réglages et scripts (localStorage)
- Raccourcis clavier compatibles télécommandes Bluetooth

### Mobile (PWA)
- Web app installable iOS/Android
- Toutes les options desktop (themes, polices, balises éditables, mirror, sync)
- Wake Lock (empêche l'écran de s'éteindre)
- Plein écran immersif
- Swipe vertical pour scroll manuel, double-tap pour play/pause
- Voice via Web Speech API (Chrome Android)
- Service Worker (fonctionne offline après 1ère visite)
- Export/Import scripts JSON

### Backend (Railway)
- API REST Node + Express + SQLite
- Auth bcrypt + JWT
- Endpoint `/sync` push+pull en un appel (last-write-wins)
- Déployable sur Railway en 5 min

## Quick start

### Desktop
```bash
npm install
npm start
```

### Mobile (test local)
```bash
cd mobile
python -m http.server 8080
# ouvre http://localhost:8080
```

### Backend (test local)
```bash
cd backend
npm install
npm start
# API sur http://localhost:3000
```

## Vosk (pour le mode Voice desktop)

Le serveur Vosk est dans un dépôt séparé : `D:/code/outil code/vosk/`. Il est auto-spawné par l'application Electron au démarrage. Voir le README du dossier vosk pour plus d'infos.

## Déploiement

- **Mobile** : upload du dossier `mobile/` sur n'importe quel hosting statique (Hostinger, Vercel, Netlify, Cloudflare Pages). Voir `mobile/README.md`.
- **Backend** : push sur GitHub, deploy Railway → générer domaine, ajouter Volume pour persister la DB. Voir `backend/README.md`.

## Licence

MIT
