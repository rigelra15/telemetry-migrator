#!/bin/bash

# Pastikan venv aktif
source venv/bin/activate

echo "Building Backend with PyInstaller..."

# Build backend menjadi satu file executable
# --noconfirm: overwrite existing build
# --onefile: bundle everything into one executable
# --clean: clean cache
# --name: nama output file
# --add-data: sertakan file tambahan jika diperlukan (contoh: .env)

pyinstaller --noconfirm --onefile --console \
    --name "telemetry-backend" \
    --paths "backend" \
    --hidden-import "uvicorn.logging" \
    --hidden-import "uvicorn.loops" \
    --hidden-import "uvicorn.loops.auto" \
    --hidden-import "uvicorn.protocols" \
    --hidden-import "uvicorn.protocols.http" \
    --hidden-import "uvicorn.protocols.http.auto" \
    --hidden-import "uvicorn.protocols.websockets" \
    --hidden-import "uvicorn.protocols.websockets.auto" \
    --hidden-import "uvicorn.lifespan" \
    --hidden-import "uvicorn.lifespan.on" \
    --hidden-import "fastapi" \
    "backend/api.py"

echo "Build Backend Selesai! Output ada di dist/telemetry-backend"
