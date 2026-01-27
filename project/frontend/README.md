# Transaction System Frontend

A modern Next.js frontend for the Advanced Transaction Microservices System.

## Features

- **User Authentication**: Sign up and sign in functionality
- **Account Management**: View account balances and details
- **Money Transfers**: Transfer money between accounts
- **Transaction History**: View detailed transaction history
- **Deposits**: Deposit money into accounts
- **Responsive Design**: Mobile-friendly interface with Tailwind CSS

## Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **Axios** - HTTP client for API calls
- **Lucide React** - Beautiful icons

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Backend services running (see main project README)

### Installation

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3001](http://localhost:3001) in your browser.

### From Root Directory

You can also run the frontend from the project root:

```bash
# Install frontend dependencies
npm run install:frontend

# Start frontend development server
npm run start:frontend
```

## API Integration

The frontend communicates with the backend through the API Gateway at `http://localhost:3000`. The Next.js proxy configuration automatically forwards API calls.

### Authentication Flow

1. **Sign Up**: Creates a new user account
2. **Sign In**: Authenticates user and stores JWT token
3. **Dashboard**: Protected routes that require authentication
4. **Auto Logout**: Automatically logs out on token expiration

### Key API Endpoints

- `POST /api/user/register` - User registration
- `POST /api/user/login` - User authentication
- `GET /api/account` - Get user accounts
- `POST /api/account/deposit` - Deposit money
- `POST /api/transaction/transfer` - Transfer money
- `GET /api/transaction/user/transactions` - Get transaction history

## Project Structure

```
frontend/
├── app/                    # Next.js App Router
│   ├── dashboard/         # Dashboard page
│   ├── signin/           # Sign in page
│   ├── signup/           # Sign up page
│   ├── globals.css       # Global styles
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Home page
├── lib/                   # Utility functions
│   └── api.ts            # API client
├── next.config.js        # Next.js configuration
├── package.json          # Dependencies
├── postcss.config.js     # PostCSS configuration
├── tailwind.config.js    # Tailwind CSS configuration
└── README.md            # This file
```

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Environment Variables

Create a `.env.local` file in the frontend directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Features Overview

### Authentication
- Secure user registration and login
- JWT token-based authentication
- Automatic token refresh and logout

### Dashboard
- Account overview with balances
- Recent transactions display
- Quick action buttons for deposits and transfers

### Account Management
- View all user accounts
- Account details and status
- Balance tracking

### Transactions
- Money transfer between accounts
- Transaction history with filtering
- Real-time transaction status updates

### Deposits
- Easy money deposit functionality
- Amount validation
- Instant balance updates

## Contributing

1. Follow the existing code style
2. Use TypeScript for type safety
3. Test API integrations thoroughly
4. Follow Next.js best practices

## Troubleshooting

### Common Issues

1. **API Connection Issues**: Ensure backend services are running on port 3000
2. **Authentication Problems**: Check that JWT tokens are properly stored
3. **Build Errors**: Ensure all dependencies are installed

### Development Tips

- Use the browser's developer tools to inspect API calls
- Check the Network tab for failed requests
- Verify CORS settings in the API Gateway
- Test with different user accounts for transaction features