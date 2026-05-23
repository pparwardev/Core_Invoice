# Electron Desktop Build

## Prerequisites
- Node.js 18+ installed on Windows
- npm installed

## How to Build the Windows Installer

### Option 1: From WSL (cross-compile)
```bash
cd /home/pparwar/Core_invoice
bash build-desktop.sh
```

### Option 2: From Windows (recommended for .exe)
```cmd
cd C:\path\to\Core_invoice
npm run build
npm install --save-dev electron electron-builder
npm run build:desktop
```

### Option 3: Step by step
```bash
# 1. Build server
cd server && npm run build && cd ..

# 2. Build client
cd client && npx vite build && cd ..

# 3. Install electron deps (first time only)
npm install --save-dev electron electron-builder

# 4. Package
npx electron-builder --win --config electron-builder.json
```

## Output
The installer will be in `dist-electron/` folder:
- `Core-Invoice Setup 1.0.0.exe` — Windows installer

## Icon
Replace `electron/icon.ico` with your custom 256x256 .ico file.
If no icon file exists, electron-builder will use a default icon.

## Notes
- The app runs a local Express server on port 3001
- SQLite database is stored in `server/data/core-invoice.db`
- First launch will initialize the database automatically
- Login credentials are the same as the web version
