# NovaPrompter Mobile

Web app mobile-first deployable sur n'importe quel hosting statique (`novaprompter.novaia.org` chez Hostinger ou autre).

100% local : aucun backend, aucune donnee envoyee. Tout est dans le `localStorage` du navigateur.

## Fonctionnalites

- **Multi-scripts** avec recherche, edition, autosave
- **Mode Auto** : defilement vitesse reglable (10-400 px/s), slider gros doigts
- **Mode Voice** : Web Speech API (Android Chrome/Edge), suivi de ta voix sur le texte
- **Balises** : `[souffle]`, `[pause]`, `[regard]` avec pause auto en mode auto
- **Themes** : 4 presets (blanc/noir, noir/blanc, sepia, jaune sur noir)
- **Polices anti-begaiement** : Lexend, Atkinson Hyperlegible, Nunito, Source Sans 3
- **Mirror H** pour prompteur a miroir physique
- **Wake Lock** : empeche l'ecran de s'eteindre pendant la lecture
- **Plein ecran** immersif
- **Swipe vertical** sur le prompter = scroll manuel (auto-pause 1.5s)
- **Double-tap** sur le prompter = play/pause
- **Tap simple** = toggle controles
- **PWA** : installable sur ecran d'accueil iOS/Android, fonctionne offline
- **Export/Import** des scripts au format JSON
- **Nettoyage Markdown** automatique (vire titres, timecodes, blockquotes)

## Compatibilite

| Plateforme | Mode Auto | Mode Voice | PWA installable |
|---|---|---|---|
| Android Chrome/Edge | ✓ | ✓ | ✓ |
| Android Firefox | ✓ | ✗ | ✓ |
| iOS Safari 16+ | ✓ | ✗ (pas Web Speech API) | ✓ |
| iOS Chrome | ✓ | ✗ (utilise WebKit) | ✗ (pas de PWA install sur iOS Chrome) |
| Desktop tous browsers | ✓ | ✓ (sauf Safari, Firefox limited) | ✓ |

Pour le mode Voice sur iOS, une future version pourra integrer Vosk-WASM.

## Deploiement sur novaprompter.novaia.org

### Option A — FTP / cPanel (Hostinger, OVH, etc.)
1. Connecte-toi a ton hosting (FTP ou file manager)
2. Upload tout le contenu du dossier `mobile/` dans le dossier du sous-domaine `novaprompter.novaia.org`
3. Verifie que `index.html` est a la racine
4. Verifie HTTPS active (necessaire pour Web Speech API et Wake Lock)

### Option B — Git push (Vercel, Netlify, Cloudflare Pages)
1. Initialise un repo git dans le dossier `mobile/`
2. Push sur GitHub
3. Connecte le repo a Vercel/Netlify/Cloudflare Pages
4. Build command : aucun (statique pur)
5. Output directory : `.` (racine)
6. Configure le domaine custom `novaprompter.novaia.org`

### Option C — Test local
```bash
cd mobile
python -m http.server 8080
# ou : npx http-server
```
Puis ouvre `http://localhost:8080` dans ton navigateur.

## Generer les icones PNG (optionnel)

Le manifest reference `icon-192.png` et `icon-512.png`. L'app fonctionne sans (utilise `icon.svg`), mais c'est mieux pour les vieux Android.

Tu peux les generer avec un outil en ligne (realfavicongenerator.net) a partir de `icon.svg`, ou avec ImageMagick :
```bash
magick icon.svg -resize 192x192 icon-192.png
magick icon.svg -resize 512x512 icon-512.png
```

## Stockage

Tout est dans `localStorage` :
- `nova:mobile:scripts` — array des scripts
- `nova:mobile:settings` — reglages (theme, police, vitesse, etc.)
- `nova:mobile:tags` — balises personnalisees

Limite : ~5 MB par origine. Si tu hits la limite, exporte tes scripts en JSON.

## Fichiers

```
mobile/
├── index.html      UI complete (3 vues : home, editor, prompter)
├── app.css         Styles mobile-first, responsive, theme-aware
├── app.js          Logique : storage, scroll auto, Web Speech, settings
├── manifest.json   PWA manifest
├── sw.js           Service worker (cache offline)
├── icon.svg        Icone (toutes tailles via SVG)
└── README.md       Ce fichier
```
