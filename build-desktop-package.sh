#!/bin/bash
echo "🧾 Core-Invoice Desktop Package Builder"
echo "========================================="

PROJECT_ROOT=~/Core_invoice
BUILD_DIR=~/Core_invoice/dist-portable/Core-Invoice

rm -rf ~/Core_invoice/dist-portable
mkdir -p "$BUILD_DIR"

echo ""
echo "📦 Step 1: Copying server..."
mkdir -p "$BUILD_DIR/server/dist"
mkdir -p "$BUILD_DIR/server/data/uploads"
cp -r "$PROJECT_ROOT/server/dist/"* "$BUILD_DIR/server/dist/"
cp "$PROJECT_ROOT/server/package.json" "$BUILD_DIR/server/"
cp "$PROJECT_ROOT/server/.env" "$BUILD_DIR/server/" 2>/dev/null
cp "$PROJECT_ROOT/server/eng.traineddata" "$BUILD_DIR/server/" 2>/dev/null
cp "$PROJECT_ROOT/server/hin.traineddata" "$BUILD_DIR/server/" 2>/dev/null
# Copy database
cp "$PROJECT_ROOT/server/data/core-invoice.db" "$BUILD_DIR/server/data/" 2>/dev/null
echo "✓ Server copied"

echo ""
echo "📦 Step 2: Installing server production dependencies..."
cd "$BUILD_DIR/server"
npm install --omit=dev 2>/dev/null
echo "✓ Dependencies installed"

echo ""
echo "📦 Step 3: Copying client..."
mkdir -p "$BUILD_DIR/client"
cp -r "$PROJECT_ROOT/client/dist" "$BUILD_DIR/client/"
cp -r "$PROJECT_ROOT/client/public" "$BUILD_DIR/client/" 2>/dev/null
echo "✓ Client copied"

echo ""
echo "📦 Step 4: Copying MCP PO Reader..."
mkdir -p "$BUILD_DIR/mcp-server"
cp "$PROJECT_ROOT/mcp-server/extract_po.py" "$BUILD_DIR/mcp-server/"
cp "$PROJECT_ROOT/mcp-server/server.py" "$BUILD_DIR/mcp-server/"
cp "$PROJECT_ROOT/mcp-server/pyproject.toml" "$BUILD_DIR/mcp-server/"
echo "✓ MCP copied"

echo ""
echo "📦 Step 5: Creating start scripts..."

cat > "$BUILD_DIR/Run-CoreInvoice.bat" << 'BATCH'
@echo off
title Core-Invoice v1.0.0
color 0E
echo.
echo  =============================================
echo   Core_Invoice v1.0.0
echo   Precision in Every Payment
echo  =============================================
echo.
echo  Starting server...

cd /d "%~dp0server"
start /b node dist/index.js

echo  Waiting for server to start...
timeout /t 4 /nobreak > nul

echo  Opening browser...
start http://localhost:3001

echo.
echo  =============================================
echo   Core-Invoice is running!
echo   URL: http://localhost:3001
echo.
echo   Admin Login: admin / Admin@2026
echo   Press Ctrl+C or close this window to stop.
echo  =============================================
echo.
cmd /k
BATCH

cat > "$BUILD_DIR/Stop-CoreInvoice.bat" << 'BATCH'
@echo off
echo Stopping Core-Invoice...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    taskkill /PID %%a /F 2>nul
)
echo Done.
timeout /t 2
BATCH

cat > "$BUILD_DIR/Setup-Python-MCP.bat" << 'BATCH'
@echo off
title Core-Invoice - MCP Setup
echo.
echo  Setting up Python MCP (PO Reader - Advanced)
echo.
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python not found! Install from https://python.org
    pause
    exit /b 1
)
echo  Installing pdfplumber...
pip install pdfplumber >nul 2>&1
echo.
echo  Done! Advanced PDF extraction enabled.
pause
BATCH

echo "✓ Scripts created"

echo ""
echo "📦 Step 6: Creating README..."
cat > "$BUILD_DIR/README.txt" << 'README'
=============================================
  Core_Invoice v1.0.0
  Vendor Billing Management System
  "Precision in Every Payment"
=============================================

REQUIREMENTS:
  - Windows 10/11 (64-bit)
  - Node.js v18+ (https://nodejs.org)
  - [Optional] Python 3.10+ for advanced PO reading

HOW TO RUN:
  1. Install Node.js if not already installed
  2. Double-click "Run-CoreInvoice.bat"
  3. Browser opens at http://localhost:3001
  4. Login with admin / Admin@2026

ADMIN CREDENTIALS:
  User ID: admin
  Password: Admin@2026

FEATURES:
  * Animated Splash Screen (Vendy character)
  * User Registration with admin approval
  * Role-based access (Admin/Manager/Associate/Guest)
  * Admin Panel (users, analytics, security, data mgmt)
  * Dashboard with clickable KPI tiles
  * Vendor Management (CRUD + bulk upload)
  * Tax Invoice Generation
  * PO Reader - PDF upload & auto-extract (MCP)
  * PO Tracker (Current/Expired with auto-expire)
  * Notification system (bell icon)
  * Vendy AI Chatbot (Groq LLM powered)
  * Company Info Management
  * Billing Records & Payment Tracking
  * Work Completion Reports
  * User Profile & Password Management

PO READER (MCP) SETUP:
  For full PO PDF extraction accuracy:
  1. Install Python 3.10+ (https://python.org)
  2. Run "Setup-Python-MCP.bat"

AI CHATBOT (VENDY):
  Requires GROQ_API_KEY in server/.env
  Get free key from: https://console.groq.com

TO STOP:
  Close the command window or run "Stop-CoreInvoice.bat"
=============================================
README

echo "✓ README created"

# Create .env if not exists
if [ ! -f "$BUILD_DIR/server/.env" ]; then
cat > "$BUILD_DIR/server/.env" << 'ENV'
PORT=3001
JWT_SECRET=core-invoice-desktop-secret-2026
GROQ_API_KEY=
ENV
fi

# Final size
SIZE=$(du -sh "$BUILD_DIR" | cut -f1)
echo ""
echo "✅ Build complete!"
echo "📁 Output: dist-portable/Core-Invoice/"
echo "📊 Size: $SIZE"

# Create zip
echo ""
echo "📦 Creating zip..."
cd ~/Core_invoice/dist-portable
rm -f ~/Core_invoice/Core-Invoice-Desktop-v1.0.0.zip
zip -r ~/Core_invoice/Core-Invoice-Desktop-v1.0.0.zip Core-Invoice/ -q
ZIP_SIZE=$(du -sh ~/Core_invoice/Core-Invoice-Desktop-v1.0.0.zip | cut -f1)
echo "✓ Zip: Core-Invoice-Desktop-v1.0.0.zip ($ZIP_SIZE)"
echo ""
echo "Done! Copy the zip to any Windows PC with Node.js installed."
