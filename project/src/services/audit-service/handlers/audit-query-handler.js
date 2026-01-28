import {
  GetAuditLogsQuery,
  GetAuditLogByIdQuery,
  GetUserAuditTrailQuery,
  GetResourceAuditTrailQuery,
  GetAuditStatisticsQuery,
  GetSuspiciousActivitiesQuery,
  GetComplianceReportQuery,
  GetAuditRetentionStatusQuery,
  GetSystemAccessLogQuery,
  GetDataAccessAuditQuery
} from '../queries/audit-queries.js';

export class AuditQueryHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.logger = dependencies.logger;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async handle(query) {
    try {
      query.validate();

      switch (query.constructor.name) {
        case 'GetAuditLogsQuery':
          return await this.handleGetAuditLogs(query);
        case 'GetAuditLogByIdQuery':
          return await this.handleGetAuditLogById(query);
        case 'GetUserAuditTrailQuery':
          return await this.handleGetUserAuditTrail(query);
        case 'GetResourceAuditTrailQuery':
          return await this.handleGetResourceAuditTrail(query);
        case 'GetAuditStatisticsQuery':
          return await this.handleGetAuditStatistics(query);
        case 'GetSuspiciousActivitiesQuery':
          return await this.handleGetSuspiciousActivities(query);
        case 'GetComplianceReportQuery':
          return await this.handleGetComplianceReport(query);
        case 'GetAuditRetentionStatusQuery':
          return await this.handleGetAuditRetentionStatus(query);
        case 'GetSystemAccessLogQuery':
          return await this.handleGetSystemAccessLog(query);
        case 'GetDataAccessAuditQuery':
          return await this.handleGetDataAccessAudit(query);
        default:
          throw new Error(`Unknown query: ${query.constructor.name}`);
      }
    } catch (error) {
      this.logger.error(`Error handling query ${query.constructor.name}:`, error);
      throw error;
    }
  }

  async handleGetAuditLogs(query) {
    const cacheKey = `audit_logs_${JSON.stringify(query)}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const { whereClause, params, orderBy } = this.buildAuditLogsQuery(query);

    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      // Get total count
      const [countResult] = await connection.execute(
        `SELECT COUNT(*) as total FROM audit_logs WHERE ${whereClause}`,
        params
      );
      const total = countResult[0].total;

      // Get paginated results
      const offset = (query.page - 1) * query.limit;
      const [rows] = await connection.execute(
        `SELECT * FROM audit_logs WHERE ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        [...params, query.limit, offset]
      );

      // Parse JSON fields
      const logs = rows.map(row => ({
        ...row,
        details: JSON.parse(row.details || '{}'),
        deviceInfo: JSON.parse(row.deviceInfo || '{}'),
        complianceFlags: JSON.parse(row.complianceFlags || '[]'),
        metadata: JSON.parse(row.metadata || '{}')
      }));

      return {
        logs,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit)
        }
      };
    });

    this.setCached(cacheKey, result);
    return result;
  }

  async handleGetAuditLogById(query) {
    const cacheKey = `audit_log_${query.id}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM audit_logs WHERE id = ?',
        [query.id]
      );

      if (rows.length === 0) {
        throw new Error('Audit log not found');
      }

      const log = rows[0];
      const parsedLog = {
        ...log,
        details: JSON.parse(log.details || '{}'),
        deviceInfo: JSON.parse(log.deviceInfo || '{}'),
        complianceFlags: JSON.parse(log.complianceFlags || '[]'),
        metadata: JSON.parse(log.metadata || '{}')
      };

      if (query.includeRelated) {
        // Get related logs (same user, same session, etc.)
        const [relatedRows] = await connection.execute(
          `SELECT id, action, resource, timestamp FROM audit_logs
           WHERE (user_id = ? OR session_id = ?) AND id != ?
           ORDER BY timestamp DESC LIMIT 10`,
          [log.user_id, log.session_id, log.id]
        );
        parsedLog.relatedLogs = relatedRows;
      }

      return parsedLog;
    });

    this.setCached(cacheKey, result);
    return result;
  }

  async handleGetUserAuditTrail(query) {
    const cacheKey = `user_trail_${query.userId}_${JSON.stringify(query)}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const conditions = ['user_id = ?'];
    const params = [query.userId];

    if (query.startDate) {
      conditions.push('timestamp >= ?');
      params.push(query.startDate);
    }

    if (query.endDate) {
      conditions.push('timestamp <= ?');
      params.push(query.endDate);
    }

    if (query.actions && query.actions.length > 0) {
      conditions.push(`action IN (${query.actions.map(() => '?').join(',')})`);
      params.push(...query.actions);
    }

    if (query.resources && query.resources.length > 0) {
      conditions.push(`resource IN (${query.resources.map(() => '?').join(',')})`);
      params.push(...query.resources);
    }

    const whereClause = conditions.join(' AND ');

    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      // Get total count
      const [countResult] = await connection.execute(
        `SELECT COUNT(*) as total FROM audit_logs WHERE ${whereClause}`,
        params
      );
      const total = countResult[0].total;

      // Get paginated results
      const offset = (query.page - 1) * query.limit;
      const [rows] = await connection.execute(
        `SELECT * FROM audit_logs WHERE ${whereClause}
         ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
        [...params, query.limit, offset]
      );

      const logs = rows.map(row => ({
        ...row,
        details: JSON.parse(row.details || '{}'),
        deviceInfo: JSON.parse(row.deviceInfo || '{}'),
        complianceFlags: JSON.parse(row.complianceFlags || '[]'),
        metadata: JSON.parse(row.metadata || '{}')
      }));

      // Get session summary if requested
      let sessionSummary = null;
      if (query.includeSessionInfo) {
        const [sessionResult] = await connection.execute(
          `SELECT session_id, COUNT(*) as action_count,
                  MIN(timestamp) as session_start,
                  MAX(timestamp) as session_end
           FROM audit_logs
           WHERE ${whereClause}
           GROUP BY session_id
           ORDER BY session_start DESC`,
          params
        );
        sessionSummary = sessionResult;
      }

      // Get risk analysis if requested
      let riskAnalysis = null;
      if (query.includeRiskAnalysis) {
        const [riskResult] = await connection.execute(
          `SELECT
            AVG(risk_score) as avg_risk_score,
            MAX(risk_score) as max_risk_score,
            COUNT(CASE WHEN risk_score > 70 THEN 1 END) as high_risk_actions,
            COUNT(CASE WHEN risk_score > 50 THEN 1 END) as medium_risk_actions
           FROM audit_logs WHERE ${whereClause}`,
          params
        );
        riskAnalysis = riskResult[0];
      }

      return {
        userId: query.userId,
        logs,
        sessionSummary,
        riskAnalysis,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit)
        }
      };
    });

    this.setCached(cacheKey, result);
    return result;
  }

  async handleGetResourceAuditTrail(query) {
    const cacheKey = `resource_trail_${query.resource}_${query.resourceId}_${JSON.stringify(query)}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const conditions = ['resource = ?'];
    const params = [query.resource];

    if (query.resourceId) {
      conditions.push('resource_id = ?');
      params.push(query.resourceId);
    }

    if (query.startDate) {
      conditions.push('timestamp >= ?');
      params.push(query.startDate);
    }

    if (query.endDate) {
      conditions.push('timestamp <= ?');
      params.push(query.endDate);
    }

    if (query.actions && query.actions.length > 0) {
      conditions.push(`action IN (${query.actions.map(() => '?').join(',')})`);
      params.push(...query.actions);
    }

    if (query.userIds && query.userIds.length > 0) {
      conditions.push(`user_id IN (${query.userIds.map(() => '?').join(',')})`);
      params.push(...query.userIds);
    }

    const whereClause = conditions.join(' AND ');

    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      // Get total count
      const [countResult] = await connection.execute(
        `SELECT COUNT(*) as total FROM audit_logs WHERE ${whereClause}`,
        params
      );
      const total = countResult[0].total;

      // Get paginated results
      const offset = (query.page - 1) * query.limit;
      const [rows] = await connection.execute(
        `SELECT * FROM audit_logs WHERE ${whereClause}
         ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
        [...params, query.limit, offset]
      );

      const logs = rows.map(row => ({
        ...row,
        details: JSON.parse(row.details || '{}'),
        deviceInfo: JSON.parse(row.deviceInfo || '{}'),
        complianceFlags: JSON.parse(row.complianceFlags || '[]'),
        metadata: JSON.parse(row.metadata || '{}')
      }));

      // Get user details if requested
      let userDetails = null;
      if (query.includeUserDetails) {
        const userIds = [...new Set(logs.map(log => log.user_id))];
        if (userIds.length > 0) {
          const [userResult] = await connection.execute(
            `SELECT id, username, email, status FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`,
            userIds
          );
          userDetails = userResult.reduce((acc, user) => {
            acc[user.id] = user;
            return acc;
          }, {});
        }
      }

      return {
        resource: query.resource,
        resourceId: query.resourceId,
        logs,
        userDetails,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit)
        }
      };
    });

    this.setCached(cacheKey, result);
    return result;
  }

  async handleGetAuditStatistics(query) {
    const cacheKey = `audit_stats_${JSON.stringify(query)}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const conditions = [];
    const params = [];

    if (query.startDate) {
      conditions.push('timestamp >= ?');
      params.push(query.startDate);
    }

    if (query.endDate) {
      conditions.push('timestamp <= ?');
      params.push(query.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      const stats = {};

      // Total events
      if (query.metrics.includes('total_events')) {
        const [totalResult] = await connection.execute(
          `SELECT COUNT(*) as total_events FROM audit_logs ${whereClause}`,
          params
        );
        stats.totalEvents = totalResult[0].total_events;
      }

      // Unique users
      if (query.metrics.includes('unique_users')) {
        const [userResult] = await connection.execute(
          `SELECT COUNT(DISTINCT user_id) as unique_users FROM audit_logs ${whereClause}`,
          params
        );
        stats.uniqueUsers = userResult[0].unique_users;
      }

      // Risk distribution
      if (query.metrics.includes('risk_distribution')) {
        const [riskResult] = await connection.execute(
          `SELECT
            COUNT(CASE WHEN risk_score >= 80 THEN 1 END) as critical,
            COUNT(CASE WHEN risk_score >= 60 AND risk_score < 80 THEN 1 END) as high,
            COUNT(CASE WHEN risk_score >= 40 AND risk_score < 60 THEN 1 END) as medium,
            COUNT(CASE WHEN risk_score < 40 THEN 1 END) as low
           FROM audit_logs ${whereClause}`,
          params
        );
        stats.riskDistribution = riskResult[0];
      }

      // Action breakdown
      if (query.metrics.includes('action_breakdown')) {
        const [actionResult] = await connection.execute(
          `SELECT action, COUNT(*) as count FROM audit_logs ${whereClause}
           GROUP BY action ORDER BY count DESC`,
          params
        );
        stats.actionBreakdown = actionResult;
      }

      // Resource access
      if (query.metrics.includes('resource_access')) {
        const [resourceResult] = await connection.execute(
          `SELECT resource, COUNT(*) as count FROM audit_logs ${whereClause}
           GROUP BY resource ORDER BY count DESC LIMIT 20`,
          params
        );
        stats.resourceAccess = resourceResult;
      }

      // Geographic distribution
      if (query.metrics.includes('geographic_distribution')) {
        const [geoResult] = await connection.execute(
          `SELECT location, COUNT(*) as count FROM audit_logs
           WHERE location IS NOT NULL ${whereClause.replace('WHERE', 'AND')}
           GROUP BY location ORDER BY count DESC LIMIT 20`,
          params
        );
        stats.geographicDistribution = geoResult;
      }

      // Time patterns
      if (query.metrics.includes('time_patterns')) {
        const groupBy = this.getTimeGroupBy(query.groupBy);
        const [timeResult] = await connection.execute(
          `SELECT
            DATE_FORMAT(timestamp, '${groupBy}') as period,
            COUNT(*) as count
           FROM audit_logs ${whereClause}
           GROUP BY period ORDER BY period`,
          params
        );
        stats.timePatterns = timeResult;
      }

      // Compliance flags
      if (query.metrics.includes('compliance_flags')) {
        const [complianceResult] = await connection.execute(
          `SELECT
            JSON_UNQUOTE(JSON_EXTRACT(compliance_flags, '$[*]')) as flag,
            COUNT(*) as count
           FROM audit_logs ${whereClause}
           GROUP BY flag ORDER BY count DESC`,
          params
        );
        stats.complianceFlags = complianceResult;
      }

      return {
        period: {
          startDate: query.startDate,
          endDate: query.endDate
        },
        statistics: stats,
        generatedAt: new Date().toISOString()
      };
    });

    this.setCached(cacheKey, result);
    return result;
  }

  async handleGetSuspiciousActivities(query) {
    const conditions = [];
    const params = [];

    if (query.startDate) {
      conditions.push('timestamp >= ?');
      params.push(query.startDate);
    }

    if (query.endDate) {
      conditions.push('timestamp <= ?');
      params.push(query.endDate);
    }

    if (query.severity) {
      conditions.push('severity = ?');
      params.push(query.severity);
    }

    if (query.activityTypes && query.activityTypes.length > 0) {
      conditions.push(`activity_type IN (${query.activityTypes.map(() => '?').join(',')})`);
      params.push(...query.activityTypes);
    }

    conditions.push('risk_score >= ? AND risk_score <= ?');
    params.push(query.minRiskScore, query.maxRiskScore);

    if (query.status) {
      conditions.push('status = ?');
      params.push(query.status);
    }

    if (query.assignedTo) {
      conditions.push('assigned_to = ?');
      params.push(query.assignedTo);
    }

    const whereClause = conditions.join(' AND ');

    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      // Get total count
      const [countResult] = await connection.execute(
        `SELECT COUNT(*) as total FROM suspicious_activities WHERE ${whereClause}`,
        params
      );
      const total = countResult[0].total;

      // Get paginated results
      const offset = (query.page - 1) * query.limit;
      const [rows] = await connection.execute(
        `SELECT * FROM suspicious_activities WHERE ${whereClause}
         ORDER BY risk_score DESC, timestamp DESC LIMIT ? OFFSET ?`,
        [...params, query.limit, offset]
      );

      const activities = rows.map(row => ({
        ...row,
        indicators: JSON.parse(row.indicators || '[]'),
        metadata: JSON.parse(row.metadata || '{}')
      }));

      // Include audit logs if requested
      if (query.includeAuditLogs) {
        for (const activity of activities) {
          if (activity.audit_log_id) {
            const [logResult] = await connection.execute(
              'SELECT * FROM audit_logs WHERE id = ?',
              [activity.audit_log_id]
            );
            if (logResult.length > 0) {
              const log = logResult[0];
              activity.auditLog = {
                ...log,
                details: JSON.parse(log.details || '{}'),
                deviceInfo: JSON.parse(log.deviceInfo || '{}'),
                complianceFlags: JSON.parse(log.complianceFlags || '[]'),
                metadata: JSON.parse(log.metadata || '{}')
              };
            }
          }
        }
      }

      return {
        activities,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit)
        }
      };
    });

    return result;
  }

  async handleGetComplianceReport(query) {
    // This is a complex query that would generate compliance reports
    // Implementation would vary based on specific compliance requirements
    const report = {
      reportType: query.reportType,
      period: {
        startDate: query.startDate,
        endDate: query.endDate
      },
      complianceStandards: query.complianceStandards,
      format: query.format,
      generatedAt: new Date().toISOString(),
      // Placeholder for actual compliance data
      summary: {
        totalViolations: 0,
        criticalIssues: 0,
        complianceScore: 100
      },
      recommendations: []
    };

    return report;
  }

  async handleGetAuditRetentionStatus(query) {
    const conditions = [];
    const params = [];

    if (query.category) {
      conditions.push('category = ?');
      params.push(query.category);
    }

    if (query.olderThan) {
      conditions.push('timestamp < ?');
      params.push(query.olderThan);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      // Get total count
      const [countResult] = await connection.execute(
        `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`,
        params
      );
      const total = countResult[0].total;

      // Get archived count
      const [archivedResult] = await connection.execute(
        `SELECT COUNT(*) as archived FROM audit_logs ${whereClause.replace('WHERE', 'WHERE archived = 1 AND')} ${whereClause ? 'AND' : 'WHERE'} archived = 1`,
        params
      );
      const archived = archivedResult[0].archived;

      // Get paginated results
      const offset = (query.page - 1) * query.limit;
      const [rows] = await connection.execute(
        `SELECT id, user_id, action, resource, timestamp, archived, archive_id
         FROM audit_logs ${whereClause}
         ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
        [...params, query.limit, offset]
      );

      return {
        summary: {
          total,
          archived,
          active: total - archived,
          archivedPercentage: total > 0 ? (archived / total * 100).toFixed(2) : 0
        },
        records: rows,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit)
        }
      };
    });

    return result;
  }

  async handleGetSystemAccessLog(query) {
    const conditions = ['action IN ("LOGIN", "LOGOUT", "API_ACCESS", "SYSTEM_ACCESS")'];
    const params = [];

    if (query.startDate) {
      conditions.push('timestamp >= ?');
      params.push(query.startDate);
    }

    if (query.endDate) {
      conditions.push('timestamp <= ?');
      params.push(query.endDate);
    }

    if (query.systemComponent) {
      conditions.push('resource = ?');
      params.push(query.systemComponent);
    }

    if (query.accessType) {
      conditions.push('action = ?');
      params.push(query.accessType);
    }

    if (query.userId) {
      conditions.push('user_id = ?');
      params.push(query.userId);
    }

    if (query.ipAddress) {
      conditions.push('ip_address = ?');
      params.push(query.ipAddress);
    }

    const whereClause = conditions.join(' AND ');

    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      // Get total count
      const [countResult] = await connection.execute(
        `SELECT COUNT(*) as total FROM audit_logs WHERE ${whereClause}`,
        params
      );
      const total = countResult[0].total;

      // Get paginated results
      const offset = (query.page - 1) * query.limit;
      const [rows] = await connection.execute(
        `SELECT * FROM audit_logs WHERE ${whereClause}
         ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
        [...params, query.limit, offset]
      );

      const logs = rows.map(row => ({
        ...row,
        details: JSON.parse(row.details || '{}'),
        deviceInfo: JSON.parse(row.deviceInfo || '{}'),
        complianceFlags: JSON.parse(row.complianceFlags || '[]'),
        metadata: JSON.parse(row.metadata || '{}')
      }));

      return {
        systemComponent: query.systemComponent,
        accessType: query.accessType,
        logs,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit)
        }
      };
    });

    return result;
  }

  async handleGetDataAccessAudit(query) {
    const conditions = ['action IN ("READ", "EXPORT", "DATA_ACCESS")'];
    const params = [];

    if (query.startDate) {
      conditions.push('timestamp >= ?');
      params.push(query.startDate);
    }

    if (query.endDate) {
      conditions.push('timestamp <= ?');
      params.push(query.endDate);
    }

    if (query.dataType) {
      conditions.push('resource = ?');
      params.push(query.dataType);
    }

    if (query.accessReason) {
      conditions.push('JSON_UNQUOTE(JSON_EXTRACT(details, "$.accessReason")) = ?');
      params.push(query.accessReason);
    }

    if (query.userId) {
      conditions.push('user_id = ?');
      params.push(query.userId);
    }

    if (query.justificationRequired) {
      conditions.push('JSON_EXTRACT(details, "$.justification") IS NOT NULL');
    }

    const whereClause = conditions.join(' AND ');

    const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
      // Get total count
      const [countResult] = await connection.execute(
        `SELECT COUNT(*) as total FROM audit_logs WHERE ${whereClause}`,
        params
      );
      const total = countResult[0].total;

      // Get paginated results
      const offset = (query.page - 1) * query.limit;
      const [rows] = await connection.execute(
        `SELECT * FROM audit_logs WHERE ${whereClause}
         ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
        [...params, query.limit, offset]
      );

      const logs = rows.map(row => ({
        ...row,
        details: JSON.parse(row.details || '{}'),
        deviceInfo: JSON.parse(row.deviceInfo || '{}'),
        complianceFlags: JSON.parse(row.complianceFlags || '[]'),
        metadata: JSON.parse(row.metadata || '{}'),
        authorized: !query.includeUnauthorized || this.isAuthorizedAccess(row)
      }));

      return {
        dataType: query.dataType,
        accessReason: query.accessReason,
        logs: query.includeUnauthorized ? logs : logs.filter(log => log.authorized),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit)
        }
      };
    });

    return result;
  }

  buildAuditLogsQuery(query) {
    const conditions = [];
    const params = [];

    if (query.userId) {
      conditions.push('user_id = ?');
      params.push(query.userId);
    }

    if (query.action) {
      conditions.push('action = ?');
      params.push(query.action);
    }

    if (query.resource) {
      conditions.push('resource = ?');
      params.push(query.resource);
    }

    if (query.resourceId) {
      conditions.push('resource_id = ?');
      params.push(query.resourceId);
    }

    if (query.startDate) {
      conditions.push('timestamp >= ?');
      params.push(query.startDate);
    }

    if (query.endDate) {
      conditions.push('timestamp <= ?');
      params.push(query.endDate);
    }

    if (query.ipAddress) {
      conditions.push('ip_address = ?');
      params.push(query.ipAddress);
    }

    if (query.sessionId) {
      conditions.push('session_id = ?');
      params.push(query.sessionId);
    }

    if (query.riskScore !== undefined) {
      conditions.push('risk_score >= ?');
      params.push(query.riskScore);
    }

    if (query.complianceFlags && query.complianceFlags.length > 0) {
      conditions.push(`JSON_OVERLAPS(compliance_flags, JSON_ARRAY(${query.complianceFlags.map(() => '?').join(',')}))`);
      params.push(...query.complianceFlags);
    }

    const whereClause = conditions.length > 0 ? conditions.join(' AND ') : '1=1';

    let orderBy = 'timestamp DESC';
    if (query.sortBy === 'riskScore') {
      orderBy = `risk_score ${query.sortOrder}, timestamp DESC`;
    } else if (query.sortBy === 'userId') {
      orderBy = `user_id ${query.sortOrder}, timestamp DESC`;
    } else if (query.sortBy === 'action') {
      orderBy = `action ${query.sortOrder}, timestamp DESC`;
    } else if (query.sortBy === 'resource') {
      orderBy = `resource ${query.sortOrder}, timestamp DESC`;
    }

    return { whereClause, params, orderBy };
  }

  getTimeGroupBy(groupBy) {
    switch (groupBy) {
      case 'hour': return '%Y-%m-%d %H:00:00';
      case 'day': return '%Y-%m-%d';
      case 'week': return '%Y-%u';
      case 'month': return '%Y-%m';
      default: return '%Y-%m-%d';
    }
  }

  isAuthorizedAccess(log) {
    // Placeholder logic for determining if access was authorized
    // This would implement actual authorization checking logic
    return log.risk_score < 50;
  }

  getCached(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCached(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
}