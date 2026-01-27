#!/bin/bash

# Advanced Transaction Microservices System - Safe Startup Script
# This script starts all services in the correct order for safe operation

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_ENV="${NODE_ENV:-test}"  # Default to test mode
START_FRONTEND="${START_FRONTEND:-true}"  # Start frontend by default

# Service ports
API_GATEWAY_PORT=3000
USER_SERVICE_PORT=3001
ACCOUNT_SERVICE_PORT=3002
TRANSACTION_SERVICE_PORT=3003
PAYMENT_SERVICE_PORT=3004
NOTIFICATION_SERVICE_PORT=3005
AUDIT_SERVICE_PORT=3006
ANALYTICS_SERVICE_PORT=3007
RISK_SERVICE_PORT=3008
CURRENCY_SERVICE_PORT=3009
SETTLEMENT_SERVICE_PORT=3010
REPORTING_SERVICE_PORT=3011
EVENTSTORE_SERVICE_PORT=3012

# Process IDs
declare -a PIDS=()

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Shutting down all services...${NC}"

    # Kill all background processes
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            echo "Stopping process $pid"
            kill "$pid" 2>/dev/null || true
        fi
    done

    # Force kill any remaining processes on our ports
    for port in 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010 3011 3012; do
        lsof -ti:"$port" | xargs kill -9 2>/dev/null || true
    done

    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

# Trap signals
trap cleanup SIGINT SIGTERM

# Function to check if port is available
check_port() {
    local port=$1
    local service_name=$2

    if lsof -Pi :"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${RED}Error: Port $port is already in use ($service_name)${NC}"
        return 1
    fi
    return 0
}

# Function to wait for service to be ready
wait_for_service() {
    local port=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1

    echo -e "${BLUE}Waiting for $service_name to be ready on port $port...${NC}"

    while [ $attempt -le $max_attempts ]; do
        if curl -s "http://localhost:$port/health" >/dev/null 2>&1; then
            echo -e "${GREEN}✓ $service_name is ready${NC}"
            return 0
        fi

        # Check if process is still running
        if ! kill -0 "${PIDS[-1]}" 2>/dev/null; then
            echo -e "${RED}✗ $service_name failed to start${NC}"
            return 1
        fi

        echo -n "."
        sleep 2
        ((attempt++))
    done

    echo -e "${RED}✗ $service_name failed to respond within timeout${NC}"
    return 1
}

# Function to start a service
start_service() {
    local service_name=$1
    local start_command=$2
    local port=$3

    echo -e "${BLUE}Starting $service_name...${NC}"

    # Check if port is available
    if ! check_port "$port" "$service_name"; then
        return 1
    fi

    # Start service in background
    cd "$PROJECT_DIR"
    NODE_ENV="$NODE_ENV" $start_command &
    local pid=$!
    PIDS+=("$pid")

    echo -e "${GREEN}✓ $service_name started (PID: $pid)${NC}"

    # Wait a moment for service to bind to port
    sleep 2

    return 0
}

# Function to start microservices in parallel
start_microservices() {
    echo -e "${YELLOW}Starting microservices...${NC}"

    # Start core services first
    start_service "User Service" "npm run start:user" "$USER_SERVICE_PORT" &
    start_service "Account Service" "npm run start:account" "$ACCOUNT_SERVICE_PORT" &
    start_service "Transaction Service" "npm run start:transaction" "$TRANSACTION_SERVICE_PORT" &
    start_service "Payment Service" "npm run start:payment" "$PAYMENT_SERVICE_PORT" &

    # Wait for core services
    wait 2>/dev/null || true

    # Start supporting services
    start_service "Notification Service" "npm run start:notification" "$NOTIFICATION_SERVICE_PORT" &
    start_service "Audit Service" "npm run start:audit" "$AUDIT_SERVICE_PORT" &
    start_service "Analytics Service" "npm run start:analytics" "$ANALYTICS_SERVICE_PORT" &
    start_service "Risk Assessment Service" "npm run start:risk" "$RISK_SERVICE_PORT" &
    start_service "Currency Service" "npm run start:currency" "$CURRENCY_SERVICE_PORT" &
    start_service "Settlement Service" "npm run start:settlement" "$SETTLEMENT_SERVICE_PORT" &
    start_service "Reporting Service" "npm run start:reporting" "$REPORTING_SERVICE_PORT" &
    start_service "Event Store Service" "npm run start:eventstore" "$EVENTSTORE_SERVICE_PORT" &

    # Wait for all microservices to start
    wait 2>/dev/null || true

    echo -e "${GREEN}✓ All microservices started${NC}"
}

# Main startup sequence
main() {
    echo -e "${GREEN}🚀 Advanced Transaction Microservices System - Safe Startup${NC}"
    echo -e "${BLUE}Environment: $NODE_ENV${NC}"
    echo -e "${BLUE}Project Directory: $PROJECT_DIR${NC}"
    echo ""

    # Check if we're in the right directory
    if [ ! -f "package.json" ]; then
        echo -e "${RED}Error: package.json not found. Please run this script from the project root.${NC}"
        exit 1
    fi

    # Install frontend dependencies if needed
    if [ "$START_FRONTEND" = "true" ] && [ ! -d "frontend/node_modules" ]; then
        echo -e "${YELLOW}Installing frontend dependencies...${NC}"
        npm run install:frontend
    fi

    # Step 1: Start microservices
    start_microservices

    # Step 2: Start API Gateway
    echo -e "${YELLOW}Starting API Gateway...${NC}"
    start_service "API Gateway" "npm run start:gateway" "$API_GATEWAY_PORT"

    # Wait for API Gateway to be ready
    if ! wait_for_service "$API_GATEWAY_PORT" "API Gateway"; then
        echo -e "${RED}API Gateway failed to start properly${NC}"
        cleanup
        exit 1
    fi

    # Step 3: Start frontend (if requested)
    if [ "$START_FRONTEND" = "true" ]; then
        echo -e "${YELLOW}Starting Frontend...${NC}"
        start_service "Frontend" "npm run start:frontend" "3000"  # Next.js default port
    fi

    echo ""
    echo -e "${GREEN}🎉 All services started successfully!${NC}"
    echo ""
    echo -e "${BLUE}Service URLs:${NC}"
    echo -e "  API Gateway:     http://localhost:$API_GATEWAY_PORT"
    if [ "$START_FRONTEND" = "true" ]; then
        echo -e "  Frontend:        http://localhost:3000"
    fi
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"

    # Wait for user interrupt
    wait
}

# Show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help          Show this help message"
    echo "  -p, --production    Run in production mode (default: test mode)"
    echo "  --no-frontend       Don't start the frontend"
    echo "  -v, --verbose       Verbose output"
    echo ""
    echo "Environment Variables:"
    echo "  NODE_ENV           Set to 'production' for production mode"
    echo "  START_FRONTEND     Set to 'false' to skip frontend startup"
    echo ""
    echo "Examples:"
    echo "  $0                    # Start all services in test mode"
    echo "  $0 -p                 # Start all services in production mode"
    echo "  $0 --no-frontend      # Start backend only"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        -p|--production)
            NODE_ENV="production"
            shift
            ;;
        --no-frontend)
            START_FRONTEND="false"
            shift
            ;;
        -v|--verbose)
            set -x
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_usage
            exit 1
            ;;
    esac
done

# Run main function
main