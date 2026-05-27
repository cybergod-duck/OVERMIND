@echo off
title Overmind
cd /d "%~dp0"

echo.
echo  ╔═══════════════════════════════════════╗
echo  ║         OVERMIND LAUNCHER             ║
echo  ╚═══════════════════════════════════════╝
echo.

:: ── Step 1: Seed API keys from overmind.env ──
echo [1/3] Checking for API keys...
if exist "overmind.env" (
    node seed-vault.cjs
    if %errorlevel% neq 0 (
        echo [!] No API keys found — you can add them later via the vault.
    )
) else (
    echo [!] No overmind.env found — skipping key import.
    echo     Create overmind.env with KEY=VALUE pairs to auto-load keys.
)
echo.

:: ── Step 2: Install dependencies if needed ──
echo [2/3] Checking dependencies...
if not exist "node_modules\" (
    echo     Installing npm packages (first run)...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
) else (
    echo     Dependencies ready.
)
echo.

:: ── Step 3: Launch Overmind ──
echo [3/3] Launching Overmind...
echo.
start "" http://localhost:5173
call npm run electron:dev

pause
