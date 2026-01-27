import {
  GetRiskAssessmentQuery,
  GetRiskAssessmentsQuery,
  GetUserRiskProfileQuery,
  GetMerchantRiskProfileQuery,
  GetRiskRulesQuery,
  GetRiskRuleQuery,
  GetRiskMetricsQuery,
  GetRiskAlertsQuery,
  GetFraudPatternsQuery,
  GetRiskThresholdsQuery,
  GetRiskReportQuery,
  GetRiskReportsQuery,
  GetRiskDashboardQuery,
  GetRiskAnalyticsQuery
} from '../queries/risk-queries.js';

export class RiskAssessmentQueryHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.logger = dependencies.logger;
    this.cache = new Map(); // Simple in-memory cache
  }

  async handle(query) {
    try {
      query.validate && query.validate();

      switch (query.constructor.name) {
        case 'GetRiskAssessmentQuery':
          return await this.handleGetRiskAssessment(query);
        case 'GetRiskAssessmentsQuery':
          return await this.handleGetRiskAssessments(query);
        case 'GetUserRiskProfileQuery':
          return await this.handleGetUserRiskProfile(query);
        case 'GetMerchantRiskProfileQuery':
          return await this.handleGetMerchantRiskProfile(query);
        case 'GetRiskRulesQuery':
          return await this.handleGetRiskRules(query);
        case 'GetRiskRuleQuery':
          return await this.handleGetRiskRule(query);
        case 'GetRiskMetricsQuery':
          return await this.handleGetRiskMetrics(query);
        case 'GetRiskAlertsQuery':
          return await this.handleGetRiskAlerts(query);
        case 'GetFraudPatternsQuery':
          return await this.handleGetFraudPatterns(query);
        case 'GetRiskThresholdsQuery':
          return await this.handleGetRiskThresholds(query);
        case 'GetRiskReportQuery':
          return await this.handleGetRiskReport(query);
        case 'GetRiskReportsQuery':
          return await this.handleGetRiskReports(query);
        case 'GetRiskDashboardQuery':
          return await this.handleGetRiskDashboard(query);
        case 'GetRiskAnalyticsQuery':
          return await this.handleGetRiskAnalytics(query);
        default:
          throw new Error(`Unknown query type: ${query.constructor.name}`);
      }
    } catch (error) {
      this.logger.error('Error handling query:', error);
      throw error;
    }
  }

  async handleGetRiskAssessment(query) {
    try {
      const { assessmentId, includeDetails } = query;

      const cacheKey = `assessment:${assessmentId}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const assessment = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT * FROM risk_assessments WHERE id = ?`,
          [assessmentId]
        );
        return rows[0];
      });

      if (!assessment) {
        return null;
      }

      // Parse JSON fields
      const result = {
        ...assessment,
        factors: JSON.parse(assessment.factors || '[]'),
        fraudPatterns: JSON.parse(assessment.fraud_patterns || '[]'),
        triggeredRules: JSON.parse(assessment.triggered_rules || '[]'),
        recommendations: JSON.parse(assessment.recommendations || '[]'),
        assessedAt: assessment.assessed_at,
        createdAt: assessment.created_at,
        updatedAt: assessment.updated_at
      };

      if (includeDetails) {
        // Add additional details if requested
        result.transactionDetails = await this.getTransactionDetails(assessment.transaction_id);
        result.userDetails = await this.getUserDetails(assessment.user_id);
        result.merchantDetails = await this.getMerchantDetails(assessment.merchant_id);
      }

      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      this.logger.error('Error getting risk assessment:', error);
      throw error;
    }
  }

  async handleGetRiskAssessments(query) {
    try {
      const { filters = {}, sortBy, sortOrder, limit, offset, includeDetails } = query;

      let whereClause = 'WHERE 1=1';
      const params = [];

      // Build filters
      if (filters.riskLevel) {
        whereClause += ' AND risk_level = ?';
        params.push(filters.riskLevel);
      }

      if (filters.userId) {
        whereClause += ' AND user_id = ?';
        params.push(filters.userId);
      }

      if (filters.merchantId) {
        whereClause += ' AND merchant_id = ?';
        params.push(filters.merchantId);
      }

      if (filters.startDate) {
        whereClause += ' AND assessed_at >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        whereClause += ' AND assessed_at <= ?';
        params.push(filters.endDate);
      }

      if (filters.minScore !== undefined) {
        whereClause += ' AND risk_score >= ?';
        params.push(filters.minScore);
      }

      if (filters.maxScore !== undefined) {
        whereClause += ' AND risk_score <= ?';
        params.push(filters.maxScore);
      }

      // Build sort
      const sortColumn = this.mapSortColumn(sortBy || 'assessedAt');
      const sortDirection = (sortOrder || 'desc').toUpperCase();

      // Build query
      const sql = `
        SELECT * FROM risk_assessments
        ${whereClause}
        ORDER BY ${sortColumn} ${sortDirection}
        LIMIT ? OFFSET ?
      `;
      params.push(limit, offset);

      const assessments = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(sql, params);
        return rows;
      });

      // Get total count
      const countSql = `SELECT COUNT(*) as total FROM risk_assessments ${whereClause}`;
      const countResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(countSql, params.slice(0, -2)); // Remove limit and offset
        return rows[0];
      });

      // Parse JSON fields and add details if requested
      const results = await Promise.all(assessments.map(async (assessment) => {
        const result = {
          ...assessment,
          factors: JSON.parse(assessment.factors || '[]'),
          fraudPatterns: JSON.parse(assessment.fraud_patterns || '[]'),
          triggeredRules: JSON.parse(assessment.triggered_rules || '[]'),
          recommendations: JSON.parse(assessment.recommendations || '[]'),
          assessedAt: assessment.assessed_at,
          createdAt: assessment.created_at,
          updatedAt: assessment.updated_at
        };

        if (includeDetails) {
          result.transactionDetails = await this.getTransactionDetails(assessment.transaction_id);
          result.userDetails = await this.getUserDetails(assessment.user_id);
          result.merchantDetails = await this.getMerchantDetails(assessment.merchant_id);
        }

        return result;
      }));

      return {
        assessments: results,
        total: countResult.total,
        limit,
        offset,
        hasMore: offset + limit < countResult.total
      };
    } catch (error) {
      this.logger.error('Error getting risk assessments:', error);
      throw error;
    }
  }

  async handleGetUserRiskProfile(query) {
    try {
      const { userId, includeHistory, timeRange } = query;

      const cacheKey = `user_profile:${userId}:${timeRange}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      // Get user risk profile
      const profile = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT * FROM user_risk_profiles WHERE user_id = ? ORDER BY last_assessed DESC LIMIT 1`,
          [userId]
        );
        return rows[0];
      });

      if (!profile) {
        return null;
      }

      const result = {
        ...profile,
        factors: JSON.parse(profile.factors || '[]'),
        lastAssessed: profile.last_assessed,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at
      };

      if (includeHistory) {
        // Get assessment history
        const history = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
          let sql = `SELECT * FROM risk_assessments WHERE user_id = ?`;
          const params = [userId];

          if (timeRange) {
            const days = this.parseTimeRange(timeRange);
            sql += ` AND assessed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`;
            params.push(days);
          }

          sql += ` ORDER BY assessed_at DESC LIMIT 50`;

          const [rows] = await connection.execute(sql, params);
          return rows;
        });

        result.assessmentHistory = history.map(assessment => ({
          ...assessment,
          factors: JSON.parse(assessment.factors || '[]'),
          assessedAt: assessment.assessed_at
        }));

        // Calculate risk trends
        result.riskTrends = this.calculateRiskTrends(result.assessmentHistory);
      }

      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      this.logger.error('Error getting user risk profile:', error);
      throw error;
    }
  }

  async handleGetMerchantRiskProfile(query) {
    try {
      const { merchantId, includeHistory, timeRange } = query;

      const cacheKey = `merchant_profile:${merchantId}:${timeRange}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      // Get merchant risk profile
      const profile = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT * FROM merchant_risk_profiles WHERE merchant_id = ? ORDER BY last_assessed DESC LIMIT 1`,
          [merchantId]
        );
        return rows[0];
      });

      if (!profile) {
        return null;
      }

      const result = {
        ...profile,
        factors: JSON.parse(profile.factors || '[]'),
        lastAssessed: profile.last_assessed,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at
      };

      if (includeHistory) {
        // Get assessment history
        const history = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
          let sql = `SELECT * FROM risk_assessments WHERE merchant_id = ?`;
          const params = [merchantId];

          if (timeRange) {
            const days = this.parseTimeRange(timeRange);
            sql += ` AND assessed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`;
            params.push(days);
          }

          sql += ` ORDER BY assessed_at DESC LIMIT 50`;

          const [rows] = await connection.execute(sql, params);
          return rows;
        });

        result.assessmentHistory = history.map(assessment => ({
          ...assessment,
          factors: JSON.parse(assessment.factors || '[]'),
          assessedAt: assessment.assessed_at
        }));

        // Calculate risk trends
        result.riskTrends = this.calculateRiskTrends(result.assessmentHistory);
      }

      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      this.logger.error('Error getting merchant risk profile:', error);
      throw error;
    }
  }

  async handleGetRiskRules(query) {
    try {
      const { filters = {}, sortBy, sortOrder, limit, offset } = query;

      let whereClause = 'WHERE 1=1';
      const params = [];

      // Build filters
      if (filters.ruleType) {
        whereClause += ' AND rule_type = ?';
        params.push(filters.ruleType);
      }

      if (filters.isActive !== undefined) {
        whereClause += ' AND is_active = ?';
        params.push(filters.isActive);
      }

      if (filters.createdBy) {
        whereClause += ' AND created_by = ?';
        params.push(filters.createdBy);
      }

      // Build sort
      const sortColumn = this.mapSortColumn(sortBy || 'priority');
      const sortDirection = (sortOrder || 'desc').toUpperCase();

      // Build query
      const sql = `
        SELECT * FROM risk_rules
        ${whereClause}
        ORDER BY ${sortColumn} ${sortDirection}
        LIMIT ? OFFSET ?
      `;
      params.push(limit, offset);

      const rules = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(sql, params);
        return rows;
      });

      // Get total count
      const countSql = `SELECT COUNT(*) as total FROM risk_rules ${whereClause}`;
      const countResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(countSql, params.slice(0, -2));
        return rows[0];
      });

      // Parse JSON fields
      const results = rules.map(rule => ({
        ...rule,
        conditions: JSON.parse(rule.conditions || '[]'),
        actions: JSON.parse(rule.actions || '[]'),
        createdAt: rule.created_at,
        updatedAt: rule.updated_at
      }));

      return {
        rules: results,
        total: countResult.total,
        limit,
        offset,
        hasMore: offset + limit < countResult.total
      };
    } catch (error) {
      this.logger.error('Error getting risk rules:', error);
      throw error;
    }
  }

  async handleGetRiskRule(query) {
    try {
      const { ruleId } = query;

      const rule = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT * FROM risk_rules WHERE id = ?`,
          [ruleId]
        );
        return rows[0];
      });

      if (!rule) {
        return null;
      }

      return {
        ...rule,
        conditions: JSON.parse(rule.conditions || '[]'),
        actions: JSON.parse(rule.actions || '[]'),
        createdAt: rule.created_at,
        updatedAt: rule.updated_at
      };
    } catch (error) {
      this.logger.error('Error getting risk rule:', error);
      throw error;
    }
  }

  async handleGetRiskMetrics(query) {
    try {
      const { metricType, timeRange, groupBy, filters } = query;

      const cacheKey = `metrics:${metricType}:${timeRange}:${groupBy}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      // Calculate time range
      const { startDate, endDate } = this.parseTimeRangeToDates(timeRange);

      // Build query based on metric type
      let sql, params;

      switch (metricType) {
        case 'assessments_by_risk_level':
          sql = `
            SELECT risk_level, COUNT(*) as count
            FROM risk_assessments
            WHERE assessed_at BETWEEN ? AND ?
            GROUP BY risk_level
          `;
          params = [startDate, endDate];
          break;

        case 'assessments_over_time':
          sql = `
            SELECT DATE(assessed_at) as date, COUNT(*) as count,
                   AVG(risk_score) as avg_score
            FROM risk_assessments
            WHERE assessed_at BETWEEN ? AND ?
            GROUP BY DATE(assessed_at)
            ORDER BY date
          `;
          params = [startDate, endDate];
          break;

        case 'fraud_patterns_detected':
          sql = `
            SELECT pattern_type, COUNT(*) as count
            FROM fraud_patterns
            WHERE detected_at BETWEEN ? AND ?
            GROUP BY pattern_type
          `;
          params = [startDate, endDate];
          break;

        default:
          throw new Error(`Unknown metric type: ${metricType}`);
      }

      const metrics = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(sql, params);
        return rows;
      });

      const result = {
        metricType,
        timeRange,
        groupBy,
        data: metrics,
        generatedAt: new Date()
      };

      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      this.logger.error('Error getting risk metrics:', error);
      throw error;
    }
  }

  async handleGetRiskAlerts(query) {
    try {
      const { filters = {}, severity, status, sortBy, sortOrder, limit, offset } = query;

      let whereClause = 'WHERE 1=1';
      const params = [];

      // Build filters
      if (severity) {
        whereClause += ' AND severity = ?';
        params.push(severity);
      }

      if (status) {
        whereClause += ' AND status = ?';
        params.push(status);
      }

      if (filters.alertType) {
        whereClause += ' AND alert_type = ?';
        params.push(filters.alertType);
      }

      if (filters.startDate) {
        whereClause += ' AND triggered_at >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        whereClause += ' AND triggered_at <= ?';
        params.push(filters.endDate);
      }

      // Build sort
      const sortColumn = this.mapSortColumn(sortBy || 'triggeredAt');
      const sortDirection = (sortOrder || 'desc').toUpperCase();

      // Build query
      const sql = `
        SELECT * FROM risk_alerts
        ${whereClause}
        ORDER BY ${sortColumn} ${sortDirection}
        LIMIT ? OFFSET ?
      `;
      params.push(limit, offset);

      const alerts = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(sql, params);
        return rows;
      });

      // Get total count
      const countSql = `SELECT COUNT(*) as total FROM risk_alerts ${whereClause}`;
      const countResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(countSql, params.slice(0, -2));
        return rows[0];
      });

      // Parse JSON fields
      const results = alerts.map(alert => ({
        ...alert,
        context: JSON.parse(alert.context || '{}'),
        triggeredAt: alert.triggered_at,
        resolvedAt: alert.resolved_at
      }));

      return {
        alerts: results,
        total: countResult.total,
        limit,
        offset,
        hasMore: offset + limit < countResult.total
      };
    } catch (error) {
      this.logger.error('Error getting risk alerts:', error);
      throw error;
    }
  }

  async handleGetFraudPatterns(query) {
    try {
      const { patternType, confidence, timeRange, sortBy, sortOrder, limit, offset } = query;

      let whereClause = 'WHERE 1=1';
      const params = [];

      // Build filters
      if (patternType) {
        whereClause += ' AND pattern_type = ?';
        params.push(patternType);
      }

      if (confidence) {
        whereClause += ' AND confidence >= ?';
        params.push(confidence);
      }

      if (timeRange) {
        const { startDate, endDate } = this.parseTimeRangeToDates(timeRange);
        whereClause += ' AND detected_at BETWEEN ? AND ?';
        params.push(startDate, endDate);
      }

      // Build sort
      const sortColumn = this.mapSortColumn(sortBy || 'detectedAt');
      const sortDirection = (sortOrder || 'desc').toUpperCase();

      // Build query
      const sql = `
        SELECT * FROM fraud_patterns
        ${whereClause}
        ORDER BY ${sortColumn} ${sortDirection}
        LIMIT ? OFFSET ?
      `;
      params.push(limit, offset);

      const patterns = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(sql, params);
        return rows;
      });

      // Get total count
      const countSql = `SELECT COUNT(*) as total FROM fraud_patterns ${whereClause}`;
      const countResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(countSql, params.slice(0, -2));
        return rows[0];
      });

      // Parse JSON fields
      const results = patterns.map(pattern => ({
        ...pattern,
        affectedEntities: JSON.parse(pattern.affected_entities || '[]'),
        patternData: JSON.parse(pattern.pattern_data || '{}'),
        recommendedActions: JSON.parse(pattern.recommended_actions || '[]'),
        detectedAt: pattern.detected_at
      }));

      return {
        patterns: results,
        total: countResult.total,
        limit,
        offset,
        hasMore: offset + limit < countResult.total
      };
    } catch (error) {
      this.logger.error('Error getting fraud patterns:', error);
      throw error;
    }
  }

  async handleGetRiskThresholds(query) {
    try {
      const { thresholdType, currency, activeOnly } = query;

      let whereClause = 'WHERE 1=1';
      const params = [];

      if (thresholdType) {
        whereClause += ' AND threshold_type = ?';
        params.push(thresholdType);
      }

      if (currency) {
        whereClause += ' AND currency = ?';
        params.push(currency);
      }

      if (activeOnly) {
        whereClause += ' AND is_active = 1';
      }

      const thresholds = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT * FROM risk_thresholds ${whereClause} ORDER BY updated_at DESC`,
          params
        );
        return rows;
      });

      return thresholds.map(threshold => ({
        ...threshold,
        updatedAt: threshold.updated_at
      }));
    } catch (error) {
      this.logger.error('Error getting risk thresholds:', error);
      throw error;
    }
  }

  async handleGetRiskReport(query) {
    try {
      const { reportId, includeData } = query;

      const report = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT * FROM risk_reports WHERE id = ?`,
          [reportId]
        );
        return rows[0];
      });

      if (!report) {
        return null;
      }

      const result = {
        ...report,
        parameters: JSON.parse(report.parameters || '{}'),
        data: includeData ? JSON.parse(report.data || '{}') : undefined,
        generatedAt: report.generated_at,
        createdAt: report.created_at
      };

      return result;
    } catch (error) {
      this.logger.error('Error getting risk report:', error);
      throw error;
    }
  }

  async handleGetRiskReports(query) {
    try {
      const { filters = {}, sortBy, sortOrder, limit, offset, includeData } = query;

      let whereClause = 'WHERE 1=1';
      const params = [];

      // Build filters
      if (filters.reportType) {
        whereClause += ' AND report_type = ?';
        params.push(filters.reportType);
      }

      if (filters.generatedBy) {
        whereClause += ' AND generated_by = ?';
        params.push(filters.generatedBy);
      }

      if (filters.startDate) {
        whereClause += ' AND generated_at >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        whereClause += ' AND generated_at <= ?';
        params.push(filters.endDate);
      }

      // Build sort
      const sortColumn = this.mapSortColumn(sortBy || 'generatedAt');
      const sortDirection = (sortOrder || 'desc').toUpperCase();

      // Build query
      const sql = `
        SELECT * FROM risk_reports
        ${whereClause}
        ORDER BY ${sortColumn} ${sortDirection}
        LIMIT ? OFFSET ?
      `;
      params.push(limit, offset);

      const reports = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(sql, params);
        return rows;
      });

      // Get total count
      const countSql = `SELECT COUNT(*) as total FROM risk_reports ${whereClause}`;
      const countResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(countSql, params.slice(0, -2));
        return rows[0];
      });

      // Parse JSON fields
      const results = reports.map(report => ({
        ...report,
        parameters: JSON.parse(report.parameters || '{}'),
        data: includeData ? JSON.parse(report.data || '{}') : undefined,
        generatedAt: report.generated_at,
        createdAt: report.created_at
      }));

      return {
        reports: results,
        total: countResult.total,
        limit,
        offset,
        hasMore: offset + limit < countResult.total
      };
    } catch (error) {
      this.logger.error('Error getting risk reports:', error);
      throw error;
    }
  }

  async handleGetRiskDashboard(query) {
    try {
      const { timeRange, includeAlerts, includeMetrics, includeTopRisks } = query;

      const dashboard = {
        generatedAt: new Date(),
        timeRange
      };

      if (includeMetrics) {
        dashboard.metrics = {
          totalAssessments: await this.getMetricValue('total_assessments', timeRange),
          highRiskCount: await this.getMetricValue('high_risk_count', timeRange),
          fraudPatternsDetected: await this.getMetricValue('fraud_patterns_detected', timeRange),
          alertsTriggered: await this.getMetricValue('alerts_triggered', timeRange)
        };
      }

      if (includeAlerts) {
        dashboard.recentAlerts = await this.getRecentAlerts(10);
      }

      if (includeTopRisks) {
        dashboard.topRiskFactors = await this.getTopRiskFactors(timeRange);
        dashboard.riskTrends = await this.getRiskTrends(timeRange);
      }

      return dashboard;
    } catch (error) {
      this.logger.error('Error getting risk dashboard:', error);
      throw error;
    }
  }

  async handleGetRiskAnalytics(query) {
    try {
      const { analyticsType, timeRange, groupBy, filters, includeTrends } = query;

      const analytics = {
        analyticsType,
        timeRange,
        groupBy,
        generatedAt: new Date()
      };

      switch (analyticsType) {
        case 'risk_distribution':
          analytics.data = await this.getRiskDistributionAnalytics(timeRange, groupBy);
          break;
        case 'fraud_trends':
          analytics.data = await this.getFraudTrendsAnalytics(timeRange, groupBy);
          break;
        case 'user_risk_segments':
          analytics.data = await this.getUserRiskSegmentsAnalytics(timeRange);
          break;
        case 'merchant_risk_analysis':
          analytics.data = await this.getMerchantRiskAnalytics(timeRange);
          break;
        default:
          throw new Error(`Unknown analytics type: ${analyticsType}`);
      }

      if (includeTrends) {
        analytics.trends = await this.calculateAnalyticsTrends(analytics.data, timeRange);
      }

      return analytics;
    } catch (error) {
      this.logger.error('Error getting risk analytics:', error);
      throw error;
    }
  }

  // Helper methods
  mapSortColumn(sortBy) {
    const columnMap = {
      'assessedAt': 'assessed_at',
      'createdAt': 'created_at',
      'updatedAt': 'updated_at',
      'priority': 'priority',
      'triggeredAt': 'triggered_at',
      'detectedAt': 'detected_at',
      'generatedAt': 'generated_at',
      'resolvedAt': 'resolved_at'
    };
    return columnMap[sortBy] || sortBy;
  }

  parseTimeRange(timeRange) {
    const rangeMap = {
      '1h': 1/24,
      '24h': 1,
      '7d': 7,
      '30d': 30,
      '90d': 90
    };
    return rangeMap[timeRange] || 30;
  }

  parseTimeRangeToDates(timeRange) {
    const days = this.parseTimeRange(timeRange);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }

  calculateRiskTrends(assessments) {
    if (assessments.length < 2) return { trend: 'stable', change: 0 };

    const recent = assessments.slice(0, Math.ceil(assessments.length / 2));
    const older = assessments.slice(Math.ceil(assessments.length / 2));

    const recentAvg = recent.reduce((sum, a) => sum + a.risk_score, 0) / recent.length;
    const olderAvg = older.reduce((sum, a) => sum + a.risk_score, 0) / older.length;

    const change = ((recentAvg - olderAvg) / olderAvg) * 100;

    return {
      trend: change > 5 ? 'increasing' : change < -5 ? 'decreasing' : 'stable',
      change: parseFloat(change.toFixed(2)),
      recentAverage: parseFloat(recentAvg.toFixed(2)),
      olderAverage: parseFloat(olderAvg.toFixed(2))
    };
  }

  async getTransactionDetails(transactionId) {
    // Simplified - in real implementation, fetch from database
    return { id: transactionId, amount: 100, status: 'completed' };
  }

  async getUserDetails(userId) {
    // Simplified - in real implementation, fetch from database
    return { id: userId, name: 'John Doe', email: 'john@example.com' };
  }

  async getMerchantDetails(merchantId) {
    // Simplified - in real implementation, fetch from database
    return { id: merchantId, name: 'Test Merchant', category: 'retail' };
  }

  async getMetricValue(metricType, timeRange) {
    // Simplified metrics - in real implementation, calculate from database
    const mockValues = {
      total_assessments: 1250,
      high_risk_count: 45,
      fraud_patterns_detected: 23,
      alerts_triggered: 67
    };
    return mockValues[metricType] || 0;
  }

  async getRecentAlerts(limit) {
    // Simplified - in real implementation, fetch from database
    return [
      { id: 'alert1', type: 'high_risk_transaction', severity: 'high', message: 'High risk transaction detected', triggeredAt: new Date() },
      { id: 'alert2', type: 'fraud_pattern', severity: 'medium', message: 'Velocity fraud pattern detected', triggeredAt: new Date() }
    ].slice(0, limit);
  }

  async getTopRiskFactors(timeRange) {
    // Simplified - in real implementation, calculate from database
    return [
      { factor: 'unusual_location', count: 45, percentage: 35 },
      { factor: 'high_amount', count: 32, percentage: 25 },
      { factor: 'new_device', count: 28, percentage: 22 },
      { factor: 'unusual_time', count: 22, percentage: 18 }
    ];
  }

  async getRiskTrends(timeRange) {
    // Simplified - in real implementation, calculate from database
    return [
      { date: '2024-01-01', highRiskCount: 5, totalAssessments: 100 },
      { date: '2024-01-02', highRiskCount: 3, totalAssessments: 95 },
      { date: '2024-01-03', highRiskCount: 7, totalAssessments: 110 }
    ];
  }

  async getRiskDistributionAnalytics(timeRange, groupBy) {
    // Simplified analytics
    return {
      low: 1085,
      medium: 120,
      high: 45,
      total: 1250
    };
  }

  async getFraudTrendsAnalytics(timeRange, groupBy) {
    // Simplified analytics
    return [
      { date: '2024-01-01', fraudCount: 3 },
      { date: '2024-01-02', fraudCount: 2 },
      { date: '2024-01-03', fraudCount: 5 }
    ];
  }

  async getUserRiskSegmentsAnalytics(timeRange) {
    // Simplified analytics
    return {
      low_risk: 850,
      medium_risk: 120,
      high_risk: 30,
      total: 1000
    };
  }

  async getMerchantRiskAnalytics(timeRange) {
    // Simplified analytics
    return {
      low_risk: 45,
      medium_risk: 12,
      high_risk: 3,
      total: 60
    };
  }

  async calculateAnalyticsTrends(data, timeRange) {
    // Simplified trend calculation
    return {
      direction: 'stable',
      change: 2.5,
      period: timeRange
    };
  }
}