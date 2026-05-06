#!/bin/bash
# Setup automatique Railway pour NovaPrompter API
# Nécessite Railway CLI : npm i -g @railway/cli puis railway login

set -e

if ! command -v railway &> /dev/null; then
  echo "Railway CLI pas installée. Installation..."
  npm install -g @railway/cli
fi

echo
echo "=== Setup variables Railway ==="
echo "Si pas déjà fait :"
echo "  railway login"
echo "  railway link  # choisir le projet/service"
echo

railway variables \
  --set "JWT_SECRET=36e345d7bd51cb7aed5c16cd2cffc7835786211784ba10b75d5e880cf0257ce10e84a232ec6c75b9d7bbba9b06c5f681" \
  --set "DATA_DIR=/data" \
  --set "NODE_ENV=production"

echo
echo "=== Variables set. Reste à faire dans le dashboard : ==="
echo "1. Settings > Volumes > + New Volume > Mount Path : /data"
echo "2. Settings > Build > Root Directory : backend (si pas déjà bon)"
echo "3. Settings > Networking > Generate Domain"
