const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const http = require('http');
const https = require('https');
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
        // Strip \r (Windows line ending) and whitespace
        const url = match[1].trim().replace(/\r/g, '');
        console.log(`[Config] Read BASE_URL from: ${envPath}`);
        console.log(`[Config] BASE_URL = ${url}`);
        return url;
      }
    }
  }
  console.warn('[Config] No .env found, using default demo URL');
  return 'https://demo.thingsboard.io';
}

function startPythonBackend() {
  const isWindows = os.platform() === 'win32';
  let backendBin;
  let args = [];

  // Lokasi writable untuk data (auth, logs, session)
  // Gunakan 'userData' bawaan Electron (~/.config/App, AppData/Roaming, dll) agar SELALU writable
  const dataDir = app.isPackaged
    ? path.join(app.getPath('userData'), 'backend_data')
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

  const isWindowsPlatform = os.platform() === 'win32';

  pyProcess = spawn(backendBin, args, {
    cwd: dataDir,
    detached: !isWindowsPlatform, // Unix: detach to create process group for clean kill
    stdio: ['ignore', 'pipe', 'pipe'],
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

// ==================== UPDATE CHECKER ====================
const GITHUB_REPO = 'rigelra15/telemetry-migrator';

function checkForUpdates() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/releases/latest`,
      headers: { 'User-Agent': 'Telemetry-Migrator-App' }
    };

    https.get(options, (res) => {
      let data = '';
      
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        https.get(res.headers.location, { headers: options.headers }, (redirectRes) => {
          let redirectData = '';
          redirectRes.on('data', chunk => redirectData += chunk);
          redirectRes.on('end', () => {
            try { resolve(JSON.parse(redirectData)); } catch (e) { reject(e); }
          });
        }).on('error', reject);
        return;
      }

      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// IPC: Check for updates
ipcMain.handle('check-for-updates', async () => {
  try {
    const currentVersion = app.getVersion();
    const release = await checkForUpdates();
    
    if (!release || !release.tag_name) {
      return { updateAvailable: false };
    }

    const latestVersion = release.tag_name.replace(/^v/, '');
    
    // Compare versions
    const current = currentVersion.split('.').map(Number);
    const latest = latestVersion.split('.').map(Number);
    
    let updateAvailable = false;
    for (let i = 0; i < 3; i++) {
      if ((latest[i] || 0) > (current[i] || 0)) { updateAvailable = true; break; }
      if ((latest[i] || 0) < (current[i] || 0)) break;
    }

    // Determine the right download URL based on platform
    let downloadUrl = release.html_url; // fallback to release page
    const platform = os.platform();
    if (release.assets) {
      for (const asset of release.assets) {
        const name = asset.name.toLowerCase();
        if (platform === 'win32' && name.endsWith('.exe')) {
          downloadUrl = asset.browser_download_url;
          break;
        } else if (platform === 'darwin' && name.endsWith('.dmg')) {
          downloadUrl = asset.browser_download_url;
          break;
        } else if (platform === 'linux' && name.endsWith('.appimage')) {
          downloadUrl = asset.browser_download_url;
          break;
        }
      }
    }

    return {
      updateAvailable,
      currentVersion,
      latestVersion,
      releaseNotes: release.body || '',
      releaseName: release.name || `v${latestVersion}`,
      downloadUrl,
      publishedAt: release.published_at
    };
  } catch (error) {
    console.error('Update check failed:', error.message);
    return { updateAvailable: false, error: error.message };
  }
});

// IPC: Open external URL
ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
});

// IPC: Get current app version
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

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

/**
 * Properly kill backend process (cross-platform)
 * On Windows, pyProcess.kill() doesn't reliably terminate .exe processes.
 * We use taskkill /T /F to kill the entire process tree.
 */
function killBackend() {
  if (!pyProcess) return;

  try {
    if (os.platform() === 'win32') {
      // Windows: use taskkill to kill the process tree
      const { execSync } = require('child_process');
      execSync(`taskkill /pid ${pyProcess.pid} /T /F`, { stdio: 'ignore' });
    } else {
      // macOS/Linux: kill process group
      process.kill(-pyProcess.pid, 'SIGTERM');
    }
  } catch (e) {
    // Fallback: try standard kill
    try { pyProcess.kill('SIGKILL'); } catch (_) {}
  }

  pyProcess = null;
}

app.on('window-all-closed', () => {
  killBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  killBackend();
});

app.on('before-quit', () => {
  killBackend();
});
