# 🚀 Complete Transaction System Setup

This guide will help you get the **Advanced Transaction Microservices System** running with both backend services and frontend application.

## 📋 Prerequisites

- **Node.js 18+**
- **MongoDB** (running on default port 27017)
- **MySQL** (running on default port 3306)
- **Redis** (running on default port 6379)
- **Kafka + Zookeeper** (optional, for advanced messaging)
- **RabbitMQ** (optional, for message queuing)

## 🛠️ Quick Start

### 1. Install All Dependencies

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
npm run install:frontend
```

### 2. Set Up Environment Variables

Copy the example environment file and configure your database connections:

```bash
cp .env.example .env
```

Edit `.env` with your database credentials:

```env
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/transaction_system
MYSQL_HOST=localhost
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=transaction_system
REDIS_HOST=localhost

# Service Ports (already configured)
API_GATEWAY_PORT=3000
USER_SERVICE_PORT=3001
ACCOUNT_SERVICE_PORT=3002
TRANSACTION_SERVICE_PORT=3003
# ... other service ports

# JWT Secret (generate a secure random string)
JWT_SECRET=your_super_secure_jwt_secret_here
```

### 3. Start the Complete System

#### Option A: Start Everything Together (Recommended)
```bash
npm run dev
```
This starts the API Gateway, essential services (User, Account, Transaction), and the frontend.

#### Option B: Start Services Individually
```bash
# Terminal 1: Start API Gateway
npm run start:gateway

# Terminal 2: Start User Service
npm run start:user

# Terminal 3: Start Account Service
npm run start:account

# Terminal 4: Start Transaction Service
npm run start:transaction

# Terminal 5: Start Frontend
npm run start:frontend
```

## 🌐 Access the Application

Once everything is running, access:

- **🎨 Frontend Application**: http://localhost:3001
- **🚪 API Gateway**: http://localhost:3000
- **📊 Health Check**: http://localhost:3000/health

## 📱 Frontend Features

The Next.js frontend provides:

### 🔐 Authentication
- **Sign Up**: Create new user accounts
- **Sign In**: Secure login with JWT tokens
- **Auto Logout**: Automatic logout on token expiration

### 💰 Account Management
- **Dashboard**: Overview of accounts and recent transactions
- **Account Details**: View balance, status, and transaction history
- **Deposit Money**: Add funds to your accounts
- **Transfer Money**: Send money between accounts

### 📊 Transaction Features
- **Transaction History**: Complete list of all transactions
- **Real-time Updates**: Live balance and transaction status
- **Transfer Interface**: Easy money transfer with validation

## 🔧 Backend Services

### Core Services Running:
- **API Gateway** (Port 3000) - Routes requests to appropriate services
- **User Service** (Port 3001) - Handles authentication and user management
- **Account Service** (Port 3002) - Manages account balances and operations
- **Transaction Service** (Port 3003) - Processes all transaction logic

### Additional Services Available:
```bash
# Start additional services as needed
npm run start:payment      # Payment processing
npm run start:notification # Email/SMS notifications
npm run start:audit        # Audit logging
npm run start:analytics    # Real-time analytics
npm run start:risk         # Fraud detection
npm run start:currency     # Exchange rates
npm run start:settlement   # Merchant settlements
npm run start:reporting    # Business reports
npm run start:eventstore   # Event sourcing
```

## 🧪 Testing the System

### 1. Create a User Account
1. Open http://localhost:3001
2. Click "Sign Up"
3. Fill in your details and create an account
4. Sign in with your credentials

### 2. Test Transactions
1. Go to the Dashboard
2. Click "Deposit Money" to add funds
3. Try transferring money (you'll need another account)
4. Check transaction history

### 3. API Testing
```bash
# Check system health
curl http://localhost:3000/health

# Get service metrics
curl http://localhost:3000/metrics

# Test user registration (replace with your data)
curl -X POST http://localhost:3000/api/user/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

## 🐛 Troubleshooting

### Common Issues:

#### 1. **Frontend Won't Load**
- Ensure backend services are running
- Check that port 3000 (API Gateway) is accessible
- Verify environment variables are set correctly

#### 2. **Database Connection Errors**
- Ensure MongoDB and MySQL are running
- Check database credentials in `.env`
- Verify database names exist

#### 3. **Authentication Issues**
- Check JWT_SECRET is set in `.env`
- Ensure user service is running on port 3001
- Clear browser localStorage and try again

#### 4. **Transaction Failures**
- Verify account service is running (port 3002)
- Check account balances before transfers
- Ensure transaction service is running (port 3003)

### Logs and Debugging:
```bash
# Check service logs in the logs/ directory
tail -f logs/api-gateway.log
tail -f logs/user-service.log
tail -f logs/transaction-service.log

# Check frontend console for errors
# Open browser DevTools → Console tab
```

## 📁 Project Structure

```
project/
├── frontend/              # Next.js React application
│   ├── app/              # Next.js 13+ app router
│   ├── lib/              # API utilities
│   └── package.json      # Frontend dependencies
├── src/
│   ├── api-gateway/      # API Gateway service
│   ├── services/         # All microservices
│   └── shared/           # Shared utilities and patterns
├── logs/                 # Application logs
├── package.json          # Backend dependencies
├── .env                  # Environment configuration
└── README.md            # This file
```

## 🚀 Production Deployment

For production deployment:

1. **Build the frontend**:
   ```bash
   cd frontend && npm run build
   ```

2. **Set production environment variables**

3. **Use process manager** (PM2, Docker, Kubernetes)

4. **Set up reverse proxy** (Nginx, Caddy)

5. **Configure SSL certificates**

6. **Set up monitoring** (Prometheus, Grafana)

## 📞 Support

If you encounter issues:

1. Check the logs in the `logs/` directory
2. Verify all prerequisites are installed and running
3. Ensure environment variables are correctly configured
4. Test individual services before running the full system

## 🎯 Next Steps

Once the system is running, you can:

- **Explore Advanced Features**: Circuit breakers, rate limiting, event sourcing
- **Add More Services**: Payment gateways, notification channels
- **Implement Monitoring**: Add Prometheus metrics and Grafana dashboards
- **Scale the System**: Deploy to Kubernetes or Docker Swarm
- **Add Testing**: Write unit and integration tests

---

**🎉 Congratulations!** You now have a fully functional transaction microservices system with a modern frontend interface. The system demonstrates advanced patterns like circuit breakers, event sourcing, CQRS, and more!