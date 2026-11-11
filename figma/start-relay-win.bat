@echo off
rem Figma node organizer - OPTIONAL local relay launcher (Windows, double-click).
rem Default mode needs NO terminal: the plugin calls the LLM gateway directly.
rem Use this only when the gateway blocks the plugin with a CORS error.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node 18+ from https://nodejs.org and retry.
  echo.
  pause
  exit /b 1
)

echo [figma-relay] Starting on ws://localhost:3055 ...
echo [figma-relay] Keep this window open. Go back to Figma and click "Connect local proxy".
echo [figma-relay] Press Ctrl+C to stop.
echo.
node socket-server.mjs
echo.
echo [figma-relay] exited.
pause
