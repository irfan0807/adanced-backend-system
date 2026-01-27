'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
}

interface Account {
  id: string
  userId: string
  balance: number
  currency: string
  status: string
  createdAt: string
}

interface Transaction {
  id: string
  fromAccountId: string
  toAccountId: string
  amount: number
  currency: string
  type: string
  status: string
  description: string
  createdAt: string
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [transferData, setTransferData] = useState({
    toAccountId: '',
    amount: '',
    description: ''
  })
  const router = useRouter()

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = () => {
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')

    if (!token || !userData) {
      router.push('/signin')
      return
    }

    try {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadUserData(token)
    } catch (error) {
      router.push('/signin')
    }
  }

  const loadUserData = async (token: string) => {
    try {
      // Load accounts
      const accountsResponse = await axios.get('/api/account', {
        headers: { Authorization: `Bearer ${token}` }
      })
      setAccounts(accountsResponse.data.data || [])

      // Load recent transactions
      const transactionsResponse = await axios.get('/api/transaction/user/transactions', {
        headers: { Authorization: `Bearer ${token}` }
      })
      setTransactions(transactionsResponse.data.data || [])
    } catch (error) {
      console.error('Error loading user data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeposit = async () => {
    if (!user || !depositAmount) return

    try {
      const token = localStorage.getItem('token')
      await axios.post('/api/account/deposit', {
        userId: user.id,
        amount: parseFloat(depositAmount),
        currency: 'USD'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      setShowDepositModal(false)
      setDepositAmount('')
      // Reload accounts
      loadUserData(token!)
    } catch (error) {
      console.error('Deposit failed:', error)
    }
  }

  const handleTransfer = async () => {
    if (!user || !transferData.toAccountId || !transferData.amount) return

    try {
      const token = localStorage.getItem('token')
      await axios.post('/api/transaction/transfer', {
        fromUserId: user.id,
        toAccountId: transferData.toAccountId,
        amount: parseFloat(transferData.amount),
        description: transferData.description
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      setShowTransferModal(false)
      setTransferData({ toAccountId: '', amount: '', description: '' })
      // Reload data
      loadUserData(token!)
    } catch (error) {
      console.error('Transfer failed:', error)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">Welcome, {user?.firstName}</span>
              <button
                onClick={handleLogout}
                className="btn btn-secondary"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="mb-8">
          <nav className="flex space-x-8">
            {['overview', 'accounts', 'transactions', 'transfer'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Account Balance Card */}
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Account Balance</h3>
              {accounts.length > 0 ? (
                <div className="space-y-2">
                  {accounts.map((account) => (
                    <div key={account.id} className="flex justify-between">
                      <span className="text-gray-600">Account {account.id.slice(-8)}</span>
                      <span className="font-semibold">${account.balance.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 mt-4">
                    <div className="flex justify-between font-bold">
                      <span>Total Balance</span>
                      <span>${accounts.reduce((sum, acc) => sum + acc.balance, 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">No accounts found</p>
              )}
            </div>

            {/* Recent Transactions */}
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Recent Transactions</h3>
              {transactions.slice(0, 5).length > 0 ? (
                <div className="space-y-2">
                  {transactions.slice(0, 5).map((transaction) => (
                    <div key={transaction.id} className="flex justify-between text-sm">
                      <span className="text-gray-600 truncate">{transaction.description || 'Transaction'}</span>
                      <span className={`font-semibold ${transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                        {transaction.type === 'credit' ? '+' : '-'}${transaction.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No recent transactions</p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={() => setShowDepositModal(true)}
                  className="w-full btn btn-primary"
                >
                  Deposit Money
                </button>
                <button
                  onClick={() => setShowTransferModal(true)}
                  className="w-full btn btn-secondary"
                >
                  Transfer Money
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Accounts Tab */}
        {activeTab === 'accounts' && (
          <div className="card">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold">Your Accounts</h3>
              <button
                onClick={() => setShowDepositModal(true)}
                className="btn btn-primary"
              >
                Deposit
              </button>
            </div>
            {accounts.length > 0 ? (
              <div className="space-y-4">
                {accounts.map((account) => (
                  <div key={account.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-semibold">Account ID: {account.id}</p>
                        <p className="text-sm text-gray-600">Status: {account.status}</p>
                        <p className="text-sm text-gray-600">Created: {new Date(account.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-green-600">${account.balance.toFixed(2)}</p>
                        <p className="text-sm text-gray-600">{account.currency}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No accounts found. Please contact support.</p>
            )}
          </div>
        )}

        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
          <div className="card">
            <h3 className="text-lg font-semibold mb-6">Transaction History</h3>
            {transactions.length > 0 ? (
              <div className="space-y-4">
                {transactions.map((transaction) => (
                  <div key={transaction.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-semibold">{transaction.description || 'Transaction'}</p>
                        <p className="text-sm text-gray-600">ID: {transaction.id}</p>
                        <p className="text-sm text-gray-600">Date: {new Date(transaction.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-bold ${transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                          {transaction.type === 'credit' ? '+' : '-'}${transaction.amount.toFixed(2)}
                        </p>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          transaction.status === 'completed' ? 'bg-green-100 text-green-800' :
                          transaction.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {transaction.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No transactions found.</p>
            )}
          </div>
        )}

        {/* Transfer Tab */}
        {activeTab === 'transfer' && (
          <div className="card">
            <h3 className="text-lg font-semibold mb-6">Transfer Money</h3>
            <button
              onClick={() => setShowTransferModal(true)}
              className="btn btn-primary"
            >
              New Transfer
            </button>
          </div>
        )}
      </div>

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Deposit Money</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="Enter amount"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handleDeposit}
                  className="flex-1 btn btn-primary"
                  disabled={!depositAmount}
                >
                  Deposit
                </button>
                <button
                  onClick={() => setShowDepositModal(false)}
                  className="flex-1 btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Transfer Money</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recipient Account ID
                </label>
                <input
                  type="text"
                  className="input"
                  value={transferData.toAccountId}
                  onChange={(e) => setTransferData({...transferData, toAccountId: e.target.value})}
                  placeholder="Enter recipient account ID"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={transferData.amount}
                  onChange={(e) => setTransferData({...transferData, amount: e.target.value})}
                  placeholder="Enter amount"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  className="input"
                  value={transferData.description}
                  onChange={(e) => setTransferData({...transferData, description: e.target.value})}
                  placeholder="Transfer description"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handleTransfer}
                  className="flex-1 btn btn-primary"
                  disabled={!transferData.toAccountId || !transferData.amount}
                >
                  Transfer
                </button>
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}