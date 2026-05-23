# Core-Invoice Windows Desktop Build Script
# Run this from PowerShell in the project root directory
# Prerequisites: Node.js installed on Windows

Write-Host "🧾 Core-Invoice Desktop Build" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = $PSScriptRoot
if (-not $projectRoot) { $projectRoot = Get-Location }

# Check Node.js
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "❌ Node.js not found! Please install Node.js first." -ForegroundColor Red
    exit 1
}
Write-Host "✓ Node.js: $nodeVersion" -ForegroundColor Green

# Step 1: Install dependencies
Write-Host ""
Write-Host "📦 Step 1: Installing dependencies..." -ForegroundColor Yellow
Set-Location $projectRoot
npm install --legacy-peer-deps 2>$null
Set-Location "$projectRoot\server"
npm install --legacy-peer-deps 2>$null
Set-Location "$projectRoot\client"
npm install --legacy-peer-deps 2>$null
Set-Location $projectRoot

# Step 2: Build server
Write-Host ""
Write-Host "📦 Step 2: Building server..." -ForegroundColor Yellow
Set-Location "$projectRoot\server"
npx tsc
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Server build failed!" -ForegroundColor Red
    Set-Location $projectRoot
    exit 1
}
Write-Host "✓ Server built" -ForegroundColor Green

# Step 3: Build client
Write-Host ""
Write-Host "📦 Step 3: Building client..." -ForegroundColor Yellow
Set-Location "$projectRoot\client"
npx vite build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Client build failed!" -ForegroundColor Red
    Set-Location $projectRoot
    exit 1
}
Write-Host "✓ Client built" -ForegroundColor Green

# Step 4: Package as Windows installer
Write-Host ""
Write-Host "📦 Step 4: Packaging as Windows .exe installer..." -ForegroundColor Yellow
Set-Location $projectRoot
npx electron-builder --win --config electron-builder.json
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Electron build failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Build complete!" -ForegroundColor Green
Write-Host "📁 Installer is in: dist-electron\" -ForegroundColor Cyan
Write-Host "   Look for: Core-Invoice Setup 1.0.0.exe" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now install this .exe on any Windows PC!" -ForegroundColor White

Set-Location $projectRoot
