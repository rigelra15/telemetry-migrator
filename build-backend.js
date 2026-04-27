const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const isWindows = os.platform() === 'win32';
const pythonPath = isWindows 
    ? path.join(__dirname, 'venv', 'Scripts', 'python.exe')
    : path.join(__dirname, 'venv', 'bin', 'python3');

const pyinstallerPath = isWindows
    ? path.join(__dirname, 'venv', 'Scripts', 'pyinstaller.exe')
    : path.join(__dirname, 'venv', 'bin', 'pyinstaller');

console.log('--- Building Python Backend ---');

try {
    // 1. Pastikan folder dist ada
    if (!fs.existsSync(path.join(__dirname, 'dist'))) {
        fs.mkdirSync(path.join(__dirname, 'dist'));
    }

    // 2. Jalankan PyInstaller
    const cmd = `"${pyinstallerPath}" --noconfirm --onefile --console --name "telemetry-backend" --paths "backend" --hidden-import "uvicorn.logging" --hidden-import "uvicorn.loops" --hidden-import "uvicorn.loops.auto" --hidden-import "uvicorn.protocols" --hidden-import "uvicorn.protocols.http" --hidden-import "uvicorn.protocols.http.auto" --hidden-import "uvicorn.protocols.websockets" --hidden-import "uvicorn.protocols.websockets.auto" --hidden-import "uvicorn.lifespan" --hidden-import "uvicorn.lifespan.on" --hidden-import "fastapi" "backend/api.py"`;
    
    console.log(`Running: ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });

    console.log('--- Backend Build Success! ---');
} catch (error) {
    console.error('--- Backend Build Failed! ---');
    console.error(error.message);
    process.exit(1);
}
