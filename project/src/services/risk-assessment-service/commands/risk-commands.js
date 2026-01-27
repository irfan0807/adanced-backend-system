import { v4 as uuidv4 } from 'uuid';

export class AssessTransactionRiskCommand {
  constructor(data) {
    this.id = uuidv4();
    this.transactionId = data.transactionId;
    this.amount = data.amount;
    this.userId = data.userId;
    this.merchantId = data.merchantId;
    this.location = data.location;
    this.deviceInfo = data.deviceInfo;
    this.paymentMethod = data.paymentMethod;
    this.transactionType = data.transactionType;
    this.timestamp = new Date();
  }

  validate() {
    if (!this.transactionId) throw new Error('Transaction ID is required');
    if (!this.amount || this.amount <= 0) throw new Error('Valid amount is required');
    if (!this.userId) throw new Error('User ID is required');
  }
}

export class AssessUserRiskCommand {
  constructor(data) {
    this.id = uuidv4();
    this.userId = data.userId;
    this.transactionHistory = data.transactionHistory || [];
    this.userProfile = data.userProfile || {};
    this.behavioralData = data.behavioralData || {};
    this.timestamp = new Date();
  }

  validate() {
    if (!this.userId) throw new Error('User ID is required');
  }
}

export class AssessMerchantRiskCommand {
  constructor(data) {
    this.id = uuidv4();
    this.merchantId = data.merchantId;
    this.transactionVolume = data.transactionVolume || 0;
    this.chargebackRate = data.chargebackRate || 0;
    this.businessProfile = data.businessProfile || {};
    this.timestamp = new Date();
  }

  validate() {
    if (!this.merchantId) throw new Error('Merchant ID is required');
  }
}

export class UpdateRiskRulesCommand {
  constructor(data) {
    this.id = uuidv4();
    this.ruleId = data.ruleId;
    this.ruleType = data.ruleType;
    this.conditions = data.conditions;
    this.actions = data.actions;
    this.priority = data.priority || 1;
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.updatedBy = data.updatedBy;
    this.timestamp = new Date();
  }

  validate() {
    if (!this.ruleId) throw new Error('Rule ID is required');
    if (!this.ruleType) throw new Error('Rule type is required');
    if (!this.conditions || !Array.isArray(this.conditions)) throw new Error('Conditions must be an array');
    if (!this.actions || !Array.isArray(this.actions)) throw new Error('Actions must be an array');
  }
}

export class CreateRiskRuleCommand {
  constructor(data) {
    this.id = uuidv4();
    this.name = data.name;
    this.description = data.description;
    this.ruleType = data.ruleType;
    this.conditions = data.conditions;
    this.actions = data.actions;
    this.priority = data.priority || 1;
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.createdBy = data.createdBy;
    this.timestamp = new Date();
  }

  validate() {
    if (!this.name) throw new Error('Rule name is required');
    if (!this.ruleType) throw new Error('Rule type is required');
    if (!this.conditions || !Array.isArray(this.conditions)) throw new Error('Conditions must be an array');
    if (!this.actions || !Array.isArray(this.actions)) throw new Error('Actions must be an array');
  }
}

export class ExecuteRiskActionCommand {
  constructor(data) {
    this.id = uuidv4();
    this.assessmentId = data.assessmentId;
    this.actionType = data.actionType;
    this.parameters = data.parameters || {};
    this.executedBy = data.executedBy;
    this.timestamp = new Date();
  }

  validate() {
    if (!this.assessmentId) throw new Error('Assessment ID is required');
    if (!this.actionType) throw new Error('Action type is required');
  }
}

export class ReviewRiskAssessmentCommand {
  constructor(data) {
    this.id = uuidv4();
    this.assessmentId = data.assessmentId;
    this.reviewDecision = data.reviewDecision; // 'approve', 'reject', 'escalate'
    this.reviewNotes = data.reviewNotes;
    this.reviewedBy = data.reviewedBy;
    this.timestamp = new Date();
  }

  validate() {
    if (!this.assessmentId) throw new Error('Assessment ID is required');
    if (!['approve', 'reject', 'escalate'].includes(this.reviewDecision)) {
      throw new Error('Invalid review decision');
    }
  }
}

export class UpdateRiskThresholdsCommand {
  constructor(data) {
    this.id = uuidv4();
    this.thresholdType = data.thresholdType;
    this.value = data.value;
    this.currency = data.currency || 'USD';
    this.timeWindow = data.timeWindow; // in minutes
    this.updatedBy = data.updatedBy;
    this.timestamp = new Date();
  }

  validate() {
    if (!this.thresholdType) throw new Error('Threshold type is required');
    if (this.value === undefined || this.value < 0) throw new Error('Valid threshold value is required');
  }
}

export class MonitorRiskMetricsCommand {
  constructor(data) {
    this.id = uuidv4();
    this.metricType = data.metricType;
    this.timeRange = data.timeRange || '1h';
    this.filters = data.filters || {};
    this.alertThresholds = data.alertThresholds || {};
    this.timestamp = new Date();
  }

  validate() {
    if (!this.metricType) throw new Error('Metric type is required');
  }
}

export class GenerateRiskReportCommand {
  constructor(data) {
    this.id = uuidv4();
    this.reportType = data.reportType;
    this.parameters = data.parameters || {};
    this.format = data.format || 'json';
    this.generatedBy = data.generatedBy;
    this.timestamp = new Date();
  }

  validate() {
    if (!this.reportType) throw new Error('Report type is required');
  }
}