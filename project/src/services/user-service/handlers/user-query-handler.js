import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export class UserQueryHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore;
    this.kafkaService = dependencies.kafkaService;
    this.logger = dependencies.logger;
  }

  async handle(query) {
    const queryType = query.constructor.name;

    switch (queryType) {
      case 'GetUserQuery':
        return await this.handleGetUser(query);
      case 'GetUsersQuery':
        return await this.handleGetUsers(query);
      case 'GetUserByEmailQuery':
        return await this.handleGetUserByEmail(query);
      case 'GetUserProfileQuery':
        return await this.handleGetUserProfile(query);
      case 'GetUserAnalyticsQuery':
        return await this.handleGetUserAnalytics(query);
      case 'GetUserActivityQuery':
        return await this.handleGetUserActivity(query);
      case 'GetUserSecuritySettingsQuery':
        return await this.handleGetUserSecuritySettings(query);
      case 'GetUserPreferencesQuery':
        return await this.handleGetUserPreferences(query);
      case 'GetUsersByRoleQuery':
        return await this.handleGetUsersByRole(query);
      case 'GetUsersByStatusQuery':
        return await this.handleGetUsersByStatus(query);
      case 'GetUserLoginHistoryQuery':
        return await this.handleGetUserLoginHistory(query);
      case 'GetUserAuditTrailQuery':
        return await this.handleGetUserAuditTrail(query);
      case 'GetUserReportQuery':
        return await this.handleGetUserReport(query);
      case 'GetUserStatisticsQuery':
        return await this.handleGetUserStatistics(query);
      case 'GetUserDashboardDataQuery':
        return await this.handleGetUserDashboardData(query);
      case 'GetUserActivitySummaryQuery':
        return await this.handleGetUserActivitySummary(query);
      case 'GetUserEngagementMetricsQuery':
        return await this.handleGetUserEngagementMetrics(query);
      case 'GetUserRetentionAnalysisQuery':
        return await this.handleGetUserRetentionAnalysis(query);
      case 'GetUserChurnAnalysisQuery':
        return await this.handleGetUserChurnAnalysis(query);
      case 'GetUserLifecycleReportQuery':
        return await this.handleGetUserLifecycleReport(query);
      case 'GetUserSecurityReportQuery':
        return await this.handleGetUserSecurityReport(query);
      case 'GetUserComplianceReportQuery':
        return await this.handleGetUserComplianceReport(query);
      case 'GetUserPerformanceMetricsQuery':
        return await this.handleGetUserPerformanceMetrics(query);
      case 'GetUserMigrationStatusQuery':
        return await this.handleGetUserMigrationStatus(query);
      case 'GetUserBulkOperationStatusQuery':
        return await this.handleGetUserBulkOperationStatus(query);
      default:
        throw new Error(`Unknown query type: ${queryType}`);
    }
  }

  async handleGetUser(query) {
    try {
      const user = await this.getUserById(query.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Remove sensitive information
      const { password, ...userData } = user;

      return {
        user: userData,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user:', error);
      throw error;
    }
  }

  async handleGetUsers(query) {
    try {
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc', filters = {} } = query;

      const offset = (page - 1) * limit;
      const orderDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      let users = [];
      let totalCount = 0;

      try {
        const db = this.connectionPool.getMongoDatabase();
        const collection = db.collection('users');

        // Build filter
        const mongoFilter = {};
        if (filters.status) mongoFilter.status = filters.status;
        if (filters.role) mongoFilter.roles = { $in: [filters.role] };
        if (filters.emailVerified !== undefined) mongoFilter.emailVerified = filters.emailVerified;

        totalCount = await collection.countDocuments(mongoFilter);

        users = await collection
          .find(mongoFilter)
          .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
          .skip(offset)
          .limit(limit)
          .toArray();

      } catch (error) {
        // Fallback to MySQL
        const whereConditions = [];
        const params = [];

        if (filters.status) {
          whereConditions.push('status = ?');
          params.push(filters.status);
        }
        if (filters.role) {
          whereConditions.push('JSON_CONTAINS(roles, ?)');
          params.push(`"${filters.role}"`);
        }
        if (filters.emailVerified !== undefined) {
          whereConditions.push('email_verified = ?');
          params.push(filters.emailVerified);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
        const dataQuery = `SELECT * FROM users ${whereClause} ORDER BY ${sortBy} ${orderDirection} LIMIT ? OFFSET ?`;

        const [countResult] = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
          return await connection.execute(countQuery, params);
        });

        const [dataResult] = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
          return await connection.execute(dataQuery, [...params, limit, offset]);
        });

        totalCount = countResult[0].total;
        users = dataResult;
      }

      // Remove sensitive information
      const sanitizedUsers = users.map(user => {
        const { password, ...userData } = user;
        return userData;
      });

      return {
        users: sanitizedUsers,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit)
        },
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting users:', error);
      throw error;
    }
  }

  async handleGetUserByEmail(query) {
    try {
      const user = await this.getUserByEmail(query.email);
      if (!user) {
        throw new Error('User not found');
      }

      // Remove sensitive information
      const { password, ...userData } = user;

      return {
        user: userData,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user by email:', error);
      throw error;
    }
  }

  async handleGetUserProfile(query) {
    try {
      const user = await this.getUserById(query.userId);
      if (!user) {
        throw new Error('User not found');
      }

      const profile = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        dateOfBirth: user.dateOfBirth,
        address: user.address,
        preferences: user.preferences,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        lastActivity: user.lastActivity
      };

      return {
        profile,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user profile:', error);
      throw error;
    }
  }

  async handleGetUserAnalytics(query) {
    try {
      const { userId, dateRange } = query;

      // Get user events from event store
      const events = await this.eventStore.getEventsByAggregateId(userId);

      // Calculate analytics
      const analytics = {
        totalEvents: events.length,
        eventTypes: {},
        activityTimeline: [],
        loginCount: 0,
        lastActivity: null,
        accountAge: 0
      };

      events.forEach(event => {
        // Count event types
        analytics.eventTypes[event.eventType] = (analytics.eventTypes[event.eventType] || 0) + 1;

        // Track login events
        if (event.eventType === 'UserLoginEvent') {
          analytics.loginCount++;
        }

        // Track activity timeline
        analytics.activityTimeline.push({
          eventType: event.eventType,
          timestamp: event.timestamp,
          metadata: event.metadata
        });

        // Track last activity
        if (!analytics.lastActivity || event.timestamp > analytics.lastActivity) {
          analytics.lastActivity = event.timestamp;
        }
      });

      // Calculate account age
      const user = await this.getUserById(userId);
      if (user && user.createdAt) {
        analytics.accountAge = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      }

      // Sort activity timeline
      analytics.activityTimeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return {
        analytics,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user analytics:', error);
      throw error;
    }
  }

  async handleGetUserActivity(query) {
    try {
      const { userId, limit = 50, offset = 0 } = query;

      // Get user events from event store
      const events = await this.eventStore.getEventsByAggregateId(userId);

      // Filter and sort activity events
      const activityEvents = events
        .filter(event => ['UserLoginEvent', 'UserLogoutEvent', 'UserLastActivityUpdatedEvent'].includes(event.eventType))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(offset, offset + limit);

      const activities = activityEvents.map(event => ({
        id: event.id,
        type: event.eventType,
        timestamp: event.timestamp,
        details: event.payload,
        metadata: event.metadata
      }));

      return {
        activities,
        total: events.filter(event => ['UserLoginEvent', 'UserLogoutEvent', 'UserLastActivityUpdatedEvent'].includes(event.eventType)).length,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user activity:', error);
      throw error;
    }
  }

  async handleGetUserSecuritySettings(query) {
    try {
      const user = await this.getUserById(query.userId);
      if (!user) {
        throw new Error('User not found');
      }

      return {
        securitySettings: user.securitySettings || {},
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user security settings:', error);
      throw error;
    }
  }

  async handleGetUserPreferences(query) {
    try {
      const user = await this.getUserById(query.userId);
      if (!user) {
        throw new Error('User not found');
      }

      return {
        preferences: user.preferences || {},
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user preferences:', error);
      throw error;
    }
  }

  async handleGetUsersByRole(query) {
    try {
      const { role, page = 1, limit = 10 } = query;
      const offset = (page - 1) * limit;

      let users = [];
      let totalCount = 0;

      try {
        const db = this.connectionPool.getMongoDatabase();
        const collection = db.collection('users');

        totalCount = await collection.countDocuments({ roles: { $in: [role] } });

        users = await collection
          .find({ roles: { $in: [role] } })
          .skip(offset)
          .limit(limit)
          .toArray();

      } catch (error) {
        // Fallback to MySQL
        const [countResult] = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
          return await connection.execute('SELECT COUNT(*) as total FROM users WHERE JSON_CONTAINS(roles, ?)', [`"${role}"`]);
        });

        const [dataResult] = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
          return await connection.execute('SELECT * FROM users WHERE JSON_CONTAINS(roles, ?) LIMIT ? OFFSET ?', [JSON.stringify(role), limit, offset]);
        });

        totalCount = countResult[0].total;
        users = dataResult;
      }

      // Remove sensitive information
      const sanitizedUsers = users.map(user => {
        const { password, ...userData } = user;
        return userData;
      });

      return {
        users: sanitizedUsers,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit)
        },
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting users by role:', error);
      throw error;
    }
  }

  async handleGetUsersByStatus(query) {
    try {
      const { status, page = 1, limit = 10 } = query;
      const offset = (page - 1) * limit;

      let users = [];
      let totalCount = 0;

      try {
        const db = this.connectionPool.getMongoDatabase();
        const collection = db.collection('users');

        totalCount = await collection.countDocuments({ status });

        users = await collection
          .find({ status })
          .skip(offset)
          .limit(limit)
          .toArray();

      } catch (error) {
        // Fallback to MySQL
        const [countResult] = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
          return await connection.execute('SELECT COUNT(*) as total FROM users WHERE status = ?', [status]);
        });

        const [dataResult] = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
          return await connection.execute('SELECT * FROM users WHERE status = ? LIMIT ? OFFSET ?', [status, limit, offset]);
        });

        totalCount = countResult[0].total;
        users = dataResult;
      }

      // Remove sensitive information
      const sanitizedUsers = users.map(user => {
        const { password, ...userData } = user;
        return userData;
      });

      return {
        users: sanitizedUsers,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit)
        },
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting users by status:', error);
      throw error;
    }
  }

  async handleGetUserLoginHistory(query) {
    try {
      const { userId, limit = 20, offset = 0 } = query;

      // Get login events from event store
      const events = await this.eventStore.getEventsByAggregateId(userId);

      const loginEvents = events
        .filter(event => event.eventType === 'UserLoginEvent')
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(offset, offset + limit);

      const loginHistory = loginEvents.map(event => ({
        id: event.id,
        timestamp: event.timestamp,
        ipAddress: event.payload.ipAddress,
        userAgent: event.payload.userAgent,
        location: event.payload.location,
        deviceInfo: event.payload.deviceInfo,
        sessionId: event.payload.sessionId,
        metadata: event.metadata
      }));

      return {
        loginHistory,
        total: events.filter(event => event.eventType === 'UserLoginEvent').length,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user login history:', error);
      throw error;
    }
  }

  async handleGetUserAuditTrail(query) {
    try {
      const { userId, limit = 50, offset = 0, eventTypes } = query;

      // Get all user events from event store
      const events = await this.eventStore.getEventsByAggregateId(userId);

      let filteredEvents = events;

      // Filter by event types if specified
      if (eventTypes && eventTypes.length > 0) {
        filteredEvents = events.filter(event => eventTypes.includes(event.eventType));
      }

      // Sort and paginate
      const auditTrail = filteredEvents
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(offset, offset + limit)
        .map(event => ({
          id: event.id,
          eventType: event.eventType,
          timestamp: event.timestamp,
          payload: event.payload,
          metadata: event.metadata
        }));

      return {
        auditTrail,
        total: filteredEvents.length,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user audit trail:', error);
      throw error;
    }
  }

  async handleGetUserReport(query) {
    try {
      const { reportType, filters = {}, dateRange } = query;

      let reportData = {};

      switch (reportType) {
        case 'user_summary':
          reportData = await this.generateUserSummaryReport(filters);
          break;
        case 'user_activity':
          reportData = await this.generateUserActivityReport(filters, dateRange);
          break;
        case 'user_security':
          reportData = await this.generateUserSecurityReport(filters);
          break;
        case 'user_engagement':
          reportData = await this.generateUserEngagementReport(filters, dateRange);
          break;
        default:
          throw new Error(`Unknown report type: ${reportType}`);
      }

      return {
        report: reportData,
        reportType,
        generatedAt: new Date(),
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error generating user report:', error);
      throw error;
    }
  }

  async handleGetUserStatistics(query) {
    try {
      let stats = {};

      try {
        const db = this.connectionPool.getMongoDatabase();
        const collection = db.collection('users');

        stats = {
          totalUsers: await collection.countDocuments(),
          activeUsers: await collection.countDocuments({ status: 'active' }),
          suspendedUsers: await collection.countDocuments({ status: 'suspended' }),
          deletedUsers: await collection.countDocuments({ status: 'deleted' }),
          verifiedUsers: await collection.countDocuments({ emailVerified: true }),
          unverifiedUsers: await collection.countDocuments({ emailVerified: false })
        };

      } catch (error) {
        // Fallback to MySQL
        const queries = {
          totalUsers: 'SELECT COUNT(*) as count FROM users',
          activeUsers: 'SELECT COUNT(*) as count FROM users WHERE status = "active"',
          suspendedUsers: 'SELECT COUNT(*) as count FROM users WHERE status = "suspended"',
          deletedUsers: 'SELECT COUNT(*) as count FROM users WHERE status = "deleted"',
          verifiedUsers: 'SELECT COUNT(*) as count FROM users WHERE email_verified = true',
          unverifiedUsers: 'SELECT COUNT(*) as count FROM users WHERE email_verified = false'
        };

        for (const [key, sql] of Object.entries(queries)) {
          const [result] = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
            return await connection.execute(sql);
          });
          stats[key] = result[0].count;
        }
      }

      return {
        statistics: stats,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user statistics:', error);
      throw error;
    }
  }

  async handleGetUserDashboardData(query) {
    try {
      const { userId } = query;

      // Get user profile
      const profile = await this.handleGetUserProfile({ userId });

      // Get recent activity
      const activity = await this.handleGetUserActivity({ userId, limit: 10 });

      // Get analytics
      const analytics = await this.handleGetUserAnalytics({ userId });

      // Get security settings
      const security = await this.handleGetUserSecuritySettings({ userId });

      return {
        dashboard: {
          profile: profile.profile,
          recentActivity: activity.activities,
          analytics: analytics.analytics,
          securitySettings: security.securitySettings
        },
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user dashboard data:', error);
      throw error;
    }
  }

  async handleGetUserActivitySummary(query) {
    try {
      const { userId, period = '30d' } = query;

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();

      switch (period) {
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(endDate.getDate() - 90);
          break;
        default:
          startDate.setDate(endDate.getDate() - 30);
      }

      // Get events in date range
      const events = await this.eventStore.getEventsByAggregateId(userId);
      const periodEvents = events.filter(event =>
        new Date(event.timestamp) >= startDate && new Date(event.timestamp) <= endDate
      );

      const summary = {
        period,
        totalEvents: periodEvents.length,
        eventBreakdown: {},
        dailyActivity: {},
        mostActiveDay: null,
        averageDailyEvents: 0
      };

      // Event breakdown
      periodEvents.forEach(event => {
        summary.eventBreakdown[event.eventType] = (summary.eventBreakdown[event.eventType] || 0) + 1;

        // Daily activity
        const day = new Date(event.timestamp).toISOString().split('T')[0];
        summary.dailyActivity[day] = (summary.dailyActivity[day] || 0) + 1;
      });

      // Calculate most active day
      let maxEvents = 0;
      for (const [day, count] of Object.entries(summary.dailyActivity)) {
        if (count > maxEvents) {
          maxEvents = count;
          summary.mostActiveDay = day;
        }
      }

      // Average daily events
      const daysInPeriod = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      summary.averageDailyEvents = periodEvents.length / daysInPeriod;

      return {
        summary,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user activity summary:', error);
      throw error;
    }
  }

  async handleGetUserEngagementMetrics(query) {
    try {
      const { userId, dateRange } = query;

      const metrics = {
        loginFrequency: 0,
        sessionDuration: 0,
        featureUsage: {},
        engagementScore: 0
      };

      // Get user events
      const events = await this.eventStore.getEventsByAggregateId(userId);

      // Calculate login frequency (logins per week over last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentLogins = events.filter(event =>
        event.eventType === 'UserLoginEvent' &&
        new Date(event.timestamp) >= thirtyDaysAgo
      );

      metrics.loginFrequency = recentLogins.length / 4.3; // Average per week

      // Calculate feature usage
      events.forEach(event => {
        const feature = this.mapEventToFeature(event.eventType);
        if (feature) {
          metrics.featureUsage[feature] = (metrics.featureUsage[feature] || 0) + 1;
        }
      });

      // Calculate engagement score (0-100)
      const loginScore = Math.min(metrics.loginFrequency * 10, 40);
      const featureScore = Math.min(Object.keys(metrics.featureUsage).length * 5, 30);
      const activityScore = Math.min(events.length / 10, 30);

      metrics.engagementScore = Math.round(loginScore + featureScore + activityScore);

      return {
        metrics,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user engagement metrics:', error);
      throw error;
    }
  }

  async handleGetUserRetentionAnalysis(query) {
    try {
      const { cohort, period = 'monthly' } = query;

      // This would typically involve complex cohort analysis
      // For now, return basic retention data
      const analysis = {
        cohort,
        period,
        retentionRates: {
          '1d': 0.95,
          '7d': 0.85,
          '30d': 0.75,
          '90d': 0.65
        },
        churnRate: 0.25,
        averageLifetime: 120 // days
      };

      return {
        analysis,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user retention analysis:', error);
      throw error;
    }
  }

  async handleGetUserChurnAnalysis(query) {
    try {
      const { dateRange } = query;

      const analysis = {
        churnRate: 0.15,
        churnReasons: {
          'inactivity': 0.4,
          'competition': 0.25,
          'technical_issues': 0.2,
          'cost': 0.15
        },
        atRiskUsers: [],
        predictedChurn: 0.12
      };

      return {
        analysis,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user churn analysis:', error);
      throw error;
    }
  }

  async handleGetUserLifecycleReport(query) {
    try {
      const { userId } = query;

      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const events = await this.eventStore.getEventsByAggregateId(userId);

      const lifecycle = {
        userId,
        stages: {
          registration: {
            completed: true,
            date: user.createdAt,
            events: events.filter(e => e.eventType === 'UserCreatedEvent')
          },
          verification: {
            completed: user.emailVerified,
            date: user.emailVerified ? events.find(e => e.eventType === 'UserEmailVerifiedEvent')?.timestamp : null,
            events: events.filter(e => e.eventType === 'UserEmailVerifiedEvent')
          },
          firstLogin: {
            completed: !!user.lastLogin,
            date: user.lastLogin,
            events: events.filter(e => e.eventType === 'UserLoginEvent').slice(0, 1)
          },
          active: {
            completed: user.status === 'active',
            date: user.lastActivity,
            events: events.filter(e => e.eventType === 'UserLastActivityUpdatedEvent')
          }
        },
        currentStage: this.determineCurrentStage(user, events),
        timeToVerification: user.emailVerified ? this.calculateTimeDifference(user.createdAt, events.find(e => e.eventType === 'UserEmailVerifiedEvent')?.timestamp) : null,
        timeToFirstLogin: user.lastLogin ? this.calculateTimeDifference(user.createdAt, user.lastLogin) : null
      };

      return {
        lifecycle,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user lifecycle report:', error);
      throw error;
    }
  }

  async handleGetUserSecurityReport(query) {
    try {
      const { userId } = query;

      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const events = await this.eventStore.getEventsByAggregateId(userId);

      const securityReport = {
        userId,
        securityScore: this.calculateSecurityScore(user),
        securitySettings: user.securitySettings,
        recentSecurityEvents: events
          .filter(e => ['UserLoginEvent', 'UserPasswordChangedEvent', 'UserSecuritySettingsUpdatedEvent'].includes(e.eventType))
          .slice(0, 10)
          .map(e => ({
            type: e.eventType,
            timestamp: e.timestamp,
            details: e.payload
          })),
        passwordLastChanged: user.securitySettings?.passwordLastChanged,
        twoFactorEnabled: user.securitySettings?.twoFactorEnabled,
        loginAttempts: user.securitySettings?.loginAttempts || 0,
        accountLocked: !!(user.securitySettings?.lockedUntil && new Date(user.securitySettings.lockedUntil) > new Date())
      };

      return {
        securityReport,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user security report:', error);
      throw error;
    }
  }

  async handleGetUserComplianceReport(query) {
    try {
      const { userId } = query;

      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const complianceReport = {
        userId,
        gdprCompliant: this.checkGDPRCompliance(user),
        dataRetention: {
          accountAge: Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
          lastActivity: user.lastActivity,
          dataMinimization: this.checkDataMinimization(user)
        },
        consentRecords: [],
        dataProcessing: {
          dataCollected: Object.keys(user),
          dataPurposes: ['authentication', 'user_management', 'analytics'],
          dataSharing: false
        }
      };

      return {
        complianceReport,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user compliance report:', error);
      throw error;
    }
  }

  async handleGetUserPerformanceMetrics(query) {
    try {
      const { userId } = query;

      const metrics = {
        userId,
        responseTimes: [],
        errorRates: [],
        throughput: 0,
        availability: 0.99
      };

      // This would typically collect actual performance data
      // For now, return mock data
      return {
        metrics,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user performance metrics:', error);
      throw error;
    }
  }

  async handleGetUserMigrationStatus(query) {
    try {
      const { userId } = query;

      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const migrationStatus = {
        userId,
        migrated: !!user.migratedAt,
        migrationDate: user.migratedAt,
        migrationSource: user.migrationSource,
        dataIntegrity: this.checkDataIntegrity(user)
      };

      return {
        migrationStatus,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user migration status:', error);
      throw error;
    }
  }

  async handleGetUserBulkOperationStatus(query) {
    try {
      const { operationId } = query;

      // This would typically check the status of bulk operations
      // For now, return mock data
      const status = {
        operationId,
        status: 'completed',
        progress: 100,
        results: {
          successful: 95,
          failed: 5,
          total: 100
        }
      };

      return {
        status,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Error getting user bulk operation status:', error);
      throw error;
    }
  }

  // Helper methods
  async getUserById(userId) {
    try {
      const db = this.connectionPool.getMongoDatabase();
      return await db.collection('users').findOne({ id: userId });
    } catch (error) {
      return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute('SELECT * FROM users WHERE id = ?', [userId]);
        return rows[0] || null;
      });
    }
  }

  async getUserByEmail(email) {
    try {
      const db = this.connectionPool.getMongoDatabase();
      return await db.collection('users').findOne({ email });
    } catch (error) {
      return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute('SELECT * FROM users WHERE email = ?', [email]);
        return rows[0] || null;
      });
    }
  }

  mapEventToFeature(eventType) {
    const featureMap = {
      'UserLoginEvent': 'authentication',
      'UserUpdatedEvent': 'profile_management',
      'UserPasswordChangedEvent': 'security',
      'UserPreferencesUpdatedEvent': 'personalization',
      'UserProfileUpdatedEvent': 'profile_management'
    };
    return featureMap[eventType];
  }

  determineCurrentStage(user, events) {
    if (user.status === 'deleted') return 'churned';
    if (user.status === 'suspended') return 'suspended';
    if (user.emailVerified && user.lastLogin) return 'active';
    if (user.emailVerified) return 'verified';
    return 'registered';
  }

  calculateTimeDifference(startDate, endDate) {
    if (!startDate || !endDate) return null;
    return Math.floor((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
  }

  calculateSecurityScore(user) {
    let score = 0;
    const settings = user.securitySettings || {};

    if (settings.twoFactorEnabled) score += 30;
    if (settings.passwordLastChanged && new Date(settings.passwordLastChanged) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) score += 25;
    if (settings.loginAttempts < 3) score += 20;
    if (!settings.lockedUntil || new Date(settings.lockedUntil) < new Date()) score += 25;

    return Math.min(score, 100);
  }

  checkGDPRCompliance(user) {
    // Basic GDPR compliance check
    return !!(user.consentGiven && user.dataProcessingConsent && user.createdAt);
  }

  checkDataMinimization(user) {
    // Check if only necessary data is stored
    const requiredFields = ['id', 'email', 'password', 'createdAt'];
    const storedFields = Object.keys(user);
    return storedFields.every(field => requiredFields.includes(field) || ['firstName', 'lastName', 'phoneNumber', 'preferences'].includes(field));
  }

  checkDataIntegrity(user) {
    // Basic data integrity check
    return !!(user.id && user.email && user.createdAt);
  }

  async generateUserSummaryReport(filters) {
    const stats = await this.handleGetUserStatistics({});
    return {
      totalUsers: stats.statistics.totalUsers,
      activeUsers: stats.statistics.activeUsers,
      newUsersThisMonth: 0, // Would need to calculate from events
      userGrowthRate: 0, // Would need historical data
      filters
    };
  }

  async generateUserActivityReport(filters, dateRange) {
    return {
      totalActivities: 0,
      activityBreakdown: {},
      peakActivityHours: [],
      dateRange,
      filters
    };
  }

  async generateUserSecurityReport(filters) {
    return {
      securityIncidents: 0,
      failedLoginAttempts: 0,
      passwordResets: 0,
      securityScore: 85,
      filters
    };
  }

  async generateUserEngagementReport(filters, dateRange) {
    return {
      averageSessionDuration: 0,
      featureUsage: {},
      userRetention: 0,
      engagementScore: 0,
      dateRange,
      filters
    };
  }
}