@echo off
REM ==============================================================================
REM Sheba ERP & SaaS Full-Stack Windows CMD Runner
REM Launches Backend (Django: 8000), Frontend (3000), and Super-Admin (3001)
REM ==============================================================================

title Sheba ERP Dev Server Runner

echo ================================================================
echo           Sheba ERP ^& SaaS Full-Stack Dev Server
echo ================================================================
echo   Backend API:   http://127.0.0.1:8000
echo   ISP Frontend:  http://localhost:3000
echo   Super-Admin:   http://localhost:3001
echo ================================================================

start "Sheba Backend API" cmd /k "cd /d %~dp0backend && venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000"
start "Sheba ISP Frontend" cmd /k "cd /d %~dp0isp-admin && npm run dev"
start "Sheba Super-Admin" cmd /k "cd /d %~dp0sass-admin && npm run dev"

echo All 3 services started in their respective windows.
pause
