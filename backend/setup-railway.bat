@echo off
REM Setup automatique Railway pour NovaPrompter API
REM Necessite Railway CLI : npm i -g @railway/cli
REM Avant de lancer : ouvre une cmd et fais "railway login"

where railway >nul 2>&1
if errorlevel 1 (
    echo Railway CLI pas installee. Installation...
    npm install -g @railway/cli
)

echo.
echo === Setup variables Railway ===
echo Le projet doit etre lie : si pas fait, lance d'abord :
echo    railway login
echo    railway link
echo.

REM Set toutes les variables en une fois
railway variables ^
  --set "JWT_SECRET=36e345d7bd51cb7aed5c16cd2cffc7835786211784ba10b75d5e880cf0257ce10e84a232ec6c75b9d7bbba9b06c5f681" ^
  --set "DATA_DIR=/data" ^
  --set "NODE_ENV=production"

echo.
echo === Variables OK. Maintenant : ===
echo 1. Va sur Railway dashboard
echo 2. Settings du service ^> Volumes ^> + New Volume ^> Mount Path : /data
echo 3. Settings ^> Build ^> Root Directory : backend
echo 4. Settings ^> Networking ^> Generate Domain
echo.
pause
