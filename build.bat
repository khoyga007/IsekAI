@echo off
REM ==============================================================
REM IsekAI - production build (Windows installer + portable exe)
REM Output: src-tauri\target\release\bundle\
REM ==============================================================
setlocal
cd /d "%~dp0"

echo [IsekAI] Building release bundle...
echo.

if not exist "node_modules\" (
    echo [IsekAI] node_modules missing - running npm install --legacy-peer-deps
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo [IsekAI] npm install failed.
        exit /b 1
    )
)

call npx tauri build
if errorlevel 1 (
    echo.
    echo [IsekAI] Build FAILED.
    exit /b 1
)

echo.
echo [IsekAI] Build complete. Artifacts:
echo   src-tauri\target\release\isekai.exe                 (raw exe)
echo   src-tauri\target\release\bundle\msi\*.msi           (MSI installer)
echo   src-tauri\target\release\bundle\nsis\*.exe          (NSIS installer)
echo.

REM Open the bundle folder in Explorer for convenience.
if exist "src-tauri\target\release\bundle" (
    start "" explorer "src-tauri\target\release\bundle"
)

endlocal
