#!/bin/bash
# Build script for Core-Invoice Desktop App (Windows .exe)
# Run this from the project root: bash build-desktop.sh

echo "🧾 Core-Invoice Desktop Build"
echo "=============================="

# Step 1: Build the server (TypeScript → JavaScript)
echo ""
echo "📦 Step 1: Building server..."
cd server
npm run build
cd ..

# Step 2: Build the client (React → static files)
echo ""
echo "📦 Step 2: Building client..."
cd client
npx vite build
cd ..

# Step 3: Install electron and electron-builder
echo ""
echo "📦 Step 3: Installing Electron dependencies..."
npm install --save-dev electron electron-builder --legacy-peer-deps

# Step 4: Package as Windows installer
echo ""
echo "📦 Step 4: Packaging as Windows .exe..."
npx electron-builder --win --config electron-builder.json

echo ""
echo "✅ Build complete!"
echo "📁 Installer is in: dist-electron/"
echo "   Look for: Core-Invoice Setup 1.0.0.exe"
