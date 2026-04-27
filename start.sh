#!/bin/bash

echo "============================================"
echo "  Telemetry Migration Tool - Setup & Start"
echo "============================================"
echo ""

# Check if Python is installed

if ! command -v python3 &> /dev/null
then
echo "[ERROR] Python tidak ditemukan!"
echo "Silakan install Python terlebih dahulu."
exit 1
fi

# Check if backend .env file exists

if [ ! -f backend/.env ]; then
echo "[WARNING] backend/.env tidak ditemukan!"
if [ -f backend/.env.example ]; then
echo "Creating .env from .env.example..."
cp backend/.env.example backend/.env
echo "[INFO] File .env berhasil dibuat. Silakan edit dengan URL ThingsBoard Anda!"
fi
fi

# Check if requirements are installed

echo "[1/3] Checking dependencies..."
if ! pip3 show fastapi &> /dev/null
then
echo "[INFO] Installing dependencies..."
cd backend
pip3 install -r requirements.txt
cd ..
else
echo "[OK] Dependencies sudah terinstall"
fi

echo ""
echo "[2/3] Starting Backend Server..."
echo "Backend akan berjalan di http://localhost:8000"
echo ""

# Start backend (background)

cd backend
python3 api.py &
cd ..

sleep 3

echo "[3/3] Starting Frontend..."
echo "Frontend akan berjalan di http://localhost:5500"
echo ""

# Start frontend (background)

cd frontend
python3 -m http.server 5500 &
cd ..

sleep 2

echo ""
echo "============================================"
echo "  Aplikasi berhasil dijalankan!"
echo "============================================"
echo ""
echo "Backend API: http://localhost:8000"
echo "Frontend UI: http://localhost:5500"
echo ""
echo "API Docs: http://localhost:8000/docs"
echo ""

# Open browser (Mac)

echo "Opening browser..."
open http://localhost:5500