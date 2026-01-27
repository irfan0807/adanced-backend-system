#!/bin/bash

# Quick Test Startup Script
# Starts essential services for testing in the correct order

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Starting Advanced Transaction Microservices System (Test Mode)"
echo "Project Directory: $PROJECT_DIR"
echo ""

# Cleanup function
cleanup() {
    echo -e "\n🛑 Shutting down services..."
    pkill -f "node.*server.js" || true
    pkill -f "next" || true
    for port in 3000 3001 3002 3003 3004 3005; do
        lsof -ti:"$port" | xargs kill -9 2>/dev/null || true
    done
    echo "✅ All services stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Clean up any existing processes first
echo "🧹 Cleaning up existing processes..."
pkill -f "node.*server.js" || true
pkill -f "next" || true
for port in 3000 3001 3002 3003 3004 3005; do
    lsof -ti:"$port" | xargs kill -9 2>/dev/null || true
done
sleep 2

# Start essential services
echo "📦 Starting Account Service..."
cd "$PROJECT_DIR" && NODE_ENV=test npm run start:account &
sleep 3

echo "💳 Starting Transaction Service..."
cd "$PROJECT_DIR" && NODE_ENV=test npm run start:transaction &
sleep 3

echo "💰 Starting Payment Service..."
cd "$PROJECT_DIR" && NODE_ENV=test npm run start:payment &
sleep 3

echo "🌐 Starting API Gateway..."
cd "$PROJECT_DIR" && NODE_ENV=test npm run start:gateway &
sleep 4

echo "🎨 Starting Frontend..."
cd "$PROJECT_DIR" && npm run start:frontend &
sleep 3

echo ""
echo "🎉 All services started successfully!"
echo ""
echo "📍 Service URLs:"
echo "  Frontend:        http://localhost:3000"
echo "  API Gateway:     http://localhost:3000/api/*"
echo "  Account API:     http://localhost:3000/api/account"
echo "  Transaction API: http://localhost:3000/api/transaction"
echo "  Payment API:     http://localhost:3000/api/payment"
echo ""
echo "🧪 Test Mode: Using in-memory databases and messaging"
echo "🛑 Press Ctrl+C to stop all services"

# Wait for interrupt
wait