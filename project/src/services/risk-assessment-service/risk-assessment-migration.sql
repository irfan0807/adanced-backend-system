-- Risk Assessment Service Database Migration
-- This script creates all necessary tables for the risk assessment service

-- Risk Assessments table
CREATE TABLE IF NOT EXISTS risk_assessments (
    id VARCHAR(36) PRIMARY KEY,
    transaction_id VARCHAR(36),
    user_id VARCHAR(36),
    merchant_id VARCHAR(36),
    risk_score DECIMAL(5,2) NOT NULL,
    risk_level ENUM('low', 'medium', 'high') NOT NULL,
    factors JSON,
    recommendations JSON,
    status ENUM('pending', 'approved', 'rejected', 'flagged') DEFAULT 'pending',
    review_decision ENUM('approved', 'rejected', 'escalated') NULL,
    review_notes TEXT,
    reviewed_by VARCHAR(36),
    reviewed_at TIMESTAMP NULL,
    assessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_user_id (user_id),
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_risk_level (risk_level),
    INDEX idx_status (status),
    INDEX idx_assessed_at (assessed_at)
);

-- User Risk Profiles table
CREATE TABLE IF NOT EXISTS user_risk_profiles (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL UNIQUE,
    risk_score DECIMAL(5,2) NOT NULL,
    risk_level ENUM('low', 'medium', 'high') NOT NULL,
    assessment_history JSON,
    behavioral_data JSON,
    last_assessment TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_risk_level (risk_level),
    INDEX idx_last_assessment (last_assessment)
);

-- Merchant Risk Profiles table
CREATE TABLE IF NOT EXISTS merchant_risk_profiles (
    id VARCHAR(36) PRIMARY KEY,
    merchant_id VARCHAR(36) NOT NULL UNIQUE,
    risk_score DECIMAL(5,2) NOT NULL,
    risk_level ENUM('low', 'medium', 'high') NOT NULL,
    transaction_volume DECIMAL(15,2) DEFAULT 0,
    chargeback_rate DECIMAL(5,4) DEFAULT 0,
    business_profile JSON,
    assessment_history JSON,
    last_assessment TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_risk_level (risk_level),
    INDEX idx_last_assessment (last_assessment)
);

-- Risk Rules table
CREATE TABLE IF NOT EXISTS risk_rules (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_type ENUM('transaction', 'user', 'merchant', 'global') NOT NULL,
    conditions JSON NOT NULL,
    actions JSON NOT NULL,
    priority INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_rule_type (rule_type),
    INDEX idx_is_active (is_active),
    INDEX idx_priority (priority)
);

-- Risk Alerts table
CREATE TABLE IF NOT EXISTS risk_alerts (
    id VARCHAR(36) PRIMARY KEY,
    alert_type ENUM('fraud_suspicion', 'unusual_activity', 'threshold_exceeded', 'rule_violation') NOT NULL,
    severity ENUM('low', 'medium', 'high', 'critical') NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    risk_assessment_id VARCHAR(36),
    user_id VARCHAR(36),
    merchant_id VARCHAR(36),
    transaction_id VARCHAR(36),
    alert_data JSON,
    status ENUM('active', 'acknowledged', 'resolved', 'dismissed') DEFAULT 'active',
    acknowledged_by VARCHAR(36),
    acknowledged_at TIMESTAMP NULL,
    resolved_by VARCHAR(36),
    resolved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_alert_type (alert_type),
    INDEX idx_severity (severity),
    INDEX idx_status (status),
    INDEX idx_user_id (user_id),
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_created_at (created_at)
);

-- Fraud Patterns table
CREATE TABLE IF NOT EXISTS fraud_patterns (
    id VARCHAR(36) PRIMARY KEY,
    pattern_type ENUM('velocity', 'amount_anomaly', 'location_anomaly', 'device_anomaly', 'behavioral') NOT NULL,
    pattern_data JSON NOT NULL,
    confidence DECIMAL(5,4) NOT NULL,
    affected_users JSON,
    affected_transactions JSON,
    detection_count INT DEFAULT 1,
    first_detected TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_detected TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pattern_type (pattern_type),
    INDEX idx_confidence (confidence),
    INDEX idx_is_active (is_active),
    INDEX idx_last_detected (last_detected)
);

