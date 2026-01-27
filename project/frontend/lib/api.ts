import axios from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/signin'
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  register: (userData: any) => api.post('/api/user/register', userData),
  login: (credentials: any) => api.post('/api/user/login', credentials),
  getProfile: () => api.get('/api/user/profile'),
}

export const accountAPI = {
  getAccounts: () => api.get('/api/account'),
  getAccount: (id: string) => api.get(`/api/account/${id}`),
  createAccount: (accountData: any) => api.post('/api/account', accountData),
  deposit: (depositData: any) => api.post('/api/account/deposit', depositData),
  withdraw: (withdrawData: any) => api.post('/api/account/withdraw', withdrawData),
}

export const transactionAPI = {
  getTransactions: () => api.get('/api/transaction/user/transactions'),
  createTransaction: (transactionData: any) => api.post('/api/transaction', transactionData),
  transfer: (transferData: any) => api.post('/api/transaction/transfer', transferData),
  getTransaction: (id: string) => api.get(`/api/transaction/${id}`),
}

export const paymentAPI = {
  processPayment: (paymentData: any) => api.post('/api/payment/process', paymentData),
  getPaymentHistory: () => api.get('/api/payment/history'),
  refund: (refundData: any) => api.post('/api/payment/refund', refundData),
}

export default api