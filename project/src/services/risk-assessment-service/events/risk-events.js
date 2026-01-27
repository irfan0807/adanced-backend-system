export class TransactionRiskAssessedEvent {
  constructor(data) {
    this.id = data.id;
    this.transactionId = data.transactionId;
    this.riskScore = data.riskScore;
    this.riskLevel = data.riskLevel;
    this.factors = data.factors || [];
    this.recommendations = data.recommendations || [];
    this.assessedAt = data.assessedAt || new Date();
    this.assessedBy = data.assessedBy;
  }
}

export class UserRiskProfileUpdatedEvent {
  constructor(data) {
    this.id = data.id;
    this.userId = data.userId;
    this.riskScore = data.riskScore;
    this.riskLevel = data.riskLevel;
    this.factors = data.factors || [];
    this.behavioralInsights = data.behavioralInsights || {};
    this.updatedAt = data.updatedAt || new Date();
  }
}

export class MerchantRiskProfileUpdatedEvent {
  constructor(data) {
    this.id = data.id;
    this.merchantId = data.merchantId;
    this.riskScore = data.riskScore;
    this.riskLevel = data.riskLevel;
    this.factors = data.factors || [];
    this.businessInsights = data.businessInsights || {};
    this.updatedAt = data.updatedAt || new Date();
  }
}

export class RiskRuleCreatedEvent {
  constructor(data) {
    this.id = data.id;
    this.ruleId = data.ruleId;
    this.name = data.name;
    this.ruleType = data.ruleType;
    this.conditions = data.conditions;
    this.actions = data.actions;
    this.priority = data.priority;
    this.createdBy = data.createdBy;
    this.createdAt = data.createdAt || new Date();
  }
}

export class RiskRuleUpdatedEvent {
  constructor(data) {
    this.id = data.id;
    this.ruleId = data.ruleId;
    this.updates = data.updates;
    this.updatedBy = data.updatedBy;
    this.updatedAt = data.updatedAt || new Date();
  }
}

export class RiskActionExecutedEvent {
  constructor(data) {
    this.id = data.id;
    this.assessmentId = data.assessmentId;
    this.actionType = data.actionType;
    this.result = data.result;
    this.executedAt = data.executedAt || new Date();
    this.executedBy = data.executedBy;
  }
}

export class RiskAssessmentReviewedEvent {
  constructor(data) {
    this.id = data.id;
    this.assessmentId = data.assessmentId;
    this.reviewDecision = data.reviewDecision;
    this.reviewNotes = data.reviewNotes;
    this.reviewedBy = data.reviewedBy;
    this.reviewedAt = data.reviewedAt || new Date();
  }
}

export class RiskThresholdUpdatedEvent {
  constructor(data) {
    this.id = data.id;
    this.thresholdType = data.thresholdType;
    this.oldValue = data.oldValue;
    this.newValue = data.newValue;
    this.currency = data.currency;
    this.timeWindow = data.timeWindow;
    this.updatedBy = data.updatedBy;
    this.updatedAt = data.updatedAt || new Date();
  }
}

export class RiskAlertTriggeredEvent {
  constructor(data) {
    this.id = data.id;
    this.alertType = data.alertType;
    this.severity = data.severity;
    this.message = data.message;
    this.context = data.context || {};
    this.triggeredAt = data.triggeredAt || new Date();
    this.associatedEntities = data.associatedEntities || [];
  }
}

export class RiskMetricsUpdatedEvent {
  constructor(data) {
    this.id = data.id;
    this.metricType = data.metricType;
    this.value = data.value;
    this.previousValue = data.previousValue;
    this.change = data.change;
    this.timeRange = data.timeRange;
    this.updatedAt = data.updatedAt || new Date();
  }
}

export class FraudPatternDetectedEvent {
  constructor(data) {
    this.id = data.id;
    this.patternType = data.patternType;
    this.confidence = data.confidence;
    this.affectedEntities = data.affectedEntities || [];
    this.patternData = data.patternData || {};
    this.detectedAt = data.detectedAt || new Date();
    this.recommendedActions = data.recommendedActions || [];
  }
}

export class RiskReportGeneratedEvent {
  constructor(data) {
    this.id = data.id;
    this.reportId = data.reportId;
    this.reportType = data.reportType;
    this.summary = data.summary || {};
    this.generatedBy = data.generatedBy;
    this.generatedAt = data.generatedAt || new Date();
  }
}