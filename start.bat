@echo off
echo ============================================
echo   Telemetry Migration Tool - Setup & Start
echo ============================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python tidak ditemukan!
    echo Silakan install Python terlebih dahulu.
    pause
    exit /b 1
)

REM Check if backend .env file exists
if not exist backend\.env (
    echo [WARNING] backend\.env tidak ditemukan!
    if exist backend\.env.example (
        echo Creating .env from .env.example...
        copy backend\.env.example backend\.env
        echo [INFO] File .env berhasil dibuat. Silakan edit dengan URL ThingsBoard Anda!
    )
)

REM Check if requirements are installed
echo [1/3] Checking dependencies...
pip show fastapi >nul 2>&1
if errorlevel 1 (
    echo [INFO] Installing dependencies...
    cd backend
    pip install -r requirements.txt
    cd ..
) else (
    echo [OK] Dependencies sudah terinstall
)

echo.
echo [2/3] Starting Backend Server...
echo Backend akan berjalan di http://localhost:8000
echo.

REM Start backend in a new window
start "Backend API Server" cmd /k "cd backend && python api.py"

timeout /t 3 /nobreak >nul

echo [3/3] Starting Frontend...
echo Frontend akan berjalan di http://localhost:5500
echo.

REM Start frontend server
start "Frontend Server" cmd /k "cd frontend && python -m http.server 5500"

timeout /t 2 /nobreak >nul

echo.
echo ============================================
echo   Aplikasi berhasil dijalankan!
echo ============================================
echo.
echo Backend API: http://localhost:8000
echo Frontend UI: http://localhost:5500
echo.
echo API Docs: http://localhost:8000/docs
echo.
echo Tekan Ctrl+C di window server untuk stop
echo.

REM Open browser
echo Opening browser...
timeout /t 2 /nobreak >nul
start http://localhost:5500

pause
