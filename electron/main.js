const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

let mainWindow;
let serverProcess;
const SERVER_PORT = 3001;

function getAppRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app');
  }
  return path.join(__dirname, '..');
}

function startServer() {
  const appRoot = getAppRoot();
  const serverScript = path.join(appRoot, 'server', 'dist', 'index.js');
  const serverCwd = path.join(appRoot, 'server');

  console.log('[Electron] App root:', appRoot);
  console.log('[Electron] Server script:', serverScript);
  console.log('[Electron] Exists:', fs.existsSync(serverScript));

  if (!fs.existsSync(serverScript)) {
    console.error('[Electron] ERROR: server/dist/index.js not found!');
    return;
  }

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(SERVER_PORT),
    DOTENV_CONFIG_PATH: path.join(serverCwd, '.env'),
  };

  // Use 'node' from system PATH with --experimental-modules flag
  // The server uses "type": "module" so Node needs to handle ESM
  serverProcess = spawn('node', ['dist/index.js'], {
    cwd: serverCwd,
    env,
    shell: true,
    windowsHide: true,
  });

  serverProcess.stdout.on('data', (data) => {
    console.log('[Server]', data.toString().trim());
  });

  serverProcess.stderr.on('data', (data) => {
    console.error('[Server ERR]', data.toString().trim());
  });

  serverProcess.on('error', (err) => {
    console.error('[Electron] Failed to spawn server:', err.message);
  });

  serverProcess.on('exit', (code) => {
    console.log('[Electron] Server process exited with code:', code);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Core-Invoice',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    show: false,
  });

  // Load splash screen from file if exists, otherwise use inline
  const splashPath = path.join(getAppRoot(), 'electron', 'splash.html');
  if (fs.existsSync(splashPath)) {
    mainWindow.loadFile(splashPath);
  } else {
    const splash = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Core-Invoice</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;align-items:center;justify-content:center;height:100vh;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);font-family:'Segoe UI',Arial;overflow:hidden}.c{text-align:center;color:#fff}.logo{font-size:64px;margin-bottom:20px;animation:p 2s infinite}@keyframes p{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}h1{font-size:32px;color:#4fc3f7;margin-bottom:8px;letter-spacing:2px}.tag{color:#888;font-size:14px;font-style:italic;margin-bottom:30px}.ld{display:flex;gap:6px;justify-content:center;margin-bottom:16px}.ld span{width:10px;height:10px;background:#4fc3f7;border-radius:50%;animation:b 1.4s infinite}.ld span:nth-child(2){animation-delay:.2s}.ld span:nth-child(3){animation-delay:.4s}@keyframes b{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}.st{color:#666;font-size:12px}.ver{position:fixed;bottom:16px;right:16px;color:#444;font-size:11px}</style></head><body><div class="c"><div class="logo">&#x1f9fe;</div><h1>Core-Invoice</h1><p class="tag">Precision in Every Payment</p><div class="ld"><span></span><span></span><span></span></div><p class="st" id="status">Starting server...</p></div><div class="ver">v1.0.0</div></body></html>`;
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splash));
  }
  mainWindow.show();

  // Poll for server readiness
  let attempts = 0;
  const maxAttempts = 60; // 30 seconds

  const checkServer = () => {
    attempts++;
    const req = http.get(`http://localhost:${SERVER_PORT}/api/auth`, (res) => {
      console.log('[Electron] Server is ready! Loading app...');
      mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
    });
    req.on('error', () => {
      if (attempts < maxAttempts) {
        setTimeout(checkServer, 500);
      } else {
        console.error('[Electron] Server did not start after 30s');
        mainWindow.loadURL(`data:text/html,${encodeURIComponent(`<!DOCTYPE html><html><body style="background:#1a1a2e;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:Arial"><div style="text-align:center"><h2 style="color:#ff5252">Server Failed to Start</h2><p style="color:#888;margin-top:10px">Possible causes:</p><ul style="color:#aaa;text-align:left;margin-top:10px;font-size:13px"><li>Node.js is not installed or not in PATH</li><li>Port 3001 is already in use</li><li>Database file is missing</li></ul><p style="color:#666;margin-top:20px;font-size:11px">Try running manually: node server/dist/index.js</p></div></body></html>`)}`);
      }
    });
    req.end();
  };

  // Give server 2 seconds to start before first check
  setTimeout(checkServer, 2000);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Kill any existing process on port 3001 before starting
function killExistingServer(callback) {
  if (process.platform === 'win32') {
    exec('netstat -ano | findstr :3001', (err, stdout) => {
      if (stdout) {
        const lines = stdout.trim().split('\n');
        const pids = new Set();
        lines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0') pids.add(pid);
        });
        pids.forEach(pid => {
          try { exec(`taskkill /PID ${pid} /F`); } catch {}
        });
      }
      setTimeout(callback, 500);
    });
  } else {
    callback();
  }
}

app.whenReady().then(() => {
  killExistingServer(() => {
    startServer();
    createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
    // Also kill by port on Windows
    if (process.platform === 'win32') {
      exec('netstat -ano | findstr :3001', (err, stdout) => {
        if (stdout) {
          const lines = stdout.trim().split('\n');
          lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== '0') try { exec(`taskkill /PID ${pid} /F`); } catch {}
          });
        }
      });
    }
  }
  app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});
