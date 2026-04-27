const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const http = require('http');
const fs = require('fs');

let pyProcess = null;

/**
 * Baca BASE_URL dari .env file
 */
function readBaseUrl() {
  // Cari .env di beberapa lokasi
  const possiblePaths = [
    path.join(__dirname, 'backend', '.env'),                    // Development
    path.join(process.resourcesPath || '', 'backend', '.env'),  // Production
  ];

  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(/BASE_URL=(.+)/);
      if (match) {
        return match[1].trim();
      }
    }
  }
  return 'https://demo.thingsboard.io';
}

function startPythonBackend() {
  const isWindows = os.platform() === 'win32';
  let backendBin;
  let args = [];

  // Lokasi writable untuk data (auth, logs, session)
  const dataDir = app.isPackaged
    ? path.join(path.dirname(app.getPath('exe')), 'data')
    : path.join(__dirname, 'backend');

  // Pastikan data directory ada
  if (app.isPackaged) {
    for (const sub of ['auth', 'data', 'data/session', 'data/history', 'data/logs']) {
      const dir = path.join(dataDir, sub);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  // Lokasi frontend files
  let frontendDir;

  if (app.isPackaged) {
    const binaryName = isWindows ? 'telemetry-backend.exe' : 'telemetry-backend';
    backendBin = path.join(process.resourcesPath, 'bin', binaryName);
    frontendDir = path.join(process.resourcesPath, 'frontend');
  } else {
    if (isWindows) {
      backendBin = path.join(__dirname, 'venv', 'Scripts', 'python.exe');
    } else {
      backendBin = path.join(__dirname, 'venv', 'bin', 'python3');
    }
    args = [path.join(__dirname, 'backend', 'api.py')];
    frontendDir = path.join(__dirname, 'frontend');
  }

  const baseUrl = readBaseUrl();

  console.log(`Starting Backend: ${backendBin} ${args.join(' ')}`);
  console.log(`Data Dir: ${dataDir}`);
  console.log(`Frontend Dir: ${frontendDir}`);
  console.log(`BASE_URL: ${baseUrl}`);

  pyProcess = spawn(backendBin, args, {
    cwd: dataDir,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      BASE_URL: baseUrl,
      FRONTEND_DIR: frontendDir,
    }
  });

  pyProcess.stdout.on('data', (data) => {
    console.log(`Backend: ${data}`);
  });

  pyProcess.stderr.on('data', (data) => {
    console.error(`Backend Error: ${data}`);
  });

  pyProcess.on('error', (err) => {
    console.error(`Failed to start backend: ${err.message}`);
  });

  pyProcess.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
  });
}

/**
 * Tunggu sampai backend merespon di http://localhost:8000
 */
function waitForBackend(maxRetries = 60, interval = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    let done = false;

    const check = () => {
      if (done) return;
      attempts++;

      const req = http.get('http://localhost:8000/', (res) => {
        res.resume();
        if (!done) {
          done = true;
          console.log(`Backend ready! (attempt ${attempts})`);
          resolve();
        }
      });

      req.on('error', () => {
        if (done) return;
        if (attempts >= maxRetries) {
          done = true;
          reject(new Error('Backend gagal start setelah 30 detik'));
        } else {
          setTimeout(check, interval);
        }
      });

      req.setTimeout(1000, () => {
        req.destroy();
      });
    };

    check();
  });
}

function getIconPath() {
  const platform = os.platform();
  if (platform === 'win32') {
    return path.join(__dirname, 'logo.ico');
  } else if (platform === 'darwin') {
    return path.join(__dirname, 'logo.icns');
  } else {
    return path.join(__dirname, 'logo.png');
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Telemetry Migrator Tool",
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false
    }
  });

  // Load frontend melalui backend (same-origin, no CORS issues)
  win.loadURL('http://localhost:8000/index.html');
  win.setMenuBarVisibility(false);
}

app.whenReady().then(async () => {
  startPythonBackend();

  try {
    console.log('Waiting for backend to be ready...');
    await waitForBackend();
  } catch (err) {
    console.error(err.message);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (pyProcess) {
    pyProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (pyProcess) {
    pyProcess.kill();
  }
});