-- Risk Thresholds table
CREATE TABLE IF NOT EXISTS risk_thresholds (
    id VARCHAR(36) PRIMARY KEY,
    threshold_type ENUM('transaction_amount', 'daily_volume', 'chargeback_rate', 'risk_score') NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    value DECIMAL(15,2) NOT NULL,
    time_window VARCHAR(20), -- e.g., '1h', '24h', '7d'
    is_active BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_threshold_type (threshold_type),
    INDEX idx_currency (currency),
    INDEX idx_is_active (is_active)
);

-- Risk Reports table
CREATE TABLE IF NOT EXISTS risk_reports (
    id VARCHAR(36) PRIMARY KEY,
    report_type ENUM('daily_summary', 'weekly_summary', 'monthly_summary', 'fraud_analysis', 'risk_trends') NOT NULL,
    title VARCHAR(255) NOT NULL,
    parameters JSON,
    report_data JSON,
    generated_by VARCHAR(36),
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_report_type (report_type),
    INDEX idx_generated_by (generated_by),
    INDEX idx_generated_at (generated_at)
);

-- Risk Analytics table
CREATE TABLE IF NOT EXISTS risk_analytics (
    id VARCHAR(36) PRIMARY KEY,
    analytics_type VARCHAR(100) NOT NULL,
    time_range VARCHAR(20) NOT NULL,
    group_by VARCHAR(20) NOT NULL,
    data JSON NOT NULL,
    trends JSON,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_analytics_type (analytics_type),
    INDEX idx_time_range (time_range),
    INDEX idx_generated_at (generated_at)
);

-- Risk Actions table
CREATE TABLE IF NOT EXISTS risk_actions (
    id VARCHAR(36) PRIMARY KEY,
    risk_assessment_id VARCHAR(36) NOT NULL,
    action_type ENUM('block_transaction', 'require_verification', 'limit_amount', 'flag_account', 'escalate_review') NOT NULL,
    parameters JSON,
    executed_by VARCHAR(36),
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    result JSON,
    status ENUM('pending', 'executed', 'failed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_risk_assessment_id (risk_assessment_id),
    INDEX idx_action_type (action_type),
    INDEX idx_status (status),
    INDEX idx_executed_at (executed_at)
);

-- Insert default risk rules
INSERT IGNORE INTO risk_rules (id, name, description, rule_type, conditions, actions, priority, is_active, created_by) VALUES
('rule-high-amount', 'High Amount Transaction', 'Flag transactions over $10,000', 'transaction',
 '{"amount": {"gt": 10000}}',
 '{"flag": true, "require_review": true, "alert_severity": "high"}',
 10, TRUE, 'system'),

('rule-velocity', 'High Velocity Transactions', 'Flag users with multiple transactions in short time', 'user',
 '{"transaction_count": {"gt": 5}, "time_window": "1h"}',
 '{"flag": true, "alert_severity": "medium", "limit_transactions": true}',
 8, TRUE, 'system'),

('rule-new-user', 'New User Risk', 'Higher risk for new users', 'user',
 '{"account_age_days": {"lt": 30}}',
 '{"increase_score": 15, "require_verification": true}',
 5, TRUE, 'system'),

('rule-location-anomaly', 'Location Anomaly', 'Flag transactions from unusual locations', 'transaction',
 '{"location_distance_km": {"gt": 500}}',
 '{"flag": true, "alert_severity": "medium", "require_verification": true}',
 7, TRUE, 'system');

-- Insert default risk thresholds
INSERT IGNORE INTO risk_thresholds (id, threshold_type, currency, value, time_window, is_active, created_by) VALUES
('threshold-daily-volume', 'daily_volume', 'USD', 50000.00, '24h', TRUE, 'system'),
('threshold-transaction-amount', 'transaction_amount', 'USD', 10000.00, NULL, TRUE, 'system'),
('threshold-chargeback-rate', 'chargeback_rate', NULL, 0.02, '30d', TRUE, 'system'),
('threshold-risk-score', 'risk_score', NULL, 70.00, NULL, TRUE, 'system');