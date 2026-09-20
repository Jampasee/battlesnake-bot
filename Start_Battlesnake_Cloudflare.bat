@echo off
title Battlesnake Bot + Cloudflare Tunnel
cd /d "%~dp0"
echo ========================================================
echo   Starting Battlesnake Bot + Cloudflare Tunnel
echo ========================================================

echo 1. Starting Node.js Server on port 8000...
start /b node server.js

timeout /t 2 /nobreak >nul

echo 2. Opening Cloudflare Quick Tunnel...
echo.
echo ========================================================
echo   Copy the HTTPS URL below (e.g. https://xxx.trycloudflare.com)
echo   and paste it into https://play.battlesnake.com
echo ========================================================
echo.
cloudflared tunnel --url http://localhost:8000
pause
