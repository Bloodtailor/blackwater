@echo off
rem BLACKWATER — double-click to play (starts dev server + opens browser)
cd /d "%~dp0"
start "" cmd /c "timeout /t 3 /nobreak >nul && start "" http://localhost:5173/?debug=1"
npm run dev -- --port 5173 --strictPort
