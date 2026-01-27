-- Reporting Service Database Migration
-- This script creates all necessary tables for the reporting service

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(36) PRIMARY KEY,
  report_type VARCHAR(50) NOT NULL,
  parameters JSON,
  data JSON,
  format VARCHAR(10) DEFAULT 'json',
  status ENUM('generating', 'completed', 'failed') DEFAULT 'generating',
  generated_by VARCHAR(36),
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  execution_time_ms INT,
  file_size_bytes BIGINT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_report_type (report_type),
  INDEX idx_generated_by (generated_by),
  INDEX idx_generated_at (generated_at),
  INDEX idx_status (status)
);

-- Scheduled reports table
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  report_type VARCHAR(50) NOT NULL,
  schedule VARCHAR(100) NOT NULL, -- cron expression
  parameters JSON,
  format VARCHAR(10) DEFAULT 'json',
  recipients JSON, -- array of email addresses or user IDs
  delivery_method ENUM('email', 'api', 'webhook') DEFAULT 'email',
  is_active BOOLEAN DEFAULT TRUE,
  created_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_run TIMESTAMP NULL,
  next_run TIMESTAMP NULL,
  last_run_status ENUM('success', 'failed', 'running') DEFAULT NULL,
  last_run_error TEXT,
  run_count INT DEFAULT 0,
  INDEX idx_report_type (report_type),
  INDEX idx_created_by (created_by),
  INDEX idx_is_active (is_active),
  INDEX idx_next_run (next_run)
);

-- Report templates table
CREATE TABLE IF NOT EXISTS report_templates (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  report_type VARCHAR(50) NOT NULL,
  template JSON, -- template configuration
  parameters JSON, -- default parameters
  filters JSON, -- available filters
  visualizations JSON, -- visualization configurations
  is_public BOOLEAN DEFAULT FALSE,
  created_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  usage_count INT DEFAULT 0,
  last_used_at TIMESTAMP NULL,
  tags JSON, -- array of tags
  INDEX idx_report_type (report_type),
  INDEX idx_created_by (created_by),
  INDEX idx_is_public (is_public),
  INDEX idx_tags (tags),
  FULLTEXT idx_name_description (name, description)
);

-- Dashboards table
CREATE TABLE IF NOT EXISTS dashboards (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  widgets JSON, -- array of widget configurations
  layout JSON, -- layout configuration
  filters JSON, -- dashboard-level filters
  refresh_interval INT DEFAULT 300, -- seconds
  is_public BOOLEAN DEFAULT FALSE,
  created_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_viewed_at TIMESTAMP NULL,
  view_count INT DEFAULT 0,
  tags JSON, -- array of tags
  INDEX idx_created_by (created_by),
  INDEX idx_is_public (is_public),
  INDEX idx_tags (tags),
  FULLTEXT idx_name_description (name, description)
);

-- Report cache table
CREATE TABLE IF NOT EXISTS report_cache (
  cache_key VARCHAR(255) PRIMARY KEY,
  report_type VARCHAR(50) NOT NULL,
  parameters_hash VARCHAR(64) NOT NULL,
  data JSON,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  access_count INT DEFAULT 0,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_report_type (report_type),
  INDEX idx_parameters_hash (parameters_hash),
  INDEX idx_expires_at (expires_at),
  INDEX idx_last_accessed_at (last_accessed_at)
);

