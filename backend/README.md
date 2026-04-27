# Telemetry Migration Tool - Backend API

Backend FastAPI untuk aplikasi migrasi telemetri.

## Setup

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment

Copy `.env.example` ke `.env` dan set BASE_URL:

```bash
cp .env.example .env
# Edit .env dengan URL ThingsBoard Anda
```

Parameter yang tersedia di `.env`:
- `BASE_URL` - URL ThingsBoard server (required)

Lihat [../ENV_SETUP.md](../ENV_SETUP.md) untuk detail lengkap.

### 3. Jalankan Server

```bash
python api.py
```

**Hot Reload Enabled! 🔥**  
Server otomatis restart setiap kali ada perubahan code Python.

Atau menggunakan uvicorn langsung:

```bash
uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

Server akan berjalan di: `http://localhost:8000`

## Configuration

Konfigurasi environment disimpan di file `.env` (git-ignored untuk keamanan).

### Contoh .env

```bash
# backend/.env
BASE_URL=https://demo.thingsboard.io
```

### Default Values

Jika `.env` tidak ditemukan, backend akan gunakan default values:
- `BASE_URL`: `https://demo.thingsboard.io`

## Endpoints

### System

- **GET** `/` - Health check
  - Response: `{ "message": "Telemetry Migration API", "status": "running" }`

- **GET** `/api/config` - Get configuration (BaseURL)
  - Response: `{ "baseURL": "https://..." }`
  - **Used by**: Frontend untuk load configuration

- **GET** `/api/auth/status` - Check authentication status
  - Response: `{ "sourceLoggedIn": true, "destLoggedIn": true, "bothLoggedIn": true }`
  - **Used by**: Frontend untuk check authentication state
  - **Logic**: Check keberadaan token files di backend

### Authentication

- **POST** `/api/login/source` - Login ke source system
  - Body: `{ "username": "...", "password": "..." }`
  - Response: `{ "success": true, "message": "...", "token": "..." }`
  - **Note**: BaseURL diambil dari backend `.env` (BASE_URL)

- **POST** `/api/login/destination` - Login ke destination system
  - Body: `{ "username": "...", "password": "..." }`
  - Response: `{ "success": true, "message": "...", "token": "..." }`
  - **Note**: BaseURL diambil dari backend `.env` (BASE_URL)

- **DELETE** `/api/logout` - Clear semua credentials dan tokens

### Migration

- **POST** `/api/migrate` - Start migration process
  - Body:
    ```json
    {
      "entityType": "DEVICE",
      "entityId": "...",
      "keys": "temperature,humidity",
      "limit": 1000,
      "start": 1234567890000,
      "end": 1234567990000,
      "targetEntityType": "DEVICE",
      "targetEntityId": "..."
    }
    ```
  - Response: `{ "success": true, "message": "Migration started in background" }`
  - **Note**: BaseURL diambil dari backend `.env`

- **GET** `/api/status` - Get migration status dan progress
  - Response:
    ```json
    {
      "running": true,
      "progress": "Migration progress text...",
      "completed": false,
      "error": null
    }
    ```

## Penyimpanan Credentials

Credentials dan tokens disimpan di folder `backend/auth/`:
- `credentials_source.txt` - Username dan password source
- `token_source.txt` - JWT token source
- `credentials_destination.txt` - Username dan password destination
- `token_destination.txt` - JWT token destination

⚠️ **Note**: File-file ini tidak di-commit ke Git (sudah ada di .gitignore).

## CORS

Backend sudah dikonfigurasi untuk accept requests dari frontend.
Untuk production, set `allow_origins` ke domain frontend yang spesifik.

## Logs

Migration logs akan tampil di console saat server berjalan.
