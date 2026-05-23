# Core-Invoice Desktop App Build Instructions

## Prerequisites
1. **Node.js** (v18+) installed on Windows → https://nodejs.org
2. Project already built (server + client)

## Quick Build Steps

Open **PowerShell** and run:

```powershell
# Navigate to project (WSL path accessible from Windows)
cd \\wsl.localhost\AmazonWSL\home\pparwar\Core_invoice

# Install dependencies (if not already)
npm install --legacy-peer-deps

# Build server
cd server
npx tsc
cd ..

# Build client
cd client
npx vite build
cd ..

# Package as Windows installer
npx electron-builder --win --config electron-builder.json
```

## Output
After successful build, you'll find:
- `dist-electron/Core-Invoice Setup 1.0.0.exe` — Windows installer
- `dist-electron/win-unpacked/` — Portable version (no install needed)

## Install on Any PC
1. Copy `Core-Invoice Setup 1.0.0.exe` to any Windows PC
2. Double-click to install
3. App will appear on Desktop and Start Menu
4. No Node.js or any other software needed on target PC!

## What's Included in the Package
- ✅ Electron (app shell)
- ✅ Express server (backend)
- ✅ SQLite database (local storage)
- ✅ React frontend (UI)
- ✅ All features: Splash screen, Login, Registration, Dashboard, Vendors, Billing, PO Reader, Profile
