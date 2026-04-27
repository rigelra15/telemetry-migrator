# Telemetry Migration Tool

Tool untuk migrasi data telemetri antar sistem ThingsBoard dengan antarmuka web yang mudah digunakan.

## 🏗️ Arsitektur

- **Frontend**: HTML + JavaScript (Vanilla JS)
- **Backend**: FastAPI (Python)
- **Storage**: File-based authentication (.txt files)

## 📁 Struktur Project

```
migrate-tools/
├── backend/
│   ├── api.py              # FastAPI server (NEW!)
│   ├── requirements.txt    # Python dependencies
│   ├── README.md          # Backend documentation
│   ├── auth/              # Credentials storage (git-ignored)
│   ├── config/            # Configuration files
│   ├── logs/              # Migration logs
│   └── [other Python scripts]
├── frontend/
│   ├── index.html         # Login page
│   ├── sender.html        # Source configuration
│   ├── receiver.html      # Destination & migration
│   ├── app.js            # Frontend logic (UPDATED!)
│   └── config.json       # Frontend config (git-ignored)
└── .gitignore
```

## 🚀 Quick Start

### 1. Setup Backend

```bash
cd backend
pip install -r requirements.txt
```

Copy `.env.example` ke `.env` dan set BASE_URL:
```bash
cp .env.example .env
# Edit .env dengan URL ThingsBoard Anda
```

Jalankan backend:
```bash
python api.py
```

Backend akan berjalan di `http://localhost:8000` (hot reload enabled ✨)

### 2. Setup Frontend

Tidak perlu setup file konfigurasi! Frontend otomatis fetch config dari backend via `/api/config`.

Jalankan frontend:
```bash
cd frontend
python -m http.server 5500
```

Frontend akan berjalan di `http://localhost:5500`

## 📖 Cara Penggunaan

### Step 1: Login
1. Buka aplikasi di browser
2. Masukkan credentials untuk **Source** (Sender)
3. Masukkan credentials untuk **Destination** (Receiver)
4. Klik login untuk kedua sistem

### Step 2: Konfigurasi Source
1. Pilih Entity Type (DEVICE, ASSET, dll)
2. Masukkan Entity ID
3. Masukkan telemetry keys (comma-separated)
4. Set limit dan time range
5. Klik Next

### Step 3: Start Migration
1. Pilih Target Entity Type
2. Masukkan Target Entity ID
3. Klik "Start Migration"
4. Pantau progress secara real-time

## 🔐 Security & Configuration

### Environment Configuration

Konfigurasi ThingsBoard base URL sekarang menggunakan `.env` file di backend (bukan config.json):

```bash
# backend/.env
BASE_URL=https://your-thingsboard-url.com
```

⚠️ **.env file tidak di-commit ke Git** untuk security.

Lihat [ENV_SETUP.md](ENV_SETUP.md) untuk detail lengkap.

### Penyimpanan Credentials

Credentials **TIDAK** disimpan di browser localStorage, melainkan di backend sebagai file .txt:

- `backend/auth/credentials_source.txt` - Username & password source
- `backend/auth/token_source.txt` - JWT token source  
- `backend/auth/credentials_destination.txt` - Username & password destination
- `backend/auth/token_destination.txt` - JWT token destination

⚠️ **File-file ini sudah di-ignore oleh Git** untuk keamanan.

### Best Practices

1. **Never commit `.env` file** - Gunakan `.env.example` sebagai template
2. **Keep `.env.example` updated** - Untuk documentasi environment variables
3. Jangan commit file credentials ke Git
4. Gunakan HTTPS untuk production (setkan BASE_URL dengan https)
5. Set CORS yang spesifik di backend untuk production
6. Rotate credentials dan tokens secara berkala

## 🔧 API Endpoints

Dokumentasi lengkap API tersedia di:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### Main Endpoints:
- `GET /api/config` - Get configuration dari backend
- `GET /api/auth/status` - Check authentication status (source & destination)
- `POST /api/login/source` - Login source system
- `POST /api/login/destination` - Login destination system
- `POST /api/migrate` - Start migration
- `GET /api/status` - Get migration progress
- `DELETE /api/logout` - Clear all credentials

## 🛠️ Development

### Backend Development

Backend sudah include hot reload by default saat run via `python api.py`.

Atau jalankan manual dengan uvicorn:
```bash
cd backend
uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

**Hot Reload Features:**
- ✅ Auto-restart saat ada perubahan file `.py`
- ✅ Preserve active connections
- ✅ Fast development iteration

### Frontend Development

Frontend serve pakai static HTTP server, tidak perlu reload tools.

Update `API_URL` di `frontend/app.js` jika backend berjalan di port/host berbeda.

## 📝 Notes

- Migration berjalan di background di backend
- Progress updates dikirim via polling setiap 1 detik
- Data diproses dalam chunks (2000 records per chunk)
- Support untuk time range besar (diproses per hari)

## 🐛 Troubleshooting

### Backend tidak bisa start
- Pastikan semua dependencies sudah terinstall: `pip install -r requirements.txt`
- Check port 8000 tidak digunakan aplikasi lain

### Frontend tidak bisa connect ke backend
- Check backend sudah berjalan di `http://localhost:8000`
- Check CORS settings di `backend/api.py`
- Lihat console browser untuk error details

### Migration gagal
- Check credentials valid dan tidak expired
- Verify entity IDs exists
- Check network connectivity

## 📜 License

[Your License Here]

## 👨‍💻 Author

[Your Name/Team]
