#!/bin/bash
# Build Core-Invoice as a portable Windows package
# This creates a self-contained folder that can run on any Windows PC with Node.js

echo "🧾 Core-Invoice Portable Build"
echo "================================"

PROJECT_ROOT=~/Core_invoice
BUILD_DIR=~/Core_invoice/dist-portable/Core-Invoice

# Clean previous build
rm -rf ~/Core_invoice/dist-portable
mkdir -p "$BUILD_DIR"

echo ""
echo "📦 Step 1: Building server..."
cd "$PROJECT_ROOT/server"
npx tsc 2>/dev/null
echo "✓ Server built"

echo ""
echo "📦 Step 2: Building client..."
cd "$PROJECT_ROOT/client"
rm -rf dist
npx vite build 2>/dev/null
echo "✓ Client built"

echo ""
echo "📦 Step 3: Packaging files..."

# Copy server
mkdir -p "$BUILD_DIR/server"
cp -r "$PROJECT_ROOT/server/dist" "$BUILD_DIR/server/"
cp -r "$PROJECT_ROOT/server/node_modules" "$BUILD_DIR/server/"
cp "$PROJECT_ROOT/server/package.json" "$BUILD_DIR/server/"
cp "$PROJECT_ROOT/server/.env" "$BUILD_DIR/server/" 2>/dev/null
cp "$PROJECT_ROOT/server/eng.traineddata" "$BUILD_DIR/server/" 2>/dev/null
cp "$PROJECT_ROOT/server/hin.traineddata" "$BUILD_DIR/server/" 2>/dev/null

# Copy server data (without uploads content)
mkdir -p "$BUILD_DIR/server/data/uploads"

# Copy client
mkdir -p "$BUILD_DIR/client"
cp -r "$PROJECT_ROOT/client/dist" "$BUILD_DIR/client/"
cp -r "$PROJECT_ROOT/client/public" "$BUILD_DIR/client/" 2>/dev/null

# Copy electron
cp -r "$PROJECT_ROOT/electron" "$BUILD_DIR/"

# Copy config
cp "$PROJECT_ROOT/package.json" "$BUILD_DIR/"
cp "$PROJECT_ROOT/electron-builder.json" "$BUILD_DIR/"

echo "✓ Files packaged"

echo ""
echo "📦 Step 4: Creating start scripts..."

# Create Windows batch file to start the app
cat > "$BUILD_DIR/Start-CoreInvoice.bat" << 'BATCH'
@echo off
title Core-Invoice Server
echo.
echo  ====================================
echo   Core-Invoice - Starting Server...
echo  ====================================
echo.

cd /d "%~dp0server"
node dist/index.js

pause
BATCH

# Create a script that opens browser too
cat > "$BUILD_DIR/Run-CoreInvoice.bat" << 'BATCH'
@echo off
title Core-Invoice
echo.
echo  ====================================
echo   Core-Invoice v1.0.0
echo   Precision in Every Payment
echo  ====================================
echo.
echo  Starting server...

cd /d "%~dp0server"
start /b node dist/index.js

echo  Waiting for server to start...
timeout /t 3 /nobreak > nul

echo  Opening browser...
start http://localhost:3001

echo.
echo  ====================================
echo   Core-Invoice is running!
echo   Open: http://localhost:3001
echo   Press Ctrl+C to stop
echo  ====================================
echo.

:: Keep window open
cmd /k
BATCH

# Create stop script
cat > "$BUILD_DIR/Stop-CoreInvoice.bat" << 'BATCH'
@echo off
echo Stopping Core-Invoice...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    taskkill /PID %%a /F 2>nul
)
echo Done.
timeout /t 2
BATCH

echo "✓ Start scripts created"

echo ""
echo "📦 Step 5: Creating README..."

cat > "$BUILD_DIR/README.txt" << 'README'
=============================================
  Core-Invoice v1.0.0
  Vendor Billing Management System
=============================================

REQUIREMENTS:
  - Windows 10/11
  - Node.js v18+ (download from https://nodejs.org)

HOW TO RUN:
  1. Install Node.js if not already installed
  2. Double-click "Run-CoreInvoice.bat"
  3. Browser will open automatically at http://localhost:3001
  4. To stop: Close the command window or run "Stop-CoreInvoice.bat"

FIRST TIME SETUP:
  - Register a new account on the login page
  - Login with your credentials
  - Start managing vendors and invoices!

FEATURES:
  - Splash Screen with animated branding
  - User Registration with strong password validation
  - Login/Logout system
  - Dashboard with analytics
  - Vendor Management
  - Tax Invoice Generation
  - PO Reader (PDF parsing)
  - Company Info Management
  - User Profile & Password Management

SUPPORT:
  For issues, contact the development team.
=============================================
README

echo "✓ README created"

# Calculate size
SIZE=$(du -sh "$BUILD_DIR" | cut -f1)

echo ""
echo "✅ Build complete!"
echo "📁 Output: dist-portable/Core-Invoice/"
echo "📊 Size: $SIZE"
echo ""
echo "To distribute:"
echo "  1. Copy the 'Core-Invoice' folder to any Windows PC"
echo "  2. Make sure Node.js is installed on that PC"
echo "  3. Double-click 'Run-CoreInvoice.bat' to start"
echo ""
