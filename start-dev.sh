#!/bin/bash
# Core Invoice - Dev Server Startup Script
# Run this once to start both backend and frontend

PROJECT_DIR="$HOME/Core_Invoice-main/Core_Invoice-main"

echo "========================================="
echo "  Core Invoice - Starting Dev Servers"
echo "========================================="

# Fix PATH to use Linux Node.js
export PATH="/usr/bin:$PATH"

cd "$PROJECT_DIR"

# Start backend in background
echo ""
echo "Starting backend server on http://localhost:3001 ..."
npm run dev:server &
BACKEND_PID=$!

# Wait a moment for backend to initialize
sleep 3

# Start frontend in background
echo ""
echo "Starting frontend on http://localhost:5173 ..."
npm run dev:client &
FRONTEND_PID=$!

echo ""
echo "========================================="
echo "  Both servers are running!"
echo "  Frontend : http://localhost:5173"
echo "  Backend  : http://localhost:3001"
echo "  Press Ctrl+C to stop both servers"
echo "========================================="

# Wait and handle Ctrl+C to kill both
trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