-- Report exports table
CREATE TABLE IF NOT EXISTS report_exports (
  id VARCHAR(36) PRIMARY KEY,
  report_id VARCHAR(36),
  format VARCHAR(10) NOT NULL,
  filters JSON,
  file_path VARCHAR(500),
  file_size_bytes BIGINT,
  download_count INT DEFAULT 0,
  expires_at TIMESTAMP,
  created_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_downloaded_at TIMESTAMP NULL,
  INDEX idx_report_id (report_id),
  INDEX idx_created_by (created_by),
  INDEX idx_expires_at (expires_at),
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

-- Report analytics table
CREATE TABLE IF NOT EXISTS report_analytics (
  id VARCHAR(36) PRIMARY KEY,
  report_id VARCHAR(36),
  user_id VARCHAR(36),
  action ENUM('generated', 'viewed', 'exported', 'shared', 'scheduled'),
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_report_id (report_id),
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

-- Event analytics table for real-time metrics
CREATE TABLE IF NOT EXISTS event_analytics (
  id VARCHAR(36) PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  event_data JSON,
  aggregated_data JSON,
  time_bucket TIMESTAMP NOT NULL, -- e.g., hourly buckets
  bucket_type ENUM('minute', 'hour', 'day', 'week', 'month') DEFAULT 'hour',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_event_type (event_type),
  INDEX idx_time_bucket (time_bucket),
  INDEX idx_bucket_type (bucket_type)
);

-- Data sources table
CREATE TABLE IF NOT EXISTS data_sources (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type ENUM('database', 'api', 'file', 'stream') NOT NULL,
  connection_config JSON, -- encrypted connection details
  schema_definition JSON, -- table/field definitions
  refresh_interval INT, -- seconds
  last_refresh TIMESTAMP NULL,
  status ENUM('active', 'inactive', 'error') DEFAULT 'active',
  error_message TEXT,
  created_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_type (type),
  INDEX idx_status (status),
  INDEX idx_created_by (created_by)
);

-- Report execution history table
CREATE TABLE IF NOT EXISTS report_execution_history (
  id VARCHAR(36) PRIMARY KEY,
  report_id VARCHAR(36),
  scheduled_report_id VARCHAR(36),
  status ENUM('started', 'completed', 'failed', 'cancelled') NOT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  execution_time_ms INT,
  error_message TEXT,
  parameters JSON,
  result_summary JSON,
  INDEX idx_report_id (report_id),
  INDEX idx_scheduled_report_id (scheduled_report_id),
  INDEX idx_status (status),
  INDEX idx_started_at (started_at),
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  FOREIGN KEY (scheduled_report_id) REFERENCES scheduled_reports(id) ON DELETE CASCADE
);

-- Template usage analytics table
CREATE TABLE IF NOT EXISTS template_usage_analytics (
  id VARCHAR(36) PRIMARY KEY,
  template_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36),
  action ENUM('used', 'viewed', 'modified', 'shared'),
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_template_id (template_id),
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (template_id) REFERENCES report_templates(id) ON DELETE CASCADE
);

-- Dashboard usage analytics table
CREATE TABLE IF NOT EXISTS dashboard_usage_analytics (
  id VARCHAR(36) PRIMARY KEY,
  dashboard_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36),
  action ENUM('viewed', 'modified', 'shared', 'exported'),
  session_duration INT, -- seconds
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dashboard_id (dashboard_id),
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
);

-- Insert sample data for testing
INSERT IGNORE INTO report_templates (id, name, description, report_type, template, parameters, filters, visualizations, is_public, created_by, tags) VALUES
('template-001', 'Transaction Summary Template', 'Standard transaction summary report template', 'transaction-summary',
 '{"layout": "standard", "sections": ["summary", "charts", "details"]}',
 '{"dateRange": {"default": "last_30_days"}, "groupBy": {"default": "day"}}',
 '[{"name": "status", "type": "select", "options": ["all", "completed", "pending", "failed"]}, {"name": "currency", "type": "select", "options": ["all", "USD", "EUR", "GBP"]}]',
 '[{"type": "line_chart", "data": "transaction_volume_over_time"}, {"type": "pie_chart", "data": "status_breakdown"}]',
 TRUE, 'system', '["finance", "transactions", "summary"]');

INSERT IGNORE INTO dashboards (id, name, description, widgets, layout, filters, refresh_interval, is_public, created_by, tags) VALUES
('dashboard-001', 'Executive Overview', 'High-level business metrics dashboard',
 '[{"id": "widget-001", "type": "metric", "title": "Total Revenue", "dataSource": "transactions", "config": {"metric": "sum", "field": "amount"}}, {"id": "widget-002", "type": "chart", "title": "Revenue Trend", "dataSource": "transactions", "config": {"chartType": "line", "xAxis": "date", "yAxis": "amount"}}]',
 '{"columns": 3, "rows": 2}',
 '{}',
 300, TRUE, 'system', '["executive", "overview", "finance"]');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reports_composite ON reports (report_type, status, generated_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_composite ON scheduled_reports (is_active, next_run, report_type);
CREATE INDEX IF NOT EXISTS idx_report_cache_composite ON report_cache (report_type, expires_at, last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_event_analytics_composite ON event_analytics (event_type, time_bucket, bucket_type);
CREATE INDEX IF NOT EXISTS idx_report_execution_composite ON report_execution_history (status, started_at, report_id);