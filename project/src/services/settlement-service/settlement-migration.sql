-- Settlement Service Database Migration
-- This script creates all necessary tables for the settlement service

-- Create settlements table
CREATE TABLE IF NOT EXISTS settlements (
  id VARCHAR(36) PRIMARY KEY,
  merchant_id VARCHAR(36) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status ENUM('pending', 'processing', 'processed', 'completed', 'cancelled', 'failed') DEFAULT 'pending',
  settlement_method ENUM('bank_transfer', 'wire_transfer', 'check', 'ach', 'crypto') DEFAULT 'bank_transfer',
  period_start_date DATETIME,
  period_end_date DATETIME,
  transaction_count INT DEFAULT 0,
  fee_amount DECIMAL(15,2) DEFAULT 0.00,
  net_amount DECIMAL(15,2) DEFAULT 0.00,
  reference_number VARCHAR(255),
  transfer_details JSON,
  processing_notes TEXT,
  completion_notes TEXT,
  cancellation_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  cancelled_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  processed_by VARCHAR(255),
  completed_by VARCHAR(255),
  cancelled_by VARCHAR(255),
  metadata JSON,
  INDEX idx_merchant_id (merchant_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_period_dates (period_start_date, period_end_date),
  INDEX idx_amount (amount)
);

-- Create settlement_transactions table (junction table)
CREATE TABLE IF NOT EXISTS settlement_transactions (
  id VARCHAR(36) PRIMARY KEY,
  settlement_id VARCHAR(36) NOT NULL,
  transaction_id VARCHAR(36) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  fee_amount DECIMAL(15,2) DEFAULT 0.00,
  net_amount DECIMAL(15,2) DEFAULT 0.00,
  currency VARCHAR(3) DEFAULT 'USD',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE CASCADE,
  UNIQUE KEY unique_settlement_transaction (settlement_id, transaction_id),
  INDEX idx_transaction_id (transaction_id),
  INDEX idx_settlement_id (settlement_id)
);

-- Create settlement_schedules table
CREATE TABLE IF NOT EXISTS settlement_schedules (
  id VARCHAR(36) PRIMARY KEY,
  merchant_id VARCHAR(36) NOT NULL,
  schedule_type ENUM('daily', 'weekly', 'monthly', 'custom') DEFAULT 'weekly',
  schedule_config JSON, -- Store cron expression or custom schedule details
  minimum_amount DECIMAL(15,2) DEFAULT 0.00,
  maximum_amount DECIMAL(15,2) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMP NULL,
  next_run_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  UNIQUE KEY unique_merchant_schedule (merchant_id),
  INDEX idx_is_active (is_active),
  INDEX idx_next_run_at (next_run_at)
);

-- Create settlement_holds table
CREATE TABLE IF NOT EXISTS settlement_holds (
  id VARCHAR(36) PRIMARY KEY,
  settlement_id VARCHAR(36) NOT NULL,
  hold_type ENUM('fraud', 'compliance', 'dispute', 'manual', 'system') DEFAULT 'manual',
  hold_reason TEXT NOT NULL,
  hold_amount DECIMAL(15,2) DEFAULT 0.00,
  status ENUM('active', 'released', 'expired') DEFAULT 'active',
  release_date TIMESTAMP NULL,
  released_at TIMESTAMP NULL,
  placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  placed_by VARCHAR(255),
  released_by VARCHAR(255),
  release_reason TEXT,
  metadata JSON,
  FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE CASCADE,
  INDEX idx_settlement_id (settlement_id),
  INDEX idx_status (status),
  INDEX idx_release_date (release_date),
  INDEX idx_hold_type (hold_type)
);

-- Create settlement_adjustments table
CREATE TABLE IF NOT EXISTS settlement_adjustments (
  id VARCHAR(36) PRIMARY KEY,
  settlement_id VARCHAR(36) NOT NULL,
  adjustment_type ENUM('fee_adjustment', 'chargeback', 'refund', 'correction', 'bonus', 'penalty') DEFAULT 'correction',
  adjustment_amount DECIMAL(15,2) NOT NULL,
  reason TEXT NOT NULL,
  reference_id VARCHAR(255),
  status ENUM('pending', 'applied', 'rejected') DEFAULT 'pending',
  applied_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  adjusted_by VARCHAR(255),
  approved_by VARCHAR(255),
  metadata JSON,
  FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE CASCADE,
  INDEX idx_settlement_id (settlement_id),
  INDEX idx_adjustment_type (adjustment_type),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);

-- Create settlement_analytics table
CREATE TABLE IF NOT EXISTS settlement_analytics (
  id VARCHAR(36) PRIMARY KEY,
  merchant_id VARCHAR(36),
  analytics_type VARCHAR(50) NOT NULL,
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  total_settlements INT DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0.00,
  total_fees DECIMAL(15,2) DEFAULT 0.00,
  average_settlement_amount DECIMAL(15,2) DEFAULT 0.00,
  settlement_success_rate DECIMAL(5,2) DEFAULT 0.00,
  processing_time_avg DECIMAL(10,2) DEFAULT 0.00, -- in minutes
  analytics_data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_merchant_id (merchant_id),
  INDEX idx_analytics_type (analytics_type),
  INDEX idx_period_dates (period_start_date, period_end_date),
  UNIQUE KEY unique_merchant_analytics (merchant_id, analytics_type, period_start_date, period_end_date)
);

-- Create settlement_reports table
CREATE TABLE IF NOT EXISTS settlement_reports (
  id VARCHAR(36) PRIMARY KEY,
  report_type ENUM('daily', 'weekly', 'monthly', 'custom') DEFAULT 'monthly',
  merchant_id VARCHAR(36),
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  report_data JSON,
  file_path VARCHAR(500),
  file_format ENUM('pdf', 'csv', 'xlsx', 'json') DEFAULT 'pdf',
  status ENUM('generating', 'completed', 'failed') DEFAULT 'generating',
  generated_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  generated_by VARCHAR(255),
  INDEX idx_merchant_id (merchant_id),
  INDEX idx_report_type (report_type),
  INDEX idx_period_dates (period_start_date, period_end_date),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);

-- Create settlement_reconciliation table
CREATE TABLE IF NOT EXISTS settlement_reconciliation (
  id VARCHAR(36) PRIMARY KEY,
  reconciliation_date DATE NOT NULL,
  merchant_id VARCHAR(36),
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  transaction_count INT DEFAULT 0,
  transaction_amount DECIMAL(15,2) DEFAULT 0.00,
  settlement_count INT DEFAULT 0,
  settlement_amount DECIMAL(15,2) DEFAULT 0.00,
  discrepancy_amount DECIMAL(15,2) DEFAULT 0.00,
  discrepancy_percentage DECIMAL(5,2) DEFAULT 0.00,
  status ENUM('matched', 'discrepancy', 'investigating', 'resolved') DEFAULT 'matched',
  reconciliation_notes TEXT,
  reconciled_by VARCHAR(255),
  reconciled_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_reconciliation_date (reconciliation_date),
  INDEX idx_merchant_id (merchant_id),
  INDEX idx_period_dates (period_start_date, period_end_date),
  INDEX idx_status (status),
  UNIQUE KEY unique_reconciliation (merchant_id, reconciliation_date)
);

-- Create settlement_audit_log table
CREATE TABLE IF NOT EXISTS settlement_audit_log (
  id VARCHAR(36) PRIMARY KEY,
  settlement_id VARCHAR(36),
  action_type VARCHAR(50) NOT NULL,
  action_description TEXT,
  old_values JSON,
  new_values JSON,
  performed_by VARCHAR(255),
  performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSON,
  INDEX idx_settlement_id (settlement_id),
  INDEX idx_action_type (action_type),
  INDEX idx_performed_at (performed_at),
  INDEX idx_performed_by (performed_by)
);

-- Insert default settlement schedules for existing merchants
-- This will be run separately after merchants table is confirmed to exist
-- INSERT IGNORE INTO settlement_schedules (id, merchant_id, schedule_type, schedule_config, minimum_amount, is_active, created_by)
-- SELECT UUID(), id, 'weekly', '{"dayOfWeek": 5, "time": "09:00"}', 100.00, true, 'system'
-- FROM merchants;

-- Create indexes for performance
CREATE INDEX idx_settlements_merchant_status_date ON settlements (merchant_id, status, created_at);
CREATE INDEX idx_settlements_amount_status ON settlements (amount, status);
CREATE INDEX idx_settlement_transactions_amount ON settlement_transactions (amount);
CREATE INDEX idx_settlement_holds_status_date ON settlement_holds (status, placed_at);
CREATE INDEX idx_settlement_adjustments_status_date ON settlement_adjustments (status, created_at);
CREATE INDEX idx_settlement_analytics_date_range ON settlement_analytics (period_start_date, period_end_date);
CREATE INDEX idx_settlement_reports_date_range ON settlement_reports (period_start_date, period_end_date);
CREATE INDEX idx_settlement_reconciliation_date_range ON settlement_reconciliation (period_start_date, period_end_date);