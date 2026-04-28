@echo off
REM ==============================================================
REM IsekAI - dev mode (Tauri desktop window + Vite HMR)
REM Run from anywhere; this script cd's to its own folder.
REM ==============================================================
setlocal
cd /d "%~dp0"

echo [IsekAI] Starting Tauri dev...
echo.

REM Make sure deps exist before launching tauri.
if not exist "node_modules\" (
    echo [IsekAI] node_modules missing - running npm install --legacy-peer-deps
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo [IsekAI] npm install failed.
        exit /b 1
    )
)

call npx tauri dev
endlocal
